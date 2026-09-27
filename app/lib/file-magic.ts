import { fileTypeFromBuffer } from "file-type";

// Pure-ish module (one external call to file-type's buffer sniffer, no
// Prisma/Next imports) — runs under plain node:test with no Next.js request
// context, matching document-guards.ts's convention.

// D-03/D-05: every DocumentCategory (all 8 document categories are
// PDF-only) and every EvidenceType maps to its allowed real-content mime
// types, detected from actual bytes — never a client-declared mime or file
// extension.
export const ALLOWED_MIME_BY_TYPE: Record<string, string[]> = {
  // DocumentCategory values — all PDF-only.
  FIR: ["application/pdf"],
  WITNESS_STATEMENT: ["application/pdf"],
  INVESTIGATION_RECORD: ["application/pdf"],
  CHARGE_SHEET: ["application/pdf"],
  COURT_FILING: ["application/pdf"],
  FORENSIC_REPORT: ["application/pdf"],
  LEGAL_NOTICE: ["application/pdf"],
  JUDGMENT: ["application/pdf"],
  // EvidenceType values.
  PHOTO: ["image/jpeg", "image/png", "image/webp"],
  VIDEO_CCTV: ["video/mp4", "video/webm"],
  AUDIO: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4"],
  FORENSIC_DATA: ["application/zip", "application/x-zip-compressed", "application/pdf"],
};

// Human-readable labels for the D-04/D-09 rejection message, keyed the same
// as ALLOWED_MIME_BY_TYPE — falls back to the raw key if a new enum value is
// ever added here without a label.
export const TYPE_LABELS: Record<string, string> = {
  FIR: "FIR",
  WITNESS_STATEMENT: "Witness Statement",
  INVESTIGATION_RECORD: "Investigation Record",
  CHARGE_SHEET: "Charge Sheet",
  COURT_FILING: "Court Filing",
  FORENSIC_REPORT: "Forensic Report",
  LEGAL_NOTICE: "Legal Notice",
  JUDGMENT: "Judgment",
  PHOTO: "Photo",
  VIDEO_CCTV: "CCTV Video",
  AUDIO: "Audio",
  FORENSIC_DATA: "Forensic Data",
};

export type DetectAndValidateResult = {
  ok: boolean;
  detectedMime: string | null;
};

/**
 * Sniffs `buffer`'s real content type via magic-byte detection (never a
 * client-declared mime/extension) and checks it against `typeKey`'s
 * allow-list in ALLOWED_MIME_BY_TYPE.
 */
export async function detectAndValidate(
  buffer: Buffer,
  typeKey: string,
): Promise<DetectAndValidateResult> {
  const detected = await fileTypeFromBuffer(buffer);
  const allowed = ALLOWED_MIME_BY_TYPE[typeKey] ?? [];
  const mime = detected?.mime ?? null;

  if (mime && allowed.includes(mime)) {
    return { ok: true, detectedMime: mime };
  }
  return { ok: false, detectedMime: mime };
}
