/**
 * SVG writing for the art generators (art kit, item A4): one number format so
 * sources rebuild byte-identically, layered groups, gradients, the outline
 * rule, and the facet and bevel helpers of style guide §2 and §4.
 *
 * Authoring only: the game loads the rasterized PNGs, never this module.
 */
import { OUTLINE, bevelColours } from "./palette.mjs";

/** A coordinate as text: at most two decimals, no trailing zeros, no -0. */
export function num(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Path data for a list of [x, y] points; closed unless `open`. */
export function pathData(points, open = false) {
  const d = points
    .map(([x, y], index) => `${index ? "L" : "M"}${num(x)} ${num(y)}`)
    .join(" ");
  return open ? d : d + " Z";
}

function attributes(extra) {
  return Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        ` ${key}="${typeof value === "number" ? num(value) : value}"`,
    )
    .join("");
}

/** A filled polygon with no stroke. */
export function polygon(points, fill, extra = {}) {
  return `<path d="${pathData(points)}" fill="${fill}"${attributes(extra)}/>`;
}

/** A stroked open polyline. */
export function polyline(points, stroke, width, extra = {}) {
  return `<path d="${pathData(points, true)}" fill="none" stroke="${stroke}" stroke-width="${num(width)}"${attributes(extra)}/>`;
}

export function rect(x, y, width, height, fill, extra = {}) {
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" fill="${fill}"${attributes(extra)}/>`;
}

export function circle(x, y, r, fill, extra = {}) {
  return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="${fill}"${attributes(extra)}/>`;
}

/** A layer group: `id` and `data-layer`, as the sources name their parts. */
export function layer(name, body, extra = {}) {
  return `<g id="${name}" data-layer="${name}"${attributes(extra)}>${body}</g>`;
}

/** A linear gradient definition; `stops` is [[offset, colour], ...]. */
export function linearGradient(
  id,
  stops,
  { x1 = 0, y1 = 0, x2 = 0, y2 = 1, units } = {},
) {
  const stopText = stops
    .map(
      ([offset, colour]) =>
        `<stop offset="${num(offset)}" stop-color="${colour}"/>`,
    )
    .join("");
  return `<linearGradient id="${id}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"${units ? ` gradientUnits="${units}"` : ""}>${stopText}</linearGradient>`;
}

export function radialGradient(
  id,
  stops,
  { cx = 0.5, cy = 0.5, r = 0.5, fx, fy, units } = {},
) {
  const stopText = stops
    .map(
      ([offset, colour]) =>
        `<stop offset="${num(offset)}" stop-color="${colour}"/>`,
    )
    .join("");
  return `<radialGradient id="${id}" cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"${fx === undefined ? "" : ` fx="${num(fx)}"`}${fy === undefined ? "" : ` fy="${num(fy)}"`}${units ? ` gradientUnits="${units}"` : ""}>${stopText}</radialGradient>`;
}

/**
 * A whole source file, in the form create-w01-sources.mjs writes: a title,
 * then the body in a round-cap, round-join group. `defs` go first.
 */
export function svgDocument(width, height, body, title, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${title}</title>${defs ? `<defs>${defs}</defs>` : ""}<g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

// ---------------------------------------------------------------- outline rule
/** Style guide §2: one #14232b outline at 4.4 % of a cell. */
export const OUTLINE_SHARE = 0.044;

/** The outline width for a cell of `cell` px (96 at @2x: 4.22 px). */
export function outlineWidth(cell = 96) {
  return cell * OUTLINE_SHARE;
}

/** Stroke attributes for the prop outline at a cell size. */
export function outlineStroke(cell = 96) {
  return {
    stroke: OUTLINE,
    "stroke-width": outlineWidth(cell),
    "stroke-linejoin": "round",
  };
}

// ---------------------------------------------------------------- facets and bevels
/**
 * Draw `draw(offset)` three times, at x − width, x and x + width, so shapes
 * that cross an edge of a horizontally tiling page wrap onto the other edge.
 */
export function periodic(width, draw) {
  return [-width, 0, width].map((offset) => draw(offset)).join("");
}

/** Points moved by dx, dy. */
export function shift(points, dx, dy = 0) {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

/**
 * The top-lit bevel of a convex block, drawn inside it (style guide §4): each
 * edge whose outward normal points up gets a strip in the light tone, each
 * edge that points down a strip in the dark tone. `points` run clockwise on
 * screen (y down).
 */
export function bevelEdges(points, base, width) {
  const { top, bottom } = bevelColours(base);
  let body = "";
  for (let index = 0; index < points.length; index++) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % points.length];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (!length) continue;
    // Clockwise with y down: the outward normal is (dy, -dx) / length.
    const ny = -(x1 - x0) / length;
    if (Math.abs(ny) < 0.5) continue;
    const nx = (y1 - y0) / length;
    const inset = [
      [x0, y0],
      [x1, y1],
      [x1 - nx * width, y1 - ny * width],
      [x0 - nx * width, y0 - ny * width],
    ];
    body += polygon(inset, ny < 0 ? top : bottom);
  }
  return body;
}
