import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { observeTerrain } from "../src/discovery.ts";
import {
  WIDTH,
  HEIGHT,
  fixture,
  launchBrowser,
  ready,
  pause,
  importState,
  freezeFrames,
  resumeFrames,
  sampleClockedState,
  snapshot,
  openTools,
  closeTools,
} from "./browser-helpers.mjs";

// Within lamp range, but concealed behind two solid layers: this checks
// occlusion as well as the distant cave's radius limit.
const ORE = { x: 12, y: 6 };
const CAVE = { x: 15, y: 9 };
const index = ({ x, y }) => y * WIDTH + x;
const knownCount = (state) =>
  state.discovered.reduce((sum, value) => sum + value, 0);

function unexplored(state) {
  state.discovered.fill(0);
  observeTerrain(state.tiles, state.discovered, WIDTH, 3, state.x, state.y);
  return state;
}

function hiddenFixture(deposits) {
  const state = fixture({ money: 20 });
  state.tiles[index(ORE)] = deposits ? 6 : 1;
  for (let y = 8; y <= 10; y++)
    for (let x = 15; x <= 17; x++)
      state.tiles[y * WIDTH + x] = deposits ? 0 : 1;
  return unexplored(state);
}

// These checks use a fixed desktop viewport and ordinary save-file imports.
// Camera geometry only locates canvas pixels/clicks; no scene or model instance
// is read through a production debugging API.
async function geometry(page, state) {
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box && box.width >= 1200 && box.height >= 280);
  const tile = 80;
  const cameraX = (state.x + 0.5) * tile - box.width / 2;
  const cameraY = Math.max(
    0,
    Math.min(
      (state.y + 0.5) * tile - box.height * 0.42,
      (state.tiles.length / WIDTH) * tile - box.height,
    ),
  );
  const cell = ({ x, y }) => ({
    x: Math.round(box.x + x * tile - cameraX + 4),
    y: Math.round(box.y + y * tile - cameraY + 4),
    width: tile - 8,
    height: tile - 8,
  });
  return {
    box,
    cell,
    inspector: {
      x: Math.round(box.x + box.width / 2 - 250),
      y: Math.round(box.y + box.height - 40),
      width: 500,
      height: 34,
    },
  };
}

