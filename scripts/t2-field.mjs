/**
 * T2 field renderer checks and measurements (docs/qa/t2/README.md), for the
 * field renderer (?field=1, pinned) and, for comparison, main's (?field=0):
 *
 *   tier       which renderer a page gets: by default the field on WebGL
 *              with fragment highp, or RetainedTerrain when the WebGL
 *              renderer is a software rasteriser (as in CI); the field with
 *              ?field=1, on a desktop and on a touch phone alike (never by
 *              touch); RetainedTerrain on Canvas and with ?field=0.
 *   scramble   full-frame hidden-information check (F7 style) on the a04 and
 *              SITE-4 fixtures: every unknown cell more than 5.5 tiles from
 *              the rig gets a random tile, hidden deposits trade places, and
 *              the HUD-free frames must not differ by one pixel. Nearer
 *              unknown cells are left alone: the visibility test casts rays
 *              through them, so scrambling them changes what the game itself
 *              reveals, not what the renderer draws.
 *   poi        the fog check's inset crop with PR #3's POI probe: the
 *              antenna mission stands in a known column beside a hidden
 *              block, its artwork reaching over the block; the block's
 *              pixels must be the same whether it hides a cave or solid
 *              rock (0 px), with the antenna drawn.
 *   dig        the rig drills down from the 60 m fixture: the field patches
 *              on each dig, with at most one texSubImage2D of at most 160 ×
 *              160 texels per frame and none in still frames.
 *   digcost    D4 condition 2: the CPU cost of a frame, parked and digging,
 *              on a phone viewport at backing 1.5, field against main, with
 *              the field's scan, patch and upload costs. The game steps at
 *              60 frames per second on the test clock and each frame is
 *              timed on the real clock, so the software rasteriser's slow
 *              presentation does not thin the samples. T2_THROTTLE sets a
 *              CPU slowdown (4 is about a mid-range phone).
 *   motion     §9.3: with the scene clock running, a dug cell eases out over
 *              120 ms and revealed cells cross-fade over 250 ms, read on the
 *              field quad alone (no light, no rig); with the clock frozen
 *              both change at once; texels farther than 1.2 tiles from the
 *              dug cell do not change.
 *   draws      GL draw calls and texture uploads in still frames (desktop
 *              @2 and phone @3).
 *   context    WEBGL_lose_context: lose and restore the context; the field
 *              must draw the same frame again.
 *   frametime  F1's readout after real-clock play at a pinned backing
 *              scale. Under SwiftShader (no GPU) this measures the software
 *              rasteriser, not the technique (audit §7, "CI time").
 *
 * Environment: PREVIEW_URL; T2_DIR (artifacts/t2); T2_CHECKS, a comma list
 * (default tier,scramble,poi,dig,digcost,motion,draws,context); T2_FIELDS (1,0);
 * T2_PLAY_SECONDS (12); T2_THROTTLE (1); T2_DIG_FRAMES (600);
 * T2_DIGCOST_ASSERT=0 reports the dig cost without asserting the 2 ms limit.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  exportCheckpoint,
  freeze,
  idle,
  importCheckpoint,
  keys,
} from "./campaign-smoke.mjs";
import { CAPTURES, FORMS } from "./art-captures.mjs";
import { fixture, restore, settledView } from "./improvement-smoke.mjs";
import { installRenderProbe, readRenderProbe } from "./render-probe.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const out = process.env.T2_DIR || "artifacts/t2";
const checks = new Set(
  (
    process.env.T2_CHECKS ||
    "tier,scramble,poi,dig,digcost,motion,draws,context"
  ).split(","),
);
const throttle = Number(process.env.T2_THROTTLE || 1);
const digFrames = Number(process.env.T2_DIG_FRAMES || 600);
const fields = (process.env.T2_FIELDS || "1,0").split(",");
const playSeconds = Number(process.env.T2_PLAY_SECONDS || 12);
const fixtures = Object.fromEntries(
  ["a04-dive-60m@2", "c-site-W01-SITE-4-wreck@2"].map((name) => [
    name,
    CAPTURES.find((capture) => capture.name === name),
  ]),
);
await mkdir(out, { recursive: true });

/** A page with the render probe, the scene clock frozen at 0 and Start pressed. */
async function open(browser, settings, search, clock = true) {
  const context = await browser.newContext(settings);
  await context.addInitScript(installRenderProbe, {
    geometry: false,
    fog: false,
  });
  // The page's real clock, kept before the test clock replaces it.
  await context.addInitScript(() => {
    window.__realNow = performance.now.bind(performance);
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "motherload.campaign.preferences.v1",
      JSON.stringify({ coachSkipped: true, sound: false, renderScale: 2 }),
    ),
  );
  const page = await context.newPage(),
    faults = [];
  page.on("pageerror", (error) => faults.push(error.message));
  const url = new URL(base);
  url.searchParams.set("mode", "campaign");
  for (const [key, value] of Object.entries(search))
    if (value !== undefined) url.searchParams.set(key, String(value));
  await page.goto(url.href);
  await page.waitForFunction(
    () =>
      document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
  );
  await page.evaluate(() => window.__campaignDebug.sceneClock.freeze(0));
  if (await page.locator("#campaign-start").isVisible())
    await click(page, "#campaign-start");
  await idle(page);
  // Playwright's clock, paused: frames render only when advanced. The frame
  // timing runs without it, so performance.now() is the real clock.
  if (clock) await freeze(page);
  return { context, page, faults };
}

