/**
 * Art item A13: the rig shading variants and the emissive headlamp beside
 * the board's rig, for the director's pick (style guide §8, audit §6.4).
 *
 * For each variant in RIG_VARIANTS (and for the rig before A13, read from
 * the committed sources at --before REV) it composes the rig as rig.ts
 * layers it: in the depth order of src/campaign/render/rig-layers.json (the
 * table rig.ts draws with: thrust, body, engine, energy, bay, cabin, hull,
 * damage, feet, rack, the W02 tools, drill, collar), the base flipped when
 * facing left, directional drill and collar frames never; rig-cabin-emissive
 * goes ADD over the finished stack, at the table's emissive depth, above
 * every layer. Ten poses:
 *
 *   idle            hardware 0, drill idle (the board's pose)
 *   drill-right     body moving, drill-right-3
 *   drill-down      drill-down-3
 *   drill-left      facing left, drill-left-3
 *   flipped         facing left, idle
 *   rank1           engine/energy/bay/hull 1, feet deployed, rack, collar 1
 *   rank1-down      rank 1 drilling down (drill-down-3, collar down 1)
 *   thrust-damage   thrust-3, damage 3
 *   rank2-w02       W02's rank-2 modules, its three tools (thermal,
 *                   condenser, preservation) and collar over the W01
 *                   cabin/body
 *   rank2-down      the same drilling down (W02's collar down 2)
 *
 * and writes each composite as an SVG, its zone-ID twin (every fill inside
 * a data-zone group painted the zone's ID colour, the outline left, for the
 * on-screen tier masks), and rasterizes them at the board's matched scale
 * (CONCEPT_TILE: 128 units = 58.85 px, written 59), at @2 (128 px), @3
 * (192) and @4 (256). It also rasterizes rig-body-0, rig-cabin and
 * rig-cabin-emissive alone at @2/@3/@4 (the tread-row check), every rig and
 * thrust frame of each set at @2 (contact sheet) and of each variant at
 * @2, @3 and @4 with its zone twin (the per-frame visible-tier check at
 * every page density), the eight
 * rig-drill-right/down frames of each set at every scale (the animation
 * check), and the HUD icons at 25, 50, 64 and 128 px (before, as shipped,
 * and each variant's rework); then writes review.json for
 * scripts/art-review-a13.py:
 *
 *   node scripts/art-review-a13.mjs OUT [--before REV]
 *   python3 scripts/art-review-a13.py OUT/review.json docs/qa/a13-rig-shading
 *
 * REV defaults to 2a6185a, item 2's tip (T13b, PR #18), which A13 is built
 * on. After a squash merge that commit may be missing from a fresh clone:
 * fetch it (git fetch origin pull/18/head) or pass the merged commit as
 * --before; the script stops if REV does not resolve.
 *
 * Authoring only (rasterizes with scripts/rasterize-campaign-svgs.mjs).
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CABIN_INDICATOR,
  DRILL_FLUTE_PITCH,
  DRILL_FLUTE_TURNS,
  HEADLAMP_LENS,
  RIG_LIGHTS,
  RIG_TONES,
  RIG_VARIANT,
  RIG_VARIANTS,
  TREAD_BOTTOM,
  rigBay,
  rigDrill,
  rigEnergy,
  rigEngine,
  rigFeet,
  rigFrames,
  rigHull,
  rigLateFrames,
  rigRack,
} from "../assets/campaign/source/w01-rig.mjs";
import { CONCEPT_TILE, rasterize } from "../assets/campaign/kit/review.mjs";

const args = process.argv.slice(2);
const out = resolve(
  args.find((a) => !a.startsWith("--")) || "artifacts/art-review-a13",
);
const beforeAt = args.indexOf("--before");
// The rig before A13: item 2's tip (T13b), the commit A13 is built on.
const BEFORE_REV = beforeAt >= 0 ? args[beforeAt + 1] : "2a6185a";
const root = new URL("../", import.meta.url);
try {
  execFileSync("git", ["rev-parse", "--verify", `${BEFORE_REV}^{commit}`], {
    cwd: new URL(".", root),
    stdio: "ignore",
  });
} catch {
  console.error(
    `art-review-a13: --before ${BEFORE_REV} is not a commit here. The default is item 2's tip (T13b, PR #18): fetch it (git fetch origin pull/18/head) or pass --before <the commit A13 is built on>.`,
  );
  process.exit(2);
}

const bodyOf = (text) =>
  text
    .replace(/^.*?<\/title>/s, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/^<g stroke-linecap="round" stroke-linejoin="round">/, "")
    .replace(/<\/g>$/, "");
const doc = (body, size = 128) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const flip = (body) =>
  `<g transform="translate(128 0) scale(-1 1)">${body}</g>`;

// ---------------------------------------------------------------- frame sets
/** name -> body for one variant (the shipping generator, any variant). */
function variantFrames(variant) {
  const frames = {};
  for (const [name, body] of [...rigFrames(variant), ...rigLateFrames(variant)])
    frames[name] = body;
  return frames;
}
const gitShow = (rev, path) =>
  execFileSync("git", ["show", `${rev}:${path}`], {
    cwd: new URL(".", root),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
/** Whether REV's tree has `path` (git cat-file -e: exit 0 when it does). */
const gitHas = (rev, path) => {
  try {
    execFileSync("git", ["cat-file", "-e", `${rev}:${path}`], {
      cwd: new URL(".", root),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};
/**
 * name -> body of the committed sources at REV (the rig before A13). A frame
 * the old rig did not have (rig-cabin-emissive) is left out; any other git
 * failure stops the run, so a composite never silently loses a frame.
 */
function committedFrames(rev, names) {
  const frames = {};
  for (const name of names) {
    const path = `assets/campaign/source/${name}.svg`;
    if (gitHas(rev, path)) frames[name] = bodyOf(gitShow(rev, path));
  }
  return frames;
}
const W02 = {};
for (const name of [
  "rig-engine-2",
  "rig-energy-2",
  "rig-bay-2",
  "rig-hull-2",
  "rig-drill-collar-right-2",
  "rig-drill-collar-down-2",
  "tool-thermal",
  "tool-condenser",
  "tool-preservation",
])
  W02[name] = bodyOf(
    await readFile(new URL(`assets/campaign/w02/${name}.svg`, root), "utf8"),
  );

// ---------------------------------------------------------------- poses
/**
 * The rig's layers and their depths, as the game draws them (one source for
 * render/rig.ts and these composites).
 */
const RIG_LAYERS = JSON.parse(
  await readFile(new URL("src/campaign/render/rig-layers.json", root), "utf8"),
);
const layerOf = (name) => {
  const record = RIG_LAYERS.layers.find(({ frames }) =>
    new RegExp(frames).test(name),
  );
  if (!record) throw new Error(`${name}: no layer in rig-layers.json`);
  return record;
};
if (RIG_LAYERS.layers.some(({ depth }) => depth >= RIG_LAYERS.emissive))
  throw new Error("rig-layers.json: the emissive must sit above every layer");
/**
 * [frame, flipped] lists per pose (emissive excluded); sorted below into
 * the game's depth order.
 */
const POSES = {
  idle: [
    ["rig-body-0"],
    ["rig-engine-0"],
    ["rig-energy-0"],
    ["rig-bay-0"],
    ["rig-cabin"],
    ["rig-hull-0"],
    ["rig-drill-idle"],
  ],
  "drill-right": [
    ["rig-body-2"],
    ["rig-engine-0"],
    ["rig-energy-0"],
    ["rig-bay-0"],
    ["rig-cabin"],
    ["rig-hull-0"],
    ["rig-drill-right-3"],
  ],
  "drill-down": [
    ["rig-body-0"],
    ["rig-engine-0"],
    ["rig-energy-0"],
    ["rig-bay-0"],
    ["rig-cabin"],
    ["rig-hull-0"],
    ["rig-drill-down-3"],
  ],
  "drill-left": [
    ["rig-body-0", true],
    ["rig-engine-0", true],
    ["rig-energy-0", true],
    ["rig-bay-0", true],
    ["rig-cabin", true],
    ["rig-hull-0", true],
    ["rig-drill-left-3"],
  ],
  flipped: [
    ["rig-body-0", true],
    ["rig-engine-0", true],
    ["rig-energy-0", true],
    ["rig-bay-0", true],
    ["rig-cabin", true],
    ["rig-hull-0", true],
    ["rig-drill-idle", true],
  ],
  rank1: [
    ["rig-body-0"],
    ["rig-engine-1"],
    ["rig-energy-1"],
    ["rig-bay-1"],
    ["rig-cabin"],
    ["rig-hull-1"],
    ["rig-feet-deployed"],
    ["rig-rack"],
    ["rig-drill-right-2"],
    ["rig-drill-collar-right-1"],
  ],
  "rank1-down": [
    ["rig-body-0"],
    ["rig-engine-1"],
    ["rig-energy-1"],
    ["rig-bay-1"],
    ["rig-cabin"],
    ["rig-hull-1"],
    ["rig-feet-deployed"],
    ["rig-rack"],
    ["rig-drill-down-3"],
    ["rig-drill-collar-down-1"],
  ],
  "thrust-damage": [
    ["thrust-3"],
    ["rig-body-5"],
    ["rig-engine-0"],
    ["rig-energy-0"],
    ["rig-bay-0"],
    ["rig-cabin"],
    ["rig-hull-0"],
    ["rig-damage-3"],
    ["rig-drill-idle"],
  ],
  "rank2-w02": [
    ["rig-body-0"],
    ["rig-engine-2"],
    ["rig-energy-2"],
    ["rig-bay-2"],
    ["rig-cabin"],
    ["rig-hull-2"],
    ["tool-condenser"],
    ["tool-thermal"],
    ["tool-preservation"],
    ["rig-drill-idle"],
    ["rig-drill-collar-right-2"],
  ],
  "rank2-down": [
    ["rig-body-0"],
    ["rig-engine-2"],
    ["rig-energy-2"],
    ["rig-bay-2"],
    ["rig-cabin"],
    ["rig-hull-2"],
    ["tool-condenser"],
    ["tool-thermal"],
    ["tool-preservation"],
    ["rig-drill-down-3"],
    ["rig-drill-collar-down-2"],
  ],
};
for (const layers of Object.values(POSES)) {
  layers.sort(([a], [b]) => layerOf(a).depth - layerOf(b).depth);
  const depths = layers.map(([name]) => layerOf(name).depth);
  if (new Set(depths).size !== depths.length)
    throw new Error(`two layers of one pose share a depth: ${layers}`);
}
/** Which poses carry the emissive (every pose draws rig-cabin). */
const EMISSIVE_FLIP = { "drill-left": true, flipped: true };

// ---------------------------------------------------------------- zone IDs
/** ID colours for the on-screen zone masks (none appears in the art). */
export const ZONE_IDS = {
  hull: "#ff0000",
  light: "#808080",
  copper: "#00ff00",
  paint: "#00ff80",
  silver: "#0000ff",
  steel: "#ffff00",
  tracks: "#00ffff",
  glass: "#ff00ff",
  lamp: "#ff8000",
  rank1: "#8000ff",
  pads: "#0080ff",
  flame: "#80ff00",
  unzoned: "#ff0080",
};
const OUTLINES = new Set(["#14232b", "#111e26", "#101820", "#0e151d"]);
const paint = (text, colour) =>
  text
    .replace(/fill="(#[0-9a-fA-F]{3,6}|url\([^)]*\))"/g, (m, c) =>
      OUTLINES.has(c.toLowerCase()) ? m : `fill="${colour}"`,
    )
    .replace(/stroke="(#[0-9a-fA-F]{3,6})"/g, (m, c) =>
      OUTLINES.has(c.toLowerCase()) ? m : `stroke="${colour}"`,
    );
/**
 * The composite with each data-zone group's fills (and non-outline strokes)
 * in its zone's ID colour and everything outside a zone in `unzoned`, the
 * outline inks kept: the zone a visible pixel belongs to, after occlusion.
 * Groups are found as scripts/art_tiers.py's _zone_chunks finds them.
 */
function zoneIdBody(text) {
  let result = "",
    at = 0;
  const open = /<g[^>]*data-zone="([^"]+)"[^>]*>/g;
  let match;
  while ((match = open.exec(text))) {
    if (match.index < at) continue;
    let depth = 1,
      index = text.length;
    const tag = /<(\/?)g\b/g;
    tag.lastIndex = match.index + match[0].length;
    let t;
    while ((t = tag.exec(text))) {
      depth += t[1] ? -1 : 1;
      if (!depth) {
        index = t.index;
        break;
      }
    }
    result += paint(text.slice(at, match.index), ZONE_IDS.unzoned);
    result +=
      match[0] +
      paint(
        text.slice(match.index + match[0].length, index),
        ZONE_IDS[match[1]] ?? ZONE_IDS.unzoned,
      );
    at = index;
    open.lastIndex = index;
  }
  return result + paint(text.slice(at), ZONE_IDS.unzoned);
}

// ---------------------------------------------------------------- build
const SCALES = { board: CONCEPT_TILE / 96, x2: 1, x3: 1.5, x4: 2 };
const sets = {};
for (const variant of Object.keys(RIG_VARIANTS))
  sets[variant] = variantFrames(variant);
const names = Object.keys(sets[RIG_VARIANT]);
sets.before = committedFrames(BEFORE_REV, names);

await mkdir(out, { recursive: true });
const items = { board: [], x2: [], x3: [], x4: [] };
const review = {
  item: "A13",
  before: BEFORE_REV,
  variants: Object.keys(RIG_VARIANTS),
  default: RIG_VARIANT,
  params: RIG_VARIANTS,
  tones: RIG_TONES,
  lights: RIG_LIGHTS,
  lens: HEADLAMP_LENS,
  indicator: CABIN_INDICATOR,
  treadBottom: TREAD_BOTTOM,
  drillFlute: { pitch: DRILL_FLUTE_PITCH, turns: DRILL_FLUTE_TURNS },
  conceptTile: CONCEPT_TILE,
  scales: SCALES,
  zoneIds: ZONE_IDS,
  poses: Object.keys(POSES),
  poseLayers: Object.fromEntries(
    Object.entries(POSES).map(([pose, layers]) => [
      pose,
      layers.map(([name, flipped]) => ({
        frame: name,
        layer: layerOf(name).layer,
        depth: layerOf(name).depth,
        flipped: !!flipped,
      })),
    ]),
  ),
  emissiveDepth: RIG_LAYERS.emissive,
  emissiveFlip: EMISSIVE_FLIP,
  sets: {},
  frames: {},
  icons: {},
};
const add = (name, body, scales = ["board", "x2", "x3", "x4"]) => {
  for (const s of scales)
    items[s].push({ name, width: 128, height: 128, svg: doc(body) });
};

for (const [set, frames] of Object.entries(sets)) {
  const record = { composites: {}, emissive: null };
  for (const [pose, layers] of Object.entries(POSES)) {
    const body = layers
      .map(([name, flipped]) => {
        const b = frames[name] ?? W02[name];
        if (b === undefined) throw new Error(`${set}: no frame ${name}`);
        return flipped ? flip(b) : b;
      })
      .join("");
    const name = `${set}-${pose}`;
    add(name, body);
    add(`${name}-zones`, zoneIdBody(body), ["x2", "x4"]);
    await writeFile(`${out}/${name}.svg`, doc(body));
    record.composites[pose] = name;
  }
  if (frames["rig-cabin-emissive"]) {
    add(`${set}-emissive`, frames["rig-cabin-emissive"]);
    add(`${set}-emissive-flipped`, flip(frames["rig-cabin-emissive"]));
    record.emissive = `${set}-emissive`;
  }
  // Alone, for the tread-row check and the scale strip.
  if (frames["rig-cabin-emissive"])
    add(`${set}-frame-rig-cabin-flipped`, flip(frames["rig-cabin"]), ["x4"]);
  for (const frame of ["rig-body-0", "rig-cabin", "rig-cabin-emissive"])
    if (frames[frame])
      add(`${set}-frame-${frame}`, frames[frame], ["x2", "x3", "x4"]);
  review.sets[set] = record;
}
// Every frame of every set at @2 for the contact sheet; every frame of each
// variant at @2, @3 and @4 with its zone twin, for the per-frame visible
// tiers at each page density; and the sources for the structural tier
// counts.
for (const [set, frames] of Object.entries(sets)) {
  review.frames[set] = {};
  for (const [name, body] of Object.entries(frames)) {
    const scales = set === "before" ? ["x2"] : ["x2", "x3", "x4"];
    add(`${set}-all-${name}`, body, scales);
    if (set !== "before")
      add(`${set}-allz-${name}`, zoneIdBody(body), ["x2", "x3", "x4"]);
    review.frames[set][name] = `${set}-all-${name}`;
  }
}
// The drill's animation frames (16 fps in rig.ts), every set and scale.
review.drill = {};
for (const [set, frames] of Object.entries(sets)) {
  review.drill[set] = {};
  for (const d of ["right", "down"]) {
    review.drill[set][d] = [];
    for (let i = 0; i < 8; i++) {
      const name = `${set}-drill-${d}-${i}`;
      add(name, frames[`rig-drill-${d}-${i}`]);
      review.drill[set][d].push(name);
    }
  }
}
// HUD icons: before (REV), as shipped (the sources on disk:
// create-w01-sources.mjs keeps the pre-A13 drawings for drill, cargo, hull,
// engine and rack, and draws energy and feet from the reworked generators),
// and each variant's rework of all seven (iconZoom over the generators).
const iconZoom = (drawing, x, y, scale) =>
  `<g transform="translate(64 64) scale(${scale}) translate(${-x} ${-y})">${drawing}</g>`;
const ICONS = {
  drill: (v) => iconZoom(rigDrill(1, "right", v), 107, 68, 2.6),
  energy: (v) => iconZoom(rigEnergy(1, v), 21, 54, 2.2),
  cargo: (v) => iconZoom(rigBay(1, v), 32, 64, 2.9),
  hull: (v) => iconZoom(rigHull(1, v), 75, 68, 1.5),
  engine: (v) => iconZoom(rigEngine(1, v), 30, 57, 2.15),
  feet: (v) => iconZoom(rigFeet(true, v), 64, 92, 0.87),
  rack: (v) => iconZoom(rigRack(v), 26, 60, 2.5),
};
const ICON_SIZES = {
  icon128: 1,
  icon64: 0.5,
  icon50: 50 / 128,
  icon25: 25 / 128,
};
const iconItems = [];
for (const set of ["before", "shipped", ...Object.keys(RIG_VARIANTS)]) {
  review.icons[set] = {};
  for (const [icon, draw] of Object.entries(ICONS)) {
    const file = `assets/campaign/source/icon-${icon}.svg`;
    const body =
      set === "before"
        ? bodyOf(gitShow(BEFORE_REV, file))
        : set === "shipped"
          ? bodyOf(await readFile(new URL(file, root), "utf8"))
          : draw(set);
    const name = `${set}-icon-${icon}`;
    iconItems.push({ name, width: 128, height: 128, svg: doc(body) });
    review.icons[set][icon] = name;
  }
}
review.iconSizes = Object.fromEntries(
  Object.entries(ICON_SIZES).map(([k, v]) => [k, Math.round(128 * v)]),
);

for (const [scale, list] of Object.entries(items))
  await rasterize(list, `${out}/${scale}`, SCALES[scale]);
for (const [dir, scale] of Object.entries(ICON_SIZES))
  await rasterize(iconItems, `${out}/${dir}`, scale);
// The sources themselves (structural tiers read them).
for (const [set, frames] of Object.entries(sets))
  for (const [name, body] of Object.entries(frames))
    await writeFile(`${out}/x2/${set}-src-${name}.svg`, doc(body));
await writeFile(`${out}/review.json`, JSON.stringify(review, null, 2) + "\n");
console.log(
  `A13 review: ${Object.keys(RIG_VARIANTS).length} variants + before (${BEFORE_REV}), ${Object.keys(POSES).length} poses, in ${out}`,
);
