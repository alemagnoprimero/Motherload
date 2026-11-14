/**
 * Actual T4/T5 fixtures. Run against an immutable source preview; no art
 * generators are imported. Only debug render-layer switches change.
 *
 * CAVE_ITEM=T4|T5 CAVE_BUILD_ID=immutable-id PREVIEW_URL=... node ... OUT
 * CAVE_PHASES=before,after; CAVE_ONLY=name,prefix; CAVE_RESUME=0 forces recapture.
 * ART_SEARCH=field=1; ART_BACKING=2. CAVE_PLAN=1 prints a plan without a browser.
 * Each completed capture is persisted immediately. Resume validates its
 * build/config/checkpoint fingerprint and all recorded file hashes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CAPTURES, runArtCaptures } from "./art-captures.mjs";
import { advance, exportCheckpoint } from "./campaign-smoke.mjs";
import { settledView } from "./improvement-smoke.mjs";
import { launchBrowser } from "./browser-launch.mjs";
import { installRenderProbe } from "./render-probe.mjs";

const wrap = (x, width) => ((x % width) + width) % width;
const epsilon = 1e-7;
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}
const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(stable(value)),
    )
    .digest("hex");
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function atomicJson(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${path}.tmp`, path);
}

export function caveCaptures() {
  const names = [
    "a04-dive-60m@2",
    "a04p-dive-60m-phone@3",
    "a05-dive-150m@2",
    "b-330m-plate-band-C@2",
    "c-site-W01-SITE-4-wreck@2",
    "p-portrait-cavern-site4@3",
  ];
  const result = CAPTURES.filter((capture) => names.includes(capture.name)).map(
    (capture) => ({ ...capture }),
  );
  for (const [source, name, panel] of [
    ["a05-dive-150m@2", "a05p-dive-150m-phone@3", "shaft-tall"],
    ["b-330m-plate-band-C@2", "b-330mp-plate-band-C-phone@3", "cavern-tall"],
  ])
    result.push({
      ...CAPTURES.find((capture) => capture.name === source),
      name,
      form: "phone",
      panel,
      twin: true,
    });
  assert.equal(result.length, 8);
  return result;
}

export function layerOptions(item, phase) {
  assert.ok(["T4", "T5"].includes(item));
  assert.ok(["before", "after"].includes(phase));
  return {
    backWalls: item === "T5" || phase === "after",
    dressing: item === "T5" && phase === "after",
    scrambleUnknown: null,
  };
}

/** Independent reading of actual snapshot bounds, never a replacement plan. */
export function validateCaveSnapshot(snapshot, checkpoint, view) {
  const state = checkpoint.state ?? checkpoint;
  const world = state.worlds.W01;
  const known = (x, y) =>
    Number.isInteger(y) &&
    y >= 0 &&
    y < world.rows &&
    world.discovered[y * world.width + wrap(x, world.width)] === 1;
  const air = (x, y) =>
    known(x, y) && world.tiles[y * world.width + wrap(x, world.width)] === 0;
  const report = {
    backWallFragments: snapshot.backWalls.length,
    knownAirCellsChecked: 0,
    cropMaxError: 0,
    alphaMin: null,
    alphaMax: null,
    dressingProps: snapshot.dressing.length,
    dressingKnownCellsChecked: 0,
    crystalKnownDepositsRejected: 0,
    ceilingCoverage: null,
    actualDecoratedCeilings: null,
    actualCeilingCoverage: null,
    limitations: [
      "Known current air and source bounds are checked independently. Pristine natural-air classification and discovery transitions are covered by the separate runtime/unit suite.",
      "Canonical fixtures freeze the scene clock: existing knowledge must be fully revealed. No discovery, geology, collision or checkpoint contents are edited.",
    ],
  };
  const alphas = [];
  const rect = (box) => {
    assert.ok(Object.values(box).every(Number.isFinite));
    assert.ok(box.right > box.left && box.bottom > box.top);
  };
  for (const fragment of snapshot.backWalls) {
    const { bounds: b, image: im, crop: c } = fragment;
    rect(b);
    rect(im);
    assert.ok([c.x, c.y, c.width, c.height].every(Number.isFinite));
    assert.ok(
      c.x >= -epsilon && c.y >= -epsilon && c.width > 0 && c.height > 0,
    );
    assert.ok(
      c.x + c.width <= 1024 + epsilon && c.y + c.height <= 384 + epsilon,
    );
    const mapped = {
      left: im.left + (c.x / 1024) * (im.right - im.left),
      right: im.left + ((c.x + c.width) / 1024) * (im.right - im.left),
      top: im.top + (c.y / 384) * (im.bottom - im.top),
      bottom: im.top + ((c.y + c.height) / 384) * (im.bottom - im.top),
    };
    for (const edge of ["left", "right", "top", "bottom"])
      report.cropMaxError = Math.max(
        report.cropMaxError,
        Math.abs(mapped[edge] - b[edge]),
      );
    assert.ok(
      report.cropMaxError < epsilon,
      "crop/source/world transform differs",
    );
    for (
      let y = Math.floor(b.top + epsilon);
      y <= Math.ceil(b.bottom - epsilon) - 1;
      y++
    )
      for (
        let x = Math.floor(b.left + epsilon);
        x <= Math.ceil(b.right - epsilon) - 1;
        x++
      ) {
        assert.ok(
          air(x, y),
          `${fragment.id}: back wall touches unknown or solid cell ${x},${y}`,
        );
        report.knownAirCellsChecked++;
      }
    alphas.push(fragment.alpha);
  }
  assert.ok(
    Number.isFinite(view.tile) &&
      view.tile > 0 &&
      Number.isFinite(view.backingScale) &&
      view.backingScale > 0,
  );
  const gutter = 2 / (view.tile * view.backingScale);
  const knownDeposits = new Set(
    world.packages
      .filter(
        (p) =>
          known(Math.floor(p.x), Math.floor(p.y)) && p.status === "deposit",
      )
      .map((p) => `${wrap(Math.floor(p.x), world.width)}:${Math.floor(p.y)}`),
  );
  for (const placement of snapshot.dressing) {
    assert.ok(
      [
        placement.x,
        placement.y,
        placement.width,
        placement.height,
        placement.alpha,
      ].every(Number.isFinite),
    );
    assert.ok(placement.width > 0 && placement.height > 0);
    for (
      let y = Math.floor(placement.y - placement.height / 2 - gutter);
      y < Math.ceil(placement.y + placement.height / 2 + gutter);
      y++
    )
      for (
        let x = Math.floor(placement.x - placement.width / 2 - gutter);
        x < Math.ceil(placement.x + placement.width / 2 + gutter);
        x++
      ) {
        assert.ok(
          known(x, y),
          `${placement.id}: source/filter footprint touches unknown ${x},${y}`,
        );
        report.dressingKnownCellsChecked++;
      }
    assert.ok(
      air(placement.cellX, placement.cellY),
      `${placement.id}: anchor is not known air`,
    );
    if (placement.family === "crystal")
      for (
        let y = Math.floor(placement.y - placement.height / 2) - 1;
        y <= Math.ceil(placement.y + placement.height / 2);
        y++
      )
        for (
          let x = Math.floor(placement.x - placement.width / 2) - 1;
          x <= Math.ceil(placement.x + placement.width / 2);
          x++
        )
          assert.ok(
            !knownDeposits.has(`${wrap(x, world.width)}:${y}`),
            `${placement.id}: crystal is beside known ore`,
          );
    alphas.push(placement.alpha);
  }
  if (alphas.length) {
    report.alphaMin = Math.min(...alphas);
    report.alphaMax = Math.max(...alphas);
    assert.ok(
      alphas.every(
        (alpha) => Number.isFinite(alpha) && Math.abs(alpha - 1) < epsilon,
      ),
      "frozen settled fixture has a partial reveal",
    );
  }
  if (snapshot.dressingStats) {
    const { exposedCeilings, decoratedCeilings, limit } =
      snapshot.dressingStats;
    assert.ok(decoratedCeilings <= exposedCeilings && decoratedCeilings >= 0);
    assert.ok(snapshot.dressing.length <= limit);
    report.ceilingCoverage = exposedCeilings
      ? decoratedCeilings / exposedCeilings
      : null;
    if (
      [view.width, view.height, view.scrollX, view.scrollY].every(
        Number.isFinite,
      )
    ) {
      const viewport = {
        left: view.scrollX / view.tile,
        right: (view.scrollX + view.width) / view.tile,
        top: view.scrollY / view.tile,
        bottom: (view.scrollY + view.height) / view.tile,
      };
      report.actualDecoratedCeilings = new Set(
        snapshot.dressing
          .filter(
            (p) =>
              p.face === "ceiling" &&
              Math.floor(p.x) + 1 > viewport.left &&
              Math.floor(p.x) < viewport.right &&
              p.cellY >= viewport.top &&
              p.cellY < viewport.bottom,
          )
          .map((p) => `${p.cellX}:${p.cellY}`),
      ).size;
      report.actualCeilingCoverage = exposedCeilings
        ? report.actualDecoratedCeilings / exposedCeilings
        : null;
    }
  }
  return report;
}

