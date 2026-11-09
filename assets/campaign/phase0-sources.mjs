/** Shared original backdrop and material drawings for the readability pass.
 * Authoring only: the game loads the committed PNGs, never this module.
 *
 * Art item A4 (docs/ART_QUALITY_AUDIT.md §5.6 rows 12 and 13): the W01 ridges
 * are three seeded, faceted layers (far, mid, near) and the W01 sky body keeps
 * the board's crescent, recoloured. Both use the art kit in ./kit/. The comet
 * (W02) drawings are unchanged until X2.
 */
import { random } from "./kit/random.mjs";
import { board, mixLab, withL } from "./kit/palette.mjs";
import {
  layer,
  linearGradient,
  periodic,
  polygon,
  rect,
  shift,
} from "./kit/svg.mjs";

const path = (d, fill, stroke = "none", width = 0) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const circle = (x, y, r, fill) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

// The transparent border is wider than the sampling footprint. Both axes wrap
// identically, without duplicating a planet or a painted gradient.
export function stars(comet = false) {
  let drawing = "";
  for (let i = 0; i < 88; i++) {
    const x = 8 + ((i * 193 + (comet ? 23 : 41)) % 1008);
    const y = 8 + ((i * 79 + (comet ? 31 : 29)) % 496);
    drawing += circle(
      x,
      y,
      i % 13 === 0 ? 1.6 : 0.8,
      i % 11 === 0 ? "#BAA683" : comet ? "#78A9B8" : "#7A969D",
    );
  }
  return `<g id="seamless-stars" data-layer="seamless-stars">${drawing}</g>`;
}

export function skyBody(comet = false) {
  if (comet)
    return (
      path("M250 20 Q164 39 58 152 Q156 111 250 126 Z", "#285D70") +
      path("M250 49 Q165 72 83 145 Q165 117 250 105 Z", "#3D7685") +
      circle(70, 166, 43, "#456F7D") +
      path(
        "M56 126 Q99 124 111 163 Q125 194 98 208 Q117 167 83 142 Z",
        "#7EAAA9",
      )
    );
  return w01SkyBody();
}

// The board's crescent, lit from the right as drawn (D9 withdrawn): the same
// disc, crescent and band paths as before, recoloured to the board samples
// (asset 13). The crescent darkens toward both tips, the one soft gradient the
// style guide allows here (curvature).
const CRESCENT =
  "M114 47 Q185 46 208 101 Q228 154 193 188 Q222 128 181 85 Q156 60 114 47 Z";
const PLANET_BANDS = "M65 155 Q126 174 191 146 M58 131 Q119 149 202 124";

function w01SkyBody() {
  const disc = board("planet_disc"); // #334a57, L* 30.1
  const crescent = board("planet_crescent"); // #d79a61, L* 68.3
  const tip = withL(crescent, 61.5);
  const bands = withL(disc, 41); // the board's band strokes read L* 41
  const limb = linearGradient(
    "w01-crescent-limb",
    [
      [0, tip],
      [0.4, crescent],
      [0.65, crescent],
      [1, tip],
    ],
    { x1: 0, y1: 47, x2: 0, y2: 188, units: "userSpaceOnUse" },
  );
  return (
    `<defs>${limb}</defs>` +
    layer("disc", circle(128, 128, 83, disc)) +
    layer("crescent", path(CRESCENT, "url(#w01-crescent-limb)")) +
    layer("bands", path(PLANET_BANDS, "none", bands, 7))
  );
}

/**
 * A ridge layer page, 1024 × 384 at @2x.
 *
 * W01 (asset 12): `ridges("far" | "mid" | "near")`, three seeded faceted
 * layers; `options.style` picks a silhouette preset from W01_RIDGE_STYLES.
 * W02 keeps its two drawings: `ridges(near, true)`, as before.
 */
export function ridges(which, comet = false, options = {}) {
  if (comet || typeof which === "boolean")
    return legacyRidges(which === true || which === "near", comet);
  return w01Ridges(which, options.style);
}

