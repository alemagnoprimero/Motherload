/**
 * Audit T13b, runtime evidence for `-emissive` siblings: the survey beacon's
 * lamp (mission-beacon-emissive). Since D14 the beacon stands in the SITE-4
 * crew gallery, W01 column 17, row 45 (config.ts: beaconX 17.5, beaconRow
 * 45); the scenes below are staged there, in a block of solid ground laid
 * over the gallery so the cells around the beacon are the same in every run.
 *
 * For each renderer (WebGL, Canvas), form (desktop 1440×900@2, phone
 * 393×851@3) and high contrast off/on, the same frame twice: with the ADD
 * pass and with `?debug=no-emissive` (the bases alone). Two scenes:
 *
 *   lit     the beacon in an open cell beside the rig, every cell under the
 *           lamp known: the sibling draws unmasked, in T1-lite's ADD run.
 *   masked  the beacon buried, the cell above it unknown: the lamp straddles
 *           that cell, so the sibling keeps the wreck mask, and the unknown
 *           cell's pixels must not change (hidden information).
 *
 * Records WebGL draw calls, the drawn siblings (__campaignDebug.emissives())
 * and resident texture bytes, and saves HUD-free crops around the beacon.
 * Frozen clock, reduced motion, Render quality 2.
 *
 * Since art item A13 the rig's headlamp sibling (rig-cabin-emissive, ADD at
 * 23.9 over rig-cabin at 22) is drawn too, in its own ADD run after the rig:
 * at the old row-9 cell WebGL draws read 6 with the bases alone, 8 with the
 * lit beacon and 10 with the masked beacon, desktop and phone (item 2
 * measured 6 / 6 / 8 before the rig had a sibling;
 * docs/qa/a13-rig-shading/README.md). In the gallery, with T1-lite's lights
 * batched (T2, docs/qa/t2/README.md), they read 4 / 8 / 9 with
 * RetainedTerrain and 5 / 9 / 10 with the T2 field renderer.
 *
 *   PREVIEW_URL=http://127.0.0.1:5173/ CHROMIUM_PATH=… \
 *     node docs/qa/t13b-asset-pipeline/emissive-runtime.mjs OUT_DIR
 *
 * RENDERERS=webgl|canvas, FORMS=desktop|phone and CONTRAST=off|on narrow it.
 * EMISSIVE_SEARCH adds URL parameters (field=1 pins the T2 field renderer,
 * field=0 RetainedTerrain) and EMISSIVE_MAX_DRAWS asserts a draw budget.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  freeze,
  idle,
  importCheckpoint,
} from "../../../scripts/campaign-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const output = process.argv[2] || "artifacts/t13b-emissive";
await mkdir(output, { recursive: true });
const BEACON = { x: 17, row: 45 };
/** Extra URL parameters, e.g. EMISSIVE_SEARCH=field=1 for the T2 field renderer. */
const SEARCH = process.env.EMISSIVE_SEARCH
  ? `&${process.env.EMISSIVE_SEARCH}`
  : "";
const FORMS = {
  desktop: { viewport: { width: 1440, height: 900 }, dpr: 2 },
  phone: { viewport: { width: 393, height: 851 }, dpr: 3, touch: true },
};

/** The W01 fixture with the rig two cells right of the beacon, on its row. */
async function scene(kind) {
  const checkpoint = JSON.parse(
    await readFile(
      new URL("../../../tests/fixtures/improvement-w01.json", import.meta.url),
      "utf8",
    ),
  );
  const state = checkpoint.state,
    mine = state.worlds.W01,
    at = (x, y) => y * mine.width + x;
  state.currentWorld = "W01";
  state.progress.beacon = false;
  const x = BEACON.x + 2;
  state.vehicle = { x: x + 0.5, y: BEACON.row + 0.64, energy: 9, hull: 10 };
  mine.discovered.fill(0);
  // Solid ground over the gallery, three rows above the beacon to two below
  // and six columns either side: only the cells opened below are air.
  for (let cy = BEACON.row - 3; cy <= BEACON.row + 2; cy++)
    for (let cx = BEACON.x - 6; cx <= BEACON.x + 8; cx++)
      mine.tiles[at(cx, cy)] = 1;
  for (let y = 0; y <= BEACON.row; y++) mine.tiles[at(x, y)] = 0;
  // The tunnel to the beacon; in the lit scene the beacon's cell is open.
  mine.tiles[at(x - 1, BEACON.row)] = 0;
  mine.tiles[at(BEACON.x, BEACON.row)] = kind === "lit" ? 0 : 1;
  // Solid around, so the masked scene's cell above the beacon stays unknown.
  for (const [cx, cy] of [
    [BEACON.x, BEACON.row - 1],
    [BEACON.x + 1, BEACON.row - 1],
    [BEACON.x - 1, BEACON.row],
  ])
    mine.tiles[at(cx, cy)] = 1;
  // A deposit in a cell opened above is exposed, as a dug one would be.
  for (const item of mine.packages)
    if (
      item.status === "deposit" &&
      mine.tiles[at(Math.floor(item.x), Math.floor(item.y))] === 0
    )
      item.status = "exposed";
  return checkpoint;
}