async function probeCapture(
  page,
  capture,
  checkpoint,
  item,
  phase,
  saveReport,
) {
  const options = layerOptions(item, phase);
  await page.evaluate((value) => {
    window.__campaignDebug.dressingReview?.([]);
    window.__campaignDebug.caveLayers(value);
    window.__campaignDebug.frameMisses(true);
  }, options);
  await advance(page, 350);
  await page.evaluate(() => {
    window.__renderProbe.frames.length = 0;
  });
  await advance(page, 350);
  const report = await page.evaluate(() => {
    const element = document.querySelector("#campaign-game");
    return {
      caveSnapshot: window.__campaignDebug.caveLayers(),
      frameMisses: window.__campaignDebug.frameMisses(),
      parkedFrames: window.__renderProbe.frames.slice(-5),
      renderer: element.dataset.renderer,
      residentTextureBytes: Number(element.dataset.residentTextureBytes),
      view: {
        tile: Number(element.dataset.viewTile),
        backingScale: Number(element.dataset.backingScale),
        width: Number(element.dataset.viewWidth),
        height: Number(element.dataset.viewHeight),
        scrollX: Number(element.dataset.viewCameraX),
        scrollY: Number(element.dataset.viewCameraY),
      },
      sceneClock: window.__campaignDebug.sceneClock.read(),
      drawnFrames: window.__campaignDebug
        .drawnFrames()
        .filter(({ frame }) => frame.startsWith("cave-")),
      emissives: window.__campaignDebug
        .emissives()
        .filter(({ frame }) => frame.startsWith("cave-")),
    };
  });
  await saveReport(report);
  assert.equal(report.renderer, "webgl");
  assert.equal(
    report.sceneClock.frozen,
    true,
    "canonical fixture clock must be frozen",
  );
  assert.equal(report.parkedFrames.length, 5);
  assert.deepEqual(
    report.frameMisses,
    {},
    `${capture.name}: missing atlas frames`,
  );
  assert.deepEqual(report.caveSnapshot.enabled, {
    backWalls: options.backWalls,
    dressing: options.dressing,
  });
  if (!options.backWalls) assert.equal(report.caveSnapshot.backWalls.length, 0);
  if (!options.dressing) assert.equal(report.caveSnapshot.dressing.length, 0);
  if (capture.scene === "SITE-4" && options.backWalls)
    assert.ok(
      report.caveSnapshot.backWalls.length > 0,
      `${capture.name}: no actual back-wall fragments`,
    );
  if (capture.scene === "SITE-4" && options.dressing)
    assert.ok(
      report.caveSnapshot.dressing.length > 0,
      `${capture.name}: no actual dressing`,
    );
  report.validation = validateCaveSnapshot(
    report.caveSnapshot,
    checkpoint,
    report.view,
  );
  if (
    capture.scene === "SITE-4" &&
    options.dressing &&
    report.validation.ceilingCoverage !== null
  )
    assert.ok(
      report.validation.ceilingCoverage >= 0.8 &&
        report.validation.actualCeilingCoverage >= 0.8,
      `${capture.name}: ceiling coverage below 80%`,
    );
  const drawLimit = capture.form === "phone" ? 10 : 12;
  const textureLimit = (capture.form === "phone" ? 40 : 64) * 1024 ** 2;
  const maxDraws = Math.max(...report.parkedFrames.map((frame) => frame.draws));
  const maxUploads = Math.max(
    ...report.parkedFrames.map((frame) => frame.uploads + frame.subUploads),
  );
  assert.ok(
    report.parkedFrames.every((frame) => frame.draws > 0),
    "empty parked draw sample",
  );
  assert.ok(
    maxDraws > 0 && maxDraws <= drawLimit,
    `${capture.name}: draw budget`,
  );
  assert.equal(maxUploads, 0, `${capture.name}: uploads while parked`);
  assert.ok(
    report.residentTextureBytes > 0 &&
      report.residentTextureBytes <= textureLimit,
    `${capture.name}: active texture budget`,
  );
  report.gates = { maxDraws, drawLimit, maxUploads, textureLimit };
  return report;
}

