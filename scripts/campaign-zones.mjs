/**
 * Zone pages (audit T13b; decisions.md D1 and D5). One classification, used
 * by both world builds (which write it into generated/w0X-zones.json, the
 * only thing the game reads) and by the asset checks and tests.
 *
 * Every frame of a world's frames.json is either left out of the runtime
 * pages (terrain tiles, DOM-only icons, frames nothing draws) or belongs to
 * exactly one zone:
 *
 *   core     resident in every band: the rig and its tools, thrust, ore,
 *            packages and relics, sockets and high-contrast marks, drill
 *            cracks, mission markers, the field-log marker, warning shelves,
 *            surface salvage, and any frame drawn in more than one zone
 *   surface  above ground: the sky body and the lander, refuge and relay
 *            stages; resident while band A is the rig's band or a neighbour
 *   shaft    frames drawn only in the shaft bands, A and B
 *   cave     frames drawn only in the cave bands, C and D
 *
 * Shaft or cave is decided by where each frame is actually placed
 * (src/campaign/world.ts placeSites() and placeHazards(), the POI scenery of
 * src/campaign/render/poi-art.ts), at the band rows of
 * src/campaign/world-content.ts; tests/campaign-zones.test.mjs regenerates
 * both worlds and checks this table against them.
 *
 * Densities: every page is rendered from source (D5) at @2x (scale 1), @3x
 * (1.5) and, for the hero set only, @4x (2). Hero frames ("the rig, ore and
 * hero props", D1) and the rest go on separate pages, so a zone drawn at @4x
 * loads its hero frames once, from the @4x page, and the rest from @3x.
 *
 * Authoring and checks only; the game reads the manifest.
 */
import { emissiveOf } from "../assets/campaign/kit/emissive.mjs";

/** Phaser texture pages: wide enough for any frame, short enough for phones. */
export const PAGE_LIMIT = { width: 2048, height: 1024 };
/** Page densities and the render scale of each (frames are authored @2x). */
export const DENSITIES = [2, 3, 4];
export const densityScale = (density) => density / 2;
/** The densest page each set gets (D1: @4x only for the hero set). */
export const MAX_DENSITY = { hero: 4, plain: 3 };

/** Band rows, as src/campaign/world-content.ts WORLD_BANDS (tested equal). */
export const BAND_ROWS = {
  W01: { A: [0, 10], B: [11, 29], C: [30, 47], D: [48, 59] },
  W02: { A: [0, 14], B: [15, 44], C: [45, 74], D: [75, 99] },
};
/** The zones in page order. `bands` is where each zone's pages are drawn. */
export const ZONES = {
  core: { bands: ["A", "B", "C", "D"], note: "always resident" },
  surface: {
    bands: ["A"],
    note: "drawn above row 0; belongs with band A, like the sky and ridges",
  },
  shaft: { bands: ["A", "B"], note: "the shaft bands" },
  cave: { bands: ["C", "D"], note: "the cave bands" },
};
export const ZONE_NAMES = Object.keys(ZONES);

/** Terrain draws band pages through canvas patterns (render/terrain.ts). */
export const TERRAIN = /^(soil|stone|ice|frozen-rock|bedrock)(-edge)?-\d+$/;
/** The DOM HUD draws these from generated/icons (src/campaign/ui/icons.ts). */
export const DOM_ONLY = /^(icon-|world-|ui-(?!mission$))/;
/**
 * In the atlas, never drawn: there is no site kind `beacon` or `antenna`
 * (src/campaign/types.ts; the beacon POI draws `mission-beacon`,
 * docs/art-direction/asset-tracker.md row 15), and scene.ts draws the refuge
 * as refuge-stage-min(2, stage) from stage 1 and the relay as
 * relay-stage-min(2, stage - 1) from stage 2, so neither stage 0 is reached.
 * tests/campaign-zones.test.mjs trips if those draws change.
 */
export const UNUSED = new Set([
  "site-beacon",
  "site-antenna",
  "refuge-stage-0",
  "relay-stage-0",
]);

