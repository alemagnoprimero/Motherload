import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  W01_GEAR,
} from "../src/campaign/config.ts";
import { W02_GEAR, W02_HAZARDS, W02_ORES } from "../src/campaign/frontier.ts";
import { campaignTileSize } from "../src/campaign/layout.ts";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  command,
  exportCheckpoint,
  freeze,
  idle,
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
const world = (checkpoint) =>
  checkpoint.state.worlds[checkpoint.state.currentWorld];
const indexOf = (mine, x, y) =>
  Math.floor(y) * mine.width +
  (((Math.floor(x) % mine.width) + mine.width) % mine.width);
const delta = (from, to, width) =>
  ((to - from + width * 1.5) % width) - width / 2;
const mission = (checkpoint, id) =>
  world(checkpoint).missions.find((item) => item.id === id);
const cryosamples = (checkpoint) =>
  world(checkpoint).packages.filter(
    (item) => item.itemId === "W02-O3" && item.tags.includes("cryosample"),
  );
const tutorial = (checkpoint) =>
  world(checkpoint).packages.find(
    (item) =>
      item.itemId === "W02-O3" &&
      !item.tags.includes("cryosample") &&
      Math.floor(item.x) === 24 &&
      Math.floor(item.y) === 24,
  );
function clearCell(checkpoint, x, y) {
  const mine = world(checkpoint);
  if (y < 0 || y >= mine.rows) return;
  const index = indexOf(mine, x, y);
  mine.tiles[index] = 0;
  for (const item of mine.packages)
    if (item.status === "deposit" && indexOf(mine, item.x, item.y) === index)
      item.status = "exposed";
}
function above(checkpoint, source, { discovery = false } = {}) {
  const fixture = structuredClone(checkpoint);
  fixture.state.vehicle = {
    x: source.x,
    y: Math.floor(source.y) - 0.36,
    energy: HARDWARE_LEVELS.energy[fixture.state.hardware.energy],
    hull: HARDWARE_LEVELS.hull[fixture.state.hardware.hull],
  };
  delete world(fixture).volatile;
  for (let x = Math.floor(source.x) - 1; x <= Math.floor(source.x) + 1; x++)
    for (let y = Math.floor(source.y) - 2; y < Math.floor(source.y); y++)
      clearCell(fixture, x, y);
  world(fixture).discovered.fill(Number(discovery));
  return fixture;
}
function docked(checkpoint) {
  const fixture = structuredClone(checkpoint);
  fixture.state.vehicle.x = 5.5;
  fixture.state.vehicle.y = -0.36;
  return fixture;
}
function completedAsteroid(checkpoint) {
  const fixture = docked(checkpoint);
  fixture.state.credits = 1000000;
  fixture.state.vehicle.energy = 10;
  fixture.state.vehicle.hull = 10;
  fixture.state.progress = {
    ...fixture.state.progress,
    beacon: true,
    bankedOre: 3,
    completed: [1, 2, 3],
    unlockedWorlds: ["W01", "W02", "W03"],
    departed: false,
  };
  for (const item of fixture.state.worlds.W01.missions) item.status = "banked";
  return fixture;
}
function addTag(item, tag) {
  if (!item.tags.includes(tag)) item.tags.push(tag);
}
function fullTools(checkpoint) {
  // Validated fixtures supply late proof and ownership, not evidence of pacing.
  const fixture = structuredClone(checkpoint);
  const mine = world(fixture);
  mine.completed = [1, 2];
  for (const item of mine.missions)
    if (item.id.startsWith("W02-SAMPLE-")) item.status = "banked";
  for (const item of cryosamples(fixture).slice(0, 3)) {
    item.status = "banked";
    addTag(item, "intact");
  }
  for (const definition of [...W01_GEAR, ...W02_GEAR]) {
    if (!["W01-R2", "W02-R1", "W02-R2", "W02-R3"].includes(definition.id))
      continue;
    if (!fixture.state.ownedGear.includes(definition.id)) {
      fixture.state.ownedGear.push(definition.id);
      fixture.state.purchases.push({
        id: definition.id,
        paid: definition.price,
        balanceVersion: "0.1",
      });
    }
  }
  fixture.state.equipped = {
    drill: "W02-R1",
    mobility: "W01-R2",
    processor: "W02-R3",
    utilities: ["W02-R2"],
  };
  for (const key of Object.keys(fixture.state.hardware)) {
    for (let rank = fixture.state.hardware[key] + 1; rank <= 2; rank++)
      fixture.state.purchases.push({
        id: `CORE-${rank}-${key.toUpperCase()}`,
        paid: HARDWARE_PRICES[key][rank],
        balanceVersion: "0.1",
      });
    fixture.state.hardware[key] = 2;
  }
  fixture.state.credits = 1000000;
  return fixture;
}
async function close(page, advanceMs = 50) {
  const overlay = await page.evaluate(
    () => document.body.dataset.campaignOverlay,
  );
  if (!overlay) {
    if (advanceMs) await advance(page, advanceMs);
    return;
  }
  const dialog = page.locator("#campaign-" + overlay);
  const closed = dialog.evaluate(
    (element) =>
      new Promise((resolve) =>
        element.addEventListener("close", resolve, { once: true }),
      ),
  );
  await closeOverlay(page);
  await closed;
  if (advanceMs) await advance(page, advanceMs);
}
async function play(page, advanceMs = 50) {
  // After an import the menu insists on Resume; a map opened from it comes
  // back once more after Resume (the menu reopened over it), so allow a few
  // closes before asserting that play actually resumed.
  let closed = false;
  for (let n = 0; n < 6; n++) {
    if (!(await page.evaluate(() => document.body.dataset.campaignOverlay)))
      break;
    await close(page, 0);
    closed = true;
  }
  // A sale, install or construction now plays a short paused receipt beat in
  // the first frame after its terminal closes; let it finish instead of
  // skipping it. Callers that pass 0 keep exact control of game time.
  let remaining = advanceMs;
  if (closed && advanceMs) {
    await advance(page, 50);
    remaining = Math.max(0, advanceMs - 50);
    for (
      let elapsed = 0;
      elapsed < 6000 &&
      ((await page.locator("#campaign-reward").isVisible()) ||
        (await page.locator("#campaign-launch").isVisible()));
      elapsed += 50
    ) {
      await advance(page, 50);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (remaining) await advance(page, remaining);
  // The HUD publishes the end of that beat on the next frame.
  for (
    let n = 0;
    closed &&
    advanceMs &&
    n < 20 &&
    (await page.evaluate(() => document.body.dataset.campaignPaused)) ===
      "true";
    n++
  )
    await advance(page, 50);
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignPaused),
    "false",
    "Explicit native Resume / Undock starts the expedition: " +
      JSON.stringify(
        await page.evaluate(() => ({
          ...document.body.dataset,
          reward: !document.getElementById("campaign-reward").hidden,
          launch: !document.getElementById("campaign-launch").hidden,
        })),
      ),
  );
}
async function snapshot(page, resume = true) {
  await keys(page, []);
  const checkpoint = await exportCheckpoint(page);
  if (resume) await play(page);
  return checkpoint;
}
async function restore(page, checkpoint, resume = true) {
  await keys(page, []);
  await importCheckpoint(page, checkpoint);
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignPaused),
    "true",
    "Imported expeditions remain paused",
  );
  if (resume) await play(page);
}
async function confirm(page, accept = true) {
  const dialog = page.locator("#campaign-confirm");
  assert.equal(
    await dialog.isVisible(),
    true,
    "Action uses an in-game confirmation",
  );
  const closed = dialog.evaluate(
    (element) =>
      new Promise((resolve) =>
        element.addEventListener("close", resolve, { once: true }),
      ),
  );
  await click(
    page,
    accept ? "#campaign-confirm-accept" : "#campaign-confirm-cancel",
  );
  await closed;
  await idle(page);
  await advance(page, 50);
  // Travel/build presentations pause simulation; finish the visible beat before
  // issuing the next independent action, rather than consuming it as Skip.
  for (let elapsed = 0; elapsed < 15000; elapsed += 50) {
    const destinationRendered = await page.evaluate(
      () =>
        document.getElementById("campaign-game").dataset.campaignWorld ===
        document.body.dataset.campaignWorld,
    );
    if (
      destinationRendered &&
      !(await page.locator("#campaign-reward").isVisible()) &&
      !(await page.locator("#campaign-launch").isVisible())
    )
      break;
    await advance(page, 50);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
async function enterDock(page) {
  await keys(page, []);
  // Interact commands are debounced for 300 ms of game time, and the frozen
  // clock barely moves between back-to-back terminal visits.
  await advance(page, 320);
  await page.keyboard.press("e");
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignOverlay),
    "dock",
  );
}
async function openMap(page) {
  const overlay = await page.evaluate(
    () => document.body.dataset.campaignOverlay,
  );
  if (overlay === "dock") await click(page, "#campaign-dock-navigation");
  else {
    await menu(page);
    await command(page, "map");
  }
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignOverlay),
    "map",
  );
}
async function travel(page, destination, { undock = true, cargo } = {}) {
  await openMap(page);
  await command(page, "travel-" + destination);
  const copy = await page.locator("#campaign-confirm-copy").innerText();
  assert.match(copy, /bank .*cargo packages.*mission objects/i);
  assert.match(copy, /energy.*hull.*free/i);
  if (cargo)
    assert.match(
      copy,
      new RegExp(
        "Bank " +
          cargo.packages +
          " cargo packages and " +
          cargo.missions +
          " mission objects",
      ),
    );
  await confirm(page);
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignOverlay),
    "dock",
    "Travel arrives in paused lander services",
  );
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignPaused),
    "true",
  );
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignWorld),
    destination,
  );
  if (undock) await play(page);
}
async function depart(page) {
  await enterDock(page);
  await tab(page, "lander");
  await command(page, "depart");
  await confirm(page);
  await advance(page, 2700);
  await play(page);
  assert.equal(
    (await snapshot(page)).state.progress.departed,
    true,
    "Frontier departure is recorded through the actual launch action",
  );
}
const position = (page) =>
  page.locator("#campaign-game").evaluate((element) => ({
    x: Number(element.dataset.rigWorldX),
    y: Number(element.dataset.rigWorldY),
    width: Number(element.dataset.worldWidth),
  }));