function filesOf(capture) {
  return [
    capture.file,
    capture.hudFree,
    capture.state,
    capture.light?.file,
    capture.fieldAir,
    capture.baselineState,
  ].filter(Boolean);
}
async function fileHashes(capture) {
  return Object.fromEntries(
    await Promise.all(
      filesOf(capture).map(async (path) => [path, hash(await readFile(path))]),
    ),
  );
}
async function intact(record) {
  if (!record?.completed || !record.capture || !record.fileSha256) return false;
  try {
    return (
      JSON.stringify(await fileHashes(record.capture)) ===
      JSON.stringify(record.fileSha256)
    );
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function runCaveCaptures(browser, base, out, options = {}) {
  const {
    item = "T4",
    buildId,
    backing = 2,
    search = "field=1",
    phases = ["before", "after"],
    only,
    resume = true,
    captures = caveCaptures(),
  } = options;
  assert.ok(buildId, "CAVE_BUILD_ID must identify the immutable preview build");
  assert.ok(phases.every((phase) => ["before", "after"].includes(phase)));
  const identity = { item, buildId, base, backing, search };
  await mkdir(out, { recursive: true });
  const logPath = `${out}/runtime-layers.json`;
  const convention =
    item === "T4"
      ? "Same immutable build and checkpoints: back walls off/on; dressing off in both phases."
      : "Same immutable build and checkpoints: dressing off/on; back walls on in both phases.";
  const log = await readJson(logPath, {
    ...identity,
    convention,
    captures: {},
  });
  for (const [key, value] of Object.entries(identity))
    assert.equal(
      log[key],
      value,
      `Output belongs to another ${key}; use a separate directory`,
    );
  for (const phase of phases) {
    const folder = `${out}/${phase}`;
    await mkdir(folder, { recursive: true });
    const manifest = await readJson(`${folder}/manifest.json`, {
      base,
      backingPin: backing,
      captures: {},
    });
    for (const capture of captures.filter(
      (entry) =>
        !only?.length || only.some((prefix) => entry.name.startsWith(prefix)),
    )) {
      const checkpoint = capture.checkpoint();
      const checkpointSha256 = hash(checkpoint.state);
      const configurationSha256 = hash({
        ...identity,
        options: layerOptions(item, phase),
        checkpointSha256,
        form: capture.form,
        captureSearch: capture.search ?? null,
        panel: capture.panel,
        scene: capture.scene,
      });
      const key = `${phase}/${capture.name}`;
      const previous = log.captures[key];
      if (previous)
        assert.equal(
          previous.configurationSha256,
          configurationSha256,
          `${key}: fixture/configuration changed`,
        );
      if (resume && (await intact(previous))) {
        manifest.captures[capture.name] = previous.capture;
        await atomicJson(`${folder}/manifest.json`, manifest);
        console.log(`${key}: resumed verified completed capture`);
        continue;
      }
      // A renamed detail may reuse pixels only for an identical immutable
      // build, layer state, checkpoint, camera/form, search and board window.
      const reusable =
        resume &&
        Object.entries(log.captures).find(
          ([other, record]) =>
            other !== key &&
            record.completed &&
            record.configurationSha256 === configurationSha256,
        );
      if (reusable && (await intact(reusable[1]))) {
        log.captures[key] = { ...reusable[1], reusedFrom: reusable[0] };
        manifest.captures[capture.name] = reusable[1].capture;
        await atomicJson(logPath, log);
        await atomicJson(`${folder}/manifest.json`, manifest);
        continue;
      }
      let settledCheckpoint;
      const baselineState = `${folder}/frames/${capture.name}/pre-layer-state.json`;
      const record = {
        checkpointSha256,
        configurationSha256,
        completed: false,
      };
      log.captures[key] = record;
      await atomicJson(logPath, log);
      // Per-capture directories let the existing helper finish and commit a
      // manifest immediately; an interruption loses at most this one frame.
      const one = await runArtCaptures(
        browser,
        base,
        `${folder}/frames/${capture.name}`,
        {
          backing,
          search,
          captures: [
            { ...capture, checkpoint: () => structuredClone(checkpoint) },
          ],
          beforeNavigate: async ({ context }) => {
            context.setDefaultTimeout(120000);
            context.setDefaultNavigationTimeout(120000);
            await context.addInitScript(installRenderProbe, {
              geometry: false,
              fog: false,
            });
          },
          beforeCapture: async ({ page }) => {
            settledCheckpoint = await exportCheckpoint(page, true);
            await settledView(page, settledCheckpoint);
            record.postImportBaselineSha256 = hash(settledCheckpoint.state);
            await atomicJson(baselineState, settledCheckpoint);
            record.report = await probeCapture(
              page,
              capture,
              settledCheckpoint,
              item,
              phase,
              async (report) => {
                record.report = report;
                await atomicJson(logPath, log);
              },
            );
            await atomicJson(logPath, log);
          },
        },
      );
      record.capture = { ...one.captures[capture.name], baselineState };
      const actual = JSON.parse(await readFile(record.capture.state, "utf8"));
      for (const worldId of Object.keys(checkpoint.state.worlds))
        for (const field of ["tiles", "discovered"])
          assert.deepEqual(
            actual.state.worlds[worldId][field],
            (field === "discovered" ? settledCheckpoint : checkpoint).state
              .worlds[worldId][field],
            `${key}: ${worldId}.${field} changed`,
          );
      record.report.validation.comparisonBaseline =
        "post-import settled state before layer switches";
      record.report.validation.initialDiscoveredCells =
        checkpoint.state.worlds.W01.discovered.filter(
          (value) => value === 1,
        ).length;
      record.report.validation.postImportDiscoveredCells =
        settledCheckpoint.state.worlds.W01.discovered.filter(
          (value) => value === 1,
        ).length;
      record.report.validation.geometryUnchanged = true;
      record.report.validation.discoveryUnchanged = true;
      record.fileSha256 = await fileHashes(record.capture);
      record.completed = true;
      record.settled = { identical: true, stepMs: 50 };
      manifest.captures[capture.name] = record.capture;
      await atomicJson(logPath, log);
      await atomicJson(`${folder}/manifest.json`, manifest);
    }
  }
  return log;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const item = (process.env.CAVE_ITEM || "T4").toUpperCase();
  const captures = caveCaptures();
  if (process.env.CAVE_PLAN === "1") {
    console.log(
      JSON.stringify(
        captures.map((capture) => ({
          name: capture.name,
          form: capture.form,
          scene: capture.scene,
          panel: capture.panel,
          checkpointSha256: hash(capture.checkpoint().state),
          before: layerOptions(item, "before"),
          after: layerOptions(item, "after"),
        })),
        null,
        2,
      ),
    );
  } else {
    assert.ok(
      process.env.CAVE_BUILD_ID,
      "CAVE_BUILD_ID must identify the immutable preview build",
    );
    const browser = await launchBrowser();
    try {
      await runCaveCaptures(
        browser,
        process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
        resolve(process.argv[2] || `artifacts/art-${item.toLowerCase()}`),
        {
          item,
          buildId: process.env.CAVE_BUILD_ID,
          backing: Number(process.env.ART_BACKING || 2),
          search: process.env.ART_SEARCH || "field=1",
          phases: (process.env.CAVE_PHASES || "before,after")
            .split(",")
            .filter(Boolean),
          only: process.env.CAVE_ONLY?.split(",").filter(Boolean),
          resume: process.env.CAVE_RESUME !== "0",
          captures,
        },
      );
    } finally {
      await browser.close();
    }
  }
}