// Seam endpoints have the same height and colour and a flat 16-pixel margin.
// Distinct peak layouts prevent the two parallax silhouettes from coinciding.
function legacyRidges(near, comet = false) {
  const points = near
    ? [
        [0, 286],
        [16, 286],
        [77, 257],
        [143, 180],
        [208, 249],
        [267, 218],
        [341, 143],
        [416, 234],
        [486, 187],
        [563, 244],
        [633, 171],
        [705, 227],
        [783, 133],
        [863, 222],
        [929, 242],
        [1008, 286],
        [1024, 286],
      ]
    : [
        [0, 310],
        [16, 310],
        [112, 270],
        [207, 287],
        [310, 242],
        [407, 275],
        [512, 259],
        [615, 294],
        [718, 244],
        [817, 272],
        [915, 268],
        [1008, 310],
        [1024, 310],
      ];
  if (comet)
    for (let i = 2; i < points.length - 2; i++) {
      points[i][0] += i % 2 === 0 ? 16 : -12;
      points[i][1] += [22, -16, 14, -25][i % 4];
    }
  const fill = comet
    ? near
      ? "#264F62"
      : "#2A4D60"
    : near
      ? "#293E48"
      : "#304753";
  const light = comet
    ? near
      ? "#477B8B"
      : "#3E6273"
    : near
      ? "#52636A"
      : "#415865";
  const line = `M${points.map(([x, y]) => `${x} ${y}`).join(" L")} V384 H0 Z`;
  let drawing =
    `<rect y="288" width="1024" height="96" fill="${fill}"/>` +
    path(line, fill);
  for (let i = 2; i < points.length - 2; i++) {
    const [x, y] = points[i],
      [previousX, previousY] = points[i - 1],
      [nextX, nextY] = points[i + 1];
    if (y >= previousY || y >= nextY) continue;
    drawing += path(
      `M${previousX} ${previousY} L${x} ${y} L${x + (nextX - x) * 0.36} ${Math.min(348, y + (near ? 110 : 60))} Z`,
      light,
    );
    if (near)
      drawing += path(
        `M${x} ${y} L${x + 14} ${Math.min(353, y + 126)} L${nextX} ${nextY}`,
        "none",
        comet ? "#1A394D" : "#1C303A",
        3,
      );
  }
  return `<g id="${near ? "near" : "far"}-continuous-ridge" data-layer="ridge">${drawing}</g>`;
}

// ---------------------------------------------------------------- W01 ridges
// One layer per page, 1024 × 384 at @2x (96 px per tile, 10.67 tiles wide),
// tiled horizontally by the game. Heights are tiles above the layer's ground
// row: y 384, the page's bottom edge, for far and mid; y 300 for near, which
// the game places 0.875 tile lower (scene.ts: surfaceY − 300 · scale).
const PAGE = { width: 1024, height: 384, cell: 96 };
export const W01_RIDGE_LAYERS = {
  far: { ground: 384, parallax: 0.2 },
  mid: { ground: 384, parallax: 0.35 },
  near: { ground: 300, parallax: 0.6 },
};
// check-campaign-assets.mjs needs a page's first and last columns identical
// and its bottom quarter opaque. So every shape is drawn periodically; a col
// with a flat top is drawn in front across the 12 px either side of x = 0,
// with nothing above it there; and a base band fills rows 288 to 383.
const SEAM = 12;
const BAND_TOP = 288;

/**
 * Silhouette presets, one per variant shown at the A4 review. Per layer:
 * peaks per page; height in tiles above the layer's ground (the tallest is
 * exactly the top of the range); run, the flank's horizontal run per unit of
 * drop (1 is 45°); skew, how far left and right runs may differ; crest, where
 * the lit face ends at the ground, as a share of the right half-width; upper,
 * the chance of a third, lighter facet under the summit (top-lit, style
 * guide §4); rest, the heights of the other peaks when the tallest is to
 * stand out; spread, how far a peak may leave its even slot (default 0.28 of
 * a slot); front, smaller peaks drawn in front; mesas, flat-topped buttes;
 * col, the seam col's height in tiles.
 */
