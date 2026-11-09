/**
 * W01 ore, package, socket and tier-mark drawings (art item A12 with T9;
 * docs/ART_QUALITY_AUDIT.md §5.3 row T9, §5.6 rows 24 and 25, §6.1).
 *
 * Side-effect free, so tests can rebuild the committed sources byte for byte;
 * create-w01-sources.mjs saves what these functions return. Uses the art kit
 * (assets/campaign/kit/): board samples and Lab moves for the tones, the
 * §6.1 outline rule, and seeded random for the cracked socket.
 *
 * - Ore frames (asset 25), 96 units, drawn by the game at 0.9 tile: each ore
 *   is flat facets in three top-lit tones (lit top, body, shadow; copper adds
 *   a dim side, gold a dark hollow), 4 to 7 facet shapes, under one #14232b
 *   outline at outlineWidth(96), with thinner facet seams and a 1.6-unit
 *   highlight on the lit top edges, as on the board. Copper's
 *   body is the board's ore_copper and silver's lit top its ore_silver_top.
 *   No cream notches (T9). The mark is oreBadge() from ../render-sources.mjs.
 * - Package frames: the same ore at 0.74 in a plain cargo strap, without the
 *   orange tag square (T9), with the same mark.
 * - Deposit socket (asset 24): one generic decal the game draws under every
 *   deposit at 1 tile, so the ore reads as set into the block: a faint
 *   translucent recess whose top follows O1, the lowest and commonest ore,
 *   and whose lower part takes every ore's footprint (the taller ores rise
 *   out of the seat, as the board's copper does), a lit lip along the seat's
 *   upward-facing top edge only (no side arms), and a contact shadow under
 *   the ore. Translucent #14232b and lip light, so it darkens whatever band
 *   colour it lies on. Three variants for review; SOCKET_VARIANT picks the
 *   one that ships.
 */
import { OUTLINE, band, board, lab, shiftL, withL } from "../kit/palette.mjs";
import { random } from "../kit/random.mjs";
import { layer, outlineStroke, polygon, polyline } from "../kit/svg.mjs";
import { oreBadge, oreMarkHighContrast } from "../render-sources.mjs";

/** Facet seams: thinner than the silhouette outline, as the board draws them. */
const SEAM = 3.2;
/** The lit top edge (board: a 1 px highlight on the top facets). */
const HIGHLIGHT = 1.6;

const capped = (colour, L) => withL(colour, Math.min(L, 98));

/**
 * Tones per tier, top-lit: lit top facets, body, shadow (and copper's dim
 * side and gold's hollow). Copper's body is the board sample ore_copper
 * (#d69d6e, L* 69.1); silver's lit top is ore_silver_top (#e4e7e3, L* 91.3).
 */
const COPPER = board("ore_copper");
const SILVER = board("ore_silver_top");
/**
 * Hues the board has no sample for (named in the provenance record): O1 slag
 * iron's grey, the earlier frames' #657681 at half its chroma, nearer the
 * board's neutral dot-marked pebble (which is silver; slag stays darker to
 * keep O1 apart from O3), and O4's gold with its brown shadow, kept.
 */
const SLAG = "#6d757a";
const GOLD = "#edb44d";
const GOLD_SHADOW = "#a16b39";
export const ORE_TONES = [
  // O1 slag iron: the board's pebble shape in a cool slag grey, its body
  // facet about 8 L* above the band A soil page (51.6) and its lit pebbles
  // above the earlier frames' 70, so it does not sink into the soil block.
  {
    lit: withL(SLAG, 74),
    body: withL(SLAG, 55),
    shadow: withL(SLAG, 34),
  },
  // O2 rust copper: the board's copper prisms.
  {
    lit: shiftL(COPPER, 11),
    body: COPPER,
    dim: shiftL(COPPER, -12),
    shadow: shiftL(COPPER, -25),
  },
  // O3 shard silver.
  { lit: SILVER, body: shiftL(SILVER, -14), shadow: shiftL(SILVER, -45) },
  // O4 core crown: gold points round a dark hollow.
  {
    lit: withL(GOLD, 89),
    body: GOLD,
    shadow: withL(GOLD_SHADOW, 50),
    hollow: withL(GOLD_SHADOW, 24),
  },
].map((tones) => ({
  ...tones,
  highlight: capped(tones.lit, lab(tones.lit)[0] + 8),
}));

/**
 * Silhouettes and facets in the 96-unit frame, clockwise on screen. Every
 * facet edge on the boundary joins two consecutive silhouette points, so the
 * seams can be found from the facets. `highlight` lists the silhouette runs
 * that face up on lit facets.
 */
