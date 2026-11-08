import Phaser from "phaser";
import type { Campaign } from "../model";
import { RENDER_BANDS, renderBand } from "./bands";
const asset = (name: string) =>
  new URL(`../../../assets/campaign/generated/${name}`, import.meta.url).href;
const materialAsset = (name: string) =>
  new URL(`../../../assets/campaign/generated/bands/${name}`, import.meta.url)
    .href;
export const WORLD_ART = {
  W01: { atlas: "campaign-w01", prefix: "campaign", file: "w01" },
  W02: { atlas: "campaign-w02", prefix: "frontier", file: "w02" },
};
// Art item A4, interim until T7 adds the far (0.2) parallax slot: W01's 0.35
// slot ("ridge-far") shows the mid ridge layer, which stands on the page's
// bottom edge as that slot does. w01-ridge-far.png waits for T7.
const BACKGROUND_FILES: Record<string, Record<string, string>> = {
  W01: { "ridge-far": "ridge-mid" },
};

/** Current world art and neighbouring strata stream independently of saved world data. */
export class CampaignArt {
  private pending = new Set<string>();
  private materialKeys = new Set<string>();
  private highPages = new Map<string, string[]>();
  private highLoading = new Set<string>();
  private required = new Set<string>();
  constructor(private scene: Phaser.Scene) {}
  preload(campaign: Campaign) {
    this.queueAtlas("W01");
    if (campaign.world.id === "W02" || campaign.state.worlds.W02)
      this.queueAtlas("W02");
    this.queueBackgrounds(campaign.world.id);
    this.queueBands(campaign.world.id, campaign.state.vehicle.y, 2, false);
  }
  private queueAtlas(id: string) {
    const world = WORLD_ART[id === "W02" ? "W02" : "W01"];
    if (
      this.scene.textures.exists(world.atlas) ||
      this.pending.has(world.atlas)
    )
      return;
    this.pending.add(world.atlas);
    this.scene.load.atlas(
      world.atlas,
      asset(world.file + "-runtime.png"),
      asset(world.file + "-runtime.json"),
    );
  }
  private queueBackgrounds(id: string) {
    const worldId = id === "W02" ? "W02" : "W01";
    const world = WORLD_ART[worldId];
    for (const part of ["sky", "ridge-far", "ridge-near"]) {
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
    for (const key of this.pending) {
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
    this.scene.registry.inc("band-assets-revision");
  }
  ready(campaign: Campaign) {
    const world = WORLD_ART[campaign.world.id === "W02" ? "W02" : "W01"];
    return (
      this.scene.textures.exists(world.atlas) &&
      this.scene.textures.exists(world.prefix + "-sky")
    );
  }
  update(campaign: Campaign, quality: number) {
    if (this.scene.load.isLoading()) return;
    this.queueAtlas("W01");
    if (campaign.world.id === "W02" || campaign.state.worlds.W02)
      this.queueAtlas("W02");
    this.queueBackgrounds(campaign.world.id);
    if (this.ready(campaign)) {
      const other = campaign.world.id === "W02" ? "campaign" : "frontier";
      for (const part of ["sky", "ridge-far", "ridge-near"])
        if (this.scene.textures.exists(other + "-" + part))
          this.scene.textures.remove(other + "-" + part);
    }
    const coarse = matchMedia("(pointer: coarse)").matches;
    this.queueBands(
      campaign.world.id,
      campaign.state.vehicle.y,
      // The retained terrain samples at at most 1.5x. Native 2x macro pages
      // cover that raster; 3x sprite pages remain independent and crisp.
      2,
      campaign.state.vehicle.y > 1,
    );
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
    if (quality === 3 && !coarse) this.loadHigh(campaign.world.id);
  }
  created() {
    this.complete();
  }
  private async loadHigh(worldId: string) {
    const id = worldId === "W02" ? "W02" : "W01";
    if (this.highLoading.has(id) || this.highPages.has(id)) return;
    this.highLoading.add(id);
    try {
      const info = await fetch(
        asset(id.toLowerCase() + "-pages-runtime-3x.json"),
      ).then((response) => {
        if (!response.ok) throw new Error("Atlas manifest unavailable");
        return response.json();
      });
      // Queue into the same loader; no duplicate texture family or frame assumptions.
      const keys: string[] = [];
      for (const [index, page] of info.pages.entries()) {
        const key = WORLD_ART[id].atlas + "-3x-" + index;
        keys.push(key);
        this.scene.load.atlas(key, asset(page.image), asset(page.data));
      }
      this.scene.load.once("complete", () => {
        this.highPages.set(id, keys);
        this.highLoading.delete(id);
      });
      if (!this.scene.load.isLoading()) this.scene.load.start();
    } catch {
      this.highLoading.delete(id);
    }
  }
  textureFor(frame: string, worldId: string, quality: number) {
    if (quality === 3)
      for (const key of this.highPages.get(worldId) ?? [])
        if (this.scene.textures.get(key).has(frame)) return key;
    return undefined;
  }
}
