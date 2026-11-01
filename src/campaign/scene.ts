import Phaser from "phaser";
import type { Campaign } from "./model";
import type { CampaignControls, CampaignPackage, CampaignWorld } from "./types";

export const CAMPAIGN_TEXTURE = "campaign-w01";

export interface CampaignSceneBindings {
  getCampaign: () => Campaign;
  isPaused: () => boolean;
  getControls: () => CampaignControls;
  onUpdate: (dt: number) => void;
  onInteract?: () => void;
  onEvent?: (kind: "cut" | "pickup" | "damage" | "thrust" | "idle") => void;
  reducedMotion?: () => boolean;
}

/** Viewport scale is independent of map size: phones see fewer full-size cells. */
export function campaignTileSize(width: number, height: number) {
  if (height <= 420) return 48;
  if (width < 600) return 48;
  return Math.max(48, Math.min(76, Math.round(width / 22)));
}

export function campaignSafeArea(width: number, height: number) {
  if (
    width < 760 ||
    (typeof matchMedia === "function" &&
      matchMedia("(pointer: coarse)").matches)
  )
    return height <= 420 ? { top: 115, bottom: 90 } : { top: 170, bottom: 140 };
  return { top: 90, bottom: 55 };
}

const wrap = (value: number, width: number) =>
  ((value % width) + width) % width;
const delta = (from: number, to: number, width: number) =>
  wrap(to - from + width / 2, width) - width / 2;
const hash = (x: number, y: number, seed = 0) => {
  const n = Math.imul(x + 97 + seed, 374761393) ^ Math.imul(y + 13, 668265263);
  return ((Math.imul(n ^ (n >>> 13), 1274126177) >>> 0) % 10000) / 10000;
};
const oreNumber = (item: CampaignPackage) =>
  Number(item.itemId.match(/O([1-4])$/i)?.[1] || 0);

interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  total: number;
  color: number;
}

/**
 * Campaign rendering reads the simulator; artwork never defines collision or
 * reveals a deposit behind rock. All simulation time enters through this scene.
 */