export const ORES = [
  {
    // The board's pebble ore: two lit pebbles on top, a body pebble below
    // left and a dark facet below right that carries the mark. Low and wide.
    name: "slag-iron",
    zone: "iron",
    silhouette: [
      [17, 71],
      [18.5, 54],
      [19, 48],
      [33, 38],
      [46, 46],
      [62, 40],
      [83, 51],
      [89, 67],
      [80, 81],
      [51, 86],
      [26, 83],
    ],
    facets: [
      ["lit", [[18.5, 54], [19, 48], [33, 38], [46, 46], [40, 56]]],
      ["lit", [[46, 46], [62, 40], [83, 51], [63, 65], [40, 56]]],
      ["shadow", [[83, 51], [89, 67], [80, 81], [51, 86], [63, 65]]],
      ["body", [[17, 71], [18.5, 54], [40, 56], [63, 65], [51, 86], [26, 83]]],
    ],
    highlight: [
      [[19, 48], [33, 38], [46, 46]],
      [[46, 46], [62, 40], [83, 51]],
    ],
  },
  {
    // The board's copper: a tall leaning prism (body face, dim side, dark
    // underside) and a smaller crystal with a lit top.
    name: "rust-copper",
    zone: "copper",
    silhouette: [
      [18, 74],
      [25, 22],
      [41, 11],
      [49, 47],
      [62, 33],
      [78, 55],
      [74, 77],
      [47, 86],
      [30, 83],
    ],
    facets: [
      ["body", [[18, 74], [25, 22], [41, 11], [38, 64]]],
      ["dim", [[41, 11], [49, 47], [48, 70], [38, 64]]],
      ["shadow", [[18, 74], [38, 64], [48, 70], [47, 86], [30, 83]]],
      ["lit", [[49, 47], [62, 33], [78, 55], [60, 66]]],
      ["shadow", [[49, 47], [60, 66], [78, 55], [74, 77], [47, 86], [48, 70]]],
    ],
    highlight: [
      [[18, 74], [25, 22], [41, 11]],
      [[49, 47], [62, 33], [78, 55]],
    ],
  },
  {
    // Shard silver: a tall central shard between a short left shard and a
    // right shard with a lit top, deep valleys between them.
    name: "shard-silver",
    zone: "silver",
    silhouette: [
      [18, 82],
      [20, 50],
      [32, 56],
      [44, 8],
      [58, 38],
      [75, 22],
      [84, 56],
      [75, 80],
      [52, 90],
      [31, 89],
    ],
    facets: [
      ["body", [[18, 82], [20, 50], [32, 56], [34, 84], [31, 89]]],
      ["lit", [[32, 56], [44, 8], [46, 62]]],
      ["shadow", [[44, 8], [58, 38], [46, 62]]],
      ["body", [[32, 56], [46, 62], [52, 90], [31, 89], [34, 84]]],
      ["shadow", [[46, 62], [58, 38], [64, 62], [52, 90]]],
      ["lit", [[58, 38], [75, 22], [84, 56], [64, 62]]],
      ["shadow", [[64, 62], [84, 56], [75, 80], [52, 90]]],
    ],
    highlight: [
      [[32, 56], [44, 8]],
      [[58, 38], [75, 22], [84, 56]],
    ],
  },
  {
    // Core crown: three gold points (the middle one lower) round a dark
    // hollow, on a wide band.
    name: "core-crown",
    zone: "gold",
    silhouette: [
      [10, 48],
      [20, 16],
      [36, 36],
      [50, 24],
      [62, 36],
      [78, 14],
      [90, 46],
      [86, 74],
      [58, 87],
      [28, 82],
      [14, 68],
    ],
    facets: [
      ["lit", [[10, 48], [20, 16], [36, 36], [36, 52]]],
      ["lit", [[36, 36], [50, 24], [62, 36], [50, 44]]],
      ["lit", [[62, 36], [78, 14], [90, 46], [62, 52]]],
      ["hollow", [[36, 52], [36, 36], [50, 44], [62, 36], [62, 52], [66, 68], [36, 70]]],
      ["body", [[10, 48], [36, 52], [36, 70], [28, 82], [14, 68]]],
      ["body", [[62, 52], [90, 46], [86, 74], [66, 68]]],
      ["shadow", [[36, 70], [66, 68], [86, 74], [58, 87], [28, 82]]],
    ],
    highlight: [
      [[10, 48], [20, 16]],
      [[36, 36], [50, 24]],
      [[62, 36], [78, 14]],
    ],
  },
];

const key = ([x, y]) => `${x},${y}`;

