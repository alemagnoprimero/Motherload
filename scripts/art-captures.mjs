/**
 * Art-audit captures, named as docs/ART_QUALITY_AUDIT.md names them (§2, §9.1).
 * The §9 fixtures (scene) and the concept panel each is scored against
 * (docs/art-direction/d0-target-panels.json):
 *
 *   a02-spawn-1440x900@2.png        surface, spawn         surface-wide  1440×900 @2
 *   a04-dive-60m@2.png              60 m shaft, band A     shaft-wide    1440×900 @2
 *   a05-dive-150m@2.png             150 m shaft, band B    shaft-wide    1440×900 @2
 *   b-330m-plate-band-C@2.png       330 m, plate layer     cavern-wide   1440×900 @2
 *   c-site-W01-SITE-4-wreck@2.png   SITE-4 wreck cavern    cavern-wide   1440×900 @2
 *   p-portrait-02-spawn@3.png       surface, spawn         surface-tall   393×851 @3
 *   p-portrait-03-dive-70m@3.png    70 m shaft             shaft-tall     393×851 @3
 *   p-portrait-cavern-site4@3.png   SITE-4 wreck cavern    cavern-tall    393×851 @3
 *
 * plus b-550m-band-D@2.png (550 m shaft, band D), which no §9 row uses.
 *
 * Built on fixture(), restore() and settledView() from improvement-smoke.mjs
 * (settledView applies settle()'s rule from render-acceptance.mjs to a restored
 * checkpoint) and the campaign-smoke.mjs drive helpers. The 60 m, 70 m and
 * 550 m shafts are the improvement fixtures. The spawn, SITE-4, 150 m and
 * 330 m frames need sites or the plate layer, so they use fresh-w01.json, the
 * W01 world the audit's captures used (docs/art-audit/prototype/assets/).
 *
 * Conditions (§9.1): the device pixel ratio is pinned by the form, the backing
 * scale by ART_BACKING (F1's ?backing= pin), and the scene clock is frozen
 * before Start, so animated terms (alarm border, rig frames, glints) have the
 * same phase in every run. Each frame is captured on Playwright's clock after
 * the view settles and the import fade has ended. With ART_PLAY_SECONDS the
 * game first runs on the real clock at the fixture, so the adaptive backing
 * scale acts as shipped.
 *
 * Per capture: <name>.png with every annotation, <name>-hudfree.png of the same
 * frame with annotations hidden (__campaignDebug.overlays(false), as
 * ?overlays=0 does), <name>-light.png (the light map,
 * __campaignDebug.lightTexture()) and <name>-state.json (the exported
 * campaign, for the cell-based measures in scripts/art_metrics.py).
 *
 * Environment: PREVIEW_URL; ART_CAPTURES_DIR (artifacts/art-captures);
 * ART_CAPTURES, a comma list of names or name prefixes; ART_PLAY_SECONDS (0);
 * ART_BACKING, a backing-scale pin of 1, 1.5 or 2.
 *
 * manifest.json records, per capture, the scene and panel, the backing scale
 * and quality tier the game reported, the camera (tile, scroll, rig position in
 * CSS px), the rig's box in device pixels and its keep@2, the light map's
 * geometry, and after real-clock play the readout's p95 frame cost.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  exportCheckpoint,
  freeze,
  noErrors,
  ready,
} from "./campaign-smoke.mjs";
import { fixture, restore, settledView } from "./improvement-smoke.mjs";
import { keepAt2, readCampaignDebug } from "./render-probe.mjs";

const freshW01 = JSON.parse(
  await readFile(
    new URL(
      "../docs/art-audit/prototype/assets/fresh-w01.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

export const FORMS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: {
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

/**
 * The audit's cavern fixture (docs/art-audit/06-prototype.md, "Cavern"): the
 * rig teleports to (site.x − 2, site.y + 1), everything within 6 tiles is
 * revealed, and the rig drops to the floor. In fresh-w01 that floor is row 46,
 * so the rig rests at y 45.64. The audit also dug a shaft down that column;
 * here the column is open from row 37 and the rows above are out of frame, so
 * nothing is dug (digging would also orphan a buried package, which the
 * import rejects).
 */
