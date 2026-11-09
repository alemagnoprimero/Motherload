/**
 * T2 spike measurements (docs/qa/t2-spike/README.md), for the field renderer
 * behind ?field=1 and, for comparison, main's renderer (field=0):
 *
 *   scramble   full-frame hidden-information check (F7 style) on the a04 and
 *              SITE-4 fixtures: every unknown cell more than 5.5 tiles from
 *              the rig gets a random tile, hidden deposits trade places, and
 *              the HUD-free frames must not differ by one pixel. Nearer
 *              unknown cells are left alone: the visibility test casts rays
 *              through them, so scrambling them changes what the game itself
 *              reveals, not what the renderer draws.
 *   dig        the rig drills down from the 60 m fixture: the field patches
 *              on each dig, with at most one texSubImage2D of at most 160 ×
 *              160 texels per frame and none in still frames.
 *   draws      GL draw calls and texture uploads in still frames (desktop
 *              @2 and phone @3).
 *   context    WEBGL_lose_context: lose and restore the context; the field
 *              must draw the same frame again (reported, not asserted).
 *   frametime  F1's readout after real-clock play at a pinned backing
 *              scale. Under SwiftShader (no GPU) this measures the software
 *              rasteriser, not the technique (audit §7, "CI time").
 *
 * Environment: PREVIEW_URL; T2_SPIKE_DIR (artifacts/t2-spike); T2_CHECKS, a
 * comma list (scramble,dig,context,draws,frametime); T2_FIELDS (1,0);
 * T2_PLAY_SECONDS (12).
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
import { restore, settledView } from "./improvement-smoke.mjs";
import { installRenderProbe, readRenderProbe } from "./render-probe.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const out = process.env.T2_SPIKE_DIR || "artifacts/t2-spike";
const checks = new Set(
  (process.env.T2_CHECKS || "scramble,dig,context,draws,frametime").split(","),
);
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
    url.searchParams.set(key, String(value));
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

const results = { base, checks: [...checks], fields, runs: {} };
const browser = await launchBrowser();
try {
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
        }
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
          stillFrameUploads: frames.slice(-3),
          pendingAtEnd: end.field.pendingGroups,
        };
        console.log("dig " + JSON.stringify(run.dig));
        assert.ok(run.dig.uploads > 0, "the field patched while digging");
        assert.ok(run.dig.maxSubUploadsPerFrame <= 1, "one upload per frame");
        assert.ok(run.dig.largestUpload <= 160 * 160, "uploads ≤ 160 × 160");
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
} finally {
  await browser.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}
