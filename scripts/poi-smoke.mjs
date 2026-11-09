import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { HARDWARE_PRICES, W01 } from "../src/campaign/config.ts";
import { campaignTileSize } from "../src/campaign/layout.ts";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  command,
  exportCheckpoint,
  finishPresentation,
  freeze,
  importCheckpoint,
  keys,
  menu,
  noErrors,
  pauseSection,
  ready,
  tab,
} from "./campaign-smoke.mjs";

const screens = [
  ["desktop", { width: 1440, height: 900 }],
  ["portrait", { width: 393, height: 851 }],
  ["landscape", { width: 568, height: 320 }],
];
const tileIndex = (x, y) =>
  Math.floor(y) * 40 + (((Math.floor(x) % 40) + 40) % 40);
function clearCell(state, x, y) {
  if (y < 0 || y >= 60) return;
  const world = state.worlds.W01;
  const index = tileIndex(x, y);
  world.tiles[index] = 0;
  for (const item of world.packages)
    if (item.status === "deposit" && tileIndex(item.x, item.y) === index)
      item.status = "exposed";
}
/** Rank-1 drill and tank, as the M2 leg needs them to cross the 310 m plate. */
function fitStageTwoHardware(state) {
  for (const key of ["drill", "energy"]) {
    if (state.hardware[key] >= 1) continue;
    state.hardware[key] = 1;
    state.purchases.push({
      id: `CORE-1-${key.toUpperCase()}`,
      paid: HARDWARE_PRICES[key][1],
      balanceVersion: "0.3",
    });
  }
}
function abovePart(checkpoint, id, completed = [1]) {
  // Imported fixtures shorten deep travel; recovery still uses native drilling.
  // They start past the D14 wreck survey so the parts stay the M2 targets.
  const fixture = structuredClone(checkpoint);
  const state = fixture.state;
  state.progress.beacon = true;
  state.progress.bankedOre = 3;
  state.progress.completed = completed;
  state.credits = 20000;
  // The rank-0 10 L tank now reads "Turn back" at the 250 m valve (the return
  // reserve counts the whole climb), so deep fixtures carry the M2 loadout.
  fitStageTwoHardware(state);
  state.vehicle.energy = 16;
  state.vehicle.hull = 10;
  const part = state.worlds.W01.missions.find((item) => item.id === id);
  assert.ok(part, "Fixture uses an actual mission source");
  state.vehicle.x = part.x;
  state.vehicle.y = Math.floor(part.y) - 0.36;
  for (let x = Math.floor(part.x) - 1; x <= Math.floor(part.x) + 1; x++)
    for (let y = Math.floor(part.y) - 2; y < Math.floor(part.y); y++)
      clearCell(state, x, y);
  state.worlds.W01.discovered.fill(1);
  return fixture;
}
async function signal(page) {
  return page.locator("#campaign-mission-signal").evaluate((element) => {
    const host = document.querySelector("#campaign-game");
    return {
      id: element.dataset.target,
      band: element.dataset.band,
      text: element.textContent,
      distance: document.querySelector("#campaign-signal-distance").textContent,
      action: document.querySelector("#campaign-objective-next").textContent,
      landmarks: (host.dataset.poiLandmarks || "").split(",").filter(Boolean),
      sourceMarkers: (host.dataset.poiSourceMarkers || "")
        .split(",")
        .filter(Boolean),
      markerVisible: host.dataset.poiMarkerVisible === "true",
      markerX: Number(host.dataset.poiMarkerX),
      markerY: Number(host.dataset.poiMarkerY),
      targetKnown: host.dataset.poiTargetKnown === "true",
      targetVisible: host.dataset.poiTargetVisible === "true",
    };
  });
}
async function restore(page, checkpoint) {
  await keys(page, []);
  await importCheckpoint(page, checkpoint);
  await closeOverlay(page);
  await advance(page, 250);
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignPaused),
    "false",
    "Native Resume starts the fixture before piloting",
  );
}
async function state(page, resume = true) {
  const checkpoint = await exportCheckpoint(page);
  if (resume) {
    await closeOverlay(page);
    await advance(page, 50);
  }
  return checkpoint;
}
async function descendUntil(page, predicate, limit = 16000) {
  await keys(page, ["ArrowDown"]);
  for (let elapsed = 0; elapsed < limit; elapsed += 250) {
    await advance(page, 250);
    if (await predicate()) {
      await keys(page, []);
      return;
    }
  }
  await keys(page, []);
  throw new Error("Native drilling did not reach the mission condition");
}
async function bankAtLander(page, checkpoint) {
  // Return travel is fixture-assisted; the service transaction remains native.
  const fixture = structuredClone(checkpoint);
  fixture.state.vehicle.x = 5.5;
  fixture.state.vehicle.y = -0.36;
  await restore(page, fixture);
  await page.keyboard.press("e");
  await tab(page, "service");
  await command(page, "bank");
  await closeOverlay(page);
  await advance(page, 100);
}
async function payStage(page) {
  // E (interact) is debounced for 300 ms of game time, and the frozen clock
  // barely moves between banking and paying; use the visible Dock button.
  await click(page, "#campaign-dock-toggle");
  await tab(page, "lander");
  await command(page, "milestone");
  await closeOverlay(page);
  await finishPresentation(page);
  await advance(page, 100);
}
async function geometry(page, viewport) {
  // The locator row (#campaign-mission-signal) is display:none by design since
  // the HUD rework: the world target/HOME label carries the bearing and the
  // objective chip keeps one live goal. Check what is actually shown.
  const boxes = await page
    .locator(
      ".campaign-objective, #campaign-target-beacon:not([hidden]), #campaign-home-beacon:not([hidden])",
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length)
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            name: element.id || element.className,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        }),
    );
  assert.ok(boxes.length >= 2, "Objective and a world guidance label show");
  for (const box of boxes)
    assert.ok(
      box.width > 0 &&
        box.height > 0 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      "Mission guidance fits " + JSON.stringify(box),
    );
  const sizes = await page
    .locator(
      "#campaign-objective-title, #campaign-objective-progress, .world-beacon:not([hidden])",
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.id,
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      })),
    );
  for (const text of sizes)
    assert.ok(text.size >= 12, text.id + " remains readable at 12 CSS px");
  const overlaps = await page.evaluate(() => {
    const mission = document
      .querySelector(".campaign-objective")
      .getBoundingClientRect();
    return Array.from(
      document.querySelectorAll(
        ".campaign-hud, #campaign-menu-toggle, .campaign-toolbar",
      ),
    ).some((element) => {
      const other = element.getBoundingClientRect();
      return (
        mission.x < other.right &&
        mission.right > other.x &&
        mission.y < other.bottom &&
        mission.bottom > other.y
      );
    });
  });
  assert.equal(overlaps, false, "Mission guide does not cover HUD controls");
}
async function screenshot(page, path) {
  await page.screenshot({ path });
}
const rig = (page) =>
  page.locator("#campaign-game").evaluate((element) => ({
    x: Number(element.dataset.rigWorldX),
    y: Number(element.dataset.rigWorldY),
  }));
