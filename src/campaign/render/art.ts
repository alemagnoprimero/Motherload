import type Phaser from "phaser";
import type { Campaign } from "../model";
import type { QualityTier } from "../view";
import { RENDER_BANDS, renderBand } from "./bands";
import {
  ALL_PAGES,
  BACKGROUND_BYTES,
  BAND_BYTES,
  ZONE_MANIFESTS,
  d1Densities,
  frameOwner,
  framePages,
  guardDensities,
  memoryBudget,
  pageWorld,
  planPages,
  siblingPages,
  type GuardResult,
  type WorldId,
  type ZonePage,
} from "./zones";
const asset = (name: string) =>
  new URL(`../../../assets/campaign/generated/${name}`, import.meta.url).href;
const materialAsset = (name: string) =>
  new URL(`../../../assets/campaign/generated/bands/${name}`, import.meta.url)
    .href;
export const WORLD_ART = {
  W01: { prefix: "campaign", file: "w01" },
  W02: { prefix: "frontier", file: "w02" },
};
// Art item A4, interim until T7 adds the far (0.2) parallax slot: W01's 0.35
// slot ("ridge-far") shows the mid ridge layer, which stands on the page's
// bottom edge as that slot does. w01-ridge-far.png waits for T7.
const BACKGROUND_FILES: Record<string, Record<string, string>> = {
  W01: { "ridge-far": "ridge-mid" },
};
const BACKGROUND_PARTS = ["sky", "ridge-far", "ridge-near"] as const;
/** A world's three streamed background keys (campaign-sky, frontier-…). */
export const backgroundKeys = (world: string) =>
  BACKGROUND_PARTS.map(
    (part) => WORLD_ART[world === "W02" ? "W02" : "W01"].prefix + "-" + part,
  );

/** What the scene knows of the screen, for page choice and the budget guard. */
export interface ArtLayout {
  /** Device px per tile (zones.ts devicePxPerTile). */
  pxPerTile: number;
  /** F1's render tier: the §7 form whose budget the guard keeps. */
  tier: QualityTier;
  /** Projected bytes of the render layers (terrain, light map, small canvases). */
  layerBytes: number;
  /**
   * Rows surely on screen above and below the rig, whatever the context zoom
   * and look-ahead (scene.ts artLayout); the jump gate waits for their zones.
   */
  viewRows?: { above: number; below: number };
}
type Resolved = GuardResult & {
  signature: string;
  world: WorldId;
  band: number;
  row: number;
  budget: number;
  boot: boolean;
};
/** A move of more rows than this between drawn frames is a jump (scene.ts fades in). */
const JUMP_ROWS = 8;

/**
 * Audit T13b: the zone pages (render/zones.ts decides which), the current
 * world's sky and ridges, and the band pages stream with the rig. A page that
 * becomes required loads first; a page it replaces (another density of the
 * same pages) is removed only once the new one is resident, inside update(),
 * before anything is drawn.
 *
 * The budget guard's form budget is the boot one only at the dock until the
 * rig first leaves it, and its steps last for the session in that world, form
 * and D1 density (a ratchet): densities never step back up mid-play, so a
 * descent and a climb load each page at most once per density.
 */
