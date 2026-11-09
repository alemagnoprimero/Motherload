/**
 * Review panels at the board's tile scale (art kit, item A4).
 *
 * An art round is judged beside the board at matched scale before it goes
 * into a game fixture (style guide §8, audit §6.4). This module composes such
 * a panel from layered pages and props as the game layers them, writes it as
 * SVG, and rasterizes it with the same resvg path as the game's assets
 * (scripts/rasterize-campaign-svgs.mjs).
 * scripts/art-review.py lays the panels out beside the board's crop, measures
 * them and runs the IoU duplicate check.
 *
 * Authoring only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { rasterizeCampaignSources } from "../../../scripts/rasterize-campaign-svgs.mjs";
import { num } from "./svg.mjs";

const root = new URL("../../../", import.meta.url);

/** art_metrics.py CONCEPT_TILE: the board shows 15.7 tiles across 693 px. */
export const CONCEPT_TILE = 693 / 15.7;
/** The game's pages are authored at 96 px per tile (@2x). */
export const PAGE_TILE = 96;

/** docs/art-direction/d0-target-panels.json, by panel id. */
export async function conceptPanels() {
  const text = await readFile(
    new URL("docs/art-direction/d0-target-panels.json", root),
    "utf8",
  );
  return JSON.parse(text).panels;
}

/**
 * A page body placed in a panel. `scale` maps page px to panel px; `x`, `y`
 * place the page's top-left corner; `tile` repeats it horizontally across the
 * panel, as a TileSprite does. Each copy is a nested <svg>. A tiling page
 * draws past its edges (its shapes are periodic), so copies overlap exactly
 * instead of meeting at a clipped, anti-aliased edge that the game never has.
 */
export function placePage(
  { body, width, height, scale, x, y, tile = false },
  panelWidth,
) {
  const w = width * scale,
    h = height * scale;
  const copies = [];
  if (tile) {
    let start = x % w;
    if (start > 0) start -= w;
    for (let left = start; left < panelWidth; left += w) copies.push(left);
  } else copies.push(x);
  return copies
    .map(
      (left) =>
        `<svg x="${num(left)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" viewBox="0 0 ${width} ${height}" overflow="${tile ? "visible" : "hidden"}">${body}</svg>`,
    )
    .join("");
}

/** A panel document: `defs`, then `layers` (strings) from back to front. */
export function panelDocument(
  width,
  height,
  layers,
  defs = "",
  title = "review panel",
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${title}</title>${defs ? `<defs>${defs}</defs>` : ""}${layers.join("")}</svg>`;
}

/**
 * Write each `{ name, width, height, svg }` to `directory` and rasterize it
 * there at `scale` with the asset pipeline's rasterizer (resvg; no browser).
 * Returns the PNG paths.
 */
export async function rasterize(items, directory, scale = 1) {
  const folder = new URL(
    directory.endsWith("/") ? directory : directory + "/",
    "file://",
  );
  await mkdir(folder, { recursive: true });
  for (const item of items)
    await writeFile(new URL(`${item.name}.svg`, folder), item.svg);
  await rasterizeCampaignSources(
    folder,
    folder,
    {
      frames: items.map(({ name, width, height }) => ({ name, width, height })),
      backgrounds: [],
    },
    scale,
  );
  return items.map((item) => new URL(`${item.name}.png`, folder).pathname);
}
