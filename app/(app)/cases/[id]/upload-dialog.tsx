"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { DocumentCategory, EvidenceType } from "@prisma/client";

import {
  Dialog,
  ErrorBanner,
  BUTTON_CLASSES,
  CANCEL_CLASSES,
  TEXTAREA_CLASSES,
} from "./case-detail-client";
import { requestUpload, finalizeUpload } from "@/app/actions/documents";
import { withClientTimeout } from "./with-client-timeout";
import {
  documentCategoryEnum,
  evidenceTypeEnum,
  precheckUploadFile,
  SIZE_LIMIT_MB_BY_TYPE,
  mimeToSizeLimitType,
} from "@/app/lib/validation/document";
import { ALLOWED_MIME_BY_TYPE, TYPE_LABELS } from "@/app/lib/file-magic";

export type UploadKind = "DOCUMENT" | "EVIDENCE";

export type ExistingDocumentForUpload = {
  id: string;
  category: DocumentCategory | null;
  evidenceType: EvidenceType | null;
  title: string;
};

// Short, human-readable list for the dropzone's idle copy — same map the
// error copy uses, kept local since it's presentation, not validation.
const MIME_SHORT_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "video/mp4": "MP4",
  "video/webm": "WEBM",
  "audio/mpeg": "MP3",
  "audio/wav": "WAV",
  "audio/x-wav": "WAV",
  "audio/mp4": "M4A",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
};

