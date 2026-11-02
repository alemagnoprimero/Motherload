import Phaser from "phaser";
import type { Campaign } from "../model";
import type { CampaignView } from "../view";
import { renderBand } from "./bands";

/** Canvas compositing is the reference implementation for both Phaser renderers. */
export class CampaignLighting {
  private texture: Phaser.Textures.CanvasTexture;
  private fog: HTMLCanvasElement;
  private image: Phaser.GameObjects.Image;
  private last = "";
  bytes = 0;
  constructor(private scene: Phaser.Scene) {
    this.texture = scene.textures.createCanvas("campaign-light-map", 1, 1)!;
    this.fog = document.createElement("canvas");
    this.image = scene.add
      .image(0, 0, this.texture.key)
      .setOrigin(0)
      .setDepth(17);
  }
  render(
    campaign: Campaign,
    view: CampaignView,
    reducedMotion: boolean,
    highContrast: boolean,
  ) {
    const scale = 0.25,
      w = Math.ceil(view.width * scale),
      h = Math.ceil(view.height * scale);
    if (this.texture.width !== w || this.texture.height !== h) {
      this.texture.setSize(w, h);
      this.fog.width = w;
      this.fog.height = h;
      this.last = "";
    }
    this.bytes = w * h * 8;
    const signature = [
      campaign.world.id,
      campaign.world.seed,
      view.scrollX.toFixed(1),
      view.scrollY.toFixed(1),
      view.tile,
      campaign.renderX.toFixed(2),
      campaign.renderY.toFixed(2),
      campaign.facing,
      campaign.drillDirection,
      campaign.state.stats.mined,
      highContrast,
      reducedMotion,
    ].join(":");
    if (signature === this.last) return;
    this.last = signature;
    const ctx = this.texture.context,
      fog = this.fog.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    fog.clearRect(0, 0, w, h);
    const tile = view.tile * scale,
      world = campaign.world;
    const firstX = Math.floor(view.scrollX / view.tile) - 1,
      lastX = Math.ceil((view.scrollX + view.width) / view.tile) + 1;
    const firstY = Math.max(0, Math.floor(view.scrollY / view.tile) - 1),
      lastY = Math.min(
        world.rows,
        Math.ceil((view.scrollY + view.height) / view.tile) + 1,
      );
    const wrap = (x: number) => ((x % world.width) + world.width) % world.width;
    for (let row = firstY; row <= lastY; row++)
      for (let column = firstX; column <= lastX; column++) {
        const known = row >= world.rows || campaign.isKnown(wrap(column), row),
          visible = known && campaign.isVisible(wrap(column), row);
        const ambient = renderBand(world.id, row).ambient;
        // Unknown rock stays legible at depth; darkness describes known space without revealing hidden geology.
        const darkness = !known
          ? 0.16
          : visible
            ? (1 - ambient) * 0.72
            : Math.min(0.52, (1 - ambient) * 0.72 + 0.14);
        fog.fillStyle = `rgba(5,9,13,${highContrast ? darkness * 0.65 : darkness})`;
        fog.fillRect(
          (column * view.tile - view.scrollX) * scale,
          (row * view.tile - view.scrollY) * scale,
          tile + 0.5,
          tile + 0.5,
        );
      }
    ctx.filter = `blur(${Math.max(2, tile * 0.35)}px)`;
    ctx.drawImage(this.fog, 0, 0);
    ctx.filter = "none";
    const px = view.width * 0.5 * scale;
    // Rig X uses the same wrapped nearest representative as the camera.
    const canonicalCenter = (view.scrollX + view.width / 2) / view.tile;
    const nearestX =
      campaign.renderX +
      Math.round((canonicalCenter - campaign.renderX) / world.width) *
        world.width;
    const point = view.worldToScreen(nearestX, campaign.renderY),
      x = point.x * scale,
      y = point.y * scale;
    ctx.globalCompositeOperation = "destination-out";
    const radial = ctx.createRadialGradient(
      x,
      y,
      tile * 0.15,
      x,
      y,
      tile * 3.8,
    );
    radial.addColorStop(0, "rgba(0,0,0,.96)");
    radial.addColorStop(0.4, "rgba(0,0,0,.7)");
    radial.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(x - tile * 4, y - tile * 4, tile * 8, tile * 8);
    const direction =
      campaign.drillDirection === "down"
        ? Math.PI / 2
        : campaign.facing === "left"
          ? Math.PI
          : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(direction);
    ctx.beginPath();
    ctx.moveTo(-tile * 0.2, 0);
    ctx.arc(0, 0, tile * 5.5, -0.49, 0.49);
    ctx.closePath();
    ctx.clip();
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, tile * 5.5);
    cone.addColorStop(0, "rgba(0,0,0,.85)");
    cone.addColorStop(0.5, "rgba(0,0,0,.55)");
    cone.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cone;
    ctx.fillRect(0, -tile * 3, tile * 6, tile * 6);
    ctx.restore();
    for (const item of world.packages) {
      if (
        (item.status !== "deposit" && item.status !== "exposed") ||
        !campaign.isVisible(Math.floor(item.x), Math.floor(item.y))
      )
        continue;
      const tier = Number(item.itemId.match(/O([1-4])$/)?.[1] ?? 0);
      if (tier < 3) continue;
      const nearest =
        item.x +
        Math.round((canonicalCenter - item.x) / world.width) * world.width;
      const point = view.worldToScreen(nearest, item.y),
        gx = point.x * scale,
        gy = point.y * scale;
      if (gx < 0 || gx > w || gy < 0 || gy > h) continue;
      const brush = ctx.createRadialGradient(gx, gy, 0, gx, gy, tile * 0.8);
      brush.addColorStop(0, "rgba(0,0,0,.55)");
      brush.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = brush;
      ctx.fillRect(gx - tile, gy - tile, tile * 2, tile * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    this.texture.refresh();
    const skyRows = Math.max(0, Math.min(h, Math.floor(-view.scrollY * scale)));
    this.image
      .setDisplaySize(view.width, view.height)
      .setCrop(0, skyRows, w, h - skyRows)
      .setVisible(skyRows < h);
    void px;
  }
  destroy() {
    this.image.destroy();
    this.scene.textures.remove(this.texture.key);
  }
}
