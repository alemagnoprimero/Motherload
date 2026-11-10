/**
 * W01 rig drawings (art item A13; docs/ART_QUALITY_AUDIT.md §5.6 row 40,
 * §6.1 "Rig yellow; copper; silver top", style guide §2 and §4).
 *
 * Side-effect free, so tests can rebuild the committed sources byte for byte;
 * create-w01-sources.mjs saves what these functions return. Every rig-* and
 * thrust-* frame is a 128 × 128 canvas (1 unit = 1/96 tile), pivot (64, 64),
 * tread bottom on y = 100 (an integer row at @2, @3 and @4).
 *
 * Shading: every part is a set of flat, top-lit tier facets per material
 * zone (lit on the faces that look up, shadow under them), at least three
 * tiers per zone and frame, clipped to the part's silhouette and closed by
 * one #14232b outline at outlineWidth(96) = 4.22 units with round joins;
 * parts that lie on another part (armour, glass, bay, crates) take a thinner
 * seam, as on the board. Each zone sits in a group with data-zone, so
 * scripts/art_tiers.py counts it from the fills. Every tier band is at
 * least about 1.6 units clear of contours, seams and the parts drawn over it
 * in game, so each fill a zone is credited with reaches the screen (at @4 in
 * its own frame; art_tiers.visible_svg_tiers checks it). Gradients never
 * stand in for a tier: the tiers are flat fills, and a gradient (variant
 * "bevel") only softens the seam between two of them (art_tiers.py reads
 * fill="#..." only, so gradients add no tier).
 *
 * Zones and anchors (docs/art-audit/data/palette.json):
 * - hull (yellow): a bright arch round the large window, in the board's
 *   proportions (at board scale two yellow rows over a dark edge, then a
 *   nine-row window). Lit is rig_yellow #f6e791 (sampled bright on the
 *   board's arch top) and holds the arch's outer and top faces; body is a
 *   Lab move toward the board's gold #c79135 (L* 68) on the inner edge band
 *   next to the glass and the lower side faces; shadow (L* 49) is the thin
 *   inner lip under the arch's top (it faces down); deep (L* 25, low chroma)
 *   is the band's bottom line (the board's dark line above the tread). Under
 *   the window: the cream identity stripe between the arch's sides (two
 *   board rows), a dark line, then a slim band (lit over body) and its dark
 *   line; the rank-0 armour is that band's plate, so the band runs unbroken;
 * - paint (the energy canister): the board's orange paint, body #e56d24,
 *   lit #f39a52, shadow #84421f (sampled on the board's canister; the
 *   user's ore_copper is too pale for the rig's strongest warm accent);
 * - copper (the metal fittings: drill-mount ring, collar band): body is
 *   ore_copper #d69d6e, with a lit and a deeper, warmer shadow tier;
 * - silver (drill bit, mount, collar, canister band and cap, lamp bezel,
 *   roof hatch, rank-1 plates and crates): lit is ore_silver_top #e4e7e3
 *   (the bit's upper half); the bit's flute grooves are one tier darker
 *   than the face they cut (body on the lit half, shadow on the body, deep on
 *   the shadow), so the bit stays light, with a white glint near the tip
 *   (the board's white tip); the lamp's bezel; the small roof hatch is its
 *   deep tier over a dark front (dark, as on the board);
 * - steel (rear modules, rack, feet), tracks (a dark belt with light cleats,
 *   smaller grey wheels), glass (teal with a reflection); "light" holds the
 *   lamp lens and the cabin indicator, drawn unlit (emitters, not a shaded
 *   material).
 *
 * The headlamp sits on the cabin's front shoulder, where no drill, collar,
 * armour or tool frame covers it (rank 1 and 2 collars start at y 50,
 * rig-hull-2 at y 58, tool-thermal at y 60, tool-condenser ends at x 55);
 * the lens and its chrome bezel ring are drawn over the arch's outline, so
 * the arch's front face stays whole and lit round them and the lamp reads as
 * a lamp with the power off.
 * rig-cabin draws the lens (dark glass) and the indicator unlit;
 * rig-cabin-emissive (kit emissivePair) holds them lit on transparent, for
 * the game to draw ADD above the darkness. Its lens ring is authored as the
 * lit colour minus the unlit lens, so after ADD only the bulb core reaches
 * white inside a warm ring and halo. No glow is baked into the base.
 *
 * Down poses are not the right-facing drawing's tiers turned on their side:
 * the down drill and collar take their tiers along the drawing's x (which
 * becomes the screen's y after the turn), so they stay top-lit, and the
 * down bit is shaded symmetrically about its axis.
 *
 * Three treatments share one silhouette and every anchor; RIG_VARIANT picks
 * the one that ships:
 * - "facets": flat tiers with hard edges (the board's cel look);
 * - "bevel": the same tiers, the edges softened by short linear gradients
 *   (kit linearGradient), and kit bevelEdges strips;
 * - "rim": the facets plus a thin rim light on top edges.
 */
import { OUTLINE, board, fromLch, lch, mixLab } from "../kit/palette.mjs";
import { emissivePair } from "../kit/emissive.mjs";
import {
  bevelEdges,
  layer,
  linearGradient,
  num,
  outlineWidth,
  pathData,
  radialGradient,
} from "../kit/svg.mjs";

export const RIG_VARIANTS = {
  facets: { seams: 1.8, soft: false, rim: 0, bevel: 0 },
  bevel: { seams: 0, soft: true, rim: 0, bevel: 1.4 },
  rim: { seams: 1.4, soft: false, rim: 1.5, bevel: 0 },
};
/** The treatment that ships (the others are kept for review). */
export const RIG_VARIANT = "facets";

/** §6.1 outline, 4.224 units in a 96-unit cell (the rig frame is 128 units, the cell still 96). */
const OUTLINE_W = outlineWidth(96);
/** Internal edges (a part lying on another part): thinner, as on the board. */
const SEAM_W = 2.4;
/** Material joins inside a part (a band on a canister, flange lines). */
const LINE_W = 1.8;
/** The tread's lowest pixel row (frames.json rigTreadBaseline). */
export const TREAD_BOTTOM = 100;
/** The headlamp lens centre and the cabin indicator, in frame units. */
export const HEADLAMP_LENS = { x: 100.2, y: 44.5 };
export const CABIN_INDICATOR = { x: 87.4, y: 34.2 };
/** Drill flutes: pitch in units; the 8 drill frames move them DRILL_FLUTE_TURNS pitches. */
export const DRILL_FLUTE_PITCH = 6.4;
/**
 * Flute pitches the 8 drill frames move (3: 3/8 pitch, 2.4 units, a frame,
 * under half a pitch, so the spin reads forward; the lighter grooves need
 * the longer step to keep the motion at @2).
 */
export const DRILL_FLUTE_TURNS = 3;

// ---------------------------------------------------------------- palette
const at = (L, C, h) => fromLch([L, C, h]);
const YELLOW = board("rig_yellow"); // #f6e791, L* 91.1
const COPPER = board("ore_copper"); // #d69d6e, L* 69.1
const SILVER = board("ore_silver_top"); // #e4e7e3, L* 91.3
const [, copperC, copperH] = lch(COPPER);

