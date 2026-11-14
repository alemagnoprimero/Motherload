/**
 * A7 art in the game's SITE-4 fixture, plus the 60/150/330 m transit frames.
 * The before/after pair is the same build with the explicit art-review hook
 * empty/populated. Automatic cave placement belongs to T5. No checkpoint
 * geology, discovery, deposits or collision are changed for these pictures.
 *
 * PREVIEW_URL=… node scripts/art-captures-dressing.mjs OUT
 * DRESSING_DETAILS=0: only the eight canonical frames in each half.
 * DRESSING_ONLY=prefix,prefix: limit capture names (both halves).
 * DRESSING_PHASES=after: resume only the named comma-separated phases.
 * DRESSING_FAST_DETAILS=1: the 14 detail views, one import per camera/form.
 * ART_SEARCH=field=0: fallback (default field=1); ART_BACKING=2 by default.
 * DRESSING_PLAN=1: inspect known-safe review poses without launching a browser.
 * Every screenshot uses art-captures.mjs's two-identical-frames rule.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CAPTURES,
  FORMS,
  runArtCaptures,
  settledArtShot,
} from "./art-captures.mjs";
import { launchBrowser } from "./browser-launch.mjs";
import { advance, freeze, noErrors, ready } from "./campaign-smoke.mjs";
import { restore, settledView } from "./improvement-smoke.mjs";
import { installRenderProbe } from "./render-probe.mjs";
import { dressingFrames } from "../assets/campaign/source/w01-dressing.mjs";
import { reviewFrameKnown } from "../src/campaign/render/dressing-review.ts";

const frames = new Map(dressingFrames().map((frame) => [frame.name, frame]));
const site = CAPTURES.find(
  (capture) => capture.name === "c-site-W01-SITE-4-wreck@2",
);

/** Original authoring units are 96 px per world tile. */
function pose(name, x, y) {
  const frame = frames.get(name);
  assert.ok(frame, `${name}: authored frame exists`);
  return {
    frame: name,
    world: "W01",
    x,
    y,
    width: frame.width / 96,
    height: frame.height / 96,
  };
}

function ceiling(name, x, edge) {
  const frame = frames.get(name);
  // Bury the root in the known support; the full transparent frame still
  // passes the renderer's information gate, including the filter gutter.
  return pose(name, x, edge - 0.12 + frame.height / 192);
}

function floor(name, x, edge) {
  const frame = frames.get(name);
  return pose(name, x, edge - frame.baseline / 96 + frame.height / 192);
}

function crystal(size, highContrast) {
  const suffix = highContrast ? "-hc" : "";
  const wall = `cave-crystal-wall-${size}${suffix}`;
  return [
    floor(`cave-crystal-floor-${size}${suffix}`, 13.34, 46),
    pose(wall, 10.98 + frames.get(wall).width / 192, 40.65),
  ];
}

/** Explicit art poses on the original fixture's known ceiling/floor faces. */
export function reviewPosesFor(set = "overview") {
  if (set.startsWith("group-")) {
    const group = Number(set.slice("group-".length));
    assert.ok(group >= 0 && group < 3);
    return [
      ceiling(`cave-stalactite-${group * 3}`, 10.1, 41),
      ceiling(`cave-stalactite-${group * 3 + 1}`, 14.5, 40),
      ceiling(`cave-stalactite-${group * 3 + 2}`, 16.5, 41),
      floor(`cave-rubble-${group * 2}`, 9.6, 46),
      floor(`cave-rubble-${group * 2 + 1}`, 10.65, 46),
      floor(`cave-boulder-${group}`, 16.4, 46),
      ...crystal(group, false),
    ];
  }
  if (set.startsWith("crystal-")) {
    const match = /^crystal-([0-2])(-hc)?$/.exec(set);
    assert.ok(match, `unknown crystal review set ${set}`);
    return crystal(Number(match[1]), Boolean(match[2]));
  }
  if (set.startsWith("stalactite-")) {
    const group = Number(set.slice("stalactite-".length));
    assert.ok(group >= 0 && group < 3);
    return [
      ceiling(`cave-stalactite-${group * 3}`, 10.8, 41),
      ceiling(`cave-stalactite-${group * 3 + 1}`, 14.5, 40),
      ceiling(`cave-stalactite-${group * 3 + 2}`, 16.5, 41),
    ];
  }
  if (set === "rust")
    return [
      ceiling("cave-rust-drip-0", 10.65, 41),
      ceiling("cave-rust-drip-1", 14.4, 40),
      ceiling("cave-rust-drip-2", 15.5, 40),
      ceiling("cave-rust-drip-3", 16.7, 41),
      ...Array.from({ length: 6 }, (_, i) =>
        pose(`cave-rust-particle-${i}`, 10.4 + i * 0.35, 43.5),
      ),
    ];
  if (set === "rubble")
    return [8.65, 9.8, 10.9, 13.5, 16.4, 17.6].map((x, i) =>
      floor(`cave-rubble-${i}`, x, 46),
    );
  if (set === "boulder")
    return [9.7, 13.5, 16.9].map((x, i) => floor(`cave-boulder-${i}`, x, 46));
  assert.equal(set, "overview", `unknown review set ${set}`);
  return [
    ceiling("cave-stalactite-2", 10.8, 41),
    ceiling("cave-stalactite-7", 14.5, 40),
    ceiling("cave-rust-drip-2", 16.6, 41),
    floor("cave-rubble-1", 9.6, 46),
    floor("cave-rubble-4", 17.6, 46),
    floor("cave-boulder-1", 16.4, 46),
    pose(
      "cave-crystal-wall-1",
      10.98 + frames.get("cave-crystal-wall-1").width / 192,
      40.65,
    ),
  ];
}

