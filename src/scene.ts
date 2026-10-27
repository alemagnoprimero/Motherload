import Phaser from "phaser";
import {
  Mine,
  WIDTH,
  worldHeight,
  STRATA,
  stratumAtDepth,
  magmaDamageAtDepth,
  SURFACE,
  ORES,
  isOre,
  maxHull,
  STATIONS,
  nearbyStation,
  type Controls,
  type StationId,
  type ServiceAction,
} from "./model";
import { DISCOVERY_RADIUS } from "./discovery";
import {
  ART_TEXTURE,
  MODELS_TEXTURE,
  SKY_TEXTURE,
  CAVE_TEXTURE,
  LIGHT_TEXTURE,
  VIGNETTE_TEXTURE,
  createArt,
  preloadArt,
  tileSizeForViewport,
} from "./art";
import { StationUi, type StationCommand } from "./station-ui";
import { insideRect, nearbyPromptRect } from "./station-layout";
export type { StationCommand } from "./station-ui";

export interface SceneBindings {
  getMine: () => Mine;
  isPaused: () => boolean;
  getControls: () => Controls;
  onUpdate: (dt: number) => void;
  getStation: () => StationId | undefined;
  onOpenStation: (station: StationId) => void;
  onCloseStation: () => void;
  onService: (action: ServiceAction) => void;
  isBusy: () => boolean;
  getStationCommand: () => StationCommand | undefined;
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
const STRATUM_TINTS = [
  0xffffff, 0xe3d4c4, 0xc6cedb, 0xb9d5dc, 0xdca99a, 0xb6a3d2,
] as const;

// One atlas, culled terrain and small recycled pools keep the scene lightweight.
// The camera follows the rig instead of shrinking the whole mine to phone width.
export function createMineScene(bindings: SceneBindings) {
  return class MineScene extends Phaser.Scene {
    private background!: Phaser.GameObjects.Graphics;
    private marks!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private fog!: Phaser.GameObjects.Graphics;
    private overlay!: Phaser.GameObjects.Graphics;
    private unknowns: Phaser.GameObjects.Image[] = [];
    private frontier: { name: string; depth: number; life: number } | undefined;
    private rig!: Phaser.GameObjects.Image;
    private sky!: Phaser.GameObjects.Image;
    private cave!: Phaser.GameObjects.TileSprite;
    private lamp!: Phaser.GameObjects.Image;
    private vignette!: Phaser.GameObjects.Image;
    private buildings: Phaser.GameObjects.Image[] = [];
    private loading: Phaser.GameObjects.Text | undefined;
    private artFailed = false;
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
    private stationUi!: StationUi;

    preload() {
      document.getElementById("game")?.setAttribute("aria-busy", "true");
      this.loading = this.add
        .text(
          this.scale.width / 2,
          this.scale.height / 2,
          "PREPARING EXPEDITION",
          {
            fontFamily: "system-ui, sans-serif",
            fontSize: "15px",
            color: "#ffbc70",
          },
        )
        .setOrigin(0.5);
      this.load.on("progress", (progress: number) => {
        this.loading?.setText(
          `PREPARING EXPEDITION · ${Math.round(progress * 100)}%`,
        );
      });
      this.load.on("loaderror", () => {
        this.artFailed = true;
      });
      preloadArt(this);
    }

    create() {
      this.loading?.destroy();
      const models = this.textures.exists(MODELS_TEXTURE)
        ? this.textures.get(MODELS_TEXTURE)
        : undefined;
      this.artFailed ||=
        !models?.has("rig-idle-0") ||
        !models?.has("building-exchange") ||
        !models?.has("ore-3");
      createArt(this);
      this.cave = this.add
        .tileSprite(0, 0, 1, 1, CAVE_TEXTURE)
        .setOrigin(0)
        .setDepth(-4);
      this.sky = this.add.image(0, 0, SKY_TEXTURE).setOrigin(0).setDepth(-3);
      this.lamp = this.add
        .image(0, 0, LIGHT_TEXTURE)
        .setDepth(3.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.vignette = this.add
        .image(0, 0, VIGNETTE_TEXTURE)
        .setOrigin(0)
        .setDepth(10);
      this.buildings = STATIONS.map((station) =>
        this.add
          .image(
            0,
            0,
            MODELS_TEXTURE,
            this.textures.get(MODELS_TEXTURE).has(`building-${station.id}`)
              ? `building-${station.id}`
              : "rig-idle-0",
          )
          .setOrigin(0.5, 1)
          .setDepth(3),
      );
      this.background = this.add.graphics().setDepth(0);
      this.marks = this.add.graphics().setDepth(2);
      this.rig = this.add
        .image(0, 0, MODELS_TEXTURE, "rig-idle-0")
        .setOrigin(0.5, 0.54)
        .setDepth(4);
      this.effects = this.add.graphics().setDepth(5);
      this.fog = this.add.graphics().setDepth(9);
      this.overlay = this.add.graphics().setDepth(11);
      this.stationUi = new StationUi(this, bindings);
      for (let i = 0; i < 30; i++)
        this.labels.push(
          this.add
            .text(0, 0, "", {
              fontFamily: "system-ui, sans-serif",
              fontSize: "11px",
              color: "#dce9f2",
              backgroundColor: "#101925c7",
              padding: { x: 7, y: 4 },
            })
            .setDepth(12),
        );
      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (bindings.getStation()) {
          this.stationUi.pointerUp(pointer, bindings.isBusy());
          return;
        }
        if (bindings.isBusy() || bindings.isPaused()) return;
        const tile = tileSizeForViewport(this.scale.width, this.scale.height);
        const nearby = nearbyStation(bindings.getMine().state);
        if (nearby) {
          const building = {
            x: nearby.left * tile - this.cameraX,
            y: (SURFACE + 1) * tile - this.cameraY - 2 * tile,
            width: nearby.width * tile,
            height: 2 * tile,
          };
          const prompt = nearbyPromptRect(this.scale.width, this.scale.height);
          if (
            (insideRect(pointer, building) &&
              insideRect({ x: pointer.downX, y: pointer.downY }, building)) ||
            (insideRect(pointer, prompt) &&
              insideRect({ x: pointer.downX, y: pointer.downY }, prompt))
          ) {
            this.inspect = undefined;
            bindings.onOpenStation(nearby.id);
            return;
          }
        }
        const x = Math.floor((pointer.x + this.cameraX) / tile);
        const y = Math.floor((pointer.y + this.cameraY) / tile);
        // Inspection follows the same sight rule as rendering. Clicking dark
        // terrain must never become a remote mineral detector.
        this.inspect = bindings.getMine().isVisible(x, y)
          ? { x, y, life: 3 }
          : undefined;
      });
      if (this.artFailed)
        bindings.getMine().message =
          "Artwork could not load. Reload the page to restore the full expedition view.";
      const host = document.getElementById("game");
      if (host) {
        host.dataset.artStatus = this.artFailed ? "unavailable" : "ready";
        host.setAttribute("aria-busy", "false");
      }
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
      this.stationUi.command(
        bindings.getStation(),
        mine,
        bindings.isBusy(),
        bindings.getStationCommand(),
      );
      const paused = bindings.isPaused();
      const input = bindings.getControls();
      const changedMine = this.previousMine !== mine;
      if (changedMine) {
        this.chips = [];
        this.popup = undefined;
        this.inspect = undefined;
        this.frontier = undefined;
        this.flash = 0;
        this.previousMine = mine;
      }
      const oldMined = mine.state.mined;
      const oldCargo = mine.state.inventory.length;
      const oldHull = mine.state.hull;
      const oldDeepest = mine.state.deepest;
      if (!paused) {
        mine.tick(dt, input);
        this.elapsed += dt;
        if (this.frontier && (this.frontier.life -= dt) <= 0)
          this.frontier = undefined;
        const reached = STRATA.filter(
          (entry) =>
            entry.depth > oldDeepest && entry.depth <= mine.state.deepest,
        ).at(-1);
        if (reached)
          this.frontier = {
            name: reached.name,
            depth: reached.depth,
            life: 4.5,
          };
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
      const rows = worldHeight(s);
      const width = this.scale.width,
        height = this.scale.height;
      const tile = tileSizeForViewport(width, height),
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
        worldY -
          height * (mine.thrusting && mine.velocityY < -1 ? 0.54 : 0.42) +
          mine.velocityY * tile * 0.04,
        0,
        Math.max(0, rows * tile - height),
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
        const amount = 1 - Math.exp(-dt * 8);
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
      this.fog.clear();
      this.overlay.clear();
      for (const item of this.tiles) item.setVisible(false);
      for (const item of this.unknowns) item.setVisible(false);
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
          .setOrigin(centered ? 0.5 : 0, 0)
          .setVisible(true);
        if (item.style.color !== color) item.setColor(color);
      };
      const currentStratum = STRATA.indexOf(
        stratumAtDepth(Math.max(0, (s.y - SURFACE) * 10)),
      );
      this.cave
        .setSize(width, height)
        .setTilePosition(cx * 0.42, cy * 0.42)
        .setTint(STRATUM_TINTS[currentStratum]);
      this.vignette.setDisplaySize(width, height).setAlpha(0.72);
      const lightSize = tile * (mine.progress ? 9 : 8.5);
      this.lamp
        .setPosition(px, py)
        .setDisplaySize(lightSize, lightSize)
        .setAlpha(s.y > SURFACE + 0.3 ? 1 : 0.25);
      // The far wall moves more slowly than the mine: excavated space has depth.
      bg.fillStyle(0x0b111d, 0.12 + Math.min(0.18, (s.y / rows) * 0.18));
      bg.fillRect(0, 0, width, height);
      const surfaceY = (SURFACE + 1) * tile - cy;
      this.sky.setVisible(surfaceY > 0);
      for (const building of this.buildings) building.setVisible(false);
      if (surfaceY > 0) {
        const skyHeight = Math.max(4 * tile, Math.min(height * 0.62, 6 * tile));
        this.sky
          .setPosition(0, surfaceY - skyHeight)
          .setDisplaySize(width, skyHeight);
        const sunX = width * 0.76 - cx * 0.08,
          sunY = surfaceY - tile * 2.8;
        for (let halo = 5; halo > 0; halo--) {
          bg.fillStyle(0xffc38d, 0.018);
          bg.fillCircle(sunX, sunY, tile * (0.4 + halo * 0.25));
        }
        bg.fillStyle(0xffe0a9, 0.9);
        bg.fillCircle(sunX, sunY, tile * 0.36);
        // Three layered escarpments drift at different rates behind the settlement.
        const layers = [
          { color: 0x715b66, alpha: 0.55, parallax: 0.12, rise: 2.3 },
          { color: 0x72505a, alpha: 0.8, parallax: 0.24, rise: 1.8 },
          { color: 0x452f39, alpha: 1, parallax: 0.42, rise: 0.9 },
        ];
        for (const layer of layers) {
          const points: Phaser.Types.Math.Vector2Like[] = [
            { x: -tile, y: surfaceY },
          ];
          const step = tile * 1.7;
          for (let i = -2; i <= width / step + 3; i++) {
            const x = i * step - ((cx * layer.parallax) % step);
            const ridge =
              0.55 +
              Math.sin(i * 1.73 + layer.rise) * 0.23 +
              Math.sin(i * 3.1) * 0.12;
            points.push({ x, y: surfaceY - tile * layer.rise * ridge });
            points.push({
              x: x + step * 0.28,
              y: surfaceY - tile * layer.rise * (ridge + 0.04),
            });
          }
          points.push({ x: width + tile, y: surfaceY });
          bg.fillStyle(layer.color, layer.alpha);
          bg.fillPoints(points, true);
        }
        bg.fillStyle(0x171f2b, 0.9);
        bg.fillRect(-cx, surfaceY - 7 * scale, WIDTH * tile, 9 * scale);
        bg.fillStyle(0xe9b578, 0.85);
        bg.fillRect(-cx, surfaceY, WIDTH * tile, 2 * scale);
        const nearby = nearbyStation(s);
        const signs = {
          exchange: ["ORE EXCHANGE", 0xf3bc71],
          fuel: ["FUEL DEPOT", 0xffae62],
          repair: ["REPAIR BAY", 0x69dae5],
          upgrades: ["WORKSHOP", 0xb6b0ff],
        } as const;
        STATIONS.forEach((station, index) => {
          const [title, color] = signs[station.id];
          const sx = station.left * tile - cx,
            sy = surfaceY - 2 * tile;
          if (sx + 3 * tile < 0 || sx > width) return;
          bg.fillStyle(0x050b14, 0.35);
          bg.fillEllipse(
            sx + 1.65 * tile,
            surfaceY - 2,
            3.1 * tile,
            0.24 * tile,
          );
          this.buildings[index]
            .setPosition(sx + 1.5 * tile, surfaceY + 3 * scale)
            .setDisplaySize(3 * tile, 2 * tile)
            .setVisible(true);
          const active = nearby?.id === station.id;
          g.fillStyle(color, active ? 0.45 : 0.12);
          g.fillRoundedRect(
            sx + 0.55 * tile,
            surfaceY - 4 * scale,
            1.9 * tile,
            5 * scale,
            2,
          );
          if (active) {
            g.lineStyle(2, color, 0.85);
            g.lineBetween(
              sx + 0.45 * tile,
              surfaceY + 2 * scale,
              sx + 2.55 * tile,
              surfaceY + 2 * scale,
            );
            g.fillStyle(color, 0.06);
            g.fillRect(sx, sy, 3 * tile, 2 * tile);
          }
          text(
            sx + 1.5 * tile,
            sy + 0.1 * tile,
            title,
            active ? "#ffe2ae" : "#d6e0ee",
            true,
          );
        });
        // Sparse surface dust catches the sunset without obscuring play.
        for (let i = 0; i < 18; i++) {
          const x =
            ((((i * 137.17 + this.elapsed * (4 + (i % 4)) - cx * 0.2) %
              (width + 80)) +
              width +
              80) %
              (width + 80)) -
            40;
          const y = surfaceY - 12 - ((i * 43.7) % Math.max(30, skyHeight - 30));
          bg.fillStyle(0xffc692, 0.12 + (i % 3) * 0.035);
          bg.fillCircle(x, y, i % 5 === 0 ? 1.6 : 0.8);
        }
      }
      const firstRow = Math.max(SURFACE + 1, Math.floor(cy / tile));
      const lastRow = Math.min(rows - 1, Math.ceil((cy + height) / tile));
      const firstCol = Math.max(0, Math.floor(cx / tile));
      const lastCol = Math.min(WIDTH - 1, Math.ceil((cx + width) / tile));
      let visible = 0,
        obscured = 0;
      const knownAir = (x: number, y: number) =>
        mine.isKnown(x, y) && mine.tile(x, y) === 0;
      for (let y = firstRow; y <= lastRow; y++) {
        const terrainTint =
          STRATUM_TINTS[STRATA.indexOf(stratumAtDepth((y - SURFACE) * 10))];
        for (let x = firstCol; x <= lastCol; x++) {
          const sx = x * tile - cx,
            sy = y * tile - cy;
          if (!mine.isKnown(x, y)) {
            let cover = this.unknowns[obscured++];
            if (!cover) {
              cover = this.add
                .image(0, 0, ART_TEXTURE)
                .setOrigin(0)
                .setDepth(9.1);
              this.unknowns.push(cover);
            }
            // Opaque, type-independent substrate also covers undiscovered air.
            // It sits above lights/effects so a cave cannot leak as a silhouette.
            cover
              .setFrame(`unknown-${(x * 17 + y * 31) % 3}`)
              .setPosition(sx, sy)
              .setDisplaySize(tile + 0.7, tile + 0.7)
              .setVisible(true);
            continue;
          }
          const type = mine.tile(x, y);
          const lit = mine.isVisible(x, y);
          const distanceSquared =
            (x - mine.renderX) ** 2 + (y - mine.renderY) ** 2;
          const shade = lit
            ? Math.min(
                0.42,
                (distanceSquared / (DISCOVERY_RADIUS * DISCOVERY_RADIUS)) *
                  0.42,
              )
            : type === 0
              ? 0.54
              : 0.76;
          this.fog.fillStyle(0x02050c, shade);
          this.fog.fillRect(sx, sy, tile + 0.3, tile + 0.3);
          if (type === 0) continue;
          let sprite = this.tiles[visible++];
          if (!sprite) {
            sprite = this.add.image(0, 0, ART_TEXTURE).setOrigin(0).setDepth(1);
            this.tiles.push(sprite);
          }
          sprite
            .setFrame(`tile-${type}-${(x * 17 + y * 31) % 3}`)
            .setPosition(sx, sy)
            .setDisplaySize(tile + 0.3, tile + 0.3)
            .setTint(terrainTint)
            .setVisible(true);
          // Highlight exposed faces, making walkable ledges and cave ceilings legible.
          if (knownAir(x, y - 1)) {
            g.fillStyle(
              type === 7 ? 0xffa568 : type === 8 ? 0x7f94b0 : 0xe5ae77,
              0.75,
            );
            g.fillRect(sx, sy, tile, 2 * scale);
          }
          g.fillStyle(0x050a13, 0.75);
          if (knownAir(x - 1, y))
            g.fillRect(sx, sy + 2 * scale, 2 * scale, tile - 2 * scale);
          if (knownAir(x + 1, y))
            g.fillRect(
              sx + tile - 2 * scale,
              sy + 2 * scale,
              2 * scale,
              tile - 2 * scale,
            );
          if (knownAir(x, y + 1))
            g.fillRect(sx, sy + tile - 2 * scale, tile, 2 * scale);
        }
      }
      for (let y = Math.ceil(firstRow / 10) * 10; y <= lastRow; y += 10) {
        g.lineStyle(1, 0xe1d8b4, 0.09);
        g.lineBetween(0, y * tile - cy, width, y * tile - cy);
        text(7, y * tile - cy + 3, `${(y - SURFACE) * 10} m`, "#798caa");
      }
      const target = mine.drillTarget;
      if (target && mine.isVisible(target.x, target.y)) {
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
      const shake = paused
        ? 0
        : this.flash > 0
          ? Math.sin(this.elapsed * 90) * 2 * scale
          : mine.progress > 0
            ? Math.sin(this.elapsed * 80) * 0.35 * scale
            : 0;
      this.rig
        .setFrame(`rig-${state}-${frame}`)
        .setPosition(px + shake, py)
        .setDisplaySize(tile * 1.5, tile * 1.5)
        .setRotation(
          state === "flight"
            ? Phaser.Math.Clamp(mine.velocityX * 0.012, -0.1, 0.1)
            : 0,
        )
        .setFlipX(
          mine.drillDirection === "left" ||
            (mine.drillDirection !== "right" && mine.facing === "left"),
        );
      if (this.flash > 0) this.rig.setTint(0xffd5b7);
      else if (s.hull / maxHull(s) < 0.3) this.rig.setTint(0xd5a393);
      else this.rig.clearTint();
      // Soft contact shadow and a warm headlamp bind the rig to the excavation.
      if (mine.grounded || mine.docked) {
        g.fillStyle(0x03070e, 0.38);
        g.fillEllipse(
          px + 2 * scale,
          py + 0.34 * tile,
          tile * 0.85,
          tile * 0.17,
        );
      }
      if (s.y > SURFACE + 0.4 && !damaged) {
        const facing = mine.facing === "left" ? -1 : 1;
        fx.fillStyle(0xffd39a, 0.035);
        fx.fillTriangle(
          px + facing * tile * 0.3,
          py,
          px + facing * tile * 3,
          py - tile * 0.75,
          px + facing * tile * 3,
          py + tile * 0.9,
        );
      }
      if (mine.thrusting && !damaged) {
        const flicker = Math.sin(this.elapsed * 55) * 2 * scale;
        g.fillStyle(0x4cc5e5, 0.35);
        g.fillTriangle(
          px - 5 * scale,
          py + 10 * scale,
          px + 5 * scale,
          py + 10 * scale,
          px,
          py + 25 * scale + flicker,
        );
        g.fillStyle(0xc1f9ff, 0.85);
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
        this.overlay.fillStyle(0x111c2b, 0.95);
        this.overlay.fillRoundedRect(px - 21, py - 29 * scale, 42, 5, 2);
        this.overlay.fillStyle(0xffb45a);
        this.overlay.fillRoundedRect(
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
                ? s.y <= SURFACE + 0.2
                  ? "SURFACE OUTPOST"
                  : "READY TO MINE"
                : "IN FLIGHT";
      text(8, 8, status, target ? "#ffdb96" : "#bad4c6");
      const nearby = nearbyStation(s);
      const station = bindings.getStation();
      if (nearby && !paused && !station) {
        const prompt = nearbyPromptRect(width, height);
        this.overlay.fillStyle(0x142334, 0.96);
        this.overlay.fillRoundedRect(
          prompt.x,
          prompt.y,
          prompt.width,
          prompt.height,
          6,
        );
        this.overlay.lineStyle(1, 0xffb45a);
        this.overlay.strokeRoundedRect(
          prompt.x,
          prompt.y,
          prompt.width,
          prompt.height,
          6,
        );
        text(
          width / 2,
          prompt.y + 12,
          `E / Enter or tap · ${nearby.name}`,
          "#ffe1a1",
          true,
        );
      } else if (
        this.inspect &&
        !paused &&
        !station &&
        mine.isVisible(this.inspect.x, this.inspect.y)
      ) {
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
            type === 7
              ? `MAGMA · ${magmaDamageAtDepth((this.inspect.y - SURFACE) * 10)} hull damage`
              : "BEDROCK · Cannot drill",
            "#efb78c",
            true,
          );
      }
      if (this.frontier && !station && !paused) {
        const noticeWidth = Math.min(350, width - 24),
          noticeX = (width - noticeWidth) / 2;
        this.overlay.fillStyle(0x101d2e, 0.94);
        this.overlay.fillRoundedRect(noticeX, 40, noticeWidth, 57, 8);
        this.overlay.lineStyle(1, 0x65d4df, 0.75);
        this.overlay.strokeRoundedRect(noticeX, 40, noticeWidth, 57, 8);
        text(width / 2, 47, this.frontier.name.toUpperCase(), "#ffce8b", true);
        text(
          width / 2,
          70,
          `New frontier · ${this.frontier.depth.toLocaleString()} m`,
          "#c8dcea",
          true,
        );
      }
      if (this.flash > 0) {
        this.overlay.lineStyle(4, 0xff9475, this.flash * 2);
        this.overlay.strokeRect(2, 2, width - 4, height - 4);
      }
      if (!station && (paused || s.fuel <= 0 || s.hull <= 0)) {
        this.overlay.fillStyle(0x070d19, 0.66);
        this.overlay.fillRect(0, 0, width, height);
        text(
          width / 2,
          height / 2 - 12,
          paused ? "EXPEDITION PAUSED" : "RIG DISABLED · CALL RECOVERY",
          "#ffe0a7",
          true,
        );
      }
      this.stationUi.render(station, mine, bindings.isBusy());
    }
  };
}