const wrapDelta = (from, to) => ((to - from + 60) % 40) - 20;
/**
 * Native proportional steering toward a world column, reading the scene's
 * rig position; `done` may end the approach early (e.g. a survey).
 */
async function steerTo(page, column, done = async () => false, limit = 15000) {
  let previous;
  for (let elapsed = 0; elapsed < limit;) {
    if (await done()) {
      await keys(page, []);
      return;
    }
    const point = await rig(page),
      d = wrapDelta(point.x, column);
    const velocity = previous
      ? wrapDelta(previous.x, point.x) / previous.seconds
      : 0;
    if (Math.abs(d) < 0.15 && Math.abs(velocity) < 0.5) {
      await keys(page, []);
      return;
    }
    const correction = Math.max(-3, Math.min(3, d * 2.5)) - velocity;
    await keys(
      page,
      correction < -0.2
        ? ["ArrowLeft"]
        : correction > 0.2
          ? ["ArrowRight"]
          : [],
    );
    const ms = Math.abs(d) > 4 ? 200 : Math.abs(d) > 1.5 ? 100 : 25;
    previous = { x: point.x, seconds: ms / 1000 };
    await advance(page, ms);
    elapsed += ms;
  }
  await keys(page, []);
  throw new Error(
    "Native steering did not reach column " +
      column +
      ": " +
      JSON.stringify(await rig(page)),
  );
}
/** Holds Down until the rig's world row reaches `row`, then lets the cut end. */
async function drillToRow(page, row, limit = 60000) {
  await keys(page, ["ArrowDown"]);
  for (let elapsed = 0; elapsed < limit; elapsed += 100) {
    await advance(page, 100);
    if ((await rig(page)).y >= row + 0.5) {
      await keys(page, []);
      await advance(page, 900);
      return;
    }
  }
  await keys(page, []);
  throw new Error(
    "Native drilling did not reach row " +
      row +
      ": " +
      JSON.stringify(await rig(page)),
  );
}
/**
 * The start of the M2 leg (D14): M1 built after the seam-A haul, wreck not
 * yet surveyed, rank-1 drill and tank fitted, parked at the lander. Terrain
 * and discovery are the claim's own; nothing is pre-dug or revealed.
 */
