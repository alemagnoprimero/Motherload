import w01Zones from "../../../assets/campaign/generated/w01-zones.json";
import w02Zones from "../../../assets/campaign/generated/w02-zones.json";
import { campaignTileSize } from "../layout";
import type { QualityTier } from "../view";

/*
 * Audit T13b, the runtime half: which zone pages are resident and which one
 * draws a frame. Pure (no Phaser), so tests can run it; render/art.ts loads
 * and unloads what it decides.
 *
 * The manifests (generated/w0X-zones.json, written by the world builds from
 * scripts/campaign-zones.mjs) list each world's zones, the zone of every
 * frame the game draws, and the pages per (zone, hero set, lander stage,
 * density). Zones and the bands they are drawn in:
 *   core     every band, in both worlds (the rig, ore, marks, markers, …)
 *   surface  band A: drawn above row 0, like the sky and the ridges
 *   shaft    bands A and B
 *   cave     bands C and D
 * W01 rows: A 0–10, B 11–29, C 30–47, D 48–59; W02: A 0–14, B 15–44,
 * C 45–74, D 75–99 (world-content.ts).
 */

export type WorldId = "W01" | "W02";
export type Density = 2 | 3 | 4;

export interface ZonePage {
  key: string;
  zone: string;
  hero: boolean;
  stage?: number;
  density: number;
  image: string;
  data: string;
  width: number;
  height: number;
  bytes: number;
  frames: string[];
}
interface ZoneInfo {
  bands: string[];
  rows: number[];
  worlds: string[];
  note: string;
  frames: number;
}
export interface ZoneManifest {
  version: number;
  world: string;
  logicalTile: number;
  maxDensity: { hero: number; plain: number };
  zones: Record<string, ZoneInfo>;
  frames: Record<string, string>;
  hero: string[];
  pages: ZonePage[];
}

export const ZONE_MANIFESTS: Readonly<Record<WorldId, ZoneManifest>> = {
  W01: w01Zones as ZoneManifest,
  W02: w02Zones as ZoneManifest,
};
export const WORLD_IDS: readonly WorldId[] = ["W01", "W02"];
export const ZONE_NAMES = ["core", "surface", "shaft", "cave"] as const;
const BAND_LETTERS = ["A", "B", "C", "D"];
/** One logical tile is 48 page px at @1x (§5.6): @2x 96, @3x 144, @4x 192. */
export const LOGICAL_TILE = 48;

/**
 * D1 (decisions.md), the T13b rule: pages are chosen by device px per tile,
 * never by pointer type. The density is the smallest page whose tile is at
 * least that many px, from @2x up to @4x for the hero set (the rig, ore and
 * hero props) and @3x for the rest.
 */
export function pageDensity(pxPerTile: number, hero: boolean): Density {
  const wanted = Math.ceil(pxPerTile / LOGICAL_TILE - 1e-6);
  return Math.min(hero ? 4 : 3, Math.max(2, wanted)) as Density;
}

/**
 * Device px per tile for page choice: the base tile (campaignTileSize, or the
 * `?tile=` debug override) times the F1 backing ceiling, min(devicePixelRatio,
 * Render quality, 2) (or the `?backing=` pin). Not the adaptive level, so an
 * F1 step never reloads pages, and not the 0.88–1.08 context zoom, which moves
 * with depth: a page swap mid-descent would buy at most 8 % of sharpness.
 */
export function devicePxPerTile(
  cssWidth: number,
  cssHeight: number,
  backingCap: number,
  tileOverride?: number,
) {
  return (tileOverride ?? campaignTileSize(cssWidth, cssHeight)) * backingCap;
}

/** The density of each page set: hero pages, and the rest per zone. */
export interface PageDensities {
  hero: Density;
  plain: Record<string, Density>;
}
export function d1Densities(pxPerTile: number): PageDensities {
  const plain = pageDensity(pxPerTile, false);
  return {
    hero: pageDensity(pxPerTile, true),
    plain: Object.fromEntries(ZONE_NAMES.map((zone) => [zone, plain])),
  };
}

const SHARED_UPGRADE =
  /^(rig-(engine|energy|bay|hull)-2|rig-drill-collar-(left|right|down)-2)$/;
/**
 * The atlas a frame is drawn from, as scene.image() always decided it: W02's
 * only for W02 frames (in W02), its tools and its shared upgrades, and only
 * when W02's manifest has the frame; W01's otherwise. Decided from the static
 * manifests, never from what is resident, so a page still loading can never
 * swap in the other world's art.
 */
export function frameOwner(frame: string, icy: boolean): WorldId {
  return (icy || frame.startsWith("tool-") || SHARED_UPGRADE.test(frame)) &&
    frame in ZONE_MANIFESTS.W02.frames
    ? "W02"
    : "W01";
}

/** The pages of one (atlas, zone, hero set, stage) at every density. */
interface PageGroup {
  key: string;
  world: WorldId;
  zone: string;
  hero: boolean;
  stage: number | undefined;
  /** Pages per density, densest first. */
  densities: [number, ZonePage[]][];
}
const groupKey = (world: string, page: ZonePage) =>
  `${world}:${page.zone}:${page.hero ? "hero" : "plain"}:${page.stage ?? ""}`;