/** Facet edges that are not on the silhouette: the seams between facets. */
function seams(ore) {
  const boundary = new Set();
  ore.silhouette.forEach((point, index) => {
    const next = ore.silhouette[(index + 1) % ore.silhouette.length];
    boundary.add(`${key(point)}|${key(next)}`);
    boundary.add(`${key(next)}|${key(point)}`);
  });
  const seen = new Set(),
    lines = [];
  for (const [, points] of ore.facets)
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const edge = `${key(point)}|${key(next)}`;
      if (boundary.has(edge) || seen.has(edge)) return;
      seen.add(edge);
      seen.add(`${key(next)}|${key(point)}`);
      lines.push([point, next]);
    });
  return lines;
}

/** A run of silhouette points moved `d` inward (clockwise on screen). */
function inset(points, d) {
  const lines = [];
  for (let index = 0; index + 1 < points.length; index++) {
    const [x0, y0] = points[index],
      [x1, y1] = points[index + 1];
    const length = Math.hypot(x1 - x0, y1 - y0);
    // Clockwise with y down: inward is (-dy, dx) / length.
    const nx = -(y1 - y0) / length,
      ny = (x1 - x0) / length;
    lines.push([
      [x0 + nx * d, y0 + ny * d],
      [x1 + nx * d, y1 + ny * d],
    ]);
  }
  const out = [lines[0][0]];
  for (let index = 0; index + 1 < lines.length; index++) {
    const [[ax, ay], [bx, by]] = lines[index],
      [[cx, cy], [dx, dy]] = lines[index + 1];
    const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(denominator) < 1e-9) out.push([bx, by]);
    else {
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denominator;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
  }
  out.push(lines[lines.length - 1][1]);
  // Pull the ends in along their runs so the strip stays on its facets.
  const pull = ([x0, y0], [x1, y1]) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const t = Math.min(0.45, (d * 1.2) / length);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  out[0] = pull(out[0], out[1]);
  out[out.length - 1] = pull(out[out.length - 1], out[out.length - 2]);
  return out;
}

/** One ore's drawing (no mark): facets, highlights, seams, outline. */
export function oreBody(index) {
  const ore = ORES[index],
    tones = ORE_TONES[index];
  const base = polygon(ore.silhouette, tones.shadow);
  const facets = ore.facets
    .map(([tone, points]) => polygon(points, tones[tone]))
    .join("");
  const highlights = ore.highlight
    .map((run) =>
      polyline(inset(run, 3.1), tones.highlight, HIGHLIGHT, {
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    )
    .join("");
  const seamLines = seams(ore)
    .map((line) => polyline(line, OUTLINE, SEAM, { "stroke-linecap": "round" }))
    .join("");
  // §6.1: one #14232b outline at 4.4 % of the 96-unit cell, round joins.
  const outline = polygon(ore.silhouette, "none", outlineStroke(96));
  return layer(
    "mineral-facets",
    base + facets + highlights + seamLines + outline,
    { "data-zone": ore.zone },
  );
}

/** ore-oN: the ore and its tier mark. */
export function oreFrame(index) {
  return oreBody(index) + oreBadge(index + 1);
}

/** package-oN: the ore at 0.74 in a cargo strap (no tag square), and the mark. */
export function packageFrame(index) {
  return (
    `<g transform="translate(13 10) scale(.74)">${oreBody(index)}</g>` +
    layer(
      "cargo-harness",
      `<path d="M16 55 L25 77 H72 L82 53 M25 77 V88 H73 V77 M35 80 V87 M62 80 V87" fill="none" stroke="#b3c0bd" stroke-width="5"/>`,
    ) +
    oreBadge(index + 1)
  );
}

/** tier-mark-hc-N: the high-contrast mark alone, at the ore frame's place. */
export function tierMarkHighContrastFrame(tier) {
  return oreMarkHighContrast(tier);
}

// ---------------------------------------------------------------- the socket
/** The socket frame is drawn at 1 tile, the ore at 0.9: ore → socket units. */
export const ORE_SCALE = 0.9;
const toSocket = ([x, y]) => [48 + (x - 48) * ORE_SCALE, 48 + (y - 48) * ORE_SCALE];

/** Convex hull (Andrew's monotone chain): clockwise on screen. */
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [],
    upper = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0)
      lower.pop();
    lower.push(point);
  }
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0)
      upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A convex polygon (clockwise on screen) grown by `d` along its normals. */
function grow(points, d) {
  const n = points.length;
  const normal = (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  };
  return points.map((point, index) => {
    const before = normal(points[(index - 1 + n) % n], point);
    const after = normal(point, points[(index + 1) % n]);
    let mx = before[0] + after[0],
      my = before[1] + after[1];
    const length = Math.hypot(mx, my) || 1;
    mx /= length;
    my /= length;
    const scale = d / Math.max(0.35, mx * after[0] + my * after[1]);
    return [point[0] + mx * scale, point[1] + my * scale];
  });
}

