/**
 * Art item A12 with T9: the ore socket variants and the restyled ore frames at
 * the board's tile scale, for the director's pick (style guide §8, audit §6.4).
 *
 * For each socket variant in SOCKET_VARIANTS it composes a panel as the game
 * layers a deposit: a block of a real band page (W01 band A soil, band B rock,
 * band C rock), the socket at 1 tile, the ore at 0.9 tile with its mark, and a
 * high-contrast row (the tier-mark-hc overlay on top; a package over the back
 * wall). Each panel is written at the board's scale (44.1 px per tile) and at
 * the @2x page scale for a close-up. It also rasterizes every frame alone at
 * 1x (96 px, the @2x page) and at 4x (for the shading-tier counts and the
 * mark measures), then writes review.json for scripts/art-review-a12.py:
 *
 *   node scripts/art-review-a12.mjs OUT
 *   python3 scripts/art-review-a12.py OUT/review.json docs/qa/a12-ore-sockets
 *
 * Authoring only (CHROMIUM_PATH as for npm run campaign:assets).
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ORES,
  ORE_SCALE,
  ORE_TONES,
  SOCKET_VARIANT,
  SOCKET_VARIANTS,
  depositSocket,
  oreBody,
  oreFrame,
  packageFrame,
  tierMarkHighContrastFrame,
} from "../assets/campaign/source/w01-ore.mjs";
import {
  ORE_MARK_GLYPHS,
  oreMarkGeometry,
} from "../assets/campaign/render-sources.mjs";
import { band } from "../assets/campaign/kit/palette.mjs";
import {
  CONCEPT_TILE,
  PAGE_TILE,
  panelDocument,
  rasterize,
} from "../assets/campaign/kit/review.mjs";
import { num, svgDocument } from "../assets/campaign/kit/svg.mjs";

const out = resolve(process.argv[2] || "artifacts/art-review-a12");
const variants = Object.keys(SOCKET_VARIANTS);
// Columns: O1..O4, a relic deposit (status "deposit", frame relic, which
// the game also seats), then the socket alone (in the high-contrast row, a
// package over the back wall).
const COLUMNS = 6;
const RELIC = 4;
// Rows: [label, band page, overlay]. The page is the band's 8-tile @2x page
// (assets/campaign/bands/), cropped to one tile per cell.
const ROWS = [
  ["band A soil", "w01-a-soil", false],
  ["band B rock", "w01-b-rock", false],
  ["band C rock", "w01-c-rock", false],
  ["high contrast, band A soil", "w01-a-soil", true],
];
const bodyOf = (text) =>
  text.replace(/^.*?<\/title>/s, "").replace(/<\/svg>\s*$/, "");
const pages = {};
for (const [, name] of ROWS)
  pages[name] ??= bodyOf(
    await readFile(
      new URL(`../assets/campaign/bands/${name}.svg`, import.meta.url),
      "utf8",
    ),
  );
const wrap = (body) =>
  `<g stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
const place = (body, x, y, size, viewBox = "0 0 96 96", clip = false) =>
  `<svg x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" viewBox="${viewBox}"${clip ? ' overflow="hidden"' : ""}>${body}</svg>`;
// One page tile per column, away from the page's wrap seam.
const pageTile = (column) => `${96 * (1 + column)} ${96 * 3} 96 96`;
const backWall = band("A")["back wall"];
const relic = bodyOf(
  await readFile(
    new URL("../assets/campaign/source/relic.svg", import.meta.url),
    "utf8",
  ),
);

/** A panel of COLUMNS × ROWS cells at `tile` px per tile. */
function panel(variant, tile) {
  const cells = [];
  ROWS.forEach(([, page, overlay], row) => {
    for (let column = 0; column < COLUMNS; column++) {
      const x = column * tile,
        y = row * tile;
      const air = overlay && column === COLUMNS - 1;
      if (air)
        cells.push(
          `<rect x="${num(x)}" y="${num(y)}" width="${num(tile)}" height="${num(tile)}" fill="${backWall}"/>`,
        );
      else cells.push(place(pages[page], x, y, tile, pageTile(column), true));
      // The last column of the band rows shows the socket alone.
      const tier = column < RELIC ? column + 1 : 0;
      if (!air && variant)
        cells.push(place(wrap(depositSocket(variant)), x, y, tile));
      const inset = (tile * (1 - ORE_SCALE)) / 2,
        size = tile * ORE_SCALE;
      if (air) {
        cells.push(place(wrap(packageFrame(1)), x + inset, y + inset, size));
        cells.push(
          place(wrap(tierMarkHighContrastFrame(2)), x + inset, y + inset, size),
        );
      } else if (column === RELIC) {
        cells.push(place(relic, x + inset, y + inset, size));
      } else if (tier) {
        cells.push(place(wrap(oreFrame(tier - 1)), x + inset, y + inset, size));
        if (overlay)
          cells.push(
            place(
              wrap(tierMarkHighContrastFrame(tier)),
              x + inset,
              y + inset,
              size,
            ),
          );
      }
    }
  });
  return panelDocument(
    COLUMNS * tile,
    ROWS.length * tile,
    cells,
    "",
    `A12 socket ${variant || "none"}`,
  );
}

