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
 *   look       the material and geometry rows T2 answers for (§9.2, §5.3
 *              T2), at backing 1 on frames in every band of both worlds, the
 *              SITE-4 cavern on two seeds among them: unknown rock luma in
 *              range with sd ≥ 7; lit known rock, and lit hard rock alone,
 *              ≥ +15 over unknown near the lamp; rock sd within 3 tiles of
 *              the lamp ≥ 15; floors within 2 px of the collision line;
 *              walls and ceilings within 0.3 tile and 5 % of pixels;
 *              1-cell pillars flat for ≥ 0.8 tile; the natural-cave boundary
 *              ≤ 30 % axis-aligned; the frame's L* within 4 of its concept
 *              panel's at 60 m and SITE-4.
 *   ring       a world taller than one texture: with ?fieldmax=512 the field
 *              holds 31 of W01's 63 rows as a ring that follows the camera.
 *              The field quad must match the whole texture's at 60 m, after
 *              a dig that moves the window, and at SITE-4 (no pixel more
 *              than 2 levels off: the two textures round a coordinate
 *              differently here and there), with at most one upload per
 *              frame on the way.
 *   seam       x = 0, where the world wraps: the field quad alone, drawn
 *              one world width apart, is the same picture (no pixel more
 *              than 4 levels off: float rounding at edges), and the
 *              luma step across the seam's column is within 2 of the median
 *              step across the other cell boundaries in the frame.
 *   draws      GL draw calls and texture uploads in still frames (desktop
 *              @2 and phone @3).
 *   context    WEBGL_lose_context: lose and restore the context; the field
 *              must draw the same frame again.
 *   modes      the upload strategies behind ?fielddebug= (twotex, copy)
 *              against the single texture: the same dig draws the same
 *              field, 0 px, and nothing is sent once parked.
 *   frametime  condition 1's procedure on the real clock: the 60 m fixture
 *              parked and then digging, main's renderer and the field (and
 *              each T2_FRAMETIME_VARIANTS value as ?fielddebug=), reading
 *              F1's readout and a frame log that separates the frames that
 *              sent a terrain upload. Not in the default list. Under
 *              SwiftShader (no GPU) this measures the software rasteriser,
 *              not the technique (audit §7, "CI time").
 *
 * Environment: PREVIEW_URL; T2_DIR (artifacts/t2); T2_CHECKS, a comma list
 * (default tier,scramble,poi,dig,digcost,motion,look,modes,ring,seam,draws,
 * context); T2_FIELDS (1,0);
 * T2_PLAY_SECONDS (12); T2_THROTTLE (1); T2_DIG_FRAMES (600);
 * T2_FRAMETIME_VARIANTS (a ; list, "" is the default field),
 * T2_FRAMETIME_PASSES (1), T2_FRAMETIME_FORMS (desktop,phone);
 * T2_DIGCOST_ASSERT=0 reports the dig cost without asserting the 2 ms limit.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
import { CAPTURES, FORMS, runArtCaptures } from "./art-captures.mjs";
import { fixture, restore, settledView } from "./improvement-smoke.mjs";
import { installRenderProbe, readRenderProbe } from "./render-probe.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const out = process.env.T2_DIR || "artifacts/t2";
const checks = new Set(
  (
    process.env.T2_CHECKS ||
    "tier,scramble,poi,dig,digcost,motion,look,modes,ring,seam,draws,context"
  ).split(","),
);
/** Pixels of a 1440 × 900 frame the ring may differ at by more than 2 levels. */
const RING_ROUNDING_PIXELS = 64;
const throttle = Number(process.env.T2_THROTTLE || 1);
const digFrames = Number(process.env.T2_DIG_FRAMES || 600);
const fields = (process.env.T2_FIELDS || "1,0").split(",");
const playSeconds = Number(process.env.T2_PLAY_SECONDS || 12);
/** ?fielddebug= values the frametime check reads the field with ("" is the default). */
const frametimeVariants = (process.env.T2_FRAMETIME_VARIANTS ?? "").split(";");
const frametimePasses = Number(process.env.T2_FRAMETIME_PASSES || 1);
const frametimeForms = (
  process.env.T2_FRAMETIME_FORMS || "desktop,phone"
).split(",");
const fixtures = Object.fromEntries(
  ["a04-dive-60m@2", "c-site-W01-SITE-4-wreck@2"].map((name) => [
    name,
    CAPTURES.find((capture) => capture.name === name),
  ]),
);
await mkdir(out, { recursive: true });