/** Chaikin corner cutting: a rounder outline with flat facets. */
function round(points, passes = 1) {
  let out = points;
  for (let pass = 0; pass < passes; pass++)
    out = out.flatMap((point, index) => {
      const next = out[(index + 1) % out.length];
      return [
        [point[0] * 0.75 + next[0] * 0.25, point[1] * 0.75 + next[1] * 0.25],
        [point[0] * 0.25 + next[0] * 0.75, point[1] * 0.25 + next[1] * 0.75],
      ];
    });
  return out;
}

/** The part of a polygon with y ≤ c (`below` false) or y ≥ c (`below` true). */
function clip(points, c, below) {
  const inside = ([, y]) => (below ? y >= c : y <= c);
  const out = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (inside(point)) out.push(point);
    if (inside(point) !== inside(next)) {
      const t = (c - point[1]) / (next[1] - point[1]);
      out.push([point[0] + (next[0] - point[0]) * t, c]);
    }
  });
  return out;
}

/** The union of every ore silhouette, in socket units: the socket's floor. */
export function oreFootprint() {
  return hull(ORES.flatMap((ore) => ore.silhouette.map(toSocket)));
}

/**
 * Two seat shapes. "hug": the top follows O1 (the lowest ore, and the one
 * most deposits show), so the lip meets the pebbles; below SHOULDER it takes
 * every ore's footprint, so the recess and the contact shadow lie under any
 * ore. "pocket": every ore's footprint, cut flat at `top`, a pocket larger
 * than every silhouette but the tallest tips.
 */
const SEAT_ORE = 0;
const SHOULDER = 56;
export function seatOutline(variant, margin) {
  const v = SOCKET_VARIANTS[variant];
  if (v.seat === "pocket")
    return clip(grow(oreFootprint(), margin), v.top, true);
  const top = grow(hull(ORES[SEAT_ORE].silhouette.map(toSocket)), margin);
  const low = grow(oreFootprint(), margin).filter(([, y]) => y >= SHOULDER);
  return hull([...top, ...low]);
}

const DARK = OUTLINE;
/** Band A's lip on the swatch card (#f0e6d2), the board's rim light. */
const LIP = band("A").lip;

/**
 * The three socket variants, each a recess (translucent dark), a lit lip
 * along the seat's top and a contact shadow under the ore. Board targets
 * (docs/qa/a12-ore-sockets): the lip +2 to +4 L* over the block, the contact
 * shadow 0 to -10 L*; every variant stays translucent (stacked fill opacity at
 * most 160/255, socketStackedAlpha).
 * - shallow: the seat hugging O1 with the faintest recess: the board's
 *   treatment, a lit rim above the ore and a contact shadow below;
 * - deep: a pocket larger than every ore, cut flat at the top, with a darker
 *   core (the earlier frames' socket, darker);
 * - cracked: the hugging seat, jagged, with short cracks into the block.
 */
export const SOCKET_VARIANTS = {
  shallow: {
    seat: "hug",
    margin: 2.6,
    passes: 1,
    recess: 0.06,
    core: 0,
    lip: { width: 3.6, opacity: 0.06 },
    shadow: { from: 74, opacity: 0.21 },
    cracks: 0,
  },
  deep: {
    seat: "pocket",
    top: 21,
    margin: 5,
    passes: 2,
    recess: 0.12,
    core: 0,
    lip: { width: 3.6, opacity: 0.06 },
    shadow: { from: 62, opacity: 0.26 },
    cracks: 0,
  },
  cracked: {
    seat: "hug",
    margin: 2.6,
    passes: 0,
    jag: 2.2,
    recess: 0.06,
    core: 0,
    lip: { width: 3.6, opacity: 0.06 },
    shadow: { from: 74, opacity: 0.21 },
    cracks: 5,
    crack: { width: 2.4, opacity: 0.26, light: 0.06 },
  },
};
/** The variant that ships as deposit-socket (see docs/qa/a12-ore-sockets). */
export const SOCKET_VARIANT = "shallow";
/** The lip runs where the seat's edge faces up (outward normal y ≤ -this). */
const LIP_FACING = 0.6;

function jagged(points, amount, rng) {
  return points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length];
    const mid = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    if (length < 10) return [point];
    const nx = (next[1] - point[1]) / length,
      ny = -(next[0] - point[0]) / length;
    const push = rng.range(-amount, amount);
    return [point, [mid[0] + nx * push, mid[1] + ny * push]];
  });
}