function shortLabelsFor(mimes: string[]): string {
  return Array.from(new Set(mimes.map((mime) => MIME_SHORT_LABELS[mime] ?? mime))).join(", ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// D-01: signed-upload PUT target. Supabase mode's requestUpload returns a
// real https signed URL — PUT there directly, with the short-lived token as
// a bearer header. LocalDiskStorageAdapter.createUploadTarget (03-01/03-02)
// returns a server-FILESYSTEM path (never a browser-fetchable URL), so
// local mode instead PUTs through the existing
// app/api/uploads/stage/route.ts Route Handler with the same
// server-generated `key` as a query param — same eventual putObject call,
// just reached through the local-mode staging route rather than the
// (non-existent, in local mode) direct URL. [Rule 1 deviation — see SUMMARY.]
function putWithProgress(
  target: { url: string; token?: string; key: string; uploadToken: string },
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isRemote = /^https?:\/\//.test(target.url);
    const putUrl = isRemote
      ? target.url
      : `/api/uploads/stage?key=${encodeURIComponent(target.key)}`;

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", putUrl);
    if (isRemote && target.token) {
      xhr.setRequestHeader("Authorization", `Bearer ${target.token}`);
    }
    // T-03-07-01: sent on every PUT (remote and local) — Supabase's signed
    // URL ignores unrecognized headers, and the local-mode stage route
    // verifies this before writing any bytes.
    xhr.setRequestHeader("X-Upload-Token", target.uploadToken);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}.`));
      }
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(file);
  });
}

// D-14: the ONE upload dialog, reused for "Upload document"/"Upload
// evidence" (documents-tab.tsx/evidence-tab.tsx, this plan) and "Upload new
// version" (03-05, via `existingDocument`) — never three separate dialogs.
export function UploadDialog({
  caseId,
  kind,
  existingDocument = null,
  onClose,
  onSuccess,
}: {
  caseId: string;
  kind: UploadKind;
  existingDocument?: ExistingDocumentForUpload | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const options =
    kind === "DOCUMENT" ? documentCategoryEnum.options : evidenceTypeEnum.options;
  const lockedTypeKey = existingDocument
    ? existingDocument.category ?? existingDocument.evidenceType ?? options[0]
    : null;

  const [typeKey, setTypeKey] = useState<string>(lockedTypeKey ?? options[0]);
  const [title, setTitle] = useState(existingDocument?.title ?? "");
  const [description, setDescription] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const allowedMimes = ALLOWED_MIME_BY_TYPE[typeKey] ?? [];
  const limitType = mimeToSizeLimitType(allowedMimes[0] ?? "");
  const limitMb = limitType ? SIZE_LIMIT_MB_BY_TYPE[limitType] : null;
  const typeLabel = TYPE_LABELS[typeKey] ?? typeKey;

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const dropped = acceptedFiles[0];
      if (!dropped) return;
      // Behavior (Task 1): reject before any network call — no requestUpload
      // is called until this check passes.
      const check = precheckUploadFile({ type: dropped.type, size: dropped.size }, typeKey);
      if (!check.ok) {
        setFileError(check.message);
        setFile(null);
        return;
      }
      setFileError(null);
      setFile(dropped);
    },
    [typeKey],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading,
  });

  const canSubmit =
    !!file &&
    title.trim().length > 0 &&
    (!existingDocument || changeNote.trim().length > 0);

  const handleUpload = async () => {
    if (!file || !canSubmit) return;
    setError(null);
    setUploading(true);
    setProgressPct(0);

    try {
      const category =
        kind === "DOCUMENT" ? (typeKey as DocumentCategory) : undefined;
      const evidenceType =
        kind === "EVIDENCE" ? (typeKey as EvidenceType) : undefined;

      const requested = await requestUpload({
        caseId,
        documentId: existingDocument?.id,
        kind,
        category,
        evidenceType,
        declaredSize: file.size,
        declaredMime: file.type,
        title,
        description: description.trim() ? description : undefined,
      });
      if ("error" in requested) {
        setError(requested.error);
        return;
      }

      await putWithProgress(requested, file, setProgressPct);

      // G-04-1 (04-04 Task 2): bounds the wait so a hung finalizeUpload (see
      // Task 1's server-side fix for the root cause) can never leave this
      // dialog stuck at "Uploading…" forever. 50000ms sized with a 5000ms
      // margin above the worst-case server chain: readRange's first fetch
      // (up to 15000ms) + its one-shot 416 retry fetch (up to another
      // 15000ms) + readLeadingBytes's own body-drain timeout (up to a
      // further 15000ms) = ~45000ms worst case.
      const finalized = await withClientTimeout(
        finalizeUpload({
          caseId,
          documentId: existingDocument?.id ?? null,
          storageKey: requested.key,
          uploadToken: requested.uploadToken,
          originalFilename: file.name,
          title,
          description: description.trim() ? description : undefined,
          changeNote: existingDocument ? changeNote : undefined,
          kind: existingDocument ? undefined : kind,
          category: existingDocument ? undefined : category,
          evidenceType: existingDocument ? undefined : evidenceType,
        }),
        50000,
        "Upload timed out while finalizing — please try again.",
      );
      if (finalized.error) {
        setError(finalized.error);
        return;
      }

      onSuccess();
    } catch (err) {
      // Server rejections stay inline, dialog open, selection intact —
      // per the Copywriting Contract's error-state rule.
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't upload the file — check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const dialogTitle = existingDocument
    ? "Upload new version"
    : kind === "DOCUMENT"
      ? "Upload document"
      : "Upload evidence";

  return (
    <Dialog onClose={onClose} widthClassName="max-w-lg">
      <p className="break-words text-sm font-semibold text-slate-900">{dialogTitle}</p>
      {existingDocument && (
        <p className="mt-1 text-sm text-slate-500">New version — {typeLabel}</p>
      )}

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="upload-type" className="text-sm font-semibold text-slate-700">
          {kind === "DOCUMENT" ? "Category" : "Type"}
        </label>
        <select
          id="upload-type"
          value={typeKey}
          onChange={(e) => setTypeKey(e.target.value)}
          disabled={!!existingDocument}
          className={TEXTAREA_CLASSES}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {TYPE_LABELS[opt] ?? opt}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="upload-title" className="text-sm font-semibold text-slate-700">
          Title
        </label>
        <input
          id="upload-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={TEXTAREA_CLASSES}
        />
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="upload-description" className="text-sm font-semibold text-slate-700">
          Description (optional)
        </label>
        <textarea
          id="upload-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={TEXTAREA_CLASSES}
        />
      </div>

      {existingDocument && (
        <div className="mt-4 flex flex-col gap-1">
          <label
            htmlFor="upload-change-note"
            className="text-sm font-semibold text-slate-700"
          >
            Change note
          </label>
          <textarea
            id="upload-change-note"
            rows={2}
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            className={TEXTAREA_CLASSES}
          />
        </div>
      )}

      <div
        {...getRootProps()}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center ${
          isDragActive ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50"
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <>
            <p className="break-words text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setFileError(null);
              }}
              disabled={uploading}
              className="text-sm text-blue-700 underline disabled:opacity-60"
            >
              Remove
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Drag and drop or click to browse — {shortLabelsFor(allowedMimes)} up to{" "}
            {limitMb ? `${limitMb}MB` : "the limit"}
          </p>
        )}
      </div>
      {fileError && <p className="mt-2 text-sm text-red-700">{fileError}</p>}

      {uploading && (
        <div className="mt-4">
          <p className="text-xs text-slate-600">Uploading… {progressPct}%</p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-700 transition-[width]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={uploading}
          className={CANCEL_CLASSES}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || !canSubmit}
          className={BUTTON_CLASSES}
        >
          {uploading ? "Uploading…" : existingDocument ? "Upload version" : "Upload"}
        </button>
      </div>
    </Dialog>
  );
}