function siteCheckpoint(saved, id) {
  const checkpoint = structuredClone(saved);
  const { state } = checkpoint;
  const mine = state.worlds[state.currentWorld];
  const site = (mine.sites ?? []).find((item) => item.id === id);
  if (!site) throw new Error(`${id} is not in ${state.currentWorld}`);
  // Found earlier: no transient discovery notice in the frame.
  site.discovered = true;
  const x = site.x - 2,
    y = site.y + 1,
    column = Math.floor(x);
  const index = (c, row) =>
    row * mine.width + (((c % mine.width) + mine.width) % mine.width);
  for (let row = Math.max(0, Math.floor(y - 6)); row < mine.rows; row++)
    for (let c = Math.floor(x - 6); c <= Math.ceil(x + 6); c++)
      if (Math.hypot(c + 0.5 - x, row + 0.5 - y) <= 6)
        mine.discovered[index(c, row)] = 1;
  let floor = Math.floor(y);
  while (floor < mine.rows - 1 && mine.tiles[index(column, floor)] === 0)
    floor++;
  state.vehicle = { ...state.vehicle, x, y: floor - 0.36 };
  return checkpoint;
}

export const CAPTURES = [
  {
    name: "a02-spawn-1440x900@2",
    form: "desktop",
    scene: "surface",
    panel: "surface-wide",
    checkpoint: () => structuredClone(freshW01),
  },
  {
    name: "a04-dive-60m@2",
    form: "desktop",
    scene: "60 m",
    panel: "shaft-wide",
    checkpoint: () => fixture("W01", 6),
  },
  {
    // Band B. Column 32 has no deposit above row 15 and a soil floor.
    name: "a05-dive-150m@2",
    form: "desktop",
    scene: "150 m",
    panel: "shaft-wide",
    checkpoint: () => fixture("W01", 15, 32.5, freshW01),
  },
  {
    // The plate layer (fresh-w01 rows 30-31, tile 4) at the B→C cut. Column
    // 29's only deposits are near the surface, far out of frame; the audit
    // groups this frame with the 300 m cavern panel (§2.3, 01-terrain.md).
    name: "b-330m-plate-band-C@2",
    form: "desktop",
    scene: "330 m",
    panel: "cavern-wide",
    checkpoint: () => fixture("W01", 33, 29.5, freshW01),
  },
  {
    // Column 31 opens into a cave at 550 m in this fixture; column 34 has a floor.
    name: "b-550m-band-D@2",
    form: "desktop",
    checkpoint: () => fixture("W01", 55, 34.5),
  },
  {
    name: "c-site-W01-SITE-4-wreck@2",
    form: "desktop",
    scene: "SITE-4",
    panel: "cavern-wide",
    checkpoint: () => siteCheckpoint(freshW01, "W01-SITE-4"),
  },
  {
    name: "p-portrait-02-spawn@3",
    form: "phone",
    scene: "surface",
    panel: "surface-tall",
    checkpoint: () => structuredClone(freshW01),
  },
  {
    name: "p-portrait-03-dive-70m@3",
    form: "phone",
    scene: "70 m",
    panel: "shaft-tall",
    checkpoint: () => fixture("W01", 7),
  },
  {
    // The capture docs/art-audit/06-prototype.md adds: SITE-4 on the phone.
    name: "p-portrait-cavern-site4@3",
    form: "phone",
    scene: "SITE-4",
    panel: "cavern-tall",
    checkpoint: () => siteCheckpoint(freshW01, "W01-SITE-4"),
  },
];

/**
 * The HUD: its row, the menu button, the objective card and the toolbar. The
 * overlay edge share masks these boxes, and the playfield text count leaves
 * them out.
 */
export const HUD_SELECTORS = [
  ".campaign-hud",
  "#campaign-menu-toggle",
  ".campaign-objective",
  ".campaign-toolbar",
];

/**
 * Audit F6 (§9.2's "text items"): the text drawn over the playfield, HUD
 * left out. Each visible DOM text node inside the view is one item, as is
 * each canvas world label inside the view (__campaignDebug.worldLabels()).
 * Hidden, unpainted (opacity 0) and clipped text does not count, nor does a
 * closed disclosure's body.
 */