const keepIn = (points, low = 4, high = 92) =>
  points.map(([x, y]) => [
    Math.max(low, Math.min(high, x)),
    Math.max(low, Math.min(high, y)),
  ]);

/** Outward normal of the edge a → b (clockwise on screen, y down). */
const outward = (a, b) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
};

/**
 * The lit lip: a band of `width` outside each run of upward-facing edges of
 * the seat, tapered to nothing at both ends, so it reads as a rim on the
 * seat's top and never as side arms.
 */
function lipBands(points, width) {
  const n = points.length;
  const up = (index) =>
    outward(points[index], points[(index + 1) % n])[1] <= -LIP_FACING;
  const runs = [];
  let first = 0;
  while (first < n && up(first)) first++;
  for (let step = 1, run = []; step <= n; step++) {
    const index = (first + step) % n;
    if (up(index)) run.push(index);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  return runs
    .filter((run) => run.length >= 2)
    .map((run) => {
      const vertices = [...run.map((i) => points[i]), points[(run.at(-1) + 1) % n]];
      const outer = vertices.map((point, index) => {
        if (index === 0 || index === vertices.length - 1) return point;
        const a = outward(vertices[index - 1], point),
          b = outward(point, vertices[index + 1]);
        let mx = a[0] + b[0],
          my = a[1] + b[1];
        const length = Math.hypot(mx, my) || 1;
        mx /= length;
        my /= length;
        const scale = width / Math.max(0.5, mx * b[0] + my * b[1]);
        return [point[0] + mx * scale, point[1] + my * scale];
      });
      return [...outer, ...vertices.slice(1, -1).reverse()];
    });
}

/** The socket drawing for a variant, in a 96-unit frame (1 tile). */
export function depositSocket(variant = SOCKET_VARIANT) {
  const v = SOCKET_VARIANTS[variant];
  if (!v) throw new Error(`No socket variant "${variant}"`);
  const rng = random(`a12-socket/${variant}`);
  let pocket = round(seatOutline(variant, v.margin), v.passes);
  if (v.jag) pocket = jagged(pocket, v.jag, rng.fork("seat"));
  pocket = keepIn(pocket);
  const fill = (points, colour, opacity) =>
    polygon(points, colour, { "fill-opacity": opacity });
  let body = fill(pocket, DARK, v.recess);
  if (v.core)
    body += fill(
      keepIn(
        round(
          clip(seatOutline(variant, v.margin - v.core.inset), v.core.top, true),
          v.passes,
        ),
      ),
      DARK,
      v.core.opacity,
    );
  body += fill(clip(pocket, v.shadow.from, true), DARK, v.shadow.opacity);
  const lip = lipBands(pocket, v.lip.width)
    .map((band) => fill(keepIn(band, 2.5, 93.5), LIP, v.lip.opacity))
    .join("");
  let cracks = "";
  if (v.cracks) {
    const crackRng = rng.fork("cracks");
    const anchors = [0.08, 0.3, 0.52, 0.7, 0.88];
    for (let index = 0; index < v.cracks; index++) {
      const start = pocket[Math.floor(anchors[index] * pocket.length)];
      const angle = Math.atan2(start[1] - 50, start[0] - 48);
      const points = [start];
      let [x, y] = start;
      for (let step = 0; step < 3; step++) {
        const turn = angle + crackRng.range(-0.55, 0.55);
        const length = crackRng.range(4.5, 7.5);
        x += Math.cos(turn) * length;
        y += Math.sin(turn) * length;
        points.push([x, y]);
      }
      const line = keepIn(points, 5, 91);
      cracks +=
        polyline(line, DARK, v.crack.width, {
          "stroke-opacity": v.crack.opacity,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }) +
        polyline(
          line.map(([px, py]) => [px - 0.6, py - 1.5]),
          LIP,
          1.1,
          {
            "stroke-opacity": v.crack.light,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
        );
    }
  }
  return layer("ore-socket", lip + body + cracks, {
    "data-variant": variant,
  });
}

/**
 * The most a variant's fills can stack to anywhere (recess, core and contact
 * shadow overlap; the lip lies outside the recess; crack strokes are lines and
 * reported apart), as alpha 0..1: the translucency rule the asset check
 * applies to the shipped frame, here for every variant so a swap stays safe.
 */
export function socketStackedAlpha(variant) {
  const v = SOCKET_VARIANTS[variant];
  const layers = [v.recess, v.core ? v.core.opacity : 0, v.shadow.opacity];
  return 1 - layers.reduce((clear, alpha) => clear * (1 - alpha), 1);
}