async function open(browser, form, renderer, highContrast, emissive) {
  const { viewport, dpr, touch = false } = FORMS[form];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    isMobile: touch,
    hasTouch: touch,
  });
  await context.addInitScript(
    (preferences) =>
      localStorage.setItem(
        "motherload.campaign.preferences.v1",
        JSON.stringify(preferences),
      ),
    {
      reducedMotion: true,
      coachSkipped: true,
      sound: false,
      renderScale: 2,
      highContrast,
    },
  );
  const page = await context.newPage();
  const faults = [];
  page.on("pageerror", (error) => faults.push(error.message));
  await freeze(page);
  await page.goto(
    `${base}?renderer=${renderer}&debug=frametime${emissive ? "" : ",no-emissive"}${SEARCH}`,
  );
  for (let n = 0; n < 200; n++) {
    await advance(page, 50);
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (
      await page.evaluate(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      )
    )
      break;
  }
  await click(page, "#campaign-start");
  await idle(page);
  return { context, page, faults };
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  let previous = "",
    same = 0;
  for (let n = 0; n < 40; n++) {
    await advance(page, 50);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const signature = await page
      .locator("#campaign-game")
      .evaluate((element) =>
        [
          element.dataset.residentTextureBytes,
          element.dataset.viewCameraX,
          element.dataset.viewCameraY,
        ].join(":"),
      );
    same = signature === previous ? same + 1 : 0;
    previous = signature;
    if (same >= 5) break;
  }
  await advance(page, 300);
  await new Promise((resolve) => setTimeout(resolve, 60));
}

async function read(page) {
  return page.evaluate(() => {
    const data = document.querySelector("#campaign-game").dataset;
    const targets = JSON.parse(data.poiScreenTargets || "[]");
    return {
      drawCalls: Number(data.drawCalls) || null,
      terrainRenderer: data.terrainRenderer ?? null,
      bytes: Number(data.residentTextureBytes),
      atlasPages: data.atlasPages,
      emissiveSprites: Number(data.emissiveSprites),
      beacon: targets.find((target) => target.id === "W01-BEACON") ?? null,
      tile: Number(data.viewTile),
      cameraX: Number(data.viewCameraX),
      cameraY: Number(data.viewCameraY),
      contrastShown: data.highContrast,
      // Absent before this stage (the "before" tree has no ADD pass).
      emissives: window.__campaignDebug.emissives?.() ?? null,
      misses: window.__campaignDebug.frameMisses(true),
    };
  });
}

/** A HUD-free crop of the canvas around the beacon, in CSS px. */
async function crop(page, sample, path) {
  const tile = sample.tile;
  // The box on screen of the cell above the beacon, which the masked scene
  // keeps unknown.
  const cell = {
    x: BEACON.x * tile - sample.cameraX,
    y: (BEACON.row - 1) * tile - sample.cameraY,
    width: tile,
    height: tile,
  };
  const clip = {
    x: Math.round(sample.beacon.x - tile * 1.5),
    y: Math.round(sample.beacon.y - tile * 1.5),
    width: Math.round(tile * 3),
    height: Math.round(tile * 3),
  };
  await page.evaluate(() => window.__campaignDebug.overlays(false));
  await advance(page, 100);
  const hidden = await page.addStyleTag({
    content:
      "body *{visibility:hidden!important}#campaign-game canvas{visibility:visible!important}",
  });
  await page.screenshot({ path, clip });
  // The unknown cell alone, inset by 2 CSS px from its edges (blurred fog
  // and sprite antialiasing at the cell's border belong to the neighbours).
  const cellPath = path.replace(/\.png$/, "-cell.png");
  await page.screenshot({
    path: cellPath,
    clip: {
      x: cell.x + 2,
      y: cell.y + 2,
      width: cell.width - 4,
      height: cell.height - 4,
    },
  });
  await hidden.evaluate((element) => element.remove());
  await page.evaluate(() => window.__campaignDebug.overlays(true));
  await advance(page, 100);
  return { clip, cell, cellPath };
}