async function steerTo(page, target) {
  let previous;
  for (let n = 0; n < 550; n++) {
    const point = await position(page),
      d = delta(point.x, target, point.width);
    const velocity = previous
      ? delta(previous.x, point.x, point.width) / previous.seconds
      : 0;
    assert.ok(
      Number.isFinite(d),
      "Scene exposes the actual active world's coordinates",
    );
    if (Math.abs(d) < 0.12 && Math.abs(velocity) < 0.5) {
      await keys(page, []);
      await advance(page, 50);
      return;
    }
    const desired = Math.max(-4, Math.min(4, d * 2.5)),
      difference = desired - velocity;
    await keys(
      page,
      difference < -0.2
        ? ["ArrowLeft"]
        : difference > 0.2
          ? ["ArrowRight"]
          : [],
    );
    const ms = Math.abs(d) > 5 ? 250 : Math.abs(d) > 2 ? 100 : 25;
    previous = { x: point.x, seconds: ms / 1000 };
    await advance(page, ms);
  }
  throw new Error(
    "Native steering could not reach active-world column " +
      target +
      ": " +
      JSON.stringify(await position(page)),
  );
}
async function downUntil(page, predicate, max = 18000, step = 50) {
  await keys(page, ["ArrowDown"]);
  for (let elapsed = 0; elapsed < max; elapsed += step) {
    await advance(page, step);
    if (await predicate()) {
      await keys(page, []);
      return;
    }
  }
  await keys(page, []);
  throw new Error("Native drilling did not reach the W02 condition");
}
async function releaseCue(page, { keyboard = true, max = 12000 } = {}) {
  if (keyboard) await keys(page, ["ArrowDown"]);
  for (let elapsed = 0; elapsed < max; elapsed += 25) {
    await advance(page, 25);
    if (
      await page.evaluate(
        () => document.body.dataset.campaignVolatile === "release",
      )
    )
      return;
  }
  throw new Error("Native cut did not produce the visible release cue");
}
function releaseDuration(checkpoint) {
  return (world(checkpoint).generatorVersion ??
    checkpoint.state.generatorVersion) >= 2 &&
    (checkpoint.state.progress.volatileTraining ?? 0) < 3
    ? 1.5
    : 0.75;
}
async function returnAndBank(page, checkpoint) {
  // Deep return travel is fixture-assisted; banking remains a real UI action.
  await restore(page, docked(checkpoint));
  await enterDock(page);
  await tab(page, "service");
  await command(page, "bank");
}
async function fee(page, amount) {
  await tab(page, "lander");
  const before = await snapshot(page, false);
  await play(page);
  await enterDock(page);
  await tab(page, "lander");
  await command(page, "milestone");
  const after = await snapshot(page, false);
  assert.equal(
    before.state.credits - after.state.credits,
    amount,
    "Construction charges exactly " + amount / 10 + " CR",
  );
  await play(page);
  return after;
}
async function inViewport(page, selector, viewport, minimum = 0) {
  const element = page.locator(selector);
  assert.equal(await element.isVisible(), true, selector + " remains visible");
  const box = await element.boundingBox();
  assert.ok(
    box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    selector + " fits " + JSON.stringify(box),
  );
  if (minimum)
    assert.ok(
      box.width >= minimum && box.height >= minimum,
      selector + " retains a comfortable touch target",
    );
  return box;
}
async function layout(page, viewport, full = false) {
  assert.deepEqual(await page.locator("#campaign-game canvas").boundingBox(), {
    x: 0,
    y: 0,
    ...viewport,
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        !scrollX &&
        !scrollY,
    ),
    true,
    "Active gameplay never needs page scrolling",
  );
  for (const selector of [
    "#campaign-energy",
    "#campaign-hull",
    "#campaign-cargo",
    ".campaign-objective",
  ])
    await inViewport(page, selector, viewport);
  await inViewport(
    page,
    (await page.locator("#campaign-target-beacon").isVisible())
      ? "#campaign-target-beacon"
      : "#campaign-home-beacon",
    viewport,
  );
  await inViewport(page, "#campaign-menu-toggle", viewport, 44);
  assert.equal(
    await page.locator(".campaign-touch").isVisible(),
    false,
    "Floating joystick remains the default",
  );
  if (full)
    for (const selector of [
      "#campaign-precision-button",
      "[data-dir=mobility]",
      "#campaign-map-toggle",
    ])
      await inViewport(page, selector, viewport, 44);
  const overlapping = await page.evaluate(() => {
    const elements = [
      ...document.querySelectorAll(".campaign-toolbar > *"),
    ].filter(
      (element) =>
        element.getBoundingClientRect().width &&
        getComputedStyle(element).display !== "none",
    );
    return elements.some((element, index) =>
      elements.slice(index + 1).some((other) => {
        const a = element.getBoundingClientRect(),
          b = other.getBoundingClientRect();
        return (
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top
        );
      }),
    );
  });
  assert.equal(
    overlapping,
    false,
    "Attachments keep separate visible toolbar targets",
  );
}
async function warningRecovery(page, checkpoint, viewport, path) {
  const critical = structuredClone(checkpoint);
  critical.state.vehicle.energy = 2;
  critical.state.vehicle.hull = 1.5;
  await restore(page, critical);
  await inViewport(page, "#campaign-danger", viewport);
  assert.match(
    await page.locator("#campaign-danger").innerText(),
    /(?:low energy|energy critical|emergency reserve)[\s\S]*critical hull/i,
  );
  await page.screenshot({ path: path + "-warnings.png" });
  const disabled = structuredClone(critical);
  // This regression covers the ordinary paid recovery after the one-time
  // emergency tow. First-tow cargo protection has its own Phase 0 checks.
  disabled.state.progress.towsUsed = ["W02"];
  disabled.state.vehicle.energy = 0;
  disabled.state.vehicle.hull =
    HARDWARE_LEVELS.hull[disabled.state.hardware.hull] * 0.8;
  const carried = world(disabled).packages.find(
    (item) => item.tags.includes("ordinary") && item.status === "deposit",
  );
  clearCell(disabled, carried.x, carried.y);
  carried.status = "carried";
  const catalyst = mission(disabled, "W02-Q");
  catalyst.status = "carried";
  await restore(page, disabled, false);
  await close(page, 50);
  await inViewport(page, "#campaign-disabled-recover", viewport, 44);
  await click(page, "#campaign-disabled-recover");
  assert.match(
    await page.locator("#campaign-confirm-copy").innerText(),
    /cargo.*lost[\s\S]*mission/i,
  );
  await confirm(page);
  const recovered = await snapshot(page, false);
  assert.equal(recovered.state.currentWorld, "W02");
  assert.equal(recovered.state.vehicle.x, 5.5);
  assert.equal(
    recovered.state.vehicle.hull,
    disabled.state.vehicle.hull,
    "Recovery preserves hull already above half",
  );
  assert.equal(
    world(recovered).packages.find((item) => item.id === carried.id).status,
    "lost",
  );
  assert.equal(mission(recovered, "W02-Q").status, "source");
  await play(page);
}
async function climate(page, checkpoint, viewport, path) {
  // Contact fixtures shorten access to the authored off-route hazard pockets.
  const hazards = world(checkpoint).hazards ?? W02_HAZARDS;
  const pocket = hazards.coldPockets[0];
  const cold = above(checkpoint, { x: pocket.x, y: pocket.y + 1 });
  // A small fixture ledge holds contact for the full authored warning interval.
  world(cold).tiles[indexOf(world(cold), pocket.x, Math.floor(pocket.y) + 1)] =
    1;
  await restore(page, cold);
  await advance(page, 100);
  assert.equal(
    await page.locator("#campaign-extraction").getAttribute("data-mode"),
    "cold-warning",
  );
  await inViewport(page, "#campaign-extraction", viewport);
  await advance(page, 1600);
  assert.equal(
    await page.locator("#campaign-extraction").getAttribute("data-mode"),
    "cold",
  );
  await page.screenshot({ path: path + "-cold-pocket.png" });
  const source = hazards.vents[0];
  const vent = above(checkpoint, { x: source.x, y: source.y + 1 });
  world(vent).tiles[indexOf(world(vent), source.x, Math.floor(source.y) + 1)] =
    1;
  await restore(page, vent);
  await advance(page, 100);
  const hit = await snapshot(page);
  assert.equal(
    hit.state.vehicle.hull,
    vent.state.vehicle.hull - 6,
    "A visible ice vent deals its single contact hit",
  );
  await advance(page, 400);
  assert.equal(
    (await snapshot(page)).state.vehicle.hull,
    hit.state.vehicle.hull,
    "Vent contact cooldown prevents immediate repeated damage",
  );
  await page.screenshot({ path: path + "-ice-vent.png" });
}