const CORE =
  /^(rig-.+|tool-.+|thrust-\d+|ore-o\d+|package-o\d+|relic|deposit-socket|tier-mark-hc-\d+|crack-\d+|mission-.+|ui-mission|warning-shelf|surface-salvage)$/;
const SURFACE = /^(sky-body|dock-stage-\d+|refuge-stage-\d+|relay-stage-\d+)$/;
/**
 * The hero set (D1, audit §5.6): the rig with its mounted tools and thrust,
 * ore, packages, relics, sockets and their marks, the beacon (asset 15), the
 * wreck (asset 14) and the lander (assets 1 and 2). Raster-source frames are
 * never hero frames (no @4x master, D5).
 */
export const HERO =
  /^(rig-.+|tool-.+|thrust-\d+|ore-o\d+|package-o\d+|relic|deposit-socket|tier-mark-hc-\d+|mission-beacon|site-wreck|dock-stage-\d+)$/;

/**
 * Where each underground frame outside the core list is drawn, as
 * [world, first row, last row] spans. Sites: placeSites() (one row each);
 * POI scenery: site-wreck behind the valve and antenna, site-core behind the
 * navigation core and the catalyst (poi-art.ts, mission rows in world.ts);
 * hazards: placeHazards() (cold pockets and vents at a base row plus up to
 * 2, pressure seams from row 45 / 75 down); test-raster: scene.ts
 * TEST_RASTER (W01 row 3, ?debug=test-raster only).
 */
export const PLACEMENT = {
  "site-survey": [
    ["W01", 8, 8],
    ["W02", 28, 28],
    ["W02", 72, 72],
  ],
  "site-mission": [
    ["W01", 23, 23],
    ["W01", 38, 38],
    ["W02", 43, 43],
  ],
  "site-wreck": [
    ["W01", 24, 24],
    ["W01", 39, 39],
    ["W01", 43, 43],
    ["W02", 12, 12],
    ["W02", 58, 58],
  ],
  "site-geode": [
    ["W01", 53, 53],
    ["W02", 86, 86],
  ],
  "site-cache": [
    ["W01", 56, 56],
    ["W02", 94, 94],
  ],
  "site-core": [
    ["W01", 59, 59],
    ["W02", 99, 99],
  ],
  "pressure-seam": [
    ["W01", 45, 59],
    ["W02", 75, 99],
  ],
  "cold-pocket": [
    ["W02", 28, 30],
    ["W02", 61, 63],
  ],
  "cold-warning": [
    ["W02", 28, 30],
    ["W02", 61, 63],
  ],
  "ice-vent": [
    ["W02", 48, 50],
    ["W02", 83, 85],
  ],
  "test-raster": [["W01", 3, 3]],
};

/** The bands ("W01:A", …) a list of row spans touches. */
export function bandsOf(spans) {
  const bands = new Set();
  for (const [world, first, last] of spans)
    for (const [band, [start, end]] of Object.entries(BAND_ROWS[world]))
      if (first <= end && last >= start) bands.add(`${world}:${band}`);
  return [...bands].sort();
}

/**
 * Why a frame stays off the runtime pages ("terrain", "dom", "unused"), or
 * null when it belongs on them. An `-emissive` sibling follows its base.
 */
export function excludedReason(name) {
  const base = emissiveOf(name) ?? name;
  if (TERRAIN.test(base)) return "terrain";
  if (DOM_ONLY.test(base)) return "dom";
  if (UNUSED.has(base)) return "unused";
  return null;
}

/**
 * The zone of a frame drawn by the runtime, or null for a frame left out.
 * An `-emissive` sibling always takes its base's zone (and page). A frame
 * the table does not cover is an error: a new frame needs a decision.
 */
export function zoneOf(name) {
  const base = emissiveOf(name) ?? name;
  if (excludedReason(base)) return null;
  if (CORE.test(base)) return "core";
  if (SURFACE.test(base)) return "surface";
  const spans = PLACEMENT[base];
  if (!spans)
    throw new Error(
      `${name}: no zone. Add it to scripts/campaign-zones.mjs (core, surface, or its placement rows).`,
    );
  const bands = new Set(bandsOf(spans).map((band) => band.slice(4)));
  const shaft = ZONES.shaft.bands.some((band) => bands.has(band));
  const cave = ZONES.cave.bands.some((band) => bands.has(band));
  return shaft && cave ? "core" : shaft ? "shaft" : "cave";
}