// The near layer is the board's dark foothills in every preset: low, broad,
// two close tones.
const FOOTHILLS = {
  peaks: 9,
  height: [0.65, 1.25],
  run: [1.7, 2.6],
  skew: 0.4,
  crest: [0.1, 0.5],
  col: 0.35,
};
export const W01_RIDGE_STYLES = {
  // A: the board's pyramids. Few, tall, single-crest peaks; two tones a peak.
  pyramids: {
    far: {
      peaks: 7,
      height: [1.45, 2.15],
      run: [1.5, 2.0],
      skew: 0.25,
      crest: [0, 0.35],
      col: 1.35,
    },
    // Round 2 (director, 2026-11-08): one dominant peak a page, the others
    // clearly lower, spacing less even; foothills up to 1.45 tiles.
    mid: {
      peaks: 4,
      height: [1.45, 2.65],
      rest: [1.45, 2.3],
      spread: 0.4,
      run: [1.05, 1.35],
      skew: 0.3,
      crest: [0.05, 0.4],
      front: { peaks: 3, height: [1.1, 1.5], run: [1.15, 1.5] },
      col: 1.05,
    },
    near: { ...FOOTHILLS, height: [0.65, 1.45], rest: [0.65, 1.3] },
  },
  // B: a serrated range. More, steeper peaks of mixed heights, lit summits.
  range: {
    far: {
      peaks: 9,
      height: [1.6, 2.35],
      run: [1.0, 1.4],
      skew: 0.35,
      crest: [-0.1, 0.4],
      upper: 0.4,
      col: 1.35,
    },
    mid: {
      peaks: 6,
      height: [1.5, 2.75],
      run: [0.75, 1.0],
      skew: 0.4,
      crest: [-0.1, 0.45],
      upper: 0.7,
      front: { peaks: 4, height: [1.05, 1.5], run: [0.85, 1.15] },
      col: 1.05,
    },
    near: { ...FOOTHILLS, peaks: 11, run: [1.4, 2.1] },
  },
  // C: spires and mesas. Two tall spires among flat-topped buttes.
  spires: {
    far: {
      peaks: 5,
      height: [1.5, 2.1],
      run: [1.6, 2.2],
      skew: 0.3,
      crest: [0, 0.3],
      mesas: {
        count: 2,
        height: [1.75, 2.1],
        top: [1.4, 2.4],
        run: [0.5, 0.8],
      },
      col: 1.35,
    },
    mid: {
      peaks: 2,
      height: [2.4, 2.75],
      run: [0.42, 0.6],
      skew: 0.3,
      crest: [0.05, 0.35],
      upper: 0.5,
      mesas: {
        count: 3,
        height: [1.35, 1.75],
        top: [0.9, 1.7],
        run: [0.28, 0.45],
      },
      front: { peaks: 3, height: [1.0, 1.35], run: [1.0, 1.35] },
      col: 1.05,
    },
    near: {
      ...FOOTHILLS,
      peaks: 6,
      mesas: {
        count: 3,
        height: [0.7, 1.05],
        top: [0.7, 1.4],
        run: [0.6, 0.9],
      },
    },
  },
};
/** The preset the generator draws when no style is named. */
export const W01_RIDGE_STYLE = "pyramids";

