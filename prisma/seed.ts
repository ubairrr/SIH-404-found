import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";
import type { Role, Stage } from "@prisma/client";
import bcrypt from "bcryptjs";

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../app/lib/demo-accounts";
import { getStorageAdapter } from "../app/lib/storage/adapter";
import {
  HERO_CASE_DOCUMENTS,
  SUPPORTING_CASE_DOCUMENTS,
  type SeedDocumentSpec,
} from "./seed-document-specs";

const prisma = new PrismaClient();

// D-22: small, real sample files committed under prisma/seed-files/, read
// from disk and uploaded through the real StorageAdapter (never inlined
// bytes) — same putObjectNoOverwrite path live finalizeUpload uses.
const SEED_FILES_DIR = path.join(__dirname, "seed-files");

// D-18: exactly 5 accounts, one per role — the roster lives in
// app/lib/demo-accounts.ts, shared with the login page's Demo Accounts
// panel (D-17) so the two never drift apart.
// G-03-1/G-03-2: seeding a hosted (Supabase) DATABASE_URL while
// STORAGE_DRIVER is not "supabase" writes seeded file bytes to local disk
// instead of the hosted bucket — hosted reads through /api/files then 404
// for that data. Advisory only (never throws/exits): local dev legitimately
// points STORAGE_DRIVER at local disk against a local DATABASE_URL.
function warnIfHostedDbWithNonHostedStorageDriver(): void {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const storageDriver = process.env.STORAGE_DRIVER;
  if (databaseUrl.includes("supabase.com") && storageDriver !== "supabase") {
    console.warn(
      "\n⚠ WARNING: DATABASE_URL points at a hosted Supabase database, but " +
        `STORAGE_DRIVER is "${storageDriver ?? "(unset)"}", not "supabase". ` +
        "Seeded file bytes will be written to local disk, not the hosted " +
        "Supabase bucket — hosted reads via /api/files will 404 for this " +
        "data. Re-run with STORAGE_DRIVER=supabase (and the matching " +
        "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) set, or if documents were " +
        "already seeded this way, run `npm run storage:backfill-seed` " +
        "afterward instead of re-seeding.\n",
    );
  }
}

async function main() {
  warnIfHostedDbWithNonHostedStorageDriver();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const seedUser of DEMO_ACCOUNTS) {
    await prisma.user.upsert({
      where: { username: seedUser.username },
      update: {},
      create: { ...seedUser, passwordHash, isActive: true },
    });
  }

  console.log(`Seeded ${DEMO_ACCOUNTS.length} demo accounts (idempotent).`);

  await seedCases();
}