const FOLLOWS = [
  "texture",
  "x",
  "y",
  "originX",
  "originY",
  "width",
  "height",
  "rotation",
  "flipX",
  "alpha",
  "visible",
];
/**
 * The beacon's sibling copies its base (texture page, position, origin,
 * size, flip, rotation, alpha), draws ADD (1) at 17.6 while the base stays
 * NORMAL (0) at 15, and keeps the wreck mask only in the masked scene. The
 * rig beside it draws its headlamp sibling (A13) the same way, ADD at 23.9
 * over rig-cabin at 22, unmasked. Nothing is drawn with ?debug=no-emissive.
 */
function check(sample) {
  if (!sample.emissive) {
    assert.deepEqual(sample.emissives, [], "no-emissive draws no sibling");
    return;
  }
  const byFrame = (frame) =>
    sample.emissives.filter((glow) => glow.frame === frame);
  assert.deepEqual(
    sample.emissives.map((glow) => glow.frame).sort(),
    ["mission-beacon-emissive", "rig-cabin-emissive"],
    "two siblings: the beacon's lamp and the rig's headlamp",
  );
  const [glow] = byFrame("mission-beacon-emissive");
  assert.equal(glow.base.frame, "mission-beacon");
  for (const key of FOLLOWS)
    assert.equal(glow[key], glow.base[key], `sibling ${key} follows its base`);
  assert.deepEqual(
    [glow.blendMode, glow.depth, glow.base.blendMode, glow.base.depth],
    [1, 17.6, 0, 15],
  );
  assert.equal(glow.base.masked, true, "the marker keeps the wreck mask");
  assert.equal(glow.masked, sample.kind === "masked");
  const [lamp] = byFrame("rig-cabin-emissive");
  assert.equal(lamp.base.frame, "rig-cabin");
  for (const key of FOLLOWS)
    assert.equal(lamp[key], lamp.base[key], `rig sibling ${key} follows`);
  assert.deepEqual(
    [lamp.blendMode, lamp.depth, lamp.base.blendMode, lamp.base.depth],
    [1, 23.9, 0, 22],
  );
  assert.equal(lamp.masked, false, "the rig's headlamp is never masked");
}

const browser = await launchBrowser();
const results = { base, beacon: BEACON, samples: [] };
try {
  const list = (name, all) => (process.env[name] || all).split(",");
  for (const renderer of list("RENDERERS", "webgl,canvas"))
    for (const form of list("FORMS", Object.keys(FORMS).join(",")))
      for (const highContrast of list("CONTRAST", "off,on").map(
        (value) => value === "on",
      ))
        for (const emissive of [true, false]) {
          const { context, page, faults } = await open(
            browser,
            form,
            renderer,
            highContrast,
            emissive,
          );
          try {
            for (const kind of ["lit", "masked"]) {
              await importCheckpoint(page, await scene(kind));
              await closeOverlay(page);
              await settle(page);
              await page.evaluate(() =>
                window.__campaignDebug.frameMisses(true),
              );
              await advance(page, 300);
              const sample = {
                renderer,
                form,
                highContrast,
                emissive,
                kind,
                ...(await read(page)),
              };
              assert.ok(sample.beacon, `${kind}: the beacon is on screen`);
              assert.equal(sample.contrastShown, String(highContrast));
              if (sample.emissives) check(sample);
              // EMISSIVE_MAX_DRAWS: the audit's §7 phone budget is 10 draws.
              if (process.env.EMISSIVE_MAX_DRAWS && sample.drawCalls !== null)
                assert.ok(
                  sample.drawCalls <= Number(process.env.EMISSIVE_MAX_DRAWS),
                  `${kind} ${form}: ${sample.drawCalls} draws, over ${process.env.EMISSIVE_MAX_DRAWS}`,
                );
              const name = `${kind}-${renderer}-${form}${highContrast ? "-hc" : ""}-${emissive ? "lit" : "base"}`;
              sample.crop = await crop(page, sample, `${output}/${name}.png`);
              sample.faults = [...faults];
              results.samples.push(sample);
              const drawn = (sample.emissives ?? [])
                .map(
                  (glow) =>
                    `${glow.frame}@${glow.depth}${glow.masked ? " masked" : ""}`,
                )
                .join(", ");
              console.log(
                `${name}: draws ${sample.drawCalls ?? "—"} · terrain ${sample.terrainRenderer ?? "—"} · ${(sample.bytes / 2 ** 20).toFixed(2)} MiB · emissives [${drawn}] · misses ${JSON.stringify(sample.misses)}`,
              );
            }
          } finally {
            await context.close();
          }
        }
} finally {
  await browser.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}
