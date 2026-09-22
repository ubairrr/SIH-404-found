// G-03-2 remaining symptom: documents seeded against a hosted DATABASE_URL
// while STORAGE_DRIVER=local (or vice versa: seeded locally, DB later
// pointed at Supabase) leave DocumentVersion rows in Postgres whose bytes
// were never uploaded to the hosted bucket. `prisma db seed` will NOT fix
// this — it skips already-existing documents by (caseId, title). This
// script backfills the missing bytes for exactly those rows, reusing the
// seed's own document specs (never duplicated) to resolve each
// (title, versionNumber) -> local seed-files filename.
//
// Run with: npm run storage:backfill-seed
// (equivalent to: node --conditions=react-server --import tsx scripts/backfill-seed-storage.ts)
//
// Idempotent — a second run uploads nothing. Refuses to run unless
// STORAGE_DRIVER=supabase. Prints only counts/titles/keys/statuses, never
// env values.

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { getStorageAdapter, StorageAdapterError } from "../app/lib/storage/adapter";
import { allSeedDocumentSpecs } from "../prisma/seed-document-specs";

const SEED_FILES_DIR = path.join(__dirname, "..", "prisma", "seed-files");

async function objectExists(key: string): Promise<boolean> {
  try {
    await getStorageAdapter().getObjectSize(key);
    return true;
  } catch (err) {
    if (err instanceof StorageAdapterError) return false;
    throw err;
  }
}

async function main() {
  if (process.env.STORAGE_DRIVER !== "supabase") {
    console.error(
      `Refusing to run: STORAGE_DRIVER is "${process.env.STORAGE_DRIVER ?? "(unset)"}", not "supabase". ` +
        "This script only makes sense against hosted Supabase Storage — set " +
        "STORAGE_DRIVER=supabase (plus the hosted SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY " +
        "and hosted DATABASE_URL/DIRECT_URL) before running it.",
    );
    process.exitCode = 1;
    return;
  }

  // (title, versionNumber) -> { filename, mimeType }
  const specByTitleAndVersion = new Map<string, { filename: string; mimeType: string }>();
  for (const spec of allSeedDocumentSpecs()) {
    for (const version of spec.versions) {
      specByTitleAndVersion.set(`${spec.title}::${version.versionNumber}`, {
        filename: version.filename,
        mimeType: version.mimeType,
      });
    }
  }

  const prisma = new PrismaClient();
  try {
    const versions = await prisma.documentVersion.findMany({
      where: { document: { title: { in: [...new Set([...specByTitleAndVersion.keys()].map((k) => k.split("::")[0]))] } } },
      include: { document: { select: { title: true } } },
    });

    let uploaded = 0;
    let alreadyPresent = 0;
    let skippedNoSpec = 0;

    for (const version of versions) {
      const lookupKey = `${version.document.title}::${version.versionNumber}`;
      const spec = specByTitleAndVersion.get(lookupKey);
      if (!spec) {
        skippedNoSpec += 1;
        continue;
      }

      const exists = await objectExists(version.storageKey);
      if (exists) {
        alreadyPresent += 1;
        console.log(`present:   "${version.document.title}" v${version.versionNumber} (${version.storageKey})`);
        continue;
      }

      const buffer = await readFile(path.join(SEED_FILES_DIR, spec.filename));
      await getStorageAdapter().putObjectNoOverwrite(version.storageKey, buffer, spec.mimeType);
      uploaded += 1;
      console.log(`uploaded:  "${version.document.title}" v${version.versionNumber} (${version.storageKey})`);
    }

    console.log(
      `\nDone. uploaded=${uploaded} already_present=${alreadyPresent} skipped_no_spec=${skippedNoSpec} total_checked=${versions.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