const GROUPS: Record<WorldId, PageGroup[]> = { W01: [], W02: [] };
const GROUP_OF = new Map<string, PageGroup>();
const PAGE_WORLD = new Map<string, WorldId>();
/** "W01:rig-body-0" → the pages holding it, densest first. */
const FRAME_PAGES = new Map<string, ZonePage[]>();
for (const world of WORLD_IDS) {
  const byKey = new Map<string, PageGroup>();
  for (const page of ZONE_MANIFESTS[world].pages) {
    const key = groupKey(world, page);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        world,
        zone: page.zone,
        hero: page.hero,
        stage: page.stage,
        densities: [],
      };
      byKey.set(key, group);
      GROUPS[world].push(group);
    }
    let entry = group.densities.find(([density]) => density === page.density);
    if (!entry) group.densities.push((entry = [page.density, []]));
    entry[1].push(page);
    GROUP_OF.set(page.key, group);
    PAGE_WORLD.set(page.key, world);
    for (const frame of page.frames) {
      const list = FRAME_PAGES.get(`${world}:${frame}`) ?? [];
      list.push(page);
      list.sort((a, b) => b.density - a.density);
      FRAME_PAGES.set(`${world}:${frame}`, list);
    }
  }
  for (const group of GROUPS[world]) group.densities.sort(([a], [b]) => b - a);
}
export const ALL_PAGES: readonly ZonePage[] = WORLD_IDS.flatMap(
  (world) => ZONE_MANIFESTS[world].pages,
);
/** The pages that hold `frame` in `world`'s atlas, densest first. */
export function framePages(world: WorldId, frame: string) {
  return FRAME_PAGES.get(`${world}:${frame}`) ?? [];
}
export function pageWorld(key: string) {
  return PAGE_WORLD.get(key);
}
export function pageByKey(key: string) {
  return GROUP_OF.get(key)
    ?.densities.flatMap(([, pages]) => pages)
    .find((page) => page.key === key);
}
/** The pages of `page`'s group at each density, densest first. */
export function siblingPages(key: string) {
  return GROUP_OF.get(key)?.densities ?? [];
}
/** A group's pages at the densest density ≤ `want` (else its lowest). */
function pagesAt(group: PageGroup, want: number) {
  return (
    group.densities.find(([density]) => density <= want)?.[1] ??
    group.densities[group.densities.length - 1]![1]
  );
}

export interface PlanInput {
  /** The world being played. */
  world: WorldId;
  /** The rig's band in that world, 0..3 (A..D). */
  band: number;
  /** Below row 1 the band's neighbours stream too (as the band pages do). */
  neighbours: boolean;
  /** W02's core: W02 is current or its hardware is owned (state.worlds.W02). */
  w02: boolean;
  /** The current world's lander stage (scene.ts: min(3, milestones)). */
  stage: number;
  densities: PageDensities;
}
export interface PagePlan {
  /** Bands A..D the plan covers: the rig's band ±1. */
  window: string[];
  /** Every page to keep resident. */
  pages: ZonePage[];
  /**
   * The pages the scene waits for before it draws (art.ready): the cores and
   * the zones of the rig's own band with its lander stage. Neighbour zones and
   * the next lander stage stream ahead without stopping the game, so crossing
   * a band or finishing a construction never pauses it.
   */
  gate: ZonePage[];
  /** The current world's sky and ridges (band A, as its surface pages). */
  backgrounds: boolean;
  backgroundsGate: boolean;
}

/**
 * The resident set (D-d): W01's core, W02's core when W02 is current or owned
 * (the rig draws its upgrades and tools from it in W01 too), and the zone
 * pages of the rig's band ±1 that the current world draws (W02's cave bands
 * draw W01's cave frames). Surface pages hold the current lander stage and
 * the next one, so a finished construction is already resident.
 */
export function planPages(input: PlanInput): PagePlan {
  const reach = input.neighbours ? 1 : 0;
  const window = BAND_LETTERS.slice(
    Math.max(0, input.band - reach),
    Math.min(3, input.band + reach) + 1,
  );
  const own = BAND_LETTERS[Math.max(0, Math.min(3, input.band))]!;
  const stages = new Set([input.stage, Math.min(3, input.stage + 1)]);
  const pages: ZonePage[] = [],
    gate: ZonePage[] = [];
  const atlases: WorldId[] =
    input.w02 || input.world === "W02" ? ["W01", "W02"] : ["W01"];
  for (const atlas of atlases)
    for (const group of GROUPS[atlas]) {
      const zone = ZONE_MANIFESTS[atlas].zones[group.zone];
      let waits = true;
      if (group.zone !== "core") {
        if (!zone || !zone.worlds.includes(input.world)) continue;
        if (!zone.bands.some((band) => window.includes(band))) continue;
        waits = zone.bands.includes(own);
        if (group.stage !== undefined) {
          if (!stages.has(group.stage)) continue;
          waits &&= group.stage === input.stage;
        }
      }
      const chosen = pagesAt(
        group,
        group.hero
          ? input.densities.hero
          : (input.densities.plain[group.zone] ?? 2),
      );
      pages.push(...chosen);
      if (waits) gate.push(...chosen);
    }
  return {
    window,
    pages,
    gate,
    backgrounds: window.includes("A"),
    backgroundsGate: own === "A",
  };
}

