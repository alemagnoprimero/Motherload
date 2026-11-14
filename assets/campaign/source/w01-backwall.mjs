/** A8 periodic cave silhouettes. Profiles are hand drawn against the wide
 * cavern crop; the seeded stream moves only internal facet junctions.
 * These are transparent world-position strips, never cave-shaped masks.
 */
import { random } from "../kit/random.mjs";
import { withL } from "../kit/palette.mjs";
import { layer, polygon, pathData, svgDocument } from "../kit/svg.mjs";

export const BACKWALL_VARIANTS = ["vaults", "needles", "shelves"];
export const BACKWALL_DEFAULT = "vaults";
export const BACKWALL_SEED = "DF-A8-2026-11-14";
export const BACKWALL_BASE = "#17242e";
export const BACKWALL_TONES = {
  far: {
    light: withL("#1b2933", 19),
    body: withL("#1b2933", 15),
    dark: withL("#1b2933", 11),
  },
  near: {
    light: withL("#1b2933", 23),
    body: withL("#1b2933", 19),
    dark: withL("#1b2933", 15),
  },
};

// The first/last 64 px are horizontal with the same colour: no hidden
// padding, rescaled edge copy, or runtime repeat sampler is needed.
export const BACKWALL_ARCHETYPES = {
  vaults: {
    far: [
      [0, 100],
      [64, 100],
      [108, 160],
      [145, 178],
      [171, 126],
      [246, 111],
      [280, 54],
      [343, 68],
      [375, 122],
      [414, 137],
      [447, 210],
      [482, 189],
      [505, 125],
      [579, 94],
      [615, 132],
      [658, 114],
      [701, 57],
      [755, 71],
      [785, 135],
      [827, 161],
      [859, 114],
      [929, 84],
      [960, 100],
      [1024, 100],
    ],
    near: [
      [0, 300],
      [64, 300],
      [104, 269],
      [154, 280],
      [207, 226],
      [240, 237],
      [272, 177],
      [322, 199],
      [363, 264],
      [416, 281],
      [458, 248],
      [494, 272],
      [536, 221],
      [582, 213],
      [617, 162],
      [665, 188],
      [707, 253],
      [751, 271],
      [786, 226],
      [827, 239],
      [864, 287],
      [913, 269],
      [960, 300],
      [1024, 300],
    ],
  },
  needles: {
    far: [
      [0, 86],
      [64, 86],
      [105, 122],
      [137, 239],
      [154, 149],
      [193, 105],
      [254, 81],
      [295, 104],
      [325, 180],
      [344, 112],
      [391, 88],
      [450, 129],
      [475, 206],
      [494, 142],
      [553, 93],
      [617, 60],
      [658, 96],
      [689, 165],
      [712, 89],
      [771, 76],
      [817, 130],
      [851, 232],
      [870, 127],
      [926, 86],
      [1024, 86],
    ],
    near: [
      [0, 312],
      [64, 312],
      [118, 287],
      [162, 191],
      [179, 260],
      [227, 302],
      [284, 276],
      [327, 145],
      [348, 241],
      [397, 289],
      [454, 309],
      [503, 282],
      [542, 212],
      [563, 271],
      [615, 295],
      [666, 262],
      [709, 132],
      [727, 254],
      [784, 292],
      [838, 268],
      [878, 208],
      [900, 280],
      [960, 312],
      [1024, 312],
    ],
  },
  shelves: {
    far: [
      [0, 126],
      [64, 126],
      [117, 146],
      [168, 148],
      [203, 95],
      [267, 93],
      [307, 52],
      [366, 54],
      [399, 89],
      [443, 92],
      [487, 164],
      [550, 166],
      [581, 118],
      [645, 116],
      [686, 78],
      [744, 80],
      [780, 121],
      [846, 123],
      [887, 171],
      [931, 157],
      [960, 126],
      [1024, 126],
    ],
    near: [
      [0, 288],
      [64, 288],
      [111, 248],
      [174, 246],
      [211, 219],
      [271, 217],
      [302, 167],
      [366, 169],
      [400, 224],
      [465, 226],
      [501, 270],
      [557, 271],
      [590, 232],
      [654, 231],
      [690, 181],
      [745, 182],
      [783, 220],
      [845, 218],
      [880, 265],
      [931, 268],
      [960, 288],
      [1024, 288],
    ],
  },
};

function stripDrawing(profile, side, tones, seed) {
  const rng = random(seed),
    ceiling = side === "far";
  const edge = ceiling ? -4 : 388;
  const inward = ceiling ? -1 : 1;
  const outline = [
    [-4, edge],
    [-4, profile[0][1]],
    ...profile,
    [1028, profile.at(-1)[1]],
    [1028, edge],
  ];
  let body = polygon(outline, tones.dark);
  const inset = profile.map(([x, y]) => [x, y + inward * 46]);
  body += polygon([...profile, ...inset.reverse()], tones.body);
  const facetMask = [
    [-4, edge],
    ...profile.map(([x, y]) => [x, y + inward * 4]),
    [1028, edge],
  ];
  let facets = "";
  // Drawn triangular facets occupy broad regions beside rising edges.
  // The outer profile, horizontal seam and its alpha never depend on RNG.
  for (let i = 2; i < profile.length - 2; i += 3) {
    const a = profile[i - 1],
      b = profile[i],
      c = profile[i + 1];
    facets += polygon(
      [a, b, c, [b[0] + rng.range(-12, 12), b[1] + inward * rng.range(23, 36)]],
      tones.light,
    );
  }
  const clip = `backwall-${side}-facets`;
  return (
    `<defs><clipPath id="${clip}"><path d="${pathData(facetMask)}"/></clipPath></defs>` +
    layer(
      `backwall-${side}`,
      body + `<g clip-path="url(#${clip})">${facets}</g>`,
      { "data-zone": "backwall" },
    )
  );
}

export function backwallFrames({
  variant = BACKWALL_DEFAULT,
  seed = BACKWALL_SEED,
} = {}) {
  const archetype = BACKWALL_ARCHETYPES[variant];
  if (!archetype) throw new Error(`Unknown back-wall variant: ${variant}`);
  return ["far", "near"].map((side) => {
    const name = `cave-backwall-${side}`;
    const body = stripDrawing(
      archetype[side],
      side,
      BACKWALL_TONES[side],
      `${seed}/${side}`,
    );
    return {
      name,
      width: 1024,
      height: 384,
      logicalWidth: 512,
      logicalHeight: 192,
      family: "backwall",
      category: "dressing",
      source: "raster",
      maxDensity: 2,
      variant,
      layer: side,
      band: "C",
      anchor: "world",
      periodX: 512,
      verticalRepeat: "mirror",
      periodY: 384,
      body,
      svg: svgDocument(1024, 384, body, name),
    };
  });
}