const dataset = (page) =>
  page.locator("#campaign-game").evaluate((element) => ({
    ...element.dataset,
  }));

async function hudFree(page, file) {
  await page.evaluate(() => window.__campaignDebug.overlays(false));
  await advance(page, 50);
  await page.screenshot({ path: file });
  await page.evaluate(() => window.__campaignDebug.overlays(true));
}

/** Random tiles for unknown cells far from the rig; hidden deposits swap. */
function scramble(checkpoint, seed = 99) {
  const copy = structuredClone(checkpoint);
  const { state } = copy,
    mine = state.worlds[state.currentWorld],
    { x: rx, y: ry } = state.vehicle;
  let random = seed;
  const next = () => {
    random = (random * 1103515245 + 12345) % 2 ** 31;
    return random / 2 ** 31;
  };
  const far = (x, y) => {
    const dx = Math.min(
      Math.abs(x + 0.5 - rx),
      mine.width - Math.abs(x + 0.5 - rx),
    );
    return Math.hypot(dx, y + 0.5 - ry) > 5.5;
  };
  const hidden = mine.packages.filter(
    (item) =>
      item.status === "deposit" &&
      mine.discovered[Math.floor(item.y) * mine.width + Math.floor(item.x)] !==
        1 &&
      far(Math.floor(item.x), Math.floor(item.y)),
  );
  const occupied = new Set(
    mine.packages.map(
      (item) => Math.floor(item.y) * mine.width + Math.floor(item.x),
    ),
  );
  // Generator 1 worlds have no plate (tile 4); the import rejects it.
  const kinds = mine.generatorVersion === 2 ? 5 : 4;
  let cells = 0;
  for (let y = 0; y < mine.rows; y++)
    for (let x = 0; x < mine.width; x++) {
      const i = y * mine.width + x;
      if (mine.discovered[i] === 1 || !far(x, y)) continue;
      // Package cells stay solid, or the import rejects an orphaned package.
      mine.tiles[i] = occupied.has(i)
        ? 1 + Math.floor(next() * 2)
        : Math.floor(next() * kinds);
      cells++;
    }
  // Hidden deposits trade places (a rotation, so every one moves).
  const spots = hidden.map((item) => [item.x, item.y]);
  hidden.forEach((item, k) => {
    [item.x, item.y] = spots[(k + 1) % spots.length];
  });
  return { checkpoint: copy, cells, deposits: hidden.length };
}

const differing = (a, b) =>
  Number(
    execFileSync("python3", [
      "-c",
      "import sys;import numpy as np;from PIL import Image;a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int);b=np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int);print(int((np.abs(a-b).sum(2)>0).sum()))",
      a,
      b,
    ]).toString(),
  );