/** Decoded bytes of a page list. */
export const pageBytes = (pages: readonly ZonePage[]) =>
  pages.reduce((sum, page) => sum + page.bytes, 0);

const MiB = 2 ** 20;
/**
 * §7 resident budgets per form. The form comes from F1's render tier, never
 * from the pointer: High (WebGL with highp on a fine pointer) has the desktop
 * 64 MiB; Medium and Low have the phone's 20 MiB at boot (taken as band A,
 * the surface and the first shaft band) and 40 MiB in play.
 */
export function memoryBudget(tier: QualityTier, boot: boolean) {
  if (tier === "high") return 64 * MiB;
  return (boot ? 20 : 40) * MiB;
}
/** A band's pages as resident: soil and rock @2x (768²), the wall at 384². */
export const BAND_BYTES = (768 * 768 * 2 + 384 * 384) * 4;
/** One world's sky (512 × 256) and two ridge layers (1024 × 384). */
export const BACKGROUND_BYTES = (512 * 256 + 1024 * 384 * 2) * 4;
/** Light pixels per CSS pixel of the light map (render/lighting.ts). */
export const LIGHT_MAP_SCALE = 0.25;
/**
 * The small canvases the projection does not size one by one: the T1-lite
 * headlamp (64 KiB), sky gradients, glints and Phaser's defaults (about
 * 0.1 MiB together), with room to spare.
 */
export const SMALL_TEXTURE_BYTES = 0.25 * MiB;

export interface GuardResult {
  densities: PageDensities;
  plan: PagePlan;
  /** Projected resident bytes with the plan's pages. */
  projected: number;
  /** Zones whose non-hero pages the guard stepped down, in order. */
  stepped: string[];
}
/**
 * The T13b budget guard (decisions.md D1): when the pages D1 asks for would
 * take the projected resident bytes over the form's budget, step non-hero
 * zones down to @2x, the step that saves most first, until they fit or none
 * is left. Hero pages (the rig, ore and hero props) keep their D1 density.
 * `fixedBytes` is everything but the atlas pages: render layers, band pages
 * and backgrounds, projected for the same position.
 */
export function guardDensities(
  densities: PageDensities,
  budget: number,
  fixedBytes: number,
  plan: (densities: PageDensities) => PagePlan,
): GuardResult {
  let current = plan(densities);
  let projected = fixedBytes + pageBytes(current.pages);
  const stepped: string[] = [];
  while (projected > budget) {
    let best:
      | {
          zone: string;
          densities: PageDensities;
          plan: PagePlan;
          bytes: number;
        }
      | undefined;
    for (const zone of ZONE_NAMES) {
      const from = densities.plain[zone] ?? 2;
      if (from <= 2) continue;
      const trial: PageDensities = {
        hero: densities.hero,
        plain: { ...densities.plain, [zone]: (from - 1) as Density },
      };
      const trialPlan = plan(trial);
      const bytes = fixedBytes + pageBytes(trialPlan.pages);
      if (bytes < projected && (!best || bytes < best.bytes))
        best = { zone, densities: trial, plan: trialPlan, bytes };
    }
    if (!best) break;
    densities = best.densities;
    current = best.plan;
    projected = best.bytes;
    stepped.push(best.zone);
  }
  return { densities, plan: current, projected, stepped };
}

/** The F1 readout's texture groups. */
export type TextureGroup = "atlas" | "bands" | "bg" | "layers" | "other";
export const TEXTURE_GROUPS: readonly TextureGroup[] = [
  "atlas",
  "bands",
  "bg",
  "layers",
  "other",
];
/**
 * atlas: zone pages; bands: band material pages; bg: the streamed sky and
 * ridges; layers: render layers (retained terrain, light map, T1-lite);
 * other: everything else (gradients, glints, Phaser's defaults).
 */
export function textureGroup(key: string): TextureGroup {
  if (PAGE_WORLD.has(key) || /^campaign-w0[12]-/.test(key)) return "atlas";
  if (key.startsWith("band-")) return "bands";
  if (/^(campaign|frontier)-(sky|ridge-far|ridge-near)$/.test(key)) return "bg";
  if (/^campaign-(retained-terrain|light-map|t1-lite-.+)$/.test(key))
    return "layers";
  return "other";
}

/** Where the rig is, for the readout: the surface, the shaft or the cave. */
export function rigZone(band: number, row: number) {
  if (band >= 2) return "cave";
  return band === 0 && row <= 1 ? "surface" : "shaft";
}