/** Whether a frame gets a @4x page (its base's answer for a sibling). */
export const isHero = (name) => HERO.test(emissiveOf(name) ?? name);

/**
 * The lander's milestone stage, or null. scene.ts draws one lander stage at a
 * time (min(3, completed milestones)), so each stage gets pages of its own and
 * only the current one needs to be resident.
 */
export function stageOf(name) {
  const match = /^dock-stage-(\d+)$/.exec(emissiveOf(name) ?? name);
  return match ? Number(match[1]) : null;
}

/**
 * The page set of a frame inside its zone: "hero", "stage<n>" (a lander
 * stage, also a hero set) or "" (the rest, @2x and @3x only).
 */
export function pageSet(name) {
  const stage = stageOf(name);
  return stage !== null ? `stage${stage}` : isHero(name) ? "hero" : "";
}

/** The densities a frame is paged at. */
export const densitiesOf = (frame) =>
  DENSITIES.filter(
    (density) =>
      density <= MAX_DENSITY[isHero(frame.name) ? "hero" : "plain"] &&
      !(density === 4 && frame.source === "raster"),
  );

/** "w01-core-hero-3x": the file stem of a page group (pages add "-<n>"). */
export const pageStem = (world, zone, set, density) =>
  `${world.toLowerCase()}-${zone}${set ? `-${set}` : ""}-${density}x`;

/** Zone page files of a world, as the builds name them. */
export const zonePageFile = (world) =>
  new RegExp(
    `^${world.toLowerCase()}-(${ZONE_NAMES.join("|")})(-(hero|stage\\d+))?-[234]x-\\d+\\.(png|json)$`,
  );

/**
 * The page groups of one world: every runtime frame of `frames` (a
 * frames.json list) in exactly one group per density it needs, in a fixed
 * order (zone, set: hero, lander stages, the rest; density).
 */
export function pageGroups(world, frames) {
  const runtime = frames.filter((frame) => zoneOf(frame.name));
  const sets = [
    ...new Set(["hero", ...runtime.map((frame) => pageSet(frame.name)).sort()]),
  ].filter((set) => set !== "");
  const groups = [];
  for (const zone of ZONE_NAMES)
    for (const set of [...sets, ""])
      for (const density of DENSITIES) {
        const names = runtime
          .filter(
            (frame) =>
              zoneOf(frame.name) === zone &&
              pageSet(frame.name) === set &&
              densitiesOf(frame).includes(density),
          )
          .map((frame) => frame.name);
        if (names.length)
          groups.push({
            stem: pageStem(world, zone, set, density),
            zone,
            hero: set !== "",
            ...(set.startsWith("stage") ? { stage: stageOf(names[0]) } : {}),
            density,
            frames: names,
          });
      }
  return groups;
}

/**
 * The worlds whose bands draw a zone's frames from this world's atlas: W02
 * draws W01's core and cave frames (site-*, pressure seams, cold pockets,
 * cracks, the rig), W01 draws W02's core (rig-*-2, tool-*) once W02
 * hardware is owned; surface pages stay in their own world.
 */
export function zoneWorlds(world, zone, names) {
  if (zone === "core") return ["W01", "W02"];
  if (zone === "surface") return [world];
  const worlds = new Set();
  for (const name of names)
    for (const [drawn] of PLACEMENT[emissiveOf(name) ?? name] ?? [])
      worlds.add(drawn);
  return [...worlds].sort();
}

/**
 * The manifest's description of a world's frames: frame → zone for every
 * runtime frame, the hero list, and the frames left out with the reason.
 */
export function classifyFrames(frames) {
  const zones = {},
    hero = [],
    excluded = { terrain: [], dom: [], unused: [] };
  for (const frame of frames) {
    const reason = excludedReason(frame.name);
    if (reason) {
      excluded[reason].push(frame.name);
      continue;
    }
    zones[frame.name] = zoneOf(frame.name);
    if (isHero(frame.name)) hero.push(frame.name);
  }
  return { zones, hero, excluded };
}
