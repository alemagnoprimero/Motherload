import Phaser from "phaser";
import type { Campaign } from "./model";
import type { CampaignEvent } from "./events";
import type { CampaignControls, CampaignPackage, CampaignWorld } from "./types";
import { campaignSafeArea, campaignTileSize } from "./layout";
import {
  CAMERA_ZOOM,
  CampaignView,
  RenderScaleBudget,
  backoffLine,
  cameraZoomTarget,
  campaignCameraY,
  followSpring,
  harnessOptions,
  qualityTier,
  renderDebugOptions,
  surfaceFraming,
  type CameraSafeArea,
} from "./view";
import type { CampaignDebug } from "./debug";
import { CampaignPointer, TOUCH_JOYSTICK } from "./pointer";
import { mergePilotControls } from "./input";
import { campaignPois, campaignSignal, type MissionPoi } from "./poi";
import { W02_HAZARDS } from "./frontier";
import { RetainedTerrain } from "./render/terrain";
import { CampaignLighting } from "./render/lighting";
import { CampaignArt } from "./render/art";
import { renderRig } from "./render/rig";
import { T1LiteHeadlamp } from "./render/t1-lite-headlamp";
import { T1LiteGroundLight } from "./render/t1-lite-ground-light";
import { RenderDiagnostics } from "./render/diagnostics";
import {
  FIELD_LOG_FRAME,
  poiArtwork,
  poiSecondaryCaption,
} from "./render/poi-art";
export { campaignSafeArea, campaignTileSize } from "./layout";

export const CAMPAIGN_TEXTURE = "campaign-w01";
export const FRONTIER_TEXTURE = "campaign-w02";
/**
 * Audit T13a: with `?debug=test-raster`, the dev placeholder for the raster
 * asset path stands in the 60 m scene, in the improvement fixture's W01 shaft
 * (column 31) two tiles above the rig, at scenery depth under the light map,
 * so a delivered PNG can be reviewed in context. A debug aid: it is drawn
 * whether or not its cell is known.
 */
const TEST_RASTER = { frame: "test-raster", world: "W01", x: 31.5, y: 3.5 };
/** Canvas markers that are annotations, not scenery: hidden with `?overlays=0`. */
const ANNOTATION_FRAMES = new Set([
  "cold-warning",
  "warning-shelf",
  FIELD_LOG_FRAME,
]);

export interface CampaignSceneBindings {
  getCampaign: () => Campaign;
  getSafeArea?: () => CameraSafeArea;
  onView?: (view: CampaignView) => void;
  renderScale?: () => number;
  cameraShake?: () => boolean;
  presentationActive?: () => boolean;
  isPaused: () => boolean;
  getControls: () => CampaignControls;
  onUpdate: (dt: number) => void;
  onInteract?: () => void;
  onPilotGesture?: () => void;
  onEvent?: (event: CampaignEvent) => void;
  reducedMotion?: () => boolean;
  highContrast?: () => boolean;
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
    readonly view = new CampaignView();
    private resolutionBudget = new RenderScaleBudget();
    private renderDebug = renderDebugOptions(location.search);
    private overlaysVisible = harnessOptions(location.search).overlays;
    /** Harness hook: hold `elapsed`, so the looping animation keeps its phase. */
    private sceneClockFrozen = false;
    private debugHooks: CampaignDebug | undefined;
    private frameReadout: HTMLElement | undefined;
    private frameReadoutTimer = 0;
    private frameP95: number | undefined;
    private art!: CampaignArt;
    private diagnostics!: RenderDiagnostics;
    private artQuality = 2;
    private contextZoom = 1;
    /** F5: the zoom's spring velocity, per second. */
    private zoomVelocity = 0;
    /** F5: the followed screen centre in world tiles, and its velocity. */
    private focusX = 0;
    private focusY = 0;
    private focusVelocityX = 0;
    private focusVelocityY = 0;
    private renderedFrames = 0;
    private presentation:
      | { type: "install" | "construction"; started: number; id?: string }
      | undefined;
    private terrainLayer!: RetainedTerrain;
    private lightingLayer!: CampaignLighting;
    /** T1-lite: the interim headlamp core, until T1's light stack. */
    private headlamp!: T1LiteHeadlamp;
    /** T1-lite: the rig's cabin sprite as drawn this frame, for the lamp. */
    private rigCabin: Phaser.GameObjects.Image | undefined;
    /** T1-lite: the interim surface ground light, until T1's light stack. */
    private groundLight!: T1LiteGroundLight;
    private background!: Phaser.GameObjects.Graphics;
    private edges!: Phaser.GameObjects.Graphics;
    private contrastEdges!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private screen!: Phaser.GameObjects.Graphics;
    private wreckMaskShape!: Phaser.GameObjects.Graphics;
    private wreckMask!: Phaser.Display.Masks.GeometryMask;
    private images: Phaser.GameObjects.Image[] = [];
    private labels: Phaser.GameObjects.Text[] = [];
    private skyGradient!: Phaser.GameObjects.Image;
    private sky!: Phaser.GameObjects.TileSprite;
    private ridgeFar!: Phaser.GameObjects.TileSprite;
    private ridgeNear!: Phaser.GameObjects.TileSprite;
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
    private landingLife = 0;
    private debrisTimer = 0;
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
      this.view.configure(
        host?.clientWidth || 1280,
        host?.clientHeight || 720,
        1,
        48,
        { top: 0, bottom: 0 },
      );
      host?.setAttribute("aria-busy", "true");
      if (host) host.dataset.campaignArt = "loading";
      this.loading = this.add
        .text(
          this.view.width / 2,
          this.view.height / 2,
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
      this.art = new CampaignArt(this);
      this.art.preload(bindings.getCampaign());
    }

