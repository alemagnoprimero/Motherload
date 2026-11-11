import Phaser from "phaser";
import type { Campaign } from "./model";
import type { CampaignEvent } from "./events";
import type { CampaignControls, CampaignPackage, CampaignWorld } from "./types";
import {
  campaignSafeArea,
  campaignTileSize,
  retainedTerrainGrid,
} from "./layout";
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
import { EmissivePass, cellsUnder, spriteBounds } from "./render/emissive";
import { CampaignLighting } from "./render/lighting";
import { CampaignArt } from "./render/art";
import { renderRig } from "./render/rig";
import { T1LiteHeadlamp } from "./render/t1-lite-headlamp";
import { T1LiteGroundLight } from "./render/t1-lite-ground-light";
import { RenderDiagnostics } from "./render/diagnostics";
import {
  ANNOTATION_ART,
  AnnotationLayer,
  ObstacleReader,
  solveAnnotations,
  type AnnotationRequest,
} from "./render/annotations";
import {
  FIELD_LOG_FRAME,
  poiArtwork,
  poiSecondaryCaption,
} from "./render/poi-art";
import {
  LIGHT_MAP_SCALE,
  SMALL_TEXTURE_BYTES,
  TEXTURE_GROUPS,
  devicePxPerTile,
  pageByKey,
  pageWorld,
  rigZone,
  textureGroup,
  type TextureGroup,
} from "./render/zones";
export { campaignSafeArea, campaignTileSize } from "./layout";