/** Ridge colours from the board samples (style guide §1 and §5). */
export function w01RidgeColours() {
  const lit = board("ridge_far_lit"); // #586468, L* 41.5: lit pyramid faces
  const dark = board("ridge_near_shadow"); // #2a3d48, L* 24.6
  const horizon = board("sky_horizon"); // #2d4451, L* 27.5
  return {
    // Atmospheric perspective: the far range sits 1 to 6 L* above the
    // horizon sky it stands in, in the sky's hue.
    far: {
      upper: withL(mixLab(horizon, lit, 0.35), 35.5),
      lit: withL(mixLab(horizon, lit, 0.35), 33.5),
      shadow: withL(horizon, 29.5),
      body: withL(horizon, 30),
    },
    mid: {
      upper: withL(lit, 45),
      lit,
      shadow: withL(mixLab(lit, dark, 0.5), 32),
      body: withL(dark, 28.5),
    },
    // The board's foothills read L* 17 to 24, darkest at the ground.
    near: {
      upper: withL(dark, 25.5),
      lit: withL(dark, 23.5),
      shadow: withL(dark, 19.5),
      body: withL(dark, 20.5),
    },
  };
}

/**
 * Keep a shape's silhouette under the seam col's top at both edges of the
 * seam: move it away from the seam, keeping its height and slopes, so the
 * seam always falls in a valley (lowering a shape there left 3 px slivers).
 */
function clearSeam(shape, limit, width) {
  const flat = shape.top ? shape.top / 2 : 0;
  const needL = flat + Math.max(0, shape.h - limit) * shape.runL;
  const needR = flat + Math.max(0, shape.h - limit) * shape.runR;
  // The guard edges its flanks face, periodically.
  const left = shape.x - SEAM,
    right = width - SEAM - shape.x;
  if (left < right) {
    if (left < needL) shape.x += needL - left;
  } else if (right < needR) shape.x -= needR - right;
}

function makePeak(rng, spec, x, h, cell) {
  const run = rng.range(spec.run[0], spec.run[1]);
  const skew = spec.skew ?? 0.25;
  const lean = rng.range(-skew / 2, skew / 2);
  return {
    kind: "peak",
    x,
    h: h * cell,
    runL: run * (1 + lean),
    runR: run * (1 - lean),
    crest: rng.range(...(spec.crest ?? [0, 0.3])),
    upper: rng.chance(spec.upper ?? 0)
      ? [rng.range(0.22, 0.38), rng.range(0.12, 0.26)]
      : null,
  };
}

function makeMesa(rng, mesas, x, cell) {
  const run = rng.range(mesas.run[0], mesas.run[1]);
  return {
    kind: "mesa",
    x,
    h: rng.range(mesas.height[0], mesas.height[1]) * cell,
    top: rng.range(mesas.top[0], mesas.top[1]) * cell,
    runL: run * rng.range(0.85, 1.15),
    runR: run * rng.range(0.85, 1.15),
    // The crest leaves the top this far across it, then drops with a slant.
    split: rng.range(0.4, 0.68),
    crest: rng.range(0.05, 0.25),
    upper: null,
  };
}

/** The facet polygons of one shape, page coordinates, before any periodic shift. */
function facets(shape, ground, bottom, tones) {
  const { x, h } = shape;
  const apexY = ground - h;
  const drop = bottom - apexY;
  const flat = shape.top ? shape.top / 2 : 0;
  const leftTop = [x - flat, apexY];
  const rightTop = [x + flat, apexY];
  const leftFoot = [x - flat - shape.runL * drop, bottom];
  const rightFoot = [x + flat + shape.runR * drop, bottom];
  // The crest leaves the summit (a mesa: part way across its top) and meets
  // the ground `crest` of the way across the right half-width; below the
  // ground it keeps its line to the page bottom.
  const crestTop = shape.top
    ? [leftTop[0] + shape.top * shape.split, apexY]
    : rightTop;
  const crestGround = crestTop[0] + shape.crest * shape.runR * h;
  const crestFoot = [
    crestTop[0] + ((crestGround - crestTop[0]) * drop) / h,
    bottom,
  ];
  const parts = [
    [[leftTop, rightTop, rightFoot, leftFoot], tones.shadow],
    [[leftTop, crestTop, crestFoot, leftFoot], tones.lit],
  ];
  if (shape.kind === "mesa") {
    // Top-lit bevel on the flat top (style guide §4): a thin lighter cap
    // over the lit part.
    const cap = Math.min(9, h * 0.1);
    parts.push([
      [
        leftTop,
        crestTop,
        [crestTop[0], apexY + cap],
        [leftTop[0] - shape.runL * cap * 0.5, apexY + cap],
      ],
      tones.upper,
    ]);
  }
  if (shape.upper) {
    // A lighter facet under the summit, on the lit side.
    const [onFlank, onCrest] = shape.upper;
    parts.push([
      [
        crestTop,
        [crestTop[0] - shape.runL * h * onFlank, apexY + h * onFlank],
        [
          crestTop[0] + (crestGround - crestTop[0]) * onCrest,
          apexY + h * onCrest,
        ],
      ],
      tones.upper,
    ]);
  }
  return parts;
}

