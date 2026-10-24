import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1100 },
  });
  const errors = [],
    ruffleMessages = new Map();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const text = m.text();
    if (text.includes("ERROR") || m.type() === "error")
      ruffleMessages.set(text, (ruffleMessages.get(text) || 0) + 1);
  });
  await page.goto(
    (process.env.PREVIEW_URL || "http://127.0.0.1:5173") + "/reference/",
  );
  await page.locator("#file").setInputFiles("reference/motherload_2017.swf");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      .textContent.includes("matches the inspected"),
  );
  await page.waitForTimeout(15000);
  await mkdir("artifacts", { recursive: true });
  const shot = async (name) =>
    page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
  await shot("original-ruffle");
  const rect = await page.locator("ruffle-player").boundingBox();
  const click = async (x, y) =>
    page.mouse.click(rect.x + rect.width * x, rect.y + rect.height * y, {
      delay: 200,
    });
  // Opening/closing Instructions reliably activates this build's menu in Ruffle.
  // A highlighted New Game button alone was not evidence that a game had started.
  await click(0.25, 0.7);
  await page.waitForTimeout(500);
  await shot("original-instructions");
  await click(0.89, 0.1);
  await page.waitForTimeout(500);
  await click(0.25, 0.575);
  await page.waitForTimeout(3000);
  await shot("original-transmission");
  await click(0.64, 0.263);
  const hold = async (keys, ms) => {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    for (const key of keys) await page.keyboard.up(key);
  };
  await hold(["ArrowDown"], 2500);
  await shot("original-mining");
  await hold(["ArrowLeft"], 1800);
  await shot("original-lateral");
  await hold(["ArrowUp", "ArrowRight"], 600);
  await shot("original-diagonal");
  await page.evaluate(() =>
    document.querySelector("ruffle-player").ruffle().suspend(),
  );
  console.log(await page.locator("#status").innerText());
  assert.deepEqual(errors, []);
  console.log(
    "Reference input sequence captured: instructions, new game, transmission dismissal, downward mining, lateral mining, and combined flight. Inspect the screenshots to verify the resulting game state; this is not an automated mechanics-parity assertion.",
  );
  console.log(
    "Ruffle console diagnostics:",
    [...ruffleMessages]
      .slice(0, 10)
      .map(([message, count]) => ({ message: message.slice(0, 250), count })),
  );
} finally {
  await browser.close();
}
