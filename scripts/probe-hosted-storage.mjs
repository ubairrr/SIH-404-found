#!/usr/bin/env node
// Secret-safe hosted Supabase Storage health check (G-03-1/G-03-2).
//
// Run with the hosted SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY exported in
// the environment, e.g.:
//   node --env-file=.env scripts/probe-hosted-storage.mjs
// or with the vars already exported by the shell.
//
// Never prints the key or URL values themselves — only booleans, HTTP
// status codes, and error messages, so output is safe to paste into a bug
// report or share with a teammate.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BUCKET = "casevault-files";

// Duplicated (deliberately) from app/lib/storage/supabase-helpers.ts's
// resolveSupabaseUrl — importing the TS module from this standalone .mjs
// script is awkward (server-only guard + TS loader), so this file keeps its
// own small, self-contained copy of the same normalization logic.
function resolveSupabaseUrl(raw) {
  const INVALID_URL_MESSAGE =
    "SUPABASE_URL must be the project API origin, e.g. https://<project-ref>.supabase.co (no path, no trailing slash)";
  if (!raw) throw new Error(INVALID_URL_MESSAGE);
  const trimmed = raw.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname !== "") throw new Error(INVALID_URL_MESSAGE);
  return parsed.origin;
}

function buildReadRangeHeaders(serviceRoleKey, rangeHeader) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  if (rangeHeader) headers.Range = rangeHeader;
  return headers;
}

async function main() {
  console.log("CaseVault hosted storage probe — no secret values are ever printed.\n");

  let url;
  try {
    url = resolveSupabaseUrl(process.env.SUPABASE_URL);
    console.log("[1/5] SUPABASE_URL is present and normalizes to a valid origin: OK");
  } catch (err) {
    console.log(`[1/5] SUPABASE_URL check: FAILED — ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.log("[1/5] SUPABASE_SERVICE_ROLE_KEY check: FAILED — env var is not set");
    process.exitCode = 1;
    return;
  }
  console.log(
    `      SUPABASE_SERVICE_ROLE_KEY format: ${serviceRoleKey.startsWith("eyJ") ? "legacy JWT (eyJ...)" : serviceRoleKey.startsWith("sb_secret_") ? "new non-JWT (sb_secret_...) — may be incompatible, see .env.example" : "unrecognized prefix"}`,
  );

  const client = createClient(url, serviceRoleKey);
  const probeKey = `probe/${randomUUID()}`;
  let signedUploadOk = false;
  let sdkUploadOk = false;
  let rawFetchStatus = null;

  // Step 2: createSignedUploadUrl
  let signedUpload;
  try {
    const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(probeKey);
    if (error || !data) {
      console.log(
        `[2/5] createSignedUploadUrl: FAILED — ${error?.message ?? "no data returned"}${error?.status !== undefined ? ` (status ${error.status})` : ""}`,
      );
    } else {
      signedUpload = data;
      signedUploadOk = true;
      console.log("[2/5] createSignedUploadUrl: OK");
    }
  } catch (err) {
    console.log(`[2/5] createSignedUploadUrl: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 3: SDK upload of a tiny buffer
  try {
    const { error } = await client.storage
      .from(BUCKET)
      .upload(probeKey, Buffer.from("casevault-probe"), { contentType: "text/plain", upsert: true });
    if (error) {
      console.log(
        `[3/5] SDK upload: FAILED — ${error.message}${"status" in error && error.status !== undefined ? ` (status ${error.status})` : ""}`,
      );
    } else {
      sdkUploadOk = true;
      console.log("[3/5] SDK upload: OK");
    }
  } catch (err) {
    console.log(`[3/5] SDK upload: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 4: raw fetch against the Storage REST object endpoint using the
  // same apikey+Authorization headers readRange() sends.
  if (sdkUploadOk) {
    try {
      const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${probeKey}`, {
        headers: buildReadRangeHeaders(serviceRoleKey, null),
      });
      rawFetchStatus = response.status;
      console.log(`[4/5] raw fetch with apikey+Authorization headers: HTTP ${response.status}`);
    } catch (err) {
      console.log(`[4/5] raw fetch: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log("[4/5] raw fetch: SKIPPED (no object was uploaded in step 3)");
  }

  // Step 5: cleanup
  try {
    const { error } = await client.storage.from(BUCKET).remove([probeKey]);
    console.log(error ? `[5/5] cleanup: FAILED — ${error.message}` : "[5/5] cleanup: OK");
  } catch (err) {
    console.log(`[5/5] cleanup: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }

  const allOk = signedUploadOk && sdkUploadOk && rawFetchStatus === 200;
  console.log(`\nOverall: ${allOk ? "PASS" : "FAIL"}`);
  if (!allOk) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Probe script crashed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
