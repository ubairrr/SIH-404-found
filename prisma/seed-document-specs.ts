// Shared seed document/evidence specs — factored out of seed.ts so both the
// seed script and scripts/backfill-seed-storage.ts import the SAME data
// (never duplicated) for the (document title, version number) -> filename
// lookup the backfill script needs. This module has no Prisma/storage
// side effects — importing it never runs a seed.
import type { DocumentCategory, EvidenceType, Role } from "@prisma/client";

export type SeedVersionSpec = {
  filename: string;
  mimeType: string;
  versionNumber: number;
  changeNote: string | null;
};

export type SeedDocumentSpec = {
  title: string;
  description?: string;
  kind: "DOCUMENT" | "EVIDENCE";
  category?: DocumentCategory;
  evidenceType?: EvidenceType;
  actorRole: Role;
  versions: SeedVersionSpec[];
};

// D-23: the hero case's FIR, attached inside the same transaction that
// creates the hero case every reseed.
export const HERO_CASE_DOCUMENTS: SeedDocumentSpec[] = [
  {
    title: "FIR — Theft and Criminal Intimidation at Kotwali Market",
    kind: "DOCUMENT",
    category: "FIR",
    actorRole: "POLICE",
    versions: [
      {
        filename: "fir-kotwali.pdf",
        mimeType: "application/pdf",
        versionNumber: 1,
        changeNote: null,
      },
    ],
  },
];

// D-22: sample document/evidence sets for the supporting cases that reach
// CHARGE_SHEET_FILED or later. Cases not listed here (e.g. the
// UNDER_INVESTIGATION and one of the two CLOSED_JUDGMENT cases) simply have
// zero Document rows — their Documents/Evidence tabs render the normal
// empty state.
export const SUPPORTING_CASE_DOCUMENTS: Record<string, SeedDocumentSpec[]> = {
  "KOT/2026/0089": [
    {
      title: "Witness Statement — Suresh Patil",
      kind: "DOCUMENT",
      category: "WITNESS_STATEMENT",
      actorRole: "POLICE",
      versions: [
        {
          filename: "witness-statement.pdf",
          mimeType: "application/pdf",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
    {
      title: "Charge Sheet — Dinesh Chavan",
      kind: "DOCUMENT",
      category: "CHARGE_SHEET",
      actorRole: "PROSECUTION",
      versions: [
        {
          filename: "charge-sheet.pdf",
          mimeType: "application/pdf",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
    {
      title: "Photograph — Disputed Land Sale Documents",
      kind: "EVIDENCE",
      evidenceType: "PHOTO",
      actorRole: "FORENSICS",
      versions: [
        {
          filename: "cctv-frame.jpg",
          mimeType: "image/jpeg",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
  ],
  "RJN/2026/0033": [
    {
      title: "Court Filing — Sessions Court Case Registration",
      kind: "DOCUMENT",
      category: "COURT_FILING",
      actorRole: "COURT",
      versions: [
        {
          filename: "court-filing.pdf",
          mimeType: "application/pdf",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
    {
      title: "Scene Recording — Farmland Boundary Dispute",
      kind: "EVIDENCE",
      evidenceType: "VIDEO_CCTV",
      actorRole: "FORENSICS",
      versions: [
        {
          filename: "scene-clip.mp4",
          mimeType: "video/mp4",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
    {
      title: "Witness Call Recording — Ashok Verma",
      kind: "EVIDENCE",
      evidenceType: "AUDIO",
      actorRole: "POLICE",
      versions: [
        {
          filename: "witness-call.mp3",
          mimeType: "audio/mpeg",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
  ],
  "MUM/2026/0217": [
    {
      title: "Judgment — Cyber Fraud Conviction",
      kind: "DOCUMENT",
      category: "JUDGMENT",
      actorRole: "COURT",
      versions: [
        {
          filename: "judgment.pdf",
          mimeType: "application/pdf",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
    {
      title: "Forensic Data Extract — QuickGain Invest Servers",
      kind: "EVIDENCE",
      evidenceType: "FORENSIC_DATA",
      actorRole: "FORENSICS",
      versions: [
        {
          filename: "forensic-data.zip",
          mimeType: "application/zip",
          versionNumber: 1,
          changeNote: null,
        },
      ],
    },
    {
      // D-22 demo moment: a Forensic Report with v1 + v2, to demonstrate
      // version history.
      title: "Forensic Report — Digital and Financial Trail Analysis",
      kind: "DOCUMENT",
      category: "FORENSIC_REPORT",
      actorRole: "FORENSICS",
      versions: [
        {
          filename: "fsl-report-v1.pdf",
          mimeType: "application/pdf",
          versionNumber: 1,
          changeNote: null,
        },
        {
          filename: "fsl-report-v2.pdf",
          mimeType: "application/pdf",
          versionNumber: 2,
          changeNote: "Updated with the lab's finalized DNA comparison results.",
        },
      ],
    },
  ],
};

// Every seed document spec, across the hero case and all supporting cases —
// used by scripts/backfill-seed-storage.ts to look up a (title, version
// number) -> filename/mimeType without duplicating this data.
export function allSeedDocumentSpecs(): SeedDocumentSpec[] {
  return [...HERO_CASE_DOCUMENTS, ...Object.values(SUPPORTING_CASE_DOCUMENTS).flat()];
}