/** A page with the render probe, the scene clock frozen at 0 and Start pressed. */
async function open(browser, form, search, clock = true) {
  // Firefox has no isMobile emulation; the touch pointer is what the tier
  // check is about, and hasTouch stays.
  const { isMobile, ...plain } = form,
    settings = process.env.BROWSER === "firefox" ? plain : form;
  const context = await browser.newContext(settings);
  await context.addInitScript(installRenderProbe, {
    geometry: false,
    fog: false,
  });
  // The page's real clock, kept before the test clock replaces it, and a
  // log of animation frames for the frametime check (off until asked).
  await context.addInitScript(() => {
    window.__realNow = performance.now.bind(performance);
    const now = window.__realNow,
      raf = window.requestAnimationFrame.bind(window),
      log = (window.__frameLog = { on: false, frames: [] });
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        const start = now();
        callback(time);
        if (log.on)
          log.frames.push([
            start,
            now() - start,
            Number(
              document.querySelector("#campaign-game")?.dataset
                .terrainUploads ?? 0,
            ),
          ]);
      });
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

/**
 * A screenshot of a frame that has settled: the same bytes twice, a step
 * apart. In Firefox a capture was taken four times (once locally, three
 * times in CI) while the camera's fade-in after an import was still
 * running: the picture mixed towards the fade's colour (12, 20, 27), by
 * 17 % in the one measured, although the page reported the fade complete
 * moments later and the next capture of the same scene was clean. The fade
 * starts when the destination's art has loaded, which is not on the test
 * clock, so no fixed number of steps is enough; two equal captures are.
 */
async function settledShot(page, options = {}) {
  let frame = await page.screenshot(options);
  for (let attempt = 0; ; attempt++) {
    await advance(page, 50);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const next = await page.screenshot(options);
    if (next.equals(frame)) return frame;
    assert.ok(attempt < 12, "the frame settles before it is captured");
    frame = next;
  }
}

async function hudFree(page, file) {
  await page.evaluate(() => window.__campaignDebug.overlays(false));
  await advance(page, 50);
  // A dialog that is still closing would dim the whole frame with its
  // backdrop, and its close is not on the test clock: wait for it.
  let open = "";
  for (let attempt = 0; attempt < 30; attempt++) {
    open = await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      return dialog ? dialog.id || dialog.className || "dialog" : "";
    });
    if (!open) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(open, "", "no dialog is open over the frame");
  await writeFile(file, await settledShot(page));
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
  if (checks.has("look")) {
    // Frames in every band of both worlds, some with hard rock beside the
    // shaft (the columns F4 measured: docs/qa/f4-value-rekey), and the
    // cavern on two seeds.
    const named = (name) => CAPTURES.find((capture) => capture.name === name);
    const shaft = (name, world, row, x) => ({
      name,
      form: "desktop",
      scene: name,
      checkpoint: () => fixture(world, row, x),
    });
    const frames = [
      named("a04-dive-60m@2"),
      named("a05-dive-150m@2"),
      named("b-330m-plate-band-C@2"),
      named("c-site-W01-SITE-4-wreck@2"),
      named("c-site-W01-SITE-4-seed2@2"),
      named("b-550m-band-D@2"),
      shaft("w01-hard-rock-C-380m", "W01", 38, 9.5),
      shaft("w01-hard-rock-D-530m", "W01", 53, 2.5),
      shaft("w02-band-A-70m", "W02", 7),
      shaft("w02-hard-rock-A-106m", "W02", 11, 36.5),
      shaft("w02-band-B-300m", "W02", 30),
      shaft("w02-hard-rock-C-526m", "W02", 53, 20.5),
      shaft("w02-band-D-850m", "W02", 85),
    ];
    const directory = `${out}/look`;
    // The capture harness starts the game with sound on, and WebKit rejects
    // AudioContext.resume() on a machine without an audio device ("Failed
    // to start the audio device"), which the harness counts as a page
    // error. These frames are about the rock: sound off.
    const quiet = {
      newContext: async (settings) => {
        const context = await browser.newContext(settings);
        await context.addInitScript(() =>
          localStorage.setItem(
            "motherload.campaign.preferences.v1",
            JSON.stringify({ sound: false }),
          ),
        );
        return context;
      },
    };
    await runArtCaptures(quiet, base, directory, {
      captures: frames,
      backing: 1,
      search: "field=1",
    });
    const look = JSON.parse(
      execFileSync("python3", ["scripts/t2-look.py", directory], {
        maxBuffer: 1 << 26,
      }).toString(),
    );
    const table = (() => {
      execFileSync("python3", [
        "scripts/art-sheets.py",
        "--captures",
        directory,
        "--out",
        directory,
        "--table-only",
      ]);
      return JSON.parse(readFileSync(`${directory}/table.json`, "utf8"));
    })();
    results.look = look;
    const problems = [];
    const hold = (ok, message) => {
      if (!ok) problems.push(message);
    };
    for (const [name, frame] of Object.entries(look)) {
      const q = frame.geometry,
        [low, high] = frame.world === "W02" ? [64, 75] : [45, 65];
      console.log(
        `look ${name}: unknown ${frame.unknown?.luma} (sd ${frame.unknown?.sd}); lit − unknown ${frame.known_lit_minus_unknown ?? "—"} (${frame.lit_cells} cells), hard ${frame.hard_lit_minus_unknown ?? "—"}; rock sd near the lamp ${frame.rock_near_light?.sd ?? "—"}; floors ${q.floor_max_px ?? "—"} px (${q.floors}); walls ${q.wall_max_tiles} tile, ${(100 * q.mismatch_share).toFixed(1)} %; pillars ${q.pillar_min_flat ?? "—"}; boundary ${frame.boundary_axis_share ?? "—"}`,
      );
      hold(frame.terrainRenderer === "field", `${name}: drawn by the field`);
      if (frame.unknown) {
        hold(
          frame.unknown.luma >= low && frame.unknown.luma <= high,
          `${name}: unknown rock luma ${frame.unknown.luma} outside ${low} to ${high}`,
        );
        hold(
          frame.unknown.sd >= 7,
          `${name}: unknown rock sd ${frame.unknown.sd} under 7`,
        );
      }
      if (frame.known_lit_minus_unknown !== null)
        hold(
          frame.known_lit_minus_unknown >= 15,
          `${name}: lit − unknown ${frame.known_lit_minus_unknown} under +15`,
        );
      if (frame.hard_lit_minus_unknown !== undefined)
        hold(
          frame.hard_lit_minus_unknown >= 15,
          `${name}: lit hard rock − unknown ${frame.hard_lit_minus_unknown} under +15`,
        );
      // The plate layer (rows 30 and 31) is T14's to restyle: its tiles
      // are one flat fill, so the 330 m frame reads about 14 and is
      // reported, not held.
      if (frame.rock_near_light && !name.startsWith("b-330m-plate"))
        hold(
          frame.rock_near_light.sd >= 15,
          `${name}: rock sd near the lamp ${frame.rock_near_light.sd} under 15`,
        );
      if (q.floor_columns) {
        hold(
          q.floor_max_px <= 2,
          `${name}: a floor is ${q.floor_max_px} px off the collision line`,
        );
        // 0.01 tile, plus the pixel a backing-1 mask cannot split.
        hold(
          q.floor_jag_tiles <= 0.01 + 1 / q.tile_px,
          `${name}: floor jag ${q.floor_jag_tiles} tile`,
        );
      }
      hold(
        q.wall_max_tiles <= 0.3 && q.mismatch_share <= 0.05,
        `${name}: walls ${q.wall_max_tiles} tile, ${q.mismatch_share} of pixels`,
      );
      if (q.pillars)
        hold(
          q.pillar_min_flat >= 0.8,
          `${name}: a pillar's flat top is ${q.pillar_min_flat} tile`,
        );
      if (frame.boundary_axis_share !== undefined)
        hold(
          frame.boundary_axis_share <= 0.3,
          `${name}: boundary ${frame.boundary_axis_share} axis-aligned`,
        );
    }
    // Frame L* against the concept crops' interiors (d0-target-panels.json).
    results.lookFrames = {};
    for (const name of ["a04-dive-60m@2", "c-site-W01-SITE-4-wreck@2"]) {
      const frame = table.frames[name],
        concept = table.concept[frame.panel];
      results.lookFrames[name] = {
        frame: frame.frame.L_mean,
        concept: concept.L_mean,
      };
      console.log(
        `look ${name}: frame L* ${frame.frame.L_mean}, concept ${concept.L_mean}`,
      );
      hold(
        Math.abs(frame.frame.L_mean - concept.L_mean) <= 4,
        `${name}: frame L* ${frame.frame.L_mean} against ${concept.L_mean}`,
      );
    }
    results.lookProblems = problems;
    assert.deepEqual(problems, [], "T2's material and geometry rows hold");
  }
  if (checks.has("ring")) {
    // The same play on two pages: the whole texture, and a 512-texel limit
    // that makes the field a ring of 31 rows. Then W02 against the 63-row
    // ring deep worlds use.
    const pages = [];
    for (const search of [
      { field: 1, backing: 1 },
      { field: 1, backing: 1, fieldmax: 512 },
    ])
      pages.push(await open(browser, FORMS.desktop, search));
    try {
      // The field quad alone (a dig throws chips, which are random). The
      // two textures differ in height, so a texture coordinate can round
      // differently: a pixel may differ by a level or two, never more.
      const shot = async (page, file) => {
        await writeFile(
          file,
          Buffer.from(
            (await page.evaluate(() => window.__campaignField.colour())).split(
              ",",
            )[1],
            "base64",
          ),
        );
        return file;
      };
      const frames = {},
        rounding = {};
      const compare = async (label, pair = pages) => {
        const files = [];
        for (const [n, { page }] of pair.entries())
          files.push(await shot(page, `${out}/ring-${label}-${n}.png`));
        const [beyond, any] = JSON.parse(
          execFileSync("python3", [
            "-c",
            "import sys,json;import numpy as np;from PIL import Image;a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int);b=np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int);d=np.abs(a-b).max(2);print(json.dumps([int((d>2).sum()),int((d>0).sum())]))",
            files[0],
            files[1],
          ]).toString(),
        );
        frames[label] = beyond;
        rounding[label] = any;
        console.log(
          `ring ${label}: ${beyond} pixels differ by more than 2 levels (${any} by 1 or 2)`,
        );
      };
      const both = (action) =>
        Promise.all(pages.map(({ page }) => action(page)));
      const a04 = fixtures["a04-dive-60m@2"].checkpoint();
      for (const { page } of pages) {
        await restore(page, a04);
        await settledView(page, a04);
      }
      const info = await both((page) =>
        page.evaluate(() => window.__campaignField.info()),
      );
      await compare("60m");
      // Dig down: the window follows, patch by patch.
      await both((page) =>
        page.evaluate(() => (window.__renderProbe.frames.length = 0)),
      );
      for (const { page } of pages) {
        await keys(page, ["ArrowDown"]);
        for (let step = 0; step < 240; step++) await advance(page, 50);
        await keys(page, []);
        for (let step = 0; step < 30; step++) await advance(page, 50);
      }
      const uploads = await pages[1].page.evaluate(() =>
        Math.max(0, ...window.__renderProbe.frames.map((f) => f.subUploads)),
      );
      const after = await both((page) =>
        page.evaluate(() => ({
          field: window.__campaignField.info(),
          rigY: Number(
            document.querySelector("#campaign-game").dataset.rigWorldY,
          ),
        })),
      );
      await compare("dug");
      const site = fixtures["c-site-W01-SITE-4-wreck@2"].checkpoint();
      for (const { page } of pages) {
        await restore(page, site);
        await settledView(page, site);
      }
      const deep = await pages[1].page.evaluate(() =>
        window.__campaignField.info(),
      );
      await compare("site4");
      // The ring a deep world gets by default, 63 rows (1,010 texels), on
      // W02: its whole texture is 1,648 texels tall, so ?fieldmax=1024
      // makes that ring at W02's width, which is W04's.
      const third = await open(browser, FORMS.desktop, {
        field: 1,
        backing: 1,
        fieldmax: 1024,
      });
      const pair = [pages[0], third];
      pages.push(third);
      const w02 = fixture("W02", 60);
      for (const { page } of pair) {
        await restore(page, w02);
        await settledView(page, w02);
      }
      const w02Info = await third.page.evaluate(() =>
        window.__campaignField.info(),
      );
      await compare("w02", pair);
      for (const { page } of pair) {
        await keys(page, ["ArrowDown"]);
        for (let step = 0; step < 120; step++) await advance(page, 50);
        await keys(page, []);
        for (let step = 0; step < 30; step++) await advance(page, 50);
      }
      const w02After = await third.page.evaluate(() =>
        window.__campaignField.info(),
      );
      await compare("w02dug", pair);
      results.ring = {
        w02: {
          texture: w02Info.texture,
          ring: w02Info.ring,
          windowAfterDig: w02After.ring,
          pendingAfterDig: w02After.pendingGroups,
        },
        whole: { texture: info[0].texture, ring: info[0].ring },
        ringed: { texture: info[1].texture, ring: info[1].ring },
        rigY: after.map((a) => a.rigY),
        windowAfterDig: after[1].field.ring,
        windowAtSite4: deep.ring,
        maxSubUploadsPerFrame: uploads,
        pendingAfterDig: after[1].field.pendingGroups,
        differingPixels: frames,
        roundingPixels: rounding,
      };
      console.log("ring " + JSON.stringify(results.ring));
      assert.equal(info[0].ring, null, "W01 fits one texture");
      assert.ok(info[1].ring, "the 512-texel limit makes a ring");
      assert.ok(info[1].texture[1] <= 512, "the ring fits the limit");
      assert.equal(after[0].rigY, after[1].rigY, "the same play on both");
      assert.ok(after[1].rigY - 5.64 > 3, "the rig dug down");
      assert.ok(
        deep.ring.window > info[1].ring.window,
        "the window moved down with the camera",
      );
      assert.ok(uploads <= 1, "one upload per frame while the window moves");
      assert.equal(after[1].field.pendingGroups, 0, "the window is built");
      assert.deepEqual(
        [w02Info.texture, w02Info.ring.rows],
        [[776, 1010], 63],
        "W02 under 1,024 texels is the default ring of 63 rows",
      );
      assert.ok(
        w02Info.ring.window > 0,
        "W02's window is at the rig, 600 m down",
      );
      assert.equal(w02After.pendingGroups, 0, "W02's window is built");
      // A ring that mapped a row wrongly would differ over whole cells (a
      // cell is 4,225 px here). SwiftShader differs nowhere; llvmpipe's
      // fixed-point texture coordinates flip a threshold at a few pixels of
      // one row (12 at most in Firefox).
      for (const [label, count] of Object.entries(frames))
        assert.ok(
          count <= RING_ROUNDING_PIXELS,
          `ring ${label}: ${count} pixels differ by more than 2 levels`,
        );
      for (const { faults } of pages) assert.deepEqual(faults, []);
    } finally {
      for (const { context } of pages) await context.close();
    }
  }
  if (checks.has("modes")) {
    // The upload strategies behind ?fielddebug= (flag.ts) against the plain
    // single texture: the same dig on each page must draw the same field,
    // pixel for pixel, and leave nothing to send once parked.
    const modes = ["", "twotex", "copy"],
      pages = [];
    for (const fielddebug of modes)
      pages.push(
        await open(browser, FORMS.desktop, {
          field: 1,
          backing: 1,
          fielddebug: fielddebug || undefined,
        }),
      );
    try {
      const differing = async (label) => {
        const files = [];
        for (const [n, { page }] of pages.entries()) {
          const file = `${out}/modes-${label}-${modes[n] || "single"}.png`;
          await writeFile(
            file,
            Buffer.from(
              (
                await page.evaluate(() => window.__campaignField.colour())
              ).split(",")[1],
              "base64",
            ),
          );
          files.push(file);
        }
        return JSON.parse(
          execFileSync("python3", [
            "-c",
            "import sys,json;import numpy as np;from PIL import Image;a=[np.asarray(Image.open(f).convert('RGB')).astype(int) for f in sys.argv[1:]];print(json.dumps([int((np.abs(a[0]-b).max(2)>0).sum()) for b in a[1:]]))",
            ...files,
          ]).toString(),
        );
      };
      const a04 = fixtures["a04-dive-60m@2"].checkpoint();
      results.modes = { differingPixels: {}, uploads: {} };
      for (const { page } of pages) {
        await restore(page, a04);
        await settledView(page, a04);
        await page.evaluate(() => (window.__renderProbe.frames.length = 0));
      }
      results.modes.differingPixels["60m"] = await differing("60m");
      for (const { page } of pages) {
        await keys(page, ["ArrowDown"]);
        for (let step = 0; step < 120; step++) await advance(page, 50);
        await keys(page, []);
        for (let step = 0; step < 30; step++) await advance(page, 50);
      }
      results.modes.differingPixels.dug = await differing("dug");
      // Parked: the light map and the transitions have had time to settle.
      for (const { page } of pages)
        for (let step = 0; step < 40; step++) await advance(page, 50);
      for (const [n, { page }] of pages.entries()) {
        const frames = await page.evaluate(() =>
          window.__renderProbe.frames.map((f) => [f.subUploads, f.uploads]),
        );
        results.modes.uploads[modes[n] || "single"] = {
          frames: frames.length,
          framesWithUploads: frames.filter(([sub, full]) => sub + full > 0)
            .length,
          // Patches are sub-uploads (the light map's are whole uploads);
          // "copy" sends its patch as a whole upload of a small texture.
          mostPerFrame: Math.max(0, ...frames.map(([sub]) => sub)),
          parked: frames
            .slice(-20)
            .reduce((sum, [sub, full]) => sum + sub + full, 0),
        };
      }
      const site = fixtures["c-site-W01-SITE-4-wreck@2"].checkpoint();
      for (const { page } of pages) {
        await restore(page, site);
        await settledView(page, site);
      }
      results.modes.differingPixels.site4 = await differing("site4");
      console.log("modes " + JSON.stringify(results.modes));
      for (const [label, counts] of Object.entries(
        results.modes.differingPixels,
      ))
        assert.deepEqual(
          counts,
          [0, 0],
          `modes ${label}: twotex and copy draw the single texture's field`,
        );
      for (const [mode, sent] of Object.entries(results.modes.uploads)) {
        assert.ok(
          sent.mostPerFrame <=
            (mode === "twotex" ? 2 : mode === "copy" ? 0 : 1),
          `modes ${mode}: ${sent.mostPerFrame} patch uploads in a frame`,
        );
        assert.equal(sent.parked, 0, `modes ${mode}: nothing sent once parked`);
      }
      for (const { faults } of pages) assert.deepEqual(faults, []);
    } finally {
      for (const { context } of pages) await context.close();
    }
  }
  if (checks.has("seam")) {
    // A shaft 2.5 tiles right of x = 0, so the seam crosses the frame.
    const { context, page, faults } = await open(browser, FORMS.desktop, {
      field: 1,
      backing: 1,
    });
    try {
      const checkpoint = fixture("W01", 6, 2.5);
      await restore(page, checkpoint);
      await settledView(page, checkpoint);
      const info = await dataset(page),
        view = JSON.parse(info.viewSnapshot),
        width = Number(info.worldWidth);
      const here = { scrollX: view.scrollX, scrollY: view.scrollY },
        around = {
          scrollX: view.scrollX + width * view.tile,
          scrollY: view.scrollY,
        };
      const frame = (camera) =>
        page.evaluate((c) => window.__campaignField.colour(c), camera);
      const files = [];
      for (const [name, camera] of [
        ["here", here],
        ["around", around],
      ]) {
        files.push(`${out}/seam-${name}.png`);
        await writeFile(
          files.at(-1),
          Buffer.from((await frame(camera)).split(",")[1], "base64"),
        );
      }
      // One world width on, the same coordinates arrive with other float
      // rounding: an edge pixel may move a few levels, nothing more.
      const [wrapped, rounding] = JSON.parse(
        execFileSync("python3", [
          "-c",
          "import sys,json;import numpy as np;from PIL import Image;a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int);b=np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int);d=np.abs(a-b).max(2);print(json.dumps([int((d>4).sum()),int((d>0).sum())]))",
          files[0],
          files[1],
        ]).toString(),
      );
      // Luma steps across cell boundaries: the seam's against the others'.
      const steps = JSON.parse(
        execFileSync("python3", [
          "-c",
          `
import json, sys
import numpy as np
from PIL import Image
rgb = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(float)
luma = rgb @ np.array([0.2126, 0.7152, 0.0722])
tile, scroll_x, scroll_y, dpr = map(float, sys.argv[2:6])
top = max(0, int(round((0.5 * tile - scroll_y) * dpr)))
def step(cell):
    x = int(round((cell * tile - scroll_x) * dpr))
    if x < 2 or x > luma.shape[1] - 2:
        return None
    return float(np.abs(luma[top:, x] - luma[top:, x - 1]).mean())
first = int(np.floor(scroll_x / tile)) + 1
cells = [c for c in range(first, first + int(luma.shape[1] / dpr / tile)) if step(c) is not None]
print(json.dumps({"seam": step(0), "others": {str(c): round(step(c), 2) for c in cells if c != 0}}))
`,
          files[0],
          String(view.tile),
          String(view.scrollX),
          String(view.scrollY),
          String(view.dpr),
        ]).toString(),
      );
      const others = Object.values(steps.others);
      results.seam = {
        seamColumnPx: Math.round(-view.scrollX * view.dpr),
        wrappedDifferingPixels: wrapped,
        wrappedRoundingPixels: rounding,
        seamStep: Number(steps.seam.toFixed(2)),
        otherBoundaries: {
          median: [...others].sort((a, b) => a - b)[others.length >> 1],
          max: Math.max(...others),
        },
      };
      console.log("seam " + JSON.stringify(results.seam));
      assert.ok(steps.seam !== null, "x = 0 is in the frame");
      assert.equal(
        wrapped,
        0,
        "one world width apart, the same picture (within 4 levels)",
      );
      assert.ok(
        steps.seam <= results.seam.otherBoundaries.median + 2,
        "the step across x = 0 is within 2 luma of an ordinary cell boundary's",
      );
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
          // A whole-frame difference is the capture, not a leak: say what
          // the page was doing.
          if (pixels > 0)
            console.log(
              `scramble ${name} state: ${JSON.stringify(
                await page.evaluate(() => ({
                  fade: window.__campaignDebug.fade(),
                  paused: document.body.dataset.campaignPaused,
                  overlay: document.body.dataset.campaignOverlay ?? "",
                })),
              )}`,
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
          // Settled captures (settledShot): the run that failed in Firefox
          // took this crop mid-fade and the whole frame, clean, right after.
          await writeFile(file, await settledShot(page, { clip }));
          await writeFile(
            `${out}/field${field}-poi-${cave ? "cave" : "solid"}-frame.png`,
            await settledShot(page),
          );
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
  }
  if (checks.has("frametime")) {
    // Condition 1's procedure on the real clock: the 60 m fixture, parked,
    // then digging, main's renderer and the field (and each ?fielddebug=
    // variant asked for), as many passes as asked. Besides the readout, a
    // frame log splits the digging frames into those that sent a terrain
    // upload and those that did not.
    results.frametime = [];
    const variants = [
      { name: "main", search: { field: 0 } },
      ...frametimeVariants.map((variant) => ({
        name: variant ? `field (${variant})` : "field",
        search: { field: 1, fielddebug: variant || undefined },
      })),
    ];
    const summary = (values) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b),
        at = (q) =>
          sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      return {
        n: values.length,
        mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
        p50: +at(0.5).toFixed(1),
        p95: +at(0.95).toFixed(1),
        max: +sorted[sorted.length - 1].toFixed(1),
      };
    };
    /** [start, callback ms, terrain uploads so far] per animation frame. */
    const frames = async (page, on) =>
      page.evaluate((state) => {
        const log = window.__frameLog;
        const taken = log.frames;
        log.frames = [];
        log.on = state;
        return taken;
      }, on);
    const split = (log) => {
      // One entry per frame: callbacks that start within 3 ms are one frame.
      const merged = [];
      for (const [start, cost, uploads] of log) {
        const last = merged[merged.length - 1];
        if (last && start - last.start < 3) {
          last.cost += cost;
          last.uploads = uploads;
        } else merged.push({ start, cost, uploads });
      }
      // The dataset shows the upload count as of the frame before.
      const rows = [];
      for (let n = 1; n + 1 < merged.length; n++)
        rows.push({
          cost: merged[n].cost,
          interval: merged[n].start - merged[n - 1].start,
          next: merged[n + 1].start - merged[n].start,
          sent: merged[n + 1].uploads !== merged[n].uploads,
        });
      const sent = rows.filter((row) => row.sent),
        plain = rows.filter((row) => !row.sent);
      return {
        interval: summary(rows.map((row) => row.interval)),
        cost: summary(rows.map((row) => row.cost)),
        uploadFrames: {
          cost: summary(sent.map((row) => row.cost)),
          nextInterval: summary(sent.map((row) => row.next)),
        },
        otherFrames: {
          cost: summary(plain.map((row) => row.cost)),
          nextInterval: summary(plain.map((row) => row.next)),
        },
      };
    };
    const line = (text, label) =>
      Number(new RegExp(`^${label} ([\\d.]+) ms`, "m").exec(text ?? "")?.[1]);
    const forms = [
      ["desktop", 2],
      ["phone", 1.5],
    ].filter(([form]) => frametimeForms.includes(form));
    for (let pass = 1; pass <= frametimePasses; pass++)
      for (const [form, backing] of forms)
        for (const variant of variants) {
          const { context, page, faults } = await open(
            browser,
            FORMS[form],
            { ...variant.search, backing, debug: "frametime" },
            false,
          );
          try {
            const checkpoint = fixtures["a04-dive-60m@2"].checkpoint();
            await page.evaluate(() =>
              window.__campaignDebug.sceneClock.resume(),
            );
            await importCheckpoint(page, checkpoint);
            for (
              let n = 0;
              n < 3 &&
              (await page.evaluate(
                () => document.body.dataset.campaignOverlay,
              ));
              n++
            ) {
              await closeOverlay(page);
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            const wait = () =>
              new Promise((resolve) => setTimeout(resolve, playSeconds * 1000));
            const readout = () =>
              page.evaluate(
                () =>
                  document.querySelector("#campaign-frametime")?.textContent,
              );
            // The readout's p95 covers the last 10 s of real time.
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await frames(page, true);
            await wait();
            const parkedLog = split(await frames(page, false)),
              parked = await readout();
            const info = await dataset(page);
            await keys(page, ["ArrowDown"]);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await frames(page, true);
            await wait();
            const diggingLog = split(await frames(page, false)),
              digging = await readout();
            await keys(page, []);
            const row = {
              pass,
              form,
              backing,
              variant: variant.name,
              terrainRenderer: info.terrainRenderer,
              parked: {
                cpuP95: line(parked, "p95"),
                intervalP95: line(parked, "interval p95"),
                frames: parkedLog,
              },
              digging: {
                cpuP95: line(digging, "p95"),
                intervalP95: line(digging, "interval p95"),
                fieldLine: /^field scan.*$/m.exec(digging ?? "")?.[0] ?? null,
                frames: diggingLog,
              },
            };
            results.frametime.push(row);
            console.log(
              `frametime pass ${pass} ${form} @${backing} ${variant.name}: parked ${row.parked.cpuP95} / ${row.parked.intervalP95} ms, digging ${row.digging.cpuP95} / ${row.digging.intervalP95} ms (CPU p95 / interval p95)${row.digging.fieldLine ? `; ${row.digging.fieldLine}` : ""}`,
            );
            console.log(
              `frametime pass ${pass} ${form} @${backing} ${variant.name} digging frames: ${JSON.stringify(diggingLog)}`,
            );
            assert.deepEqual(faults, []);
          } finally {
            await context.close();
          }
        }
    // Per form and variant, the median of the passes.
    const median = (values) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    for (const [form] of forms)
      for (const variant of variants) {
        const rows = results.frametime.filter(
          (row) => row.form === form && row.variant === variant.name,
        );
        console.log(
          `frametime ${form} ${variant.name}, median of ${rows.length}: parked interval p95 ${median(rows.map((row) => row.parked.intervalP95))} ms, digging interval p95 ${median(rows.map((row) => row.digging.intervalP95))} ms (${rows.map((row) => row.digging.intervalP95).join(", ")}), digging CPU p95 ${median(rows.map((row) => row.digging.cpuP95))} ms`,
        );
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
