import { spawnSync } from "node:child_process";

const mode = process.argv.includes("--nightly") ? "nightly" : "subset";
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/pacing",
    "tests/campaign-progression-model.test.ts",
    "--maxWorkers=1",
  ],
  { stdio: "inherit", env: { ...process.env, PACING_MODE: mode } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