function stageTwoStart(checkpoint) {
  const fixture = structuredClone(checkpoint);
  const state = fixture.state;
  state.progress.completed = [1];
  state.progress.bankedOre = 7;
  state.progress.beacon = false;
  state.credits = Math.max(state.credits, 2000);
  fitStageTwoHardware(state);
  // The claim as the M1 haul left it: marked seam A dug out and sold.
  for (const item of state.worlds.W01.packages)
    if (/^W01:deposit:[0-6]:20$/.test(item.id)) {
      item.status = "sold";
      state.worlds.W01.tiles[tileIndex(item.x, item.y)] = 0;
    }
  state.vehicle = { x: 5.5, y: -0.36, energy: 16, hull: 10, reserve: 0 };
  return fixture;
}
/** Records the survey notice even if a later notice replaces it at once. */
async function watchSurvey(page) {
  await page.evaluate(() => {
    window.__beaconSurveyed = false;
    window.__surveyObserver?.disconnect();
    const message = document.querySelector("#campaign-message");
    window.__surveyObserver = new MutationObserver(() => {
      if (/wreck beacon surveyed/i.test(message.textContent))
        window.__beaconSurveyed = true;
    });
    window.__surveyObserver.observe(message, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  return () => page.evaluate(() => window.__beaconSurveyed);
}

export async function runPoiSmoke(
  browser,
  base,
  path = "artifacts/mission-poi",
  selection = process.env.POI_CHECKS || "all",
) {
  await mkdir("artifacts", { recursive: true });
  const checks = [];
  const chosen = (name) =>
    selection === "all" || selection.split(",").includes(name);
  const pass = (name) => {
    checks.push(name);
    console.log("Passed: " + name);
  };
  const selectedViewports = (
    process.env.POI_VIEWPORTS || "desktop,portrait,landscape"
  ).split(",");
  if (chosen("visual"))
    for (const [label, viewport] of screens.filter(([name]) =>
      selectedViewports.includes(name),
    )) {
      const { context, page } = await ready(browser, base, {
        viewport,
        isMobile: label !== "desktop",
        hasTouch: label !== "desktop",
        deviceScaleFactor: 1,
      });
      try {
        await freeze(page);
        await advance(page, 100);
        const initial = await state(page);
        // D14: M1 is the marked seam-A haul; the 95 m cell has no beacon.
        assert.equal((await signal(page)).id, "W01-SEAM-A");
        assert.match((await signal(page)).text, /seam/i);
        await geometry(page, viewport);
        await descendUntil(
          page,
          async () => (await signal(page)).band === "close",
        );
        const approaching = await signal(page);
        assert.equal(approaching.id, "W01-SEAM-A");
        assert.equal(
          approaching.markerVisible,
          true,
          "Nearby mission radio pin is visible",
        );
        assert.match(approaching.action, /seam A|mine/i);
        await screenshot(page, `${path}-${label}-seam-approach.png`);
        await descendUntil(
          page,
          async () => (await signal(page)).id === "W01-LANDER",
        );
        const hauled = await state(page);
        assert.equal(
          hauled.state.worlds.W01.packages.filter(
            (item) => item.status === "carried",
          ).length,
          7,
          "A full seam-A hold turns the guide home",
        );
        assert.equal(hauled.state.progress.beacon, false);
        assert.equal(
          (await signal(page)).landmarks.includes("W01-BEACON"),
          false,
          "The 95 m route cell no longer draws a beacon",
        );
        await screenshot(page, `${path}-${label}-seam-haul.png`);
        await geometry(page, viewport);

        // The antenna dive: the part, then the wreck beacon 70 m away on the
        // same dive (a survey carries nothing). Deep travel is shortened to
        // the antenna level; drilling, discovery and the survey are native.
        const dive = stageTwoStart(initial);
        for (const mission of dive.state.worlds.W01.missions)
          if (mission.id === "W01-VALVE") mission.status = "banked";
        dive.state.vehicle.x = 20.5;
        dive.state.vehicle.y = W01.antennaRow - 1 - 0.36;
        for (let y = W01.antennaRow - 3; y < W01.antennaRow; y++)
          clearCell(dive.state, 20.5, y);
        await restore(page, dive);
        assert.equal((await signal(page)).id, "W01-ANTENNA");
        await drillToRow(page, W01.antennaRow);
        await keys(page, ["ArrowRight"]);
        for (
          let elapsed = 0;
          elapsed < 8000 && (await signal(page)).id === "W01-ANTENNA";
          elapsed += 100
        )
          await advance(page, 100);
        await keys(page, []);
        const wreckSignal = await signal(page);
        assert.equal(
          wreckSignal.id,
          "W01-BEACON",
          "The recovered antenna points to the nearby wreck, not home",
        );
        assert.match(wreckSignal.action, /survey|wreck|beacon/i);
        await steerTo(page, 20.5);
        await drillToRow(page, 43);
        await steerTo(
          page,
          W01.beaconX,
          async () => (await signal(page)).id !== "W01-BEACON",
        );
        const surveyed = await state(page);
        assert.equal(surveyed.state.progress.beacon, true);
        assert.equal(
          surveyed.state.worlds.W01.missions.find(
            (item) => item.id === "W01-ANTENNA",
          ).status,
          "carried",
        );
        assert.equal((await signal(page)).id, "W01-LANDER");
        assert.equal(
          (await signal(page)).sourceMarkers.includes("W01-BEACON"),
          false,
        );
        assert.equal(
          (await signal(page)).landmarks.includes("W01-BEACON"),
          true,
          "Survey completion leaves the physical beacon in the gallery",
        );
        await screenshot(page, `${path}-${label}-surveyed-wreck-beacon.png`);
        await geometry(page, viewport);

        const valve = abovePart(initial, "W01-VALVE");
        valve.state.worlds.W01.discovered.fill(0);
        valve.state.vehicle.y -= 3;
        const valveSource = valve.state.worlds.W01.missions.find(
          (item) => item.id === "W01-VALVE",
        );
        for (
          let x = Math.floor(valveSource.x) - 1;
          x <= Math.floor(valveSource.x) + 1;
          x++
        )
          for (
            let y = Math.floor(valveSource.y) - 4;
            y < Math.floor(valveSource.y) - 2;
            y++
          )
            clearCell(valve.state, x, y);
        await restore(page, valve);
        assert.equal((await signal(page)).id, "W01-VALVE");
        await descendUntil(
          page,
          async () => (await signal(page)).band === "at",
        );
        assert.equal((await signal(page)).id, "W01-VALVE");
        assert.equal((await signal(page)).band, "at");
        assert.match((await signal(page)).action, /excavat|drill|wreck/i);
        assert.ok((await signal(page)).landmarks.includes("W01-VALVE"));
        await screenshot(page, `${path}-${label}-pressure-assembly.png`);
        await descendUntil(
          page,
          async () => (await signal(page)).id === "W01-LANDER",
        );
        const carried = await state(page);
        assert.equal(
          carried.state.worlds.W01.missions.find(
            (item) => item.id === "W01-VALVE",
          ).status,
          "carried",
        );
        assert.equal(
          (await signal(page)).sourceMarkers.includes("W01-VALVE"),
          false,
        );
        await screenshot(
          page,
          `${path}-${label}-recovered-pressure-assembly.png`,
        );
        await bankAtLander(page, carried);
        const banked = await state(page);
        assert.equal(
          banked.state.worlds.W01.missions.find(
            (item) => item.id === "W01-VALVE",
          ).status,
          "banked",
        );
        assert.equal((await signal(page)).id, "W01-ANTENNA");
        await menu(page);
        await command(page, "load");
        await closeOverlay(page);
        await advance(page, 100);
        assert.equal(
          (await signal(page)).id,
          "W01-ANTENNA",
          "Reload cannot restore an old active source marker",
        );
        noErrors(page);
        pass(
          `native ${label} seam-A haul, antenna-and-wreck-beacon dive, part recovery and banking guidance`,
        );
      } finally {
        await context.close();
      }
    }
  if (chosen("progression")) {
    const { context, page } = await ready(browser, base);
    try {
      await freeze(page);
      const initial = await state(page);
      const antenna = abovePart(initial, "W01-ANTENNA");
      antenna.state.worlds.W01.missions.find(
        (item) => item.id === "W01-VALVE",
      ).status = "banked";
      await restore(page, antenna);
      assert.equal((await signal(page)).id, "W01-ANTENNA");
      await screenshot(page, `${path}-communications-wreck.png`);
      await descendUntil(
        page,
        async () => (await signal(page)).id === "W01-LANDER",
      );
      await bankAtLander(page, await state(page));
      assert.equal((await signal(page)).id, "W01-LANDER");
      await payStage(page);
      assert.equal((await signal(page)).id, "W01-Q");
      const afterM2 = await state(page);
      assert.deepEqual(afterM2.state.progress.completed, [1, 2]);
      const core = abovePart(afterM2, "W01-Q", [1, 2]);
      await restore(page, core);
      assert.equal((await signal(page)).id, "W01-Q");
      await screenshot(page, `${path}-navigation-capsule.png`);
      await descendUntil(
        page,
        async () => (await signal(page)).id === "W01-LANDER",
      );
      const carried = await state(page);
      assert.equal(
        carried.state.worlds.W01.missions.find((item) => item.id === "W01-Q")
          .status,
        "carried",
      );
      await bankAtLander(page, carried);
      await payStage(page);
      const restored = await state(page);
      assert.deepEqual(restored.state.progress.completed, [1, 2, 3]);
      assert.equal((await signal(page)).id, "W01-LANDER");
      assert.match((await signal(page)).action, /launch/i);
      assert.equal((await signal(page)).sourceMarkers.includes("W01-Q"), false);
      noErrors(page);
      pass(
        "mission POIs advance through actual antenna/core recovery, banking, M2/M3 payments and launch guidance",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("leg")) {
    // D14 acceptance and §9.4 "time to beacon": the M2 leg by native play,
    // from the lander to the wreck beacon in one dive with the rank-1 drill
    // and tank. Keyboard drilling and steering only; discovery comes from the
    // game's own refreshVisibility as the rig moves (no discovered.fill, no
    // radius reveal, no teleport). Worlds: the audit's fresh-w01 claim and
    // this run's own newly generated claim.
    const viewport = { width: 1440, height: 900 };
    const { context, page } = await ready(browser, base, { viewport });
    try {
      await freeze(page);
      const generated = await state(page);
      const audit = JSON.parse(
        await readFile(
          new URL(
            "../docs/art-audit/prototype/assets/fresh-w01.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const results = [];
      for (const [name, source] of [
        ["fresh-w01", audit],
        ["generated", generated],
      ]) {
        const fixture = stageTwoStart(source);
        const before = fixture.state.worlds.W01.discovered.reduce(
          (sum, cell) => sum + cell,
          0,
        );
        await restore(page, fixture);
        const surveyed = await watchSurvey(page);
        const start = await state(page);
        const wall = Date.now();
        await steerTo(page, 20.5);
        await drillToRow(page, 43);
        const atGallery = await state(page);
        assert.equal(
          atGallery.state.worlds.W01.missions.find(
            (item) => item.id === "W01-VALVE",
          ).status,
          "carried",
          "The route dive passes the valve room and recovers the valve",
        );
        assert.equal(atGallery.state.progress.beacon, false);
        // Steer to the beacon's column; the approach ends once the rig is
        // inside the survey radius, and the saved state must then agree.
        const beaconY = W01.beaconRow + 0.5;
        await steerTo(page, W01.beaconX, async () => {
          const point = await rig(page);
          return (
            Math.hypot(wrapDelta(point.x, W01.beaconX), point.y - beaconY) < 1.1
          );
        });
        const wallSeconds = (Date.now() - wall) / 1000;
        const end = await state(page, false);
        assert.equal(
          end.state.progress.beacon,
          true,
          "The wreck beacon answers: " + JSON.stringify(end.state.vehicle),
        );
        const discovered = end.state.worlds.W01.discovered.reduce(
          (sum, cell) => sum + cell,
          0,
        );
        assert.ok(
          discovered < 0.25 * 2400,
          "Native discovery only: " + discovered + " cells known",
        );
        const result = {
          world: name,
          seed: end.state.seed,
          gameSeconds: +(end.state.elapsed - start.state.elapsed).toFixed(2),
          gallerySeconds: +(
            atGallery.state.elapsed - start.state.elapsed
          ).toFixed(2),
          wallSeconds: +wallSeconds.toFixed(1),
          energyLeft: +end.state.vehicle.energy.toFixed(2),
          hull: end.state.vehicle.hull,
          rig: end.state.vehicle,
          discoveredBefore: before,
          discoveredAfter: discovered,
        };
        results.push(result);
        console.log("TIME_TO_BEACON " + JSON.stringify(result));
        await closeOverlay(page);
        await advance(page, 50);
        await screenshot(page, `${path}-leg-${name}-beacon.png`);
        // The survey notice may queue behind the gallery's discovery notice.
        for (
          let elapsed = 0;
          elapsed < 6000 && !(await surveyed());
          elapsed += 250
        )
          await advance(page, 250);
        assert.equal(await surveyed(), true, "The survey is announced");
      }
      await writeFile(
        `${path}-leg-time-to-beacon.json`,
        JSON.stringify(results, null, 2),
      );
      noErrors(page);
      pass(
        "native M2 leg: lander to the SITE-4 wreck beacon by drilling and steering, survey recorded, time to beacon written",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("fog")) {
    const viewport = { width: 1440, height: 900 };
    const { context, page } = await ready(browser, base, { viewport });
    try {
      await freeze(page);
      const initial = await state(page);
      await menu(page);
      // Accessibility settings moved to the pause menu's Settings section.
      await pauseSection(page, "systems");
      await page
        .locator('[data-setting="reducedMotion"]')
        .check({ force: true });
      await closeOverlay(page);
      const hidden = structuredClone(initial);
      hidden.state.vehicle = { x: 20.5, y: 5.64, energy: 10, hull: 10 };
      hidden.state.worlds.W01.discovered.fill(0);
      clearCell(hidden.state, 20, 5);
      await restore(page, hidden);
      const hiddenIndex = 7 * 40 + 21;
      const surveyed = await state(page);
      assert.equal(
        surveyed.state.worlds.W01.discovered[hiddenIndex],
        0,
        "The comparison deposit remains behind a wall",
      );
      const rig = await page.locator("#campaign-game").evaluate((host) => ({
        x: Number(host.dataset.rigScreenX),
        y: Number(host.dataset.rigScreenY),
      }));
      const tile = campaignTileSize(viewport.width, viewport.height);
      const clip = {
        x: Math.round(rig.x + tile * 0.5),
        y: Math.round(rig.y + (7 - hidden.state.vehicle.y) * tile),
        width: tile,
        height: tile,
      };
      const baselinePixels = await page.screenshot({ clip });
      const different = structuredClone(hidden);
      const template = different.state.worlds.W01.packages.find((item) =>
        item.itemId.endsWith("O4"),
      );
      different.state.worlds.W01.packages.push({
        ...template,
        id: "poi-hidden-ore-proof",
        x: 21.5,
        y: 7.5,
        status: "deposit",
        processedBy: [],
      });
      await restore(page, different);
      assert.equal((await signal(page)).id, "W01-SEAM-A");
      assert.deepEqual(
        await page.screenshot({ clip }),
        baselinePixels,
        "Mission signals cannot disclose hidden ore pixels",
      );
      const current = await state(page);
      await advance(page, 400);
      const idleWorld = await state(page);
      assert.deepEqual(
        idleWorld.state.worlds.W01.discovered,
        current.state.worlds.W01.discovered,
        "Radio guidance does not mark new terrain discovered while stationary",
      );

      const wrapped = abovePart(initial, "W01-VALVE");
      const valve = wrapped.state.worlds.W01.missions.find(
        (item) => item.id === "W01-VALVE",
      );
      valve.x = 0.5;
      wrapped.state.vehicle = { x: 39.5, y: 22.64, energy: 10, hull: 10 };
      for (const x of [37, 38, 39, 0, 1, 2])
        for (const y of [21, 22, 23]) clearCell(wrapped.state, x, y);
      await restore(page, wrapped);
      const before = await signal(page);
      assert.equal(before.id, "W01-VALVE");
      assert.match(
        await page.locator("#campaign-signal-direction").innerText(),
        /→|↘/,
      );
      await keys(page, ["ArrowRight"]);
      await advance(page, 700);
      await keys(page, []);
      const after = await signal(page);
      assert.equal(after.id, "W01-VALVE");
      assert.ok(after.landmarks.includes("W01-VALVE"));
      assert.equal(
        after.landmarks.filter((id) => id === "W01-VALVE").length,
        1,
      );
      assert.ok(
        after.markerX >= 0 && after.markerX <= viewport.width,
        "Wrapped local marker stays beside the visible wreck",
      );
      const crossed = await state(page);
      assert.ok(
        crossed.state.vehicle.x < 5,
        "Native steering actually crosses the world seam: " +
          JSON.stringify(crossed.state.vehicle),
      );
      await screenshot(page, `${path}-wrapped-pressure-assembly.png`);
      // The wrapped approach queues its own "At target" announcement; let it
      // play out so the danger window below only sees announcements it makes.
      await advance(page, 4000);

      const critical = abovePart(initial, "W01-VALVE");
      // 20 % of the fixture's 16 L tank, the ratio 2 L of 10 L used to be:
      // "Low energy" without the return reserve turning the locator home.
      critical.state.vehicle.energy = 3.2;
      critical.state.vehicle.hull = 1.5;
      await restore(page, critical);
      const warning = await page.locator("#campaign-danger").innerText();
      assert.match(warning, /low energy/i);
      assert.match(warning, /critical hull/i);
      const stationary = await signal(page);
      assert.equal(stationary.markerVisible, true);
      const markerClip = {
        x: Math.round(stationary.markerX - 29),
        y: Math.round(stationary.markerY - 6),
        width: 12,
        height: 12,
      };
      const stationaryMarker = await page.screenshot({ clip: markerClip });
      await page.evaluate(() => {
        window.__poiMutations = 0;
        window.__poiTexts = [];
        window.__poiObserver = new MutationObserver(() => {
          window.__poiMutations++;
          window.__poiTexts.push(
            document.querySelector("#campaign-message").textContent,
          );
        });
        window.__poiObserver.observe(
          document.querySelector("#campaign-message"),
          { childList: true, subtree: true, characterData: true },
        );
      });
      await advance(page, 1100);
      assert.deepEqual(
        await page.screenshot({ clip: markerClip }),
        stationaryMarker,
        "Reduced-motion guidance retains a visible static local marker",
      );
      assert.equal(
        await page.evaluate(() => window.__poiMutations),
        0,
        "Danger states suppress new proximity announcements: " +
          (await page.evaluate(() => JSON.stringify(window.__poiTexts))),
      );
      await page.evaluate(() => window.__poiObserver.disconnect());
      assert.equal(await page.locator("#campaign-danger").innerText(), warning);
      assert.equal(
        await page
          .locator("#campaign-danger")
          .evaluate((element) => getComputedStyle(element).opacity),
        "1",
      );
      await screenshot(page, `${path}-critical-signal-priority.png`);
      noErrors(page);
      pass(
        "mission signals preserve fog, wrap bearings, reduced-motion landmarks and critical warning priority",
      );
    } finally {
      await context.close();
    }
  }
  return checks;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    const checks = await runPoiSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
    );
    console.log("Mission POI browser checks passed: " + checks.length);
  } finally {
    await browser.close();
  }
}
