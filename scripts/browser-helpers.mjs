import assert from "node:assert/strict";
import { chromium } from "playwright-core";

export const SAVE_KEY = "motherload.frontier.v1";
export const WIDTH = 24;
const VALUES = {
  3: 30,
  4: 250,
  5: 5000,
  6: 100000,
  9: 60,
  10: 100,
  11: 750,
  12: 2000,
  13: 20000,
  14: 500000,
};

export function fixture(patch = {}) {
  return {
    version: 3,
    seed: 73021,
    tiles: Array.from({ length: 2400 }, (_, i) =>
      Math.floor(i / WIDTH) <= 3 ? 0 : Math.floor(i / WIDTH) === 99 ? 8 : 1,
    ),
    x: 12,
    y: 3.15,
    money: 2000,
    fuel: 10,
    hull: 10,
    inventory: [],
    upgrades: { drill: 0, tank: 0, cargo: 0, hull: 0, engine: 0 },
    mined: 0,
    deepest: 0,
    ...patch,
  };
}
export function flightFixture() {
  const state = fixture({ x: 8, y: 35, deepest: 320 });
  for (let y = 4; y <= 65; y++)
    for (let x = 1; x <= 22; x++) state.tiles[y * WIDTH + x] = 0;
  return state;
}
export function legacyFixture() {
  const state = fixture({
    version: 2,
    money: 1234,
    fuel: 57,
    hull: 63,
    inventory: Array(8).fill(3),
  });
  delete state.upgrades.engine;
  state.tiles[4 * WIDTH + 12] = 0;
  return state;
}
export function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
export async function ready(page, base) {
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => document.body.dataset.saving !== undefined);
}
export async function pause(page, value = true) {
  await page.locator("#pause").evaluate((button, value) => {
    if ((button.getAttribute("aria-pressed") === "true") !== value)
      button.click();
  }, value);
}
export async function settled(page) {
  await page.waitForFunction(() => document.body.dataset.saving === "false");
}
export async function savedState(page) {
  await page.locator("#save").evaluate((button) => button.click());
  await settled(page);
  return readState(page);
}
export function readState(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
}
export async function openTools(page) {
  if (!(await page.locator("#tools").evaluate((dialog) => dialog.open)))
    await page.locator("#tools-toggle").click();
}
export async function closeTools(page) {
  if (await page.locator("#tools").evaluate((dialog) => dialog.open))
    await page.locator("#close-tools").click();
}
export async function importRaw(page, raw, confirm = true) {
  await openTools(page);
  await page.locator("#import-save").setInputFiles({
    name: "expedition.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
  if (confirm) {
    await page.locator("#confirm").waitFor({ state: "visible" });
    await page.locator("#confirm-action").click();
    await page.waitForFunction(() => !document.querySelector("#confirm").open);
    await settled(page);
    await closeTools(page);
  }
}
export const importState = (page, state) =>
  importRaw(page, JSON.stringify(state));
export async function snapshot(page) {
  await pause(page);
  return savedState(page);
}
export async function runCoreSmoke(page, base) {
  await ready(page, base);
  await pause(page, false);
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector("#hud-cargo").textContent.match(/\d+/)?.[0],
      ) >= 2,
  );
  await page.keyboard.up("ArrowDown");
  const mined = await snapshot(page);
  assert.ok(mined.inventory.length >= 2 && mined.inventory.length <= 7);
  assert.equal(mined.tiles[4 * WIDTH + 12], 0);
  assert.equal(mined.version, 3);
  assert.ok(mined.fuel < 6 && mined.hull > 0);
  await page.reload();
  await page.locator("canvas").waitFor();
  await pause(page, false);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () => document.querySelector("#dock-state").textContent === "DOCKED",
  );
  await page.keyboard.up("ArrowUp");
  await pause(page);
  await page.locator("#sell").click();
  await settled(page);
  const sold = await readState(page);
  assert.equal(
    sold.money,
    mined.money + mined.inventory.reduce((n, ore) => n + VALUES[ore], 0),
  );
  assert.deepEqual(sold.inventory, []);
  // A legitimate earned-credit fixture keeps this smoke check short. Simulation
  // tests separately prove that normal repeated expeditions fund the upgrade.
  const service = fixture({
    money: 2000,
    fuel: 4,
    hull: 5,
    inventory: [3, 9, 10],
  });
  await importState(page, service);
  await pause(page);
  await page.locator("#sell").click();
  await settled(page);
  await page.locator("#refuel").click();
  await settled(page);
  await page.locator("#repair").click();
  await settled(page);
  await page.locator("#upgrade-drill").click();
  await settled(page);
  await page.locator("#upgrade-engine").click();
  await settled(page);
  const upgraded = await savedState(page);
  assert.equal(upgraded.fuel, 10);
  assert.equal(upgraded.hull, 10);
  assert.equal(upgraded.upgrades.drill, 1);
  assert.equal(upgraded.upgrades.engine, 1);
  assert.equal(upgraded.money, 609);
  await page.reload();
  await page.locator("canvas").waitFor();
  await pause(page);
  const restored = await readState(page);
  assert.deepEqual(restored, upgraded);
  assert.equal(await page.locator("#rig-level").innerText(), "DRILL LV. 2");
  assert.equal(await page.locator("#engine-level").innerText(), "ENGINE LV. 2");
  return { mined, upgraded };
}
export async function assertMobileLayout(page) {
  const boxes = await page.evaluate(() => {
    const selectors = [
      "#flight-hud",
      "#hud-fuel",
      "#hud-hull",
      "#hud-cargo",
      "#game canvas",
      '[data-dir="left"]',
      '[data-dir="up"]',
      '[data-dir="down"]',
      '[data-dir="right"]',
    ];
    return selectors.map((selector) => {
      const element = document.querySelector(selector),
        r = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      return {
        selector,
        width: r.width,
        height: r.height,
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        visible: style.display !== "none" && style.visibility !== "hidden",
        vw: innerWidth,
        vh: innerHeight,
      };
    });
  });
  for (const b of boxes)
    assert.ok(
      b.visible &&
        b.width > 0 &&
        b.height > 0 &&
        b.left >= -1 &&
        b.top >= -1 &&
        b.right <= b.vw + 1 &&
        b.bottom <= b.vh + 1,
      `${b.selector} must remain usable within the viewport: ${JSON.stringify(b)}`,
    );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
}
export async function runMobileSmoke(browser, base, path) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, base);
  await assertMobileLayout(page);
  await pause(page, false);
  const cdp = await context.newCDPSession(page),
    box = await page.locator('[data-dir="down"]').boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ],
  });
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector("#hud-cargo").textContent.match(/\d+/)?.[0],
      ) >= 1,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const mined = await snapshot(page);
  assert.ok(mined.inventory.length >= 1);
  await page.screenshot({ path: `${path}-portrait.png`, fullPage: true });
  await page.setViewportSize({ width: 851, height: 393 });
  await page.waitForTimeout(250);
  await assertMobileLayout(page);
  await page.screenshot({ path: `${path}-landscape.png`, fullPage: true });
  await page.locator("#focus").click();
  assert.ok(
    await page
      .locator("body")
      .evaluate((body) => body.classList.contains("focus-mode")),
  );
  await assertMobileLayout(page);
  await page.locator("#focus").click();
  assert.deepEqual(errors, []);
  return { context, page, cdp };
}
