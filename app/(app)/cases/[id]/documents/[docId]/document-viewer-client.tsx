"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  ErrorBanner,
  BUTTON_CLASSES,
  CANCEL_CLASSES,
  TEXTAREA_CLASSES,
} from "../../case-detail-client";
import {
  UploadDialog,
  type UploadKind,
  type ExistingDocumentForUpload,
} from "../../upload-dialog";
import { softDeleteDocument } from "@/app/actions/documents";
import { Spinner } from "@/app/components/spinner";

export type MediaKind = "pdf" | "image" | "video" | "audio";

const DESTRUCTIVE_CLASSES =
  "rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60";

// D-10: dialog title/copy per the Copywriting Contract, reusing
// case-detail-client.tsx's Dialog/CANCEL_CLASSES/TEXTAREA_CLASSES —
// required "Reason for deletion" textarea, Confirm disabled until non-empty.
function DeleteDocumentDialog({
  documentId,
  filename,
  onClose,
  onSuccess,
}: {
  documentId: string;
  filename: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = reason.trim().length > 0;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await softDeleteDocument(documentId, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onClose={onClose}>
      <p className="break-words text-sm font-semibold text-slate-900">
        Delete {filename}?
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <label
          htmlFor="delete-reason"
          className="text-sm font-semibold text-slate-700"
        >
          Reason for deletion
        </label>
        <textarea
          id="delete-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={TEXTAREA_CLASSES}
        />
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className={CANCEL_CLASSES}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || !canSubmit}
          className={DESTRUCTIVE_CLASSES}
        >
          {pending ? "Deleting…" : "Delete document"}
        </button>
      </div>
    </Dialog>
  );
}

// D-08/D-11: rendered by the page ONLY when `canEdit && !isClosed` — this
// component never re-derives that check, matching this phase's
// hidden-not-disabled precedent (03-04's Upload-button). "Upload new
// version" reuses upload-dialog.tsx (D-14) via `existingDocument`, which
// locks category/type and requires a change note.
export function DocumentActions({
  caseId,
  documentId,
  kind,
  filename,
  existingDocument,
}: {
  caseId: string;
  documentId: string;
  kind: UploadKind;
  filename: string;
  existingDocument: ExistingDocumentForUpload;
}) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState<"version" | "delete" | null>(
    null,
  );

  const handleSuccess = () => {
    setOpenDialog(null);
    router.refresh();
  };

  return (
    <div className="mt-4 flex justify-end gap-3">
      <button
        type="button"
        onClick={() => setOpenDialog("version")}
        className={CANCEL_CLASSES}
      >
        Upload new version
      </button>
      <button
        type="button"
        onClick={() => setOpenDialog("delete")}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50"
      >
        Delete
      </button>

      {openDialog === "version" && (
        <UploadDialog
          caseId={caseId}
          kind={kind}
          existingDocument={existingDocument}
          onClose={() => setOpenDialog(null)}
          onSuccess={handleSuccess}
        />
      )}
      {openDialog === "delete" && (
        <DeleteDocumentDialog
          documentId={documentId}
          filename={filename}
          onClose={() => setOpenDialog(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

// Inline media preview with an onError fallback — required for
// <img>/<video>/<audio> (Server Components can't attach event handlers,
// hence this client component), per the Copywriting Contract's viewer
// error state. <embed> (PDF) needs no error handler but is co-located here
// for a single previewable-media entry point.
export function MediaPreview({
  kind,
  previewUrl,
  downloadUrl,
}: {
  kind: MediaKind;
  previewUrl: string;
  downloadUrl: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-slate-700">
          Couldn&rsquo;t load this file — try Download.
        </p>
        <a href={downloadUrl} download className={BUTTON_CLASSES}>
          Download
        </a>
      </div>
    );
  }

  const loadingPlaceholder = loading ? (
    <div className="flex h-40 w-full items-center justify-center rounded-md bg-slate-200 animate-pulse motion-reduce:animate-none">
      <Spinner />
    </div>
  ) : null;

  if (kind === "pdf") {
    return (
      <embed
        src={previewUrl}
        type="application/pdf"
        className="max-h-[70vh] w-full"
      />
    );
  }
  if (kind === "image") {
    return (
      <>
        {loadingPlaceholder}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt=""
          className={`max-h-[70vh] w-full object-contain ${loading ? "hidden" : ""}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      </>
    );
  }
  if (kind === "video") {
    return (
      <>
        {loadingPlaceholder}
        <video
          controls
          src={previewUrl}
          className={`max-h-[70vh] w-full ${loading ? "hidden" : ""}`}
          onLoadedData={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      </>
    );
  }
  return (
    <>
      {loadingPlaceholder}
      <audio
        controls
        src={previewUrl}
        className={`w-full ${loading ? "hidden" : ""}`}
        onLoadedData={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
      />
    </>
  );
}