export function createCampaignScene(bindings: CampaignSceneBindings) {
  return class CampaignScene extends Phaser.Scene {
    private background!: Phaser.GameObjects.Graphics;
    private edges!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private screen!: Phaser.GameObjects.Graphics;
    private images: Phaser.GameObjects.Image[] = [];
    private labels: Phaser.GameObjects.Text[] = [];
    private sky!: Phaser.GameObjects.TileSprite;
    private ridgeFar!: Phaser.GameObjects.TileSprite;
    private ridgeNear!: Phaser.GameObjects.TileSprite;
    private lamp!: Phaser.GameObjects.Image;
    private loading!: Phaser.GameObjects.Text;
    private imageIndex = 0;
    private labelIndex = 0;
    private previousCampaign: Campaign | undefined;
    private previousWorld: CampaignWorld | undefined;
    private previousX = 0;
    private previousY = 0;
    private unwrappedX = 0;
    private cameraX = 0;
    private cameraY = 0;
    private tile = 48;
    private previousSize = "";
    private elapsed = 0;
    private artFailed = false;
    private lastMined = 0;
    private lastCargo = 0;
    private lastHull = 0;
    private damageLife = 0;
    private chips: Chip[] = [];
    private inspection:
      | {
          x: number;
          y: number;
          packageId?: string;
          missionId?: string;
          life: number;
        }
      | undefined;
    private popup:
      { text: string; x: number; y: number; life: number } | undefined;

    preload() {
      const host = document.getElementById("campaign-game");
      host?.setAttribute("aria-busy", "true");
      if (host) host.dataset.campaignArt = "loading";
      this.loading = this.add
        .text(
          this.scale.width / 2,
          this.scale.height / 2,
          "ARRIVING AT THE ASTEROID",
          {
            fontFamily: "system-ui, sans-serif",
            fontSize: "15px",
            color: "#F6E1AF",
          },
        )
        .setOrigin(0.5)
        .setDepth(100);
      this.load.on("loaderror", () => {
        this.artFailed = true;
      });
      this.load.atlas(
        CAMPAIGN_TEXTURE,
        new URL(
          "../../assets/campaign/generated/w01-atlas.png",
          import.meta.url,
        ).href,
        new URL(
          "../../assets/campaign/generated/w01-atlas.json",
          import.meta.url,
        ).href,
      );
      this.load.image(
        "campaign-sky",
        new URL("../../assets/campaign/generated/w01-sky.png", import.meta.url)
          .href,
      );
      this.load.image(
        "campaign-ridge-far",
        new URL(
          "../../assets/campaign/generated/w01-ridge-far.png",
          import.meta.url,
        ).href,
      );
      this.load.image(
        "campaign-ridge-near",
        new URL(
          "../../assets/campaign/generated/w01-ridge-near.png",
          import.meta.url,
        ).href,
      );
    }

    create() {
      const required = [
        "soil-0",
        "soil-edge-15",
        "stone-0",
        "rig-body-0",
        "rig-cabin",
        "rig-drill-down-0",
        "ore-o1",
        "ore-o4",
        "package-o1",
        "mission-core",
        "dock-stage-0",
        "dock-stage-3",
      ];
      this.artFailed ||=
        !this.textures.exists(CAMPAIGN_TEXTURE) ||
        required.some((name) => !this.textures.get(CAMPAIGN_TEXTURE).has(name));
      const host = document.getElementById("campaign-game");
      const status = this.artFailed ? "error" : "ready";
      if (host) host.dataset.campaignArt = status;
      this.game.canvas.dataset.campaignArt = status;
      host?.setAttribute("aria-busy", "false");
      this.loading
        .setText(
          this.artFailed ? "Artwork could not load. Open Menu and reload." : "",
        )
        .setVisible(this.artFailed);

      this.background = this.add.graphics().setDepth(0);
      this.edges = this.add.graphics().setDepth(11);
      this.effects = this.add.graphics().setDepth(24);
      this.screen = this.add.graphics().setDepth(40);
      this.sky = this.add
        .tileSprite(0, 0, 1, 1, "campaign-sky")
        .setOrigin(0)
        .setDepth(1);
      this.ridgeFar = this.add
        .tileSprite(0, 0, 1, 1, "campaign-ridge-far")
        .setOrigin(0)
        .setDepth(2);
      this.ridgeNear = this.add
        .tileSprite(0, 0, 1, 1, "campaign-ridge-near")
        .setOrigin(0)
        .setDepth(3);
      const glow = this.textures.createCanvas("campaign-lamp", 256, 256);
      if (glow) {
        const context = glow.context;
        const gradient = context.createRadialGradient(
          128,
          128,
          5,
          128,
          128,
          128,
        );
        gradient.addColorStop(0, "rgba(246,225,175,.18)");
        gradient.addColorStop(0.42, "rgba(246,225,175,.08)");
        gradient.addColorStop(1, "rgba(246,225,175,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 256);
        glow.refresh();
      }
      this.lamp = this.add.image(0, 0, "campaign-lamp").setDepth(5);
      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (bindings.isPaused()) return;
        const campaign = bindings.getCampaign();
        const world = campaign.world;
        const worldX = (pointer.x + this.cameraX) / this.tile;
        const worldY = (pointer.y + this.cameraY) / this.tile;
        if (
          campaign.atDock &&
          Math.abs(delta(worldX, 5.5, world.width)) < 2.6 &&
          worldY < 0.2
        ) {
          bindings.onInteract?.();
          return;
        }
        const x = wrap(Math.floor(worldX), world.width);
        const y = Math.floor(worldY);
        if (!campaign.isVisible(x, y)) {
          this.inspection = undefined;
          return;
        }
        const item = world.packages.find(
          (item) =>
            (item.status === "deposit" || item.status === "exposed") &&
            Math.floor(item.x) === x &&
            Math.floor(item.y) === y,
        );
        const mission = world.missions.find(
          (mission) =>
            mission.status === "source" &&
            Math.floor(mission.x) === x &&
            Math.floor(mission.y) === y,
        );
        this.inspection =
          item || mission
            ? { x, y, packageId: item?.id, missionId: mission?.id, life: 4.5 }
            : undefined;
      });
      bindings.onUpdate(0);
    }

    private image(
      frame: string,
      x: number,
      y: number,
      width: number,
      height: number,
      depth = 10,
      alpha = 1,
      flip = false,
      originY = 0.5,
    ) {
      if (
        !this.textures.exists(CAMPAIGN_TEXTURE) ||
        !this.textures.get(CAMPAIGN_TEXTURE).has(frame)
      )
        return false;
      let image = this.images[this.imageIndex++];
      if (!image) {
        image = this.add.image(0, 0, CAMPAIGN_TEXTURE);
        this.images.push(image);
      }
      image
        .setFrame(frame)
        .setPosition(x, y)
        .setOrigin(0.5, originY)
        .setDisplaySize(width, height)
        .setDepth(depth)
        .setAlpha(alpha)
        .setFlipX(flip)
        .clearTint()
        .setVisible(true);
      return true;
    }

    private label(
      x: number,
      y: number,
      text: string,
      color = "#F0F5F7",
      centered: boolean | "right" = true,
    ) {
      let label = this.labels[this.labelIndex++];
      if (!label) {
        label = this.add
          .text(0, 0, "", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "12px",
            color,
            backgroundColor: "#101920ed",
            padding: { x: 8, y: 5 },
          })
          .setDepth(42);
        this.labels.push(label);
      }
      label
        .setPosition(x, y)
        .setText(text)
        .setColor(color)
        .setOrigin(centered === "right" ? 1 : centered ? 0.5 : 0, 0)
        .setAlign(centered === "right" ? "right" : centered ? "center" : "left")
        .setWordWrapWidth(Math.max(120, this.scale.width - 48), true)
        .setVisible(true);
    }

    private burst(x: number, y: number, color: number, count = 10) {
      if (bindings.reducedMotion?.()) return;
      for (let i = 0; i < count && this.chips.length < 90; i++) {
        const life = 0.25 + Math.random() * 0.4;
        this.chips.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 2.3,
          life,
          total: life,
          color,
        });
      }
    }

    update(_time: number, deltaMilliseconds: number) {
      if (!this.background) return;
      const campaign = bindings.getCampaign();
      const paused = bindings.isPaused();
      const dt = Math.min(0.05, Math.max(0, deltaMilliseconds / 1000));
      const changed =
        campaign !== this.previousCampaign ||
        campaign.world !== this.previousWorld;
      if (changed) {
        this.previousCampaign = campaign;
        this.previousWorld = campaign.world;
        this.previousX = campaign.renderX;
        this.previousY = campaign.renderY;
        this.unwrappedX = campaign.renderX;
        this.lastMined = campaign.state.stats.mined;
        this.lastCargo = campaign.cargo.length;
        this.lastHull = campaign.state.vehicle.hull;
        this.inspection = undefined;
        this.popup = undefined;
        this.chips = [];
        this.damageLife = 0;
      }
      const oldTarget = campaign.drillTarget;
      if (!paused) {
        campaign.tick(dt, bindings.getControls());
        this.elapsed += dt;
        this.damageLife = Math.max(0, this.damageLife - dt);
        if (this.inspection && (this.inspection.life -= dt) <= 0)
          this.inspection = undefined;
        if (this.popup && (this.popup.life -= dt) <= 0) this.popup = undefined;
        for (const chip of this.chips) {
          chip.life -= dt;
          chip.x += chip.vx * dt;
          chip.y += chip.vy * dt;
          chip.vy += 4 * dt;
        }
        this.chips = this.chips.filter((chip) => chip.life > 0);
      }
      const world = campaign.world;
      const vehicle = campaign.state.vehicle;
      const jumped =
        Math.abs(campaign.renderY - this.previousY) > 8 ||
        Math.abs(delta(this.previousX, campaign.renderX, world.width)) > 8;
      this.unwrappedX += delta(this.previousX, campaign.renderX, world.width);
      this.previousX = campaign.renderX;
      this.previousY = campaign.renderY;
      if (campaign.state.stats.mined > this.lastMined) {
        const x = oldTarget
          ? this.unwrappedX +
            delta(campaign.renderX, oldTarget.x + 0.5, world.width)
          : this.unwrappedX;
        this.burst(
          x,
          oldTarget ? oldTarget.y + 0.5 : campaign.renderY,
          0xa8b0b4,
        );
        bindings.onEvent?.("cut");
      }
      if (campaign.cargo.length > this.lastCargo) {
        this.burst(this.unwrappedX, campaign.renderY, 0xf0a43c, 6);
        this.popup = {
          text: "+ Cargo secured",
          x: this.unwrappedX,
          y: campaign.renderY,
          life: 1.2,
        };
        bindings.onEvent?.("pickup");
      }
      if (vehicle.hull < this.lastHull) {
        this.damageLife = 0.3;
        bindings.onEvent?.("damage");
      }
      this.lastMined = campaign.state.stats.mined;
      this.lastCargo = campaign.cargo.length;
      this.lastHull = vehicle.hull;

      const width = this.scale.width;
      const height = this.scale.height;
      this.tile = campaignTileSize(width, height);
      const tile = this.tile;
      const safe = campaignSafeArea(width, height);
      const usable = Math.max(100, height - safe.top - safe.bottom);
      const targetX =
        this.unwrappedX * tile - width / 2 + campaign.velocityX * tile * 0.06;
      const targetY = campaign.renderY * tile - (safe.top + usable * 0.46);
      const size = `${width}:${height}:${tile}`;
      if (changed || jumped || size !== this.previousSize) {
        this.cameraX = targetX;
        this.cameraY = targetY;
        this.previousSize = size;
      } else if (!paused) {
        const amount = 1 - Math.exp(-dt * 8);
        this.cameraX += (targetX - this.cameraX) * amount;
        this.cameraY += (targetY - this.cameraY) * amount;
      }
      const cx = this.cameraX;
      const cy = this.cameraY;
      const px = this.unwrappedX * tile - cx;
      const py = campaign.renderY * tile - cy;
      const surfaceY = -cy;
      const graphics = this.background;
      const edges = this.edges;
      const fx = this.effects;
      graphics.clear();
      edges.clear();
      fx.clear();
      this.screen.clear();
      for (const image of this.images) image.setVisible(false);
      for (const label of this.labels) label.setVisible(false);
      this.imageIndex = 0;
      this.labelIndex = 0;

      graphics.fillStyle(0x17232b);
      graphics.fillRect(0, 0, width, height);
      // Quiet broad plates give excavated air depth without marking hidden cells.
      for (let plane = 0; plane < 3; plane++) {
        const speed = [0.15, 0.35, 0.6][plane]!;
        const stride = tile * (5.8 - plane);
        const first = Math.floor((cx * speed) / stride) - 1;
        for (let i = first; i < first + Math.ceil(width / stride) + 3; i++) {
          const x = i * stride - cx * speed;
          const y =
            surfaceY + tile * (2.5 + plane) - ((cy * speed) % (tile * 5));
          graphics.fillStyle([0x1c2a32, 0x223039, 0x29383e][plane]!, 0.45);
          graphics.fillPoints(
            [
              { x: x - stride * 0.1, y: y - tile },
              { x: x + stride * 0.45, y: y - tile * 1.5 },
              { x: x + stride, y: y + tile * 0.3 },
              { x: x + stride * 0.7, y: height + tile },
              { x: x - stride * 0.1, y: height + tile },
            ],
            true,
          );
        }
      }
      this.sky.setVisible(surfaceY > 0);
      this.ridgeFar.setVisible(surfaceY > 0);
      this.ridgeNear.setVisible(surfaceY > 0);
      if (surfaceY > 0) {
        this.sky.setPosition(0, 0).setSize(width, Math.min(height, surfaceY));
        this.sky.tilePositionX = cx * 0.15;
        const scale = tile / 96;
        this.ridgeFar
          .setPosition(0, surfaceY - 384 * scale)
          .setSize(width / scale, 384)
          .setScale(scale);
        this.ridgeFar.tilePositionX = (cx * 0.35) / scale;
        this.ridgeNear
          .setPosition(0, surfaceY - 300 * scale)
          .setSize(width / scale, 384)
          .setScale(scale);
        this.ridgeNear.tilePositionX = (cx * 0.6) / scale;
      }
      this.lamp.setPosition(px, py).setDisplaySize(tile * 9, tile * 9);

      const firstColumn = Math.floor(cx / tile) - 1;
      const lastColumn = Math.ceil((cx + width) / tile) + 1;
      const firstRow = Math.max(0, Math.floor(cy / tile) - 1);
      const lastRow = Math.min(
        world.rows + 4,
        Math.ceil((cy + height) / tile) + 1,
      );
      const packageCells = new Map<number, CampaignPackage[]>();
      for (const item of world.packages) {
        if (item.status !== "deposit" && item.status !== "exposed") continue;
        const index = Math.floor(item.y) * world.width + Math.floor(item.x);
        const contents = packageCells.get(index) || [];
        contents.push(item);
        packageCells.set(index, contents);
      }
      const solid = (x: number, y: number) =>
        y >= world.rows ||
        (y >= 0 && world.tiles[y * world.width + wrap(x, world.width)] !== 0);
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const canonical = wrap(column, world.width);
          const index = row * world.width + canonical;
          const x = (column + 0.5) * tile - cx;
          const y = (row + 0.5) * tile - cy;
          const known = row >= world.rows || campaign.isKnown(canonical, row);
          if (!known) {
            edges.fillStyle(0x111c24);
            edges.fillRect(
              x - tile / 2 - 0.3,
              y - tile / 2 - 0.3,
              tile + 0.6,
              tile + 0.6,
            );
            // Every unknown cell uses the same geology-independent substrate,
            // including unseen air. Its faint plates never expose a cave shape.
            this.image(
              `soil-${Math.floor(hash(canonical, row, world.seed) * 8)}`,
              x,
              y,
              tile + 0.6,
              tile + 0.6,
              11,
              0.07,
            );
            continue;
          }
          const type = row >= world.rows ? 3 : world.tiles[index];
          const lit = row >= world.rows || campaign.isVisible(canonical, row);
          const distance = Math.hypot(
            column + 0.5 - this.unwrappedX,
            row + 0.5 - campaign.renderY,
          );
          const alpha = lit ? Math.max(0.58, 1 - distance * 0.055) : 0.42;
          if (type !== 0) {
            const variant = Math.floor(
              hash(canonical, row, world.seed) * (type === 1 ? 8 : 4),
            );
            const frame = type === 1 ? `soil-${variant}` : `stone-${variant}`;
            if (!this.image(frame, x, y, tile + 0.5, tile + 0.5, 10, alpha)) {
              edges.fillStyle(type === 1 ? 0x56616a : 0x3f4c54, alpha);
              edges.fillRect(
                x - tile / 2,
                y - tile / 2,
                tile + 0.5,
                tile + 0.5,
              );
            }
            if (type === 3) {
              edges.fillStyle(0x17232b, 0.75);
              edges.fillRect(
                x - tile / 2,
                y - tile / 2,
                tile + 0.5,
                tile + 0.5,
              );
            }
            let mask = 0;
            if (!solid(column, row - 1)) mask |= 1;
            if (!solid(column + 1, row)) mask |= 2;
            if (!solid(column, row + 1)) mask |= 4;
            if (!solid(column - 1, row)) mask |= 8;
            if (mask)
              this.image(
                `soil-edge-${mask}`,
                x,
                y,
                tile + 0.5,
                tile + 0.5,
                11,
                alpha,
              );
          }
          for (const item of packageCells.get(index) || []) {
            const number = oreNumber(item);
            const frame = number
              ? `${item.status === "deposit" ? "ore" : "package"}-o${number}`
              : "relic";
            const bob =
              item.status === "exposed" &&
              !paused &&
              !bindings.reducedMotion?.()
                ? Math.sin(this.elapsed * 3 + row) * tile * 0.025
                : 0;
            this.image(frame, x, y + bob, tile * 0.9, tile * 0.9, 13, alpha);
          }
        }
      }

      // Surface infrastructure repeats around the same finite circumference.
      if (surfaceY > -tile * 3 && surfaceY < height + tile * 4) {
        const firstPeriod = Math.floor(cx / (world.width * tile)) - 1;
        const lastPeriod = Math.ceil((cx + width) / (world.width * tile)) + 1;
        const stage = Math.min(3, campaign.state.progress.completed.length);
        for (let period = firstPeriod; period <= lastPeriod; period++) {
          const x = (5.5 + period * world.width) * tile - cx;
          if (x < -tile * 5 || x > width + tile * 5) continue;
          edges.fillStyle(0xf0a43c, 0.13);
          edges.fillEllipse(x, surfaceY, tile * 4, tile * 0.22);
          this.image(
            `dock-stage-${stage}`,
            x,
            surfaceY + 1,
            tile * 4,
            tile * 3,
            15,
            1,
            false,
            1,
          );
          this.label(
            x,
            surfaceY - tile * 3.1,
            stage === 3 ? "LANDER RESTORED" : "SALVAGE LANDER",
            "#F6E1AF",
          );
          if (stage >= 1)
            this.image(
              `refuge-stage-${Math.min(2, stage)}`,
              x - tile * 4,
              surfaceY,
              tile * 3,
              tile * 2,
              14,
              1,
              false,
              1,
            );
          if (stage >= 2)
            this.image(
              `relay-stage-${Math.min(2, stage - 1)}`,
              x + tile * 3.5,
              surfaceY,
              tile * 2,
              tile * 2,
              14,
              1,
              false,
              1,
            );
        }
        const dockOffset = delta(campaign.renderX, 5.5, world.width);
        if (Math.abs(dockOffset * tile) > width / 2 - tile * 2) {
          this.label(
            dockOffset < 0 ? 18 : width - 18,
            Math.max(safe.top + 8, surfaceY - tile * 1.6),
            `${dockOffset < 0 ? "← " : ""}LANDER · ${Math.round(Math.abs(dockOffset) * 10)} m${dockOffset > 0 ? " →" : ""}`,
            "#F6E1AF",
            dockOffset > 0 ? "right" : false,
          );
        }
      }

      // Objective markers only appear in geometry that has actually been seen.
      if (!campaign.state.progress.beacon && campaign.isKnown(20, 9)) {
        const x = this.unwrappedX + delta(campaign.renderX, 20.5, world.width);
        this.image(
          "mission-beacon",
          x * tile - cx,
          9.5 * tile - cy,
          tile,
          tile,
          14,
        );
      }
      for (const mission of world.missions) {
        if (
          mission.status !== "source" ||
          !campaign.isKnown(Math.floor(mission.x), Math.floor(mission.y))
        )
          continue;
        const frame = /valve/i.test(mission.id)
          ? "mission-valve"
          : /antenna/i.test(mission.id)
            ? "mission-antenna"
            : "mission-core";
        const x =
          this.unwrappedX + delta(campaign.renderX, mission.x, world.width);
        this.image(
          frame,
          x * tile - cx,
          mission.y * tile - cy,
          tile * 0.86,
          tile * 0.86,
          14,
          campaign.isVisible(Math.floor(mission.x), Math.floor(mission.y))
            ? 1
            : 0.42,
        );
      }
      for (const shelf of world.shelves) {
        if (
          shelf.collapsed ||
          !campaign.isKnown(Math.floor(shelf.x), Math.floor(shelf.y))
        )
          continue;
        const x =
          (this.unwrappedX + delta(campaign.renderX, shelf.x, world.width)) *
            tile -
          cx;
        const y = shelf.y * tile - cy;
        if (shelf.warning !== null) {
          this.image("warning-shelf", x, y - tile * 0.25, tile, tile, 17);
          edges.lineStyle(3, 0xffca6a, 0.85);
          edges.lineBetween(
            x - tile * 0.5,
            y + tile * 0.42,
            x + tile * 0.5,
            y + tile * 0.42,
          );
          if (Math.abs(x - px) < tile * 4 && !paused)
            this.label(x, y - tile * 0.85, "UNSTABLE SHELF", "#FFCA6A");
        }
      }

      if (campaign.drillTarget) {
        const target = campaign.drillTarget;
        const x =
          (this.unwrappedX +
            delta(campaign.renderX, target.x + 0.5, world.width)) *
            tile -
          cx;
        const y = (target.y + 0.5) * tile - cy;
        const stage = Math.min(3, Math.floor(campaign.drillProgress * 4));
        if (stage > 0) this.image(`crack-${stage}`, x, y, tile, tile, 16);
        edges.lineStyle(2, 0xf6e1af, 0.35);
        edges.strokeRect(
          x - tile * 0.44,
          y - tile * 0.44,
          tile * 0.88,
          tile * 0.88,
        );
      }

      const rigSize = (tile * 64) / 48;
      const rigY = py - tile * 0.015;
      const moving = Math.abs(campaign.velocityX) > 0.3;
      const bodyFrame =
        moving && !paused ? Math.floor(this.elapsed * 12) % 8 : 0;
      const flip = campaign.facing === "left";
      if (campaign.grounded) {
        edges.fillStyle(0x070f15, 0.45);
        edges.fillEllipse(px, py + tile * 0.36, tile * 0.9, tile * 0.12);
      }
      if (campaign.thrusting)
        this.image(
          `thrust-${Math.floor(this.elapsed * 12) % 6}`,
          px,
          rigY,
          rigSize,
          rigSize,
          18,
          1,
          flip,
        );
      this.image(
        `rig-body-${bodyFrame}`,
        px,
        rigY,
        rigSize,
        rigSize,
        20,
        1,
        flip,
      );
      this.image(
        `rig-engine-${Math.min(1, campaign.state.hardware.engine)}`,
        px,
        rigY,
        rigSize,
        rigSize,
        21,
        1,
        flip,
      );
      this.image(
        `rig-energy-${Math.min(1, campaign.state.hardware.energy)}`,
        px,
        rigY,
        rigSize,
        rigSize,
        21,
        1,
        flip,
      );
      this.image(
        `rig-bay-${Math.min(1, campaign.state.hardware.cargo)}`,
        px,
        rigY,
        rigSize,
        rigSize,
        21,
        1,
        flip,
      );
      this.image("rig-cabin", px, rigY, rigSize, rigSize, 22, 1, flip);
      this.image(
        `rig-hull-${Math.min(1, campaign.state.hardware.hull)}`,
        px,
        rigY,
        rigSize,
        rigSize,
        22,
        1,
        flip,
      );
      if (campaign.state.equipped.mobility === "W01-R2")
        this.image(
          `rig-feet-${campaign.feetDeployed ? "deployed" : "stowed"}`,
          px,
          rigY,
          rigSize,
          rigSize,
          23,
          1,
          flip,
        );
      if (campaign.state.equipped.processor === "W01-R3")
        this.image("rig-rack", px, rigY, rigSize, rigSize, 23, 1, flip);
      const drillFrame = campaign.drillDirection
        ? `rig-drill-${campaign.drillDirection}-${Math.floor(this.elapsed * 16) % 8}`
        : "rig-drill-idle";
      this.image(
        drillFrame,
        px,
        rigY,
        rigSize,
        rigSize,
        23,
        1,
        campaign.drillDirection ? false : flip,
      );
      if (campaign.state.hardware.drill >= 1)
        this.image(
          `rig-drill-collar-${campaign.drillDirection || "right"}-1`,
          px,
          rigY,
          rigSize,
          rigSize,
          23,
          1,
          campaign.drillDirection ? false : flip,
        );
      const hullFraction = vehicle.hull / campaign.maxHull;
      const damageStage =
        hullFraction <= 0.15
          ? 3
          : hullFraction <= 0.4
            ? 2
            : hullFraction <= 0.75
              ? 1
              : 0;
      if (damageStage)
        this.image(
          `rig-damage-${damageStage}`,
          px,
          rigY,
          rigSize,
          rigSize,
          22.5,
          1,
          flip,
        );
      if (this.damageLife > 0) {
        fx.lineStyle(2, 0xff8e7f, this.damageLife / 0.3);
        fx.strokeRoundedRect(
          px - tile * 0.48,
          py - tile * 0.45,
          tile * 0.96,
          tile * 0.9,
          5,
        );
      }
      if (campaign.drillTarget) {
        this.screen.fillStyle(0x101920, 0.95);
        this.screen.fillRoundedRect(
          px - tile * 0.38,
          py - tile * 0.61,
          tile * 0.76,
          5,
          2,
        );
        this.screen.fillStyle(0xf0a43c);
        this.screen.fillRoundedRect(
          px - tile * 0.38 + 1,
          py - tile * 0.61 + 1,
          Math.max(1, (tile * 0.76 - 2) * campaign.drillProgress),
          3,
          1,
        );
      }
      for (const chip of this.chips) {
        fx.fillStyle(chip.color, Math.min(1, chip.life / chip.total));
        fx.fillRect(
          chip.x * tile - cx,
          chip.y * tile - cy,
          Math.max(2, tile * 0.035),
          Math.max(2, tile * 0.035),
        );
      }
      if (this.popup && !paused)
        this.label(
          this.popup.x * tile - cx,
          this.popup.y * tile - cy - tile * 0.9 - (1.2 - this.popup.life) * 12,
          this.popup.text,
          "#F6E1AF",
        );

      let callout = "";
      if (
        !paused &&
        this.inspection &&
        campaign.isVisible(this.inspection.x, this.inspection.y)
      ) {
        const item = world.packages.find(
          (item) => item.id === this.inspection!.packageId,
        );
        const mission = world.missions.find(
          (mission) => mission.id === this.inspection!.missionId,
        );
        if (item && (item.status === "deposit" || item.status === "exposed"))
          callout = `${item.name} · ${(item.value / 10).toLocaleString()} CR · ${item.bulk} bulk${item.status === "exposed" ? " · Ready to collect" : ""}`;
        else if (mission?.status === "source")
          callout = `${mission.name} · Mission item · Return to bank`;
      }
      if (callout)
        this.label(
          width / 2,
          Math.max(safe.top + 12, height - safe.bottom - 44),
          callout,
          "#F6E1AF",
        );
      const host = document.getElementById("campaign-game");
      if (host) {
        host.dataset.worldCallout = String(Boolean(callout));
        host.dataset.inspection = this.inspection && callout ? callout : "";
      }
      if (this.artFailed) this.loading.setPosition(width / 2, safe.top + 18);
      bindings.onUpdate(dt);
    }
  };
}