/** Tiers per zone, lit to deep. */
export const RIG_TONES = {
  hull: {
    lit: YELLOW,
    body: mixLab(YELLOW, "#c79135", 0.85), // L* 68
    shadow: at(49, 40, 73),
    deep: at(25, 7, 70),
    cream: "#f1ead0",
  },
  copper: {
    lit: at(80, copperC + 4, copperH + 2),
    body: COPPER,
    shadow: at(56, copperC + 12, copperH - 6),
  },
  // The canister's orange paint (the board's canister).
  paint: {
    lit: "#f39a52",
    body: "#e56d24",
    shadow: "#84421f",
  },
  silver: {
    lit: SILVER,
    body: at(78, 4, 120),
    shadow: at(62, 5, 150),
    deep: at(46, 6, 190),
    // The roof hatch's dark front (the board's #232c2f, as the steel deep).
    dark: "#2f3d3f",
    // The drill bit's tip glint (the board's white tip).
    glint: "#ffffff",
  },
  steel: {
    lit: "#c2ccc2",
    body: at(66, 6, 195),
    shadow: "#667678",
    deep: "#2f3d3f",
  },
  tracks: {
    lit: "#c0c8c2",
    body: "#8e9996",
    shadow: "#5f6c70",
    belt: "#25333a",
    deep: "#121b21",
  },
  glass: {
    lit: at(76, 14, 196),
    body: "#3e737c",
    shadow: "#1d4a55",
    spec: at(92, 8, 180),
  },
  // The lamp lens and the cabin indicator, unlit: dark glass and a dark LED.
  light: {
    lens: at(32, 6, 80),
    glint: at(72, 6, 90),
    led: at(27, 14, 160),
  },
  rank1: {
    lit: at(90, 40, 88),
    body: "#e8b660",
    shadow: at(63, 52, 72),
  },
  pads: {
    lit: at(84, 50, 78),
    body: "#f0a43c",
    shadow: at(58, 58, 62),
  },
  flame: { outer: "#ce7b33", mid: "#f0a43c", core: "#f6e1af" },
};
/** The emissive colours: the board's lamp halo and bulb (palette.json). */
export const RIG_LIGHTS = {
  halo: board("lamp_halo"), // #fcb032
  bulb: board("lamp_bulb"), // #f9fdff
  /** The lens ring's colour after ADD over the unlit lens. */
  ring: mixLab(board("lamp_halo"), board("lamp_bulb"), 0.42),
  indicator: "#3fe08f",
  indicatorCore: "#c8ffe2",
};

// ---------------------------------------------------------------- drawing
const attrs = (extra) =>
  Object.entries(extra)
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? num(v) : v}"`)
    .join("");
const P = (d, fill, extra = {}) =>
  `<path d="${d}" fill="${fill}"${attrs(extra)}/>`;
const line = (d, colour, width, extra = {}) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${num(width)}" stroke-linecap="round"${attrs(extra)}/>`;
/** A horizontal line from x0 to x1 at y, as path data. */
const hline = (x0, x1, y) => `M${num(x0)} ${num(y)} H${num(x1)}`;
/** A vertical line from y0 to y1 at x, as path data. */
const vline = (x, y0, y1) => `M${num(x)} ${num(y0)} V${num(y1)}`;

