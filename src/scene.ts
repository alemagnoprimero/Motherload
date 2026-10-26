import Phaser from "phaser";
import {
  Mine,
  WIDTH,
  HEIGHT,
  SURFACE,
  ORES,
  isOre,
  maxHull,
  type Controls,
} from "./model";
import { ART_TEXTURE, createArt } from "./art";

export interface SceneBindings {
  getMine: () => Mine;
  isPaused: () => boolean;
  getControls: () => Controls;
  onUpdate: (dt: number) => void;
  onEvent?: (kind: "pickup" | "damage" | "drill" | "thrust" | "idle") => void;
}
interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  total: number;
  color: number;
  size: number;
}

// One atlas, culled terrain and small recycled pools keep the scene lightweight.
// The camera follows the rig instead of shrinking the whole mine to phone width.
export function createMineScene(bindings: SceneBindings) {
  return class MineScene extends Phaser.Scene {
    private background!: Phaser.GameObjects.Graphics;
    private marks!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private rig!: Phaser.GameObjects.Image;
    private tiles: Phaser.GameObjects.Image[] = [];
    private labels: Phaser.GameObjects.Text[] = [];
    private cameraX = 0;
    private cameraY = 0;
    private elapsed = 0;
    private dustTimer = 0;
    private flash = 0;
    private chips: Chip[] = [];
    private popup:
      | { x: number; y: number; text: string; life: number; color: string }
      | undefined;
    private previousMine: Mine | undefined;
    private previousSize = "";
    private inspect: { x: number; y: number; life: number } | undefined;

    create() {
      createArt(this);
      this.background = this.add.graphics().setDepth(0);
      this.marks = this.add.graphics().setDepth(2);
      this.rig = this.add.image(0, 0, ART_TEXTURE, "rig-idle-0").setDepth(4);
      this.effects = this.add.graphics().setDepth(5);
      for (let i = 0; i < 20; i++)
        this.labels.push(
          this.add
            .text(0, 0, "", {
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              color: "#dfd9bb",
              backgroundColor: "#10272be0",
              padding: { x: 5, y: 3 },
            })
            .setDepth(6),
        );
      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const tile = this.scale.height < 260 ? 24 : 32;
        this.inspect = {
          x: Math.floor((pointer.x + this.cameraX) / tile),
          y: Math.floor((pointer.y + this.cameraY) / tile),
          life: 3,
        };
      });
      bindings.onUpdate(0);
    }

    private burst(
      x: number,
      y: number,
      color: number,
      count: number,
      speed = 1,
    ) {
      for (let i = 0; i < count && this.chips.length < 90; i++) {
        const life = 0.3 + Math.random() * 0.5;
        this.chips.push({
          x,
          y,
          vx: (Math.random() - 0.5) * speed * 2,
          vy: -Math.random() * speed - 0.25,
          life,
          total: life,
          color,
          size: 1 + Math.random() * 2,
        });
      }
    }

    update(_time: number, delta: number) {
      const dt = Math.min(Math.max(delta / 1000, 0), 0.25);
      const mine = bindings.getMine();
      const paused = bindings.isPaused();
      const input = bindings.getControls();
      const changedMine = this.previousMine !== mine;
      if (changedMine) {
        this.chips = [];
        this.popup = undefined;
        this.inspect = undefined;
        this.flash = 0;
        this.previousMine = mine;
      }
      const oldMined = mine.state.mined;
      const oldCargo = mine.state.inventory.length;
      const oldHull = mine.state.hull;
      if (!paused) {
        mine.tick(dt, input);
        this.elapsed += dt;
        this.flash = Math.max(0, this.flash - dt);
        if (this.popup && (this.popup.life -= dt) <= 0) this.popup = undefined;
        if (this.inspect && (this.inspect.life -= dt) <= 0)
          this.inspect = undefined;
        for (const chip of this.chips) {
          chip.life -= dt;
          chip.x += chip.vx * dt;
          chip.y += chip.vy * dt;
          chip.vy += 3 * dt;
        }
        this.chips = this.chips.filter((chip) => chip.life > 0);
        if (mine.state.mined > oldMined) {
          const collected = mine.state.inventory.length > oldCargo;
          const ore = mine.state.inventory.at(-1);
          const color =
            collected && ore !== undefined
              ? Phaser.Display.Color.HexStringToColor(ORES[ore].color).color
              : 0xc39261;
          this.burst(
            mine.renderX + 0.5,
            mine.renderY + 0.5,
            color,
            collected ? 10 : 5,
          );
          if (collected && ore !== undefined) {
            this.popup = {
              x: mine.renderX + 0.5,
              y: mine.renderY,
              text: `+ ${ORES[ore].name}`,
              life: 1.2,
              color: ORES[ore].color,
            };
            bindings.onEvent?.("pickup");
          }
        }
        if (mine.state.hull < oldHull) {
          this.flash = 0.25;
          this.burst(mine.renderX + 0.5, mine.renderY + 0.5, 0xed9470, 12, 1.5);
          bindings.onEvent?.("damage");
        }
        this.dustTimer += dt;
        if (mine.progress > 0 && this.dustTimer >= 0.07) {
          this.dustTimer = 0;
          const dx =
            mine.drillDirection === "left"
              ? -0.5
              : mine.drillDirection === "right"
                ? 0.5
                : 0;
          this.burst(
            mine.renderX + 0.5 + dx,
            mine.renderY + (dx ? 0.6 : 1),
            0xbb9772,
            2,
            0.6,
          );
        }
      }
      bindings.onUpdate(dt);
      const s = mine.state;
      const width = this.scale.width,
        height = this.scale.height;
      const tile = height < 260 ? 24 : 32,
        scale = tile / 32;
      const worldX = (mine.renderX + 0.5) * tile;
      const worldY = (mine.renderY + 0.5) * tile;
      const targetX =
        width >= WIDTH * tile
          ? -(width - WIDTH * tile) / 2
          : Phaser.Math.Clamp(
              worldX - width / 2 + mine.velocityX * tile * 0.06,
              0,
              WIDTH * tile - width,
            );
      const targetY = Phaser.Math.Clamp(
        worldY - height * 0.42 + mine.velocityY * tile * 0.04,
        0,
        HEIGHT * tile - height,
      );
      const size = `${width}:${height}:${tile}`;
      if (
        changedMine ||
        size !== this.previousSize ||
        Math.abs(targetY - this.cameraY) > height * 2
      ) {
        this.cameraX = targetX;
        this.cameraY = targetY;
        this.previousSize = size;
      } else if (!paused) {
        const amount = 1 - Math.exp(-dt * 10);
        this.cameraX = Phaser.Math.Linear(this.cameraX, targetX, amount);
        this.cameraY = Phaser.Math.Linear(this.cameraY, targetY, amount);
      }
      const cx = this.cameraX,
        cy = this.cameraY;
      const px = worldX - cx,
        py = worldY - cy;
      const bg = this.background,
        g = this.marks,
        fx = this.effects;
      bg.clear();
      g.clear();
      fx.clear();
      for (const item of this.tiles) item.setVisible(false);
      for (const item of this.labels) item.setVisible(false);
      let labelIndex = 0;
      const text = (
        x: number,
        y: number,
        value: string,
        color = "#ded6b8",
        centered = false,
      ) => {
        const item = this.labels[labelIndex++];
        if (!item) return;
        item
          .setPosition(x, y)
          .setText(value)
          .setColor(color)
          .setOrigin(centered ? 0.5 : 0, 0)
          .setVisible(true);
      };
      bg.fillStyle(0x102628);
      bg.fillRect(0, 0, width, height);
      const surfaceY = (SURFACE + 1) * tile - cy;
      if (surfaceY > 0) {
        bg.fillStyle(0x243f42);
        bg.fillRect(0, 0, width, Math.min(height, surfaceY));
        bg.fillStyle(0x74918a, 0.6);
        bg.fillCircle(20 * tile - cx, 1.2 * tile - cy, 0.7 * tile);
        bg.fillStyle(0x243f42);
        bg.fillCircle(19.8 * tile - cx, 1.05 * tile - cy, 0.65 * tile);
        for (let i = 0; i < 9; i++) {
          const x = i * 3.4 * tile - cx;
          bg.fillStyle(i % 2 ? 0x345457 : 0x2d4b50);
          bg.fillTriangle(
            x - tile,
            surfaceY,
            x + tile,
            surfaceY - (1 + (i % 3)) * tile,
            x + 4 * tile,
            surfaceY,
          );
        }
        for (const [x, title, icon, color] of [
          [1, "EXCHANGE", "◆", 0xc6d4b0],
          [6, "FUEL", "F", 0xe8b568],
          [15, "REPAIR", "+", 0x85c9bf],
          [20, "UPGRADES", "↑", 0xc1b2df],
        ] as const) {
          const sx = x * tile - cx,
            sy = surfaceY - 1.5 * tile;
          bg.fillStyle(0x142d30);
          bg.fillRoundedRect(sx, sy, 3 * tile, 1.5 * tile, 3);
          bg.fillStyle(0x52716a);
          bg.fillRect(sx - 2, sy, 3 * tile + 4, 4);
          bg.fillStyle(0x284247);
          bg.fillRect(sx + 6, sy + 12, tile - 4, tile - 4);
          bg.fillRect(sx + 2 * tile, sy + 12, tile - 6, tile - 4);
          bg.fillStyle(color, 0.75);
          bg.fillRect(sx + 8, sy + 14, tile - 8, 3);
          bg.fillStyle(0x193032);
          bg.fillRect(sx + 1.2 * tile, sy + 16, 0.7 * tile, 1.1 * tile);
          if (sx > -3 * tile && sx < width) {
            text(sx + 1.5 * tile, sy - 17, title, "#d8dcbf", true);
            text(
              sx + 1.55 * tile,
              sy + 13,
              icon,
              Phaser.Display.Color.IntegerToColor(color).rgba,
              true,
            );
          }
        }
        g.lineStyle(2, 0xc9d3a9);
        g.lineBetween(-cx, surfaceY, WIDTH * tile - cx, surfaceY);
      }
      const firstRow = Math.max(SURFACE + 1, Math.floor(cy / tile));
      const lastRow = Math.min(HEIGHT - 1, Math.ceil((cy + height) / tile));
      const firstCol = Math.max(0, Math.floor(cx / tile));
      const lastCol = Math.min(WIDTH - 1, Math.ceil((cx + width) / tile));
      let visible = 0;
      for (let y = firstRow; y <= lastRow; y++) {
        for (let x = firstCol; x <= lastCol; x++) {
          const type = mine.tile(x, y),
            sx = x * tile - cx,
            sy = y * tile - cy;
          if (type === 0) {
            bg.fillStyle(0x071d22, 0.4);
            bg.fillTriangle(sx, sy, sx + tile, sy, sx, sy + tile);
            if ((x * 3 + y) % 4 === 0) {
              bg.fillStyle(0x6c8b79, 0.2);
              bg.fillRect(sx + 0.3 * tile, sy + 0.65 * tile, 3 * scale, scale);
            }
            continue;
          }
          let sprite = this.tiles[visible++];
          if (!sprite) {
            sprite = this.add.image(0, 0, ART_TEXTURE).setOrigin(0).setDepth(1);
            this.tiles.push(sprite);
          }
          sprite
            .setFrame(`tile-${type}-${(x * 17 + y * 31) % 3}`)
            .setPosition(sx, sy)
            .setScale(scale)
            .setVisible(true);
          // Highlight exposed faces, making walkable ledges and cave ceilings legible.
          if (mine.tile(x, y - 1) === 0) {
            g.fillStyle(
              type === 7 ? 0xf3a46e : type === 8 ? 0x82918b : 0xc49a70,
              0.7,
            );
            g.fillRect(sx, sy, tile, 2 * scale);
          }
          g.fillStyle(0x06181c, 0.65);
          if (mine.tile(x - 1, y) === 0)
            g.fillRect(sx, sy + 2 * scale, 2 * scale, tile - 2 * scale);
          if (mine.tile(x + 1, y) === 0)
            g.fillRect(
              sx + tile - 2 * scale,
              sy + 2 * scale,
              2 * scale,
              tile - 2 * scale,
            );
          if (mine.tile(x, y + 1) === 0)
            g.fillRect(sx, sy + tile - 2 * scale, tile, 2 * scale);
        }
      }
      for (let y = Math.ceil(firstRow / 10) * 10; y <= lastRow; y += 10) {
        g.lineStyle(1, 0xe1d8b4, 0.09);
        g.lineBetween(0, y * tile - cy, width, y * tile - cy);
        text(7, y * tile - cy + 3, `${(y - SURFACE) * 10} m`, "#a5b6aa");
      }
      const target = mine.drillTarget;
      if (target) {
        const x = target.x * tile - cx,
          y = target.y * tile - cy;
        g.fillStyle(0xf8d88d, 0.08 + mine.progress * 0.1);
        g.fillRect(x, y, tile, tile);
        g.lineStyle(2, 0xffdc8e, 0.95);
        g.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
      }
      const airborne = (!mine.grounded && !mine.docked) || mine.thrusting;
      const damaged = s.hull <= 0;
      const state = damaged
        ? "damaged"
        : mine.progress > 0
          ? mine.drillDirection === "down"
            ? "down"
            : "side"
          : airborne
            ? "flight"
            : Math.abs(mine.velocityX) > 0.15
              ? "drive"
              : "idle";
      const frame =
        state === "idle" || state === "damaged"
          ? 0
          : Math.floor(
              this.elapsed *
                (state === "drive"
                  ? Math.max(5, Math.abs(mine.velocityX) * 3)
                  : 18),
            ) % 4;
      const shake =
        this.flash > 0 && !paused ? Math.sin(this.elapsed * 90) * 2 * scale : 0;
      this.rig
        .setFrame(`rig-${state}-${frame}`)
        .setPosition(px + shake, py)
        .setScale(scale)
        .setFlipX(
          mine.drillDirection === "left" ||
            (mine.drillDirection !== "right" && mine.facing === "left"),
        );
      if (this.flash > 0) this.rig.setTint(0xffd5b7);
      else if (s.hull / maxHull(s) < 0.3) this.rig.setTint(0xd5a393);
      else this.rig.clearTint();
      if (mine.thrusting && !damaged) {
        const flicker = Math.sin(this.elapsed * 55) * 2 * scale;
        g.fillStyle(0xf1a65d, 0.5);
        g.fillTriangle(
          px - 5 * scale,
          py + 10 * scale,
          px + 5 * scale,
          py + 10 * scale,
          px,
          py + 25 * scale + flicker,
        );
        g.fillStyle(0xffe6a1, 0.85);
        g.fillTriangle(
          px - 3 * scale,
          py + 10 * scale,
          px + 3 * scale,
          py + 10 * scale,
          px,
          py + 18 * scale + flicker,
        );
      }
      for (const chip of this.chips) {
        fx.fillStyle(chip.color, Math.min(1, chip.life / chip.total));
        fx.fillRect(
          chip.x * tile - cx,
          chip.y * tile - cy,
          chip.size * scale,
          chip.size * scale,
        );
      }
      if (this.popup)
        text(
          this.popup.x * tile - cx,
          this.popup.y * tile - cy - 15 - (1.2 - this.popup.life) * 15,
          this.popup.text,
          this.popup.color,
          true,
        );
      if (mine.progress > 0) {
        fx.fillStyle(0x10282b, 0.95);
        fx.fillRoundedRect(px - 21, py - 29 * scale, 42, 5, 2);
        fx.fillStyle(0xffd58b);
        fx.fillRoundedRect(
          px - 20,
          py - 29 * scale + 1,
          40 * mine.progress,
          3,
          1,
        );
      }
      const dir = input.right ? 1 : input.left ? -1 : 0;
      const wall =
        dir &&
        mine.tile(Math.floor(s.x + dir * 0.58 + 0.5), Math.round(s.y)) !== 0;
      const status =
        mine.progress > 0
          ? `DRILLING ${mine.drillDirection?.toUpperCase()}`
          : wall && !mine.grounded && !input.up
            ? "LAND TO DRILL SIDEWAYS"
            : mine.thrusting
              ? "THRUST · STEER WITH ← →"
              : mine.grounded || mine.docked
                ? "TREADS DOWN"
                : "AIRBORNE";
      text(8, 8, status, target ? "#ffdb96" : "#bad4c6");
      if (this.inspect && !paused) {
        const type = mine.tile(this.inspect.x, this.inspect.y);
        if (isOre(type))
          text(
            width / 2,
            height - 27,
            `${ORES[type].name} · $${ORES[type].value.toLocaleString()} · mass ${ORES[type].mass}`,
            ORES[type].color,
            true,
          );
        else if (type === 7 || type === 8)
          text(
            width / 2,
            height - 27,
            type === 7 ? "MAGMA · Hull damage" : "BEDROCK · Cannot drill",
            "#efb78c",
            true,
          );
      }
      if (this.flash > 0) {
        fx.lineStyle(4, 0xff9475, this.flash * 2);
        fx.strokeRect(2, 2, width - 4, height - 4);
      }
      if (paused || s.fuel <= 0 || s.hull <= 0) {
        fx.fillStyle(0x071b20, 0.65);
        fx.fillRect(0, 0, width, height);
        text(
          width / 2,
          height / 2 - 12,
          paused ? "EXPEDITION PAUSED" : "RIG DISABLED · CALL RECOVERY",
          "#ffe0a7",
          true,
        );
      }
    }
  };
}