const frame = (name, body) => ({
  name,
  width: 96,
  height: 96,
  svg: svgDocument(96, 96, body, name),
});
const frames = [];
for (let index = 0; index < 4; index++) {
  const tier = index + 1;
  frames.push(frame(`ore-o${tier}`, oreFrame(index)));
  frames.push(frame(`ore-o${tier}-nomark`, oreBody(index)));
  frames.push(frame(`package-o${tier}`, packageFrame(index)));
  frames.push(
    frame(
      `package-o${tier}-nomark`,
      packageFrame(index).replace(/<g id="tier-mark".*$/s, ""),
    ),
  );
  frames.push(frame(`tier-mark-hc-${tier}`, tierMarkHighContrastFrame(tier)));
}
for (const variant of variants)
  frames.push(frame(`socket-${variant}`, depositSocket(variant)));
// W02's frames (its generator writes files, so they are read from its
// sources): the same mark at W02's centres, measured the same way.
const w02 = (name) =>
  readFile(
    new URL(`../assets/campaign/w02/${name}.svg`, import.meta.url),
    "utf8",
  ).then(bodyOf);
for (let tier = 1; tier <= 4; tier++)
  for (const family of ["ore", "package"]) {
    const body = await w02(`${family}-o${tier}`);
    const bare = body.replace(/<g id="tier-mark".*?<\/g>/s, "");
    if (bare === body) throw new Error(`W02 ${family}-o${tier} has no mark`);
    frames.push(
      frame(`w02-${family}-o${tier}`, body.replace(/^<g [^>]*>|<\/g>$/g, "")),
    );
    frames.push(
      frame(
        `w02-${family}-o${tier}-nomark`,
        bare.replace(/^<g [^>]*>|<\/g>$/g, ""),
      ),
    );
  }
for (let tier = 1; tier <= 4; tier++)
  frames.push(
    frame(
      `w02-tier-mark-hc-${tier}`,
      (await w02(`tier-mark-hc-${tier}`)).replace(/^<g [^>]*>|<\/g>$/g, ""),
    ),
  );

const panels = [];
for (const variant of variants) {
  const board = panel(variant, CONCEPT_TILE);
  panels.push({
    name: `${variant}-panel`,
    width: Math.ceil(COLUMNS * CONCEPT_TILE),
    height: Math.ceil(ROWS.length * CONCEPT_TILE),
    svg: board,
  });
  panels.push({
    name: `${variant}-panel-page`,
    width: COLUMNS * PAGE_TILE,
    height: ROWS.length * PAGE_TILE,
    svg: panel(variant, PAGE_TILE),
  });
}
panels.push({
  name: "none-panel",
  width: Math.ceil(COLUMNS * CONCEPT_TILE),
  height: Math.ceil(ROWS.length * CONCEPT_TILE),
  svg: panel(null, CONCEPT_TILE),
});

await rasterize([...panels, ...frames], out, 1);
await rasterize(frames, `${out}/x4`, 4);

const review = {
  item: "A12 with T9",
  board: {
    file: "docs/art-direction/d0-target-shaft-wide.png",
    crop: [236, 96, 460, 340],
    ores: {
      copper: [255, 117, 290, 150],
      "silver (left)": [255, 258, 290, 282],
      "silver (right)": [408, 258, 442, 282],
    },
  },
  tile: CONCEPT_TILE,
  pageTile: PAGE_TILE,
  oreScale: ORE_SCALE,
  columns: COLUMNS,
  rows: ROWS.map(([label, page, overlay]) => ({ label, page, overlay })),
  variants: variants.map((variant) => ({
    variant,
    panel: `${variant}-panel.png`,
    page: `${variant}-panel-page.png`,
    socket: `socket-${variant}.png`,
    socket4: `x4/socket-${variant}.png`,
    params: SOCKET_VARIANTS[variant],
  })),
  none: "none-panel.png",
  default: SOCKET_VARIANT,
  ores: ORES.map((ore, index) => ({
    tier: index + 1,
    name: ore.name,
    zone: ore.zone,
    tones: ORE_TONES[index],
    glyph: ORE_MARK_GLYPHS[index],
    mark: oreMarkGeometry(index + 1),
    markW02: oreMarkGeometry(index + 1, "W02"),
  })),
  frames: Object.fromEntries(
    frames.map(({ name }) => [
      name,
      { x1: `${name}.png`, x4: `x4/${name}.png` },
    ]),
  ),
};
await writeFile(`${out}/review.json`, JSON.stringify(review, null, 2) + "\n");
console.log(
  `A12 review: ${variants.length} socket variants, ${frames.length} frames in ${out}`,
);
