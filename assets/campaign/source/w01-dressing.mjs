/** A7 cave dressing. Hand-drawn archetypes read against the cavern crop,
 * varied by named seeded streams. Side-effect free; create-dressing-sources
 * writes layered SVGs and canonical @4 raster sources for the pinned path.
 */
import { VIOLET, band, withL, shiftL } from "../kit/palette.mjs";
import { random } from "../kit/random.mjs";
import { rockChunk, ROCK_TONES } from "../kit/rock-chunk.mjs";
import { rustRun, RUST_TONES } from "../kit/rust.mjs";
import {
  layer,
  polygon,
  outlineStroke,
  svgDocument,
  num,
} from "../kit/svg.mjs";
import { emissivePair } from "../kit/emissive.mjs";

export const DRESSING_VARIANTS = ["facets", "splinter", "shelf"];
export const DRESSING_DEFAULTS = {
  stalactite: "facets",
  rust: "facets",
  rubble: "facets",
  boulder: "facets",
  crystal: "facets",
};
export const DRESSING_SEED = "DF-A7-2026-11-14";
export const CRYSTAL_TONES = { ...VIOLET };
// D8: all HC material tiers are below copper's body (69.1), including the
// lit facet. The HC sparkle emits zero RGB so it cannot erase this cue.
export const CRYSTAL_HC_TONES = {
  light: withL(VIOLET.body, 54),
  body: withL(VIOLET.body, 42),
  dark: withL(VIOLET.body, 29),
  sparkle: "#000000",
};
export const BOULDER_TONES = {
  light: withL(band("C").lit, 31),
  body: withL(band("C").lit, 23),
  dark: withL(band("C").lit, 15),
};
export const STALACTITE_ARCHETYPES = {
  facets: [
    [0, 0],
    [0.92, 0.03],
    [0.77, 0.2],
    [0.65, 0.54],
    [0.47, 1],
    [0.36, 0.66],
    [0.24, 0.25],
  ],
  splinter: [
    [0, 0.04],
    [0.98, 0],
    [0.76, 0.2],
    [0.68, 0.71],
    [0.51, 1],
    [0.51, 0.45],
    [0.33, 0.68],
    [0.22, 0.23],
  ],
  shelf: [
    [0, 0.02],
    [1, 0],
    [0.86, 0.29],
    [0.66, 0.38],
    [0.59, 0.9],
    [0.46, 1],
    [0.36, 0.48],
    [0.15, 0.35],
  ],
};

function assertVariant(value) {
  if (!DRESSING_VARIANTS.includes(value))
    throw new Error(`Unknown dressing variant: ${value}`);
  return value;
}
function frame(name, width, height, family, body, variant, extra = {}) {
  return {
    name,
    width,
    height,
    logicalWidth: width / 2,
    logicalHeight: height / 2,
    family,
    category: "dressing",
    source: "raster",
    variant,
    body,
    svg: svgDocument(width, height, body, name),
    ...extra,
  };
}
function shiftedVariant(variant, shift) {
  return DRESSING_VARIANTS[(DRESSING_VARIANTS.indexOf(variant) + shift) % 3];
}
function stal({ x, y, width, height, shape, seed, id }) {
  const pts = STALACTITE_ARCHETYPES[shape].map(([a, b]) => [
    x + a * width,
    y + b * height,
  ]);
  const rng = random(seed),
    root = [x + width * rng.range(0.38, 0.49), y];
  const tip = pts[4],
    shoulder = pts[2];
  return layer(
    id,
    polygon(pts, ROCK_TONES.body) +
      polygon([pts[0], root, tip, ...pts.slice(5)], ROCK_TONES.light) +
      polygon([root, pts[1], shoulder, pts[3], tip], ROCK_TONES.dark) +
      polygon(
        [root, [x + width * 0.6, y + height * 0.12], tip],
        ROCK_TONES.body,
      ) +
      polygon(pts, "none", outlineStroke(96)),
    { "data-zone": "rock", "data-archetype": shape },
  );
}

export function stalactiteFrame(
  index,
  variant = DRESSING_DEFAULTS.stalactite,
  seed = DRESSING_SEED,
) {
  assertVariant(variant);
  const large = index >= 6,
    width = large ? 192 : 96,
    height = large ? 116 : 96;
  const small = [
    [18, 69],
    [39, 38],
    [27, 86],
    [60, 24],
    [22, 43],
    [50, 57],
  ];
  let body = "";
  if (!large) {
    const [w, h] = small[index];
    body = stal({
      x: (width - w) / 2,
      y: 4,
      width: w,
      height: h,
      shape: shiftedVariant(variant, index % 3),
      seed: `${seed}/stal/${index}`,
      id: "stalactite",
    });
  } else {
    const layouts = [
      [
        [27, 35, 48],
        [71, 27, 97],
        [130, 24, 62],
      ],
      [
        [13, 63, 86],
        [96, 36, 42],
        [157, 17, 24],
      ],
      [
        [39, 23, 23],
        [72, 36, 52],
        [119, 53, 91],
      ],
    ];
    body = layouts[index - 6]
      .map(([x, w, h], i) =>
        stal({
          x,
          y: 4,
          width: w,
          height: h,
          shape: shiftedVariant(variant, i),
          seed: `${seed}/stal/${index}/${i}`,
          id: `stalactite-${i}`,
        }),
      )
      .join("");
  }
  return frame(
    `cave-stalactite-${index}`,
    width,
    height,
    "stalactite",
    body,
    variant,
    { anchor: "ceiling" },
  );
}