function knownView(checkpoint) {
  const world = checkpoint.state.worlds.W01;
  const known = (x, y) =>
    y >= 0 && y < world.rows && world.discovered[y * world.width + x] === 1;
  const deposits = new Set(
    world.packages
      .filter(
        (item) =>
          item.status === "deposit" &&
          known(Math.floor(item.x), Math.floor(item.y)),
      )
      .map((item) => `${Math.floor(item.x)}:${Math.floor(item.y)}`),
  );
  return {
    id: world.id,
    width: world.width,
    rows: world.rows,
    known,
    deposit: (x, y) => deposits.has(`${x}:${y}`),
  };
}

export function dressingCaptures(details = true) {
  const canonical = CAPTURES.filter((capture) =>
    [
      "a04-dive-60m@2",
      "a04p-dive-60m-phone@3",
      "a05-dive-150m@2",
      "b-330m-plate-band-C@2",
      "c-site-W01-SITE-4-wreck@2",
      "p-portrait-cavern-site4@3",
    ].includes(capture.name),
  ).map((capture) => ({
    ...capture,
    reviewSet: capture.scene === "SITE-4" ? "overview" : undefined,
  }));
  for (const [source, name, panel] of [
    ["a05-dive-150m@2", "a05p-dive-150m-phone@3", "shaft-tall"],
    ["b-330m-plate-band-C@2", "b-330mp-plate-band-C-phone@3", "cavern-tall"],
  ])
    canonical.push({
      ...CAPTURES.find((capture) => capture.name === source),
      name,
      form: "phone",
      panel,
      twin: true,
    });
  if (!details) return canonical;
  const sets = [
    "group-0",
    "group-1",
    "group-2",
    "rust",
    ...[0, 1, 2].map((size) => `crystal-${size}-hc`),
  ];
  for (const form of ["desktop", "phone"])
    for (const set of sets)
      canonical.push({
        ...site,
        name: `a7-${set}-${form}@${form === "desktop" ? 2 : 3}`,
        scene: `SITE-4 art detail (${set})`,
        panel: form === "desktop" ? "cavern-wide" : "cavern-tall",
        form,
        reviewSet: set,
        reviewFamilies: set.startsWith("group-")
          ? ["stalactite", "rubble", "boulder", "crystal"]
          : [set === "rust" ? "rust" : "crystal"],
        // The phone's normal camera shows 8.5 tiles. This explicit detail
        // framing shows every staged source while keeping the rig off
        // the crystal's only ore-clear floor. Canonical frames stay native.
        ...(form === "phone" && set !== "rust"
          ? { search: { tile: "32" } }
          : {}),
        checkpoint: () => {
          const checkpoint = site.checkpoint();
          // Detail camera only: put the rig on the existing known floor at
          // edge at (15,46), clear of the crystal's only ore-clear ledge.
          // All eight canonical frames retain their original camera and rig.
          if (set !== "rust") checkpoint.state.vehicle.x = 14.65;
          return checkpoint;
        },
      });
  return canonical;
}

