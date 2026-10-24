import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
await mkdir("artifacts", { recursive: true });
let checks = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(
    () => document.querySelector("#cargo-label").textContent === "4 / 8",
  );
  await page.keyboard.up("ArrowDown");
  await page.waitForTimeout(150);
  assert.match(await page.locator("#cargo-label").innerText(), /4 \/ 8/);
  assert.equal(await page.locator("#sell").isDisabled(), true);
  checks++;
  await page.locator("#pause").click();
  await page.locator("#save").click();
  const mined = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.equal(mined.inventory.length, 4);
  assert.ok(mined.hull < 100);
  assert.ok(mined.fuel < 100);
  await page.reload();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(250);
  const reloaded = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.deepEqual(reloaded, mined);
  assert.match(await page.locator("#cargo-label").innerText(), /4 \/ 8/);
  checks++;
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () => document.querySelector("#dock-state").textContent === "DOCKED",
  );
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#dock-state").innerText(), "DOCKED");
  await page.locator("#sell").click();
  assert.equal(await page.locator("#money").innerText(), "$160");
  await page.locator("#refuel").click();
  await page.locator("#repair").click();
  await page.locator("#upgrade-drill").click();
  assert.equal(await page.locator("#rig-level").innerText(), "DRILL LV. 2");
  checks++;
  await page.locator("#save").click();
  await page.reload();
  await page.locator("canvas").waitFor();
  assert.equal(await page.locator("#rig-level").innerText(), "DRILL LV. 2");
  checks++;
  await page.locator("#pause").click();
  const fuel = await page.locator("#fuel-label").innerText();
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowDown");
  assert.equal(await page.locator("#fuel-label").innerText(), fuel);
  await page.locator("#pause").click();
  checks++;
  await page.locator("#recover").click();
  await page.locator("#cancel").click();
  assert.equal(await page.locator("#confirm").evaluate((e) => e.open), false);
  await page.locator("#recover").click();
  await page.locator("#confirm-action").click();
  assert.equal(await page.locator("#dock-state").innerText(), "DOCKED");
  checks++;
  await page.goto(base + "/reference/");
  await page.evaluate(() =>
    localStorage.setItem("motherload.frontier.v1", "damaged-save"),
  );
  await page.goto(base);
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(5300);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("motherload.frontier.v1")),
    "damaged-save",
  );
  checks++;
  await page.locator("#new-game").click();
  await page.locator("#confirm-action").click();
  assert.equal(await page.locator("#money").innerText(), "$60");
  checks++;
  await page.goto(base + "/reference/");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent.includes("Ruffle ready"),
  );
  checks++;
  const mobile = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(base);
  await phone.locator("canvas").waitFor();
  await phone.waitForTimeout(500);
  const down = phone.locator('[data-dir="down"]');
  await down.scrollIntoViewIfNeeded();
  const bounds = await down.boundingBox();
  const cdp = await mobile.newCDPSession(phone);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    ],
  });
  await phone.waitForFunction(
    () => document.querySelector("#cargo-label").textContent === "1 / 8",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phone.waitForTimeout(150);
  assert.match(await phone.locator("#cargo-label").innerText(), /1 \/ 8/);
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  checks++;
  await phone.screenshot({
    path: "artifacts/android-layout.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `${checks} browser checks passed: keyboard mining, save/reload, surface services, upgrade, pause, recovery, corrupt-save protection, reset, Ruffle initialization, touch/layout. No page errors.`,
  );
} finally {
  await browser.close();
}