const p = (values, q) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length
    ? Number(
        ordered[
          Math.min(ordered.length - 1, Math.floor(ordered.length * q))
        ].toFixed(2),
      )
    : null;
};

/** Mean absolute luma difference and progress between PNG data URLs, by mask. */
function motionMeasure(payload) {
  return JSON.parse(
    execFileSync("python3", ["scripts/t2-motion.py"], {
      input: JSON.stringify(payload),
      maxBuffer: 1 << 28,
    }).toString(),
  );
}

const results = { base, checks: [...checks], fields, throttle, runs: {} };
const browser = await launchBrowser();
try {
  if (checks.has("tier")) {
    // The boot choice: by renderer and fragment highp, never by pointer.
    results.tier = {};
    const software = await (async () => {
      const page = await browser.newPage();
      try {
        return await page.evaluate(() => {
          const gl = document.createElement("canvas").getContext("webgl");
          const info = gl?.getExtension("WEBGL_debug_renderer_info");
          return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
        });
      } finally {
        await page.close();
      }
    })();
    results.tier.webglRenderer = software;
    const byDefault =
      /swiftshader|llvmpipe|softpipe|software|basic render/i.test(software)
        ? "retained (software rasteriser)"
        : "field";
    console.log(`tier: WebGL renderer "${software}", default ${byDefault}`);
    for (const [name, form, search, expected] of [
      ["desktop default", "desktop", { backing: 1 }, byDefault],
      ["phone default (touch)", "phone", { backing: 1 }, byDefault],
      ["desktop ?field=1", "desktop", { backing: 1, field: 1 }, "field"],
      ["phone ?field=1 (touch)", "phone", { backing: 1, field: 1 }, "field"],
      ["?field=0", "desktop", { backing: 1, field: 0 }, "retained (?field=0)"],
      [
        "Canvas renderer",
        "desktop",
        { backing: 1, renderer: "canvas" },
        "retained (Canvas renderer)",
      ],
    ]) {
      const { context, page, faults } = await open(
        browser,
        FORMS[form],
        search,
      );
      try {
        await advance(page, 200);
        const info = await dataset(page);
        results.tier[name] = {
          terrainRenderer: info.terrainRenderer,
          qualityTier: info.qualityTier,
          renderer: info.renderer,
        };
        console.log(`tier ${name}: ${JSON.stringify(results.tier[name])}`);
        assert.equal(info.terrainRenderer, expected, name);
        assert.deepEqual(faults, []);
      } finally {
        await context.close();
      }
    }
  }
  if (checks.has("digcost")) {
    // D4 condition 2. Phone viewport, backing 1.5, the 60 m fixture; 60
    // frames per second of game time on the test clock, each frame's JS
    // cost on the real clock.
    results.digcost = {};
    for (const field of fields) {
      const { context, page, faults } = await open(browser, FORMS.phone, {
        field,
        backing: 1.5,
      });
      try {
        const checkpoint = fixtures["a04-dive-60m@2"].checkpoint();
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        // As in play: the scene clock runs, so reveals and digs ease and
        // their slots settle (two small uploads per dig, not one).
        await page.evaluate(() => window.__campaignDebug.sceneClock.resume());
        if (throttle > 1)
          await (
            await context.newCDPSession(page)
          ).send("Emulation.setCPUThrottlingRate", { rate: throttle });
        const run = async (frames) => {
          await page.evaluate(() => {
            if (window.__frameCosts) return;
            const raf = window.requestAnimationFrame.bind(window);
            window.__frameCosts = [];
            window.requestAnimationFrame = (callback) =>
              raf((time) => {
                const start = window.__realNow();
                callback(time);
                window.__frameCosts.push(window.__realNow() - start);
              });
          });
          for (let n = 0; n < frames; n++)
            await page.clock.fastForward(1000 / 60);
          return page.evaluate(() => window.__frameCosts.splice(0));
        };
        await run(60);
        const parked = await run(180);
        await page.evaluate(() => window.__campaignField?.costs?.());
        const from = Number((await dataset(page)).rigWorldY);
        await keys(page, ["ArrowDown"]);
        const digging = await run(digFrames);
        await keys(page, []);
        const info = await dataset(page);
        const costs = await page.evaluate(
          () => window.__campaignField?.costs?.() ?? null,
        );
        results.digcost[`field=${field}`] = {
          terrainRenderer: info.terrainRenderer,
          rows: Number((Number(info.rigWorldY) - from).toFixed(1)),
          frames: digging.length,
          parked: { p50: p(parked, 0.5), p95: p(parked, 0.95) },
          digging: {
            p50: p(digging, 0.5),
            p95: p(digging, 0.95),
            p99: p(digging, 0.99),
          },
          field: costs && {
            scan: { p50: p(costs.sync, 0.5), p95: p(costs.sync, 0.95) },
            patches: costs.patch.length,
            patch: {
              p50: p(costs.patch, 0.5),
              p95: p(costs.patch, 0.95),
              max: p(costs.patch, 1),
            },
            patchTexels: { p50: p(costs.area, 0.5), max: p(costs.area, 1) },
            upload: { p50: p(costs.upload, 0.5), p95: p(costs.upload, 0.95) },
            draw: costs.draw && {
              p50: p(costs.draw, 0.5),
              p95: p(costs.draw, 0.95),
            },
          },
        };
        console.log(
          `digcost field=${field} ×${throttle}: ${JSON.stringify(results.digcost[`field=${field}`])}`,
        );
        assert.deepEqual(faults, []);
      } finally {
        await context.close();
      }
    }
    const on = results.digcost["field=1"],
      off = results.digcost["field=0"];
    if (on && off) {
      results.digcost.diggingP95Delta = Number(
        (on.digging.p95 - off.digging.p95).toFixed(2),
      );
      console.log(
        `digcost: digging p95 field − main = ${results.digcost.diggingP95Delta} ms (limit +2)`,
      );
      // Shared CI runners time too unevenly to gate on: T2_DIGCOST_ASSERT=0
      // reports without asserting.
      if (process.env.T2_DIGCOST_ASSERT !== "0")
        assert.ok(
          on.digging.p95 <= off.digging.p95 + 2,
          "digging costs the field no more than 2 ms over main (p95)",
        );
    }
  }
  if (checks.has("motion")) {
    // §9.3 on the field quad alone. SITE-4: everything within 6 tiles is
    // known, so a dig below the rig moves nothing but the dug cell.
    const { context, page, faults } = await open(browser, FORMS.desktop, {
      field: 1,
      backing: 1,
    });
    try {
      const checkpoint = fixtures["c-site-W01-SITE-4-wreck@2"].checkpoint();
      // Every frame through the camera of the first, so pixels compare.
      const frame = (view) =>
        page.evaluate((v) => window.__campaignField.colour(v), view);
      const view = async () => {
        const info = await dataset(page);
        return {
          snapshot: JSON.parse(info.viewSnapshot),
          rig: [Number(info.rigWorldX), Number(info.rigWorldY)],
          dpr: Number(info.viewDpr),
        };
      };
      const record = async (running) => {
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        await page.evaluate(
          (run) =>
            run
              ? window.__campaignDebug.sceneClock.resume()
              : window.__campaignDebug.sceneClock.freeze(0),
          running,
        );
        const start = await view(),
          camera = {
            scrollX: start.snapshot.scrollX,
            scrollY: start.snapshot.scrollY,
          },
          before = await frame(camera);
        await keys(page, ["ArrowDown"]);
        // Step until the field patches (the dig lands), then frame by frame.
        const uploads = () =>
          page.evaluate(() => window.__campaignField.info().uploads);
        const first = await uploads();
        let waited = 0;
        while ((await uploads()) === first && waited++ < 600)
          await page.clock.fastForward(1000 / 60);
        assert.ok(waited < 600, "the rig dug a cell");
        await keys(page, []);
        const frames = [await frame(camera)];
        for (let n = 0; n < 24; n++) {
          await page.clock.fastForward(1000 / 60);
          frames.push(await frame(camera));
        }
        for (let n = 0; n < 30; n++) await page.clock.fastForward(1000 / 60);
        const after = await frame(camera);
        return { before, frames, after, start, end: await view() };
      };
      const eased = await record(true),
        frozen = await record(false);
      // The frozen run shows every change at once: its first frame after
      // the dig is what the eased frames are heading for.
      const measure = (run) =>
        motionMeasure({
          before: run.before,
          target: frozen.frames[0],
          frames: run.frames,
          view: run.start.snapshot,
          dpr: run.start.dpr,
          // The dug cell: under the rig's cell at the start.
          cell: [
            Math.floor(run.start.rig[0]),
            Math.floor(run.start.rig[1]) + 1,
          ],
        });
      const a = measure(eased),
        b = measure(frozen);
      results.motion = { eased: a, frozen: b };
      console.log("motion eased " + JSON.stringify(a));
      console.log("motion frozen " + JSON.stringify(b));
      for (const [name, url] of [
        ["before", eased.before],
        ["33ms", eased.frames[2]],
        ["100ms", eased.frames[6]],
        ["after", eased.frames[24]],
        ["target", frozen.frames[0]],
      ])
        await writeFile(
          `${out}/motion-${name}.png`,
          Buffer.from(url.split(",")[1], "base64"),
        );
      const at = (list, ms) => list[Math.round((ms / 1000) * 60)];
      // The dig eases out over 120 ms: part-way after two frames, there one
      // frame after 120 ms, and never backwards.
      assert.ok(a.digChange > 5, "the dug cell changed");
      assert.ok(
        at(a.dig, 33) > 0.15 && at(a.dig, 33) < 0.9,
        `dig part-way at 33 ms: ${at(a.dig, 33)}`,
      );
      assert.ok(at(a.dig, 150) < 0.02, `dig done by 150 ms: ${at(a.dig, 150)}`);
      assert.ok(
        a.dig.every((v, i) => i === 0 || v <= a.dig[i - 1] + 0.02),
        "the dig only moves towards its end",
      );
      // Revealed cells cross-fade over 250 ms.
      assert.ok(a.revealPixels > 100, "the dig revealed cells");
      assert.ok(at(a.reveal, 50) > 0.5, `reveal over half left at 50 ms`);
      assert.ok(
        at(a.reveal, 133) > 0.05 && at(a.reveal, 133) < 0.8,
        `reveal part-way at 133 ms: ${at(a.reveal, 133)}`,
      );
      assert.ok(
        at(a.reveal, 283) < 0.02,
        `reveal done by 283 ms: ${at(a.reveal, 283)}`,
      );
      assert.ok(
        a.reveal.every((v, i) => i === 0 || v <= a.reveal[i - 1] + 0.02),
        "the reveal only moves towards its end",
      );
      // Farther than 1.2 tiles from the dug cell, nothing but reveals moves.
      assert.ok(a.farMaxLuma <= 2, `far pixels changed ${a.farMaxLuma} luma`);
      // With the clock frozen both show at once.
      assert.equal(b.dig[0], 0, "frozen clock: the dig shows at once");
      assert.equal(b.reveal[0], 0, "frozen clock: reveals show at once");
      assert.deepEqual(faults, []);
    } finally {
      await context.close();
    }
  }
  for (const field of fields) {
    const run = (results.runs[`field=${field}`] = {});
    if (checks.has("scramble")) {
      run.scramble = {};
      const { context, page, faults } = await open(browser, FORMS.desktop, {
        field,
        backing: 2,
      });
      try {
        for (const [name, capture] of Object.entries(fixtures)) {
          const original = capture.checkpoint();
          await restore(page, original);
          await settledView(page, original);
          const before = `${out}/field${field}-${name}-scramble-a.png`;
          await hudFree(page, before);
          const info = await dataset(page);
          assert.equal(
            info.terrainRenderer,
            field === "1" ? "field" : "retained (?field=0)",
          );
          const exported = await exportCheckpoint(page, true);
          const { checkpoint, cells, deposits } = scramble(exported);
          await restore(page, checkpoint);
          await settledView(page, checkpoint);
          const after = `${out}/field${field}-${name}-scramble-b.png`;
          await hudFree(page, after);
          const pixels = differing(before, after);
          run.scramble[name] = {
            terrainRenderer: info.terrainRenderer,
            scrambledCells: cells,
            movedDeposits: deposits,
            differingPixels: pixels,
          };
          console.log(
            `scramble field=${field} ${name}: ${cells} cells, ${deposits} deposits moved, ${pixels} differing pixels (${info.terrainRenderer})`,
          );
          assert.equal(pixels, 0, `full-frame scramble ${name}: 0 px`);
        }
        assert.deepEqual(faults, []);
      } finally {
        await context.close();
      }
    }
    if (checks.has("poi")) {
      // The fog fixture (improvement-smoke "fog"): a shaft to row 18 and a
      // hidden 2 × 5 block six columns to the right. The column before the
      // block is known cave air, and the antenna stands at its right edge.
      const { context, page, faults } = await open(browser, FORMS.desktop, {
        field,
        backing: 2,
      });
      try {
        const build = (cave) => {
          const checkpoint = fixture("W01", 18),
            mine = checkpoint.state.worlds.W01,
            column = Math.floor(checkpoint.state.vehicle.x) + 6;
          // An opened cell exposes the deposit in it, as a dig would.
          const open = (x, y) => {
            mine.tiles[y * mine.width + x] = 0;
            for (const item of mine.packages)
              if (
                item.status === "deposit" &&
                Math.floor(item.x) === x &&
                Math.floor(item.y) === y
              )
                item.status = "exposed";
          };
          for (let y = 16; y <= 20; y++) {
            for (let x = column; x <= column + 1; x++) {
              if (cave) open(x, y);
              else mine.tiles[y * mine.width + x] = 2;
              mine.discovered[y * mine.width + x] = 0;
            }
            open(column - 1, y);
            mine.discovered[y * mine.width + column - 1] = 1;
          }
          const antenna = mine.missions.find(
            (mission) => mission.id === "W01-ANTENNA",
          );
          antenna.x = column - 0.08;
          antenna.y = 18.5;
          return { checkpoint, column };
        };
        const shots = [];
        let markers = "";
        for (const cave of [false, true]) {
          const { checkpoint, column } = build(cave);
          await restore(page, checkpoint);
          const view = await settledView(page, checkpoint);
          const clip = {
            x: column * view.tile - view.cx + 3,
            y: 16 * view.tile - view.cy + 3,
            width: view.tile * 2 - 6,
            height: view.tile * 5 - 6,
          };
          const file = `${out}/field${field}-poi-${cave ? "cave" : "solid"}.png`;
          await page.screenshot({ path: file, clip });
          await page.screenshot({
            path: `${out}/field${field}-poi-${cave ? "cave" : "solid"}-frame.png`,
          });
          shots.push(file);
          markers = (await dataset(page)).poiSourceMarkers;
        }
        const pixels = differing(shots[0], shots[1]);
        run.poi = {
          terrainRenderer: (await dataset(page)).terrainRenderer,
          sourceMarkers: markers,
          differingPixels: pixels,
        };
        console.log(`poi field=${field}: ${JSON.stringify(run.poi)}`);
        assert.match(markers, /W01-ANTENNA/, "the antenna is drawn");
        assert.equal(pixels, 0, "the hidden block is the same with a cave");
        assert.deepEqual(faults, []);
      } finally {
        await context.close();
      }
    }
    if (checks.has("dig") && field === "1") {
      // Backing 1: this counts uploads, not pixels, and SwiftShader is slow.
      const { context, page, faults } = await open(browser, FORMS.desktop, {
        field,
        backing: 1,
      });
      try {
        const checkpoint = fixtures["a04-dive-60m@2"].checkpoint();
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        const start = await page.evaluate(() => ({
          field: window.__campaignField.info(),
          mined: Number(
            document.querySelector("#campaign-game").dataset.rigWorldY,
          ),
        }));
        await page.evaluate(() => (window.__renderProbe.frames.length = 0));
        const samples = [];
        await keys(page, ["ArrowDown"]);
        for (let step = 0; step < 80; step++) {
          await advance(page, 50);
          samples.push(
            await page.evaluate(() => window.__campaignField.info()),
          );
        }
        await keys(page, []);
        for (let step = 0; step < 10; step++) await advance(page, 50);
        const frames = await page.evaluate(() =>
          window.__renderProbe.frames.map((frame) => frame.subUploads),
        );
        const end = await page.evaluate(() => ({
          field: window.__campaignField.info(),
          rigY: Number(
            document.querySelector("#campaign-game").dataset.rigWorldY,
          ),
        }));
        // The rect of every upload made while digging (the import's full
        // upload before it is a loading window and not counted).
        const rects = [];
        let previous = start.field.uploads;
        for (const sample of samples) {
          if (sample.uploads > previous) rects.push(sample.lastUpload);
          previous = sample.uploads;
        }
        await page.screenshot({ path: `${out}/field1-dig.png` });
        // Parked: transitions end and their settle uploads land, then none.
        for (let step = 0; step < 20; step++) await advance(page, 50);
        await page.evaluate(() => (window.__renderProbe.frames.length = 0));
        for (let step = 0; step < 10; step++) await advance(page, 50);
        const parkedUploads = await page.evaluate(() =>
          window.__renderProbe.frames.reduce(
            (sum, frame) => sum + frame.subUploads + frame.uploads,
            0,
          ),
        );
        run.dig = {
          rigY: [start.mined, end.rigY],
          uploads: end.field.uploads - start.field.uploads,
          largestUpload: rects.reduce(
            (most, rect) => Math.max(most, rect.width * rect.height),
            0,
          ),
          largestRect: rects.reduce(
            (most, rect) =>
              rect.width * rect.height > most.width * most.height ? rect : most,
            { width: 0, height: 0 },
          ),
          maxSubUploadsPerFrame: Math.max(0, ...frames),
          framesWithUploads: frames.filter((n) => n > 0).length,
          frames: frames.length,
          parkedUploads,
          pendingAtEnd: end.field.pendingGroups,
        };
        console.log("dig " + JSON.stringify(run.dig));
        assert.ok(run.dig.uploads > 0, "the field patched while digging");
        assert.ok(run.dig.maxSubUploadsPerFrame <= 1, "one upload per frame");
        assert.ok(run.dig.largestUpload <= 160 * 160, "uploads ≤ 160 × 160");
        assert.equal(parkedUploads, 0, "no texture uploads while parked");
        assert.deepEqual(faults, []);
      } finally {
        await context.close();
      }
    }
    if (checks.has("context") && field === "1") {
      // WEBGL_lose_context: lose and restore the context at the 60 m
      // fixture; the field must come back and draw the same frame.
      const { context, page, faults } = await open(browser, FORMS.desktop, {
        field,
        backing: 1,
      });
      try {
        const checkpoint = fixtures["a04-dive-60m@2"].checkpoint();
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        const before = `${out}/field1-context-before.png`;
        await hudFree(page, before);
        await page.evaluate(() => {
          const gl = document
            .querySelector("#campaign-game canvas")
            .getContext("webgl");
          window.__loseContext = gl.getExtension("WEBGL_lose_context");
          window.__loseContext.loseContext();
        });
        await advance(page, 200);
        await page.evaluate(() => window.__loseContext.restoreContext());
        for (let n = 0; n < 10; n++) await advance(page, 50);
        const after = `${out}/field1-context-after.png`;
        await hudFree(page, after);
        const info = await dataset(page);
        run.context = {
          terrainRenderer: info.terrainRenderer,
          differingPixels: differing(before, after),
          errors: [...faults],
        };
        console.log("context " + JSON.stringify(run.context));
        assert.equal(info.terrainRenderer, "field", "the field came back");
        assert.equal(run.context.differingPixels, 0, "the same frame again");
      } finally {
        await context.close();
      }
    }
    if (checks.has("draws")) {
      run.draws = {};
      for (const [form, settings] of Object.entries(FORMS)) {
        const { context, page, faults } = await open(browser, settings, {
          field,
          ...(form === "desktop" ? { backing: 2 } : {}),
        });
        try {
          for (const [name, capture] of Object.entries(fixtures)) {
            const checkpoint = capture.checkpoint();
            await restore(page, checkpoint);
            await settledView(page, checkpoint);
            await page.evaluate(() => (window.__renderProbe.frames.length = 0));
            for (let n = 0; n < 6; n++) await advance(page, 50);
            const info = await dataset(page);
            const probe = await page.evaluate(readRenderProbe);
            run.draws[`${form} ${name}`] = {
              terrainRenderer: info.terrainRenderer,
              drawCalls: Number(info.drawCalls),
              backingScale: Number(info.backingScale),
              qualityTier: info.qualityTier,
              stillTextureUploads: probe.textureUploads,
              stillTextureSubUploads: probe.textureSubUploads,
            };
            console.log(
              `draws field=${field} ${form} ${name}: ${JSON.stringify(run.draws[`${form} ${name}`])}`,
            );
            // §7: 12 draw calls on desktop, 10 on a phone; nothing uploads
            // in a still frame.
            assert.ok(
              Number(info.drawCalls) <= (form === "phone" ? 10 : 12),
              `${form} ${name}: ${info.drawCalls} draw calls`,
            );
            assert.equal(probe.textureUploads + probe.textureSubUploads, 0);
          }
          assert.deepEqual(faults, []);
        } finally {
          await context.close();
        }
      }
    }
    if (checks.has("frametime")) {
      run.frametime = {};
      for (const [form, backing] of [
        ["desktop", 2],
        ["phone", 1.5],
      ]) {
        const { context, page, faults } = await open(
          browser,
          FORMS[form],
          { field, backing, debug: "frametime" },
          false,
        );
        try {
          const checkpoint = fixtures["c-site-W01-SITE-4-wreck@2"].checkpoint();
          await page.evaluate(() => window.__campaignDebug.sceneClock.resume());
          await importCheckpoint(page, checkpoint);
          for (
            let n = 0;
            n < 3 &&
            (await page.evaluate(() => document.body.dataset.campaignOverlay));
            n++
          ) {
            await closeOverlay(page);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          // The readout's p95 covers the last 10 s of real time.
          await new Promise((resolve) =>
            setTimeout(resolve, playSeconds * 1000),
          );
          const readout = await page.evaluate(
            () => document.querySelector("#campaign-frametime")?.textContent,
          );
          const info = await dataset(page);
          // The field quad alone against a one-tap copy, off screen.
          const benchmark = await page.evaluate(
            () => window.__campaignField?.benchmark(3) ?? null,
          );
          run.frametime[form] = {
            backing,
            terrainRenderer: info.terrainRenderer,
            readout,
            benchmark,
            frameP95: Number(info.frameP95),
            drawCalls: Number(info.drawCalls),
          };
          console.log(
            `frametime field=${field} ${form} @${backing}: ${JSON.stringify(readout)} ${JSON.stringify(benchmark)}`,
          );
          assert.deepEqual(faults, []);
        } finally {
          await context.close();
        }
      }
    }
  }
  // Against main's renderer: the field's quad is one draw more, and where
  // the sky is in the frame it also splits the sprite batch (the sky below
  // it, everything else above): two more at most.
  const fieldDraws = results.runs["field=1"]?.draws,
    mainDraws = results.runs["field=0"]?.draws;
  if (fieldDraws && mainDraws)
    for (const [name, on] of Object.entries(fieldDraws)) {
      const off = mainDraws[name];
      console.log(
        `draws ${name}: field ${on.drawCalls}, main ${off.drawCalls}`,
      );
      assert.ok(
        on.drawCalls <= off.drawCalls + 2,
        `${name}: the field adds at most two draws`,
      );
    }
} finally {
  await browser.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}