async function stageDressing(
  page,
  capture,
  checkpoint,
  phase,
  out,
  records,
  warmSteps = 7,
) {
  const highContrast = capture.reviewSet?.endsWith("-hc") ?? false;
  await page.evaluate((value) => {
    const control = document.querySelector('[data-setting="highContrast"]');
    if (control.checked !== value) {
      control.checked = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, highContrast);
  const poses =
    phase === "after" && capture.reviewSet
      ? reviewPosesFor(capture.reviewSet)
      : [];
  // runArtCaptures has already restored and settled this checkpoint.
  // Its original discovery is a conservative subset of any reveal
  // made while restoring, so the check needs no menu/export round trip.
  const view = knownView(checkpoint);
  const tileDpr = await page
    .locator("#campaign-game")
    .evaluate(
      (element) =>
        Number(element.dataset.viewTile) * Number(element.dataset.backingScale),
    );
  for (const item of poses)
    assert.ok(
      reviewFrameKnown(item, view, 2 / tileDpr),
      `${capture.name}: entire ${item.frame} footprint is known and ore-clear`,
    );
  await page.evaluate(
    (items) => window.__campaignDebug.dressingReview(items),
    poses,
  );
  // Changing contrast or the posed frames can populate render caches.
  // Warm those first, then observe five parked frames independently.
  await advance(page, warmSteps * 50);
  await page.evaluate(() => {
    window.__renderProbe.frames.length = 0;
  });
  await advance(page, 350);
  const report = await page.evaluate(() => ({
    ...window.__campaignDebug.dressingReview(),
    drawn: window.__campaignDebug
      .drawnFrames()
      .filter(({ frame }) => frame.startsWith("cave-")),
    emissives: window.__campaignDebug
      .emissives()
      .filter(({ frame }) => frame.startsWith("cave-")),
    highContrast: document.querySelector("#campaign-game").dataset.highContrast,
    renderer: document.querySelector("#campaign-game").dataset.renderer,
    view: (() => {
      const { dataset } = document.querySelector("#campaign-game");
      return {
        width: Number(dataset.viewWidth),
        height: Number(dataset.viewHeight),
        tile: Number(dataset.viewTile),
        scrollX: Number(dataset.viewCameraX),
        scrollY: Number(dataset.viewCameraY),
        rigScreenX: Number(dataset.rigScreenX),
        rigScreenY: Number(dataset.rigScreenY),
      };
    })(),
    residentTextureBytes: Number(
      document.querySelector("#campaign-game").dataset.residentTextureBytes,
    ),
    textures: window.__campaignDebug.textures(),
    parkedFrames: window.__renderProbe.frames.slice(-5),
  }));
  const drawLimit = capture.form === "phone" ? 10 : 12;
  const textureLimit = (capture.form === "phone" ? 40 : 64) * 1024 ** 2;
  const maxDraws = Math.max(...report.parkedFrames.map((f) => f.draws));
  const maxUploads = Math.max(
    ...report.parkedFrames.map((f) => f.uploads + f.subUploads),
  );
  report.gates = { maxDraws, drawLimit, maxUploads, textureLimit };
  report.warmSteps = warmSteps;
  records.captures[`${phase}/${capture.name}`] = {
    poses,
    reviewFamilies: capture.reviewFamilies,
    report,
  };
  // Persist the observed values before enforcing the hard gates, so a
  // failure remains inspectable without rerunning a known bad frame.
  await writeFile(
    `${out}/review-poses.json`,
    JSON.stringify(records, null, 2) + "\n",
  );
  assert.equal(
    report.drawn.length,
    poses.length,
    `${capture.name}: every requested review frame draws`,
  );
  assert.equal(report.highContrast, String(highContrast));
  assert.equal(report.renderer, "webgl");
  assert.equal(report.parkedFrames.length, 5);
  if (capture.name.startsWith("a7-"))
    for (const item of poses) {
      const { tile, scrollX, scrollY, width, height } = report.view;
      assert.ok(
        (item.x - item.width / 2) * tile >= scrollX &&
          (item.x + item.width / 2) * tile <= scrollX + width &&
          (item.y - item.height / 2) * tile >= scrollY &&
          (item.y + item.height / 2) * tile <= scrollY + height,
        `${capture.name}: full ${item.frame} source is visible in the detail viewport`,
      );
    }
  assert.ok(
    maxDraws > 0 && maxDraws <= drawLimit,
    `${capture.name}: ${maxDraws} draws exceed ${drawLimit}`,
  );
  assert.equal(maxUploads, 0, `${capture.name}: parked texture uploads`);
  assert.ok(
    report.residentTextureBytes > 0 &&
      report.residentTextureBytes <= textureLimit,
    `${capture.name}: ${report.residentTextureBytes} resident bytes exceed ${textureLimit}`,
  );
  return report;
}

export async function runDressingCaptures(browser, base, out, options = {}) {
  const selected = dressingCaptures(options.details ?? true);
  let records = {
    convention:
      "Same build before/after explicit A7 art-review poses; automatic placement belongs to T5.",
    captures: {},
  };
  try {
    records = JSON.parse(await readFile(`${out}/review-poses.json`, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const phase of options.phases ?? ["before", "after"]) {
    assert.ok(["before", "after"].includes(phase));
    await runArtCaptures(browser, base, `${out}/${phase}`, {
      backing: options.backing ?? 2,
      search: options.search ?? "field=1",
      // Canonical context has both phases. Family details are additional
      // after-only views; their matching undressed context is SITE-4 above.
      captures:
        phase === "before"
          ? selected.filter((capture) => !capture.name.startsWith("a7-"))
          : selected,
      only: options.only,
      beforeNavigate: async ({ context, page }) => {
        // SwiftShader can be busy with another isolated verify browser.
        // A longer native action timeout does not relax settled-frame checks.
        page.setDefaultTimeout(120000);
        await context.addInitScript(installRenderProbe, {
          geometry: false,
          fog: false,
        });
      },
      beforeCapture: async ({ page, capture, checkpoint }) => {
        await stageDressing(page, capture, checkpoint, phase, out, records);
      },
    });
  }
  await writeFile(
    `${out}/review-poses.json`,
    JSON.stringify(records, null, 2) + "\n",
  );
  return records;
}

/** Details share a fixed checkpoint; only the posed art/contrast changes. */
export async function runDressingDetails(browser, base, out, options = {}) {
  await mkdir(`${out}/after`, { recursive: true });
  const selected = dressingCaptures(true).filter(
    (capture) =>
      capture.name.startsWith("a7-") &&
      (!options.only?.length ||
        options.only.some((name) => capture.name.startsWith(name))),
  );
  let records = {
    convention:
      "Same build before/after explicit A7 art-review poses; automatic placement belongs to T5.",
    captures: {},
  };
  let manifest = {
    base,
    convention:
      "Actual after-only detail views; one checkpoint import per form/camera, independently settled pixels for every posed set.",
    captures: {},
  };
  for (const file of ["review-poses.json", "after/manifest.json"])
    try {
      const saved = JSON.parse(await readFile(`${out}/${file}`, "utf8"));
      if (file === "review-poses.json") records = saved;
      else manifest = saved;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  for (const form of ["desktop", "phone"])
    for (const camera of ["group", "rust"]) {
      const captures = selected.filter(
        (capture) =>
          capture.form === form &&
          !manifest.captures[capture.name] &&
          (capture.reviewSet === "rust") === (camera === "rust"),
      );
      if (!captures.length) continue;
      const url = new URL(base);
      url.searchParams.set("backing", String(options.backing ?? 2));
      for (const [key, value] of new URLSearchParams(
        options.search ?? "field=1",
      ))
        url.searchParams.set(key, value);
      for (const [key, value] of Object.entries(captures[0].search ?? {}))
        url.searchParams.set(key, value);
      const { context, page } = await ready(browser, url.href, FORMS[form], {
        freezeSceneClock: true,
        beforeNavigate: async ({ context, page }) => {
          page.setDefaultTimeout(120000);
          await context.addInitScript(installRenderProbe, {
            geometry: false,
            fog: false,
          });
        },
      });
      try {
        await freeze(page);
        const checkpoint = captures[0].checkpoint();
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        // This is the imported reference, not a per-shot state export.
        const referenceCheckpoint = `${out}/after/${form}-${camera}-checkpoint.json`;
        await writeFile(referenceCheckpoint, JSON.stringify(checkpoint) + "\n");
        for (const capture of captures) {
          assert.deepEqual(capture.checkpoint(), checkpoint);
          const report = await stageDressing(
            page,
            capture,
            checkpoint,
            "after",
            out,
            records,
            5,
          );
          assert.equal(
            await page.evaluate(() => window.__campaignDebug.fade().running),
            false,
          );
          const file = `${out}/after/${capture.name}.png`;
          await writeFile(file, await settledArtShot(page));
          await page.evaluate(() => window.__campaignDebug.overlays(false));
          await advance(page, 50);
          const hudFree = `${out}/after/${capture.name}-hudfree.png`;
          await writeFile(hudFree, await settledArtShot(page));
          await page.evaluate(() => window.__campaignDebug.overlays(true));
          const measured = await page
            .locator("#campaign-game")
            .evaluate((el) => ({
              rig: [Number(el.dataset.rigWorldX), Number(el.dataset.rigWorldY)],
              backingScale: Number(el.dataset.backingScale),
              tile: Number(el.dataset.viewTile),
              x: Number(el.dataset.viewCameraX),
              y: Number(el.dataset.viewCameraY),
            }));
          assert.equal(measured.tile, report.view.tile);
          assert.equal(measured.x, report.view.scrollX);
          assert.equal(measured.y, report.view.scrollY);
          manifest.captures[capture.name] = {
            file,
            hudFree,
            referenceCheckpoint,
            scene: capture.scene,
            panel: capture.panel,
            reviewFamilies: capture.reviewFamilies,
            search: url.search,
            viewport: FORMS[form].viewport,
            deviceScaleFactor: FORMS[form].deviceScaleFactor,
            backingScale: measured.backingScale,
            rig: measured.rig,
            view: report.view,
          };
          await writeFile(
            `${out}/after/manifest.json`,
            JSON.stringify(manifest, null, 2) + "\n",
          );
          console.log(
            `${capture.name}: ${report.drawn.length} bases, ${report.emissives.length} emissives, ${report.gates.maxDraws} draws, ${report.gates.maxUploads} parked uploads`,
          );
        }
        noErrors(page);
      } finally {
        await context.close();
      }
    }
  if (!options.only?.length)
    for (const form of ["desktop", "phone"]) {
      const actual = new Set();
      for (const capture of selected.filter((item) => item.form === form)) {
        assert.ok(
          manifest.captures[capture.name],
          `${capture.name}: saved settled pixels`,
        );
        const { report } = records.captures[`after/${capture.name}`];
        for (const item of [...report.drawn, ...report.emissives])
          actual.add(item.frame);
      }
      assert.deepEqual(
        [...actual].sort(),
        [...frames.keys()].sort(),
        `${form}: all 52 base and emissive frames have actual captured coverage`,
      );
    }
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const out = resolve(process.argv[2] || "artifacts/art-dressing");
  await mkdir(out, { recursive: true });
  const options = {
    details: process.env.DRESSING_DETAILS !== "0",
    backing: Number(process.env.ART_BACKING || 2),
    search: process.env.ART_SEARCH ?? "field=1",
    only: process.env.DRESSING_ONLY?.split(",").filter(Boolean),
    phases: process.env.DRESSING_PHASES?.split(",").filter(Boolean),
  };
  if (process.env.DRESSING_PLAN === "1") {
    const plans = dressingCaptures(options.details)
      .filter((capture) => capture.reviewSet)
      .map((capture) => {
        const view = knownView(capture.checkpoint());
        return {
          name: capture.name,
          poses: reviewPosesFor(capture.reviewSet).map((item) => ({
            ...item,
            safe: reviewFrameKnown(item, view, 2 / 88),
          })),
        };
      });
    await writeFile(`${out}/plan.json`, JSON.stringify(plans, null, 2) + "\n");
    for (const capture of plans)
      for (const item of capture.poses)
        assert.ok(
          item.safe,
          `${capture.name}: ${item.frame} has a known, ore-clear footprint`,
        );
    console.log(
      `${plans.length} review captures have known, ore-clear footprints`,
    );
  } else {
    const browser = await launchBrowser();
    try {
      const run =
        process.env.DRESSING_FAST_DETAILS === "1"
          ? runDressingDetails
          : runDressingCaptures;
      await run(
        browser,
        process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
        out,
        options,
      );
    } finally {
      await browser.close();
    }
  }
}
