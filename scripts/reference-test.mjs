import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/reference/");
  await page.locator("#file").setInputFiles("reference/motherload_2017.swf");
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.startsWith("Loaded locally:"),
  );
  await page.waitForTimeout(15000);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/original-ruffle.png",
    fullPage: true,
  });
  const rect = await page.locator("ruffle-player").boundingBox();
  await page.mouse.move(
    rect.x + rect.width * 0.25,
    rect.y + rect.height * 0.58,
  );
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(10000);
  await page.screenshot({
    path: "artifacts/original-interaction.png",
    fullPage: true,
  });
  console.log(await page.locator("#status").innerText());
  assert.deepEqual(errors, []);
  console.log(
    "Ruffle file load and execution: no page errors. Inspect screenshots for original screen state.",
  );
} finally {
  await browser.close();
}