export function rustDripFrame(
  index,
  variant = DRESSING_DEFAULTS.rust,
  seed = DRESSING_SEED,
) {
  assertVariant(variant);
  const height = index < 2 ? 96 : 192;
  const layouts = [
    [[20, 48, 75]],
    [
      [6, 28, 38],
      [45, 31, 62],
    ],
    [[14, 61, 174]],
    [
      [5, 30, 127],
      [49, 35, 78],
    ],
  ];
  const body = layouts[index]
    .map(([x, w, h], i) =>
      rustRun({
        x,
        y: 5,
        width: w,
        height: h,
        archetype: shiftedVariant(variant, i),
        seed: `${seed}/rust/${index}/${i}`,
        id: `rust-${index}-${i}`,
      }),
    )
    .join("");
  return frame(`cave-rust-drip-${index}`, 96, height, "rust", body, variant, {
    anchor: "ceiling",
  });
}

export function rustParticleFrame(index, variant = DRESSING_DEFAULTS.rust) {
  assertVariant(variant);
  const widths = [8, 9, 10, 12, 16, 18],
    heights = [12, 16, 18, 14, 10, 7];
  const w = widths[index],
    h = heights[index],
    x = (24 - w) / 2,
    y = 22 - h;
  const lean = DRESSING_VARIANTS.indexOf(variant) - 1;
  const pts = [
    [x + w * 0.5 + lean, y],
    [x + w, y + h * 0.65],
    [x + w * 0.8, y + h],
    [x + w * 0.25, y + h],
    [x, y + h * 0.7],
  ];
  const mid = [x + w * 0.48, y + h * 0.75];
  const body = layer(
    "drop",
    polygon(pts, RUST_TONES.body) +
      polygon([pts[0], mid, pts[3], pts[4]], RUST_TONES.light) +
      polygon([mid, pts[1], pts[2], pts[3]], RUST_TONES.dark),
    { "data-zone": "rust" },
  );
  return frame(`cave-rust-particle-${index}`, 24, 24, "rust", body, variant, {
    animation: "drip",
    phase: index,
  });
}

export function rubbleFrame(
  index,
  variant = DRESSING_DEFAULTS.rubble,
  seed = DRESSING_SEED,
) {
  assertVariant(variant);
  const layouts = [
    [[17, 30, 59, 25]],
    [
      [10, 45, 18, 10],
      [42, 35, 29, 20],
      [78, 47, 10, 8],
    ],
    [
      [6, 27, 24, 28],
      [47, 37, 40, 18],
    ],
    [[36, 12, 25, 43]],
    [
      [4, 39, 25, 16],
      [39, 41, 16, 14],
      [64, 37, 28, 18],
    ],
    [
      [14, 39, 20, 16],
      [39, 40, 17, 15],
      [61, 16, 24, 39],
    ],
  ];
  const body = layouts[index]
    .map(([x, y, width, height], i) =>
      rockChunk({
        x,
        y,
        width,
        height,
        archetype: shiftedVariant(variant, (index + i) % 3),
        seed: `${seed}/rubble/${index}/${i}`,
        id: `rubble-${i}`,
      }),
    )
    .join("");
  return frame(`cave-rubble-${index}`, 96, 64, "rubble", body, variant, {
    anchor: "floor",
    baseline: 57.12,
  });
}

export function boulderFrame(
  index,
  variant = DRESSING_DEFAULTS.boulder,
  seed = DRESSING_SEED,
) {
  assertVariant(variant);
  const widths = [96, 192, 288],
    heights = [72, 104, 144];
  const width = widths[index],
    height = heights[index];
  const body = rockChunk({
    x: 5,
    y: 7,
    width: width - 10,
    height: height - 14,
    archetype: shiftedVariant(variant, index),
    tones: BOULDER_TONES,
    seed: `${seed}/boulder/${index}`,
    id: "boulder",
  });
  return frame(
    `cave-boulder-${index}`,
    width,
    height,
    "boulder",
    body,
    variant,
    { anchor: "floor", baseline: height - 4.88 },
  );
}

