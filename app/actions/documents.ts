"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { authorize } from "@/app/lib/authorize";
import { prisma } from "@/app/lib/prisma";
import { writeAuditLog } from "@/app/lib/audit";
import { getStorageAdapter, StorageAdapterError } from "@/app/lib/storage/adapter";
import { buildStorageKey, isStorageKeyForTarget } from "@/app/lib/storage/key";
import { signUploadToken, verifyUploadToken } from "@/app/lib/storage/upload-token";
import {
  requestUploadSchema,
  finalizeUploadSchema,
  updateDocumentMetadataSchema,
  softDeleteDocumentSchema,
  mimeToSizeLimitType,
  sizeLimitBytes,
} from "@/app/lib/validation/document";
import {
  assertDocumentOwner,
  assertCaseNotClosedForDocs,
  assertNotAlreadyDeleted,
  assertAllowedTypeForCategory,
} from "@/app/lib/document-guards";
import { ALLOWED_MIME_BY_TYPE, TYPE_LABELS, detectAndValidate } from "@/app/lib/file-magic";
import type { MutationResult } from "@/app/actions/users";

// Bytes read from the front of a staged object for magic-byte sniffing —
// enough for every format file-type detects (well above its longest known
// signature), never the whole object (T-03-08: DoS via full-buffer reads).
const MAGIC_BYTE_SNIFF_LENGTH = 4100;

export type RequestUploadResult =
  | { url: string; token?: string; key: string; uploadToken: string }
  | { error: string };

// D-01: server-side half of the signed direct-upload flow. Generates a
// server-controlled storage key (never client-supplied, closing the
// path-traversal/IDOR angle at the key-generation step) and hands back a
// short-lived signed upload target. No Document/DocumentVersion row is
// created here — finalizeUpload re-validates the real bytes afterward.
export async function requestUpload(
  input: unknown,
): Promise<RequestUploadResult> {
  const actor = await authorize();

  const parsed = requestUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid upload request.",
    };
  }

  const kase = await prisma.case.findUnique({
    where: { id: parsed.data.caseId },
  });
  if (!kase) {
    return { error: "Case not found." };
  }

  try {
    assertCaseNotClosedForDocs(kase.stage);
  } catch (err) {
    if (err instanceof Error) return { error: err.message };
    throw err;
  }

  let key: string;
  if (parsed.data.documentId) {
    // CR-03/WR-01: fetch-and-check the target document BEFORE ever issuing
    // an upload target for it — a documentId must exist, belong to this
    // case, and be owned by the caller's department (or Admin). Previously
    // this check only happened in finalizeUpload, so any authenticated user
    // could obtain a signed/staged upload target for any document.
    const existingDocument = await prisma.document.findUnique({
      where: { id: parsed.data.documentId },
    });
    if (!existingDocument || existingDocument.caseId !== parsed.data.caseId) {
      return { error: "Document not found for this case." };
    }
    try {
      assertDocumentOwner(actor.role, existingDocument.uploadedByRole);
      assertNotAlreadyDeleted(existingDocument.deletedAt);
    } catch (err) {
      if (err instanceof Error) return { error: err.message };
      throw err;
    }

    const maxVersion = await prisma.documentVersion.aggregate({
      where: { documentId: parsed.data.documentId },
      _max: { versionNumber: true },
    });
    const nextVersion = (maxVersion._max.versionNumber ?? 0) + 1;
    key = buildStorageKey(parsed.data.caseId, parsed.data.documentId, nextVersion);
  } else {
    key = buildStorageKey(parsed.data.caseId, null, 1);
  }

  try {
    const target = await getStorageAdapter().createUploadTarget(key);
    // T-03-07-01/T-03-07-04: bind this exact key+caseId+documentId+userId
    // into a short-lived, purpose-bound credential — verified by both the
    // local-mode stage PUT route and finalizeUpload before any byte is
    // written or read.
    const uploadToken = await signUploadToken({
      key,
      caseId: parsed.data.caseId,
      documentId: parsed.data.documentId ?? null,
      userId: actor.id,
    });
    return { url: target.url, token: target.token, key, uploadToken };
  } catch (err) {
    if (err instanceof StorageAdapterError) {
      // G-03-1 diagnosability: log the real Supabase error message/status so
      // it is visible in Vercel's function logs — never the service-role
      // key or any other secret value. The client-facing message stays the
      // fixed generic string below.
      console.error("requestUpload storage error", {
        message: err.message,
        status:
          (err as { status?: number; statusCode?: number }).status ??
          (err as { statusCode?: number }).statusCode,
      });
      return { error: "Couldn't prepare the upload. Please try again." };
    }
    if (err instanceof Error) return { error: err.message };
    throw err;
  }
}

export type FinalizeUploadResult = MutationResult & {
  documentId?: string;
  versionId?: string;
};