/**
 * Each world's atlas label (`data-world-texture`) and the prefix of its zone
 * page keys (render/zones.ts, audit T13b): campaign-w01-core-hero-3x-0, …
 */
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
  /** T8: Scan shows the labels while true (input.ts scanActive()). */
  scanActive?: () => boolean;
  /** T8: the Scan state the scene drew with, for the HUD (forced in tests). */
  onScan?: (active: boolean) => void;
  /** "Return guidance" (assists): HOME's chevron stays on without Scan. */
  returnGuidance?: () => boolean;
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
    /** The hero pages' density, 2 | 3 | 4 (D1; surface-render-smoke reads it). */
    private artQuality = 2;
    /** Frames image() could not draw (no resident page holds them), by name. */
    private frameMisses = new Map<string, number>();
    /** The F1 readout group of each texture key, classified once (T13b). */
    private textureGroups = new Map<string, TextureGroup>();
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
    /** T13b: `-emissive` siblings, ADD above the darkness, own pool. */
    private emissive!: EmissivePass;
    /** T8: the annotations requested this frame, placed in update(). */
    private annotationRequests: AnnotationRequest[] = [];
    private annotations!: AnnotationLayer;
    /** T8 harness: Scan forced on or off (`?scan=`, `__campaignDebug.scan()`). */
    private scanForced = harnessOptions(location.search).scan;
    /** T8: the DOM boxes annotations keep clear of, read a few times a second. */
    private obstacles = new ObstacleReader();
    private skyGradient!: Phaser.GameObjects.Image;
    private sky!: Phaser.GameObjects.TileSprite;
    private ridgeFar!: Phaser.GameObjects.TileSprite;
    private ridgeNear!: Phaser.GameObjects.TileSprite;
    private loading!: Phaser.GameObjects.Text;
    private imageIndex = 0;
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
      this.art.preload(
        bindings.getCampaign(),
        this.artLayout(
          host?.clientWidth || 1280,
          host?.clientHeight || 720,
          this.renderTier(),
        ),
      );
    }

    /** F1's quality tier, from the renderer and the device (§7). */
    private renderTier() {
      const webgl = this.game.renderer.type !== Phaser.CANVAS;
      let fragmentHighp = false;
      if (webgl) {
        const gl = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer)
          .gl;
        fragmentHighp =
          (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
            ?.precision ?? 0) > 0;
      }
      return qualityTier(
        webgl ? "webgl" : "canvas",
        fragmentHighp,
        matchMedia("(pointer: coarse)").matches,
      );
    }

    /** F1's backing ceiling, min(DPR, Render quality, 2), or the debug pin. */
    private backingCap() {
      // The pin from the URL: preload runs before create() sets the budget's.
      return (
        this.renderDebug.backingPin ??
        Math.max(
          1,
          Math.min(
            window.devicePixelRatio || 1,
            bindings.renderScale?.() ?? 2,
            2,
          ),
        )
      );
    }

    /**
     * Audit T13b: what page choice reads of the screen. Device px per tile
     * from the base tile and the backing ceiling (D1), and the bytes of the
     * render layers the budget guard projects: the retained terrain as
     * render/terrain.ts sizes it (layout.ts), the light map and small canvases.
     */
    private artLayout(
      cssWidth: number,
      cssHeight: number,
      tier = this.resolutionBudget.tier,
    ) {
      const cap = this.backingCap(),
        tile = this.renderDebug.tile;
      const terrain = retainedTerrainGrid(
        cssWidth,
        cssHeight,
        tile ?? campaignTileSize(cssWidth, cssHeight),
        cap,
        matchMedia("(pointer: coarse)").matches,
      );
      // Rows surely on screen around the rig: campaignCameraY anchors it at
      // 43–57 % of the usable height, with up to a tile of look-ahead, and the
      // context zoom is at most the inspection zoom.
      const safe = this.view.safe,
        usable = Math.max(100, cssHeight - safe.top - safe.bottom),
        largest =
          (tile ?? campaignTileSize(cssWidth, cssHeight)) *
          CAMERA_ZOOM.inspection;
      return {
        viewRows: {
          above: Math.max(0, (safe.top + usable * 0.43) / largest - 1),
          below: Math.max(
            0,
            (cssHeight - safe.top - usable * 0.57) / largest - 1,
          ),
        },
        pxPerTile: devicePxPerTile(cssWidth, cssHeight, cap, tile),
        tier,
        layerBytes:
          terrain.pixelWidth * terrain.pixelHeight * 4 +
          Math.ceil(cssWidth * LIGHT_MAP_SCALE) *
            Math.ceil(cssHeight * LIGHT_MAP_SCALE) *
            4 +
          SMALL_TEXTURE_BYTES,
      };
    }

    create() {
      // T13b: the manifests list the frames the game needs, and the core
      // pages of every atlas in play are resident.
      const campaign = bindings.getCampaign();
      this.artFailed ||=
        !this.art.coreReady(campaign) ||
        this.art.missingFrames("W01", [
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
        ]).length > 0 ||
        (campaign.world.id === "W02" &&
          this.art.missingFrames("W02", [
            "ore-o3",
            "mission-sample",
            "mission-catalyst",
            "sky-body",
          ]).length > 0);
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
      this.resolutionBudget.setTier(this.renderTier());
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
      // T8: every annotation is DOM in the world-label layer (no canvas draw).
      this.annotations = new AnnotationLayer(
        document.getElementById("campaign-world-labels")!,
        ANNOTATION_ART,
        {
          home: document.getElementById("campaign-home-beacon")!,
          target: document.getElementById("campaign-target-beacon")!,
        },
      );
      this.installDebugHooks();
      this.wreckMaskShape = this.add.graphics().setVisible(false);
      this.wreckMask = this.wreckMaskShape.createGeometryMask();
      // T13b: the ADD pool for -emissive siblings (render/emissive.ts).
      this.emissive = new EmissivePass(
        () => this.add.image(0, 0, "__DEFAULT").setVisible(false),
        this.renderDebug.emissive,
      );
      // Stretch a gradient once; only the transparent stars may tile. The
      // former combined sky repeated its planet and horizon on tall displays.
      // W01 (art item A4): the board's sky, palette.json sky_top at the
      // board's L* 13.8 down to sky_horizon's hue at L* 31, so the sky just
      // above the ridges reads about L* 28 at spawn. T7 owns the gradient's
      // anchoring (it stretches from the screen top to the surface line).
      for (const [key, top, bottom] of [
        ["campaign-sky-gradient", "#112631", "#354c59"],
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
        // T8: no canvas label is left; the annotations are DOM text, which the
        // harness's playfield count reads with the rest of the DOM.
        worldLabels: () => [],
        scan: (forced) => {
          if (forced !== undefined) this.scanForced = forced ?? undefined;
          return this.scanForced ?? Boolean(bindings.scanActive?.());
        },
        annotations: () =>
          this.annotations.placed.map(({ request, box, marker, leader }) => ({
            id: request.id,
            text: request.text,
            priority: request.priority,
            scan: request.scan,
            tone: request.tone,
            box,
            marker: marker ?? null,
            leader: leader ?? null,
          })),
        textures: () =>
          Object.entries(this.textures.list)
            .map(([key, texture]) => {
              const page = pageByKey(key),
                group = textureGroup(key);
              return {
                key,
                bytes: texture.source.reduce(
                  (bytes: number, source: Phaser.Textures.TextureSource) =>
                    bytes + source.width * source.height * 4,
                  0,
                ),
                width: texture.source[0]?.width ?? 0,
                height: texture.source[0]?.height ?? 0,
                group,
                zone: page?.zone ?? (group === "bg" ? "surface" : null),
                density: page?.density ?? null,
                world: pageWorld(key) ?? null,
              };
            })
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
        frameMisses: (reset = false) => {
          const misses = Object.fromEntries(this.frameMisses);
          if (reset) this.frameMisses.clear();
          return misses;
        },
        drawnFrames: () =>
          this.images
            .filter((image) => image.visible)
            .map((image) => ({
              frame: image.frame.name,
              texture: image.texture.key,
            })),
        emissives: () =>
          this.emissive.drawn().map(({ sprite, base }) => {
            const state = (image: Phaser.GameObjects.Image) => ({
              frame: image.frame.name,
              texture: image.texture.key,
              x: image.x,
              y: image.y,
              originX: image.originX,
              originY: image.originY,
              width: image.displayWidth,
              height: image.displayHeight,
              rotation: image.rotation,
              flipX: image.flipX,
              alpha: image.alpha,
              depth: image.depth,
              blendMode: Number(image.blendMode),
              masked: Boolean(image.mask),
              visible: image.visible,
            });
            return { ...state(sprite), base: state(base) };
          }),
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

    /**
     * T13b: the sky and ridges stream with band A (render/art.ts). A tile
     * sprite draws from its own copy of its texture, so while the texture is
     * out the sprite points at Phaser's 32 px default (which frees that copy
     * too), and back at the texture once it is resident again.
     */
    private syncBackgrounds(prefix: string) {
      for (const [sprite, part] of [
        [this.sky, "sky"],
        [this.ridgeFar, "ridge-far"],
        [this.ridgeNear, "ridge-near"],
      ] as const) {
        const key = `${prefix}-${part}`;
        const target = this.textures.exists(key) ? key : "__DEFAULT";
        // A tile sprite's `texture` is its own canvas; `displayTexture` (not
        // in Phaser's typings) is the one setTexture() copies from.
        const shown = (sprite as { displayTexture?: Phaser.Textures.Texture })
          .displayTexture;
        if (shown !== this.textures.get(target)) sprite.setTexture(target);
      }
    }

    /**
     * Resident texture bytes in all and per F1 readout group (T13b), every
     * frame for the dataset: one pass over the TextureManager, with each key's
     * group classified once.
     */
    private residentTextures() {
      const groups = Object.fromEntries(
        TEXTURE_GROUPS.map((group) => [group, 0]),
      ) as Record<TextureGroup, number>;
      let total = 0;
      const pages: string[] = [];
      for (const [key, texture] of Object.entries(this.textures.list)) {
        let bytes = 0;
        for (const source of texture.source)
          bytes += source.width * source.height * 4;
        let group = this.textureGroups.get(key);
        if (!group) this.textureGroups.set(key, (group = textureGroup(key)));
        groups[group] += bytes;
        total += bytes;
        if (group === "atlas") pages.push(key);
      }
      const art = this.art.state();
      const zone = art ? rigZone(art.band, art.row) : "surface";
      const plain = art?.densities.plain[zone] ?? 2,
        hero = art?.densities.hero ?? 2;
      return {
        total,
        groups,
        zone,
        density: plain === hero ? `${plain}` : `${plain}/${hero}`,
        guard: art?.stepped ?? [],
        /** The guard's projection is over the form's §7 budget. */
        over: art?.fits === false,
        pages: pages.sort(),
      };
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
      const currentWorld = bindings.getCampaign().state.currentWorld;
      const worldFrame =
        currentWorld === "W02"
          ? frame
              .replace(/^soil-(\d+)$/, "ice-$1")
              .replace(/^stone-(\d+)$/, "frozen-rock-$1")
          : frame;
      // T13b: the owner atlas comes from the manifests (W02's for W02 frames,
      // tools and shared upgrades); the page from what is resident.
      const owner = this.art.owner(worldFrame, currentWorld);
      let actualFrame = owner === "W02" ? worldFrame : frame;
      let texture: string | undefined;
      if (frame.startsWith("fx-glint-")) {
        texture = "campaign-" + frame;
        actualFrame = "__BASE";
      } else texture = this.art.textureFor(actualFrame, owner);
      if (
        !texture ||
        !this.textures.exists(texture) ||
        !this.textures.get(texture).has(actualFrame)
      ) {
        this.frameMisses.set(frame, (this.frameMisses.get(frame) ?? 0) + 1);
        return false;
      }
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
      // T13b: its -emissive sibling, if the page has one, is drawn from this
      // sprite's final state once the frame's last sprite is (emissive.draw).
      this.emissive.queue(image, owner, actualFrame, depth);
      return true;
    }

    /**
     * Audit T8 (D3): one annotation for this frame. render/annotations.ts
     * places them all at the end of update(), clear of the rig and of each
     * other; Scan labels show only while Scan is active.
     */
    private annotate(request: AnnotationRequest) {
      this.annotationRequests.push(request);
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
      // T13b: `?tile=` (debug only) stands in for campaignTileSize().
      const baseTile =
        this.renderDebug.tile ?? campaignTileSize(cssWidth, cssHeight);
      const contextTile = baseTile * this.contextZoom;
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
      }
      const campaign = bindings.getCampaign();
      // T13b (D1): zone pages by device px per tile, never by pointer type.
      this.art.update(campaign, this.artLayout(cssWidth, cssHeight));
      this.artQuality = this.art.state()?.densities.hero ?? 2;
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
      this.syncBackgrounds(icy ? "frontier" : "campaign");
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
      // T8: Scan shows every label and, like high contrast, the light tier marks.
      const scanning =
        this.scanForced ?? Boolean(bindings.scanActive?.() && !interfaceMode);
      bindings.onScan?.(scanning);
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
      this.annotationRequests = [];
      this.imageIndex = 0;
      this.rigCabin = undefined; // T1-lite
      this.emissive.begin(); // T13b

      // The opaque retained terrain and sky cover the view. Older parallax
      // polygons behind them were fully occluded but still consumed fill rate.
      this.skyGradient.setVisible(surfaceY > 0);
      // A tile sprite under 1 px high has a 0-high canvas, which Canvas 2D
      // cannot draw (drawImage throws and stops the game loop).
      this.sky.setVisible(surfaceY >= 1);
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

      this.terrainLayer.render(campaign, this.view, highContrast, baseTile);
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
            // Art item A12: a deposit is set into its block. The socket decal
            // (a translucent recess, lit lip and contact shadow) lies under
            // the ore at 1 tile, inside this known cell; exposed packages lie
            // over air and get none. W02 has no socket of its own and draws
            // W01's (image() falls back to the W01 atlas).
            if (item.status === "deposit")
              this.image("deposit-socket", x, y, tile, tile, 12.5, alpha);
            this.image(frame, x, y + bob, tile * 0.9, tile * 0.9, 13, alpha);
            // T9's high-contrast variant: the light tier mark drawn over the
            // frame's own mark, same place and size; each world's atlas has
            // its own, at its mark centres. Scan (T8) shows it too.
            if (number && (highContrast || scanning))
              this.image(
                `tier-mark-hc-${number}`,
                x,
                y + bob,
                tile * 0.9,
                tile * 0.9,
                13.05,
                alpha,
              );
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
              // On a lit facet of ore-o2..o4 (art item A12): frame point
              // (65, 44) in W01 and (63, 40) in W02, at 0.9 tile; a package
              // draws its ore at 0.74 from (13, 10), so its point moves in.
              const [glintDX, glintDY] =
                item.status === "deposit"
                  ? icy
                    ? [0.14, -0.075]
                    : [0.16, -0.04]
                  : icy
                    ? [0.109, -0.088]
                    : [0.124, -0.053];
              const glintX = x + tile * glintDX,
                glintY = y + tile * glintDY,
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
              // F6 keeps the letters for the coach; T8 places them.
              if (!titleVisible)
                this.annotate({
                  id: `seam-${name}-${period}`,
                  text: name,
                  x: seamX,
                  y: surfaceY - 14,
                  priority: 1,
                  scan: false,
                  tone: "target",
                });
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
      }
      // T8 (D3): HOME stays on, an edge chevron with its distance, pointing at
      // the nearest wrapped copy of the lander (formerly ui/world-labels.ts).
      if (!campaign.atDock && !titleVisible) {
        const homeOffset = delta(campaign.renderX, dockX, world.width);
        const reserve = campaign.returnReserve.state;
        this.annotate({
          id: "home",
          // The distance as the HOME beacon measured it, from the vehicle.
          text: `HOME · ${Math.round(Math.hypot(delta(vehicle.x, dockX, world.width), -1 - vehicle.y) * 10)} m`,
          x: (this.unwrappedX + homeOffset) * tile - cx,
          // The chevron points at the lander's roof, about 2.2 tiles up.
          y: -2.2 * tile - cy,
          priority: 2,
          scan: !(bindings.returnGuidance?.() ?? true),
          tone: reserve === "turn" || reserve === "stranded" ? "warn" : "home",
          marker: "chevron",
        });
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
        // T8: a known mission object's caption, on Scan, wherever it is in
        // view (it was within 3.8 tiles); the target has its own label.
        const clustered = poi.kind === "sample" || poi.kind === "cryo";
        const caption = poiSecondaryCaption(poi);
        if (
          caption &&
          poi.known &&
          poi.id !== signal?.targetId &&
          !(
            clustered &&
            (signal?.poi.kind === poi.kind || labeledSites.has(poi.kind))
          )
        ) {
          if (clustered) labeledSites.add(poi.kind);
          this.annotate({
            id: `poi-${poi.id}`,
            text: caption,
            x,
            // Above the object: its marker's top (or a tile's for parts).
            y: y - (tile * Math.max(1, artwork.height)) / 2,
            priority: 3,
            scan: true,
            tone: poi.status === "source" ? "target" : "done",
          });
        }
      }
      // The mission radio target may cross fog (it never draws terrain or
      // ore); the wreck under it stays clipped to discovered cells. T8: its
      // label and pulse ring (an edge chevron off screen) show on Scan, at
      // any range, as the DOM target beacon did; the HUD keeps its distance.
      let poiMarkerX = "",
        poiMarkerY = "",
        poiMarkerVisible = false;
      if (
        !titleVisible &&
        signal &&
        !signal.returning &&
        signal.kind !== "lander"
      ) {
        const poi = signal.poi;
        this.annotate({
          id: "target",
          text: `${signal.name} · ${signal.distanceMeters} m`,
          x:
            (this.unwrappedX + delta(campaign.renderX, poi.x, world.width)) *
              tile -
            cx,
          y: poi.y * tile - cy,
          priority: 2,
          scan: true,
          tone: "target",
          marker: "ring",
          radius: poi.known ? tile * 0.53 : 15,
        });
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
          // T8: hazards stay on; one warning sentence at a time without Scan.
          this.annotate(
            warning
              ? {
                  id: `cold-${pocket.x}-${pocket.y}`,
                  text: "Cold mist forming · move clear",
                  x,
                  y,
                  priority: 0,
                  scan: false,
                  tone: "ice",
                  group: "hazard",
                }
              : {
                  id: `cold-${pocket.x}-${pocket.y}`,
                  text: "Cold pocket",
                  x,
                  y,
                  priority: 3,
                  scan: true,
                  tone: "ice",
                },
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
          const close =
            Math.hypot(
              delta(vehicle.x, vent.x, world.width),
              vehicle.y - vent.y,
            ) < 2.8;
          this.annotate({
            id: `vent-${vent.x}-${vent.y}`,
            text: close ? "Ice vent · keep clear" : "Ice vent",
            x,
            y,
            priority: close ? 0 : 3,
            scan: !close,
            tone: "warn",
            group: close ? "hazard" : undefined,
          });
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
        // T8: a known site's name, on Scan (it showed within 2.5 tiles).
        if (!titleVisible)
          this.annotate({
            id: `site-${site.id}`,
            text: site.name,
            x,
            y: y - tile * 0.875,
            priority: 3,
            scan: true,
            tone: site.opened ? "done" : "target",
          });
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
        // Only seams in view draw (T13b: off-screen ones may lie in bands
        // whose pages are not resident); their warning below still shows.
        const inView =
          x > -tile && x < width + tile && y > -tile && y < height + tile;
        if (
          inView &&
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
        if (!titleVisible && inView)
          this.annotate({
            id: `pressure-${seam.x}-${seam.y}`,
            text:
              seam.warning === null ? "Pressure seam" : "Pressure · move away",
            x,
            y,
            priority: seam.warning === null ? 3 : 0,
            scan: seam.warning === null,
            tone: "warn",
            group: seam.warning === null ? undefined : "hazard",
          });
        if (seam.warning !== null) {
          this.screen.lineStyle(2, 0xf7d088, 1);
          this.screen.strokeCircle(x, y, tile * 0.52);
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
            this.annotate({
              id: `shelf-${shelf.x}-${shelf.y}`,
              text: "UNSTABLE SHELF",
              x,
              y: y - tile * 0.25,
              priority: 0,
              scan: false,
              tone: "warn",
              group: "hazard",
            });
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
      // T13b: every sprite of the frame is drawn; their -emissive siblings
      // follow. A sibling keeps its base's wreck mask (known cells) only when
      // its drawn box reaches a cell the mask leaves out; elsewhere the mask
      // passes every pixel, and the sibling joins the ADD run unmasked.
      this.emissive.draw((sprite) =>
        cellsUnder(spriteBounds(sprite), cx, cy, tile).some(
          ([column, row]) =>
            row < 0 ||
            row >= world.rows ||
            !campaign.isKnown(wrap(column, world.width), row),
        ),
      );
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
      // T8: the pickup name is a Scan label now (the cargo pips stay on).
      if (this.popup && !paused)
        this.annotate({
          id: "pickup",
          text: this.popup.text,
          x: this.popup.x * tile - cx,
          y: this.popup.y * tile - cy,
          priority: 3,
          scan: true,
          tone: "info",
        });

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
      // The player asked for it (a tap or click): it shows without Scan,
      // above the toolbar, lifted clear of a danger notice (an obstacle).
      if (callout)
        this.annotate({
          id: "callout",
          text: callout,
          x: width / 2,
          y: height - safe.bottom - 32,
          priority: 1,
          scan: false,
          tone: "target",
          fixed: true,
        });
      // The rig cue ("Move clear", "Release drilling"): its text and timing
      // stay with the interface; T8 places it clear of the rig, with a tick.
      const cue = document.getElementById("campaign-rig-cue");
      if (cue && !cue.hidden && cue.textContent)
        this.annotate({
          id: "rig-cue",
          text: cue.textContent,
          x: px,
          y: py - tile * 0.5,
          priority: 0,
          scan: false,
          tone: "warn",
        });
      // T8: place this frame's annotations and draw them (render/annotations.ts).
      const placedAnnotations =
        this.overlaysVisible && !interfaceMode
          ? solveAnnotations(
              this.annotationRequests.map((request) => ({
                ...request,
                ...this.annotations.measure(request),
              })),
              {
                width,
                height,
                safe,
                rig: { x: px, y: py },
                tile,
                scanning,
                obstacles: this.obstacles.read(performance.now(), (x, y) =>
                  this.view.clientToScreen(
                    x,
                    y,
                    this.game.canvas.getBoundingClientRect(),
                  ),
                ),
                limits: scanning ? {} : { hazard: 1 },
              },
            )
          : [];
      this.annotations.render(
        placedAnnotations,
        this.view.dpr,
        reduced ? 1 : 1 + 0.06 * Math.sin(this.elapsed * Math.PI * 1.6),
      );
      const targetMarker = placedAnnotations.find(
        (entry) => entry.request.id === "target",
      )?.marker;
      if (targetMarker) {
        poiMarkerX = targetMarker.x.toFixed(2);
        poiMarkerY = targetMarker.y.toFixed(2);
        poiMarkerVisible = true;
      }
      // The screen layer holds only UI: rings, arrows, alarm border, bars.
      this.screen.setVisible(this.overlaysVisible);
      // Twice a second of scene time: the 10 s p95 and the readout.
      this.frameReadoutTimer += dt;
      const resident = this.residentTextures();
      if (this.frameReadoutTimer >= 0.5) {
        this.frameReadoutTimer = 0;
        this.frameP95 = this.resolutionBudget.p95();
        const mib = (bytes: number) => (bytes / 2 ** 20).toFixed(1);
        if (this.frameReadout)
          this.frameReadout.textContent =
            `p95 ${this.frameP95 === undefined ? "—" : this.frameP95.toFixed(1) + " ms"}\n` +
            `backing ${Number(this.view.dpr.toFixed(2))}× · ${this.resolutionBudget.tier}` +
            (this.resolutionBudget.pin === undefined ? "" : " · pinned") +
            // T13b: resident texture bytes, by group, and the page densities.
            `\ntex ${mib(resident.total)} MiB · ${world.id} ${resident.zone} (` +
            TEXTURE_GROUPS.map(
              (group) => `${group} ${mib(resident.groups[group])}`,
            ).join(" · ") +
            `) · pages @${resident.density.replace("/", "x/@")}x` +
            (resident.guard.length
              ? ` · guard ${resident.guard.join(",")} @2x`
              : "") +
            (resident.over ? " · over §7" : "") +
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
          residentTextureBytes: String(resident.total),
          // T13b: -emissive siblings drawn this frame (ADD).
          emissiveSprites: String(this.emissive.count),
          // T13b: the rig's zone, bytes per readout group, page densities.
          residentTextureZone: resident.zone,
          residentTextureGroups: JSON.stringify(resident.groups),
          atlasDensity: resident.density,
          atlasGuard: resident.guard.join(","),
          atlasPages: resident.pages.join(","),
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
          // T8: the annotation labels drawn this frame, and the Scan state.
          worldLabels: String(placedAnnotations.length),
          scan: String(scanning),
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