// D-22/D-24: attaches one Document + its version(s) to `caseId` inside `tx`,
// resolving the acting user from `usersByRole` and using its id for BOTH
// uploadedById/createdById (Document/DocumentVersion) AND actorId/actorRole
// (AuditLog) — never a placeholder/system actor. Returns the number of
// one-minute ticks consumed, so callers can stagger consecutive documents.
async function attachSeedDocument(
  tx: Prisma.TransactionClient,
  params: {
    caseId: string;
    spec: SeedDocumentSpec;
    usersByRole: Map<Role, { id: string }>;
    baseTime: Date;
    startOffsetMinutes: number;
  },
): Promise<number> {
  const { caseId, spec, usersByRole, baseTime, startOffsetMinutes } = params;
  const actor = usersByRole.get(spec.actorRole)!;
  let offset = startOffsetMinutes;

  const document = await tx.document.create({
    data: {
      caseId,
      kind: spec.kind,
      category: spec.category ?? null,
      evidenceType: spec.evidenceType ?? null,
      title: spec.title,
      description: spec.description,
      uploadedById: actor.id,
      uploadedByRole: spec.actorRole,
      createdAt: new Date(baseTime.getTime() + offset * 60_000),
    },
  });

  for (const versionSpec of spec.versions) {
    // D-06/must-have: same MAX(versionNumber)+1-inside-transaction pattern
    // as live finalizeUpload — never trust a hardcoded literal, even though
    // seed order already implies it.
    const maxVersion = await tx.documentVersion.aggregate({
      where: { documentId: document.id },
      _max: { versionNumber: true },
    });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

    const buffer = await readFile(path.join(SEED_FILES_DIR, versionSpec.filename));
    const key = `cases/${caseId}/${document.id}/v${versionNumber}-${randomUUID()}`;
    await getStorageAdapter().putObjectNoOverwrite(key, buffer, versionSpec.mimeType);

    const createdAt = new Date(baseTime.getTime() + offset * 60_000);

    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber,
        storageKey: key,
        originalFilename: versionSpec.filename,
        mimeType: versionSpec.mimeType,
        sizeBytes: buffer.byteLength,
        changeNote: versionSpec.changeNote,
        createdById: actor.id,
        createdByRole: spec.actorRole,
        createdAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: spec.actorRole,
        action: versionNumber === 1 ? "DOCUMENT_UPLOADED" : "DOCUMENT_VERSION_ADDED",
        targetType: "Document",
        targetId: document.id,
        targetLabel: spec.title,
        details: {
          caseId,
          versionNumber,
          changeNote: versionSpec.changeNote ?? null,
        },
        createdAt,
      },
    });

    offset += 1;
  }

  return offset - startOffsetMinutes;
}

const STAGE_ORDER: Stage[] = [
  "FIR_REGISTERED",
  "UNDER_INVESTIGATION",
  "CHARGE_SHEET_FILED",
  "IN_COURT",
  "CLOSED_JUDGMENT",
];

const STAGE_ACTOR_ROLE: Record<Stage, Role> = {
  FIR_REGISTERED: "POLICE",
  UNDER_INVESTIGATION: "POLICE",
  CHARGE_SHEET_FILED: "PROSECUTION",
  IN_COURT: "COURT",
  CLOSED_JUDGMENT: "COURT",
};

type SupportingCaseSeed = {
  firNumber: string;
  title: string;
  offenceSections: string;
  incidentDate: Date;
  policeStation: string;
  complainant: string;
  accused: string;
  description: string;
  targetStage: Stage;
  verdict?: "CONVICTED" | "ACQUITTED" | "DISCHARGED" | "COMPOUNDED";
  judgmentSummary?: string;
};

