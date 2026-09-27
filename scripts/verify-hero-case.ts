// Verifies hero case KOT/2026/0089's document/evidence/version/stage/log
// data against HERO-01..05 (all but the live-Vercel clause of HERO-05,
// which Plan 07-02's checkpoint confirms visually). Modeled on
// scripts/backfill-seed-storage.ts's shape — a standalone PrismaClient
// script run via `node --conditions=react-server --import tsx`, printing
// only counts/titles/statuses, never env values or full storageKey values
// beyond what's needed for a human to spot-check.
//
// Run with: npm run verify:hero-case
// Exits 0 only if every check passes; exits 1 (and prints at least one
// "FAIL:" line) otherwise.

import { PrismaClient } from "@prisma/client";
import type { DocumentCategory, EvidenceType } from "@prisma/client";

const HERO_FIR_NUMBER = "KOT/2026/0089";

const REQUIRED_DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "FIR",
  "WITNESS_STATEMENT",
  "CHARGE_SHEET",
  "FORENSIC_REPORT",
  "COURT_FILING",
  "LEGAL_NOTICE",
];

const REQUIRED_EVIDENCE_TYPES: EvidenceType[] = [
  "PHOTO",
  "VIDEO_CCTV",
  "AUDIO",
  "FORENSIC_DATA",
];

type CheckResult = { pass: boolean; label: string };

function report(results: CheckResult[]): void {
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}: ${r.label}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  const results: CheckResult[] = [];

  try {
    const heroCase = await prisma.case.findUnique({
      where: { firNumber: HERO_FIR_NUMBER },
    });

    if (!heroCase) {
      console.error(
        `FAIL: case lookup — no Case row found with firNumber exactly "${HERO_FIR_NUMBER}"`,
      );
      process.exitCode = 1;
      return;
    }

    // HERO-01: every required document category has >= 1 non-deleted row.
    const documents = await prisma.document.findMany({
      where: { caseId: heroCase.id, deletedAt: null },
      include: {
        versions: { orderBy: { versionNumber: "asc" } },
      },
    });

    const documentsByCategory = new Map<DocumentCategory, typeof documents>();
    for (const doc of documents) {
      if (!doc.category) continue;
      const bucket = documentsByCategory.get(doc.category) ?? [];
      bucket.push(doc);
      documentsByCategory.set(doc.category, bucket);
    }

    for (const category of REQUIRED_DOCUMENT_CATEGORIES) {
      const count = documentsByCategory.get(category)?.length ?? 0;
      results.push({
        pass: count >= 1,
        label: `${category} category (${count} doc)`,
      });
    }

    // HERO-02: every required evidence type has >= 1 non-deleted row.
    const documentsByEvidenceType = new Map<EvidenceType, typeof documents>();
    for (const doc of documents) {
      if (!doc.evidenceType) continue;
      const bucket = documentsByEvidenceType.get(doc.evidenceType) ?? [];
      bucket.push(doc);
      documentsByEvidenceType.set(doc.evidenceType, bucket);
    }

    for (const evidenceType of REQUIRED_EVIDENCE_TYPES) {
      const count = documentsByEvidenceType.get(evidenceType)?.length ?? 0;
      results.push({
        pass: count >= 1,
        label: `${evidenceType} evidence type (${count} doc)`,
      });
    }

    // HERO-03: FORENSIC_REPORT document has exactly 2 versions, distinct
    // storageKey/sizeBytes, v2 has a non-null changeNote.
    const forensicReports = documentsByCategory.get("FORENSIC_REPORT") ?? [];
    const forensicReport = forensicReports[0];
    if (!forensicReport) {
      results.push({
        pass: false,
        label: "FORENSIC_REPORT version history (no FORENSIC_REPORT document found)",
      });
    } else {
      const versions = forensicReport.versions;
      const hasTwoVersions = versions.length === 2;
      results.push({
        pass: hasTwoVersions,
        label: `FORENSIC_REPORT has exactly 2 versions (found ${versions.length})`,
      });

      if (hasTwoVersions) {
        const [v1, v2] = versions;
        const distinctStorageKey = v1.storageKey !== v2.storageKey;
        const distinctSizeBytes = v1.sizeBytes !== v2.sizeBytes;
        const v2HasChangeNote = v2.changeNote !== null && v2.changeNote !== "";

        results.push({
          pass: distinctStorageKey,
          label: "FORENSIC_REPORT v1/v2 have distinct storageKey",
        });
        results.push({
          pass: distinctSizeBytes,
          label: "FORENSIC_REPORT v1/v2 have distinct sizeBytes",
        });
        results.push({
          pass: v2HasChangeNote,
          label: "FORENSIC_REPORT v2 has a non-null changeNote",
        });
      }
    }

    // HERO-02 prohibition: FORENSIC_DATA evidence's latest version must be
    // application/pdf, never a zip.
    const forensicDataDocs = documentsByEvidenceType.get("FORENSIC_DATA") ?? [];
    const forensicDataDoc = forensicDataDocs[0];
    if (!forensicDataDoc) {
      results.push({
        pass: false,
        label: "FORENSIC_DATA mimeType check (no FORENSIC_DATA document found)",
      });
    } else {
      const latestVersion = forensicDataDoc.versions[forensicDataDoc.versions.length - 1];
      const isPdf = latestVersion?.mimeType === "application/pdf";
      results.push({
        pass: isPdf,
        label: `FORENSIC_DATA latest version mimeType is application/pdf (found "${latestVersion?.mimeType ?? "none"}")`,
      });
    }

    // HERO-05: case.stage === IN_COURT.
    results.push({
      pass: heroCase.stage === "IN_COURT",
      label: `case.stage is IN_COURT (found "${heroCase.stage}")`,
    });

    // HERO-04: StageHistory actorRole diversity (>= 3 distinct roles), and
    // combined with AuditLog actorRole diversity (>= 4 distinct roles:
    // POLICE, PROSECUTION, FORENSICS, COURT).
    const stageHistoryRows = await prisma.stageHistory.findMany({
      where: { caseId: heroCase.id },
      select: { actorRole: true },
    });
    const stageHistoryActorRoles = new Set(stageHistoryRows.map((r) => r.actorRole));
    results.push({
      pass: stageHistoryActorRoles.size >= 3,
      label: `StageHistory has >= 3 distinct actorRole values (found ${stageHistoryActorRoles.size}: ${[...stageHistoryActorRoles].join(", ")})`,
    });

    const documentIds = documents.map((d) => d.id);
    const auditLogRowsForCase = await prisma.auditLog.findMany({
      where: { targetType: "Case", targetId: heroCase.id },
      select: { actorRole: true },
    });
    const auditLogRowsForDocuments =
      documentIds.length > 0
        ? await prisma.auditLog.findMany({
            where: { targetType: "Document", targetId: { in: documentIds } },
            select: { actorRole: true },
          })
        : [];

    const combinedActorRoles = new Set([
      ...stageHistoryRows.map((r) => r.actorRole),
      ...auditLogRowsForCase.map((r) => r.actorRole),
      ...auditLogRowsForDocuments.map((r) => r.actorRole),
    ]);
    results.push({
      pass: combinedActorRoles.size >= 4,
      label: `Combined StageHistory+AuditLog actorRole diversity >= 4 (found ${combinedActorRoles.size}: ${[...combinedActorRoles].join(", ")})`,
    });

    report(results);

    const anyFailed = results.some((r) => !r.pass);
    process.exitCode = anyFailed ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
