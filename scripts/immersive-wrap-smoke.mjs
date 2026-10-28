import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { observeTerrain } from "../src/discovery.ts";
import {
  WIDTH,
  fixture,
  launchBrowser,
  ready,
  pause,
  openTools,
  closeTools,
  savedState,
  readState,
  importState,
  freezeFrames,
  resumeFrames,
  sampleClockedState,
  stationClose,
} from "./browser-helpers.mjs";

export async function runImmersiveWrapSmoke(
  browser,
  base,
  path = "artifacts/immersive-wrap",
) {
  await mkdir("artifacts", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [],
    checks = [],
    trace = [];
  const check = (name) => {
    checks.push(name);
    console.log(`Passed: ${name}`);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const advance = async (milliseconds) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 80)
      await page.clock.fastForward(Math.min(80, milliseconds - elapsed));
  };
  const load = async (state) => {
    await resumeFrames(page).catch(() => {});
    await pause(page);
    await importState(page, state);
    await pause(page);
    await freezeFrames(page);
    await pause(page, false);
    await advance(80);
  };
  const sample = async (phase) => {
    const state = await sampleClockedState(page);
    trace.push({
      phase,
      x: state.x,
      y: state.y,
      fuel: state.fuel,
      mined: state.mined,
    });
    return state;
  };
  const seamRoom = (ore) => {
    const state = fixture({ x: 23, y: 20.15, deepest: 170, money: 20 });
    for (let row = 16; row <= 20; row++)
      for (let column = 0; column < WIDTH; column++)
        state.tiles[row * WIDTH + column] = 0;
    state.tiles[20 * WIDTH] = ore ? 3 : 1;
    state.discovered.fill(0);
    observeTerrain(state.tiles, state.discovered, WIDTH, 3, state.x, state.y);
    return state;
  };
  const inspectSeam = async () => {
    const bounds = await page.locator("canvas").boundingBox();
    const tile = 80;
    const cameraX = 23.5 * tile - bounds.width / 2;
    const cameraY = 20.65 * tile - bounds.height * 0.42;
    const clip = {
      x: Math.round(bounds.x + WIDTH * tile - cameraX + 5),
      y: Math.round(bounds.y + 20 * tile - cameraY + 5),
      width: 70,
      height: 70,
    };
    const terrain = await page.screenshot({ clip });
    await page.mouse.click(clip.x + 35, clip.y + 35);
    await advance(80);
    const inspector = await page.screenshot({
      clip: {
        x: bounds.x + bounds.width / 2 - 300,
        y: bounds.y + bounds.height - 60,
        width: 600,
        height: 55,
      },
      style: ".message { visibility: hidden !important; }",
    });
    return { terrain, inspector };
  };
  try {
    await ready(page, base);
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector("canvas").getBoundingClientRect();
      return {
        x: canvas.x,
        y: canvas.y,
        width: canvas.width,
        height: canvas.height,
        vw: innerWidth,
        vh: innerHeight,
        oldShell: Boolean(
          document.querySelector("header.mission-header, footer"),
        ),
        statusInMenu: [
          "depth",
          "money",
          "value",
          "hud-fuel",
          "hud-hull",
          "hud-cargo",
          "region-label",
          "frontier-goal",
          "save",
          "load",
          "sound-toggle",
          "focus",
          "new-game",
        ].every((id) => document.getElementById(id)?.closest("#tools")),
      };
    });
    assert.ok(Math.abs(layout.x) <= 1 && Math.abs(layout.y) <= 1);
    assert.ok(
      Math.abs(layout.width - layout.vw) <= 1 &&
        Math.abs(layout.height - layout.vh) <= 1,
      `playfield fills viewport: ${JSON.stringify(layout)}`,
    );
    assert.equal(layout.oldShell, false);
    assert.equal(layout.statusInMenu, true);
    assert.equal(await page.locator("#hud-fuel").isVisible(), false);
    await page.locator("#pause").click();
    assert.equal(
      await page.locator("#tools").evaluate((dialog) => dialog.open),
      true,
    );
    assert.equal(await page.locator("#hud-fuel").isVisible(), true);
    const frozen = await savedState(page);
    await freezeFrames(page);
    await advance(600);
    assert.deepEqual(
      await sampleClockedState(page),
      frozen,
      "single menu freezes expedition",
    );
    await pause(page, false);
    assert.equal(
      await page.locator("#tools").evaluate((dialog) => dialog.open),
      false,
    );
    await resumeFrames(page);
    await page.screenshot({ path: `${path}-desktop.png`, fullPage: true });
    check(
      "playfield fills the viewport and one pause menu contains status, settings and expedition tools",
    );

    const ore = seamRoom(true),
      soil = seamRoom(false);
    assert.equal(
      ore.discovered[20 * WIDTH],
      1,
      "sight crosses the horizontal seam",
    );
    await load(ore);
    const orePixels = await inspectSeam();
    await load(soil);
    const soilPixels = await inspectSeam();
    assert.ok(
      !orePixels.terrain.equals(soilPixels.terrain),
      "opposite-edge ore is rendered beside the vehicle",
    );
    assert.ok(
      !orePixels.inspector.equals(soilPixels.inspector),
      "opposite-edge ore is inspected using its canonical tile",
    );
    check(
      "periodic terrain copies and inspection show the opposite world edge beside the rig",
    );

    await load(ore);
    await page.keyboard.down("ArrowRight");
    let cut;
    for (let step = 0; step < 100; step++) {
      await advance(80);
      cut = await sample("cut ore across seam");
      if (cut.mined >= 1) break;
    }
    await page.keyboard.up("ArrowRight");
    assert.equal(cut.tiles[20 * WIDTH], 0);
    assert.deepEqual(cut.inventory, [3]);
    assert.equal(cut.money, 20);
    assert.ok(
      cut.x < 1 && cut.x >= 0,
      "rightward seam cut ends in canonical column zero",
    );
    await page.keyboard.down("ArrowUp");
    await page.keyboard.down("ArrowLeft");
    let flown;
    for (let step = 0; step < 100; step++) {
      await advance(80);
      flown = await sample("fly back across seam");
      if (flown.x > 23 && flown.y < 19.9) break;
    }
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("ArrowUp");
    assert.ok(flown.x > 23 && flown.x < WIDTH && flown.y < 19.9);
    let landed;
    for (let step = 0; step < 100; step++) {
      await advance(80);
      landed = await sample("land after seam flight");
      if (Math.abs(landed.y - 20.15) < 0.00001) break;
    }
    assert.ok(Math.abs(landed.y - 20.15) < 0.00001);
    await pause(page);
    const checkpoint = await sample("save seam expedition");
    await resumeFrames(page);
    await ready(page, base);
    await pause(page);
    const restored = await savedState(page);
    assert.deepEqual(restored.tiles, checkpoint.tiles);
    assert.deepEqual(restored.discovered, checkpoint.discovered);
    assert.deepEqual(restored.inventory, checkpoint.inventory);
    assert.equal(restored.money, checkpoint.money);
    assert.ok(restored.x >= 0 && restored.x < WIDTH);
    check(
      "native seam drilling and thrust collect once and preserve canonical terrain, cargo and discoveries on reload",
    );

    const surface = fixture({ x: 23.4, money: 20 });
    await load(surface);
    await page.keyboard.down("ArrowRight");
    let docked;
    for (let step = 0; step < 120; step++) {
      await advance(80);
      docked = await sample("drive through seam to exchange");
      if (docked.x >= 1.1 && docked.x < 2.8) break;
    }
    await page.keyboard.up("ArrowRight");
    assert.ok(docked.x >= 1.1 && docked.x < 2.8);
    await page.keyboard.press("e");
    await advance(80);
    assert.equal(
      await page.evaluate(() => document.body.dataset.station),
      "exchange",
    );
    await resumeFrames(page);
    await page.screenshot({
      path: `${path}-seam-exchange.png`,
      fullPage: true,
    });
    await stationClose(page);
    check(
      "a surface station reached through the world seam opens its normal in-game interface",
    );
    assert.deepEqual(errors, []);
    return checks;
  } catch (error) {
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
    const checks = await runImmersiveWrapSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
    );
    console.log(
      `${checks.length} immersive/wrapping browser scenarios passed; no page errors.`,
    );
  } finally {
    await browser.close();
  }
}
