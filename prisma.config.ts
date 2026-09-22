import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Guard-load .env before defineConfig reads schema/migrations so the Prisma
// CLI (generate/migrate/db seed) resolves DATABASE_URL/DIRECT_URL when run
// directly (outside `npm run dev:offline`, which exports .env.local itself
// before invoking prisma commands). process.loadEnvFile never overrides an
// already-set process.env var, so dev:offline's existing precedence holds.
// Silent by design — never log here, in success or failure, so this never
// conflicts with Vercel's dashboard-injected env or the absence of a local
// .env file.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Intentionally swallowed — see comment above.
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --conditions=react-server --import tsx prisma/seed.ts",
  },
});