// D-20: hero case storyline plus 4-6 supporting cases at different stages
// with realistic multi-row stage history, reusing the seeded Phase 1 users
// as actors.
const SUPPORTING_CASES: SupportingCaseSeed[] = [
  {
    firNumber: "NGP/2026/0101",
    title: "Chain Snatching near Sitabuldi Market",
    offenceSections: "BNS Section 304, BNS Section 305(a)",
    incidentDate: new Date("2026-08-02"),
    policeStation: "Sitabuldi PS",
    complainant: "Meena Wagh",
    accused: "Unidentified (CCTV under review)",
    description:
      "Complainant's gold chain was snatched by a motorcycle-borne assailant near the market entrance. CCTV footage collected.",
    targetStage: "UNDER_INVESTIGATION",
  },
  {
    firNumber: "KOT/2026/0089",
    title: "Cheating and Forgery in Land Sale Agreement",
    offenceSections: "BNS Section 316(2), BNS Section 338",
    incidentDate: new Date("2026-07-18"),
    policeStation: "Kotwali PS",
    complainant: "Suresh Patil",
    accused: "Dinesh Chavan",
    description:
      "Complainant alleges a forged land sale agreement was used to claim ownership of an ancestral plot.",
    targetStage: "CHARGE_SHEET_FILED",
  },
  {
    firNumber: "RJN/2026/0033",
    title: "Assault During Public Dispute",
    offenceSections: "BNS Section 115(2), BNS Section 351(3)",
    incidentDate: new Date("2026-06-05"),
    policeStation: "Rajnandgaon PS",
    complainant: "Ashok Verma",
    accused: "Ramu Sahu",
    description:
      "A dispute over shared farmland boundaries escalated into a physical altercation, resulting in injuries to the complainant.",
    targetStage: "IN_COURT",
  },
  {
    firNumber: "MUM/2026/0217",
    title: "Cyber Fraud via Fake Investment App",
    offenceSections: "BNS Section 318(4), IT Act Section 66D",
    incidentDate: new Date("2026-04-22"),
    policeStation: "Bandra PS",
    complainant: "Rohit Shah",
    accused: "Operators of 'QuickGain Invest' (identities established)",
    description:
      "Complainant lost funds to a fraudulent investment app promising guaranteed returns; multiple similar complaints consolidated.",
    targetStage: "CLOSED_JUDGMENT",
    verdict: "CONVICTED",
    judgmentSummary:
      "Court found sufficient digital and financial trail evidence; accused convicted on cyber fraud charges with restitution ordered.",
  },
  {
    firNumber: "PUN/2026/0064",
    title: "Motor Vehicle Theft from Residential Society",
    offenceSections: "BNS Section 303(2)",
    incidentDate: new Date("2026-05-11"),
    policeStation: "Shivajinagar PS",
    complainant: "Neha Kulkarni",
    accused: "Sandeep More",
    description:
      "A two-wheeler was stolen from a residential society parking area overnight; accused apprehended with the vehicle.",
    targetStage: "CLOSED_JUDGMENT",
    verdict: "ACQUITTED",
    judgmentSummary:
      "Chain of custody gaps in recovered-vehicle evidence led the court to acquit the accused on benefit of doubt.",
  },
];

