import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import {
  SAVE_KEY,
  WIDTH,
  fixture,
  flightFixture,
  legacyFixture,
  launchBrowser,
  ready,
  pause,
  settled,
  savedState,
  readState,
  openTools,
  closeTools,
  importRaw,
  importState,
  snapshot,
  runCoreSmoke,
  runMobileSmoke,
  stationOpen,
  stationClose,
  runReturnLedgeSmoke,
  freezeFrames,
  sampleClockedState,
} from "./browser-helpers.mjs";
const BACKUP_KEY = SAVE_KEY + ".backup";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
await mkdir("artifacts", { recursive: true });
const browser = await launchBrowser();
const checks = [],
  errors = [];
let activePage;
const watch = (page) => {
  activePage = page;
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
};
const check = (name) => {
  checks.push(name);
  console.log(`Passed: ${name}`);
};
async function bootWith(storage) {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = watch(await context.newPage());
  await page.addInitScript((storage) => {
    if (!sessionStorage.getItem("qa-initialized")) {
      for (const [key, value] of Object.entries(storage))
        localStorage.setItem(key, value);
      sessionStorage.setItem("qa-initialized", "true");
    }
  }, storage);
  await ready(page, base);
  return { context, page };
}
try {
  let context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = watch(await context.newPage());
  await runCoreSmoke(page, base);
  check(
    "mining, physical travel to exchange, canvas station services/upgrades and reload",
  );
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });

  await runReturnLedgeSmoke(page);
  check(
    "mine deep, return to an earlier ore shelf, and drill down with a full cargo bay",
  );

  const exportBaseline = await snapshot(page);
  await openTools(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-save").click(),
  ]);
  const exported = await readFile(await download.path(), "utf8");
  assert.deepEqual(JSON.parse(exported), exportBaseline);
  await closeTools(page);
  // Frame-clock controls install context-wide initialization hooks. Transfer
  // the real exported expedition to a fresh browser before testing ordinary
  // storage and cross-tab behavior, just as a player transfers to a device.
  await context.close();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  page = watch(await context.newPage());
  await ready(page, base);
  await pause(page);
  await importState(page, fixture({ money: 4321 }));
  await importRaw(page, exported);
  assert.deepEqual(await savedState(page), exportBaseline);
  check("portable export/import restores complete expedition");

  const beforeInvalid = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  await importRaw(page, "{damaged-save", false);
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator("#confirm").evaluate((dialog) => dialog.open),
    false,
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    beforeInvalid,
  );
  await page.locator("#import-save").setInputFiles({
    name: "cancelled.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture({ money: 8765 }))),
  });
  await page.locator("#confirm").waitFor({ state: "visible" });
  await page.locator("#cancel").click();
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    beforeInvalid,
  );
  await closeTools(page);
  check("invalid and cancelled imports preserve current progress");

  const backup = fixture({ money: 1111 });
  await importState(page, backup);
  await importState(page, fixture({ money: 2222 }));
  await openTools(page);
  await page.locator("#restore-backup").click();
  await page.locator("#confirm-action").click();
  await page.waitForFunction(() => !document.querySelector("#confirm").open);
  await settled(page);
  await closeTools(page);
  assert.deepEqual(await readState(page), backup);
  check("explicit backup restore retains a complete prior expedition");

  const second = watch(await context.newPage());
  await ready(second, base);
  await pause(second);
  const external = fixture({ money: 9876 });
  await importState(second, external);
  await page.locator("#reload-external").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#pause").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#pause").evaluate((button) => button.click());
  assert.equal(
    await page.locator("#pause").getAttribute("aria-pressed"),
    "true",
    "Resume must not bypass an unresolved external-save conflict",
  );
  await page.locator("#save").evaluate((button) => button.click());
  await page.waitForTimeout(100);
  assert.deepEqual(await readState(page), external);
  await page.locator("#reload-external").click();
  await settled(page);
  assert.deepEqual(await savedState(page), external);
  await second.close();
  check(
    "second-tab changes pause stale play and prevent overwriting newer progress",
  );

  const recovered = fixture({ x: 7, money: 2468, fuel: 4, inventory: [3, 9] });
  const corrupt = await bootWith({
    [SAVE_KEY]: "damaged-primary",
    [BACKUP_KEY]: JSON.stringify(recovered),
  });
  await corrupt.page.waitForTimeout(5300);
  assert.equal(
    await corrupt.page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    "damaged-primary",
  );
  await stationOpen(corrupt.page, "fuel");
  await corrupt.page.keyboard.press("Enter");
  await corrupt.page.waitForFunction(() =>
    document.querySelector("#hud-fuel").textContent.startsWith("10 / 10"),
  );
  await stationClose(corrupt.page);
  await openTools(corrupt.page);
  const [readOnlyExport] = await Promise.all([
    corrupt.page.waitForEvent("download"),
    corrupt.page.locator("#export-save").click(),
  ]);
  const inMemory = JSON.parse(
    await readFile(await readOnlyExport.path(), "utf8"),
  );
  assert.equal(inMemory.fuel, 10);
  assert.equal(inMemory.money, 2462);
  assert.equal(
    await corrupt.page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    "damaged-primary",
    "in-memory services must not overwrite protected storage",
  );
  await corrupt.page.locator("#restore-backup").click();
  await corrupt.page.locator("#confirm-action").click();
  await settled(corrupt.page);
  assert.deepEqual(await readState(corrupt.page), recovered);
  await corrupt.context.close();
  check(
    "protected storage permits in-memory station trade/export and explicit backup recovery",
  );

  const legacy = legacyFixture(),
    legacyRaw = JSON.stringify(legacy);
  const migrated = await bootWith({ [SAVE_KEY]: legacyRaw });
  await pause(migrated.page);
  const current = await savedState(migrated.page);
  assert.equal(current.version, 3);
  assert.equal(current.money, legacy.money);
  assert.deepEqual(current.inventory, legacy.inventory);
  assert.deepEqual(current.tiles, legacy.tiles);
  assert.ok(current.upgrades.cargo >= 1);
  assert.equal(
    await migrated.page.evaluate(
      (key) => localStorage.getItem(key),
      BACKUP_KEY,
    ),
    legacyRaw,
  );
  await migrated.context.close();
  check(
    "schema2 migration preserves terrain, credits and oversized legacy cargo with raw backup",
  );

  activePage = page;
  const ledge = flightFixture();
  ledge.x = 12.8;
  ledge.y = 6.75;
  ledge.deepest = 40;
  ledge.tiles[8 * WIDTH + 13] = 1;
  ledge.tiles[7 * WIDTH + 14] = 3;
  ledge.tiles[8 * WIDTH + 14] = 1;
  ledge.tiles[7 * WIDTH + 15] = 8;
  await importState(page, ledge);
  await pause(page, false);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector("#hud-cargo").textContent.match(/\d+/)?.[0],
      ) >= 1,
  );
  await page.keyboard.up("ArrowRight");
  const cut = await snapshot(page);
  assert.equal(cut.tiles[7 * WIDTH + 14], 0);
  assert.ok(cut.x >= 14 && cut.y > 7.14 && cut.y < 7.16);
  await page.screenshot({ path: "artifacts/ledge-drill.png", fullPage: true });
  check(
    "held lateral input lands on an offset ledge and excavates above a deeper shaft",
  );

  const committed = fixture({ x: 12.1 });
  committed.tiles[4 * WIDTH + 12] = 3;
  await importState(page, committed);
  // The browser schedules the pause from keydown so protocol/screenshot overhead
  // cannot accidentally hold Down past a whole cut before the Up check.
  await page.evaluate(() => {
    const stop = (event) => {
      if (event.key !== "ArrowDown") return;
      window.removeEventListener("keydown", stop);
      setTimeout(() => document.querySelector("#pause").click(), 300);
    };
    window.addEventListener("keydown", stop);
  });
  await pause(page, false);
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(
    () =>
      document.querySelector("#pause").getAttribute("aria-pressed") === "true",
  );
  await page.keyboard.up("ArrowDown");
  assert.equal((await savedState(page)).mined, 0);
  await pause(page, false);
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector("#hud-cargo").textContent.match(/\d+/)?.[0],
      ) === 1,
  );
  await page.waitForFunction(
    () => parseInt(document.querySelector("#depth").textContent, 10) === 0,
  );
  await page.keyboard.up("ArrowUp");
  const finished = await snapshot(page);
  assert.equal(finished.mined, 1);
  assert.equal(finished.tiles[4 * WIDTH + 12], 0);
  check("Up completes exactly one active cut before ascent");

  await importState(page, fixture({ x: 21, money: 10000 }));
  await stationOpen(page, "upgrades");
  await page.evaluate((lockName) => {
    window.qaLockHeld = false;
    void navigator.locks.request(lockName, async () => {
      window.qaLockHeld = true;
      await new Promise((resolve) => {
        window.qaReleaseLock = resolve;
      });
    });
  }, SAVE_KEY + ".write");
  await page.waitForFunction(() => window.qaLockHeld);
  try {
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.body.dataset.saving === "true");
    for (let repeat = 0; repeat < 3; repeat++)
      await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  } finally {
    await page.evaluate(() => window.qaReleaseLock());
  }
  await settled(page);
  const once = await readState(page);
  assert.equal(
    once.upgrades.drill,
    1,
    "repeated confirmation while saving must not queue another purchase",
  );
  assert.equal(once.money, 9250);
  await stationClose(page);
  check(
    "canvas purchases ignore repeated confirmation while persistence is busy",
  );

  await page.locator("#sound-toggle").click();
  assert.equal(
    await page.locator("#sound-toggle").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#sound-toggle").click();
  assert.equal(
    await page.locator("#sound-toggle").getAttribute("aria-pressed"),
    "false",
  );
  await openTools(page);
  await page.locator("#sound-volume").evaluate((slider) => {
    slider.value = "31";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.locator("#volume-label").innerText(), "31%");
  await closeTools(page);
  await page.reload();
  await page.locator("canvas").waitFor();
  assert.equal(
    await page.locator("#sound-toggle").getAttribute("aria-pressed"),
    "false",
  );
  await openTools(page);
  assert.equal(await page.locator("#sound-volume").inputValue(), "31");
  await closeTools(page);
  check(
    "sound unlock/mute and persistent volume respond without browser errors",
  );

  const mobile = await runMobileSmoke(
    browser,
    base,
    "artifacts/android-layout",
  );
  const phone = watch(mobile.page),
    cdp = mobile.cdp;
  await phone.setViewportSize({ width: 393, height: 851 });
  await pause(phone);
  const flight = flightFixture();
  await importState(phone, flight);
  const points = await Promise.all(
    ["up", "right"].map(async (direction, id) => {
      const b = await phone.locator(`[data-dir="${direction}"]`).boundingBox();
      return { id: id + 1, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }),
  );
  await phone.evaluate(() => {
    window.touchEvents = [];
    for (const type of ["pointerup", "pointercancel"])
      document.querySelector(".touch").addEventListener(type, (event) =>
        window.touchEvents.push({
          type,
          direction: event.target.dataset.dir,
        }),
      );
  });
  // Software rendering can make a Save probe take longer than the intended
  // touch hold. Advance bounded frames so the rig cannot reach the surface
  // while the test is inspecting a state midway through this flight.
  const advancePhone = async (milliseconds) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 80)
      await phone.clock.fastForward(Math.min(80, milliseconds - elapsed));
  };
  await freezeFrames(phone);
  await phone.locator("#pause").evaluate((button) => button.click());
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await advancePhone(350);
  const both = await sampleClockedState(phone);
  assert.ok(both.x > flight.x + 0.2 && both.y < flight.y - 0.1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [points[1]],
  });
  await advancePhone(500);
  const upOnly = await sampleClockedState(phone);
  assert.ok(upOnly.y < both.y - 0.5);
  assert.deepEqual(await phone.evaluate(() => window.touchEvents), [
    { type: "pointerup", direction: "right" },
  ]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await advancePhone(1800);
  await pause(phone);
  const cancelled = await sampleClockedState(phone);
  assert.ok(
    cancelled.y > upOnly.y + 0.5,
    "cancelled thrust must eventually give way to gravity",
  );
  assert.deepEqual(await phone.evaluate(() => window.touchEvents), [
    { type: "pointerup", direction: "right" },
    { type: "pointercancel", direction: "up" },
  ]);
  await phone.clock.resume();
  check(
    "portrait/landscape canvas shops and HUD fit; native touch trade/navigation and finger release work",
  );

  await importState(phone, flight);
  await freezeFrames(phone);
  await phone.locator("#pause").evaluate((button) => button.click());
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [points[0]],
  });
  await advancePhone(200);
  await pause(phone, true);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const held = await sampleClockedState(phone);
  await advancePhone(300);
  assert.deepEqual(await sampleClockedState(phone), held);
  // The phone is already in the foreground; avoid waiting for a render frame
  // inside pause(false) while its animation clock is intentionally frozen.
  await phone.locator("#pause").evaluate((button) => button.click());
  await advancePhone(1500);
  await pause(phone);
  const resumed = await sampleClockedState(phone);
  assert.ok(
    resumed.y > held.y,
    "pause must clear the held thrust before resume",
  );
  await phone.clock.resume();
  check("pause clears held touch input and freezes simulation");

  await page.goto(
    new URL("reference/", base.endsWith("/") ? base : base + "/").href,
  );
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent.includes("Ruffle ready"),
  );
  check("separate Ruffle reference lab initializes");
  assert.deepEqual(errors, []);
  console.log(`${checks.length} browser scenarios passed; no page errors.`);
} catch (error) {
  if (errors.length) console.error("Browser page errors:", errors);
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({
        path: "artifacts/browser-failure.png",
        fullPage: true,
        timeout: 5000,
      })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