function w01Ridges(which, styleName = W01_RIDGE_STYLE) {
  const { ground, colTop, back, front } = w01RidgeLayout(which, styleName);
  const { width, height } = PAGE;
  const tones = w01RidgeColours()[which];
  const draw = (shapes) =>
    shapes
      .map((shape) =>
        facets(shape, ground, height, tones)
          .map(([points, fill]) =>
            periodic(width, (offset) => {
              const moved = shift(points, offset);
              const xs = moved.map(([px]) => px);
              return Math.max(...xs) < 0 || Math.min(...xs) > width
                ? ""
                : polygon(moved, fill);
            }),
          )
          .join(""),
      )
      .join("");
  // The seam col: a low, flat-topped saddle in the shadow tone, in front,
  // steep enough that no flank beside it runs parallel to its sides.
  const colRun = 0.6 * (height - colTop);
  const colHalf = SEAM + 6;
  const col = periodic(width, (offset) =>
    polygon(
      shift(
        [
          [-colHalf - colRun, height],
          [-colHalf, colTop],
          [colHalf, colTop],
          [colHalf + colRun, height],
        ],
        offset,
      ),
      tones.shadow,
    ),
  );
  return layer(
    `ridge-${which}`,
    layer(
      `ridge-${which}-base`,
      rect(0, BAND_TOP, width, height - BAND_TOP, tones.body),
    ) +
      // Taller back shapes stand behind shorter ones.
      layer(`ridge-${which}-range`, draw([...back].sort((a, b) => b.h - a.h))) +
      (front.length ? layer(`ridge-${which}-front`, draw(front)) : "") +
      layer(`ridge-${which}-col`, col),
  );
}

/**
 * Where a W01 ridge layer's shapes stand on its page: the seeded layout its
 * drawing is made from. Each shape is { kind ("peak" or "mesa"), x, h (px
 * above the layer's ground), runL, runR, top (mesas), split (mesas), crest,
 * upper }.
 */
