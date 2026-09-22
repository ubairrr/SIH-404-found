This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Offline mode (one command)

CaseVault runs identically as a fully offline, single-laptop stack — no internet
dependency, no Supabase/Vercel network calls — switched purely by environment
configuration (`STORAGE_DRIVER`, `DATABASE_URL`/`DIRECT_URL`), never by code
branching.

1. `cp .env.local.example .env.local` and fill in `SESSION_SECRET` (generate one
   with `openssl rand -base64 32`).
2. `npm run dev:offline`

That single command:

- starts local Postgres 17 via Docker Compose (`docker compose up -d --wait`)
- applies all committed Prisma migrations, including the append-only audit-log
  trigger, against that local database (`prisma migrate deploy`)
- seeds the 5 demo accounts (`prisma db seed`)
- starts the app at [http://localhost:3000](http://localhost:3000) (`next dev`)

Requires Docker and Docker Compose installed and running.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Hosted deployment (Vercel + Supabase)

CaseVault's public demo runs identically on Vercel, backed by Supabase Postgres +
Storage — switched from the offline stack purely by environment configuration
(`STORAGE_DRIVER=supabase`, `DATABASE_URL`/`DIRECT_URL` pointing at Supabase),
never by code branching.

**Live demo:** [https://casevault-henna.vercel.app/login](https://casevault-henna.vercel.app/login)

Setup steps:

1. **Supabase** — use (or create) a Supabase project with Postgres and Storage
   enabled. Create a private Storage bucket named `casevault-files`. From
   Project Settings → API, note the Project URL and `service_role` key; from
   Project Settings → Database, note the pooled (`DATABASE_URL`, port 6543,
   `?pgbouncer=true`) and direct (`DIRECT_URL`, port 5432) connection strings.
   Apply the committed Prisma migrations against `DIRECT_URL`
   (`npx prisma migrate deploy`) and seed the 5 demo accounts
   (`npx prisma db seed`).
2. **Vercel** — import this GitHub repo (`ubairrr/SIH`) as a new Vercel
   project. Set these environment variables on the project:
   - `DATABASE_URL` — Supabase pooled connection string
   - `DIRECT_URL` — Supabase direct connection string
   - `SESSION_SECRET` — random value (`openssl rand -base64 32`)
   - `SUPABASE_URL` — Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase `service_role` key (server-only,
     never exposed to the client bundle)
   - `STORAGE_DRIVER` — `supabase`
   - `DEMO_MODE` — `true` (shows the click-to-fill Demo Accounts panel on
     `/login`)
   
   Deploy. Vercel auto-deploys on every push to `main` from then on.

See `.env.example` for the full hosted variable template, and
[Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying)
for general platform details.

### Troubleshooting hosted storage

- `SUPABASE_URL` must be exactly the project API origin
  (`https://<project-ref>.supabase.co`) — no trailing slash, no `/rest/v1`,
  `/storage/v1`, or `/storage/v1/s3` suffix, and not the dashboard URL. A
  wrong value surfaces as Supabase's "Invalid path specified in request URL"
  error.
- `SUPABASE_SERVICE_ROLE_KEY` must be the legacy JWT-format `service_role`
  key (starts with `eyJ`), not the newer non-JWT `sb_secret_...` format —
  see `.env.example` for details.
- `node --env-file=.env scripts/probe-hosted-storage.mjs` runs a secret-safe
  health check (signed-upload-url creation, SDK upload, and a raw
  `apikey`-header fetch) against the hosted bucket — useful for confirming a
  fix before redeploying.
- If documents were seeded against a hosted `DATABASE_URL` while
  `STORAGE_DRIVER` was not `supabase`, their bytes never reached the hosted
  bucket and `/api/files` will 404 for them. `npm run db:seed` will NOT fix
  this (it skips already-existing documents). Run
  `npm run storage:backfill-seed` instead, with the hosted
  `STORAGE_DRIVER=supabase`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  exported.
