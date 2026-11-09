/**
 * Palette tokens and colour math for the art generators (art kit, item A4).
 *
 * Two sources, both committed and both made from the board:
 * - docs/art-direction/swatches/w01-swatches.json, the signed A1 swatch cards:
 *   the rock roles of each W01 band (unknown, lit, lip, crack, back wall, cave
 *   air, accent, rust) and the violet crystal of D8;
 * - docs/art-audit/data/palette.json, the board samples the cards are built
 *   from. The style guide keeps these for props, sky and emitters (sky, ridges,
 *   planet, lamps, lander, rig, beacon), which the cards do not hold.
 *
 * Card and board values are on-screen targets within 3 L*, not shader inputs.
 *
 * Lab here is art_metrics.py's lab() (sRGB, D65, its matrix and white), so a
 * value set here reads the same in the §9 measures. Authoring only.
 */
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const SWATCH_FILE = "docs/art-direction/swatches/w01-swatches.json";
const BOARD_FILE = "docs/art-audit/data/palette.json";

function readJson(path, hint) {
  try {
    return JSON.parse(readFileSync(new URL(path, root), "utf8"));
  } catch (error) {
    throw new Error(
      `${path} could not be read (${error.code ?? error}). ${hint}`,
    );
  }
}

export const SWATCHES = readJson(
  SWATCH_FILE,
  "It comes with the A1 swatch cards (step 7); merge that first.",
);
export const BOARD = readJson(BOARD_FILE, "It ships with the art audit.");

/** The prop outline, kept from create-w01-sources.mjs (style guide §2). */
export const OUTLINE = "#14232b";

/** A board sample by its palette.json key, as a hex string. */
export function board(key) {
  const sample = BOARD[key];
  if (!sample?.hex) throw new Error(`${BOARD_FILE} has no sample "${key}"`);
  return sample.hex;
}

/** The roles of a W01 band from the swatch cards: { unknown: "#303941", ... }. */
export function band(id) {
  const record = SWATCHES.bands?.[id];
  if (!record) throw new Error(`${SWATCH_FILE} has no band "${id}"`);
  return Object.fromEntries(
    Object.entries(record.roles).map(([role, value]) => [role, value.hex]),
  );
}

/** The D8 violet crystal tiers: light, body, dark, sparkle. */
export const VIOLET = SWATCHES.violet_crystal.tiers;

// ---------------------------------------------------------------- colour math
const M = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505],
];
const WHITE = [0.9505, 1.0, 1.089];
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const M_INVERSE = invert3(M);

export function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16),
  );
}

export function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((channel) =>
        Math.max(0, Math.min(255, Math.round(channel)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** [L*, a*, b*] of a hex colour or an [r, g, b] triple. */
export function lab(colour) {
  const rgb = typeof colour === "string" ? hexToRgb(colour) : colour;
  const linear = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = M.map((row, index) => {
    const t =
      (row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]) /
      WHITE[index];
    return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
  });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

/** The sRGB hex for [L*, a*, b*], clipped to the gamut channel by channel. */
export function fromLab([L, a, b]) {
  const fy = (L + 16) / 116;
  const f = [fy + a / 500, fy, fy - b / 200];
  const xyz = f.map((value, index) => {
    const cube = value ** 3;
    return (cube > EPSILON ? cube : (116 * value - 16) / KAPPA) * WHITE[index];
  });
  const rgb = M_INVERSE.map((row) => {
    const linear = row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2];
    const c = Math.max(0, Math.min(1, linear));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  });
  return rgbToHex(rgb);
}

/** [L*, C, h°] of a colour. */
export function lch(colour) {
  const [L, a, b] = lab(colour);
  return [
    L,
    Math.hypot(a, b),
    ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  ];
}

export function fromLch([L, C, h]) {
  const angle = (h * Math.PI) / 180;
  return fromLab([L, C * Math.cos(angle), C * Math.sin(angle)]);
}

/** The colour at lightness `L`, with its a* and b* kept. */
export function withL(colour, L) {
  const [, a, b] = lab(colour);
  return fromLab([L, a, b]);
}

/** The colour moved by `dL` in L*, with its a* and b* kept. */
export function shiftL(colour, dL) {
  const [L, a, b] = lab(colour);
  return fromLab([L + dL, a, b]);
}

/** A mix of two colours in Lab, `t` = 0 gives `from`, 1 gives `to`. */
export function mixLab(from, to, t) {
  const p = lab(from),
    q = lab(to);
  return fromLab(p.map((value, index) => value + (q[index] - value) * t));
}

/** L* of a colour, rounded to 0.1, for labels and checks. */
export function lightness(colour) {
  return Math.round(lab(colour)[0] * 10) / 10;
}

/**
 * Facet tiers (style guide §4: flat facets in 2 or 3 tones): the colour at
 * `base` plus the given L* steps, keeping its hue and chroma.
 * `tiers("#586468", [-9, 0, +6])` gives shadow, body and lit.
 */
export function tiers(base, steps) {
  return steps.map((step) => shiftL(base, step));
}

/**
 * The top-lit bevel of style guide §4 (top edge about +44 %, bottom about
 * −30 %), as sRGB channel factors on the base.
 */
export function bevelColours(base) {
  const rgb = hexToRgb(base);
  return {
    top: rgbToHex(rgb.map((channel) => channel * 1.44)),
    bottom: rgbToHex(rgb.map((channel) => channel * 0.7)),
  };
}