export async function runDiscoverySmoke(
  browser,
  base,
  path = "artifacts/discovery-check",
) {
  await mkdir("artifacts", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [],
    trace = [],
    checks = [];
  let clockStarted = false;
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (name) => {
    checks.push(name);
    console.log(`Passed: ${name}`);
  };
  const advance = async (milliseconds = 80) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 80)
      await page.clock.fastForward(Math.min(80, milliseconds - elapsed));
  };
  const sample = async (phase) => {
    const state = await sampleClockedState(page);
    trace.push({
      phase,
      x: state.x,
      y: state.y,
      mined: state.mined,
      fuel: state.fuel,
      known: knownCount(state),
    });
    return state;
  };
  const load = async (state) => {
    if (clockStarted) await resumeFrames(page);
    await pause(page);
    await importState(page, state);
    await pause(page);
    await freezeFrames(page);
    clockStarted = true;
    await pause(page, false);
    await advance();
  };
  const inspect = async (state, label) => {
    const layout = await geometry(page, state);
    const ore = await page.screenshot({ clip: layout.cell(ORE) });
    const cave = await page.screenshot({ clip: layout.cell(CAVE) });
    const target = layout.cell(ORE);
    await page.mouse.click(
      target.x + target.width / 2,
      target.y + target.height / 2,
    );
    await advance();
    const inspector = await page.screenshot({
      clip: layout.inspector,
      // The immersive shell overlays a timed status toast near this strip.
      // Compare the game inspector itself, not an unrelated toast's fade.
      style: ".message { visibility: hidden !important; }",
    });
    await writeFile(`${path}-${label}-ore.png`, ore);
    await writeFile(`${path}-${label}-cave.png`, cave);
    await writeFile(`${path}-${label}-inspector.png`, inspector);
    return { ore, cave, inspector };
  };

  try {
    await ready(page, base);
    await pause(page);
    const initial = await snapshot(page);
    assert.equal(initial.version, 4);
    assert.equal(initial.tiles.length, WIDTH * HEIGHT);
    assert.ok(initial.discovered.includes(0));

    const hidden = hiddenFixture(true),
      plain = hiddenFixture(false);
    assert.deepEqual(hidden.discovered, plain.discovered);
    assert.equal(hidden.discovered[index(ORE)], 0);
    assert.equal(hidden.discovered[index(CAVE)], 0);
    await load(hidden);
    const hiddenPixels = await inspect(hidden, "hidden");
    const afterClick = await sample("hidden deposit inspected");
    assert.equal(afterClick.discovered[index(ORE)], 0);
    await page.screenshot({ path: `${path}-surface.png`, fullPage: true });
    await load(plain);
    const plainPixels = await inspect(plain, "plain");
    for (const region of ["ore", "cave", "inspector"])
      assert.ok(
        hiddenPixels[region].equals(plainPixels[region]),
        `unknown ${region} must not expose underlying ore or cave data`,
      );
    check(
      "unexplored ore, caves and inspection remain indistinguishable from hidden soil",
    );

    await load(hidden);
    await page.keyboard.down("ArrowDown");
    let approached;
    for (let step = 0; step < 180; step++) {
      await advance();
      approached = await sample("approach sealed deposit");
      if (approached.discovered[index(ORE)]) break;
    }
    await page.keyboard.up("ArrowDown");
    assert.equal(approached.discovered[index(ORE)], 1);
    assert.equal(approached.tiles[index(ORE)], 6);
    assert.ok(approached.mined >= 2);
    assert.ok(knownCount(approached) > knownCount(hidden));
    // Reload the actual Save from the completed approach to stop any partial
    // next cut and obtain a settled camera before inspecting the revealed face.
    await load(approached);
    const revealedPixels = await inspect(approached, "revealed");
    await page.screenshot({ path: `${path}-revealed.png`, fullPage: true });
    const knownPlain = structuredClone(approached);
    knownPlain.tiles[index(ORE)] = 1;
    await load(knownPlain);
    const knownPlainPixels = await inspect(knownPlain, "revealed-plain");
    assert.ok(!revealedPixels.ore.equals(knownPlainPixels.ore));
    assert.ok(
      !revealedPixels.inspector.equals(knownPlainPixels.inspector),
      "a discovered mineral must provide an identifiable in-game inspection",
    );
    check(
      "native drilling discovers a previously sealed mineral and enables its inspection",
    );

    await load(approached);
    await page.keyboard.down("ArrowUp");
    let returned;
    for (let step = 0; step < 160; step++) {
      await advance();
      returned = await sample("return through explored shaft");
      if (returned.y <= 3.16) break;
    }
    await page.keyboard.up("ArrowUp");
    assert.ok(returned.y <= 3.16);
    let dockedFrames = 0;
    for (let step = 0; step < 100 && dockedFrames < 3; step++) {
      await advance();
      returned = await sample("settle at surface dock");
      dockedFrames =
        Math.abs(returned.y - 3.15) < 0.00001 ? dockedFrames + 1 : 0;
    }
    assert.equal(
      dockedFrames,
      3,
      "release thrust and dock before comparing a reload",
    );
    await pause(page);
    returned = await sample("save explored expedition");
    for (let cell = 0; cell < approached.discovered.length; cell++)
      if (approached.discovered[cell])
        assert.equal(returned.discovered[cell], 1);
    assert.equal(returned.discovered[index(ORE)], 1);
    await resumeFrames(page);
    await openTools(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-save").click(),
    ]);
    const exported = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.deepEqual(exported, returned);
    await closeTools(page);
    await ready(page, base);
    await pause(page);
    const restored = await snapshot(page);
    assert.deepEqual(restored, returned);
    check(
      "explored terrain and discovery survive retreat, file export and browser reload",
    );

    const deep = fixture({
      x: 12,
      y: 123.15,
      deepest: 1200,
      upgrades: { drill: 2, tank: 0, cargo: 0, hull: 0, engine: 2 },
    });
    for (let y = 119; y <= 123; y++)
      for (let x = 10; x <= 14; x++) deep.tiles[y * WIDTH + x] = 0;
    deep.tiles[124 * WIDTH + 12] = 13;
    unexplored(deep);
    await load(deep);
    await page.keyboard.down("ArrowDown");
    let mined;
    for (let step = 0; step < 180; step++) {
      await advance();
      mined = await sample("mine beyond former world floor");
      if (mined.tiles[124 * WIDTH + 12] === 0) break;
    }
    await page.keyboard.up("ArrowDown");
    assert.equal(mined.tiles[124 * WIDTH + 12], 0);
    assert.ok(mined.inventory.includes(13));
    await page.keyboard.down("ArrowUp");
    let flying;
    for (let step = 0; step < 100; step++) {
      await advance();
      flying = await sample("fly below former world floor");
      if (flying.y < 122) break;
    }
    await page.keyboard.up("ArrowUp");
    assert.ok(flying.y < 122);
    const floorRow = Array.from(
      { length: 20 },
      (_, offset) => 119 + offset,
    ).find((row) => flying.tiles[row * WIDTH + 12] !== 0);
    assert.ok(floorRow);
    let landed;
    for (let step = 0; step < 120; step++) {
      await advance();
      landed = await sample("reland in deep expedition");
      if (Math.abs(landed.y - (floorRow - 0.85)) < 0.005) break;
    }
    assert.ok(Math.abs(landed.y - (floorRow - 0.85)) < 0.005);
    assert.ok(landed.fuel > 0 && landed.hull > 0);
    assert.ok(landed.deepest > 1200);
    assert.equal(landed.tiles.length, WIDTH * HEIGHT);
    assert.equal(landed.tiles[124 * WIDTH + 12], 0);
    assert.equal(
      Number(
        await page.locator("#frontier-progress").getAttribute("aria-valuenow"),
      ),
      landed.deepest,
    );
    assert.ok(
      Number(
        await page.locator("#frontier-progress").getAttribute("aria-valuemax"),
      ) > landed.deepest,
      "the deeper expedition must retain a reachable next frontier",
    );
    assert.notEqual(
      await page.locator("#region-label").textContent(),
      "Surface",
    );
    await page.screenshot({ path: `${path}-deep.png`, fullPage: true });
    await pause(page);
    const deepSave = await sample("save deep expedition");
    await resumeFrames(page);
    await ready(page, base);
    await pause(page);
    const deepReloaded = await snapshot(page);
    assert.deepEqual(deepReloaded.tiles, deepSave.tiles);
    assert.deepEqual(deepReloaded.discovered, deepSave.discovered);
    assert.deepEqual(deepReloaded.inventory, deepSave.inventory);
    assert.equal(deepReloaded.deepest, deepSave.deepest);
    assert.ok(Math.abs(deepReloaded.y - deepSave.y) < 0.005);
    check(
      "mining, flight, landing and discovered saves work below the old 100-row world",
    );
    assert.deepEqual(errors, []);
    return checks;
  } catch (error) {
    if (errors.length) console.error("Discovery page errors:", errors);
    await page
      .screenshot({
        path: `${path}-failure.png`,
        fullPage: true,
        timeout: 5000,
      })
      .catch(() => {});
    throw error;
  } finally {
    await writeFile(`${path}-trace.json`, JSON.stringify(trace, null, 2));
    await context.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    const checks = await runDiscoverySmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
    );
    console.log(
      `${checks.length} discovery browser scenarios passed; no page errors.`,
    );
  } finally {
    await browser.close();
  }
}