    create() {
      const required = [
        "sky-body",
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
        bindings.getCampaign().world.id === "W02" &&
        (!this.textures.exists(FRONTIER_TEXTURE) ||
          ["ore-o3", "mission-sample", "mission-catalyst", "sky-body"].some(
            (name) => !this.textures.get(FRONTIER_TEXTURE).has(name),
          ));
      this.art.created();
      const initialPrefix =
        bindings.getCampaign().world.id === "W02" ? "frontier" : "campaign";
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

      this.diagnostics = new RenderDiagnostics(this, (milliseconds, dt) => {
        this.resolutionBudget.sample(milliseconds, dt);
      });
      // Quality tier is chosen once, from the renderer and the device (§7).
      const webgl = this.game.renderer.type !== Phaser.CANVAS;
      let fragmentHighp = false;
      if (webgl) {
        const gl = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer)
          .gl;
        fragmentHighp =
          (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
            ?.precision ?? 0) > 0;
      }
      this.resolutionBudget.setTier(
        qualityTier(
          webgl ? "webgl" : "canvas",
          fragmentHighp,
          matchMedia("(pointer: coarse)").matches,
        ),
      );
      this.resolutionBudget.pin = this.renderDebug.backingPin;
      // Boot uploads and shader compilation are a loading window.
      this.resolutionBudget.hold(1);
      if (this.renderDebug.frameTime) {
        this.frameReadout = document.createElement("div");
        this.frameReadout.id = "campaign-frametime";
        this.frameReadout.setAttribute("aria-hidden", "true");
        // Mid-height on the left edge is playfield in every layout; on phones
        // the bottom corners hold the Dock button and the tool block.
        Object.assign(this.frameReadout.style, {
          position: "fixed",
          left: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: "1000",
          padding: "4px 6px",
          borderRadius: "3px",
          background: "rgba(8, 16, 20, 0.82)",
          color: "#f6e1af",
          font: "12px/1.3 ui-monospace, monospace",
          pointerEvents: "none",
          // The policy line can outgrow a phone: wrap it inside the screen.
          whiteSpace: "pre-wrap",
          maxWidth: "calc(100vw - 24px)",
        });
        // Inside the safe area where env() is supported; 8px stays otherwise.
        this.frameReadout.style.left = "max(8px, env(safe-area-inset-left))";
        this.frameReadout.textContent = "p95 —\nbacking —\npolicy —";
        document.body.append(this.frameReadout);
      }
      this.setOverlays(this.overlaysVisible);
      this.terrainLayer = new RetainedTerrain(this);
      this.lightingLayer = new CampaignLighting(this);
      // T1-lite: additive headlamp core above the darkness, below the rig.
      this.headlamp = new T1LiteHeadlamp(this);
      // T1-lite: additive soft ground light on the surface, below the lamp.
      this.groundLight = new T1LiteGroundLight(this);
      this.background = this.add.graphics().setDepth(0);
      this.edges = this.add.graphics().setDepth(11);
      this.contrastEdges = this.add.graphics().setDepth(12);
      this.effects = this.add.graphics().setDepth(24);
      this.screen = this.add.graphics().setDepth(40);
      this.installDebugHooks();
      this.wreckMaskShape = this.add.graphics().setVisible(false);
      this.wreckMask = this.wreckMaskShape.createGeometryMask();
      // Stretch a gradient once; only the transparent stars may tile. The
      // former combined sky repeated its planet and horizon on tall displays.
      for (const [key, top, bottom] of [
        ["campaign-sky-gradient", "#14232b", "#48616b"],
        ["frontier-sky-gradient", "#142b45", "#5d91a0"],
      ] as const) {
        if (this.textures.exists(key)) continue;
        const gradientTexture = this.textures.createCanvas(key, 4, 512);
        if (!gradientTexture) continue;
        const context = gradientTexture.context;
        const gradient = context.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, top);
        gradient.addColorStop(1, bottom);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 4, 512);
        gradientTexture.refresh();
      }
      this.skyGradient = this.add
        .image(0, 0, "campaign-sky-gradient")
        .setOrigin(0)
        .setDepth(1);
      this.sky = this.add
        .tileSprite(0, 0, 1, 1, initialPrefix + "-sky")
        .setOrigin(0)
        .setDepth(1.1);
      this.ridgeFar = this.add
        .tileSprite(0, 0, 1, 1, initialPrefix + "-ridge-far")
        .setOrigin(0)
        .setDepth(2);
      this.ridgeNear = this.add
        .tileSprite(0, 0, 1, 1, initialPrefix + "-ridge-near")
        .setOrigin(0)
        .setDepth(3);
      for (const [kind, colour] of [
        ["silver", "#ecfffa"],
        ["gold", "#ffdfa0"],
      ]) {
        const texture = this.textures.createCanvas(
          `campaign-fx-glint-${kind}`,
          32,
          32,
        )!;
        const context = texture.context;
        context.strokeStyle = colour!;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(3, 16);
        context.lineTo(29, 16);
        context.moveTo(16, 3);
        context.lineTo(16, 29);
        context.stroke();
        texture.refresh();
      }
      const canvas = this.game.canvas;
      const events = new AbortController();
      const eventOptions = { signal: events.signal };
      const point = (event: PointerEvent) => {
        const bounds = canvas.getBoundingClientRect();
        return this.view.clientToScreen(event.clientX, event.clientY, bounds);
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
              this.inspectableAt(position.x, position.y),
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
            tap.x < this.view.width &&
            tap.y >= 0 &&
            tap.y < this.view.height
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
        this.diagnostics.destroy();
        this.terrainLayer.destroy();
        this.lightingLayer.destroy();
        this.headlamp.destroy(); // T1-lite
        this.groundLight.destroy(); // T1-lite
        this.frameReadout?.remove();
        if (window.__campaignDebug === this.debugHooks)
          delete window.__campaignDebug;
        delete document.body.dataset.annotations;
      });
      bindings.onUpdate(0);
    }

    /** `window.__campaignDebug` (debug.ts): read-only probes and harness switches. */
    private installDebugHooks() {
      const hooks: CampaignDebug = {
        lightTexture: async () => this.lightingLayer.snapshot(),
        overlays: (visible) => {
          if (visible !== undefined) this.setOverlays(visible);
          return this.overlaysVisible;
        },
        sceneClock: {
          freeze: (seconds = this.elapsed) => {
            this.elapsed = seconds;
            this.sceneClockFrozen = true;
            return this.elapsed;
          },
          resume: () => {
            this.sceneClockFrozen = false;
            return this.elapsed;
          },
          read: () => ({
            elapsed: this.elapsed,
            frozen: this.sceneClockFrozen,
          }),
        },
        fade: () => {
          const fade = this.cameras.main.fadeEffect;
          return {
            running: fade.isRunning,
            complete: fade.isComplete,
            direction: fade.direction ? "out" : "in",
            progress: fade.progress,
          };
        },
        backing: () => this.resolutionBudget.state(),
        worldLabels: () =>
          this.labels
            .filter((label) => label.visible)
            .map((label) => {
              const bounds = label.getBounds();
              return {
                text: label.text,
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              };
            })
            .filter(
              (label) =>
                label.x < this.view.width &&
                label.x + label.width > 0 &&
                label.y < this.view.height &&
                label.y + label.height > 0,
            ),
      };
      this.debugHooks = hooks;
      window.__campaignDebug = hooks;
    }

    /**
     * Annotations off: DOM overlays go to opacity 0 (style.css), so their
     * boxes still shape the camera and stay clickable; canvas labels, the
     * screen layer, UI strokes and marker images are not drawn.
     */
    private setOverlays(visible: boolean) {
      this.overlaysVisible = visible;
      if (visible) delete document.body.dataset.annotations;
      else document.body.dataset.annotations = "off";
    }

    private inspectableAt(screenX: number, screenY: number) {
      const campaign = bindings.getCampaign(),
        world = campaign.world;
      const point = this.view.screenToWorld(screenX, screenY);
      if (
        campaign.atDock &&
        Math.abs(
          delta(point.x, campaign.activeWorldDefinition.dockX, world.width),
        ) < 2.6 &&
        point.y < 0.2
      )
        return true;
      const x = wrap(Math.floor(point.x), world.width),
        y = Math.floor(point.y);
      return (
        campaign.isVisible(x, y) &&
        (world.packages.some(
          (item) =>
            (item.status === "deposit" || item.status === "exposed") &&
            Math.floor(item.x) === x &&
            Math.floor(item.y) === y,
        ) ||
          world.missions.some(
            (item) =>
              item.status === "source" &&
              Math.floor(item.x) === x &&
              Math.floor(item.y) === y,
          ))
      );
    }

    private inspectAt(screenX: number, screenY: number) {
      const campaign = bindings.getCampaign();
      const world = campaign.world;
      const { x: worldX, y: worldY } = this.view.screenToWorld(
        screenX,
        screenY,
      );
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
      if (!this.overlaysVisible && ANNOTATION_FRAMES.has(frame)) return false;
      const icy = bindings.getCampaign().state.currentWorld === "W02";
      const sharedUpgrade =
        /^rig-(engine|energy|bay|hull)-2$/.test(frame) ||
        /^rig-drill-collar-(left|right|down)-2$/.test(frame);
      const worldFrame = icy
        ? frame
            .replace(/^soil-(\d+)$/, "ice-$1")
            .replace(/^stone-(\d+)$/, "frozen-rock-$1")
        : frame;
      let texture =
        (icy || frame.startsWith("tool-") || sharedUpgrade) &&
        this.textures.exists(FRONTIER_TEXTURE) &&
        this.textures.get(FRONTIER_TEXTURE).has(worldFrame)
          ? FRONTIER_TEXTURE
          : CAMPAIGN_TEXTURE;
      let actualFrame = texture === FRONTIER_TEXTURE ? worldFrame : frame;
      if (frame.startsWith("fx-glint-")) {
        texture = "campaign-" + frame;
        actualFrame = "__BASE";
      }
      if (!frame.startsWith("fx-glint-"))
        texture =
          this.art.textureFor(
            actualFrame,
            texture === FRONTIER_TEXTURE ? "W02" : "W01",
            this.artQuality,
          ) ?? texture;
      if (
        !this.textures.exists(texture) ||
        !this.textures.get(texture).has(actualFrame)
      )
        return false;
      const displayWidth = Math.round(width * this.view.dpr) / this.view.dpr;
      const displayHeight = Math.round(height * this.view.dpr) / this.view.dpr;
      let image = this.images[this.imageIndex++];
      if (!image) {
        image = this.add.image(0, 0, texture);
        this.images.push(image);
      }
      image
        .setTexture(texture, actualFrame)
        .setPosition(x, y)
        .setOrigin(0.5, originY)
        .setDisplaySize(displayWidth, displayHeight)
        .setDepth(depth)
        .setAlpha(alpha)
        .setFlipX(flip)
        .clearTint()
        .clearMask()
        .setVisible(true);
      if (
        frame.startsWith("rig-") ||
        frame.startsWith("tool-") ||
        frame.startsWith("thrust-")
      ) {
        const campaign = bindings.getCampaign();
        const motion = !bindings.reducedMotion?.();
        const squash = motion ? this.landingLife * 0.22 : 0;
        image.setRotation(
          motion
            ? Math.max(-0.055, Math.min(0.055, campaign.velocityX * 0.008))
            : 0,
        );
        image.setDisplaySize(
          displayWidth * (1 + squash * 0.4),
          displayHeight * (1 - squash),
        );
        image.y += (campaign.cargoBulk / campaign.capacity) * 2;
      } else image.setRotation(0);
      if (this.presentation) {
        const progress = Math.min(
          1,
          (performance.now() - this.presentation.started) / 1200,
        );
        const reduced = Boolean(bindings.reducedMotion?.());
        if (
          this.presentation.type === "construction" &&
          /^(dock|refuge|relay)-stage/.test(frame)
        ) {
          image.setAlpha(alpha * (0.2 + progress * 0.8));
          if (!reduced) image.y += (1 - progress) * height * 0.12;
        }
        if (this.presentation.type === "install") {
          const id = this.presentation.id ?? "";
          const prefix = id.includes("DRILL")
            ? "rig-drill-collar"
            : id.includes("ENERGY")
              ? "rig-energy"
              : id.includes("CARGO")
                ? "rig-bay"
                : id.includes("HULL")
                  ? "rig-hull"
                  : id.includes("ENGINE")
                    ? "rig-engine"
                    : id === "W01-R2"
                      ? "rig-feet"
                      : id === "W01-R3"
                        ? "rig-rack"
                        : id === "W02-R1"
                          ? "tool-thermal"
                          : id === "W02-R2"
                            ? "tool-condenser"
                            : "tool-preservation";
          if (frame.startsWith(prefix))
            image.setAlpha(
              alpha *
                (reduced
                  ? 0.2 + progress * 0.8
                  : 0.45 + 0.55 * Math.abs(Math.sin(progress * Math.PI * 4))),
            );
        }
      }
      image.x =
        (Math.round(
          image.x * this.view.dpr - image.displayWidth * this.view.dpr * 0.5,
        ) +
          image.displayWidth * this.view.dpr * 0.5) /
        this.view.dpr;
      image.y =
        (Math.round(
          image.y * this.view.dpr -
            image.displayHeight * this.view.dpr * originY,
        ) +
          image.displayHeight * this.view.dpr * originY) /
        this.view.dpr;
      // T1-lite: remember the cabin, whose lens the headlamp core sits on.
      if (frame === "rig-cabin") this.rigCabin = image;
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
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "13px",
            resolution: this.view.dpr,
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
      const align =
        centered === "right" ? "right" : centered ? "center" : "left";
      const wrapWidth = Math.max(120, this.view.width - 48);
      // Phaser style setters rasterize and upload text even for equal values.
      // Labels remain pooled, but stationary text now keeps its cached texture.
      if (label.text !== text) label.setText(text);
      if (label.style.color !== color) label.setColor(color);
      if (label.style.align !== align) label.setAlign(align);
      if (label.style.wordWrapWidth !== wrapWidth)
        label.setWordWrapWidth(wrapWidth, true);
      label
        .setPosition(x, y)
        .setOrigin(centered === "right" ? 1 : centered ? 0.5 : 0, 0)
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
      const { scenery } = poiArtwork(poi);
      if (
        scenery &&
        this.image(scenery, x, y, tile * 2.8, tile * 1.9, 14, alpha)
      )
        this.images[this.imageIndex - 1]!.setMask(this.wreckMask);
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
      const width = this.view.width,
        height = this.view.height;
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
        const clientBox = overlay.getBoundingClientRect();
        const canvasBox = this.game.canvas.getBoundingClientRect();
        const corner = this.view.clientToScreen(
          clientBox.left,
          clientBox.top,
          canvasBox,
        );
        const box = {
          left: corner.x,
          right: corner.x + clientBox.width,
          top: corner.y,
          bottom: corner.y + clientBox.height,
        };
        const bounds = label.getBounds();
        if (
          bounds.right > box.left &&
          bounds.left < box.right &&
          labelY < box.bottom &&
          labelY + label.height > box.top
        )
          labelY =
            box.top < height / 2
              ? Math.min(
                  height - safe.bottom - label.height - 8,
                  box.bottom + 8,
                )
              : Math.max(safe.top + 5, box.top - label.height - 8);
      }
      label.setY(labelY);
    }

    private burst(x: number, y: number, color: number, count = 10) {
      if (bindings.reducedMotion?.()) return;
      const budget = matchMedia("(pointer: coarse)").matches ? 75 : 150;
      for (let i = 0; i < count && this.chips.length < budget; i++) {
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
      const hostBounds = document.getElementById("campaign-game");
      const cssWidth = hostBounds?.clientWidth || this.view.width;
      const cssHeight = hostBounds?.clientHeight || this.view.height;
      const renderDpr = this.resolutionBudget.scale(
        window.devicePixelRatio || 1,
        bindings.renderScale?.() ?? 2,
      );
      const viewCampaign = bindings.getCampaign();
      const reduced = Boolean(bindings.reducedMotion?.());
      const mode = bindings.getInterfaceMode?.();
      // F5: the zoom target blends by depth (view.ts) instead of switching
      // at the surface line and at 120 m, and the zoom follows it with the
      // camera's critically damped spring. A new campaign, a jump or reduced
      // motion sets it at once, as they set the camera.
      const zoomTarget = reduced
        ? 1
        : this.inspection
          ? CAMERA_ZOOM.inspection
          : mode === "dock" || mode === "welcome"
            ? CAMERA_ZOOM.dock
            : cameraZoomTarget(viewCampaign.renderY);
      const zoomJump =
        viewCampaign !== this.previousCampaign ||
        viewCampaign.world !== this.previousWorld ||
        Math.abs(viewCampaign.renderY - this.previousY) > 8 ||
        Math.abs(
          delta(this.previousX, viewCampaign.renderX, viewCampaign.world.width),
        ) > 8;
      const zoom = followSpring(
        this.contextZoom,
        this.zoomVelocity,
        zoomTarget,
        Math.min(0.05, deltaMilliseconds / 1000),
      );
      if (
        reduced ||
        zoomJump ||
        (Math.abs(zoom.position - zoomTarget) < 0.0005 &&
          Math.abs(zoom.velocity) < 0.01)
      ) {
        this.contextZoom = zoomTarget;
        this.zoomVelocity = 0;
      } else {
        this.contextZoom = zoom.position;
        this.zoomVelocity = zoom.velocity;
      }
      const contextTile =
        campaignTileSize(cssWidth, cssHeight) * this.contextZoom;
      this.view.configure(
        cssWidth,
        cssHeight,
        renderDpr,
        contextTile,
        bindings.getSafeArea?.() ??
          campaignSafeArea(
            cssWidth,
            cssHeight,
            matchMedia("(pointer: coarse)").matches,
          ),
      );
      const deviceWidth = Math.round(cssWidth * renderDpr),
        deviceHeight = Math.round(cssHeight * renderDpr);
      if (
        this.game.canvas.width !== deviceWidth ||
        this.game.canvas.height !== deviceHeight
      ) {
        this.scale.resize(deviceWidth, deviceHeight);
        // A resize re-allocates the backing store: not a steady-state frame.
        this.resolutionBudget.hold(1);
        this.game.canvas.style.width = cssWidth + "px";
        this.game.canvas.style.height = cssHeight + "px";
        this.cameras.main
          .setViewport(0, 0, deviceWidth, deviceHeight)
          .setOrigin(0, 0)
          .setZoom(renderDpr)
          .setScroll(0, 0);
        for (const label of this.labels) label.setResolution(renderDpr);
      }
      const campaign = bindings.getCampaign();
      this.artQuality = matchMedia("(pointer: coarse)").matches
        ? 2
        : this.view.tile * this.view.dpr > 110
          ? 3
          : 2;
      this.art.update(campaign, this.artQuality);
      // Asset loading and the uploads it causes are not steady-state frames.
      if (this.load.isLoading() || !this.art.ready(campaign))
        this.resolutionBudget.hold(1);
      if (!this.art.ready(campaign)) {
        this.loading.setText("PREPARING THE DESTINATION").setVisible(true);
        bindings.onUpdate(0);
        return;
      }
      if (!this.artFailed) this.loading.setVisible(false);
      const paused = bindings.isPaused();
      if (
        this.presentation &&
        (performance.now() - this.presentation.started > 1200 ||
          bindings.presentationActive?.() === false)
      )
        this.presentation = undefined;
      if (paused && this.presentation) {
        for (const chip of this.chips) {
          chip.life -= Math.min(0.05, deltaMilliseconds / 1000);
          chip.x += chip.vx * Math.min(0.05, deltaMilliseconds / 1000);
          chip.y += chip.vy * Math.min(0.05, deltaMilliseconds / 1000);
        }
        this.chips = this.chips.filter((chip) => chip.life > 0);
      }
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
        const controls = mergePilotControls(
          bindings.getControls(),
          pointerControls,
        );
        campaign.tick(dt, controls);
        if (!this.sceneClockFrozen) this.elapsed += dt;
        this.damageLife = Math.max(0, this.damageLife - dt);
        this.landingLife = Math.max(0, this.landingLife - dt);
        if (bindings.reducedMotion?.()) this.chips = [];
        this.debrisTimer -= dt;
        if (
          campaign.drillTarget &&
          campaign.drillProgress >= 0.45 &&
          this.debrisTimer <= 0
        ) {
          const target = campaign.drillTarget;
          const material =
            campaign.world.tiles[target.y * campaign.world.width + target.x];
          this.burst(
            this.unwrappedX +
              delta(campaign.renderX, target.x + 0.5, campaign.world.width),
            target.y + 0.3,
            campaign.world.id === "W02"
              ? 0xa5e4e6
              : material === 2
                ? 0xf7c673
                : 0xa3adb2,
            6,
          );
          this.debrisTimer = 0.085;
        }
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
        this.skyGradient.setTexture(
          icy ? "frontier-sky-gradient" : "campaign-sky-gradient",
        );
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
      if ((jumped || changed) && this.renderedFrames > 0 && !reduced)
        this.cameras.main.fadeIn(180, 12, 20, 27);
      this.renderedFrames++;
      this.unwrappedX += delta(this.previousX, campaign.renderX, world.width);
      this.previousX = campaign.renderX;
      this.previousY = campaign.renderY;
      for (const event of campaign.drainEvents()) {
        const eventX =
          this.unwrappedX + delta(campaign.renderX, event.x, world.width);
        if (event.type === "interaction" && event.action === "cut-start")
          this.burst(eventX, event.y, icy ? 0xbbecee : 0xf5d29e, 6);
        if (event.type === "cut")
          this.burst(
            eventX,
            event.y,
            event.material === "ice"
              ? 0xa6edf0
              : event.material === "stone" || event.material === "plate"
                ? 0xf7c673
                : 0xaab5b7,
            12,
          );
        if (event.type === "pickup") {
          this.burst(
            eventX,
            event.y,
            event.tier >= 3 ? 0xf4e9b0 : 0xb3dace,
            8 + event.tier * 2,
          );
          this.popup = {
            text: `+ ${event.name}`,
            x: eventX,
            y: event.y,
            life: 1.4,
          };
        }
        if (event.type === "landing") {
          this.landingLife = 0.25;
          this.burst(
            eventX,
            event.y + 0.35,
            icy ? 0xc2e9ec : 0x9eaaa6,
            Math.min(18, Math.round(event.speed * 3)),
          );
        }
        if (event.type === "damage") {
          this.damageLife = 0.3;
          if (bindings.cameraShake?.() && !bindings.reducedMotion?.())
            this.cameras.main.shake(100, 0.002);
        }
        if (event.type === "pressure" || event.type === "shelf")
          this.burst(
            eventX,
            event.y,
            0xd2ac78,
            event.phase === "warning" ? 6 : 18,
          );
        if (event.type === "reserve") this.burst(eventX, event.y, 0xb6ecdf, 16);
        if (event.type === "install" || event.type === "construction") {
          this.presentation = {
            type: event.type,
            started: performance.now(),
            id: event.type === "install" ? event.id : undefined,
          };
          if (event.type === "construction")
            this.burst(
              this.unwrappedX + delta(campaign.renderX, dockX, world.width),
              -0.3,
              0xf8d992,
              30,
            );
        }
        bindings.onEvent?.(event);
      }
      this.lastMined = campaign.state.stats.mined;
      this.lastCargo = campaign.cargo.length;
      this.lastHull = vehicle.hull;

      const width = this.view.width;
      const height = this.view.height;
      this.tile = this.view.tile;
      const tile = this.tile;
      const safe = this.view.safe;
      const interfaceMode = bindings.getInterfaceMode?.();
      const titleVisible = interfaceMode === "welcome";
      const highContrast = Boolean(bindings.highContrast?.());
      const clientDock =
        interfaceMode === "dock" ? bindings.getDockBounds?.() : undefined;
      const dock = clientDock
        ? {
            ...clientDock,
            ...this.view.clientToScreen(
              clientDock.x,
              clientDock.y,
              this.game.canvas.getBoundingClientRect(),
            ),
          }
        : undefined;
      if (interfaceMode !== this.previousInterface) {
        this.previousInterface = interfaceMode;
        // Long enough for the F5 spring to settle a paused reframing (about
        // 1.3 s for 700 CSS px at DPR 2); the former follow needed 0.5 s.
        this.framingTime = 1.5;
      }
      let targetX =
        this.unwrappedX * tile -
        width / 2 +
        (reduced ? 0 : campaign.velocityX * tile * 0.06);
      // On a short touch layout the advisory column occupies the upper right.
      // Keep the tall lander below the left mission strip, blending back to
      // centred tracking as the rig enters the shaft.
      if (width < 900 && height <= 420)
        targetX += width * 0.14 * surfaceFraming(campaign.renderY);
      let targetY = campaignCameraY(
        campaign.renderY,
        campaign.velocityY,
        tile,
        height,
        safe,
        reduced,
      );
      if (!titleVisible && !dock && width >= 900) {
        const homeOffset = delta(campaign.renderX, dockX, world.width);
        const homeDistance = Math.abs(homeOffset * tile) / width;
        const homeBlend = Math.max(0, Math.min(1, (0.85 - homeDistance) / 0.2));
        targetX +=
          homeOffset *
          tile *
          0.4 *
          homeBlend *
          surfaceFraming(campaign.renderY);
      }
      if (titleVisible)
        targetX =
          (this.unwrappedX + delta(campaign.renderX, dockX, world.width)) *
            tile -
          width * 0.5;
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
      // An animated zoom changes tile size each frame. It is not a viewport
      // resize and must never bypass the camera's interpolation. F5: the
      // camera follows the screen centre in world tiles with a critically
      // damped spring (about 110 ms), so a zoom change scales the view about
      // the centre instead of dragging the follow across the world.
      const focusX = (targetX + width / 2) / tile,
        focusY = (targetY + height / 2) / tile;
      const size = `${width}:${height}`;
      if (changed || jumped || size !== this.previousSize) {
        this.focusX = focusX;
        this.focusY = focusY;
        this.focusVelocityX = this.focusVelocityY = 0;
        this.previousSize = size;
      } else if (!paused || this.framingTime > 0 || dock) {
        const x = followSpring(this.focusX, this.focusVelocityX, focusX, dt),
          y = followSpring(this.focusY, this.focusVelocityY, focusY, dt);
        // Within a quarter device pixel and slower than that per frame, the
        // camera rests exactly on its target, so a settled view is stable.
        const rest = 0.25 / (tile * this.view.dpr);
        const settled = (
          spring: { position: number; velocity: number },
          target: number,
        ) =>
          reduced ||
          (Math.abs(spring.position - target) < rest &&
            Math.abs(spring.velocity * dt) < rest);
        [this.focusX, this.focusVelocityX] = settled(x, focusX)
          ? [focusX, 0]
          : [x.position, x.velocity];
        [this.focusY, this.focusVelocityY] = settled(y, focusY)
          ? [focusY, 0]
          : [y.position, y.velocity];
      }
      this.framingTime = Math.max(0, this.framingTime - dt);
      this.view.scroll(
        this.focusX * tile - width / 2,
        this.focusY * tile - height / 2,
      );
      const cx = this.view.scrollX;
      const cy = this.view.scrollY;
      this.cameraX = cx;
      this.cameraY = cy;
      bindings.onView?.(this.view);
      const px = this.unwrappedX * tile - cx;
      const py = campaign.renderY * tile - cy;
      const surfaceY = -cy;
      const graphics = this.background;
      const edges = this.edges;
      const fx = this.effects;
      graphics.clear();
      edges.clear();
      this.contrastEdges.clear();
      fx.clear();
      this.screen.clear();
      this.wreckMaskShape.clear().fillStyle(0xffffff);
      for (const image of this.images) image.setVisible(false);
      for (const label of this.labels) label.setVisible(false);
      this.imageIndex = 0;
      this.labelIndex = 0;
      this.rigCabin = undefined; // T1-lite

      // The opaque retained terrain and sky cover the view. Older parallax
      // polygons behind them were fully occluded but still consumed fill rate.
      this.skyGradient.setVisible(surfaceY > 0);
      this.sky.setVisible(surfaceY > 0);
      this.ridgeFar.setVisible(surfaceY > 0);
      this.ridgeNear.setVisible(surfaceY > 0);
      let skyBodyVisible = false;
      let skyBodyBounds:
        { x: number; y: number; width: number; height: number } | undefined;
      if (surfaceY > 0) {
        const skyHeight = Math.min(height, surfaceY);
        this.skyGradient.setPosition(0, 0).setDisplaySize(width, skyHeight);
        this.sky.setPosition(0, 0).setSize(width, skyHeight);
        this.sky.setTileScale(2);
        this.sky.tilePositionX = (cx * 0.15) / 2;
        this.sky.tilePositionY = (cy * 0.03) / 2;
        // A single body belongs to the sky, never to its repeating star texture.
        // Wrap its slow parallax inside the view, keeping it within the sky band.
        const bodySize = Math.min(tile * 4.4, width * 0.38, skyHeight * 0.7);
        const bodyMargin = bodySize / 2 + 10;
        const bodySpan = Math.max(1, width - bodyMargin * 2);
        const bodyX = bodyMargin + wrap(bodySpan * 0.72 - cx * 0.035, bodySpan);
        if (bodySize >= 8) {
          skyBodyVisible = this.image(
            "sky-body",
            bodyX,
            skyHeight * 0.42,
            bodySize,
            bodySize,
            1.2,
          );
          if (skyBodyVisible)
            skyBodyBounds = {
              x: bodyX - bodySize / 2,
              y: skyHeight * 0.42 - bodySize / 2,
              width: bodySize,
              height: bodySize,
            };
        }
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

      this.terrainLayer.render(campaign, this.view, highContrast);
      this.lightingLayer.render(
        campaign,
        this.view,
        Boolean(bindings.reducedMotion?.()),
        highContrast,
      );
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
      const exposed = (x: number, y: number) =>
        !solid(x, y) && (y < 0 || campaign.isKnown(wrap(x, world.width), y));
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const canonical = wrap(column, world.width);
          const index = row * world.width + canonical;
          const x = (column + 0.5) * tile - cx;
          const y = (row + 0.5) * tile - cy;
          const known = row >= world.rows || campaign.isKnown(canonical, row);
          if (!known) continue;
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
          const alpha = 1;
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
            if (number >= 2 && lit) {
              const wave = bindings.reducedMotion?.()
                ? 1
                : 0.35 +
                  0.65 *
                    Math.pow(
                      Math.max(
                        0,
                        Math.sin(
                          this.elapsed * (number === 4 ? 3 : 1.8) +
                            row +
                            canonical,
                        ),
                      ),
                      6,
                    );
              const glintX = x + tile * 0.15,
                glintY = y - tile * 0.18,
                size = tile * (0.045 + number * 0.014) * wave;
              this.image(
                number === 4 ? "fx-glint-gold" : "fx-glint-silver",
                glintX,
                glintY,
                Math.max(3, size * 2),
                Math.max(3, size * 2),
                24,
                0.4 + wave * 0.6,
              );
            }
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
          for (const side of [-1, 1]) {
            const salvageX =
              x + side * tile * (5.4 + hash(period, world.seed) * 1.5);
            this.image(
              "surface-salvage",
              salvageX,
              surfaceY,
              tile * 2.5,
              tile * 1.25,
              14,
              0.85,
              false,
              1,
            );
            edges.fillStyle(0xf2b964, 0.16);
            edges.fillEllipse(
              x + side * tile * 1.7,
              surfaceY - tile * 0.15,
              tile * 0.8,
              tile * 0.35,
            );
            edges.fillStyle(0xffdf9a, 0.95);
            edges.fillCircle(x + side * tile * 1.7, surfaceY - tile * 0.17, 3);
          }
          // F6 (D3): the A and B seam markers show only while the first-
          // expedition coach is active (ui/guidance.ts sets the body class).
          if (
            world.id === "W01" &&
            world.generatorVersion === 2 &&
            document.body.classList.contains("campaign-coaching")
          )
            for (const [entry, name] of [
              [20.5, "A"],
              [21.5, "B"],
            ] as const) {
              const seamX = (entry + period * world.width) * tile - cx;
              this.screen.lineStyle(2, 0xf5d89a, 0.9);
              this.screen.lineBetween(
                seamX,
                surfaceY - 14,
                seamX,
                surfaceY - 3,
              );
              this.screen.fillStyle(0xf5d89a, 0.9);
              this.screen.fillTriangle(
                seamX,
                surfaceY + 1,
                seamX - 4,
                surfaceY - 5,
                seamX + 4,
                surfaceY - 5,
              );
              if (!titleVisible)
                this.label(seamX, surfaceY - tile * 1.65, name, "#f5d89a");
            }
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
        if (
          !bindings.onView &&
          Math.abs(dockOffset * tile) > width / 2 - tile * 2
        ) {
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
        const artwork = poiArtwork(poi);
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
            artwork.marker &&
            this.image(
              artwork.marker,
              x,
              y,
              tile * artwork.width,
              tile * artwork.height,
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
        const caption = poiSecondaryCaption(poi);
        if (
          caption &&
          poi.visible &&
          distance < 3.8 &&
          poi.id !== signal?.targetId &&
          !(
            clustered &&
            (signal?.poi.kind === poi.kind || labeledSites.has(poi.kind))
          )
        ) {
          if (clustered) labeledSites.add(poi.kind);
          this.missionLabel(
            x,
            y,
            px,
            py,
            tile,
            safe,
            caption,
            poi.status === "source" ? "#F6E1AF" : "#A7D8C5",
          );
        }
      }
      // A local mission radio pin may cross fog; it never draws terrain or ore.
      // The broad physical wreck underneath remains clipped to discovered cells.
      let poiMarkerX = "",
        poiMarkerY = "",
        poiMarkerVisible = false;
      if (
        !titleVisible &&
        signal &&
        signal.kind !== "lander" &&
        signal.band !== "distant"
      ) {
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
        if (onScreen && !bindings.onView) {
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
                  seam: "Starter seam",
                  cache: "Sealed cache",
                  relic: "Relic",
                  log: "Field log",
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
        for (const pocket of (world.hazards ?? W02_HAZARDS).coldPockets) {
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
          const mistDrift = bindings.reducedMotion?.()
            ? 0
            : Math.sin(this.elapsed * 1.3) * tile * 0.04;
          if (
            this.image(
              "cold-pocket",
              x,
              y + mistDrift,
              tile * 2.6,
              tile * 1.7,
              15,
              warning ? 0.9 : 0.55,
            )
          )
            this.images[this.imageIndex - 1]!.setMask(this.wreckMask);
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
        }
        for (const vent of (world.hazards ?? W02_HAZARDS).vents) {
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
          this.image(
            "warning-shelf",
            x,
            y - tile * 0.65,
            tile * 0.45,
            tile * 0.45,
            16,
            0.75,
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
      for (const site of world.sites ?? []) {
        if (!campaign.isKnown(Math.floor(site.x), Math.floor(site.y))) continue;
        const x =
            (this.unwrappedX + delta(campaign.renderX, site.x, world.width)) *
              tile -
            cx,
          y = site.y * tile - cy;
        if (
          x < -tile * 2 ||
          x > width + tile * 2 ||
          y < -tile * 2 ||
          y > height + tile * 2
        )
          continue;
        if (
          this.image(
            `site-${site.kind}`,
            x,
            y,
            tile * 2.6,
            tile * 1.75,
            14,
            site.opened ? 0.62 : 0.95,
          )
        )
          this.images[this.imageIndex - 1]!.setMask(this.wreckMask);
        if (
          campaign.isVisible(Math.floor(site.x), Math.floor(site.y)) &&
          Math.hypot(x - px, y - py) < tile * 2.5 &&
          !titleVisible
        )
          this.missionLabel(
            x,
            y,
            px,
            py,
            tile,
            safe,
            site.name,
            site.opened ? "#afc6c3" : "#f2d6a5",
          );
      }
      for (const log of world.fieldLogs ?? []) {
        if (log.read || !campaign.isKnown(Math.floor(log.x), Math.floor(log.y)))
          continue;
        if (
          (world.sites ?? []).some(
            (site) => Math.hypot(site.x - log.x, site.y - log.y) < 1.2,
          )
        )
          continue;
        const x =
            (this.unwrappedX + delta(campaign.renderX, log.x, world.width)) *
              tile -
            cx,
          y = log.y * tile - cy;
        if (x < -tile || x > width + tile || y < -tile || y > height + tile)
          continue;
        if (
          this.image(FIELD_LOG_FRAME, x, y, tile * 0.45, tile * 0.45, 15, 0.95)
        )
          this.images[this.imageIndex - 1]!.setMask(this.wreckMask);
      }
      for (const seam of world.pressureSeams ?? []) {
        if (
          seam.spent ||
          !campaign.isKnown(Math.floor(seam.x), Math.floor(seam.y))
        )
          continue;
        const x =
            (this.unwrappedX + delta(campaign.renderX, seam.x, world.width)) *
              tile -
            cx,
          y = seam.y * tile - cy;
        if (
          this.image(
            "pressure-seam",
            x,
            y,
            tile,
            tile,
            16,
            seam.warning === null ? 0.42 : 1,
          )
        )
          this.images[this.imageIndex - 1]!.setMask(this.wreckMask);
        if (seam.warning !== null) {
          this.screen.lineStyle(2, 0xf7d088, 1);
          this.screen.strokeCircle(x, y, tile * 0.52);
          if (!titleVisible)
            this.missionLabel(
              x,
              y,
              px,
              py,
              tile,
              safe,
              "Pressure · move away",
              "#ffe0a2",
            );
          if (!paused && !bindings.reducedMotion?.() && this.debrisTimer <= 0) {
            this.burst(
              this.unwrappedX + delta(campaign.renderX, seam.x, world.width),
              seam.y,
              0xe0c9aa,
              6,
            );
            this.debrisTimer = 0.12;
          }
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
          if (this.overlaysVisible) {
            edges.lineStyle(3, 0xffca6a, 0.85);
            edges.lineBetween(
              x - tile * 0.5,
              y + tile * 0.42,
              x + tile * 0.5,
              y + tile * 0.42,
            );
          }
          if (Math.abs(x - px) < tile * 4 && !paused)
            this.label(x, y - tile * 0.85, "UNSTABLE SHELF", "#FFCA6A");
        }
      }

      let testRasterDrawn = false;
      if (this.renderDebug.testRaster && world.id === TEST_RASTER.world)
        testRasterDrawn = this.image(
          TEST_RASTER.frame,
          (this.unwrappedX +
            delta(campaign.renderX, TEST_RASTER.x, world.width)) *
            tile -
            cx,
          TEST_RASTER.y * tile - cy,
          tile,
          tile,
          14,
        );

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
        if (this.overlaysVisible) {
          edges.lineStyle(2, 0xf6e1af, 0.35);
          edges.strokeRect(
            x - tile * 0.44,
            y - tile * 0.44,
            tile * 0.88,
            tile * 0.88,
          );
        }
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

      renderRig({
        campaign,
        image: this.image.bind(this),
        screen: this.screen,
        edges,
        effects: fx,
        tile,
        px,
        py,
        elapsed: this.elapsed,
        paused,
        reducedMotion: Boolean(bindings.reducedMotion?.()),
        highContrast,
        width,
        height,
        damageLife: this.damageLife,
        overlays: this.overlaysVisible,
      });
      // T1-lite: the headlamp core follows the cabin sprite just drawn.
      this.headlamp.render(this.rigCabin, tile);
      // T1-lite: the surface ground light follows the rig and the ground line.
      this.groundLight.render(px, surfaceY, campaign.renderY, tile);
      for (const chip of this.chips) {
        fx.fillStyle(chip.color, Math.min(1, chip.life / chip.total));
        fx.fillRect(
          chip.x * tile - cx,
          chip.y * tile - cy,
          Math.max(3.5, tile * 0.065),
          Math.max(3, tile * 0.045),
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
      if (titleVisible || !this.overlaysVisible)
        for (const label of this.labels) label.setVisible(false);
      // The screen layer holds only UI: rings, arrows, alarm border, bars.
      this.screen.setVisible(this.overlaysVisible);
      // Twice a second of scene time: the 10 s p95 and the readout.
      this.frameReadoutTimer += dt;
      if (this.frameReadoutTimer >= 0.5) {
        this.frameReadoutTimer = 0;
        this.frameP95 = this.resolutionBudget.p95();
        if (this.frameReadout)
          this.frameReadout.textContent =
            `p95 ${this.frameP95 === undefined ? "—" : this.frameP95.toFixed(1) + " ms"}\n` +
            `backing ${Number(this.view.dpr.toFixed(2))}× · ${this.resolutionBudget.tier}` +
            (this.resolutionBudget.pin === undefined ? "" : " · pinned") +
            // One line per policy segment: next step, probation, back-off.
            `\n${backoffLine(this.resolutionBudget.state()).replaceAll(" · ", "\n")}`;
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
          viewCameraX: cx.toFixed(4),
          viewCameraY: cy.toFixed(4),
          viewTile: tile.toFixed(4),
          drawCalls:
            this.diagnostics.drawCalls === undefined
              ? ""
              : String(this.diagnostics.drawCalls),
          renderFrameMilliseconds:
            this.diagnostics.frameMilliseconds.toFixed(3),
          renderDprRequested: String(
            Math.min(
              window.devicePixelRatio || 1,
              bindings.renderScale?.() ?? 2,
            ),
          ),
          presentation: this.presentation?.type ?? "",
          presentationProgress: this.presentation
            ? String(
                Math.min(
                  1,
                  (performance.now() - this.presentation.started) / 1200,
                ),
              )
            : "",
          renderer:
            this.game.renderer.type === Phaser.CANVAS ? "canvas" : "webgl",
          activeParticles: String(this.chips.length),
          renderScale: String(this.view.dpr),
          backingScale: String(this.view.dpr),
          qualityTier: this.resolutionBudget.tier,
          backingPinned: String(this.resolutionBudget.pin !== undefined),
          frameP95: this.frameP95?.toFixed(1) ?? "",
          residentTextureBytes: String(
            Object.values(this.textures.list).reduce(
              (sum, texture) =>
                sum +
                texture.source.reduce(
                  (bytes: number, source: Phaser.Textures.TextureSource) =>
                    bytes + source.width * source.height * 4,
                  0,
                ),
              0,
            ),
          ),
          terrainDirtyCells: String(this.terrainLayer.dirtyCells),
          terrainUploads: String(this.terrainLayer.draws),
          renderLayerBytes: String(
            this.terrainLayer.bytes + this.lightingLayer.bytes,
          ),
          viewWidth: String(width),
          viewHeight: String(height),
          viewDpr: String(this.view.dpr),
          viewSnapshot: JSON.stringify(this.view.snapshot()),
          campaignWorld: world.id,
          worldWidth: String(world.width),
          worldRows: String(world.rows),
          worldTexture: icy ? FRONTIER_TEXTURE : CAMPAIGN_TEXTURE,
          skyBodyVisible: String(skyBodyVisible),
          skyBodyBounds: skyBodyBounds ? JSON.stringify(skyBodyBounds) : "",
          highContrast: String(highContrast),
          worldLabels: String(
            this.labels.filter((label) => label.visible).length,
          ),
          volatileCue: String(Boolean(campaign.volatileWindow)),
          volatileRemaining:
            campaign.volatileWindow?.remaining.toFixed(3) ?? "",
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
          // T13a: whether the placeholder frame was drawn, under its flag only.
          ...(this.renderDebug.testRaster
            ? { testRaster: String(testRasterDrawn) }
            : {}),
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
      const viewData = this.view.snapshot();
      for (const [key, value] of Object.entries(viewData)) {
        if (typeof value === "number")
          this.game.canvas.dataset[
            "view" + key[0]!.toUpperCase() + key.slice(1)
          ] = String(value);
      }
      bindings.onUpdate(dt);
    }
  };
}