/** A rounded rectangle as path data (r clipped to half the short side). */
export function rrect(x, y, w, h, r = 0) {
  const q = Math.min(r, w / 2, h / 2);
  if (!q) return box(x, y, x + w, y + h);
  const a = (dx, dy) => `A${num(q)} ${num(q)} 0 0 1 ${num(dx)} ${num(dy)}`;
  return (
    `M${num(x + q)} ${num(y)} H${num(x + w - q)} ${a(x + w, y + q)} V${num(y + h - q)} ` +
    `${a(x + w - q, y + h)} H${num(x + q)} ${a(x, y + h - q)} V${num(y + q)} ${a(x + q, y)} Z`
  );
}
/** A rectangle as path data. */
function box(x0, y0, x1, y1) {
  return pathData([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
}
/** A circle as path data. */
const disc = (cx, cy, r) =>
  `M${num(cx - r)} ${num(cy)} A${num(r)} ${num(r)} 0 1 0 ${num(cx + r)} ${num(cy)} ` +
  `A${num(r)} ${num(r)} 0 1 0 ${num(cx - r)} ${num(cy)} Z`;

/**
 * One part in one material zone: the `base` tier over the silhouette `d`,
 * then `facets` [tier, path], all clipped to the silhouette, then `extra`;
 * then, by variant: tier seams (`seams`, path data; "facets" and "rim"),
 * soft gradient strips over the tier boundaries (`softs`, "bevel") and the
 * kit's top-lit bevel strips inside the convex outline `bevel` (clockwise
 * points; "bevel", the strip showing `bevel` units past the contour), the
 * rim light on top edges (`rims`, "rim"); material `lines` (every variant); and
 * the contour, `edge` units wide (the §6.1 outline unless the part lies on
 * another part; 0 for none). `bands` (from tierBands) adds the usual lit
 * and shadow facets with their soft strips.
 */
function part(ctx, name, spec) {
  const { zone, d, base, bands, seams = [], lines = [] } = spec;
  const facets = [...(bands?.facets ?? []), ...(spec.facets ?? [])];
  const softs = [...(bands?.softs ?? []), ...(spec.softs ?? [])];
  const { rims = [], extra = "", edge = OUTLINE_W, bevel } = spec;
  const tones = ctx.tones[zone];
  const v = RIG_VARIANTS[ctx.variant];
  const id = `${ctx.id}-${name}`;
  let defs = `<clipPath id="${id}-clip"><path d="${d}"/></clipPath>`;
  let inside = P(d, tones[base]);
  for (const [tier, shape] of facets) inside += P(shape, tones[tier]);
  if (v.soft)
    softs.forEach((s, i) => {
      const gid = `${id}-soft-${i}`;
      defs += linearGradient(
        gid,
        [
          [0, tones[s.from]],
          [1, tones[s.to]],
        ],
        { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, units: "userSpaceOnUse" },
      );
      inside += P(s.d, `url(#${gid})`);
    });
  if (v.bevel && bevel)
    inside += bevelEdges(bevel, tones[base], edge / 2 + v.bevel);
  inside += extra;
  if (v.seams) for (const s of seams) inside += line(s, OUTLINE, v.seams);
  for (const l of lines) inside += line(l, OUTLINE, LINE_W);
  if (v.rim)
    for (const r of rims)
      inside += line(r, ctx.rim(zone), v.rim, { "stroke-linejoin": "round" });
  const contour = edge
    ? `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="${num(edge)}" stroke-linejoin="round"/>`
    : "";
  return `<g data-zone="${zone}"><defs>${defs}</defs><g clip-path="url(#${id}-clip)">${inside}</g>${contour}</g>`;
}

/**
 * The drawing context of one frame. Ids carry the frame name, and the
 * variant when it is not the one that ships, so frames and variants nested
 * in one review document never share a clip or gradient id.
 */
function context(id, variant = RIG_VARIANT) {
  if (!RIG_VARIANTS[variant]) throw new Error(`unknown rig variant ${variant}`);
  return {
    id: variant === RIG_VARIANT ? id : `${id}-${variant}`,
    variant,
    tones: RIG_TONES,
    rim: (zone) => mixLab(RIG_TONES[zone].lit, "#ffffff", 0.6),
  };
}

/** A soft tier boundary at t across axis `axis` (variant "bevel"), `from` above or left. */
function soft(axis, t, from, to, lo = 0, hi = 128, w = 1.6) {
  return axis === "y"
    ? {
        from,
        to,
        x1: 0,
        y1: t - w / 2,
        x2: 0,
        y2: t + w / 2,
        d: box(lo, t - w / 2, hi, t + w / 2),
      }
    : {
        from,
        to,
        x1: t - w / 2,
        y1: 0,
        x2: t + w / 2,
        y2: 0,
        d: box(t - w / 2, lo, t + w / 2, hi),
      };
}
/**
 * The usual top-lit tiers of a part: `lit` before t1 along `axis` (above it
 * for "y"; left of it for "x", which a down pose's turn makes the top), the
 * part's base between, `shadow` after t2; with the soft strips of "bevel".
 */
function tierBands(axis, t1, t2, lo = 0, hi = 128) {
  const band = (a, b) => (axis === "y" ? box(lo, a, hi, b) : box(a, lo, b, hi));
  return {
    facets: [
      ["lit", band(-8, t1)],
      ["shadow", band(t2, 136)],
    ],
    softs: [
      soft(axis, t1, "lit", "body", lo, hi),
      soft(axis, t2, "body", "shadow", lo, hi),
    ],
  };
}

// ---------------------------------------------------------------- body (tracks)
const TRACK = { x0: 19, x1: 108, y0: 72, y1: TREAD_BOTTOM, r: 13 };
/** Wheel centres and radii: smaller grey wheels in a dark belt, as on the board. */
const WHEELS = [
  [33, 6.8],
  [48.4, 5.9],
  [63.8, 5.9],
  [79.2, 5.9],
  [94.4, 6.8],
];
const WHEEL_Y = 85.2;
/** Teeth spacing: the 8 body frames move the teeth one spacing (a seamless loop). */
const TOOTH = 8;

/** rig-body-<frame>: chassis deck, track belt, wheels and teeth (frame 0..7). */
export function rigBody(frame, variant = RIG_VARIANT) {
  const ctx = context(`rig-body-${frame}`, variant);
  const T = ctx.tones.tracks;
  const v = RIG_VARIANTS[ctx.variant];
  // The chassis deck under the cabin and modules (covered in the game; it
  // closes the frame when a module is missing): lit top, body, shadow just
  // above the track. Its front ends under the cabin's front outline, so no
  // sliver of it shows past the cabin in the down poses.
  let s = layer(
    "chassis",
    part(ctx, "deck", {
      zone: "hull",
      d: rrect(26, 62, 74, 13, 4),
      base: "body",
      bands: tierBands("y", 67.2, 69.8, 20, 110),
      rims: ["M30 64.4 H96"],
    }),
  );
  // Track: the outline is the outer ring, a fill, so its bottom edge is
  // exactly y = 100 at every scale; the belt is inset by the outline width.
  const { x0, x1, y0, y1, r } = TRACK;
  const w = OUTLINE_W;
  const ring = rrect(x0, y0, x1 - x0, y1 - y0, r);
  const belt = rrect(x0 + w, y0 + w, x1 - x0 - 2 * w, y1 - y0 - 2 * w, r - w);
  const p = frame % 8;
  // The belt is dark; its top run is a little lighter and carries small
  // grey cleats moving forward, the bottom run the board's light cleats
  // (below the wheels), moving back; one spacing over the 8 frames.
  let inner = P(belt, T.deep) + P(box(0, y0, 128, y0 + w + 3.4), T.belt);
  if (v.soft) {
    inner += linearGradient(
      `${ctx.id}-belt-soft`,
      [
        [0, T.belt],
        [1, T.deep],
      ],
      { x1: 0, y1: y0 + w + 2, x2: 0, y2: y0 + w + 5, units: "userSpaceOnUse" },
    );
    inner += P(
      box(0, y0 + w + 2, 128, y0 + w + 5),
      `url(#${ctx.id}-belt-soft)`,
    );
  }
  for (let j = -1; j < 12; j++) {
    const bx = 24 + j * TOOTH - p;
    if (bx > 20 && bx < 102)
      inner += P(
        pathData([
          [bx, 92.6],
          [bx + 3.6, 92.6],
          [bx + 4.4, 96.4],
          [bx - 0.8, 96.4],
        ]),
        T.lit,
      );
    const tx = 20 + j * TOOTH + p;
    if (tx > 22 && tx < 104)
      inner += P(box(tx, y0 + w + 0.4, tx + 3, y0 + w + 2.4), T.body);
  }
  // Wheels, top-lit and grey: the lower half in shadow, the upper half
  // body, a small lit cap on the crown, a dark hub.
  let wheels = "";
  for (const [cx, rad] of WHEELS) {
    const k = rad - 1.1;
    const chord = (yy) => {
      const half = Math.sqrt(Math.max(0, k * k - (yy - WHEEL_Y) ** 2));
      return [cx - half, cx + half];
    };
    const [a0, a1] = chord(WHEEL_Y + 0.4);
    const [c0, c1] = chord(WHEEL_Y - k * 0.62);
    wheels +=
      P(disc(cx, WHEEL_Y, rad), T.shadow, {
        stroke: OUTLINE,
        "stroke-width": 2.2,
      }) +
      P(
        `M${num(a0)} ${num(WHEEL_Y + 0.4)} A${num(k)} ${num(k)} 0 0 1 ${num(a1)} ${num(WHEEL_Y + 0.4)} Z`,
        T.body,
      ) +
      P(
        `M${num(c0)} ${num(WHEEL_Y - k * 0.62)} A${num(k)} ${num(k)} 0 0 1 ${num(c1)} ${num(WHEEL_Y - k * 0.62)} Z`,
        T.lit,
      ) +
      P(disc(cx, WHEEL_Y, rad * 0.3), T.lit, {
        stroke: T.deep,
        "stroke-width": 1.4,
      });
  }
  s += layer(
    "track",
    `<g data-zone="tracks"><defs><clipPath id="${ctx.id}-belt-clip"><path d="${belt}"/></clipPath></defs>` +
      P(ring, OUTLINE) +
      `<g clip-path="url(#${ctx.id}-belt-clip)">${inner}</g>${wheels}</g>`,
  );
  return s;
}

// ---------------------------------------------------------------- cabin
/** The cabin: a thick arch round a large window, the band below it. */
const CAB = { x0: 46, x1: 98, top: 27.6, bottom: 72.4, r: 14.4 };
const SHELL =
  `M${num(CAB.x0)} ${num(CAB.bottom)} V${num(CAB.top + CAB.r)} ` +
  `Q${num(CAB.x0)} ${num(CAB.top)} ${num(CAB.x0 + CAB.r)} ${num(CAB.top)} ` +
  `H${num(CAB.x1 - CAB.r)} Q${num(CAB.x1)} ${num(CAB.top)} ${num(CAB.x1)} ${num(CAB.top + CAB.r)} ` +
  `V${num(CAB.bottom)} Z`;
const WIN = { x0: 55, x1: 89, top: 36.6, bottom: 57.4, r: 8 };
/**
 * The window grown by `side` units at its sides and `top` at its top (its
 * bottom edge stays): the window itself (0, 0) and the arch's inner bands.
 * With `open`, the shape ends at the corners' foot (the top lip only).
 */
function windowPath(side = 0, top = 0, open = false) {
  const x0 = WIN.x0 - side,
    x1 = WIN.x1 + side,
    y0 = WIN.top - top,
    foot = WIN.top + WIN.r;
  const arch =
    `V${num(foot)} Q${num(x0)} ${num(y0)} ${num(WIN.x0 + WIN.r)} ${num(y0)} ` +
    `H${num(WIN.x1 - WIN.r)} Q${num(x1)} ${num(y0)} ${num(x1)} ${num(foot)}`;
  return open
    ? `M${num(x0)} ${num(foot + 1)} ${arch} V${num(foot + 1)} Z`
    : `M${num(x0)} ${num(WIN.bottom)} ${arch} V${num(WIN.bottom)} Z`;
}
const WINDOW = windowPath();
/**
 * The cream identity stripe under the window, between the arch's sides (the
 * glass seam is its top line), and the band under it: two board rows of
 * cream, a dark line, the band (lit over body) and its dark bottom line.
 */
const STRIPE = { y0: WIN.bottom, y1: 63.9 };
/**
 * The band (lit over body: 2 and 2.6 units past the seams) and its dark bottom
 * line above the tread: at board scale a bright gold row over a deeper one,
 * then a dark row, as on the board.
 */
const BAND = { y0: STRIPE.y1, lit: 67.1, deep: 69.7, y1: CAB.bottom };
/**
 * The lamp's chrome bezel: a ring round the lens on the arch's front
 * shoulder, its centre BEZEL_RISE above the lens, so the chrome is a lit
 * hood 3 units deep over the lens (r 3) and 1.8 under it.
 */
const BEZEL_R = 6,
  BEZEL_RISE = 0.7;
/**
 * The lamp's dark mount behind the arch: a disc round the lens, past the
 * bezel, in the outline colour, so the halo of rig-cabin-emissive (HALO_R)
 * stays on the rig's silhouette (no lift on the rock or sky beside it).
 */
export const MOUNT_R = 7.8;
/**
 * The halo's radius in units (it ends at alpha 0): half a unit inside the
 * mount, so even its faint outer ring, filtered on screen, lies on the
 * silhouette (§9.2).
 */
export const HALO_R = MOUNT_R - 0.5;

/** The cabin's lit parts, unlit for the base and lit for the -emissive sibling. */
function cabinLights(ctx) {
  const L = ctx.tones.light;
  const { x, y } = HEADLAMP_LENS;
  const lens = P(disc(x, y, 3), L.lens) + P(disc(x - 1.1, y - 1.1, 1), L.glint);
  const ind = CABIN_INDICATOR;
  const led = P(disc(ind.x, ind.y, 2), L.led, {
    stroke: OUTLINE,
    "stroke-width": 1.2,
  });
  const halo = `${ctx.id}-emissive-halo`,
    glow = `${ctx.id}-emissive-indicator`;
  // ADD adds the emissive to what is under it, so the ring is the lit colour
  // minus the unlit lens: lens + ring = RIG_LIGHTS.ring, and only the bulb
  // core reaches white.
  const ring = subtract(RIG_LIGHTS.ring, L.lens);
  const lampLit =
    `<defs>${radialGradient(
      halo,
      [
        [0, RIG_LIGHTS.halo, 0.9],
        [0.35, RIG_LIGHTS.halo, 0.55],
        [0.68, RIG_LIGHTS.halo, 0.14],
        [1, RIG_LIGHTS.halo, 0],
      ],
      { cx: x, cy: y, r: HALO_R, units: "userSpaceOnUse" },
    )}</defs>` +
    P(disc(x, y, HALO_R), `url(#${halo})`) +
    P(disc(x, y, 3), ring) +
    P(disc(x, y, 1.7), RIG_LIGHTS.bulb);
  const ledLit =
    `<defs>${radialGradient(
      glow,
      [
        [0, RIG_LIGHTS.indicator, 0.9],
        [0.45, RIG_LIGHTS.indicator, 0.42],
        [1, RIG_LIGHTS.indicator, 0],
      ],
      { cx: ind.x, cy: ind.y, r: 3.6, units: "userSpaceOnUse" },
    )}</defs>` +
    P(disc(ind.x, ind.y, 3.6), `url(#${glow})`) +
    P(disc(ind.x, ind.y, 1.1), RIG_LIGHTS.indicatorCore);
  return {
    // Emitters, not a shaded material: zone "light", lit and unlit.
    lamp: {
      unlit: `<g data-zone="light">${lens}</g>`,
      lit: `<g data-zone="light">${lampLit}</g>`,
    },
    indicator: {
      unlit: `<g data-zone="light">${led}</g>`,
      lit: `<g data-zone="light">${ledLit}</g>`,
    },
  };
}
/** a − b per sRGB channel, clamped at 0, as #rrggbb. */
function subtract(a, b) {
  const ch = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.max(0, ch(a, i) - ch(b, i))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function cabinLayers(variant) {
  const ctx = context("rig-cabin", variant);
  // The hatch: small and dark, as on the board (#757971 over #232c2f): a
  // shadow lid over a deep front, metal like the lamp housing (silver); the
  // shell covers it from y 25.5.
  const roof = part(ctx, "roof", {
    zone: "silver",
    d: rrect(62.4, 19.6, 15.2, 9.6, 2),
    bevel: [
      [62.4, 19.6],
      [77.6, 19.6],
      [77.6, 29.2],
      [62.4, 29.2],
    ],
    base: "dark",
    facets: [["deep", box(55, 15, 85, 23.6)]],
    softs: [soft("y", 23.6, "deep", "dark", 55, 85, 1.2)],
  });
  // The arch's bands, from the outline in: lit (outer and top faces), body
  // (the inner edge band beside the glass; the whole face below y 48.6),
  // shadow (the inner lip under the top, which faces down), the glass seam.
  const lower = 48.6;
  const shell = part(ctx, "shell", {
    zone: "hull",
    d: SHELL,
    bevel: [
      [CAB.x0, CAB.bottom],
      [CAB.x0, CAB.top + CAB.r],
      [CAB.x0 + 4.2, CAB.top + 4.2],
      [CAB.x0 + CAB.r, CAB.top],
      [CAB.x1 - CAB.r, CAB.top],
      [CAB.x1 - 4.2, CAB.top + 4.2],
      [CAB.x1, CAB.top + CAB.r],
      [CAB.x1, CAB.bottom],
    ],
    base: "body",
    facets: [
      ["lit", box(38, 18, 106, lower)],
      ["body", windowPath(3.8, 4.6)],
      ["shadow", windowPath(1.2, 3.4, true)],
      // The cream stripe between the arch's sides, then the band, lit over
      // body (the armour over it adds the dark line above the tread).
      ["cream", box(WIN.x0, STRIPE.y0, WIN.x1, STRIPE.y1)],
      ["lit", box(38, BAND.y0, 106, BAND.lit)],
    ],
    lines: [hline(CAB.x0, CAB.x1, STRIPE.y1)],
    softs: [
      soft("y", lower, "lit", "body", 38, WIN.x0 - 3.8),
      soft("y", lower, "lit", "body", WIN.x1 + 3.8, 106),
      soft("y", BAND.lit, "lit", "body", 38, 106),
    ],
    rims: [
      `M${num(CAB.x0 + 2.6)} ${lower - 4} V${num(CAB.top + CAB.r)} ` +
        `Q${num(CAB.x0 + 2.6)} ${num(CAB.top + 2.6)} ${num(CAB.x0 + CAB.r)} ${num(CAB.top + 2.6)} ` +
        `H${num(CAB.x1 - CAB.r)} Q${num(CAB.x1 - 2.6)} ${num(CAB.top + 2.6)} ${num(CAB.x1 - 2.6)} ${num(CAB.top + CAB.r)}`,
    ],
  });
  const glass = part(ctx, "glass", {
    zone: "glass",
    d: WINDOW,
    base: "body",
    facets: [
      ["shadow", box(50, 30, 94, 42.4)],
      [
        "lit",
        pathData([
          [76.6, 35],
          [83.6, 35],
          [65, 59],
          [58, 59],
        ]),
      ],
      [
        "lit",
        pathData([
          [86.3, 35],
          [89.3, 35],
          [72.5, 59],
          [69.5, 59],
        ]),
      ],
      [
        "spec",
        pathData([
          [77.4, 39],
          [81.4, 39],
          [78.2, 42.6],
          [74.2, 42.6],
        ]),
      ],
    ],
    softs: [soft("y", 42.4, "shadow", "body", 50, 94, 2.6)],
    rims: ["M57.4 44 Q57.4 39 62.5 39 H70"],
    edge: SEAM_W,
  });
  // The lamp's chrome bezel round the lens, over the arch's outline on its
  // front shoulder (silver): its hood lit, body round the sides and under.
  const { x: lx, y: ly } = HEADLAMP_LENS;
  const bezel = part(ctx, "bezel", {
    zone: "silver",
    d: disc(lx, ly - BEZEL_RISE, BEZEL_R),
    base: "body",
    facets: [["lit", box(lx - 8, ly - 9, lx + 8, ly - 2.2)]],
    softs: [soft("y", ly - 2.2, "lit", "body", lx - 8, lx + 8, 1.2)],
    edge: 1.2,
  });
  const lights = cabinLights(ctx);
  // The mount sits behind the arch (it shows only past the arch's outline);
  // the bezel and the lens sit over the arch's outline, so the arch's front
  // face stays whole and lit round them.
  return [
    { name: "roof-hatch", body: roof },
    { name: "lamp-mount", body: P(disc(lx, ly, MOUNT_R), OUTLINE) },
    { name: "cabin-shell", body: shell },
    { name: "dark-teal-glass", body: glass },
    { name: "lamp-bezel", body: bezel },
    { name: "headlamp", ...lights.lamp },
    { name: "cabin-indicator", ...lights.indicator },
  ];
}

/** rig-cabin and rig-cabin-emissive, as kit emissivePair frame records. */
export function rigCabinFrames(variant = RIG_VARIANT) {
  return emissivePair({
    name: "rig-cabin",
    width: 128,
    height: 128,
    layers: cabinLayers(variant),
  });
}
/** The rig-cabin body (lens and indicator unlit). */
export function rigCabin(variant = RIG_VARIANT) {
  return rigCabinFrames(variant)[0].body;
}
/** The rig-cabin-emissive body (lens and indicator lit, on transparent). */
export function rigCabinEmissive(variant = RIG_VARIANT) {
  return rigCabinFrames(variant)[1].body;
}

// ---------------------------------------------------------------- rear modules
/** rig-engine-<rank>: the upper rear module (rank 0 or 1). */
export function rigEngine(rank, variant = RIG_VARIANT) {
  const ctx = context(`rig-engine-${rank}`, variant);
  const S = ctx.tones.steel;
  if (!rank)
    return layer(
      "rear-engine",
      part(ctx, "box", {
        zone: "steel",
        d: rrect(29, 38.6, 18.5, 21.4, 3),
        bevel: [
          [29, 38.6],
          [47.5, 38.6],
          [47.5, 60],
          [29, 60],
        ],
        base: "body",
        bands: tierBands("y", 45, 53.4, 24, 52),
        rims: ["M31.6 40.8 H45"],
        // Two small panels, light and dark (the board's module top), on the
        // left so the body shows beside them.
        extra:
          P(rrect(32.4, 47, 3.8, 4.6, 1), S.lit) +
          P(rrect(37, 47, 3.8, 4.6, 1), S.deep),
      }),
    );
  return layer(
    "rear-engine",
    // Rank 1: an upright exhaust on top and a side intake (silver).
    part(ctx, "stack", {
      zone: "silver",
      d: rrect(34.6, 35.4, 9.4, 13.6, 2.4),
      base: "body",
      bands: tierBands("y", 40.4, 43.6, 30, 48),
      rims: ["M37.4 37.8 H41.2"],
    }) +
      part(ctx, "intake", {
        zone: "silver",
        d: rrect(14.8, 50, 8.6, 21, 2.6),
        base: "body",
        bands: tierBands("y", 56, 63.4, 10, 26),
        rims: ["M17.4 52.4 H20.8"],
      }) +
      part(ctx, "box", {
        zone: "steel",
        d: rrect(22, 47, 25, 26, 4),
        bevel: [
          [22, 47],
          [47, 47],
          [47, 73],
          [22, 73],
        ],
        base: "body",
        bands: tierBands("y", 53, 65.8, 18, 52),
        seams: [hline(22, 47, 53)],
        rims: ["M25 49.4 H44"],
        extra:
          P(rrect(25.5, 55.6, 18, 3.4, 1), S.deep) +
          P(rrect(25.5, 60.6, 18, 3.4, 1), S.deep),
      }),
  );
}

/** rig-energy-<rank>: the canister at the rear (rank 0 orange paint, rank 1 gold). */
export function rigEnergy(rank, variant = RIG_VARIANT) {
  const ctx = context(`rig-energy-${rank}`, variant);
  const x = rank ? 13 : 16.5,
    w = 14,
    bottom = rank ? 71 : 73;
  const zone = rank ? "rank1" : "paint";
  // The lit dome's foot and the shadow foot: the paint keeps more of its
  // orange body (the board's canister is mostly body).
  const dome = rank ? 47 : 45.2,
    foot = rank ? 8 : 5.6;
  const cx = x + w / 2;
  const inner = OUTLINE_W / 2;
  return layer(
    "energy-canister",
    part(ctx, "cap", {
      zone: "silver",
      d: rrect(cx - 4, 31.6, 8, 9.4, 2.2),
      base: "body",
      facets: [["lit", box(x - 2, 28, x + w + 2, 35.6)]],
      rims: [hline(cx - 1.6, cx + 1.6, 33.8)],
    }) +
      part(ctx, "body", {
        zone,
        d: rrect(x, 40, w, bottom - 40, 4.5),
        bevel: [
          [x, 40],
          [x + w, 40],
          [x + w, bottom],
          [x, bottom],
        ],
        base: "body",
        facets: [
          // A lit dome and a lit streak down the round side that faces the
          // light, the body, a shadow foot.
          ["lit", box(x - 2, 36, x + w + 2, dome)],
          ["lit", box(x + 3, 36, x + (rank ? 5.8 : 4.8), bottom - foot)],
          // Rank 0: the lower section's lit top under the band (the board's
          // canister is two painted sections).
          ...(rank ? [] : [["lit", box(x - 2, 57.6, x + w + 2, 60)]]),
          ["shadow", box(x - 2, bottom - foot, x + w + 2, bottom + 2)],
        ],
        softs: [
          soft("y", dome, "lit", "body", x + 5.8, x + w + 2),
          soft("y", bottom - foot, "body", "shadow", x - 2, x + w + 2),
        ],
        rims: [`M${num(x + 3)} 42.4 Q${num(cx)} 41.2 ${num(x + w - 3)} 42.4`],
        extra: rank
          ? P(box(x, 61.4, x + w, 63.4), ctx.tones.rank1.lit) +
            P(box(x, 65.4, x + w, 67.4), ctx.tones.rank1.lit)
          : "",
      }) +
      // The band: silver, flush inside the canister's outline.
      part(ctx, "band", {
        zone: "silver",
        d: box(x + inner, 50, x + w - inner, 57.6),
        base: "body",
        bands: tierBands("y", 52.8, 54.8, x - 3, x + w + 3),
        edge: LINE_W,
      }),
  );
}

/** rig-bay-<rank>: the lower rear block (rank 0 or 1), lying on the engine. */
export function rigBay(rank, variant = RIG_VARIANT) {
  const ctx = context(`rig-bay-${rank}`, variant);
  const S = ctx.tones.steel;
  const d = rank
    ? pathData([
        [22, 52],
        [46, 52],
        [46, 75],
        [20, 75],
        [20, 55],
      ])
    : rrect(31, 56, 17, 19, 2.5);
  const x0 = rank ? 20 : 31,
    x1 = rank ? 46 : 48,
    y0 = rank ? 52 : 56;
  return layer(
    "rear-bay",
    part(ctx, "block", {
      zone: "steel",
      d,
      bevel: [
        [x0, y0],
        [x1, y0],
        [x1, 75],
        [x0, 75],
      ],
      base: "body",
      bands: tierBands("y", y0 + (rank ? 5.6 : 5.8), 68.4, x0 - 4, x1 + 4),
      rims: [hline(x0 + 2.5, x1 - 2.5, y0 + 1.8)],
      extra: rank
        ? P(box(24, 61.2, 43, 63.4), S.lit) +
          P(box(24, 65.4, 43, 67.6), S.lit) +
          P(box(31, 52, 33, 75), S.shadow)
        : P(box(33.4, 64, 39.4, 66.2), S.deep),
      edge: rank ? OUTLINE_W : SEAM_W,
    }),
  );
}

/**
 * rig-hull-<rank>: the armour. Rank 0 is the band's plate (yellow, so the
 * band under the cream stripe runs unbroken as on the board: lit over body,
 * the dark line above the tread); rank 1 is silver plates along the band.
 */
export function rigHull(rank, variant = RIG_VARIANT) {
  const ctx = context(`rig-hull-${rank}`, variant);
  if (rank)
    return layer(
      "armour",
      part(ctx, "plates", {
        zone: "silver",
        d: "M46 65 L55 61 H92 L102 66 V75 H45 Z",
        bevel: [
          [46, 65],
          [55, 61],
          [92, 61],
          [102, 66],
          [102, 75],
          [45, 75],
        ],
        base: "body",
        bands: tierBands("y", 65.6, 69.4, 40, 108),
        lines: ["M70 61.5 V75"],
        rims: ["M56 63 H91"],
      }),
    );
  // The band's plate, over the shell's own band: lit over body, the dark
  // line above the tread; its front ends at the shell's front (x 98),
  // chamfered, so no ledge shows in the down poses.
  const y1 = BAND.y1 + 0.8;
  return layer(
    "armour",
    part(ctx, "skirt", {
      zone: "hull",
      d: pathData([
        [44.8, BAND.y0],
        [94.6, BAND.y0],
        [CAB.x1, BAND.y0 + 3.4],
        [CAB.x1, y1],
        [44.8, y1],
      ]),
      bevel: [
        [44.8, BAND.y0],
        [94.6, BAND.y0],
        [CAB.x1, BAND.y0 + 3.4],
        [CAB.x1, y1],
        [44.8, y1],
      ],
      base: "body",
      facets: [
        ["lit", box(40, BAND.y0 - 2, 108, BAND.lit)],
        ["deep", box(40, BAND.deep, 108, 80)],
      ],
      softs: [soft("y", BAND.lit, "lit", "body", 40, 108, 1.2)],
      edge: SEAM_W,
    }),
  );
}

// ---------------------------------------------------------------- drill
const MOUNT = rrect(91, 58, 15.5, 20, 3);
/**
 * The bit: a large cone, about the pre-A13 size (base 24 units, reach 20.7).
 * Its tip stops at 125.1, so the outline's round join (half of 4.22) ends
 * 0.8 units inside the 128-unit frame instead of being cut flat by it.
 */
const CONE = [
  [104.4, 56],
  [125.1, 68],
  [104.4, 80],
];
/** How far the glint's tip end stays from the bit's tip, in units. */
const GLINT_GAP = 7.8;
/** The right bit's tiers: lit above the axis, body to BIT_SHADOW, shadow under (its bottom quarter). */
const BIT_SHADOW = 74;
/**
 * The down bit's tiers about its axis: lit within 3.4 (its middle faces the
 * viewer and the light), body to both sides; too narrow past its outline
 * for a shadow band (the grooves are its deep tier).
 */
const DOWN_LIT = 3.4;
/** The bit's axis (y) in the right-facing drawing. */
const AXIS = 68;
/**
 * Flute grooves: width, the lit face behind each, and the slant over 22
 * units of y. A groove is one tier darker than the face it cuts (body on the
 * lit half, shadow on the body), so the bit stays light; on the shadow (the
 * bottom quarter) the flute shows as its lit face, in the body tier.
 */
const GROOVE_W = 2.8,
  FACE_W = 2.4,
  SLANT = 4.4;
/** The down bit's grooves: wider, as they are its only shadow tier. */
const DOWN_GROOVE_W = 3.4;
/** A flute band between x offsets [a, b] from its groove's top x, cut to y0..y1. */
function fluteBand(gx, a, b, y0, y1) {
  const xAt = (y, o) => gx + o + (SLANT * (y - 57)) / 22;
  return pathData([
    [xAt(y0, a), y0],
    [xAt(y0, b), y0],
    [xAt(y1, b), y1],
    [xAt(y1, a), y1],
  ]);
}

/**
 * Tiers symmetric about the bit's axis (the down pose: a round part seen
 * from the side, its middle toward the viewer and the light): `lit` within
 * `a` of the axis, `shadow` beyond `b` (none when b is null), the base
 * between; x spans lo..hi.
 */
function axisBands(a, b, lo, hi) {
  const facets = [["lit", box(lo, AXIS - a, hi, AXIS + a)]];
  if (b !== null)
    facets.push(
      ["shadow", box(lo, AXIS - 20, hi, AXIS - b)],
      ["shadow", box(lo, AXIS + b, hi, AXIS + 20)],
    );
  return { facets, softs: [] };
}

/**
 * The drill mount and bit, before the direction transform. `down` authors
 * the tiers for the down pose: the mount lit at its top end (x here, the
 * screen's y after the turn), the bit and the copper rings symmetric about
 * the axis, so the down drill stays top-lit instead of lit from the side.
 */
function drillRight(ctx, frame, down) {
  const p = frame % 8;
  // The mount is the board's collar look: silver round one copper ring. In
  // the down pose the cone's outline covers the mount's lower end, so it
  // shows its lit top and body only.
  const mount =
    part(ctx, "mount", {
      zone: "silver",
      d: MOUNT,
      bevel: down
        ? undefined
        : [
            [91, 58],
            [106.5, 58],
            [106.5, 78],
            [91, 78],
          ],
      base: "body",
      bands: down
        ? {
            facets: [["lit", box(84, 50, 95.2, 86)]],
            softs: [soft("x", 95.2, "lit", "body", 50, 86)],
          }
        : tierBands("y", 64.6, 71.4, 86, 110),
      rims: [down ? vline(93.6, 61, 75) : hline(93.6, 104, 60.4)],
    }) +
    // The copper ring inside the mount's outline (zones are never nested).
    part(ctx, "ring", {
      zone: "copper",
      d: box(97.6, 60.2, 101.6, 75.8),
      base: "body",
      bands: down
        ? axisBands(2.4, 5.2, 90, 110)
        : tierBands("y", 64.6, 71.4, 90, 110),
      edge: 0,
    });
  // Flutes: grooves slanting across the whole bit, one tier darker than
  // the face they cut, each with its lit face behind it in the body band;
  // the 8 frames move them one pitch toward the tip, so the bit reads as
  // turning.
  const pitch = DRILL_FLUTE_PITCH;
  const facets = [];
  // Where the grooves' faces show, by y, and their tier (right: lit on the
  // body band, body on the shadow; down: lit either side of the lit middle).
  const faces = down
    ? [
        [52, AXIS - DOWN_LIT, "lit"],
        [AXIS + DOWN_LIT, 84, "lit"],
      ]
    : [
        [AXIS, BIT_SHADOW, "lit"],
        [BIT_SHADOW, 84, "body"],
      ];
  // The groove's tier per band of y: [y0, y1, tier].
  const grooves = down
    ? [
        [52, AXIS - DOWN_LIT, "shadow"],
        [AXIS - DOWN_LIT, AXIS + DOWN_LIT, "body"],
        [AXIS + DOWN_LIT, 84, "shadow"],
      ]
    : [
        [52, AXIS, "body"],
        [AXIS, BIT_SHADOW, "shadow"],
      ];
  facets.push(
    ...(down
      ? axisBands(DOWN_LIT, null, 100, 130).facets
      : [
          ["lit", box(100, 50, 130, AXIS)],
          ["shadow", box(100, BIT_SHADOW, 130, 86)],
        ]),
  );
  for (let k = -1 - DRILL_FLUTE_TURNS; k < 6; k++) {
    const gx = 101.2 + k * pitch + (p * pitch * DRILL_FLUTE_TURNS) / 8;
    for (const [y0, y1, tier] of faces)
      facets.push([tier, fluteBand(gx, -FACE_W, 0, y0, y1)]);
    for (const [y0, y1, tier] of grooves)
      facets.push([
        tier,
        fluteBand(gx, 0, down ? DOWN_GROOVE_W : GROOVE_W, y0, y1),
      ]);
  }
  // A white glint toward the tip along the lit upper face (on the axis, the
  // lit middle, in the down pose), over the flutes, as on the board; it
  // ends GLINT_GAP short of the tip, clear of the outline.
  const g = CONE[1][0] - GLINT_GAP;
  facets.push([
    "glint",
    down
      ? pathData([
          [g - 7, AXIS - 1.3],
          [g, AXIS - 1.1],
          [g, AXIS + 1.1],
          [g - 7, AXIS + 1.3],
        ])
      : pathData([
          [g - 6.6, 63.2],
          [g, 66.6],
          [g, 68.4],
          [g - 6.6, 65.8],
        ]),
  ]);
  const bit = part(ctx, "bit", {
    zone: "silver",
    d: pathData(CONE),
    base: "body",
    facets,
    // No soft strips or rim line over the bit: the flutes already break its
    // tier seams, the glint is its rim light, and anything static over the
    // flutes would slow the spin.
  });
  return layer("drill-mount", mount) + layer("auger-flutes", bit);
}
const DIRECTION = {
  right: (g) => g,
  down: (g) => `<g transform="translate(132 0) rotate(90 0 0)">${g}</g>`,
  left: (g) => `<g transform="translate(128 0) scale(-1 1)">${g}</g>`,
};
/** rig-drill-<direction>-<frame> (rig-drill-idle is frame 0, right). */
export function rigDrill(
  frame,
  direction,
  variant = RIG_VARIANT,
  id = `rig-drill-${direction}-${frame}`,
) {
  return DIRECTION[direction](
    drillRight(context(id, variant), frame, direction === "down"),
  );
}

/**
 * rig-drill-collar-<direction>-1: the rank-one collar over the mount, a
 * silver sleeve with flanges at both ends and a copper band.
 */
export function rigDrillCollar(direction, variant = RIG_VARIANT) {
  const ctx = context(`rig-drill-collar-${direction}-1`, variant);
  const down = direction === "down";
  const g =
    part(ctx, "sleeve", {
      zone: "silver",
      d: rrect(97.6, 50.8, 15, 33.6, 2.8),
      bevel: down
        ? undefined
        : [
            [97.6, 50.8],
            [112.6, 50.8],
            [112.6, 84.4],
            [97.6, 84.4],
          ],
      base: "body",
      bands: down
        ? tierBands("x", 102.4, 107.8, 46, 90)
        : tierBands("y", 58.4, 76.6, 94, 116),
      // The flanges' joins (across the sleeve in either pose).
      lines: [hline(99.6, 110.6, 57.6), hline(99.6, 110.6, 77.6)],
      rims: [down ? vline(99.8, 53.4, 81.6) : hline(100.2, 110, 52.8)],
    }) +
    part(ctx, "band", {
      zone: "copper",
      d: box(102.6, 57.6, 107.6, 77.6),
      base: "body",
      bands: down
        ? axisBands(2.6, 6.2, 98, 112)
        : tierBands("y", 62, 73, 98, 112),
      edge: LINE_W,
    });
  return DIRECTION[direction](layer("rank-one-collar", g));
}

// ---------------------------------------------------------------- feet, rack, thrust, damage
/** rig-feet-stowed / rig-feet-deployed (W01-R2 anchoring feet). */
export function rigFeet(deployed, variant = RIG_VARIANT) {
  const ctx = context(`rig-feet-${deployed ? "deployed" : "stowed"}`, variant);
  // A leg is a strut; its upper part faces up (lit), its foot is in shadow.
  const leg = (pts, name, litTo, shadowFrom) =>
    part(ctx, name, {
      zone: "steel",
      d: pathData(pts),
      base: "body",
      bands: tierBands("y", litTo, shadowFrom),
    });
  if (!deployed)
    return layer(
      "anchoring-feet",
      leg(
        [
          [31, 68],
          [38, 71],
          [31, 85],
          [24, 82],
        ],
        "leg-rear",
        74.6,
        79.4,
      ) +
        leg(
          [
            [86, 71],
            [93, 68],
            [102.5, 82],
            [95.5, 85],
          ],
          "leg-front",
          74.6,
          79.4,
        ),
    );
  const pad = (x, name) =>
    part(ctx, name, {
      zone: "pads",
      d: rrect(x, 102, 22, 12, 2.6),
      base: "body",
      bands: tierBands("y", 106.9, 109.8, x - 2, x + 24),
      rims: [hline(x + 2.4, x + 19.6, 104)],
      extra: line(
        `M${num(x + 5)} 106.8 l2.6 3 M${num(x + 13)} 106.8 l2.6 3`,
        OUTLINE,
        1.6,
      ),
    });
  return layer(
    "anchoring-feet",
    leg(
      [
        [32, 68.5],
        [39.5, 72],
        [27, 94],
        [27, 104],
        [19.5, 104],
        [19.5, 92],
      ],
      "leg-rear",
      82,
      93,
    ) +
      leg(
        [
          [84.5, 72],
          [92, 68.5],
          [108.5, 92],
          [108.5, 104],
          [101, 104],
          [101, 94],
        ],
        "leg-front",
        82,
        93,
      ) +
      pad(6.5, "pad-rear") +
      pad(99.5, "pad-front"),
  );
}

/** rig-rack (W01-R3 cargo rack at the rear). */
export function rigRack(variant = RIG_VARIANT) {
  const ctx = context("rig-rack", variant);
  const crate = (x, y, w, h, name) =>
    part(ctx, name, {
      zone: "silver",
      d: rrect(x, y, w, h, 1.6),
      base: "body",
      bands: tierBands("y", y + 4.2, y + h - 3.8, x - 2, x + w + 2),
      rims: [hline(x + 1.6, x + w - 1.6, y + 1.6)],
      edge: SEAM_W,
    });
  return layer(
    "cargo-rack",
    part(ctx, "frame", {
      zone: "steel",
      d: pathData([
        [17, 45],
        [40, 45],
        [40, 75],
        [12, 75],
        [12, 54],
      ]),
      // Body above the top rail, shadow under it (the crates fill the rest);
      // the rails are lit.
      base: "shadow",
      facets: [["body", box(8, 41, 44, 51.8)]],
      // The rails: lit bars.
      extra: [
        box(12, 51.8, 40, 54.2),
        box(12, 72.8, 40, 75.2),
        box(18.8, 45, 21.2, 75),
        box(30.8, 45, 33.2, 75),
      ]
        .map((d) => P(d, RIG_TONES.steel.lit))
        .join(""),
    }) +
      crate(15, 58.4, 9, 13.6, "crate-a") +
      crate(26, 55.6, 10, 16.4, "crate-b"),
  );
}

/** thrust-<i>: the two jet flames under the tracks (i 0..5). */
export function rigThrust(i) {
  const length = 5 + [0, 8, 3, 12, 5, 15][i];
  const F = RIG_TONES.flame;
  const jet = (x) =>
    P(
      pathData([
        [x, 95],
        [x - 8, 99 + length],
        [x + 2, 106 + length],
        [x + 12, 99 + length],
        [x + 7, 95],
      ]),
      F.outer,
    ) +
    P(
      pathData([
        [x + 0.6, 96],
        [x - 4.6, 99 + length],
        [x + 2, 104.4 + length],
        [x + 8.6, 99 + length],
        [x + 6.4, 96],
      ]),
      F.mid,
    ) +
    P(
      pathData([
        [x + 1, 96],
        [x - 2.6, 99 + length * 0.8],
        [x + 2, 102 + length * 0.8],
        [x + 7.4, 98 + length * 0.8],
        [x + 6, 96],
      ]),
      F.core,
    );
  return layer("jet-flame", `<g data-zone="flame">${jet(38) + jet(80)}</g>`);
}

/** rig-damage-<level>: wear marks over the hull (levels 1..3), clear of the lamp. */
export function rigDamage(level) {
  let s = line("M54 69 l12 -3 l-4 7 M31 83 l6 3 M85 78 l10 -4", "#384b51", 3);
  if (level > 1)
    s +=
      line("M73 41 l-7 8 l5 5 M49 63 l6 9 l-8 4 M90 83 l8 4", "#162932", 3) +
      line("M27 58 l9 4 l-7 7", "#e4d3aa", 2);
  if (level > 2)
    s +=
      line(
        "M44 75 l-5 7 H31 l-6 9 M92 67 l6 5 l-2 9 M56 43 l4 5 l-7 4",
        OUTLINE,
        4,
      ) + line("M87 68 l6 3 l-2 6", "#e0b783", 2);
  return layer(`wear-${level}`, s);
}

// ---------------------------------------------------------------- frame lists
/**
 * The rig and thrust frames create-w01-sources.mjs saves before the icons,
 * in its order, as [name, body, extra] (rig-cabin-emissive right after
 * rig-cabin). rig-damage-* and rig-drill-collar-*-1 come after the icons
 * (rigLateFrames), as before.
 */
export function rigFrames(variant = RIG_VARIANT) {
  const frames = [];
  for (let i = 0; i < 8; i++)
    frames.push([
      `rig-body-${i}`,
      rigBody(i, variant),
      { pivot: { x: 0.5, y: 0.5 } },
    ]);
  for (const f of rigCabinFrames(variant)) frames.push([f.name, f.body, {}]);
  for (let i = 0; i < 2; i++) {
    frames.push([`rig-engine-${i}`, rigEngine(i, variant), {}]);
    frames.push([`rig-energy-${i}`, rigEnergy(i, variant), {}]);
    frames.push([`rig-bay-${i}`, rigBay(i, variant), {}]);
    frames.push([`rig-hull-${i}`, rigHull(i, variant), {}]);
  }
  frames.push([
    "rig-drill-idle",
    rigDrill(0, "right", variant, "rig-drill-idle"),
    {},
  ]);
  for (const d of ["right", "down", "left"])
    for (let i = 0; i < 8; i++)
      frames.push([`rig-drill-${d}-${i}`, rigDrill(i, d, variant), {}]);
  frames.push(["rig-feet-stowed", rigFeet(false, variant), {}]);
  frames.push(["rig-feet-deployed", rigFeet(true, variant), {}]);
  frames.push(["rig-rack", rigRack(variant), {}]);
  for (let i = 0; i < 6; i++) frames.push([`thrust-${i}`, rigThrust(i), {}]);
  return frames;
}
/** rig-damage-1..3, then rig-drill-collar-{right,down,left}-1. */
export function rigLateFrames(variant = RIG_VARIANT) {
  const frames = [];
  for (let i = 1; i <= 3; i++)
    frames.push([`rig-damage-${i}`, rigDamage(i), {}]);
  for (const d of ["right", "down", "left"])
    frames.push([`rig-drill-collar-${d}-1`, rigDrillCollar(d, variant), {}]);
  return frames;
}