export async function playfieldText(page) {
  return page.evaluate((hud) => {
    const items = [];
    const inView = (left, top, right, bottom) =>
      right > 0 && bottom > 0 && left < innerWidth && top < innerHeight;
    for (const element of document.querySelectorAll(".campaign-shell *")) {
      if (
        element.closest("#campaign-game") ||
        hud.some((selector) => element.closest(selector)) ||
        element.closest("[hidden],.sr-only")
      )
        continue;
      const closed = element.closest("details:not([open])");
      if (
        closed &&
        !closed.querySelector(":scope > summary")?.contains(element)
      )
        continue;
      let opacity = 1,
        visible = true;
      for (let node = element; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        opacity *= Number(css.opacity);
        if (css.display === "none" || css.visibility === "hidden")
          visible = false;
        if (node === document.body || node === document.documentElement)
          continue;
        const box = node.getBoundingClientRect();
        if (
          (css.overflowX !== "visible" && box.width <= 1) ||
          (css.overflowY !== "visible" && box.height <= 1)
        )
          visible = false;
      }
      if (!visible || opacity === 0) continue;
      for (const child of element.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim())
          continue;
        const range = document.createRange();
        range.selectNodeContents(child);
        const box = range.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (!inView(box.left, box.top, box.right, box.bottom)) continue;
        items.push({
          source: "dom",
          text: child.textContent.trim(),
          element: element.id
            ? "#" + element.id
            : element.tagName.toLowerCase() + "." + element.className,
          box: [box.left, box.top, box.right, box.bottom].map(Math.round),
        });
      }
    }
    for (const label of window.__campaignDebug?.worldLabels?.() ?? [])
      items.push({
        source: "canvas",
        text: label.text,
        box: [
          label.x,
          label.y,
          label.x + label.width,
          label.y + label.height,
        ].map(Math.round),
      });
    return items;
  }, HUD_SELECTORS);
}

/** The §9 frames: every capture scored against a concept panel. */
export const SHEET_CAPTURES = CAPTURES.filter((capture) => capture.panel).map(
  (capture) => capture.name,
);

/** The rig sprite's square in device pixels (scene.ts draws it centred). */
async function rigBox(page, dpr) {
  const view = await page.locator("#campaign-game").evaluate((element) => ({
    x: Number(element.dataset.rigScreenX),
    y: Number(element.dataset.rigScreenY),
    tile: Number(element.dataset.viewTile),
  }));
  const size = (view.tile * 64) / 48,
    centreY = view.y - view.tile * 0.015;
  return {
    x: Math.round((view.x - size / 2) * dpr),
    y: Math.round((centreY - size / 2) * dpr),
    width: Math.round(size * dpr),
    height: Math.round(size * dpr),
  };
}

