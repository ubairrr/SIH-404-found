// eslint pinned to ^9: eslint-config-next@16.3.5's eslint-plugin-react has no
// documented ESLint 10 peer support yet; eslint@9.39.5 deprecation warning
// accepted until upstream adds it (03-10: `npm install eslint@^10` printed
// "npm warn ERESOLVE overriding peer dependency" three times, so the
// install was reverted per this plan's decision branch).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ESLint's flat config does not read .gitignore automatically — these
    // gitignored, non-app directories (local-only GSD tooling/planning
    // docs) were being linted as if they were project source, producing
    // thousands of unrelated errors that blocked `npm run lint` (03-10).
    ".claude/**",
    ".agents/**",
    ".planning/**",
  ]),
]);

export default eslintConfig;