function shard(x, y, width, height, lean, tones, id) {
  const tip = [x + width * 0.48 + lean, y - height];
  const left = [x + lean * 0.7, y - height * 0.72],
    right = [x + width + lean * 0.7, y - height * 0.72];
  const baseLeft = [x + width * 0.12, y],
    baseRight = [x + width * 0.88, y];
  const spine = [x + width * 0.48 + lean * 0.6, y - height * 0.73];
  const outline = [baseLeft, left, tip, right, baseRight];
  return layer(
    id,
    polygon(outline, tones.body) +
      polygon([left, tip, spine, baseLeft], tones.light) +
      polygon([tip, right, baseRight, spine], tones.dark) +
      polygon([baseLeft, spine, baseRight], tones.body) +
      polygon(outline, "none", outlineStroke(96)),
    { "data-zone": "crystal" },
  );
}

export function crystalFrames(
  index,
  orientation = "floor",
  variant = DRESSING_DEFAULTS.crystal,
  seed = DRESSING_SEED,
  highContrast = false,
) {
  assertVariant(variant);
  const sizes = [52, 82, 116],
    size = sizes[index],
    scale = (size - 10) / 96;
  const rng = random(`${seed}/crystal/${index}/${orientation}`);
  const layouts = {
    facets: [
      [12, 22, 32, -7],
      [34, 23, 76, 0],
      [64, 20, 48, 12],
    ],
    splinter: [
      [8, 23, 62, -5],
      [33, 26, 40, 0],
      [55, 26, 87, 7],
      [79, 12, 26, 8],
    ],
    shelf: [
      [10, 31, 43, -5],
      [35, 21, 51, 8],
      [57, 33, 38, 5],
    ],
  };
  const tones = highContrast ? CRYSTAL_HC_TONES : CRYSTAL_TONES;
  const body = layouts[variant]
    .map(([x, w, h, lean], i) =>
      shard(
        5 + x * scale,
        size - 5,
        w * scale,
        h * scale,
        (lean + rng.range(-1, 1)) * scale,
        tones,
        `crystal-${i}`,
      ),
    )
    .join("");
  const top = layouts[variant].reduce((a, b) => (a[2] > b[2] ? a : b));
  const cx = 5 + (top[0] + top[1] * 0.48 + top[3]) * scale;
  const cy = size - 5 - top[2] * scale + 5 * scale;
  const r = 2.8 * scale;
  // A tiny hard sparkle, entirely inside its shard. Its HC sibling carries
  // the same silhouette in black: ADD emits zero light and preserves the
  // value cue while satisfying the atlas's nonempty-frame invariant.
  const sparkle = polygon(
    [
      [cx, cy - r],
      [cx + r * 0.35, cy - r * 0.3],
      [cx + r, cy],
      [cx + r * 0.35, cy + r * 0.3],
      [cx, cy + r],
      [cx - r * 0.35, cy + r * 0.3],
      [cx - r, cy],
      [cx - r * 0.35, cy - r * 0.3],
    ],
    tones.sparkle,
  );
  const wrap = (drawing) =>
    orientation === "floor"
      ? drawing
      : `<g transform="translate(${size} 0) rotate(90)">${drawing}</g>`;
  const name = `cave-crystal-${orientation}-${index}${highContrast ? "-hc" : ""}`;
  const pair = emissivePair({
    name,
    width: size,
    height: size,
    layers: [
      { name: "cluster", body: wrap(body) },
      { name: "sparkle", unlit: "", lit: wrap(sparkle) || "<g/>" },
    ],
  });
  return pair.map((f) =>
    frame(f.name, size, size, "crystal", f.body, variant, {
      anchor: orientation,
      highContrast,
      baseline: size - 2.88,
    }),
  );
}

export function dressingFrames({
  variants = DRESSING_DEFAULTS,
  seed = DRESSING_SEED,
} = {}) {
  const picked = { ...DRESSING_DEFAULTS, ...variants },
    out = [];
  for (const v of Object.values(picked)) assertVariant(v);
  for (let i = 0; i < 9; i++)
    out.push(stalactiteFrame(i, picked.stalactite, seed));
  for (let i = 0; i < 4; i++) out.push(rustDripFrame(i, picked.rust, seed));
  for (let i = 0; i < 6; i++) out.push(rustParticleFrame(i, picked.rust));
  for (let i = 0; i < 6; i++) out.push(rubbleFrame(i, picked.rubble, seed));
  for (let i = 0; i < 3; i++) out.push(boulderFrame(i, picked.boulder, seed));
  for (const orientation of ["floor", "wall"])
    for (let i = 0; i < 3; i++)
      for (const highContrast of [false, true])
        out.push(
          ...crystalFrames(i, orientation, picked.crystal, seed, highContrast),
        );
  return out;
}