export async function runFrontierSmoke(
  browser,
  base,
  path = "artifacts/frontier",
  selection = process.env.FRONTIER_CHECKS || "all",
) {
  await mkdir("artifacts", { recursive: true });
  const checks = [],
    chosen = (name) =>
      selection === "all" || selection.split(",").includes(name);
  const pass = (name) => {
    checks.push(name);
    console.log("Passed: " + name);
  };
  const selected = (
    process.env.FRONTIER_VIEWPORTS || "desktop,portrait,landscape"
  ).split(",");
  let comet;
  const bootComet = async (page) => {
    if (comet) {
      await restore(page, comet);
      return;
    }
    const initial = await snapshot(page);
    await restore(page, completedAsteroid(initial));
    await depart(page);
    await travel(page, "W02");
    comet = await snapshot(page);
  };

  if (chosen("travel"))
    for (const [label, viewport] of screens.filter(([name]) =>
      selected.includes(name),
    )) {
      const { context, page } = await ready(browser, base, {
        viewport,
        isMobile: label !== "desktop",
        hasTouch: label !== "desktop",
        deviceScaleFactor: 1,
      });
      try {
        await freeze(page);
        const initial = await snapshot(page);
        const legacy = JSON.parse(
          await readFile(
            new URL("../tests/fixtures/improvement-w01.json", import.meta.url),
            "utf8",
          ),
        );
        legacy.state.schema = 1;
        legacy.state.vehicle = { x: 20.5, y: -0.36, energy: 10, hull: 10 };
        await restore(page, legacy, false);
        const migrated = await exportCheckpoint(page);
        assert.equal(migrated.state.schema, 3);
        for (const key of ["tiles", "missions"])
          assert.deepEqual(
            migrated.state.worlds.W01[key],
            legacy.state.worlds.W01[key],
            "Schema1 import preserves original " + key,
          );
        // Packages keep identity and stamped economics; display names now
        // resolve by item ID (Ironium → Slag iron), as the unit migration
        // test also expects.
        const economics = (packages) =>
          packages.map(({ name, ...item }) => item);
        assert.deepEqual(
          economics(migrated.state.worlds.W01.packages),
          economics(legacy.state.worlds.W01.packages),
          "Schema1 import preserves original packages",
        );
        assert.deepEqual(migrated.state.hardware, legacy.state.hardware);
        // The map now always opens: before W01 M2 it shows the surveyed claim
        // map instead of the star map, and comet travel stays locked.
        await command(page, "map");
        assert.equal(
          await page.evaluate(() => document.body.dataset.campaignOverlay),
          "map",
        );
        assert.equal(
          await page.locator("#campaign-claim-map").isVisible(),
          true,
          "Before W01 M2 the map opens on the claim, not the star map",
        );
        assert.equal(
          await page.locator("#campaign-map-worlds").isVisible(),
          false,
          "The initial star map remains gated by W01 M2",
        );
        const lockedTravel = page.locator('[data-command="travel-W02"]');
        assert.ok(
          !(await lockedTravel.count()) || (await lockedTravel.isDisabled()),
          "Ice comet travel stays locked before departure",
        );
        await play(page);
        const restored = completedAsteroid(initial);
        clearCell(restored, 7, 3);
        await restore(page, restored);
        await openMap(page);
        assert.equal(
          await page.locator('[data-command="travel-W02"]').isDisabled(),
          true,
          "Finishing M3 alone does not bypass actual departure",
        );
        await play(page);
        await depart(page);
        const launched = await snapshot(page);
        const cargo = launched.state.worlds.W01.packages.find(
          (item) => item.tags.includes("ordinary") && item.status === "deposit",
        );
        clearCell(launched, cargo.x, cargo.y);
        cargo.status = "carried";
        launched.state.vehicle.energy = 7.3;
        launched.state.vehicle.hull = 6.5;
        await restore(page, launched);
        await travel(page, "W02", { cargo: { packages: 1, missions: 0 } });
        const arrival = await snapshot(page);
        assert.equal(arrival.state.schema, 3);
        assert.equal(world(arrival).width, 48);
        assert.equal(world(arrival).rows, 100);
        assert.equal(arrival.state.vehicle.energy, 7.3);
        assert.equal(arrival.state.vehicle.hull, 6.5);
        assert.equal(
          arrival.state.worlds.W01.packages.find((item) => item.id === cargo.id)
            .status,
          "banked",
        );
        assert.equal(
          arrival.state.worlds.W01.tiles[
            indexOf(arrival.state.worlds.W01, 7, 3)
          ],
          0,
        );
        assert.equal(
          await page
            .locator("#campaign-game")
            .getAttribute("data-world-texture"),
          "campaign-w02",
        );
        assert.match(
          await page.locator("#campaign-objective-title").innerText(),
          /sample.*thermal seam/i,
        );
        assert.match(
          await page
            .locator("#campaign-mission-signal")
            .getAttribute("data-target"),
          /^W02-SAMPLE-/,
        );
        await layout(page, viewport);
        await page.screenshot({ path: `${path}-${label}-arrival.png` });
        comet ??= structuredClone(arrival);
        if (label !== "desktop") {
          const bay = await page
            .locator("#campaign-game")
            .evaluate((element) => ({
              x: Number(element.dataset.rigScreenX),
              y: Number(element.dataset.rigScreenY) - 20,
            }));
          await page.touchscreen.tap(bay.x, bay.y);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            "dock",
            "A native tap on the comet refuge opens its in-game services",
          );
          await play(page);
        }

        const seam = structuredClone(arrival);
        seam.state.vehicle.x = world(seam).width - 0.5;
        await restore(page, seam);
        await keys(page, ["ArrowRight"]);
        await advance(page, 550);
        await keys(page, []);
        assert.ok(
          (await position(page)).x < 4,
          "Native steering crosses the actual 48-column seam",
        );

        const back = docked(arrival),
          sample = mission(back, "W02-SAMPLE-1");
        const ordinary = world(back).packages.find(
          (item) => item.tags.includes("ordinary") && item.status === "deposit",
        );
        clearCell(back, ordinary.x, ordinary.y);
        ordinary.status = "carried";
        clearCell(back, sample.x, sample.y);
        sample.status = "carried";
        await restore(page, back);
        await travel(page, "W01", { cargo: { packages: 1, missions: 1 } });
        const asteroid = await snapshot(page);
        assert.equal(
          asteroid.state.worlds.W02.packages.find(
            (item) => item.id === ordinary.id,
          ).status,
          "banked",
        );
        assert.equal(
          asteroid.state.worlds.W02.missions.find(
            (item) => item.id === sample.id,
          ).status,
          "banked",
        );
        assert.equal(
          await page
            .locator("#campaign-game")
            .getAttribute("data-world-texture"),
          "campaign-w01",
          "Returning uses the asteroid atlas again",
        );
        assert.deepEqual(
          asteroid.state.worlds.W01.tiles,
          arrival.state.worlds.W01.tiles,
        );
        assert.deepEqual(asteroid.state.ownedGear, arrival.state.ownedGear);
        await travel(page, "W02");
        const revisit = await snapshot(page);
        assert.deepEqual(
          world(revisit).tiles,
          world(back).tiles,
          "Comet excavation persists across return travel",
        );
        assert.equal(mission(revisit, sample.id).status, "banked");
        await menu(page);
        await command(page, "save");
        await command(page, "load");
        const paused = await exportCheckpoint(page);
        await advance(page, 1400);
        assert.deepEqual(
          (await exportCheckpoint(page)).state,
          paused.state,
          "Reloaded two-world expeditions remain motionless until Resume",
        );
        await play(page);
        noErrors(page);
        pass(
          `${label}: schema1 migration, gated native departure/travel, automatic banking and persistent two-world claims`,
        );
      } finally {
        await context.close();
      }
    }

  if (chosen("economy")) {
    const { context, page } = await ready(browser, base);
    try {
      await freeze(page);
      await bootComet(page);
      const start = await snapshot(page);
      await steerTo(page, 24.5);
      // Balance 0.3 made frost iron and blue nickel bulk 1 (cryosilicate and
      // helion stay bulk 2): the starter column fills the 7-bulk hold at
      // 70 m, and the eighth package stays exposed in the cleared shaft.
      await downUntil(
        page,
        async () =>
          Number.parseInt(await page.locator("#campaign-depth").innerText()) >=
          80,
      );
      const mined = await snapshot(page);
      const carried = world(mined).packages.filter(
        (item) => item.status === "carried",
      );
      assert.equal(carried.length, 7);
      for (const item of carried)
        assert.equal(
          item.bulk,
          W02_ORES.find((ore) => ore.id === item.itemId).bulk,
          "Each comet package keeps its stamped bulk",
        );
      assert.match(
        await page.locator("#campaign-cargo").innerText(),
        /7\s*\/\s*7/,
      );
      assert.equal(
        world(mined).packages.find(
          (item) => Math.floor(item.x) === 24 && Math.floor(item.y) === 7,
        ).status,
        "exposed",
        "The package that no longer fits remains exposed",
      );
      await page.screenshot({ path: `${path}-native-early-mining.png` });
      await keys(page, ["ArrowUp"]);
      for (
        let elapsed = 0;
        elapsed < 14000 && (await position(page)).y > -0.5;
        elapsed += 50
      )
        await advance(page, 50);
      await keys(page, []);
      await advance(page, 2500);
      await steerTo(page, 5.5);
      await enterDock(page);
      await tab(page, "service");
      await command(page, "bank");
      await tab(page, "cargo");
      await command(page, "sell");
      const sold = await snapshot(page, false);
      assert.equal(
        sold.state.credits - start.state.credits,
        carried.reduce((sum, item) => sum + item.value, 0),
        "Native comet sale credits exactly the carried package values",
      );
      await play(page);
      await enterDock(page);
      await tab(page, "tools");
      await command(page, "gear-buy-W02-R1");
      await tab(page, "hardware");
      await command(page, "hardware-drill");
      await command(page, "hardware-drill");
      const upgraded = await snapshot(page);
      assert.equal(upgraded.state.hardware.drill, 2);
      assert.equal(upgraded.state.equipped.drill, "W02-R1");
      assert.ok(upgraded.state.ownedGear.includes("W02-R1"));
      assert.equal(
        sold.state.credits - upgraded.state.credits,
        W02_GEAR.find((gear) => gear.id === "W02-R1").price +
          HARDWARE_PRICES.drill[1] +
          HARDWARE_PRICES.drill[2],
      );
      assert.match(
        await page.locator("#campaign-drill-name").innerText(),
        /thermal auger/i,
      );
      await page.screenshot({ path: `${path}-thermal-rank2-rig.png` });
      noErrors(page);
      pass(
        "native early comet mining, stamped-bulk capacity, return/sale and active thermal/rank2 purchases (upgrade funding fixture-assisted)",
      );
    } finally {
      await context.close();
    }
  }

  if (chosen("volatile")) {
    const { context, page } = await ready(browser, base);
    try {
      await freeze(page);
      await bootComet(page);
      const fixture = above(comet, tutorial(comet));
      await restore(page, fixture);
      await releaseCue(page);
      await inViewport(
        page,
        "#campaign-release-drill",
        { width: 1440, height: 900 },
        44,
      );
      await page.screenshot({ path: `${path}-keyboard-release-cue.png` });
      await menu(page);
      await command(page, "save");
      const pending = await exportCheckpoint(page);
      assert.ok(
        world(pending).volatile.remaining > 0 &&
          world(pending).volatile.remaining <= releaseDuration(fixture),
      );
      assert.equal(
        world(pending).volatile.duration ?? 0.75,
        releaseDuration(fixture),
        "The stamped world selects its exact training/normal release window",
      );
      await advance(page, 2000);
      assert.deepEqual(
        (await exportCheckpoint(page)).state,
        pending.state,
        "Pause freezes the pending release deadline and rig condition",
      );
      await command(page, "load");
      await advance(page, 1600);
      const loaded = await exportCheckpoint(page);
      assert.deepEqual(
        world(loaded).volatile,
        world(pending).volatile,
        "Load retains the exact pending release window",
      );
      assert.equal(
        await page.evaluate(() => document.body.dataset.campaignPaused),
        "true",
      );
      await keys(page, []);
      await play(page, 0);
      await keys(page, ["ArrowDown"]);
      await advance(page, 100);
      const continued = await snapshot(page, false);
      assert.ok(
        world(continued).volatile.remaining <
          world(loaded).volatile.remaining &&
          world(continued).volatile.remaining > 0,
        "Only resumed active drilling spends the remaining deadline",
      );
      await play(page, 0);
      await keys(page, []);
      await advance(page, 50);
      const intact = await snapshot(page);
      assert.ok(tutorial(intact).tags.includes("intact"));
      assert.equal(tutorial(intact).status, "carried");
      assert.equal(world(intact).volatile, undefined);
      await restore(page, fixture);
      await releaseCue(page);
      await advance(page, releaseDuration(fixture) * 1000 + 100);
      await keys(page, []);
      const ruptured = await snapshot(page);
      assert.equal(tutorial(ruptured).status, "lost");
      assert.ok(tutorial(ruptured).tags.includes("ruptured"));
      await restore(page, fixture);
      await releaseCue(page);
      await keys(page, ["ArrowUp", "ArrowRight"]);
      await advance(page, 50);
      const takeoff = await snapshot(page);
      assert.ok(
        tutorial(takeoff).tags.includes("intact"),
        "Diagonal takeoff releases drilling and preserves the completed crystal",
      );
      await menu(page);
      await pauseSection(page, "controls");
      await page.locator('[data-setting="drillToggle"]').check({ force: true });
      await play(page);
      await restore(page, fixture);
      await page.keyboard.press("ArrowDown");
      await releaseCue(page, { keyboard: false });
      await click(page, "#campaign-release-drill");
      await advance(page, 50);
      assert.ok(
        tutorial(await snapshot(page)).tags.includes("intact"),
        "Explicit release also clears a toggled drill latch",
      );
      noErrors(page);
      pass(
        "keyboard volatile preservation/rupture, explicit toggle release and fair pending pause/save/load restoration",
      );
    } finally {
      await context.close();
    }
  }

  if (chosen("touch"))
    for (const [label, viewport] of screens.filter(
      ([name]) => name !== "desktop" && selected.includes(name),
    )) {
      const { context, page } = await ready(browser, base, {
        viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      });
      try {
        await freeze(page);
        await bootComet(page);
        const fitted = fullTools(comet),
          fixture = above(fitted, tutorial(fitted));
        await restore(page, fixture);
        await layout(page, viewport, true);
        const session = await context.newCDPSession(page);
        const center = {
          x: Math.round(viewport.width * 0.25),
          y: Math.round(viewport.height * 0.56),
        };
        const down = { x: center.x, y: center.y + 58 };
        const precisionBox = await page
          .locator("#campaign-precision-button")
          .boundingBox();
        const precision = {
          x: precisionBox.x + precisionBox.width / 2,
          y: precisionBox.y + precisionBox.height / 2,
        };
        const touch = (type, points) =>
          session.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points,
          });
        await touch("touchStart", [{ id: 1, ...center }]);
        await advance(page, 100);
        assert.equal(
          await page
            .locator("#campaign-game")
            .getAttribute("data-joystick-visible"),
          "true",
        );
        await touch("touchStart", [
          { id: 1, ...center },
          { id: 2, ...precision },
        ]);
        await touch("touchMove", [
          { id: 1, ...down },
          { id: 2, ...precision },
        ]);
        await advance(page, 50);
        assert.equal(
          await page
            .locator("#campaign-game")
            .getAttribute("data-precision-active"),
          "true",
        );
        assert.equal(
          Number(
            await page
              .locator("#campaign-game")
              .getAttribute("data-joystick-center-x"),
          ),
          center.x,
          "Second tool finger cannot steal the floating joystick center",
        );
        await releaseCue(page, { keyboard: false });
        await inViewport(page, "#campaign-extraction", viewport);
        await inViewport(page, "#campaign-release-drill", viewport, 44);
        await page.screenshot({
          path: `${path}-${label}-precision-release-cue.png`,
        });
        const geometry = await page.evaluate(
          (tile) => {
            const cue = document
                .querySelector("#campaign-extraction")
                .getBoundingClientRect(),
              host = document.querySelector("#campaign-game"),
              objective = document
                .querySelector(".campaign-objective")
                .getBoundingClientRect();
            const x = Number(host.dataset.rigScreenX),
              y = Number(host.dataset.rigScreenY);
            const rig = {
              left: x - tile * 0.8,
              right: x + tile * 0.8,
              top: y - tile * 0.6,
              bottom: y + tile * 0.6,
            };
            const overlaps = (a, b) =>
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top;
            return {
              cueRig: overlaps(cue, rig),
              missionRig: overlaps(objective, rig),
              cueMission: overlaps(cue, objective),
            };
          },
          campaignTileSize(viewport.width, viewport.height),
        );
        assert.equal(
          geometry.cueRig || geometry.missionRig || geometry.cueMission,
          false,
          "The volatile cue, mission panel and actual rig remain separate during active drilling: " +
            JSON.stringify(geometry),
        );
        await touch("touchMove", [
          { id: 1, ...center },
          { id: 2, ...precision },
        ]);
        await advance(page, 50);
        await touch("touchEnd", []);
        const preserved = await snapshot(page);
        assert.equal(tutorial(preserved).status, "carried");
        assert.ok(tutorial(preserved).tags.includes("intact"));
        assert.equal(tutorial(preserved).value, tutorial(fixture).value * 1.3);
        assert.deepEqual(tutorial(preserved).processedBy, ["W02-R3"]);
        await restore(page, fixture);
        await touch("touchStart", [{ id: 1, ...center }]);
        await advance(page, 100);
        await touch("touchMove", [{ id: 1, ...down }]);
        await releaseCue(page, { keyboard: false });
        await advance(page, releaseDuration(fixture) * 1000 + 100);
        await touch("touchEnd", []);
        const ruptured = await snapshot(page);
        assert.equal(tutorial(ruptured).status, "lost");
        assert.ok(tutorial(ruptured).tags.includes("ruptured"));
        await climate(page, fitted, viewport, `${path}-${label}`);
        await warningRecovery(page, fixture, viewport, `${path}-${label}`);
        noErrors(page);
        pass(
          `${label}: floating joystick + independent precision finger, intact/ruptured crystals, full toolbar, warnings and recovery`,
        );
      } finally {
        await context.close();
      }
    }

  if (chosen("milestones")) {
    const { context, page } = await ready(browser, base);
    try {
      await freeze(page);
      await bootComet(page);
      await enterDock(page);
      await tab(page, "tools");
      await command(page, "gear-buy-W02-R1");
      const stage = await snapshot(page);
      for (let n = 1; n <= 4; n++)
        mission(stage, "W02-SAMPLE-" + n).status = "banked";
      await restore(page, docked(stage));
      await enterDock(page);
      await tab(page, "lander");
      assert.equal(
        await page.locator('[data-command="milestone"]').isDisabled(),
        true,
        "Four samples do not fund M1",
      );
      await play(page);
      const sampleFixture = above(stage, mission(stage, "W02-SAMPLE-5"));
      await restore(page, sampleFixture);
      assert.equal(
        await page
          .locator("#campaign-mission-signal")
          .getAttribute("data-target"),
        "W02-SAMPLE-5",
      );
      assert.ok(
        (
          await page
            .locator("#campaign-game")
            .getAttribute("data-poi-landmarks")
        ).includes("W02-SAMPLE-5"),
      );
      await page.screenshot({ path: `${path}-sample-seam.png` });
      await downUntil(
        page,
        async () =>
          (await page
            .locator("#campaign-mission-signal")
            .getAttribute("data-target")) === "W02-LANDER",
      );
      const samples = await snapshot(page);
      assert.equal(mission(samples, "W02-SAMPLE-5").status, "carried");
      await returnAndBank(page, samples);
      const afterM1 = await fee(page, 4000);
      assert.deepEqual(world(afterM1).completed, [1]);
      await enterDock(page);
      await tab(page, "tools");
      await command(page, "gear-buy-W02-R2");
      const intactFixture = await snapshot(page);
      const eligible = cryosamples(intactFixture);
      for (const item of eligible.slice(0, 2)) {
        item.status = "banked";
        addTag(item, "intact");
      }
      tutorial(intactFixture).status = "banked";
      addTag(tutorial(intactFixture), "intact");
      await restore(page, docked(intactFixture));
      await enterDock(page);
      await tab(page, "lander");
      assert.equal(
        await page.locator('[data-command="milestone"]').isDisabled(),
        true,
        "Tutorial crystal cannot replace the third deep intact proof",
      );
      assert.match(
        await page.locator("#campaign-objective-progress").textContent(),
        /2\/3 banked/,
      );
      await play(page);
      const crystal = eligible[2],
        crystalFixture = above(intactFixture, crystal);
      await restore(page, crystalFixture);
      assert.equal(
        await page
          .locator("#campaign-mission-signal")
          .getAttribute("data-target"),
        crystal.id,
      );
      await page.screenshot({ path: `${path}-cryo-vein.png` });
      await releaseCue(page);
      await keys(page, []);
      await advance(page, 50);
      const intact = await snapshot(page);
      assert.ok(
        world(intact)
          .packages.find((item) => item.id === crystal.id)
          .tags.includes("intact"),
      );
      await returnAndBank(page, intact);
      await tab(page, "cargo");
      await command(page, "sell");
      const afterM2 = await fee(page, 6000);
      assert.deepEqual(world(afterM2).completed, [1, 2]);
      await enterDock(page);
      await tab(page, "tools");
      await command(page, "gear-buy-W02-R3");
      const equipped = await snapshot(page);
      assert.equal(equipped.state.equipped.processor, "W02-R3");
      assert.ok(equipped.state.equipped.utilities.includes("W02-R2"));
      const precisionSource = cryosamples(equipped).find(
        (item) => item.status === "deposit",
      );
      await restore(page, above(equipped, precisionSource));
      await keys(page, ["q", "ArrowDown"]);
      await releaseCue(page, { keyboard: false });
      await page.screenshot({ path: `${path}-precision-condenser.png` });
      const pending = await snapshot(page, false);
      await play(page, 0);
      await keys(page, []);
      await advance(page, 50);
      const precise = await snapshot(page);
      const preserved = world(precise).packages.find(
        (item) => item.id === precisionSource.id,
      );
      assert.equal(preserved.value, precisionSource.value * 1.3);
      assert.deepEqual(preserved.processedBy, ["W02-R3"]);
      // The condenser now banks the refund in the steam reserve (used with the
      // Reserve tool) instead of topping up the tank directly.
      assert.ok(
        (precise.state.vehicle.reserve ?? 0) >
          (pending.state.vehicle.reserve ?? 0),
        "Condenser returns spent ice-drilling energy after extraction",
      );
      await restore(page, precise);
      const loadedPrecision = await snapshot(page);
      assert.deepEqual(
        world(loadedPrecision).packages.find(
          (item) => item.id === preserved.id,
        ),
        preserved,
        "Precision value applies once and survives import",
      );
      const coreFixture = above(
        loadedPrecision,
        mission(loadedPrecision, "W02-Q"),
      );
      await restore(page, coreFixture);
      assert.equal(
        await page
          .locator("#campaign-mission-signal")
          .getAttribute("data-target"),
        "W02-Q",
      );
      await page.screenshot({ path: `${path}-catalyst-capsule.png` });
      await downUntil(
        page,
        async () =>
          Number.parseInt(await page.locator("#campaign-depth").innerText()) >=
          1000,
      );
      const catalyst = await snapshot(page);
      assert.equal(mission(catalyst, "W02-Q").status, "carried");
      await returnAndBank(page, catalyst);
      const afterM3 = await fee(page, 10000);
      assert.deepEqual(world(afterM3).completed, [1, 2, 3]);
      assert.ok(afterM3.state.progress.unlockedWorlds.includes("W04"));
      assert.deepEqual(afterM3.state.progress.completed, [1, 2, 3]);
      // The chip shows one live goal (here the optional salvage); completed
      // rows stay in the tracker list but are not the visible primary row.
      assert.match(
        await page.locator("#campaign-objective-progress").textContent(),
        /Planetary certificate earned/,
      );
      await enterDock(page);
      await tab(page, "lander");
      assert.equal(
        await page.locator('[data-command="depart"]').count(),
        0,
        "W02 never offers a fake playable W04 launch",
      );
      await openMap(page);
      assert.match(
        await page.locator('[data-world="W04"]').innerText(),
        /charted.*development/i,
      );
      assert.equal(
        await page.locator('[data-world="W04"] [data-command]').count(),
        0,
      );
      await page.screenshot({ path: `${path}-planetary-navigation.png` });
      await play(page);
      await travel(page, "W01");
      await travel(page, "W02");
      assert.deepEqual(world(await snapshot(page)).completed, [1, 2, 3]);
      noErrors(page);
      pass(
        "fixture-assisted sample/intact/catalyst milestones, exact fees, condenser/precision effects and charted-only W04 persistence",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("conflict")) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      }),
      faults = [];
    await context.addInitScript(() => {
      window.BroadcastChannel = undefined;
    });
    const boot = async () => {
      const page = await context.newPage();
      page.on("pageerror", (error) => faults.push(error.message));
      await page.goto(base);
      await page.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      if (await page.locator("#campaign-start").isVisible())
        await click(page, "#campaign-start");
      await idle(page);
      await freeze(page);
      return page;
    };
    const records = (page) =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("motherload.campaign.v1", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result,
                transaction = database.transaction("checkpoints", "readonly"),
                store = transaction.objectStore("checkpoints");
              const current = store.get("current"),
                backup = store.get("backup");
              transaction.oncomplete = () => {
                database.close();
                resolve({
                  current: current.result ?? null,
                  backup: backup.result ?? null,
                });
              };
              transaction.onabort = () => {
                database.close();
                reject(transaction.error);
              };
            };
          }),
      );
    try {
      const stale = await boot();
      const initial = await snapshot(stale);
      await restore(stale, completedAsteroid(initial));
      await depart(stale);
      await openMap(stale);
      await command(stale, "travel-W02");
      assert.equal(await stale.locator("#campaign-confirm").isVisible(), true);
      const newer = await boot();
      await menu(newer);
      await command(newer, "save");
      const protectedRecords = await records(newer);
      await confirm(stale);
      assert.equal(
        await stale
          .locator("#campaign-confirm")
          .evaluate((element) => element.open),
        false,
      );
      assert.equal(
        await stale.evaluate(() => document.body.dataset.campaignOverlay),
        "menu",
      );
      assert.equal(
        await stale
          .locator("#campaign-dock")
          .evaluate((element) => element.open),
        false,
      );
      assert.match(
        await stale.locator("#campaign-storage-notice").textContent(),
        /newer|tab|changed|checkpoint/i,
      );
      assert.equal(
        await stale.locator('#campaign-menu [data-command="load"]').isEnabled(),
        true,
      );
      assert.equal(
        await stale
          .locator('#campaign-menu [data-command="export"]')
          .isEnabled(),
        true,
      );
      const inMemory = await exportCheckpoint(stale);
      assert.equal(
        inMemory.state.currentWorld,
        "W02",
        "The valid in-memory arrival can still be exported after a travel conflict",
      );
      assert.deepEqual(
        await records(newer),
        protectedRecords,
        "Failed stale travel and Export preserve newer current AND backup bytes",
      );
      await stale.screenshot({ path: `${path}-travel-conflict-recovery.png` });
      await command(stale, "load");
      assert.equal((await exportCheckpoint(stale)).state.currentWorld, "W01");
      assert.equal(
        await stale.evaluate(() => document.body.dataset.campaignPaused),
        "true",
      );
      assert.deepEqual(
        await records(newer),
        protectedRecords,
        "Load recovery reads the newer checkpoint without overwriting either record",
      );
      await play(stale);
      assert.deepEqual(faults, []);
      pass(
        "two-tab travel CAS conflict preserves current/backup bytes and exposes in-memory Export plus paused Load recovery",
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
    const checks = await runFrontierSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.FRONTIER_ARTIFACTS || "artifacts/frontier",
    );
    console.log("Frontier browser checks passed: " + checks.length);
  } finally {
    await browser.close();
  }
}