export class CampaignArt {
  private pending = new Set<string>();
  private materialKeys = new Set<string>();
  private required = new Set<string>();
  /** Harness holds (hold()): pages kept resident whatever the plan says. */
  private held = new Map<string, ZonePage>();
  private holds: { keys: string[]; resolve: () => void }[] = [];
  private layout: ArtLayout | undefined;
  private resolved: Resolved | undefined;
  /** At the dock since the scene started: the §7 boot budget applies. */
  private booting = true;
  /** The guard's steps so far, for one world, tier and D1 density. */
  private ratchet = { key: "", zones: [] as string[] };
  /** Where the scene last drew; a move of more than JUMP_ROWS from it is a jump. */
  private drawnAt: { world: WorldId; row: number } | undefined;
  constructor(private scene: Phaser.Scene) {}
  preload(campaign: Campaign, layout: ArtLayout) {
    this.layout = layout;
    const at = this.position(campaign),
      plan = this.resolve(campaign)!.plan;
    this.queuePages(plan.pages);
    if (plan.backgrounds) this.queueBackgrounds(at.world);
    this.queueBands(at.world, at.row, 2, false);
  }
  /** The rig's world, band and row, and what the plan depends on. */
  private position(campaign: Campaign) {
    const world: WorldId = campaign.world.id === "W02" ? "W02" : "W01";
    const row = campaign.state.vehicle.y;
    const bands = RENDER_BANDS[world] ?? RENDER_BANDS.W01!;
    const current = renderBand(world, row).id;
    return {
      world,
      row,
      band: Math.max(
        0,
        bands.findIndex((band) => band.id === current),
      ),
      neighbours: row > 1,
      w02: world === "W02" || Boolean(campaign.state.worlds.W02),
      stage: Math.min(3, campaign.completedMilestones.length),
    };
  }
  /** D1 densities, the plan and the budget guard, kept until an input changes. */
  private resolve(campaign: Campaign) {
    const layout = this.layout;
    if (!layout) return undefined;
    const at = this.position(campaign);
    if (at.neighbours) this.booting = false;
    const boot = this.booting;
    const base = d1Densities(layout.pxPerTile);
    const ratchetKey = [at.world, layout.tier, base.hero, base.plain.core].join(
      ":",
    );
    if (this.ratchet.key !== ratchetKey)
      this.ratchet = { key: ratchetKey, zones: [] };
    const carried = this.ratchet.zones;
    const signatureOf = (zones: readonly string[]) =>
      [
        at.world,
        at.band,
        at.neighbours,
        at.w02,
        at.stage,
        layout.pxPerTile,
        layout.tier,
        layout.layerBytes,
        boot,
        zones.join(","),
      ].join(":");
    if (this.resolved?.signature === signatureOf(carried)) {
      this.resolved.row = at.row;
      return this.resolved;
    }
    const plan = (densities: GuardResult["densities"]) =>
      planPages({ ...at, densities });
    // Zones the guard stepped earlier stay at @2x (the ratchet).
    const start: GuardResult["densities"] = {
      hero: base.hero,
      plain: {
        ...base.plain,
        ...Object.fromEntries(carried.map((zone) => [zone, 2 as const])),
      },
    };
    const first = plan(start);
    // Everything but the atlas pages, projected for this position: render
    // layers, the band pages art.ts streams (the same window) and the sky.
    const fixed =
      layout.layerBytes +
      first.window.length * BAND_BYTES +
      (first.backgrounds ? BACKGROUND_BYTES : 0);
    const budget = memoryBudget(layout.tier, boot);
    const guard = guardDensities(start, budget, fixed, plan);
    this.ratchet.zones = [...carried, ...guard.stepped];
    this.resolved = {
      ...guard,
      stepped: this.ratchet.zones,
      // Starting from the new ratchet gives this same result.
      signature: signatureOf(this.ratchet.zones),
      world: at.world,
      band: at.band,
      row: at.row,
      budget,
      boot,
    };
    return this.resolved;
  }
  private queuePages(pages: Iterable<ZonePage>) {
    for (const page of pages) {
      if (this.scene.textures.exists(page.key) || this.pending.has(page.key))
        continue;
      this.pending.add(page.key);
      this.scene.load.atlas(page.key, asset(page.image), asset(page.data));
    }
  }
  private queueBackgrounds(id: string) {
    const worldId = id === "W02" ? "W02" : "W01";
    const world = WORLD_ART[worldId];
    for (const part of BACKGROUND_PARTS) {
      const key = world.prefix + "-" + part;
      if (this.scene.textures.exists(key) || this.pending.has(key)) continue;
      this.pending.add(key);
      const file = BACKGROUND_FILES[worldId]?.[part] ?? part;
      this.scene.load.image(
        key,
        asset(
          world.file + "-" + file + (part === "sky" ? "-runtime" : "") + ".png",
        ),
      );
    }
  }
  private queueBands(
    id: string,
    row: number,
    scale: number,
    neighbours: boolean,
  ) {
    const bands = RENDER_BANDS[id] ?? RENDER_BANDS.W01!,
      current = renderBand(id, row),
      index = bands.findIndex((b) => b.id === current.id);
    this.required.clear();
    for (
      let n = Math.max(0, index - (neighbours ? 1 : 0));
      n <= Math.min(3, index + (neighbours ? 1 : 0));
      n++
    )
      for (const material of ["soil", "rock", "wall"]) {
        const band = bands[n]!,
          key = `band-${id}-${band.id}-${material}`;
        this.required.add(key);
        if (this.scene.textures.exists(key) || this.pending.has(key)) continue;
        this.pending.add(key);
        this.materialKeys.add(key);
        this.scene.load.image(
          key,
          materialAsset(
            `${id.toLowerCase()}-${band.id}-${material}-${scale}x.png`,
          ),
        );
      }
  }
  private complete() {
    let bands = false;
    for (const key of this.pending) {
      if (!this.materialKeys.has(key)) continue;
      bands = true;
      // Back walls intentionally use a lower-frequency page; foreground art stays native scale.
      if (key.endsWith("-wall") && this.scene.textures.exists(key)) {
        const old = this.scene.textures
          .get(key)
          .getSourceImage() as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = 384;
        canvas.height = 384;
        canvas.getContext("2d")!.drawImage(old, 0, 0, 384, 384);
        this.scene.textures.remove(key);
        this.scene.textures.addCanvas(key, canvas);
      }
    }
    this.pending.clear();
    // The retained terrain rebuilds its patterns when band pages change.
    if (bands) this.scene.registry.inc("band-assets-revision");
    this.settleHolds();
  }
  /** A page, or the same pages at another density, is resident. */
  private drawable(page: ZonePage) {
    return (
      this.scene.textures.exists(page.key) ||
      siblingPages(page.key).some(([, pages]) =>
        pages.every((sibling) => this.scene.textures.exists(sibling.key)),
      )
    );
  }
  /**
   * The scene draws once the cores and the zones of the rig's own band are
   * resident (at any density while a swap loads), with the sky and ridges in
   * band A; neighbour bands and the next lander stage stream ahead, so
   * continuous play never waits on them. After a jump (another world, or more
   * than JUMP_ROWS rows from where the scene last drew: an import, travel, a
   * respawn, where the scene fades in) it also waits for the zones of the
   * bands surely on screen (ArtLayout.viewRows), so a neighbour zone's frames
   * in view never pop in; zones that may be off screen still stream.
   */
  ready(campaign: Campaign) {
    const resolved = this.resolve(campaign);
    if (!resolved) return false;
    const jump =
      this.drawnAt !== undefined &&
      (this.drawnAt.world !== resolved.world ||
        Math.abs(resolved.row - this.drawnAt.row) > JUMP_ROWS);
    const plan = resolved.plan;
    let gate = plan.gate,
      backgrounds = plan.backgroundsGate;
    if (jump) {
      const visible = this.visibleBands(resolved.world, resolved.row);
      const stage = this.position(campaign).stage;
      gate = plan.pages.filter((page) => {
        if (plan.gate.includes(page)) return true;
        const zone =
          ZONE_MANIFESTS[pageWorld(page.key) ?? "W01"].zones[page.zone];
        return (
          Boolean(zone?.bands.some((band) => visible.includes(band))) &&
          (page.stage === undefined || page.stage === stage)
        );
      });
      backgrounds ||= plan.backgrounds && visible.includes("A");
    }
    if (!gate.every((page) => this.drawable(page))) return false;
    if (
      backgrounds &&
      !backgroundKeys(resolved.world).every((key) =>
        this.scene.textures.exists(key),
      )
    )
      return false;
    // The scene draws this frame from here.
    this.drawnAt = { world: resolved.world, row: resolved.row };
    return true;
  }
  /** Bands A..D of the rows surely on screen around the rig at `row`. */
  private visibleBands(world: WorldId, row: number) {
    const rows = this.layout?.viewRows ?? { above: 0, below: 0 };
    const bands = RENDER_BANDS[world] ?? RENDER_BANDS.W01!;
    const index = (at: number) =>
      Math.max(
        0,
        bands.findIndex((band) => band.id === renderBand(world, at).id),
      );
    const first = index(Math.max(0, row - rows.above)),
      last = index(row + rows.below);
    return ["A", "B", "C", "D"].slice(first, last + 1);
  }
  /** The core pages of every atlas in play are resident (create()). */
  coreReady(campaign: Campaign) {
    const plan = this.resolve(campaign)?.plan;
    return Boolean(
      plan?.pages
        .filter((page) => page.zone === "core")
        .every((page) => this.drawable(page)),
    );
  }
  /** Frames of `names` missing from `world`'s manifest (create()). */
  missingFrames(world: WorldId, names: readonly string[]) {
    return names.filter((name) => !(name in ZONE_MANIFESTS[world].frames));
  }
  update(campaign: Campaign, layout: ArtLayout) {
    this.layout = layout;
    this.settleHolds();
    if (this.scene.load.isLoading()) return;
    const at = this.position(campaign),
      plan = this.resolve(campaign)!.plan;
    this.queuePages([...plan.pages, ...this.held.values()]);
    if (plan.backgrounds) this.queueBackgrounds(at.world);
    this.queueBands(at.world, at.row, 2, at.neighbours);
    if (this.pending.size) {
      this.scene.load.once("complete", () => this.complete());
      this.scene.load.start();
    }
    for (const key of this.materialKeys) {
      if (!this.required.has(key) && !this.pending.has(key)) {
        this.scene.textures.remove(key);
        this.materialKeys.delete(key);
        this.scene.registry.inc("band-assets-revision");
      }
    }
    // While the scene waits (ready() false) it keeps last frame's sprites on
    // screen, so nothing they draw from may go until it draws again.
    if (!this.ready(campaign)) return;
    // Swap, then remove: a page leaves once nothing needs it, and a page
    // another density replaces only once that density is resident.
    const keep = new Set(
      [...plan.pages, ...this.held.values()].map((page) => page.key),
    );
    for (const page of ALL_PAGES) {
      if (
        keep.has(page.key) ||
        this.pending.has(page.key) ||
        !this.scene.textures.exists(page.key)
      )
        continue;
      const replacing = siblingPages(page.key).some(([, pages]) =>
        pages.some(
          (sibling) =>
            keep.has(sibling.key) && !this.scene.textures.exists(sibling.key),
        ),
      );
      if (!replacing) this.scene.textures.remove(page.key);
    }
    // The sky and ridges belong with band A, as the surface pages do.
    for (const world of ["W01", "W02"])
      if (world !== at.world || !plan.backgrounds)
        for (const key of backgroundKeys(world))
          if (this.scene.textures.exists(key) && !this.pending.has(key))
            this.scene.textures.remove(key);
  }
  created() {
    this.complete();
  }
  /**
   * The resident page that draws `frame` from `worldId`'s atlas: the page at
   * the planned density (or `quality`, capped at the page set's maximum),
   * else the densest resident one while a swap loads; undefined when none is.
   */
  textureFor(frame: string, worldId: string, quality?: number) {
    const densities = this.resolved?.densities;
    let fallback: string | undefined;
    for (const page of framePages(worldId === "W02" ? "W02" : "W01", frame)) {
      if (!this.scene.textures.exists(page.key)) continue;
      const wanted =
        quality !== undefined
          ? Math.min(quality, page.hero ? 4 : 3)
          : page.hero
            ? densities?.hero
            : densities?.plain[page.zone];
      if (page.density === wanted) return page.key;
      fallback ??= page.key;
    }
    return fallback;
  }
  /** The atlas `frame` is drawn from in `currentWorld` (zones.ts frameOwner). */
  owner(frame: string, currentWorld: string) {
    return frameOwner(frame, currentWorld === "W02");
  }
  /** Densities, the guard's steps and the projection, for the readout. */
  state() {
    const resolved = this.resolved;
    return resolved
      ? {
          world: resolved.world,
          band: resolved.band,
          row: resolved.row,
          densities: resolved.densities,
          stepped: resolved.stepped,
          projected: resolved.projected,
          budget: resolved.budget,
          boot: resolved.boot,
          fits: resolved.fits,
        }
      : undefined;
  }
  /**
   * Harness hook (surface-render-smoke), never called by the game: keeps the
   * pages that draw `frames` in `currentWorld` resident, at the planned
   * densities, until release(), and resolves once they are, so a check can
   * draw frames the plan does not need right now.
   */
  hold(frames: readonly string[], currentWorld: string) {
    const densities = this.resolved?.densities,
      keys: string[] = [];
    for (const frame of frames) {
      const pages = framePages(this.owner(frame, currentWorld), frame);
      const page =
        pages.find(
          (page) =>
            page.density ===
            (page.hero ? densities?.hero : densities?.plain[page.zone]),
        ) ?? pages[0];
      if (!page) continue;
      this.held.set(page.key, page);
      keys.push(page.key);
    }
    return new Promise<void>((resolve) => {
      this.holds.push({ keys, resolve });
      this.settleHolds();
    });
  }
  /** Harness hook: ends every hold(); the plan decides those pages again. */
  release() {
    this.held.clear();
  }
  private settleHolds() {
    this.holds = this.holds.filter((hold) => {
      if (!hold.keys.every((key) => this.scene.textures.exists(key)))
        return true;
      hold.resolve();
      return false;
    });
  }
}
