import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { stationLayout, nearbyPromptRect } from "../src/station-layout.ts";

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
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const assets = new Map();
  const collect = (response) => {
    const match = new URL(response.url()).pathname.match(
      /frontier-atlas[^/]*\.(png|json)$/,
    );
    if (match) assets.set(match[1], response);
  };
  page.on("response", collect);
  try {
    const response = await page.goto(base);
    assert.equal(response.status(), 200);
    await page.locator("canvas").waitFor();
    await page.waitForFunction(
      () => document.body.dataset.saving !== undefined,
    );
    await page
      .locator('#game[aria-busy="false"][data-art-status="ready"]')
      .waitFor();
    // A functioning fallback alone must not pass a release of the new artwork.
    // Check the actual resources loaded by Phaser, including hashed Pages URLs.
    for (const extension of ["png", "json"]) {
      const resource = assets.get(extension);
      assert.ok(resource, `the generated ${extension} atlas must be loaded`);
      assert.ok(
        resource.ok(),
        `${resource.url()} returned HTTP ${resource.status()}`,
      );
      assert.equal(await resource.finished(), null);
    }
    const png = await assets.get("png").body();
    assert.deepEqual([...png.subarray(0, 4)], [137, 80, 78, 71]);
    const atlas = await assets.get("json").json();
    for (const frame of [
      "rig-idle-0",
      "rig-down-0",
      "rig-side-0",
      "rig-flight-0",
      "building-exchange",
      "building-fuel",
      "building-repair",
      "building-upgrades",
      ...Object.keys(VALUES).map((ore) => `ore-${ore}`),
    ])
      assert.ok(
        atlas.frames[frame],
        `${frame} must be present in the delivered atlas`,
      );
  } finally {
    page.off("response", collect);
  }
}
export async function pause(page, value = true) {
  if (!value) {
    await page.bringToFront();
    await rendered(page);
  }
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
  await page.bringToFront();
  if (!(await page.locator("#tools").evaluate((dialog) => dialog.open)))
    await page.locator("#tools-toggle").click();
}
export async function closeTools(page) {
  if (await page.locator("#tools").evaluate((dialog) => dialog.open)) {
    await page.locator("#close-tools").click();
    await page.waitForFunction(() => !document.querySelector("#tools").open);
    // Native dialog close events restore the prior pause state asynchronously.
    // Let that finish before a following gameplay command resumes the rig.
    await rendered(page);
  }
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
export const STATION_CENTERS = {
  exchange: 2,
  fuel: 7,
  repair: 16,
  upgrades: 21,
};
export async function stationOpen(page, id) {
  await pause(page, false);
  await page.keyboard.press("e");
  await page.waitForFunction((id) => document.body.dataset.station === id, id);
}
export async function stationClose(page) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.body.dataset.station);
  await pause(page);
}
export function rawState(page) {
  return page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
}
export async function written(page, previous) {
  // Canvas keyboard commands are consumed on render frames; saving may not
  // have begun when Enter returns, so waiting only for "not busy" is racy.
  await page.waitForFunction(
    ([key, raw]) => localStorage.getItem(key) !== raw,
    [SAVE_KEY, previous],
  );
  await settled(page);
}
export async function stationBuy(page, id, index = 0) {
  await stationOpen(page, id);
  for (let step = 0; step < index; step++)
    await page.keyboard.press("ArrowDown");
  const previous = await rawState(page);
  await page.keyboard.press("Enter");
  await written(page, previous);
  const state = await readState(page);
  await stationClose(page);
  return state;
}
const clockedPages = new WeakSet();
export async function freezeFrames(page) {
  if (!clockedPages.has(page)) {
    await page.clock.install();
    clockedPages.add(page);
  }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
}
export async function sampleClockedState(page) {
  await page.locator("#save").evaluate((button) => button.click());
  // Web Locks settle independently of the frozen animation clock. Polling
  // normal Save output keeps these input regressions out of game internals.
  for (let attempt = 0; attempt < 250; attempt++) {
    if (await page.evaluate(() => document.body.dataset.saving === "false"))
      return readState(page);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Saving did not settle during the keyboard travel check");
}
export async function driveToStation(page, id) {
  const target = STATION_CENTERS[id],
    trace = [];
  let held,
    previous,
    simulationMs = 0;
  await pause(page, false);
  // Explicit browser frames preserve real keyboard input while preventing
  // protocol/rendering latency from extending a short steering pulse.
  await freezeFrames(page);
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await sampleClockedState(page);
      const velocity = previous ? (state.x - previous.x) / 0.08 : 0;
      trace.push({
        simulationMs,
        x: state.x,
        y: state.y,
        fuel: state.fuel,
        velocity,
        held,
      });
      if (
        Math.abs(state.x - target) <= 0.85 &&
        Math.abs(state.y - 3.15) < 0.19
      ) {
        if (held) {
          await page.keyboard.up(held);
          held = undefined;
        }
        await page.keyboard.press("e");
        if ((await page.evaluate(() => document.body.dataset.station)) === id) {
          await writeFile(
            `artifacts/travel-${id}.json`,
            JSON.stringify(trace, null, 2),
          );
          return;
        }
      }
      // Position feedback plus counter-steering brakes before crossing the bay.
      const desired = target - state.x - velocity * 0.3;
      const steering = desired >= 0 ? "ArrowRight" : "ArrowLeft";
      if (held !== steering) {
        if (held) await page.keyboard.up(held);
        await page.keyboard.down(steering);
        held = steering;
      }
      previous = state;
      await page.clock.runFor(80);
      simulationMs += 80;
    }
    throw new Error(
      `Could not drive to ${id}; final trace: ${JSON.stringify(trace.slice(-8))}`,
    );
  } catch (error) {
    await writeFile(
      `artifacts/travel-${id}-failure.json`,
      JSON.stringify(trace, null, 2),
    );
    await page
      .screenshot({ path: "artifacts/travel-failure.png", fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    if (held) await page.keyboard.up(held);
    await page.clock.resume();
  }
}
export async function runReturnLedgeSmoke(
  page,
  path = "artifacts/return-ledge",
) {
  const state = fixture({ money: 20, x: 12, fuel: 10 });
  for (let y = 4; y <= 7; y++)
    for (let x = 10; x <= 15; x++) state.tiles[y * WIDTH + x] = 0;
  for (let y = 8; y <= 14; y++) state.tiles[y * WIDTH + 12] = 3;
  state.tiles[8 * WIDTH + 13] = 3;
  await importState(page, state);
  await pause(page, false);
  await freezeFrames(page);
  const held = new Set(),
    trace = [];
  async function controls(keys) {
    for (const key of held)
      if (!keys.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of keys)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
  }
  async function advance(phase, milliseconds = 80) {
    if (trace.at(-1)?.phase !== phase)
      console.log(`Return-to-ledge check: ${phase}`);
    // One bounded 80ms animation frame exercises the same native controls and
    // collision substeps without rendering five redundant software-GPU frames
    // for every Save snapshot in this longer round trip.
    await page.clock.fastForward(milliseconds);
    const saved = await sampleClockedState(page);
    trace.push({
      phase,
      x: saved.x,
      y: saved.y,
      mined: saved.mined,
      cargo: saved.inventory.length,
    });
    return saved;
  }
  try {
    await controls(["ArrowDown"]);
    let deep;
    for (let step = 0; step < 260; step++) {
      deep = await advance("descend");
      if (deep.mined >= 8) break;
    }
    assert.ok(deep.mined >= 8 && deep.deepest >= 120);
    assert.equal(
      deep.inventory.length,
      7,
      "the descent must fill the stock cargo bay",
    );
    await controls(["ArrowUp"]);
    let ascending;
    for (let step = 0; step < 150; step++) {
      ascending = await advance("ascend");
      // Thrust coasts after release. Releasing near the shelf avoids flying
      // all the way back to the automatic surface docking plane.
      if (ascending.y <= 7.5) break;
    }
    assert.ok(ascending.y <= 7.5, "fly back toward the earlier ore shelf");
    await controls([]);
    let landed,
      previous = ascending;
    for (let step = 0; step < 150; step++) {
      landed = await advance("land on earlier shelf");
      const vx = (landed.x - previous.x) / 0.08;
      if (Math.abs(landed.x - 13) < 0.12 && Math.abs(landed.y - 7.15) < 0.005)
        break;
      const correction = (13 - landed.x) * 6 - vx * 2;
      await controls(
        correction > 0.15
          ? ["ArrowRight"]
          : correction < -0.15
            ? ["ArrowLeft"]
            : [],
      );
      previous = landed;
    }
    assert.ok(
      Math.abs(landed.x - 13) < 0.12 && Math.abs(landed.y - 7.15) < 0.005,
      `must actually land on the upper shelf: ${JSON.stringify({ x: landed.x, y: landed.y, fuel: landed.fuel, deepest: landed.deepest })}`,
    );
    const priorCargo = [...landed.inventory],
      peak = landed.deepest;
    assert.equal(landed.tiles[8 * WIDTH + 13], 3);
    await controls(["ArrowDown"]);
    let cut;
    for (let step = 0; step < 35; step++) {
      cut = await advance("cut upper ore with full cargo");
      if (cut.tiles[8 * WIDTH + 13] === 0) break;
    }
    await controls([]);
    assert.equal(
      cut.tiles[8 * WIDTH + 13],
      0,
      "Down must excavate an earlier ore shelf even when the cargo bay is full",
    );
    assert.ok(cut.mined > landed.mined);
    assert.deepEqual(
      cut.inventory,
      priorCargo,
      "discarded ore must not overfill cargo",
    );
    assert.equal(
      cut.money,
      state.money,
      "discarded ore must not turn into credits",
    );
    assert.equal(
      cut.deepest,
      peak,
      "the new cut is above the expedition's previous maximum depth",
    );
    await page.clock.runFor(120);
    // Our normal Save reads replace transient service text with "saved".
    // The persistent full-cargo warning must still explain that ore is lost.
    assert.match(
      await page.locator("#message").innerText(),
      /cargo full.*(?:lost|discarded)/i,
    );
    await page.screenshot({ path: `${path}.png`, fullPage: true });
    await writeFile(`${path}.json`, JSON.stringify(trace, null, 2));
    return cut;
  } catch (error) {
    await writeFile(`${path}-failure.json`, JSON.stringify(trace, null, 2));
    await page
      .screenshot({ path: `${path}-failure.png`, fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await controls([]);
    await page.clock.resume();
    await pause(page);
  }
}
export async function canvasTap(page, cdp, rect) {
  const box = await page.locator("canvas").boundingBox();
  const point = {
    id: 7,
    x: box.x + rect.x + rect.width / 2,
    y: box.y + rect.y + rect.height / 2,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
export async function canvasGeometry(page, id, selected = 0) {
  const box = await page.locator("canvas").boundingBox();
  return {
    ...stationLayout(box.width, box.height, id, selected),
    opener: nearbyPromptRect(box.width, box.height),
  };
}
export async function runCoreSmoke(page, base) {
  await ready(page, base);
  assert.equal(
    await page
      .locator(
        "#station-toggle,#station-panel,#sell,#refuel,#repair,button[id^='upgrade-']",
      )
      .count(),
    0,
    "building transactions must live in the game canvas",
  );
  await pause(page);
  const untouched = await savedState(page);
  await page.keyboard.press("Enter");
  assert.ok(
    !(await page.evaluate(() => document.body.dataset.station)),
    "Enter far from any building must not open a menu",
  );
  const afterEnter = await savedState(page);
  assert.equal(afterEnter.money, untouched.money);
  assert.equal(afterEnter.fuel, untouched.fuel);
  assert.deepEqual(afterEnter.inventory, untouched.inventory);
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
    () => parseInt(document.querySelector("#depth").textContent, 10) === 0,
  );
  await page.keyboard.up("ArrowUp");
  // Actually travel from the mined shaft to the exchange. The normal Save
  // output lets the driver steer; there is no direct game-state test API.
  await driveToStation(page, "exchange");
  const beforeSale = await readState(page);
  assert.ok(
    beforeSale.inventory.length >= 2,
    "opening a station must not also buy/sell",
  );
  const saleBefore = await rawState(page);
  await page.keyboard.press("Enter");
  await written(page, saleBefore);
  const sold = await readState(page);
  assert.equal(
    sold.money,
    mined.money + mined.inventory.reduce((n, ore) => n + VALUES[ore], 0),
  );
  assert.deepEqual(sold.inventory, []);
  await page.screenshot({
    path: "artifacts/exchange-keyboard.png",
    fullPage: true,
  });
  await stationClose(page);
  // Earned-credit fixtures keep each remaining station check short. Every
  // transaction still goes through the canvas menu at the matching building.
  let service = fixture({
    x: 2,
    money: 2000,
    fuel: 4,
    hull: 5,
    inventory: [3, 9, 10],
  });
  await importState(page, service);
  service = await stationBuy(page, "exchange");
  await importState(page, { ...service, x: 7, y: 3.15 });
  service = await stationBuy(page, "fuel");
  await importState(page, { ...service, x: 16, y: 3.15 });
  service = await stationBuy(page, "repair");
  await importState(page, { ...service, x: 21, y: 3.15 });
  await stationBuy(page, "upgrades", 0);
  await stationBuy(page, "upgrades", 4);
  const upgraded = await savedState(page);
  assert.equal(upgraded.fuel, 10);
  assert.equal(upgraded.hull, 10);
  assert.equal(upgraded.upgrades.drill, 1);
  assert.equal(upgraded.upgrades.engine, 1);
  assert.equal(upgraded.money, 609);
  await page.reload();
  await page.locator("canvas").waitFor();
  await pause(page);
  assert.deepEqual(await readState(page), upgraded);
  await stationOpen(page, "upgrades");
  await page.screenshot({
    path: "artifacts/desktop-station.png",
    fullPage: true,
  });
  await stationClose(page);
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
export async function rendered(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
export async function runMobileStationChecks(page, cdp, path) {
  for (const [label, viewport, selected] of [
    ["portrait", { width: 393, height: 851 }, 0],
    ["small-landscape", { width: 568, height: 320 }, 1],
  ]) {
    try {
      await page.setViewportSize(viewport);
      await importState(page, fixture({ x: 21, money: 10000 }));
      await pause(page, false);
      await rendered(page);
      await assertMobileLayout(page);
      let layout = await canvasGeometry(page, "upgrades");
      await canvasTap(page, cdp, layout.opener);
      await page.waitForFunction(
        () => document.body.dataset.station === "upgrades",
      );
      await rendered(page);
      await settled(page);
      assert.equal(
        (await readState(page)).money,
        10000,
        "opening a building by touch must not also purchase",
      );
      assert.equal(await page.locator("#money").innerText(), "$10,000");
      layout = await canvasGeometry(page, "upgrades");
      if (selected) {
        assert.ok(
          layout.next,
          "compact upgrade menu must provide touch navigation",
        );
        await canvasTap(page, cdp, layout.next);
        await rendered(page);
        layout = await canvasGeometry(page, "upgrades", selected);
      }
      const action = selected ? "tank" : "drill";
      const button = layout.actions.find((item) => item.action === action).rect;
      const box = await page.locator("canvas").boundingBox();
      assert.ok(
        button.y >= 0 &&
          button.y + button.height <= box.height &&
          button.height >= 40,
        "station purchase target must fit the canvas",
      );
      const purchaseBefore = await rawState(page);
      await canvasTap(page, cdp, button);
      await written(page, purchaseBefore);
      const bought = await readState(page);
      assert.equal(bought.upgrades[action], 1);
      assert.equal(bought.money, 9250);
      await page.screenshot({
        path: `${path}-station-${label}.png`,
        fullPage: true,
      });
      layout = await canvasGeometry(page, "upgrades", selected);
      await canvasTap(page, cdp, layout.close);
      await page.waitForFunction(() => !document.body.dataset.station);
      await rendered(page);
      await pause(page);
      await assertMobileLayout(page);
      const closed = await savedState(page);
      assert.equal(
        closed.x,
        21,
        "menu input must not leave a movement key held",
      );
    } catch (error) {
      await page
        .screenshot({
          path: `${path}-station-${label}-failure.png`,
          fullPage: true,
        })
        .catch(() => {});
      const diagnostic = {
        label,
        state: await readState(page).catch(() => undefined),
        canvas: await page.locator("canvas").boundingBox(),
        station: await page.evaluate(() => document.body.dataset.station),
      };
      await writeFile(
        `${path}-station-${label}-failure.json`,
        JSON.stringify(diagnostic, null, 2),
      );
      throw error;
    }
  }
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
  await runMobileStationChecks(page, cdp, path);
  assert.deepEqual(errors, []);
  return { context, page, cdp };
}
