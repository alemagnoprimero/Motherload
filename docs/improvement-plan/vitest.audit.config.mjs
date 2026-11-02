// Runs the archived review measurements in docs/improvement-plan/work/.
// They are never part of `npm test`: the default test run only collects *.test.ts.
// From the repository root:
//   npx vitest run --config docs/improvement-plan/vitest.audit.config.mjs <file-name filter>
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    include: ["docs/improvement-plan/work/**/*.audit.ts"],
    testTimeout: 0,
    hookTimeout: 0,
  },
});
