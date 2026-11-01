import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { campaignTileSize } from "../src/campaign/layout.ts";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  closeOverlay,
  command,
  exportCheckpoint,
  freeze,
  importCheckpoint,
  keys,
  menu,
  noErrors,
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
function abovePart(checkpoint, id, completed = [1]) {
  // Imported fixtures shorten deep travel; recovery still uses native drilling.
  const fixture = structuredClone(checkpoint);
  const state = fixture.state;
  state.progress.beacon = true;
  state.progress.bankedOre = 3;
  state.progress.completed = completed;
  state.credits = 20000;
  state.vehicle.energy = 10;
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
  await page.keyboard.press("e");
  await tab(page, "lander");
  await command(page, "milestone");
  await closeOverlay(page);
  await advance(page, 100);
}
async function geometry(page, viewport) {
  const boxes = await page
    .locator(".campaign-objective, #campaign-mission-signal")
    .evaluateAll((elements) =>
      elements.map((element) => {
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
      "#campaign-signal-target, #campaign-signal-distance, #campaign-signal-proximity, #campaign-objective-next",
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
        assert.equal((await signal(page)).id, "W01-BEACON");
        assert.match((await signal(page)).text, /wreck|survey|beacon/i);
        await geometry(page, viewport);
        await descendUntil(
          page,
          async () => (await signal(page)).band === "close",
        );
        const approaching = await signal(page);
        assert.equal(approaching.id, "W01-BEACON");
        assert.equal(
          approaching.markerVisible,
          true,
          "Nearby mission radio pin is visible",
        );
        assert.match(approaching.action, /survey|approach|wreck|beacon/i);
        await screenshot(page, `${path}-${label}-beacon-approach.png`);
        await descendUntil(
          page,
          async () =>
            Number.parseInt(
              await page.locator("#campaign-depth").innerText(),
            ) >= 80,
        );
        assert.equal((await signal(page)).id, "W01-BEACON");
        assert.ok((await signal(page)).landmarks.includes("W01-BEACON"));
        await screenshot(page, `${path}-${label}-beacon-visible-approach.png`);
        await descendUntil(
          page,
          async () => (await signal(page)).id !== "W01-BEACON",
        );
        const surveyed = await state(page);
        assert.equal(surveyed.state.progress.beacon, true);
        assert.equal((await signal(page)).id, "W01-LANDER");
        assert.equal(
          (await signal(page)).sourceMarkers.includes("W01-BEACON"),
          false,
        );
        assert.equal(
          (await signal(page)).landmarks.includes("W01-BEACON"),
          true,
          "Survey completion leaves a recognizable physical wreck",
        );
        await screenshot(page, `${path}-${label}-surveyed-wreck.png`);
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
          `native ${label} beacon survey, physical wrecks, part recovery and banking guidance`,
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
  if (chosen("fog")) {
    const viewport = { width: 1440, height: 900 };
    const { context, page } = await ready(browser, base, { viewport });
    try {
      await freeze(page);
      const initial = await state(page);
      await menu(page);
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
      assert.equal((await signal(page)).id, "W01-BEACON");
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

      const critical = abovePart(initial, "W01-VALVE");
      critical.state.vehicle.energy = 2;
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
        window.__poiObserver = new MutationObserver(
          () => window.__poiMutations++,
        );
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
        "Danger states suppress new proximity announcements",
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
