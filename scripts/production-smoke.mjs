import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import { runCampaignSmoke } from "./campaign-smoke.mjs";
import { runUsabilitySmoke } from "./usability-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:8080/";
await mkdir("artifacts", { recursive: true });
const browser = await launchBrowser();
try {
  const checks = await runCampaignSmoke(
    browser,
    base,
    "artifacts/production-gameplay",
    process.env.CAMPAIGN_CHECKS || "pointer,inspection",
  );
  checks.push(
    ...(await runUsabilitySmoke(
      browser,
      base,
      "artifacts/production-usability",
    )),
  );
  console.log(
    `Production checks passed at ${base}: ${checks.length}; current game only.`,
  );
} finally {
  await browser.close();
}