// D-01/D-06/D-07/D-09: the ONLY path that creates a Document/DocumentVersion
// row. Never trusts requestUploadSchema's earlier declared mime/size —
// re-reads real bytes + size from storage and re-validates against the
// EXISTING document's own category/evidenceType for a new version (never a
// client-supplied one), inside one prisma.$transaction with the audit write.
export async function finalizeUpload(
  input: unknown,
): Promise<FinalizeUploadResult> {
  const actor = await authorize();

  const parsed = finalizeUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid upload request.",
    };
  }

  // CR-02: reject any storageKey that isn't the exact shape the server
  // itself generates for THIS caseId/documentId, before it is ever used to
  // read from storage. Without this, a caller could invoke finalizeUpload
  // directly (skipping requestUpload/the PUT step entirely) with a
  // storageKey pointing at an arbitrary already-staged or path-traversed
  // object.
  if (
    !isStorageKeyForTarget(
      parsed.data.storageKey,
      parsed.data.caseId,
      parsed.data.documentId,
    )
  ) {
    return { error: "Invalid or expired upload session. Please retry your upload." };
  }

  // T-03-07-04: verify the caller-specific, purpose-bound upload-session
  // credential — closes the residual gap where the isStorageKeyForTarget
  // format/prefix check above let a caller finalize a key staged by a
  // different user for the same case/document. Must run before any bytes
  // are read from storage.
  const verifiedToken = await verifyUploadToken(parsed.data.uploadToken);
  if (
    !verifiedToken ||
    verifiedToken.key !== parsed.data.storageKey ||
    verifiedToken.userId !== actor.id ||
    verifiedToken.caseId !== parsed.data.caseId ||
    verifiedToken.documentId !== (parsed.data.documentId ?? null)
  ) {
    return { error: "Invalid or expired upload session. Please retry your upload." };
  }

  const adapter = getStorageAdapter();
  let resultDocumentId: string | undefined;
  let resultVersionId: string | undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const kase = await tx.case.findUniqueOrThrow({
        where: { id: parsed.data.caseId },
      });
      assertCaseNotClosedForDocs(kase.stage);

      let existingDocument: Awaited<
        ReturnType<typeof tx.document.findUniqueOrThrow>
      > | null = null;
      let typeKey: string;

      if (parsed.data.documentId) {
        existingDocument = await tx.document.findUniqueOrThrow({
          where: { id: parsed.data.documentId },
        });
        if (existingDocument.caseId !== parsed.data.caseId) {
          throw new Error("Document does not belong to this case.");
        }
        assertDocumentOwner(actor.role, existingDocument.uploadedByRole);
        assertNotAlreadyDeleted(existingDocument.deletedAt);
        // D-09: the EXISTING document's own category/evidenceType is
        // authoritative for a new version — never the client-supplied one.
        typeKey = (existingDocument.category ??
          existingDocument.evidenceType) as string;
      } else {
        if (!parsed.data.category && !parsed.data.evidenceType) {
          throw new Error(
            "A category or evidence type is required for a new upload.",
          );
        }
        typeKey = (parsed.data.category ?? parsed.data.evidenceType) as string;
      }

      const expectedLabel = TYPE_LABELS[typeKey] ?? typeKey;

      // T-03-04/D-04: never trust a client-declared mime/extension — sniff
      // the actual bytes already sitting in storage.
      const leadingBytes = await adapter.readLeadingBytes(
        parsed.data.storageKey,
        MAGIC_BYTE_SNIFF_LENGTH,
      );
      const detection = await detectAndValidate(leadingBytes, typeKey);

      if (!detection.ok) {
        // Race-safe: a concurrent rejected finalize call may have already
        // deleted this staged object — swallow that, the reject path still
        // completes correctly for this call.
        await adapter.deleteObject(parsed.data.storageKey).catch(() => {});
        assertAllowedTypeForCategory(
          ALLOWED_MIME_BY_TYPE[typeKey] ?? [],
          expectedLabel,
          detection.detectedMime,
        );
        return; // unreachable — assertAllowedTypeForCategory always throws here
      }

      const sizeBytes = await adapter.getObjectSize(parsed.data.storageKey);
      const sizeLimitType = mimeToSizeLimitType(detection.detectedMime as string);
      if (!sizeLimitType || sizeBytes > sizeLimitBytes(sizeLimitType)) {
        await adapter.deleteObject(parsed.data.storageKey).catch(() => {});
        throw new Error(
          "File exceeds the maximum allowed size for this file type.",
        );
      }

      if (existingDocument) {
        const maxVersion = await tx.documentVersion.aggregate({
          where: { documentId: existingDocument.id },
          _max: { versionNumber: true },
        });
        const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

        const version = await tx.documentVersion.create({
          data: {
            documentId: existingDocument.id,
            versionNumber,
            storageKey: parsed.data.storageKey,
            originalFilename: parsed.data.originalFilename,
            mimeType: detection.detectedMime as string,
            sizeBytes,
            changeNote: parsed.data.changeNote,
            createdById: actor.id,
            createdByRole: actor.role,
          },
        });

        resultDocumentId = existingDocument.id;
        resultVersionId = version.id;

        await writeAuditLog(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "DOCUMENT_VERSION_ADDED",
          targetType: "Document",
          targetId: existingDocument.id,
          targetLabel: existingDocument.title,
          details: {
            caseId: parsed.data.caseId,
            versionNumber,
            changeNote: parsed.data.changeNote ?? null,
          },
        });
      } else {
        const document = await tx.document.create({
          data: {
            caseId: parsed.data.caseId,
            kind: parsed.data.kind!,
            category: parsed.data.category ?? null,
            evidenceType: parsed.data.evidenceType ?? null,
            title: parsed.data.title,
            description: parsed.data.description,
            uploadedById: actor.id,
            uploadedByRole: actor.role,
          },
        });

        const version = await tx.documentVersion.create({
          data: {
            documentId: document.id,
            versionNumber: 1,
            storageKey: parsed.data.storageKey,
            originalFilename: parsed.data.originalFilename,
            mimeType: detection.detectedMime as string,
            sizeBytes,
            changeNote: null,
            createdById: actor.id,
            createdByRole: actor.role,
          },
        });

        resultDocumentId = document.id;
        resultVersionId = version.id;

        await writeAuditLog(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "DOCUMENT_UPLOADED",
          targetType: "Document",
          targetId: document.id,
          targetLabel: document.title,
          details: { caseId: parsed.data.caseId, versionNumber: 1 },
        });
      }
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        error: "Another version was just added — please retry your upload.",
      };
    }
    // WR-03: storage-adapter errors embed filesystem paths / bucket
    // internals — log the real message server-side only, never surface it
    // to the client.
    if (err instanceof StorageAdapterError) {
      console.error("finalizeUpload storage error", err);
      return { error: "Couldn't complete the upload. Please try again." };
    }
    if (err instanceof Error) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/cases/${parsed.data.caseId}`);
  return {
    success: true,
    documentId: resultDocumentId,
    versionId: resultVersionId,
  };
}

const UPDATE_METADATA_FIELDS = ["title", "description"] as const;

// Exact updateCaseDetails changed-fields-diff shape, guarded by
// assertDocumentOwner + assertCaseNotClosedForDocs + assertNotAlreadyDeleted.
export async function updateDocumentMetadata(
  input: unknown,
): Promise<MutationResult> {
  const actor = await authorize();

  const parsed = updateDocumentMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  let caseId: string | undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.document.findUniqueOrThrow({
        where: { id: parsed.data.documentId },
      });
      caseId = target.caseId;
      const kase = await tx.case.findUniqueOrThrow({
        where: { id: target.caseId },
      });

      assertDocumentOwner(actor.role, target.uploadedByRole);
      assertCaseNotClosedForDocs(kase.stage);
      assertNotAlreadyDeleted(target.deletedAt);

      const changed: Record<string, { old: string; new: string }> = {};
      for (const field of UPDATE_METADATA_FIELDS) {
        const oldValue = target[field] ?? "";
        const newValue = parsed.data[field] ?? "";
        if (oldValue !== newValue) {
          changed[field] = { old: oldValue, new: newValue };
        }
      }

      // WR-05: nothing to persist or log when the submitted values exactly
      // match the existing ones (e.g. user opens Edit and clicks Save with
      // no changes) — a DOCUMENT_UPDATED log row claiming a change occurred
      // when it didn't would be an inaccuracy in the change log itself.
      if (Object.keys(changed).length === 0) {
        return;
      }

      const updated = await tx.document.update({
        where: { id: target.id },
        data: {
          title: parsed.data.title,
          description: parsed.data.description,
        },
      });

      await writeAuditLog(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "DOCUMENT_UPDATED",
        targetType: "Document",
        targetId: updated.id,
        targetLabel: updated.title,
        details: { caseId: target.caseId, changed },
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

// Exact reopenCase required-reason shape.
export async function softDeleteDocument(
  documentId: string,
  reason: string,
): Promise<MutationResult> {
  const actor = await authorize();

  const parsed = softDeleteDocumentSchema.safeParse({ documentId, reason });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  let caseId: string | undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.document.findUniqueOrThrow({
        where: { id: parsed.data.documentId },
      });
      caseId = target.caseId;
      const kase = await tx.case.findUniqueOrThrow({
        where: { id: target.caseId },
      });

      assertDocumentOwner(actor.role, target.uploadedByRole);
      assertCaseNotClosedForDocs(kase.stage);
      assertNotAlreadyDeleted(target.deletedAt);

      const updated = await tx.document.update({
        where: { id: target.id },
        data: { deletedAt: new Date(), deletedReason: parsed.data.reason },
      });

      await writeAuditLog(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "DOCUMENT_DELETED",
        targetType: "Document",
        targetId: updated.id,
        targetLabel: updated.title,
        details: { caseId: target.caseId, reason: parsed.data.reason },
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}