async function seedCases() {
  const usersByRole = new Map<Role, { id: string }>();
  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: account.username },
      select: { id: true, role: true },
    });
    usersByRole.set(user.role, user);
  }

  // D-21: the hero case is strictly additive — never delete or rewrite an
  // existing hero-case row. Find the current max KOT/2026/0### hero number
  // and create the next one each run.
  const existingHeroCases = await prisma.case.findMany({
    where: { firNumber: { startsWith: "KOT/2026/0142" } },
    select: { firNumber: true },
  });
  const heroSuffixes = existingHeroCases
    .map((c) => {
      const match = c.firNumber.match(/^KOT\/2026\/0142(?:-(\d+))?$/);
      if (!match) return 0;
      return match[1] ? Number(match[1]) : 1;
    })
    .filter((n) => n > 0);
  const nextHeroSuffix =
    heroSuffixes.length === 0 ? 0 : Math.max(...heroSuffixes) + 1;
  const heroFirNumber =
    nextHeroSuffix === 0 ? "KOT/2026/0142" : `KOT/2026/0142-${nextHeroSuffix}`;

  const police = usersByRole.get("POLICE")!;

  await prisma.$transaction(async (tx) => {
    const heroCase = await tx.case.create({
      data: {
        firNumber: heroFirNumber,
        title: "Theft and Criminal Intimidation at Kotwali Market",
        offenceSections: "BNS Section 305(a), BNS Section 351(2)",
        incidentDate: new Date("2026-09-10"),
        policeStation: "Kotwali PS",
        complainant: "Vikram Sharma",
        accused: "Rakesh Yadav",
        description:
          "Complainant's shop was broken into overnight and cash was stolen; complainant was also threatened when confronting the accused the following morning.",
        stage: "FIR_REGISTERED",
        registeredById: police.id,
      },
    });

    await tx.stageHistory.create({
      data: {
        caseId: heroCase.id,
        fromStage: null,
        toStage: "FIR_REGISTERED",
        actorId: police.id,
        actorRole: "POLICE",
        remark: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: police.id,
        actorRole: "POLICE",
        action: "CASE_REGISTERED",
        targetType: "Case",
        targetId: heroCase.id,
        targetLabel: heroCase.firNumber,
        details: { title: heroCase.title, stage: "FIR_REGISTERED" },
      },
    });

    // D-23: the hero case is strictly additive, so its FIR is attached
    // unconditionally (no idempotency guard needed — this is always a
    // brand-new case row).
    let heroOffset = 1;
    for (const spec of HERO_CASE_DOCUMENTS) {
      heroOffset += await attachSeedDocument(tx, {
        caseId: heroCase.id,
        spec,
        usersByRole,
        baseTime: new Date(),
        startOffsetMinutes: heroOffset,
      });
    }
  });

  console.log(`Seeded fresh hero case ${heroFirNumber} (additive, D-21).`);

  // Supporting cases: idempotent upsert by firNumber so re-running the seed
  // is a no-op for them (D-20).
  let supportingCreated = 0;
  for (const seedCase of SUPPORTING_CASES) {
    const existing = await prisma.case.findUnique({
      where: { firNumber: seedCase.firNumber },
    });

    let caseId: string;

    if (existing) {
      caseId = existing.id;
    } else {
      const targetIndex = STAGE_ORDER.indexOf(seedCase.targetStage);

      caseId = await prisma.$transaction(async (tx) => {
        const created = await tx.case.create({
          data: {
            firNumber: seedCase.firNumber,
            title: seedCase.title,
            offenceSections: seedCase.offenceSections,
            incidentDate: seedCase.incidentDate,
            policeStation: seedCase.policeStation,
            complainant: seedCase.complainant,
            accused: seedCase.accused,
            description: seedCase.description,
            stage: seedCase.targetStage,
            verdict: seedCase.verdict,
            judgmentSummary: seedCase.judgmentSummary,
            registeredById: police.id,
          },
        });

        for (let i = 0; i <= targetIndex; i++) {
          const stage = STAGE_ORDER[i];
          const actorRole = STAGE_ACTOR_ROLE[stage];
          const actor = usersByRole.get(actorRole)!;
          const isClosing = stage === "CLOSED_JUDGMENT";

          await tx.stageHistory.create({
            data: {
              caseId: created.id,
              fromStage: i === 0 ? null : STAGE_ORDER[i - 1],
              toStage: stage,
              actorId: actor.id,
              actorRole,
              remark:
                isClosing && seedCase.verdict
                  ? `Verdict: ${seedCase.verdict} — ${seedCase.judgmentSummary}`
                  : null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole,
              action:
                i === 0
                  ? "CASE_REGISTERED"
                  : isClosing
                    ? "CASE_CLOSED"
                    : "STAGE_ADVANCED",
              targetType: "Case",
              targetId: created.id,
              targetLabel: created.firNumber,
              details: {
                fromStage: i === 0 ? null : STAGE_ORDER[i - 1],
                toStage: stage,
              },
            },
          });
        }

        return created.id;
      });

      supportingCreated += 1;
    }

    // D-22/D-24: attach the sample document/evidence set for this
    // supporting case (if any is defined) inside its own per-case
    // transaction — runs on every seed execution, guarded per-document by a
    // findFirst-then-skip check keyed on caseId+title, mirroring the
    // existing case-row idempotency check, so re-running the seed never
    // duplicates documents for already-seeded supporting cases.
    const docSpecs = SUPPORTING_CASE_DOCUMENTS[seedCase.firNumber];
    if (docSpecs) {
      await prisma.$transaction(async (tx) => {
        let offset = 1;
        const baseTime = new Date();
        for (const spec of docSpecs) {
          const alreadyAttached = await tx.document.findFirst({
            where: { caseId, title: spec.title },
          });
          if (alreadyAttached) {
            continue;
          }
          offset += await attachSeedDocument(tx, {
            caseId,
            spec,
            usersByRole,
            baseTime,
            startOffsetMinutes: offset,
          });
        }
      });
    }
  }

  console.log(
    `Seeded ${supportingCreated} new supporting cases (${SUPPORTING_CASES.length} total, idempotent).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
