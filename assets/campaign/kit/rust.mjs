/** Shared rust recipe. Branching mineral runs follow hand-drawn channels;
 * their widths and facet split vary by seed. These are decals, not T2 seams.
 */
import { band, shiftL } from "./palette.mjs";
import { random } from "./random.mjs";
import { layer, polygon, outlineStroke, num } from "./svg.mjs";

export const RUST_TONES = {
  light: shiftL(band("C").rust, 7),
  body: band("C").rust,
  dark: shiftL(band("C").rust, -12),
};
export const RUST_ARCHETYPES = {
  facets: [
    [0.22, 0],
    [0.38, 0.08],
    [0.46, 0.4],
    [0.49, 0.82],
    [0.52, 1],
    [0.55, 0.72],
    [0.58, 0.31],
    [0.76, 0.03],
  ],
  splinter: [
    [0.1, 0],
    [0.28, 0.12],
    [0.31, 0.47],
    [0.38, 0.65],
    [0.42, 1],
    [0.48, 0.57],
    [0.56, 0.44],
    [0.53, 0.15],
    [0.82, 0.03],
  ],
  shelf: [
    [0.1, 0.02],
    [0.2, 0.1],
    [0.28, 0.36],
    [0.33, 0.57],
    [0.4, 0.69],
    [0.44, 1],
    [0.52, 0.58],
    [0.63, 0.43],
    [0.69, 0.14],
    [0.92, 0],
  ],
};

export function rustRun({
  x = 0,
  y = 0,
  width = 60,
  height = 90,
  archetype = "facets",
  seed = "rust",
  tones = RUST_TONES,
  id = "rust",
  outline = true,
} = {}) {
  const profile = RUST_ARCHETYPES[archetype];
  if (!profile) throw new Error(`Unknown rust archetype: ${archetype}`);
  const rng = random(seed),
    split = rng.range(0.13, 0.17);
  const points = profile.map(([a, b]) => [x + a * width, y + b * height]);
  const path =
    points.map(([a, b], i) => `${i ? "L" : "M"}${num(a)} ${num(b)}`).join(" ") +
    " Z";
  // The broad upper deposit carries the lit and body facets; the falling
  // channel is dark. Cross-channel cuts keep the tiers visible without
  // pretending that a sub-pixel vertical highlight survives rasterization.
  return (
    `<defs><clipPath id="${id}-clip"><path d="${path}"/></clipPath></defs>` +
    layer(
      id,
      polygon(points, tones.body) +
        `<g clip-path="url(#${id}-clip)">` +
        polygon(
          [
            [x, y],
            [x + width, y],
            [x + width, y + height * split],
            [x, y + height * (split + 0.05)],
          ],
          tones.light,
        ) +
        polygon(
          [
            [x, y + height * 0.33],
            [x + width, y + height * 0.26],
            [x + width, y + height],
            [x, y + height],
          ],
          tones.dark,
        ) +
        `</g>` +
        (outline ? polygon(points, "none", outlineStroke(96)) : ""),
      { "data-zone": "rust", "data-archetype": archetype },
    )
  );
}
