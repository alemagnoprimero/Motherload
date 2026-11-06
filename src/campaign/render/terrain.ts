import Phaser from "phaser";
import type { Campaign } from "../model";
import type { CampaignView } from "../view";
import { renderBand } from "./bands";
import { campaignTileSize } from "../layout";

/** Retains one buffered visible grid; untouched cells are never redrawn or re-uploaded. */
export class RetainedTerrain {
  private texture: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private signatures = new Map<number, string>();
  private originX = 0;
  private originY = 0;
  private columns = 0;
  private rows = 0;
  private signature = "";
  private patterns = new Map<string, CanvasPattern>();
  private patternRevision = "";
  draws = 0;
  dirtyCells = 0;
  bytes = 0;
  constructor(private scene: Phaser.Scene) {
    this.texture = scene.textures.createCanvas(
      "campaign-retained-terrain",
      1,
      1,
    )!;
    this.image = scene.add
      .image(0, 0, this.texture.key)
      .setOrigin(0)
      .setDepth(10);
  }
  invalidate() {
    this.signature = "";
    this.patternRevision = "";
  }
  render(campaign: Campaign, view: CampaignView, highContrast: boolean) {
    const world = campaign.world,
      baseTile = campaignTileSize(view.width, view.height),
      coarse = matchMedia("(pointer: coarse)").matches,
      dpr = Math.min(view.dpr, 1.5),
      // Camera zoom scales the retained image; it never resizes or rerasterizes
      // the material canvas. Whole raster pixels also make scrolling copies exact.
      tile = Math.round(baseTile * (coarse ? 0.88 : 1) * dpr) / dpr;
    const padding = coarse ? 4 : 3;
    const columns = Math.ceil(view.width / (baseTile * 0.88)) + padding,
      rows = Math.ceil(view.height / (baseTile * 0.88)) + padding;
    const firstX = Math.floor(view.scrollX / view.tile),
      firstY = Math.floor(view.scrollY / view.tile),
      lastX = Math.ceil((view.scrollX + view.width) / view.tile),
      lastY = Math.ceil((view.scrollY + view.height) / view.tile);
    const signature = [
      world.id,
      world.seed,
      columns,
      rows,
      tile,
      dpr,
      highContrast,
    ].join(":");
    const changed = signature !== this.signature;
    const shiftX =
        firstX < this.originX + 1 || lastX > this.originX + columns - 1,
      shiftY = firstY < this.originY + 1 || lastY > this.originY + rows - 1;
    const originX = changed || shiftX ? firstX - 2 : this.originX,
      originY = changed || shiftY ? firstY - 2 : this.originY;
    const moved = originX !== this.originX || originY !== this.originY;
    if (changed) {
      this.signature = signature;
      this.signatures.clear();
      this.patterns.clear();
      this.columns = columns;
      this.rows = rows;
      const w = Math.ceil(columns * tile * dpr),
        h = Math.ceil(rows * tile * dpr);
      if (this.texture.width !== w || this.texture.height !== h)
        this.texture.setSize(w, h);
      this.texture.context.clearRect(0, 0, w, h);
      this.bytes = w * h * 4;
    } else if (moved) {
      const dx = originX - this.originX,
        dy = originY - this.originY;
      const previous = this.signatures;
      this.signatures = new Map();
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < columns; i++) {
          const oldX = i + dx,
            oldY = j + dy;
          if (oldX < 0 || oldX >= columns || oldY < 0 || oldY >= rows) continue;
          const stamp = previous.get(oldY * columns + oldX);
          if (stamp !== undefined) this.signatures.set(j * columns + i, stamp);
        }
      const ctx = this.texture.context;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (Math.abs(dx) >= columns || Math.abs(dy) >= rows) {
        ctx.clearRect(0, 0, this.texture.width, this.texture.height);
      } else {
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(this.texture.canvas, -dx * tile * dpr, -dy * tile * dpr);
        // Explicitly clear entering strips, including sky after a recovery,
        // instead of depending on out-of-image compositing behavior.
        const sx = dx * tile * dpr,
          sy = dy * tile * dpr;
        if (sx > 0)
          ctx.clearRect(this.texture.width - sx, 0, sx, this.texture.height);
        if (sx < 0) ctx.clearRect(0, 0, -sx, this.texture.height);
        if (sy > 0)
          ctx.clearRect(0, this.texture.height - sy, this.texture.width, sy);
        if (sy < 0) ctx.clearRect(0, 0, this.texture.width, -sy);
      }
      ctx.restore();
    }
    this.originX = originX;
    this.originY = originY;
    const assetRevision = this.scene.registry.get("band-assets-revision") ?? 0;
    if (this.patternRevision !== String(assetRevision)) {
      this.patterns.clear();
      this.signatures.clear();
      this.patternRevision = String(assetRevision);
    }
    const ctx = this.texture.context;
    const wrap = (x: number) => ((x % world.width) + world.width) % world.width;
    const solid = (x: number, y: number) =>
      y >= world.rows ||
      (y >= 0 && world.tiles[y * world.width + wrap(x)] !== 0);
    const known = (x: number, y: number) =>
      y >= world.rows || (y >= 0 && campaign.isKnown(wrap(x), y));
    const exposed = (x: number, y: number) =>
      !solid(x, y) && (y < 0 || known(x, y));
    this.dirtyCells = 0;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < columns; i++) {
        const x = originX + i,
          y = originY + j,
          k = j * columns + i;
        if (y < 0) continue;
        const seen = known(x, y),
          type =
            y >= world.rows ? 3 : (world.tiles[y * world.width + wrap(x)] ?? 3);
        const mask =
          seen && type !== 0
            ? Number(exposed(x, y - 1)) +
              2 * Number(exposed(x + 1, y)) +
              4 * Number(exposed(x, y + 1)) +
              8 * Number(exposed(x - 1, y))
            : 0;
        // Unknown signatures deliberately never include the hidden material, cave, ore or rim.
        const stamp = seen ? `${type}:${mask}` : "unknown";
        if (this.signatures.get(k) === stamp) continue;
        this.signatures.set(k, stamp);
        this.dirtyCells++;
        ctx.save();
        ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          -originX * tile * dpr,
          -originY * tile * dpr,
        );
        ctx.beginPath();
        ctx.rect(x * tile, y * tile, tile + 0.1, tile + 0.1);
        ctx.clip();
        const band = renderBand(world.id, y);
        const material = !seen
          ? "unknown"
          : type === 0
            ? "wall"
            : type === 1
              ? "soil"
              : type === 3
                ? "bedrock"
                : type === 4
                  ? "plate"
                  : "rock";
        // F4 values: unknown rock dark (concept L* about 24), cave air darker
        // still before light (#17242e, L* about 14).
        const base =
          material === "unknown"
            ? world.id === "W02"
              ? "#2f4250"
              : "#30383f"
            : material === "wall"
              ? "#17242e"
              : material === "bedrock"
                ? "#26303d"
                : material === "plate"
                  ? "#6e5144"
                  : material === "rock"
                    ? band.rock[1]
                    : band.soil[1];
        ctx.fillStyle = base;
        ctx.fillRect(x * tile, y * tile, tile + 0.2, tile + 0.2);
        // Unknown cells take the band's rock page: band (row) only, never hidden material.
        const key = `band-${world.id}-${band.id}-${material === "unknown" || material === "plate" || material === "bedrock" ? "rock" : material}`;
        let pattern = this.patterns.get(key);
        if (!pattern && this.scene.textures.exists(key)) {
          const source = this.scene.textures
            .get(key)
            .getSourceImage() as HTMLImageElement;
          const created = ctx.createPattern(source, "repeat");
          if (created) {
            created.setTransform(
              new DOMMatrix().scale((tile * 8) / source.width),
            );
            pattern = created;
            this.patterns.set(key, created);
          }
        }
        if (pattern) {
          ctx.globalAlpha =
            material === "unknown" ? 0.5 : material === "wall" ? 0.55 : 1;
          ctx.fillStyle = pattern;
          ctx.fillRect(x * tile, y * tile, tile + 0.2, tile + 0.2);
          ctx.globalAlpha = 1;
        } else {
          // World-aligned fallback strata are continuous, not repeated tile drawings.
          ctx.strokeStyle =
            material === "wall"
              ? "#54707a"
              : material === "rock" || material === "unknown"
                ? band.rock[0]
                : band.soil[0];
          ctx.globalAlpha = material === "unknown" ? 0.16 : 0.35;
          ctx.lineWidth = 2;
          for (let line = 0; line < 3; line++) {
            const yy = (y + line / 3) * tile;
            ctx.beginPath();
            ctx.moveTo(x * tile, yy + Math.sin(x * 0.7 + line) * tile * 0.12);
            ctx.lineTo(
              (x + 1) * tile,
              yy + Math.sin((x + 1) * 0.7 + line) * tile * 0.12,
            );
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (material === "bedrock" || material === "plate") {
          ctx.strokeStyle = material === "plate" ? "#b79672" : "#71818d";
          ctx.lineWidth = material === "plate" ? 3 : 1.2;
          ctx.globalAlpha = 0.65;
          for (let stripe = -1; stripe < 3; stripe++) {
            ctx.beginPath();
            ctx.moveTo((x + stripe * 0.5) * tile, y * tile);
            ctx.lineTo((x + stripe * 0.5 + 1) * tile, (y + 1) * tile);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (mask) {
          ctx.strokeStyle = highContrast
            ? "#f3f6df"
            : material === "rock"
              ? band.rock[2]
              : band.soil[2];
          ctx.lineWidth = highContrast ? 2.5 : 2;
          const left = x * tile + 1,
            right = (x + 1) * tile - 1,
            top = y * tile + 1,
            bottom = (y + 1) * tile - 1;
          ctx.beginPath();
          if (mask & 1) {
            ctx.moveTo(left, top);
            ctx.lineTo(right, top);
          }
          if (mask & 2) {
            ctx.moveTo(right, top);
            ctx.lineTo(right, bottom);
          }
          if (mask & 4) {
            ctx.moveTo(left, bottom);
            ctx.lineTo(right, bottom);
          }
          if (mask & 8) {
            ctx.moveTo(left, top);
            ctx.lineTo(left, bottom);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    if (changed || moved || this.dirtyCells) {
      this.texture.refresh();
      this.draws++;
    }
    this.image
      .setPosition(
        originX * view.tile - view.scrollX,
        originY * view.tile - view.scrollY,
      )
      .setDisplaySize(columns * view.tile, rows * view.tile);
  }
  destroy() {
    this.image.destroy();
    this.scene.textures.remove(this.texture.key);
  }
}
