import Phaser from "phaser";
import type { Campaign } from "./model";
import type { CampaignControls, CampaignPackage, CampaignWorld } from "./types";
import { campaignSafeArea, campaignTileSize } from "./layout";
import { CampaignPointer, TOUCH_JOYSTICK } from "./pointer";
import { campaignPois, campaignSignal, type MissionPoi } from "./poi";
import { W02_HAZARDS } from "./frontier";
import { campaignOreMarker, drawOreMarker } from "../mineral-legend";
export { campaignSafeArea, campaignTileSize } from "./layout";

export const CAMPAIGN_TEXTURE = "campaign-w01";
export const FRONTIER_TEXTURE = "campaign-w02";

export interface CampaignSceneBindings {
  getCampaign: () => Campaign;
  isPaused: () => boolean;
  getControls: () => CampaignControls;
  onUpdate: (dt: number) => void;
  onInteract?: () => void;
  onPilotGesture?: () => void;
  onEvent?: (kind: "cut" | "pickup" | "damage" | "thrust" | "idle") => void;
  reducedMotion?: () => boolean;
  getInterfaceMode?: () => "welcome" | "menu" | "dock" | "map" | undefined;
  getDockBounds?: () =>
    { x: number; y: number; width: number; height: number } | undefined;
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
    private wreckage!: Phaser.GameObjects.Graphics;
    private wreckMaskShape!: Phaser.GameObjects.Graphics;
    private wreckMask!: Phaser.Display.Masks.GeometryMask;
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
    private previousInterface: string | undefined;
    private framingTime = 0;
    private elapsed = 0;
    private artFailed = false;
    private lastMined = 0;
    private lastCargo = 0;
    private previousCargoIds = new Set<string>();
    private lastHull = 0;
    private damageLife = 0;
    private chips: Chip[] = [];
    private pointerPilot = new CampaignPointer();
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
          "PREPARING THE EXPEDITION",
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
      this.load.atlas(
        FRONTIER_TEXTURE,
        new URL(
          "../../assets/campaign/generated/w02-atlas.png",
          import.meta.url,
        ).href,
        new URL(
          "../../assets/campaign/generated/w02-atlas.json",
          import.meta.url,
        ).href,
      );
      this.load.image(
        "frontier-sky",
        new URL("../../assets/campaign/generated/w02-sky.png", import.meta.url)
          .href,
      );
      this.load.image(
        "frontier-ridge-far",
        new URL(
          "../../assets/campaign/generated/w02-ridge-far.png",
          import.meta.url,
        ).href,
      );
      this.load.image(
        "frontier-ridge-near",
        new URL(
          "../../assets/campaign/generated/w02-ridge-near.png",
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
      this.artFailed ||=
        !this.textures.exists(FRONTIER_TEXTURE) ||
        ["ice-0", "ore-o3", "mission-sample", "mission-catalyst"].some(
          (name) => !this.textures.get(FRONTIER_TEXTURE).has(name),
        );
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
      this.wreckMaskShape = this.add.graphics().setVisible(false);
      this.wreckMask = this.wreckMaskShape.createGeometryMask();
      this.wreckage = this.add.graphics().setDepth(14).setMask(this.wreckMask);
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
      const canvas = this.game.canvas;
      const events = new AbortController();
      const eventOptions = { signal: events.signal };
      const point = (event: PointerEvent) => {
        const bounds = canvas.getBoundingClientRect();
        return {
          x: ((event.clientX - bounds.left) / bounds.width) * this.scale.width,
          y: ((event.clientY - bounds.top) / bounds.height) * this.scale.height,
        };
      };
      const clearPointer = () => {
        const id = this.pointerPilot.current?.id;
        this.pointerPilot.clear();
        canvas.style.cursor = "crosshair";
        if (id !== undefined && canvas.hasPointerCapture(id))
          canvas.releasePointerCapture(id);
      };
      canvas.style.cursor = "crosshair";
      canvas.addEventListener(
        "pointerdown",
        (event) => {
          if (bindings.isPaused() || document.hidden || event.button !== 0)
            return;
          const position = point(event);
          if (
            !this.pointerPilot.begin(
              event.pointerId,
              position.x,
              position.y,
              event.pointerType === "touch" ? "touch" : "mouse",
            )
          )
            return;
          document
            .getElementById("campaign-game")
            ?.focus({ preventScroll: true });
          event.preventDefault();
          canvas.setPointerCapture(event.pointerId);
          bindings.onPilotGesture?.();
        },
        eventOptions,
      );
      canvas.addEventListener(
        "pointermove",
        (event) => {
          if (this.pointerPilot.current?.id !== event.pointerId) return;
          if (
            bindings.isPaused() ||
            (event.pointerType === "mouse" && !(event.buttons & 1))
          ) {
            clearPointer();
            return;
          }
          const position = point(event);
          this.pointerPilot.move(event.pointerId, position.x, position.y);
        },
        eventOptions,
      );
      canvas.addEventListener(
        "pointerup",
        (event) => {
          if (this.pointerPilot.current?.id !== event.pointerId) return;
          const position = point(event);
          this.pointerPilot.move(event.pointerId, position.x, position.y);
          const tap = this.pointerPilot.end(event.pointerId);
          clearPointer();
          if (
            tap &&
            !bindings.isPaused() &&
            tap.x >= 0 &&
            tap.x < this.scale.width &&
            tap.y >= 0 &&
            tap.y < this.scale.height
          )
            this.inspectAt(tap.x, tap.y);
        },
        eventOptions,
      );
      canvas.addEventListener(
        "contextmenu",
        (event) => {
          if (
            (event as PointerEvent).pointerType === "touch" ||
            this.pointerPilot.current?.kind === "touch"
          )
            event.preventDefault();
        },
        eventOptions,
      );
      for (const eventName of ["pointercancel", "lostpointercapture"] as const)
        canvas.addEventListener(
          eventName,
          (event) => {
            if (this.pointerPilot.current?.id === event.pointerId)
              clearPointer();
          },
          eventOptions,
        );
      window.addEventListener("blur", clearPointer, eventOptions);
      document.addEventListener("visibilitychange", clearPointer, eventOptions);
      document.addEventListener(
        "focusin",
        (event) => {
          if ((event.target as Element | null)?.closest("dialog"))
            clearPointer();
        },
        eventOptions,
      );
      this.scale.on("resize", clearPointer);
      this.events.once("shutdown", () => {
        clearPointer();
        events.abort();
        this.scale.off("resize", clearPointer);
      });
      bindings.onUpdate(0);
    }

    private inspectAt(screenX: number, screenY: number) {
      const campaign = bindings.getCampaign();
      const world = campaign.world;
      const worldX = (screenX + this.cameraX) / this.tile;
      const worldY = (screenY + this.cameraY) / this.tile;
      if (
        campaign.atDock &&
        Math.abs(
          delta(worldX, campaign.activeWorldDefinition.dockX, world.width),
        ) < 2.6 &&
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
      const icy = bindings.getCampaign().state.currentWorld === "W02";
      const sharedUpgrade =
        /^rig-(engine|energy|bay|hull)-2$/.test(frame) ||
        /^rig-drill-collar-(left|right|down)-2$/.test(frame);
      const worldFrame = icy
        ? frame
            .replace(/^soil-(\d+)$/, "ice-$1")
            .replace(/^stone-(\d+)$/, "frozen-rock-$1")
        : frame;
      const texture =
        (icy || frame.startsWith("tool-") || sharedUpgrade) &&
        this.textures.exists(FRONTIER_TEXTURE) &&
        this.textures.get(FRONTIER_TEXTURE).has(worldFrame)
          ? FRONTIER_TEXTURE
          : CAMPAIGN_TEXTURE;
      const actualFrame = texture === FRONTIER_TEXTURE ? worldFrame : frame;
      if (
        !this.textures.exists(texture) ||
        !this.textures.get(texture).has(actualFrame)
      )
        return false;
      let image = this.images[this.imageIndex++];
      if (!image) {
        image = this.add.image(0, 0, texture);
        this.images.push(image);
      }
      image
        .setTexture(texture, actualFrame)
        .setPosition(x, y)
        .setOrigin(0.5, originY)
        .setDisplaySize(width, height)
        .setDepth(depth)
        .setAlpha(alpha)
        .setFlipX(flip)
        .clearTint()
        .clearMask()
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
            stroke: "#071018",
            strokeThickness: 3,
            shadow: {
              offsetX: 0,
              offsetY: 1,
              color: "#071018",
              blur: 4,
              fill: true,
            },
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
      return label;
    }

    /** Wrecks are scenery, not terrain: a shared known-cell mask hides buried pieces. */
    private wreck(
      poi: MissionPoi,
      x: number,
      y: number,
      tile: number,
      alpha: number,
    ) {
      const g = this.wreckage;
      const X = (offset: number) => x + offset * tile;
      const Y = (offset: number) => y + offset * tile;
      const plate = (points: number[][], color = 0x334b55) => {
        const shape = points.map(([a, b]) => ({ x: X(a!), y: Y(b!) }));
        g.fillStyle(color, alpha);
        g.fillPoints(shape, true);
        g.lineStyle(1.4, 0x8da6ab, alpha * 0.8);
        g.strokePoints(shape, true);
      };
      const line = (
        a: number,
        b: number,
        c: number,
        d: number,
        color = 0x9bacb1,
        size = 2,
      ) => {
        g.lineStyle(size, color, alpha);
        g.lineBetween(X(a), Y(b), X(c), Y(d));
      };
      if (poi.kind === "sample") {
        line(-0.34, 0.43, -0.34, -0.32, 0x92bfc9, 3);
        line(0.34, 0.43, 0.34, -0.32, 0x92bfc9, 3);
        plate(
          [
            [-0.39, -0.36],
            [-0.24, -0.64],
            [0.24, -0.64],
            [0.39, -0.36],
            [0.34, 0.32],
            [-0.34, 0.32],
          ],
          0x386d82,
        );
        line(-0.23, -0.41, 0.23, -0.41, 0xf7c673, 3);
        line(-0.23, 0.19, 0.23, 0.19, 0xaedce5, 3);
        line(0.1, -0.63, 0.1, -1.27, 0x95c3cb, 2);
        g.fillStyle(poi.status === "source" ? 0xf7c673 : 0x49d8c6, alpha);
        g.fillCircle(X(0.1), Y(-1.27), tile * 0.065);
        if (poi.status === "source") {
          g.fillStyle(0x85e8e0, alpha);
          g.fillEllipse(x, Y(-0.1), tile * 0.24, tile * 0.37);
        }
        return;
      }
      if (poi.kind === "cryo") {
        for (const [offset, top] of [
          [-0.44, -0.64],
          [0, -0.98],
          [0.42, -0.7],
        ])
          plate(
            [
              [offset! - 0.2, 0.3],
              [offset! - 0.17, top! + 0.28],
              [offset!, top!],
              [offset! + 0.2, top! + 0.24],
              [offset! + 0.14, 0.3],
            ],
            poi.status === "source" ? 0x80c6d1 : 0x355c6c,
          );
        line(-0.81, 0.42, 0.81, 0.42, 0xd9af70, 3);
        line(-0.81, 0.42, -0.81, -0.36, 0xd9af70, 2);
        line(0.81, 0.42, 0.81, -0.36, 0xd9af70, 2);
        return;
      }
      if (poi.kind === "catalyst") {
        plate(
          [
            [-1.1, -0.5],
            [-0.77, -1.02],
            [0.7, -1.02],
            [1.08, -0.47],
            [1.08, 0.51],
            [-1.1, 0.51],
          ],
          0x315567,
        );
        plate(
          [
            [-0.65, -0.76],
            [0.62, -0.76],
            [0.83, -0.35],
            [0.83, 0.31],
            [-0.83, 0.31],
            [-0.83, -0.35],
          ],
          0x102e40,
        );
        line(-1.1, 0.55, 1.1, 0.55, 0xcda66e, 4);
        line(-0.9, -0.5, -0.9, -1.55, 0xb5dce3, 3);
        g.lineStyle(2, 0xf7c673, alpha);
        g.strokeCircle(X(-0.9), Y(-1.61), tile * 0.12);
        if (poi.status === "source") {
          g.fillStyle(0x93efe3, alpha * 0.7);
          g.fillEllipse(x, Y(-0.22), tile * 0.5, tile * 0.79);
          g.fillStyle(0xf7e9aa, alpha);
          g.fillCircle(x, Y(-0.13), tile * 0.1);
        }
        return;
      }
      // Torn ground plates and exposed cables make the whole footprint a salvage site.
      plate(
        [
          [-1.35, 0.38],
          [-0.55, 0.15],
          [0.55, 0.38],
          [1.3, 0.64],
          [0.4, 0.83],
          [-1.1, 0.66],
        ],
        0x243943,
      );
      line(-1.25, 0.72, -0.55, 0.58, 0xc18c54);
      line(-0.55, 0.58, 0.25, 0.76, 0xc18c54);
      line(0.25, 0.76, 1.36, 0.48, 0xc18c54);

      if (poi.kind === "beacon") {
        plate([
          [-1.35, -0.46],
          [-0.84, -0.83],
          [0.55, -0.62],
          [1.2, 0.26],
          [0.45, 0.54],
          [-1.04, 0.34],
        ]);
        plate(
          [
            [-0.98, -0.43],
            [-0.73, -0.64],
            [-0.2, -0.55],
            [-0.36, -0.16],
          ],
          0x172b34,
        );
        line(-1.06, 0.02, -0.34, 0.16);
        line(0.44, -0.48, 0.88, 0.08);
        // The transmitter projects up the approach shaft, left of the rig.
        // Its mast and control panel can be recognised before the buried hull
        // enters survey range; the same known-cell mask still clips every part.
        line(-0.88, -0.28, -0.88, -2.02, 0xb4c6c5, 4);
        line(-0.88, -1.93, -1.3, -1.8, 0xd2a66e, 3);
        line(-0.88, -1.93, -0.46, -1.8, 0xd2a66e, 3);
        line(-0.88, -0.32, -1.32, -0.07, 0xaababa, 3);
        plate(
          [
            [-1.29, -1.9],
            [-0.59, -1.9],
            [-0.59, -1.23],
            [-1.29, -1.23],
          ],
          0x38545d,
        );
        plate(
          [
            [-1.19, -1.79],
            [-0.69, -1.79],
            [-0.69, -1.47],
            [-1.19, -1.47],
          ],
          0x122d37,
        );
        const signalColor = poi.status === "surveyed" ? 0x93d9c2 : 0xf0b86e;
        line(-1.14, -1.69, -1.02, -1.69, signalColor, 2);
        line(-1.02, -1.69, -0.95, -1.58, signalColor, 2);
        line(-0.95, -1.58, -0.84, -1.72, signalColor, 2);
        line(-0.84, -1.72, -0.73, -1.72, signalColor, 2);
        line(-1.14, -1.36, -0.74, -1.36, 0xc6b17f, 3);
        g.fillStyle(signalColor, alpha);
        g.fillCircle(X(-0.88), Y(-2.04), tile * 0.08);
      } else if (poi.kind === "valve") {
        g.fillStyle(0x2d454f, alpha);
        g.fillRoundedRect(
          X(-1.05),
          Y(-0.42),
          tile * 2.1,
          tile * 0.85,
          tile * 0.24,
        );
        g.lineStyle(2, 0x92aaad, alpha);
        g.strokeRoundedRect(
          X(-1.05),
          Y(-0.42),
          tile * 2.1,
          tile * 0.85,
          tile * 0.24,
        );
        for (const offset of [-0.65, 0.65])
          line(offset, -0.43, offset, 0.43, 0xbdc7bc, 3);
        line(-1.04, -0.02, -1.48, -0.02, 0xc7ac7b, 4);
        line(1.04, 0.12, 1.43, 0.12, 0xc7ac7b, 4);
        line(0.1, -0.4, 0.1, -0.94, 0xc7ac7b, 4);
        line(-0.15, -0.94, 0.35, -0.94, 0xc7ac7b, 3);
        g.lineStyle(2, 0xe1b779, alpha);
        g.strokeCircle(X(0), Y(0), tile * 0.34);
      } else if (poi.kind === "antenna") {
        line(-0.8, 0.55, 0.55, -0.96, 0xb7c7c9, 4);
        line(-0.7, 0.5, 0.08, 0.43, 0x819ba3, 3);
        line(0.08, 0.43, 0.55, -0.96, 0x819ba3, 3);
        plate(
          [
            [0.08, -1.06],
            [0.28, -0.65],
            [0.98, -0.56],
            [1.29, -0.89],
            [0.63, -1.22],
          ],
          0x536b71,
        );
        line(0.27, -0.83, 0.94, -1.37, 0xe2bb83);
        g.fillStyle(0xf0b86e, alpha);
        g.fillCircle(X(0.96), Y(-1.39), tile * 0.055);
        plate(
          [
            [-1.23, 0.08],
            [-0.9, -0.16],
            [-0.45, 0.05],
            [-0.65, 0.36],
          ],
          0x50626a,
        );
      } else if (poi.kind === "core") {
        plate(
          [
            [-1.2, -0.43],
            [-0.8, -0.82],
            [0.72, -0.82],
            [1.18, -0.35],
            [1.18, 0.39],
            [0.72, 0.76],
            [-0.8, 0.76],
            [-1.2, 0.34],
          ],
          0x314b56,
        );
        plate(
          [
            [-0.79, -0.52],
            [0.62, -0.52],
            [0.89, -0.25],
            [0.89, 0.27],
            [0.57, 0.49],
            [-0.78, 0.49],
          ],
          0x152b35,
        );
        line(-0.96, -0.3, -0.96, 0.28, 0xe3b574, 4);
        line(0.98, -0.25, 0.98, 0.28, 0xe3b574, 4);
        for (const offset of [-0.45, 0, 0.45])
          line(offset, -0.68, offset, -0.52, 0x8ddbd6, 3);
      }
      if (poi.status === "carried" || poi.status === "banked") {
        g.fillStyle(0x10252e, alpha);
        g.fillCircle(x, y, tile * 0.25);
        g.lineStyle(1.5, 0x8ba9ad, alpha);
        g.strokeCircle(x, y, tile * 0.25);
        line(-0.15, 0, 0.15, 0, 0x92c2b5);
      }
      for (const [a, b] of [
        [-1.08, 0.45],
        [1.01, 0.49],
        [-0.44, 0.6],
      ]) {
        g.fillStyle(0xc6c9b9, alpha);
        g.fillCircle(X(a!), Y(b!), Math.max(1.5, tile * 0.025));
      }
    }

    private missionLabel(
      x: number,
      y: number,
      rigX: number,
      rigY: number,
      tile: number,
      safe: { top: number; bottom: number },
      text: string,
      color: string,
    ) {
      const width = this.scale.width,
        height = this.scale.height;
      const beside =
        height <= 420 ||
        (Math.abs(x - rigX) < tile * 0.8 &&
          Math.abs(y - tile * 1.5 - rigY) < tile);
      const left = x <= rigX;
      const anchorX = beside
        ? Math.max(20, Math.min(width - 20, x + (left ? -1 : 1) * tile * 0.85))
        : Math.max(135, Math.min(width - 135, x));
      const label = this.label(
        anchorX,
        y - tile * (beside ? 0.25 : 1.5),
        text,
        color,
        beside ? (left ? "right" : false) : true,
      );
      if (beside)
        label.setWordWrapWidth(
          Math.max(75, left ? anchorX - 14 : width - anchorX - 14),
          true,
        );
      let labelY = Math.max(
        safe.top + 5,
        Math.min(height - safe.bottom - label.height - 8, label.y),
      );
      // The completed landmark label and a new survey toast can coexist.
      for (const id of [
        "campaign-danger",
        "campaign-message",
        "campaign-extraction",
      ]) {
        const overlay = document.getElementById(id);
        if (
          !overlay ||
          overlay.hidden ||
          (id === "campaign-message"
            ? !overlay.classList.contains("visible")
            : Number(getComputedStyle(overlay).opacity) <= 0)
        )
          continue;
        const box = overlay.getBoundingClientRect();
        const bounds = label.getBounds();
        if (
          bounds.right > box.left &&
          bounds.left < box.right &&
          labelY < box.bottom &&
          labelY + label.height > box.top
        )
          labelY = Math.max(safe.top + 5, box.top - label.height - 8);
      }
      label.setY(labelY);
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
        this.pointerPilot.clear();
        this.previousCampaign = campaign;
        this.previousWorld = campaign.world;
        this.previousX = campaign.renderX;
        this.previousY = campaign.renderY;
        this.unwrappedX = campaign.renderX;
        this.lastMined = campaign.state.stats.mined;
        this.lastCargo = campaign.cargo.length;
        this.previousCargoIds = new Set(campaign.cargo.map((item) => item.id));
        this.lastHull = campaign.state.vehicle.hull;
        this.inspection = undefined;
        this.popup = undefined;
        this.chips = [];
        this.damageLife = 0;
      }
      if (paused) this.pointerPilot.clear();
      const pointerControls = this.pointerPilot.controls(
        this.unwrappedX * this.tile - this.cameraX,
        campaign.renderY * this.tile - this.cameraY,
      );
      const oldTarget = campaign.drillTarget;
      if (!paused) {
        const controls = bindings.getControls();
        for (const action of Object.keys(
          pointerControls,
        ) as (keyof CampaignControls)[])
          if (pointerControls[action]) controls[action] = true;
        campaign.tick(dt, controls);
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
      const icy = world.id === "W02";
      const dockX = campaign.activeWorldDefinition.dockX;
      if (changed) {
        this.sky.setTexture(icy ? "frontier-sky" : "campaign-sky");
        this.ridgeFar.setTexture(
          icy ? "frontier-ridge-far" : "campaign-ridge-far",
        );
        this.ridgeNear.setTexture(
          icy ? "frontier-ridge-near" : "campaign-ridge-near",
        );
      }
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
        const collected = campaign.cargo.filter(
          (item) => !this.previousCargoIds.has(item.id),
        );
        this.burst(this.unwrappedX, campaign.renderY, 0xf0a43c, 6);
        this.popup = {
          text:
            collected.length === 1
              ? `+ ${collected[0]!.name}`
              : `+ ${collected.length || campaign.cargo.length - this.lastCargo} cargo`,
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
      this.previousCargoIds = new Set(campaign.cargo.map((item) => item.id));
      this.lastHull = vehicle.hull;

      const width = this.scale.width;
      const height = this.scale.height;
      this.tile = campaignTileSize(width, height);
      const tile = this.tile;
      const safe = campaignSafeArea(
        width,
        height,
        matchMedia("(pointer: coarse)").matches,
      );
      const usable = Math.max(100, height - safe.top - safe.bottom);
      const interfaceMode = bindings.getInterfaceMode?.();
      const dock =
        interfaceMode === "dock" ? bindings.getDockBounds?.() : undefined;
      if (interfaceMode !== this.previousInterface) {
        this.previousInterface = interfaceMode;
        this.framingTime = 0.5;
      }
      let targetX =
        this.unwrappedX * tile - width / 2 + campaign.velocityX * tile * 0.06;
      let targetY = campaign.renderY * tile - (safe.top + usable * 0.46);
      // Docking frames the ship in the uncovered world. Only the presentation
      // camera moves here; paused machinery, hazards and inventory never tick.
      if (dock) {
        const sideConsole = dock.x > width * 0.18;
        const screenX = sideConsole ? Math.max(86, dock.x / 2) : width / 2;
        const surface = sideConsole
          ? height * 0.7
          : Math.max(tile * 3, dock.y - 20);
        targetX =
          (this.unwrappedX + delta(campaign.renderX, dockX, world.width)) *
            tile -
          screenX;
        targetY = -surface;
      }
      const size = `${width}:${height}:${tile}`;
      if (changed || jumped || size !== this.previousSize) {
        this.cameraX = targetX;
        this.cameraY = targetY;
        this.previousSize = size;
      } else if (!paused || this.framingTime > 0 || dock) {
        const amount = bindings.reducedMotion?.() ? 1 : 1 - Math.exp(-dt * 8);
        this.cameraX += (targetX - this.cameraX) * amount;
        this.cameraY += (targetY - this.cameraY) * amount;
      }
      this.framingTime = Math.max(0, this.framingTime - dt);
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
      this.wreckage.clear();
      this.wreckMaskShape.clear().fillStyle(0xffffff);
      for (const image of this.images) image.setVisible(false);
      for (const label of this.labels) label.setVisible(false);
      this.imageIndex = 0;
      this.labelIndex = 0;

      graphics.fillStyle(icy ? 0x102b3d : 0x17232b);
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
          graphics.fillStyle(
            (icy
              ? [0x133348, 0x193f52, 0x214a5a]
              : [0x1c2a32, 0x223039, 0x29383e])[plane]!,
            0.45,
          );
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
            edges.fillStyle(icy ? 0x0b2332 : 0x111c24);
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
          if (row < world.rows)
            this.wreckMaskShape.fillRect(
              x - tile / 2,
              y - tile / 2,
              tile,
              tile,
            );
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
              edges.fillStyle(
                icy
                  ? type === 1
                    ? 0x80afbc
                    : 0x426c80
                  : type === 1
                    ? 0x56616a
                    : 0x3f4c54,
                alpha,
              );
              edges.fillRect(
                x - tile / 2,
                y - tile / 2,
                tile + 0.5,
                tile + 0.5,
              );
            }
            if (type === 3) {
              edges.fillStyle(icy ? 0x102b3d : 0x17232b, 0.75);
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
                icy
                  ? `${type === 2 ? "frozen-rock" : "ice"}-edge-${mask}`
                  : `soil-edge-${mask}`,
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
            if (icy && item.tags.includes("volatile") && lit) {
              const pending = campaign.volatileWindow?.packageIds.includes(
                item.id,
              );
              const wave = bindings.reducedMotion?.()
                ? 0
                : Math.sin(this.elapsed * 1.8) * 0.025;
              this.screen.lineStyle(
                pending ? 2 : 1.3,
                pending ? 0xf7c673 : 0x49d8c6,
                alpha * 0.75,
              );
              this.screen.strokeCircle(x, y, tile * (0.43 + wave));
              if (item.tags.includes("intact")) {
                this.screen.lineStyle(2, 0xd4f9ef, alpha);
                this.screen.lineBetween(
                  x - tile * 0.1,
                  y + tile * 0.08,
                  x,
                  y + tile * 0.17,
                );
                this.screen.lineBetween(
                  x,
                  y + tile * 0.17,
                  x + tile * 0.17,
                  y - tile * 0.09,
                );
              }
            }
            if (number && lit)
              drawOreMarker(
                this.screen,
                campaignOreMarker(number).marker,
                x + tile * 0.27,
                y + tile * 0.27,
                Math.max(10, tile * 0.2),
                alpha,
              );
          }
        }
      }

      // Surface infrastructure repeats around the same finite circumference.
      if (surfaceY > -tile * 3 && surfaceY < height + tile * 4) {
        const firstPeriod = Math.floor(cx / (world.width * tile)) - 1;
        const lastPeriod = Math.ceil((cx + width) / (world.width * tile)) + 1;
        const stage = Math.min(3, campaign.completedMilestones.length);
        for (let period = firstPeriod; period <= lastPeriod; period++) {
          const x = (dockX + period * world.width) * tile - cx;
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
            icy
              ? stage === 3
                ? "CONDENSER STABILIZED"
                : "COMET REFUGE"
              : stage === 3
                ? "LANDER RESTORED"
                : "SALVAGE LANDER",
            "#F6E1AF",
          );
          if (stage >= 1 && !icy)
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
          if (stage >= 2 && !icy)
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
        const dockOffset = delta(campaign.renderX, dockX, world.width);
        if (Math.abs(dockOffset * tile) > width / 2 - tile * 2) {
          this.label(
            dockOffset < 0 ? 18 : width - 18,
            Math.max(safe.top + 8, surfaceY - tile * 1.6),
            `${dockOffset < 0 ? "← " : ""}${icy ? "REFUGE" : "LANDER"} · ${Math.round(Math.abs(dockOffset) * 10)} m${dockOffset > 0 ? " →" : ""}`,
            "#F6E1AF",
            dockOffset > 0 ? "right" : false,
          );
        }
      }

      const pois = campaignPois(campaign);
      const signal = campaignSignal(campaign);
      const poiScreenTargets: {
        id: string;
        x: number;
        y: number;
        known: boolean;
        status: string;
        lit: boolean;
      }[] = [];
      const sourceMarkers: string[] = [];
      const labeledSites = new Set<string>();
      for (const poi of pois) {
        const x =
          (this.unwrappedX + delta(campaign.renderX, poi.x, world.width)) *
            tile -
          cx;
        const y = poi.y * tile - cy;
        if (
          x < -tile * 1.6 ||
          x > width + tile * 1.6 ||
          y < -tile * 2.15 ||
          y > height + tile * 1.6
        )
          continue;
        let knownFootprint = false;
        let litFootprint = false;
        for (
          let row = Math.floor(poi.y - (poi.kind === "beacon" ? 2.1 : 1.5));
          row <= Math.floor(poi.y + 0.9);
          row++
        )
          for (
            let column = Math.floor(poi.x - 1.5);
            column <= Math.floor(poi.x + 1.5);
            column++
          ) {
            if (row < 0 || row >= world.rows) continue;
            knownFootprint ||= campaign.isKnown(wrap(column, world.width), row);
            litFootprint ||= campaign.isVisible(wrap(column, world.width), row);
          }
        if (!knownFootprint) continue;
        const alpha = litFootprint ? 0.95 : 0.42;
        this.wreck(poi, x, y, tile, alpha);
        poiScreenTargets.push({
          id: poi.id,
          x: Math.round(x),
          y: Math.round(y),
          known: poi.known,
          status: poi.status,
          lit: litFootprint,
        });
        if (
          poi.known &&
          (poi.status === "source" || poi.status === "surveyed")
        ) {
          if (
            this.image(
              poi.frame,
              x,
              y,
              tile * 0.8,
              tile * 0.8,
              15,
              poi.visible ? 1 : 0.42,
            )
          )
            this.images[this.imageIndex - 1]!.setMask(this.wreckMask);
          if (poi.status === "source") sourceMarkers.push(poi.id);
        }
        const distance = Math.hypot(
          delta(campaign.renderX, poi.x, world.width),
          poi.y - campaign.renderY,
        );
        const clustered = poi.kind === "sample" || poi.kind === "cryo";
        if (
          poi.visible &&
          distance < 3.8 &&
          poi.id !== signal?.targetId &&
          !(
            clustered &&
            (signal?.poi.kind === poi.kind || labeledSites.has(poi.kind))
          )
        ) {
          if (clustered) labeledSites.add(poi.kind);
          const suffix =
            poi.status === "surveyed"
              ? " · surveyed"
              : poi.status === "carried" || poi.status === "banked"
                ? " · recovered"
                : " · mission part";
          this.missionLabel(
            x,
            y,
            px,
            py,
            tile,
            safe,
            poi.title + (clustered ? "" : suffix),
            poi.status === "source" ? "#F6E1AF" : "#A7D8C5",
          );
        }
      }
      // A local mission radio pin may cross fog; it never draws terrain or ore.
      // The broad physical wreck underneath remains clipped to discovered cells.
      let poiMarkerX = "",
        poiMarkerY = "",
        poiMarkerVisible = false;
      if (signal && signal.kind !== "lander" && signal.band !== "distant") {
        const poi = signal.poi;
        const x =
          (this.unwrappedX + delta(campaign.renderX, poi.x, world.width)) *
            tile -
          cx;
        const y = poi.y * tile - cy;
        const minY = safe.top + 22,
          maxY = Math.max(minY, height - safe.bottom - 22);
        const markerX = Math.max(26, Math.min(width - 26, x));
        const markerY = Math.max(minY, Math.min(maxY, y));
        const onScreen = x >= 26 && x <= width - 26 && y >= minY && y <= maxY;
        const pulse = bindings.reducedMotion?.()
          ? 0
          : Math.sin(this.elapsed * 3) * 2;
        const radius = poi.known ? tile * 0.53 + pulse : 15 + pulse;
        this.screen.lineStyle(1.6, 0xf6cb85, 0.9);
        if (onScreen) {
          this.screen.strokeCircle(markerX, markerY, radius);
          for (const side of [-1, 1]) {
            const a = markerX + side * (radius + 5);
            this.screen.lineBetween(a, markerY - 5, a, markerY + 5);
          }
        } else {
          const angle = Math.atan2(y - markerY, x - markerX);
          this.screen.strokeCircle(markerX, markerY, 10);
          this.screen.fillStyle(0xf6cb85, 0.95);
          const ax = markerX + Math.cos(angle) * 17,
            ay = markerY + Math.sin(angle) * 17;
          this.screen.fillTriangle(
            ax,
            ay,
            markerX + Math.cos(angle + 1.6) * 6,
            markerY + Math.sin(angle + 1.6) * 6,
            markerX + Math.cos(angle - 1.6) * 6,
            markerY + Math.sin(angle - 1.6) * 6,
          );
        }
        poiMarkerX = markerX.toFixed(2);
        poiMarkerY = markerY.toFixed(2);
        poiMarkerVisible = true;
        if (onScreen) {
          const text = poi.known
            ? poi.title
            : `${
                {
                  beacon: "Wreck",
                  valve: "Valve",
                  antenna: "Antenna",
                  core: "Core",
                  sample: "Sample",
                  cryo: "Crystal",
                  catalyst: "Catalyst",
                  lander: "Refuge",
                }[poi.kind]
              } signal`;
          this.missionLabel(
            markerX,
            markerY,
            px,
            py,
            tile,
            safe,
            `${text} · ${signal.distanceMeters} m`,
            "#F6D39B",
          );
        }
      }
      if (icy) {
        const cold = campaign.coldStatus;
        for (const pocket of W02_HAZARDS.coldPockets) {
          if (!campaign.isKnown(pocket.x, pocket.y)) continue;
          const x =
            (this.unwrappedX + delta(campaign.renderX, pocket.x, world.width)) *
              tile -
            cx;
          const y = pocket.y * tile - cy;
          if (
            x < -tile * 2 ||
            x > width + tile * 2 ||
            y < -tile * 2 ||
            y > height + tile * 2
          )
            continue;
          const nearby =
            Math.hypot(
              delta(vehicle.x, pocket.x, world.width),
              vehicle.y - pocket.y,
            ) < 3;
          const warning =
            nearby && cold?.warning !== null && cold?.warning !== undefined;
          this.wreckage.fillStyle(0x96e5e3, warning ? 0.18 : 0.07);
          this.wreckage.fillEllipse(x, y, tile * 2.6, tile * 1.7);
          this.image(
            "cold-warning",
            x,
            y - tile * 0.4,
            tile * 0.65,
            tile * 0.65,
            16,
            0.85,
          );
          if (warning)
            this.missionLabel(
              x,
              y,
              px,
              py,
              tile,
              safe,
              "Cold mist forming · move clear",
              "#BDEFF0",
            );
          if (
            campaign.isVisible(pocket.x, pocket.y) &&
            !bindings.reducedMotion?.()
          ) {
            this.wreckage.lineStyle(1.5, 0xb6e9eb, warning ? 0.55 : 0.2);
            for (let wisp = 0; wisp < 4; wisp++) {
              const drift = Math.sin(this.elapsed + wisp * 1.7) * tile * 0.15;
              this.wreckage.lineBetween(
                x - tile + wisp * tile * 0.45,
                y + drift,
                x - tile * 0.65 + wisp * tile * 0.45,
                y - tile * 0.22 + drift,
              );
            }
          }
        }
        for (const vent of W02_HAZARDS.vents) {
          if (!campaign.isKnown(vent.x, vent.y)) continue;
          const x =
            (this.unwrappedX + delta(campaign.renderX, vent.x, world.width)) *
              tile -
            cx;
          const y = vent.y * tile - cy;
          if (
            x < -tile * 2 ||
            x > width + tile * 2 ||
            y < -tile * 2 ||
            y > height + tile * 2
          )
            continue;
          this.image("ice-vent", x, y, tile, tile, 16, 0.9);
          this.wreckage.lineStyle(2, 0xf7c673, 0.55);
          this.wreckage.strokeTriangle(
            x - tile * 0.4,
            y + tile * 0.2,
            x + tile * 0.4,
            y + tile * 0.2,
            x,
            y - tile * 0.5,
          );
          if (
            Math.hypot(
              delta(vehicle.x, vent.x, world.width),
              vehicle.y - vent.y,
            ) < 2.8
          )
            this.missionLabel(
              x,
              y,
              px,
              py,
              tile,
              safe,
              "Ice vent · keep clear",
              "#F7D796",
            );
        }
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
      const pointer = this.pointerPilot.current;
      const joystick = this.pointerPilot.joystick;
      this.game.canvas.style.cursor = pointer?.active
        ? "grabbing"
        : "crosshair";
      if (joystick && !paused) {
        this.screen.fillStyle(0x0d1a1b, 0.2);
        this.screen.fillCircle(
          joystick.centerX,
          joystick.centerY,
          TOUCH_JOYSTICK.radius,
        );
        this.screen.lineStyle(1.5, 0xbce7d4, 0.6);
        this.screen.strokeCircle(
          joystick.centerX,
          joystick.centerY,
          TOUCH_JOYSTICK.radius,
        );
        this.screen.lineStyle(1, 0xbce7d4, 0.22);
        this.screen.strokeCircle(
          joystick.centerX,
          joystick.centerY,
          TOUCH_JOYSTICK.deadZone,
        );
        this.screen.lineStyle(2, 0xbce7d4, 0.45);
        this.screen.lineBetween(
          joystick.centerX,
          joystick.centerY,
          joystick.knobX,
          joystick.knobY,
        );
        this.screen.fillStyle(0x9cd8cc, 0.4);
        this.screen.fillCircle(
          joystick.knobX,
          joystick.knobY,
          TOUCH_JOYSTICK.knobRadius,
        );
        this.screen.lineStyle(1.5, 0xd6f4e8, 0.85);
        this.screen.strokeCircle(
          joystick.knobX,
          joystick.knobY,
          TOUCH_JOYSTICK.knobRadius,
        );
        if (pointer?.active) this.inspection = undefined;
      } else if (pointer?.active && !paused) {
        const dx = pointer.x - px,
          dy = pointer.y - py,
          distance = Math.hypot(dx, dy),
          length = Math.min(distance, this.tile * 1.1),
          targetX = px + (distance ? (dx / distance) * length : 0),
          targetY = py + (distance ? (dy / distance) * length : 0);
        this.screen.lineStyle(1.5, 0xbce7d4, 0.65);
        this.screen.strokeCircle(pointer.x, pointer.y, 11);
        if (distance > 20) {
          this.screen.lineBetween(px, py, targetX, targetY);
          this.screen.fillStyle(0xbce7d4, 0.9);
          this.screen.fillCircle(targetX, targetY, 3);
        } else this.screen.strokeCircle(px, py, 20);
        this.inspection = undefined;
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
        `rig-engine-${Math.min(2, campaign.state.hardware.engine)}`,
        px,
        rigY,
        rigSize,
        rigSize,
        21,
        1,
        flip,
      );
      this.image(
        `rig-energy-${Math.min(2, campaign.state.hardware.energy)}`,
        px,
        rigY,
        rigSize,
        rigSize,
        21,
        1,
        flip,
      );
      this.image(
        `rig-bay-${Math.min(2, campaign.state.hardware.cargo)}`,
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
        `rig-hull-${Math.min(2, campaign.state.hardware.hull)}`,
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
      if (campaign.state.equipped.drill === "W02-R1")
        this.image("tool-thermal", px, rigY, rigSize, rigSize, 23, 1, flip);
      if (campaign.state.equipped.utilities.includes("W02-R2"))
        this.image("tool-condenser", px, rigY, rigSize, rigSize, 23, 1, flip);
      if (campaign.state.equipped.processor === "W02-R3")
        this.image(
          "tool-preservation",
          px,
          rigY,
          rigSize,
          rigSize,
          23,
          1,
          flip,
        );
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
          `rig-drill-collar-${campaign.drillDirection || "right"}-${Math.min(2, campaign.state.hardware.drill)}`,
          px,
          rigY,
          rigSize,
          rigSize,
          23,
          1,
          campaign.drillDirection ? false : flip,
        );
      if (icy && campaign.precisionActive) {
        this.screen.lineStyle(1.5, 0x84e9dc, 0.8);
        this.screen.strokeCircle(px, py, tile * 0.66);
      }
      const volatile = campaign.volatileWindow;
      if (icy && volatile) {
        this.screen.lineStyle(4, 0x142c3a, 0.95);
        this.screen.strokeCircle(px, py, tile * 0.72);
        this.screen.lineStyle(3, 0xf7c673, 1);
        this.screen.beginPath();
        this.screen.arc(
          px,
          py,
          tile * 0.72,
          -Math.PI / 2,
          -Math.PI / 2 +
            Math.PI * 2 * Math.max(0, Math.min(1, volatile.remaining / 0.75)),
        );
        this.screen.strokePath();
      }
      if (
        icy &&
        campaign.state.equipped.drill === "W02-R1" &&
        campaign.drillTarget
      ) {
        const contactX =
          px +
          (campaign.drillDirection === "left"
            ? -0.48
            : campaign.drillDirection === "right"
              ? 0.48
              : 0) *
            tile;
        const contactY =
          py + (campaign.drillDirection === "down" ? 0.48 : 0.12) * tile;
        fx.fillStyle(0xf7c673, 0.16);
        fx.fillCircle(contactX, contactY, tile * 0.28);
        if (!bindings.reducedMotion?.())
          for (let plume = 0; plume < 3; plume++) {
            const phase = (this.elapsed * 1.3 + plume / 3) % 1;
            fx.fillStyle(0xc0e5e6, (1 - phase) * 0.18);
            fx.fillCircle(
              contactX + Math.sin(plume * 1.8) * tile * phase * 0.2,
              contactY - phase * tile * 0.75,
              tile * (0.08 + phase * 0.14),
            );
          }
      }
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
      if (callout) {
        let labelY = Math.max(safe.top + 12, height - safe.bottom - 44);
        const danger = document.getElementById("campaign-danger");
        if (danger && !danger.hidden) {
          const bounds = danger.getBoundingClientRect();
          if (bounds.top < labelY + 28 && bounds.bottom > labelY)
            labelY = Math.max(safe.top + 12, bounds.top - 36);
        }
        this.label(width / 2, labelY, callout, "#F6E1AF");
      }
      const host = document.getElementById("campaign-game");
      if (host) {
        for (const [key, value] of Object.entries({
          pointerActive: String(Boolean(pointer?.active && !paused)),
          pointerDirections: Object.keys(pointerControls).join(","),
          joystickVisible: String(Boolean(joystick && !paused)),
          joystickCenterX: joystick?.centerX.toFixed(2) ?? "",
          joystickCenterY: joystick?.centerY.toFixed(2) ?? "",
          joystickKnobX: joystick?.knobX.toFixed(2) ?? "",
          joystickKnobY: joystick?.knobY.toFixed(2) ?? "",
          rigScreenX: px.toFixed(2),
          rigScreenY: py.toFixed(2),
          rigWorldX: campaign.renderX.toFixed(4),
          rigWorldY: campaign.renderY.toFixed(4),
          campaignWorld: world.id,
          worldWidth: String(world.width),
          worldRows: String(world.rows),
          worldTexture: icy ? FRONTIER_TEXTURE : CAMPAIGN_TEXTURE,
          volatileCue: String(Boolean(volatile)),
          volatileRemaining: volatile?.remaining.toFixed(3) ?? "",
          precisionActive: String(Boolean(campaign.precisionActive)),
          coldWarning: String(Boolean(campaign.coldStatus?.warning)),
          poiLandmarks: poiScreenTargets.map((poi) => poi.id).join(","),
          poiSourceMarkers: sourceMarkers.join(","),
          poiScreenTargets: JSON.stringify(poiScreenTargets),
          poiSignalTarget: signal?.targetId ?? "",
          poiSignalBand: signal?.band ?? "",
          poiTargetKnown: String(Boolean(signal?.poi.known)),
          poiTargetVisible: String(Boolean(signal?.poi.visible)),
          poiMarkerVisible: String(poiMarkerVisible),
          poiMarkerX,
          poiMarkerY,
          worldCallout: String(Boolean(callout)),
          inspection: this.inspection && callout ? callout : "",
        }))
          if (host.dataset[key] !== value) host.dataset[key] = value;
        const shell = host.parentElement;
        if (shell)
          for (const [key, value] of Object.entries({
            "--dock-prompt-x": `${Math.round(Math.max(90, Math.min(width - 90, px)))}px`,
            "--dock-prompt-y": `${Math.round(Math.max(safe.top + 50, py - tile * 0.72))}px`,
          }))
            if (shell.style.getPropertyValue(key) !== value)
              shell.style.setProperty(key, value);
      }
      if (this.artFailed) this.loading.setPosition(width / 2, safe.top + 18);
      bindings.onUpdate(dt);
    }
  };
}
