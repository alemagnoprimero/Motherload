/** Shared A7 rock recipe: three drawn profiles, with seeded facet placement.
 * Units are @2x page pixels; cell stays 96 even for a three-cell boulder.
 * No terrain noise or world data enters the recipe. Later surface/wreck/plate
 * art can supply its own palette and dimensions without copying these paths.
 */
import { band, shiftL } from "./palette.mjs";
import { random } from "./random.mjs";
import { layer, polygon, outlineStroke } from "./svg.mjs";

export const ROCK_ARCHETYPES = {
  facets: [
    [0, 0.82],
    [0.1, 0.38],
    [0.37, 0.04],
    [0.67, 0.11],
    [0.96, 0.5],
    [1, 0.88],
    [0.68, 1],
    [0.2, 0.97],
  ],
  splinter: [
    [0, 0.92],
    [0.23, 0.62],
    [0.5, 0.03],
    [0.6, 0.1],
    [0.66, 0.58],
    [0.91, 0.44],
    [1, 0.88],
    [0.83, 1],
    [0.28, 0.97],
  ],
  shelf: [
    [0, 0.65],
    [0.14, 0.39],
    [0.45, 0.32],
    [0.68, 0.04],
    [0.95, 0.12],
    [1, 0.68],
    [0.75, 0.94],
    [0.28, 1],
  ],
};
export const ROCK_TONES = {
  light: shiftL(band("C").lit, 5),
  body: band("C").lit,
  dark: shiftL(band("C").lit, -13),
};

export function rockChunk({
  x = 0,
  y = 0,
  width = 80,
  height = 42,
  archetype = "facets",
  seed = "rock",
  tones = ROCK_TONES,
  cell = 96,
  id = "rock",
  zone = "rock",
} = {}) {
  const shape = ROCK_ARCHETYPES[archetype];
  if (!shape) throw new Error(`Unknown rock archetype: ${archetype}`);
  const rng = random(seed);
  // Keep the outer silhouette authored: the random term moves only the
  // junction of the three material facets, never invents a noisy contour.
  const points = shape.map(([a, b]) => [x + a * width, y + b * height]);
  const junction = [
    x + width * rng.range(0.39, 0.56),
    y + height * rng.range(0.53, 0.66),
  ];
  const cut = Math.floor(points.length / 2);
  return layer(
    id,
    polygon(points, tones.body) +
      polygon([...points.slice(0, cut + 1), junction], tones.light) +
      polygon([junction, ...points.slice(cut), points[0]], tones.dark) +
      polygon(
        [
          points[cut - 1],
          points[cut],
          junction,
          [x + width * 0.38, y + height * 0.88],
        ],
        tones.body,
      ) +
      polygon(points, "none", outlineStroke(cell)),
    { "data-zone": zone, "data-archetype": archetype },
  );
}