export function w01RidgeLayout(which, styleName = W01_RIDGE_STYLE) {
  const spec = W01_RIDGE_STYLES[styleName]?.[which];
  const place = W01_RIDGE_LAYERS[which];
  if (!spec || !place)
    throw new Error(`Unknown W01 ridge layer or style: ${which}, ${styleName}`);
  const { width, cell } = PAGE;
  const ground = place.ground;
  const rng = random(`w01-ridges/${styleName}/${which}`);
  const colHeight = spec.col * cell;
  // Every shape stays 3 px under the col's top at the seam's edges.
  const limit = colHeight - 3;

  // Back row: peaks and mesas in stratified slots; the tallest peak takes
  // the slot farthest from the seam.
  const mesaCount = spec.mesas?.count ?? 0;
  const count = spec.peaks + mesaCount;
  const slotRng = rng.fork("slots");
  const slots = Array.from(
    { length: count },
    (_, index) =>
      ((index + 0.5 + slotRng.jitter(0, spec.spread ?? 0.28)) * width) / count,
  );
  const kinds = rng
    .fork("kinds")
    .shuffle([
      ...Array(spec.peaks).fill("peak"),
      ...Array(mesaCount).fill("mesa"),
    ]);
  const fromSeam = (x) => Math.min(x, width - x);
  const tallestSlot =
    slots
      .map((x, index) => ({ x, index }))
      .sort((a, b) => fromSeam(b.x) - fromSeam(a.x))
      .find(({ index }) => kinds[index] === "peak")?.index ?? 0;
  const heightRng = rng.fork("heights");
  const shapeRng = rng.fork("shapes");
  const back = slots.map((x, index) => {
    if (kinds[index] === "mesa") return makeMesa(shapeRng, spec.mesas, x, cell);
    const h =
      index === tallestSlot
        ? spec.height[1]
        : heightRng.range(
            ...(spec.rest ?? [spec.height[0], spec.height[1] - 0.1]),
          );
    return makePeak(shapeRng, spec, x, h, cell);
  });

  // Front row: smaller peaks in the gaps between back slots.
  const front = [];
  if (spec.front) {
    const frontRng = rng.fork("front");
    const sorted = [...slots].sort((a, b) => a - b);
    const gaps = sorted.map((x, index) => {
      const next =
        index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + width;
      return (x + next) / 2;
    });
    for (const x of frontRng.shuffle(gaps).slice(0, spec.front.peaks)) {
      const h = frontRng.range(spec.front.height[0], spec.front.height[1]);
      front.push(
        makePeak(
          frontRng,
          { ...spec, run: spec.front.run, upper: 0 },
          frontRng.jitter(x, width * 0.03),
          h,
          cell,
        ),
      );
    }
  }

  for (const shape of [...back, ...front]) {
    shape.x = ((shape.x % width) + width) % width;
    clearSeam(shape, limit, width);
  }
  return { ground, colTop: ground - colHeight, back, front };
}

export function bedrock(comet = false) {
  let drawing = `<rect width="96" height="96" fill="${comet ? "#172631" : "#1B2026"}"/>`;
  for (let i = -96; i <= 96; i += 19)
    drawing += path(
      `M${i} 0 L${i + 96} 96`,
      "none",
      comet ? "#405461" : "#48505B",
      4,
    );
  drawing += path("M0 48 H96 M48 0 V96", "none", "#101923", 3);
  return `<g id="bedrock-crosshatch" data-layer="bedrock">${drawing}</g>`;
}

export function materialRim(mask, material) {
  const bed = material === "bedrock";
  const hard = material === "stone" || material === "frozen-rock" || bed;
  const icy = material === "ice" || material === "frozen-rock";
  const hi = bed ? "#89949D" : hard ? "#8194A6" : icy ? "#B8E6EB" : "#B0B5AF";
  const shadow = icy ? "#102B3D" : "#14232B";
  let drawing = "";
  const edge = (d, inset) =>
    path(d, "none", hi, bed ? 5 : hard ? 4 : 5) +
    path(inset, "none", shadow, 3);
  if (mask & 1)
    drawing += edge(
      "M0 2 H19 L26 7 H49 L57 2 H79 L86 6 H96",
      "M0 9 H19 L26 14 H49 L57 9 H79 L86 13 H96",
    );
  if (mask & 2)
    drawing += edge(
      "M94 0 V22 L89 29 V52 L94 61 V79 L89 86 V96",
      "M87 0 V22 L82 29 V52 L87 61 V79 L82 86 V96",
    );
  if (mask & 4)
    drawing += edge(
      "M0 94 H19 L26 89 H49 L57 94 H79 L86 89 H96",
      "M0 87 H19 L26 82 H49 L57 87 H79 L86 82 H96",
    );
  if (mask & 8)
    drawing += edge(
      "M2 0 V22 L7 29 V52 L2 61 V79 L7 86 V96",
      "M9 0 V22 L14 29 V52 L9 61 V79 L14 86 V96",
    );
  return `<g id="${material}-exposed-rim" data-layer="exposed-rim">${drawing}</g>`;
}
