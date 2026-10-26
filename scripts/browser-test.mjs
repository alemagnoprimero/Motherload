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
  // Check combined keyboard input through the actual UI, without a test-only game API.
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(350);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowUp");
  await page.locator("#pause").click();
  await page.locator("#save").click();
  const flown = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.ok(
    flown.x > 12.2 && flown.y < 3,
    "keyboard thrust and steering must work together",
  );
  assert.equal(flown.version, 2);
  checks++;
  // Fall onto an offset ledge at 40 m beside a shaft continuing to 170 m.
  // The fixture starts airborne; ordinary keyboard input then cuts from the ledge.
  const ledge = structuredClone(flown);
  ledge.x = 13.1;
  ledge.y = 5.4;
  ledge.deepest = 40;
  ledge.fuel = 100;
  ledge.hull = 100;
  for (let y = 4; y <= 20; y++)
    for (let x = 10; x <= 13; x++) ledge.tiles[y * 24 + x] = 0;
  ledge.tiles[8 * 24 + 13] = 1;
  ledge.tiles[7 * 24 + 14] = 1;
  ledge.tiles[8 * 24 + 14] = 1;
  ledge.tiles[7 * 24 + 15] = 8;
  await page.goto(base + "/reference/");
  await page.evaluate(
    (state) =>
      localStorage.setItem("motherload.frontier.v1", JSON.stringify(state)),
    ledge,
  );
  await page.goto(base);
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => {
    document.querySelector("#save").click();
    const state = JSON.parse(localStorage.getItem("motherload.frontier.v1"));
    return state.y >= 7.14 && state.y < 7.16;
  });
  const landed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.equal(
    landed.x,
    13.1,
    "the rig must land at the fractional horizontal offset",
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(() => {
    document.querySelector("#save").click();
    return (
      JSON.parse(localStorage.getItem("motherload.frontier.v1")).tiles[
        7 * 24 + 14
      ] === 0
    );
  });
  await page.keyboard.up("ArrowRight");
  await page.locator("#pause").click();
  await page.locator("#save").click();
  const cut = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.equal(
    cut.tiles[7 * 24 + 14],
    0,
    "keyboard drilling must cut from an intermediate ledge",
  );
  assert.ok(
    cut.x >= 14 && cut.y < 8,
    "the rig must stay on the ledge instead of dropping to the shaft bottom",
  );
  await page.screenshot({ path: "artifacts/ledge-drill.png", fullPage: true });
  checks++;
  // Load through the UI: reloading directly after changing storage would fire
  // pagehide autosave and replace this fixture with the preceding expedition.
  const committedCut = structuredClone(flown);
  committedCut.x = 12.1;
  committedCut.y = 3.15;
  committedCut.fuel = 100;
  committedCut.hull = 100;
  committedCut.inventory = [];
  committedCut.mined = 0;
  committedCut.tiles[4 * 24 + 12] = 3;
  await page.evaluate(
    (state) =>
      localStorage.setItem("motherload.frontier.v1", JSON.stringify(state)),
    committedCut,
  );
  await page.locator("#load").click();
  await page.keyboard.down("ArrowDown");
  await page.locator("#pause").click();
  await page.waitForTimeout(250);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(() => {
    document.querySelector("#save").click();
    const state = JSON.parse(localStorage.getItem("motherload.frontier.v1"));
    return state.tiles[4 * 24 + 12] === 0 && state.y < 3.8;
  });
  await page.keyboard.up("ArrowUp");
  await page.locator("#pause").click();
  await page.locator("#save").click();
  const finishedCut = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.equal(
    finishedCut.mined,
    1,
    "Up must let the selected cut finish exactly once",
  );
  assert.deepEqual(finishedCut.inventory, [3]);
  assert.equal(
    finishedCut.tiles[4 * 24 + 12],
    0,
    "Up must not restore the cut tile",
  );
  checks++;

  const flight = structuredClone(flown);
  flight.x = 11;
  flight.y = 15;
  flight.fuel = 100;
  flight.hull = 100;
  for (let y = 4; y <= 24; y++)
    for (let x = 8; x <= 18; x++) flight.tiles[y * 24 + x] = 0;
  await page.evaluate(
    (state) =>
      localStorage.setItem("motherload.frontier.v1", JSON.stringify(state)),
    flight,
  );
  await page.locator("#load").click();
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowRight");
  await page.locator("#pause").click();
  await page.waitForTimeout(450);
  await page.locator("#save").evaluate((button) => button.click());
  const powered = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(150);
  await page.locator("#pause").click();
  await page.locator("#save").click();
  const coasting = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.ok(
    powered.x > flight.x && powered.y < flight.y,
    "thrust and steering must move diagonally within an open shaft",
  );
  assert.ok(
    coasting.x > powered.x + 0.05 && coasting.y < powered.y,
    "releasing flight controls must retain momentum before gravity reverses ascent",
  );
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
  await phone.locator("#new-game").click();
  await phone.locator("#confirm-action").click();
  await phone.locator("#pause").click();
  await phone.evaluate(
    (state) =>
      localStorage.setItem("motherload.frontier.v1", JSON.stringify(state)),
    flight,
  );
  await phone.locator("#load").click();
  await down.scrollIntoViewIfNeeded();
  const upBox = await phone.locator('[data-dir="up"]').boundingBox();
  const rightBox = await phone.locator('[data-dir="right"]').boundingBox();
  const upPoint = {
    id: 1,
    x: upBox.x + upBox.width / 2,
    y: upBox.y + upBox.height / 2,
  };
  const rightPoint = {
    id: 2,
    x: rightBox.x + rightBox.width / 2,
    y: rightBox.y + rightBox.height / 2,
  };
  await phone.evaluate(() => {
    window.touchEvents = [];
    for (const type of ["pointerup", "pointercancel"])
      document.querySelector(".touch").addEventListener(type, (event) => {
        window.touchEvents.push({ type, direction: event.target.dataset.dir });
      });
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [upPoint, rightPoint],
  });
  await phone.locator("#pause").evaluate((button) => button.click());
  await phone.waitForTimeout(350);
  await phone.locator("#save").evaluate((button) => button.click());
  const both = await phone.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.ok(
    both.x > flight.x + 0.2 && both.y < flight.y - 0.1,
    "two fingers must steer and thrust together",
  );
  // CDP touchEnd names the released contact. A touchMove with only Up does
  // not release Right and therefore cannot verify independent finger release.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [rightPoint],
  });
  await phone.waitForTimeout(700);
  await phone.locator("#save").evaluate((button) => button.click());
  const upOnly = await phone.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.ok(
    upOnly.y < both.y - 1,
    "releasing one finger must not release the other",
  );
  assert.deepEqual(
    await phone.evaluate(() => window.touchEvents),
    [{ type: "pointerup", direction: "right" }],
    "the right contact must release without releasing Up",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await phone.waitForTimeout(1200);
  await phone.locator("#save").evaluate((button) => button.click());
  const cancelled = await phone.evaluate(() =>
    JSON.parse(localStorage.getItem("motherload.frontier.v1")),
  );
  assert.ok(
    cancelled.y > upOnly.y + 0.5,
    "cancelling the remaining touch must stop thrust and allow the rig to fall",
  );
  assert.deepEqual(await phone.evaluate(() => window.touchEvents), [
    { type: "pointerup", direction: "right" },
    { type: "pointercancel", direction: "up" },
  ]);
  checks++;
  await phone.screenshot({
    path: "artifacts/android-layout.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `${checks} browser checks passed: keyboard mining, save/reload, surface services, upgrade, pause, recovery, corrupt-save protection, reset, Ruffle initialization, touch/layout, combined keyboard input, touch release/cancel, landing then ledge drilling, committed-cut thrust, and flight coasting. No page errors.`,
  );
} finally {
  await browser.close();
}
