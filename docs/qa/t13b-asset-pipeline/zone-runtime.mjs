/**
 * Audit T13b, runtime evidence for the zone pages.
 *
 *   resident    resident texture bytes per form and stage, read the way
 *               scripts/render-memory.mjs reads them (frozen clock, reduced
 *               motion, Render quality 2, WebGL), with the F1 readout
 *               (?debug=frametime) saved as a screenshot per stage. Runs on
 *               any tree: before the runtime stage there is no "tex" line and
 *               no per-group dataset, and the bytes come from
 *               data-resident-texture-bytes either way.
 *   crossworld  frames drawn from the other world's atlas render: the rig
 *               (W01 core) in W02, W02's upgrades and tools (W02 core) in W01,
 *               the W01 sites, cold pockets and seams in W02's bands, ice
 *               vents, and the surface; image() misses nothing.
 *
 *   PREVIEW_URL=http://127.0.0.1:5173/ CHROMIUM_PATH=… \
 *     node docs/qa/t13b-asset-pipeline/zone-runtime.mjs resident OUT_DIR
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  exportCheckpoint,
  freeze,
  idle,
  importCheckpoint,
} from "../../../scripts/campaign-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const mode = process.argv[2] || "resident";
const output = process.argv[3] || `artifacts/t13b-${mode}`;
await mkdir(output, { recursive: true });
const fixture = async (world) =>
  JSON.parse(
    await readFile(
      new URL(
        `../../../tests/fixtures/improvement-${world.toLowerCase()}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
/** Moves the rig to (x, row) of `world`, its column dug open from the top. */
function place(checkpoint, world, x, row, reveal = false) {
  const state = checkpoint.state,
    mine = state.worlds[world];
  state.currentWorld = world;
  state.vehicle = { x, y: row - 0.36, energy: 9, hull: 10 };
  for (let y = 0; y < row; y++) {
    mine.tiles[y * mine.width + Math.floor(x)] = 0;
    for (const item of mine.packages)
      if (
        item.status === "deposit" &&
        Math.floor(item.x) === Math.floor(x) &&
        Math.floor(item.y) === y
      )
        item.status = "exposed";
  }
  if (reveal) mine.discovered.fill(1);
  // Cargo cannot stay behind in a world the rig left: drop it where it is.
  for (const [id, other] of Object.entries(state.worlds))
    if (id !== world)
      for (const item of other.packages)
        if (item.status === "carried") item.status = "exposed";
  return checkpoint;
}
const FORMS = {
  desktop: { viewport: { width: 1440, height: 900 }, dpr: 2 },
  phone: { viewport: { width: 393, height: 851 }, dpr: 3, touch: true },
  // D1's @4x path: desktop at backing 2 with tiles ≥ 72.1 CSS px.
  "desktop-1728": { viewport: { width: 1728, height: 1117 }, dpr: 2 },
  "desktop-tile82": {
    viewport: { width: 1440, height: 900 },
    dpr: 2,
    query: "tile=82",
  },
  // The audit's T13b line: a DPR 3 phone with tiles > 48 CSS px loads @3x.
  "phone-tile56": {
    viewport: { width: 393, height: 851 },
    dpr: 3,
    touch: true,
    query: "tile=56",
  },
};
async function open(browser, form) {
  const { viewport, dpr, touch = false, query = "" } = FORMS[form];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    isMobile: touch,
    hasTouch: touch,
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "motherload.campaign.preferences.v1",
      JSON.stringify({
        reducedMotion: true,
        coachSkipped: true,
        sound: false,
        renderScale: 2,
      }),
    ),
  );
  const page = await context.newPage();
  const faults = [];
  page.on("pageerror", (error) => faults.push(error.message));
  await freeze(page);
  await page.goto(
    `${base}?renderer=webgl&debug=frametime${query ? "&" + query : ""}`,
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
/** render-memory.mjs's settle: network idle and five equal byte samples. */
async function settle(page) {
  await page.waitForLoadState("networkidle");
  let previous = 0,
    same = 0;
  for (let n = 0; n < 40; n++) {
    await advance(page, 50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const bytes = await page
      .locator("#campaign-game")
      .evaluate((element) => Number(element.dataset.residentTextureBytes));
    same = bytes === previous ? same + 1 : 0;
    previous = bytes;
    if (same >= 5) break;
  }
  // The readout refreshes twice a second of scene time.
  await advance(page, 600);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
async function read(page) {
  return page.evaluate(() => {
    const host = document.querySelector("#campaign-game");
    const data = host.dataset;
    return {
      bytes: Number(data.residentTextureBytes),
      world: data.campaignWorld,
      zone: data.residentTextureZone ?? null,
      groups: data.residentTextureGroups
        ? JSON.parse(data.residentTextureGroups)
        : null,
      density: data.atlasDensity ?? null,
      guard: data.atlasGuard ?? null,
      pages: data.atlasPages ? data.atlasPages.split(",") : null,
      dpr: Number(data.viewDpr),
      tile: Number(data.viewTile),
      drawCalls: Number(data.drawCalls) || null,
      readout: document.querySelector("#campaign-frametime")?.textContent,
      misses: window.__campaignDebug?.frameMisses?.(true) ?? null,
      textures: window.__campaignDebug?.textures?.() ?? null,
    };
  });
}

const browser = await launchBrowser();
const results = { base, mode, samples: [] };
try {
  if (mode === "resident") {
    const stages = {
      boot: undefined,
      W01: ["W01", 18],
      cave: ["W01", 43],
      W02: ["W02", 26],
    };
    const forms = (process.env.FORMS || Object.keys(FORMS).join(",")).split(
      ",",
    );
    for (const form of forms) {
      const { context, page, faults } = await open(browser, form);
      try {
        for (const [stage, at] of Object.entries(stages)) {
          if (at) {
            const [world, row] = at;
            const checkpoint = await fixture(world);
            place(checkpoint, world, checkpoint.state.vehicle.x, row);
            await importCheckpoint(page, checkpoint);
            await closeOverlay(page);
          }
          await settle(page);
          // Count misses over a quiet stretch after the pages settled.
          await page.evaluate(() =>
            window.__campaignDebug?.frameMisses?.(true),
          );
          await advance(page, 300);
          const sample = { form, stage, ...(await read(page)) };
          await page
            .locator("#campaign-frametime")
            .screenshot({ path: `${output}/${form}-${stage}-readout.png` });
          if (stage === "boot" || stage === "cave")
            await page.screenshot({ path: `${output}/${form}-${stage}.png` });
          sample.faults = [...faults];
          results.samples.push(sample);
          console.log(
            `${form} ${stage}: ${(sample.bytes / 2 ** 20).toFixed(2)} MiB` +
              (sample.zone
                ? ` · ${sample.zone} · @${sample.density}` +
                  (sample.guard ? ` · guard ${sample.guard}` : "") +
                  ` · misses ${JSON.stringify(sample.misses)}`
                : ""),
          );
        }
      } finally {
        await context.close();
      }
    }
  } else {
    // Cross-world frames: each case imports a position and collects which
    // page every drawn frame came from, with image() misses.
    const drawn = {},
      misses = {};
    const record = async (page, label) => {
      await settle(page);
      await page.evaluate(() => window.__campaignDebug.frameMisses(true));
      await advance(page, 300);
      const frames = await page.evaluate(() =>
        window.__campaignDebug.drawnFrames(),
      );
      for (const { frame, texture } of frames)
        (drawn[frame] ??= new Set()).add(texture);
      const missed = await page.evaluate(() =>
        window.__campaignDebug.frameMisses(true),
      );
      for (const [frame, count] of Object.entries(missed))
        (misses[frame] ??= []).push(`${label} ×${count}`);
      results.samples.push({ label, frames: frames.length, missed });
      console.log(
        `${label}: ${frames.length} sprites, misses ${JSON.stringify(missed)}`,
      );
    };
    const { context, page, faults } = await open(browser, "desktop");
    try {
      // The improvement fixtures are generator v1 worlds, without sites or
      // pressure seams: a new campaign (v2) has them. Sweep its site rows.
      const fresh = await exportCheckpoint(page, true);
      const width = fresh.state.worlds.W01.width;
      for (const row of [8, 23, 38, 43, 47, 53, 56, 59])
        for (let x = 10.5; x < width; x += 20) {
          await importCheckpoint(
            page,
            place(structuredClone(fresh), "W01", x, row, true),
          );
          await closeOverlay(page);
          await record(page, `new W01 row ${row} x ${x}`);
        }
      // W01 with W02 hardware: level-2 upgrades and a W02 tool.
      const owned = await fixture("W02");
      owned.state.hardware = {
        drill: 2,
        energy: 2,
        cargo: 2,
        hull: 2,
        engine: 2,
      };
      // The thermal auger needs no W02 milestone (the other tools do, and
      // the import checks their sample proof), so it stands for tool-*.
      owned.state.ownedGear = [
        ...new Set([...owned.state.ownedGear, "W02-R1"]),
      ];
      owned.state.equipped = { ...owned.state.equipped, drill: "W02-R1" };
      await importCheckpoint(page, place(owned, "W01", 31.5, 18, true));
      await closeOverlay(page);
      await record(page, "W01 row 18, W02 hardware");
      // Both surfaces, and a sweep of both worlds' bands, everything known.
      for (const world of ["W01", "W02"]) {
        const surface = await fixture(world);
        await importCheckpoint(
          page,
          place(surface, world, surface.state.vehicle.x, 0, true),
        );
        await closeOverlay(page);
        await record(page, `${world} surface`);
      }
      const rows = {
        W01: [8, 23, 38, 43, 50, 53, 56, 59],
        W02: [12, 29, 43, 49, 58, 62, 72, 84, 86, 94, 99],
      };
      for (const world of ["W01", "W02"])
        for (const row of rows[world])
          for (const x of [12.5, 36.5]) {
            const checkpoint = await fixture(world);
            await importCheckpoint(
              page,
              place(checkpoint, world, x, row, true),
            );
            await closeOverlay(page);
            await record(page, `${world} row ${row} x ${x}`);
          }
      results.drawn = Object.fromEntries(
        Object.entries(drawn)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([frame, keys]) => [frame, [...keys].sort()]),
      );
      results.misses = misses;
      results.faults = faults;
      for (const [frame, keys] of Object.entries(results.drawn))
        console.log(`${frame}: ${keys.join(", ")}`);
    } finally {
      await context.close();
    }
    assert.deepEqual(results.misses, {}, "No frame resolved to a missing page");
    assert.deepEqual(results.faults, [], "No browser exceptions");
  }
} finally {
  await browser.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}
