/**
 * Art item A4: the W01 ridge variants and the sky body at the board's tile
 * scale, for the director's pick (style guide §8, audit §6.4).
 *
 * For each ridge preset in W01_RIDGE_STYLES it composes the surface-wide
 * panel (693 × 358, 44.1 px per tile) as the game layers it: sky, stars, sky
 * body, far, mid and near ridges, and a stand-in ground below the board's
 * ground line. It also writes each layer alone (for the measures) and each
 * page at 1x (for the IoU and skyline checks), rasterizes everything with
 * the asset pipeline's Chromium and writes review.json for
 * scripts/art-review.py:
 *
 *   node scripts/art-review-a4.mjs OUT [style ...]
 *   python3 scripts/art-review.py OUT/review.json OUT/sheet.png
 *
 * Authoring only (CHROMIUM_PATH as for npm run campaign:assets).
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  W01_RIDGE_LAYERS,
  W01_RIDGE_STYLES,
  ridges,
  skyBody,
  w01RidgeLayout,
} from "../assets/campaign/phase0-sources.mjs";
import { board, withL } from "../assets/campaign/kit/palette.mjs";
import {
  CONCEPT_TILE,
  PAGE_TILE,
  conceptPanels,
  panelDocument,
  placePage,
  rasterize,
} from "../assets/campaign/kit/review.mjs";
import {
  linearGradient,
  rect,
  svgDocument,
} from "../assets/campaign/kit/svg.mjs";

const out = resolve(process.argv[2] || "artifacts/art-review-a4");
const styles = process.argv.slice(3).length
  ? process.argv.slice(3)
  : Object.keys(W01_RIDGE_STYLES);
const panel = (await conceptPanels())["surface-wide"];
const [W, H] = panel.size;
// The board's ground line in this panel: the dark undercut at y 264, the lip
// at 265 to 267 (measured on d0-target-surface-wide.png).
const GROUND = 265;
const scale = CONCEPT_TILE / PAGE_TILE;

// The board's sky, from the samples: L* 13.8 at the panel's top rows
// (measured), sky_top (L* 19.2) at y 90, sky_horizon (L* 27.5) at y 146.
const skyTop = board("sky_top");
const horizon = board("sky_horizon");
const zenith = withL(skyTop, 13.8);
const skyDefs = linearGradient(
  "panel-sky",
  [
    [0, zenith],
    [20 / GROUND, zenith],
    [90 / GROUND, skyTop],
    [146 / GROUND, horizon],
    [1, withL(horizon, 31.5)],
  ],
  { x1: 0, y1: 0, x2: 0, y2: GROUND, units: "userSpaceOnUse" },
);
const starsSvg = await readFile(
  new URL("../assets/campaign/source/w01-sky.svg", import.meta.url),
  "utf8",
);
const starsBody = starsSvg
  .replace(/^.*?<\/title>/s, "")
  .replace(/<\/svg>\s*$/, "");
const sky = [
  rect(0, 0, W, GROUND, "url(#panel-sky)"),
  // In game the stars tile at 2x; at the board's scale that is 2 x 44.1 / 57.6.
  placePage(
    {
      body: starsBody,
      width: 1024,
      height: 512,
      scale: (2 * CONCEPT_TILE) / 57.6,
      x: 0,
      y: 0,
      tile: true,
    },
    W,
  ),
  // The planet where the board draws it, at the board's size (disc 94 px).
  placePage(
    {
      body: skyBody(),
      width: 256,
      height: 256,
      scale: 145 / 256,
      x: 531 - 72.5,
      y: 104 - 72.5,
    },
    W,
  ),
];
const ground = [
  rect(0, GROUND, W, H - GROUND, board("ground_rock")),
  rect(0, GROUND, W, 2.5, board("ground_lip")),
];

// The same horizontal placement for every preset, except that the mid
// layer's tallest peak stands where the board's second peak does (x 455).
const OFFSET = { far: 300, near: 600 };
const items = [];
const variants = [];
for (const style of styles) {
  const pages = {};
  const placed = {};
  const mid = w01RidgeLayout("mid", style);
  const tallest = mid.back.reduce((a, b) => (b.h > a.h ? b : a));
  const offsets = { ...OFFSET, mid: tallest.x - 455 / scale };
  for (const which of ["far", "mid", "near"]) {
    const body = ridges(which, false, { style });
    pages[which] = body;
    const ground = W01_RIDGE_LAYERS[which].ground;
    placed[which] = placePage(
      {
        body,
        width: 1024,
        height: 384,
        scale,
        x: -offsets[which] * scale,
        y: GROUND - ground * scale,
        tile: true,
      },
      W,
    );
    items.push({
      name: `${style}-page-${which}`,
      width: 1024,
      height: 384,
      svg: svgDocument(1024, 384, body, `${style} ${which}`),
    });
    items.push({
      name: `${style}-only-${which}`,
      width: W,
      height: H,
      svg: panelDocument(W, H, [placed[which]]),
    });
  }
  items.push({
    name: `${style}-panel`,
    width: W,
    height: H,
    svg: panelDocument(
      W,
      H,
      [...sky, placed.far, placed.mid, placed.near, ...ground],
      skyDefs,
      `A4 ${style}`,
    ),
  });
  variants.push({
    style,
    panel: `${style}-panel.png`,
    layers: Object.fromEntries(
      ["far", "mid", "near"].map((w) => [w, `${style}-only-${w}.png`]),
    ),
    pages: Object.fromEntries(
      ["far", "mid", "near"].map((w) => [w, `${style}-page-${w}.png`]),
    ),
    tallestTiles: Math.round((tallest.h / PAGE_TILE) * 100) / 100,
  });
}
items.push({
  name: "sky-only",
  width: W,
  height: H,
  svg: panelDocument(W, H, [...sky, ...ground], skyDefs),
});
await rasterize(items, out, 1);
await writeFile(
  `${out}/review.json`,
  JSON.stringify(
    {
      panel: "surface-wide",
      ground: GROUND,
      tile: CONCEPT_TILE,
      sky: "sky-only.png",
      planet: [531 - 72.5, 104 - 72.5, 145, 145],
      pageGround: Object.fromEntries(
        Object.entries(W01_RIDGE_LAYERS).map(([name, { ground }]) => [
          name,
          ground,
        ]),
      ),
      variants,
    },
    null,
    2,
  ) + "\n",
);
console.log(`A4 review: ${variants.length} variant(s) in ${out}`);
