import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  runCoreSmoke,
  runMobileSmoke,
} from "./browser-helpers.mjs";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:8080/";
await mkdir("artifacts", { recursive: true });
const browser = await launchBrowser();
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await runCoreSmoke(page, base);
  await page.screenshot({
    path: "artifacts/production-desktop.png",
    fullPage: true,
  });
  await runMobileSmoke(browser, base, "artifacts/production-mobile");
  assert.deepEqual(errors, []);
  console.log(
    `Production smoke passed at ${base}: mining and physical travel to exchange, canvas sale/services/upgrades, save import/reload, portrait/small-landscape native touch station menus and HUD; no page errors.`,
  );
} finally {
  await browser.close();
}
