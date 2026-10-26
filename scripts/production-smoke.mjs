import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
await mkdir("artifacts", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await page.locator("canvas").waitFor();
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(
    () => document.querySelector("#cargo-label").textContent === "2 / 8",
  );
  await page.keyboard.up("ArrowDown");
  await page.locator("#pause").click();
  await page.locator("#save").click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.equal(saved.inventory.length, 2);
  assert.equal(saved.tiles[5 * 24 + 12], 0);
  await page.reload();
  await page.locator("canvas").waitFor();
  assert.match(await page.locator("#cargo-label").innerText(), /2 \/ 8/);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () => document.querySelector("#dock-state").textContent === "DOCKED",
  );
  await page.keyboard.up("ArrowUp");
  await page.locator("#sell").click();
  assert.equal(await page.locator("#money").innerText(), "$110");
  await page.locator("#upgrade-drill").click();
  assert.equal(await page.locator("#rig-level").innerText(), "DRILL LV. 2");
  await page.locator("#save").click();
  await page.reload();
  await page.locator("canvas").waitFor();
  assert.equal(await page.locator("#rig-level").innerText(), "DRILL LV. 2");
  await page.screenshot({
    path: "artifacts/production-desktop.png",
    fullPage: true,
  });
  const mobile = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(base);
  await phone.locator("canvas").waitFor();
  const down = phone.locator('[data-dir="down"]');
  await down.scrollIntoViewIfNeeded();
  const box = await down.boundingBox(),
    cdp = await mobile.newCDPSession(phone);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await phone.waitForFunction(
    () => document.querySelector("#cargo-label").textContent === "1 / 8",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await phone.screenshot({
    path: "artifacts/production-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `Production smoke passed at ${base}: mining, terrain/inventory reload, surface sale, upgrade persistence, mobile touch/layout; no page errors.`,
  );
} finally {
  await browser.close();
}