export async function runArtCaptures(browser, base, path, options = {}) {
  const { only, playSeconds = 0, backing } = options;
  await mkdir(path, { recursive: true });
  const url = new URL(base);
  if (backing !== undefined) url.searchParams.set("backing", String(backing));
  const selected = CAPTURES.filter(
    (capture) =>
      !only?.length || only.some((name) => capture.name.startsWith(name)),
  );
  const manifest = {
    base: url.href,
    playSeconds,
    backingPin: backing ?? null,
    captures: {},
  };
  for (const [form, settings] of Object.entries(FORMS)) {
    const captures = selected.filter((capture) => capture.form === form);
    if (!captures.length) continue;
    const { context, page } = await ready(
      browser,
      url.href,
      settings,
      // Real-clock play lets the game run as shipped, scene clock included.
      { freezeSceneClock: !(playSeconds > 0) },
    );
    try {
      await freeze(page);
      for (const capture of captures) {
        const checkpoint = capture.checkpoint();
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        if (playSeconds > 0) {
          await page.evaluate(() => window.__campaignDebug.sceneClock.resume());
          await page.clock.resume();
          await new Promise((resolve) =>
            setTimeout(resolve, playSeconds * 1000),
          );
          // pauseAt cannot go back in time: leave room for a long frame.
          await page.clock.pauseAt(
            await page.evaluate(() => Date.now() + 1000),
          );
          await settledView(page, checkpoint);
          // Hold the phase play ended on, so the HUD-free twin below shows
          // the same frame.
          await page.evaluate(() => window.__campaignDebug.sceneClock.freeze());
        }
        const before = await page.evaluate(readCampaignDebug);
        if (before.fade.running)
          throw new Error(`${capture.name}: captured during the import fade`);
        const file = `${path}/${capture.name}.png`;
        await page.screenshot({ path: file });
        const reported = await page.locator("#campaign-game").evaluate(
          (element, hudSelectors) => ({
            world: element.dataset.campaignWorld,
            rig: [
              Number(element.dataset.rigWorldX),
              Number(element.dataset.rigWorldY),
            ],
            tile: Number(element.dataset.viewTile),
            backingScale: Number(
              element.dataset.backingScale ?? element.dataset.renderScale,
            ),
            qualityTier: element.dataset.qualityTier ?? null,
            backingPinned: element.dataset.backingPinned ?? null,
            frameP95: Number(element.dataset.frameP95) || null,
            renderer: element.dataset.renderer,
            devicePixelRatio: window.devicePixelRatio,
            // The camera in CSS px: what the cell-based measures need.
            view: {
              width: Number(element.dataset.viewWidth),
              height: Number(element.dataset.viewHeight),
              tile: Number(element.dataset.viewTile),
              scrollX: Number(element.dataset.viewCameraX),
              scrollY: Number(element.dataset.viewCameraY),
              rigScreenX: Number(element.dataset.rigScreenX),
              rigScreenY: Number(element.dataset.rigScreenY),
            },
            // The HUD row, objective card and toolbar in CSS px: the overlay
            // edge share masks them (docs/art-audit/04-overlays.md §6.1).
            hud: hudSelectors.flatMap((selector) =>
              [...document.querySelectorAll(selector)]
                .map((node) => node.getBoundingClientRect())
                .filter((box) => box.width > 0 && box.height > 0)
                .map((box) => [box.left, box.top, box.right, box.bottom]),
            ),
          }),
          HUD_SELECTORS,
        );
        // The pinned DPR (§9.1): the form's device scale factor, as the page
        // sees it.
        if (reported.devicePixelRatio !== settings.deviceScaleFactor)
          throw new Error(
            `${capture.name}: devicePixelRatio ${reported.devicePixelRatio}, not ${settings.deviceScaleFactor}`,
          );
        // Playwright's frozen clock makes every frame cost 0 ms: a p95 only
        // means something after real-clock play.
        if (!(playSeconds > 0)) reported.frameP95 = null;
        // F6: the playfield's text items, with every annotation shown.
        const text = await playfieldText(page);
        const box = await rigBox(page, settings.deviceScaleFactor);
        const image =
          "data:image/png;base64," + (await readFile(file)).toString("base64");
        const keep2 = await page.evaluate(keepAt2, { image, crop: box });
        // The light map as drawn for this frame (alpha is darkness).
        const lightFile = `${path}/${capture.name}-light.png`;
        await writeFile(
          lightFile,
          Buffer.from(before.light.dataURL.split(",")[1], "base64"),
        );
        // The same frame without annotations: DOM overlays go to opacity 0 at
        // once; canvas labels, rings and markers drop on the next frame, and
        // the frozen scene clock keeps everything else as it was.
        await page.evaluate(() => window.__campaignDebug.overlays(false));
        await advance(page, 50);
        const hudFree = `${path}/${capture.name}-hudfree.png`;
        await page.screenshot({ path: hudFree });
        await page.evaluate(() => window.__campaignDebug.overlays(true));
        // The known-cell grid for the region, boundary and wall measures.
        const exported = await exportCheckpoint(page);
        const stateFile = `${path}/${capture.name}-state.json`;
        await writeFile(stateFile, JSON.stringify(exported) + "\n");
        const { dataURL, ...light } = before.light;
        void dataURL;
        manifest.captures[capture.name] = {
          file,
          hudFree,
          state: stateFile,
          scene: capture.scene ?? null,
          panel: capture.panel ?? null,
          viewport: settings.viewport,
          deviceScaleFactor: settings.deviceScaleFactor,
          ...reported,
          playfieldText: text,
          rigBox: box,
          rigKeep2: keep2 === null ? null : Number(keep2.toFixed(3)),
          light: { file: lightFile, ...light },
          sceneClock: before.sceneClock,
          backing: before.backing,
        };
        console.log(
          `${capture.name}: backing ${reported.backingScale} (${reported.qualityTier ?? "no tier"}), rig keep@2 ${keep2?.toFixed(3)}`,
        );
      }
      noErrors(page);
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${path}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    await runArtCaptures(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.ART_CAPTURES_DIR || "artifacts/art-captures",
      {
        only: process.env.ART_CAPTURES?.split(",").filter(Boolean),
        playSeconds: Number(process.env.ART_PLAY_SECONDS || 0),
        backing: process.env.ART_BACKING
          ? Number(process.env.ART_BACKING)
          : undefined,
      },
    );
  } finally {
    await browser.close();
  }
}
