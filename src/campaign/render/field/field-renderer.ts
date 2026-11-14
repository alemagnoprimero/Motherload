import Phaser from "phaser";
import type { Campaign } from "../../model";
import type { CampaignWorld } from "../../types";
import type { CampaignView } from "../../view";
import { WORLD_BANDS } from "../../world-content";
import { fogDarkness } from "../bands";
import { RetainedTerrain } from "../terrain";
import {
  FIELD_K,
  FIELD_MAX_HEIGHT,
  FIELD_PAD,
  FIELD_REACH,
  FIELD_TOP,
  FIELD_UPLOAD_MAX,
  FieldData,
  fieldRingRows,
  type FieldRect,
} from "./field-data";
import type { FieldDebug as FieldSwitch, FieldRequest } from "./flag";
import { DiscoveredWorldView, pristineTiles } from "./known-world";
import {
  FIELD_BANDS,
  FIELD_KINDS,
  FIELD_PALETTES,
  roleUniform,
} from "./palette";
import {
  FIELD_FRAGMENT,
  FIELD_TAPS,
  FIELD_VERTEX,
  FIELD_WORLEY_SEEDS,
} from "./shader";
import { TerrainTierPolicy, bootTier, type TierSample } from "./tier";
import { FieldTransitions } from "./transitions";

type WebGLRenderer = Phaser.Renderer.WebGL.WebGLRenderer;
type TextureWrapper = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/**
 * Lattice cells per tile of the shader's noises, each rounded to a whole
 * number of cells over the world width so the terrain is periodic across
 * x = 0: the edge displacement (low, jag), the rust gate, the cave air's
 * mottle, and the courses' waves (strata wave and ripple, block nodes).
 */
const NOISE_FREQUENCY = {
  low: 1.1,
  jag: 4.3,
  rust: 2.2,
  mottle: 0.8,
  wave: 1.6,
  ripple: 4.3,
  nodes: 1 / 0.75,
  zigzag: 2,
};

/**
 * The page's clock as it was when this module loaded: the costs below are
 * real milliseconds even when a test replaces performance.now().
 */
const realNow = performance.now.bind(performance);

const UNIFORMS = [
  "u_resolution",
  "u_field",
  "u_tex",
  "u_layout",
  "u_view",
  "u_bands",
  "u_periods",
  "u_darkU",
  "u_darkV",
  "u_course",
  "u_kind",
  "u_unknown",
  "u_lit",
  "u_lip",
  "u_crack",
  "u_backWall",
  "u_caveAir",
  "u_rust",
  "u_rustBand",
  "u_highContrast",
  "u_slots",
  "u_ring",
] as const;

interface FrameState {
  scrollX: number;
  scrollY: number;
  tile: number;
  dpr: number;
  highContrast: boolean;
  darkU: [number, number, number, number];
  darkV: [number, number, number, number];
  bands: [number, number, number, number];
  /** The world's palette as uniforms: roles (vec3[4]), kinds and rust. */
  roles: Record<string, Float32Array>;
  kinds: [number, number, number, number];
  rust: [number, number, number, number];
}

/** The scene clock, as the transitions need it (§5.1 principle 6). */
export interface FieldClock {
  /** Scene seconds: frozen under the test clock. */
  seconds: number;
  /** False with the clock frozen or reduced motion on: cells change at once. */
  animate: boolean;
}

/** p95 over the last 10 s of real time of one measured cost. */
class CostWindow {
  private samples: { at: number; value: number }[] = [];
  /** Samples since the last take(), for the harness. */
  private fresh: number[] = [];
  add(value: number, at = realNow()) {
    this.samples.push({ at, value });
    this.fresh.push(value);
    if (this.fresh.length > 4096) this.fresh.shift();
    while (this.samples.length && this.samples[0]!.at <= at - 10000)
      this.samples.shift();
  }
  p95() {
    if (!this.samples.length) return undefined;
    const ordered = this.samples.map((s) => s.value).sort((a, b) => a - b);
    return ordered[
      Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))
    ];
  }
  get count() {
    return this.samples.length;
  }
  take() {
    const values = this.fresh;
    this.fresh = [];
    return values;
  }
}

/** What `window.__campaignField` reports (the harness reads it). */
export interface FieldDebug {
  info(): {
    active: boolean;
    status: string;
    world: string | null;
    texture: [number, number] | null;
    ring: { rows: number; window: number } | null;
    uploads: number;
    lastUpload: FieldRect | null;
    pendingGroups: number;
    transitions: number;
    taps: number;
    worleySeeds: number;
  };
  /**
   * The field's CPU cost per frame since the last call, in real
   * milliseconds: the change scan and the quad's own GL calls (every
   * frame), and the patch build and the upload (frames that had one), with
   * each patch's texel count.
   */
  costs(): {
    sync: number[];
    patch: number[];
    upload: number[];
    draw: number[];
    area: number[];
  };
  /** The visual air mask of the last frame as a PNG data URL (white = air). */
  airMask(): string | null;
  /**
   * The field quad alone as a PNG data URL: the terrain as the shader draws
   * it this frame, before the light overlay, the rig and everything else
   * (sky is transparent). The motion check reads the transitions on it,
   * with `view` holding the camera still while the rig moves.
   */
  colour(view?: { scrollX: number; scrollY: number }): string | null;
  /**
   * The field quad alone, `draws` times into an off-screen target of the
   * drawing buffer's size, against a one-tap copy quad, with gl.finish():
   * milliseconds per full-screen draw on whatever rasteriser runs it.
   */
  benchmark(draws?: number): {
    width: number;
    height: number;
    fieldMs: number;
    copyMs: number;
  } | null;
}

declare global {
  interface Window {
    __campaignField?: FieldDebug;
  }
}

/**
 * T2: the terrain drawn by one shader quad from the field texture. The quad
 * is an Extern game object at RetainedTerrain's depth, so the rest of the
 * stack is unchanged: ores, the light overlay (lighting.ts) and the rig draw
 * on top as before.
 *
 * Uploads happen inside the Extern's render, between Phaser's
 * pipelines.clear() and rebind(), which restore Phaser's bound textures,
 * program and attributes: one texSubImage2D of at most 160 × 160 texels per
 * frame, none in a still frame. Where the field cannot run (tier.ts: the
 * Canvas renderer, no fragment highp, a shader that fails to build, or
 * frame intervals that do not hold) it draws with RetainedTerrain and says
 * why in `status`.
 */
export class FieldTerrain {
  draws = 0;
  dirtyCells = 0;
  bytes = 0;
  /** "field" when the shader draws the terrain, else "retained (why)". */
  status = "starting";
  private extern: Phaser.GameObjects.Extern;
  private renderer: WebGLRenderer | undefined;
  private gl: WebGLRenderingContext | undefined;
  private fallback: RetainedTerrain | undefined;
  private fallbackReason: string | undefined;
  private policy: TerrainTierPolicy | undefined;
  private data: FieldData | undefined;
  private world: CampaignWorld | undefined;
  private worldKey = "";
  private texture: TextureWrapper | undefined;
  /** "twotex": the second copy, and which of the two the last frame drew. */
  private texture2: TextureWrapper | undefined;
  private front = 0;
  /** Patches one copy has and the other is still owed, with their bytes. */
  private owed: { rect: FieldRect; bytes: Uint8Array }[][] = [[], []];
  private pool: Uint8Array[] = [];
  private idleFrames = 0;
  /** "copy": the staging texture a patch is uploaded to, and its framebuffer. */
  private stagingTexture: WebGLTexture | undefined;
  private stagingFramebuffer: WebGLFramebuffer | undefined;
  private mode: "single" | "twotex" | "copy" = "single";
  private skipUpload = false;
  private noTransitions = false;
  private program: WebGLProgram | undefined;
  private buffer: WebGLBuffer | undefined;
  private bufferSize = "";
  private locations = new Map<string, WebGLUniformLocation | null>();
  private patch: FieldRect | undefined;
  private lastUpload: FieldRect | undefined;
  private staging = new Uint8Array(FIELD_UPLOAD_MAX * FIELD_UPLOAD_MAX * 4);
  private frame: FrameState = {
    scrollX: 0,
    scrollY: 0,
    tile: 1,
    dpr: 1,
    highContrast: false,
    darkU: [0, 0, 0, 0],
    darkV: [0, 0, 0, 0],
    bands: [0, 0, 0, 0],
    roles: {},
    kinds: [0, 0, 0, 0],
    rust: [0, 0, 0, 0],
  };
  private frameKey = "";
  private ready = false;
  private transitions = new FieldTransitions();
  private slotValues = new Float32Array(16).fill(1);
  private costSync = new CostWindow();
  private costPatch = new CostWindow();
  private costUpload = new CostWindow();
  private costDraw = new CostWindow();
  private patchAreas: number[] = [];
  private lost = false;
  private maxTexture = 0;
  private maxHeight = 0;
  private onLose = () => {
    this.lost = true;
  };
  private onRestore = () => {
    // Phaser re-creates the texture from `pixels` (the CPU copy); the
    // program and the quad buffer are ours to rebuild.
    this.lost = false;
    this.program = undefined;
    this.buffer = undefined;
    this.bufferSize = "";
    this.locations.clear();
    this.patch = undefined;
    this.stagingTexture = undefined;
    this.stagingFramebuffer = undefined;
    this.releaseOwed();
  };
  /**
   * `request` is "full" for a pinned field (`?field=1`: no measured step
   * down) and "auto" for the default, which lets tier.ts step down.
   */
  constructor(
    private scene: Phaser.Scene,
    request: Exclude<FieldRequest, "off"> = "auto",
    /** Debug: a lower limit on the texture's height, to exercise the ring (`?fieldmax=`). */
    textureLimit?: number,
    /** Debug: switches for readings (`?fielddebug=`, flag.ts). */
    debug: ReadonlySet<FieldSwitch> = new Set(),
  ) {
    this.mode = debug.has("twotex")
      ? "twotex"
      : debug.has("copy")
        ? "copy"
        : "single";
    this.skipUpload = debug.has("noupload");
    this.noTransitions = debug.has("notransitions");
    this.extern = scene.add.extern().setDepth(10);
    (
      this.extern as unknown as {
        render: (renderer: WebGLRenderer) => void;
      }
    ).render = (renderer) => this.draw(renderer);
    let highp = false,
      rendererName = "";
    if (scene.game.renderer.type === Phaser.WEBGL) {
      this.renderer = scene.game.renderer as WebGLRenderer;
      const gl = this.renderer.gl;
      this.gl = gl;
      highp =
        (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
          ?.precision ?? 0) > 0;
      // The unmasked renderer string tells a software rasteriser (tier.ts);
      // a pinned field does not ask.
      const info =
        request === "auto"
          ? gl.getExtension("WEBGL_debug_renderer_info")
          : null;
      if (info)
        rendererName = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      // The height limit is where the ring is: FIELD_MAX_HEIGHT, or the
      // debug limit (?fieldmax), and never more than the GPU's.
      this.maxHeight = Math.min(
        this.maxTexture,
        textureLimit ?? FIELD_MAX_HEIGHT,
      );
      this.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, this.onLose);
      this.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore);
    }
    const boot = bootTier(
      this.renderer ? "webgl" : "canvas",
      highp,
      rendererName,
    );
    if (boot.tier === "retained") this.fallbackReason = boot.reason;
    else if (request === "auto") this.policy = new TerrainTierPolicy();
    window.__campaignField = {
      info: () => ({
        active: this.status === "field",
        status: this.status,
        world: this.world?.id ?? null,
        texture: this.data ? [this.data.texWidth, this.data.texHeight] : null,
        ring: this.data?.ring
          ? { rows: this.data.ringRows, window: this.data.window }
          : null,
        uploads: this.draws,
        lastUpload: this.lastUpload ?? null,
        pendingGroups: this.data?.pending ?? 0,
        transitions: this.transitions.running,
        taps: FIELD_TAPS,
        worleySeeds: FIELD_WORLEY_SEEDS,
      }),
      costs: () => ({
        sync: this.costSync.take(),
        patch: this.costPatch.take(),
        upload: this.costUpload.take(),
        draw: this.costDraw.take(),
        area: this.patchAreas.splice(0),
      }),
      airMask: () => this.capture(true),
      colour: (view) => this.capture(false, view),
      benchmark: (draws = 5) => this.benchmark(draws),
    };
  }

  /** True while the field shader is the terrain renderer. */
  get field() {
    return !this.fallbackReason;
  }

  /**
   * Bytes of the field's own GL texture, which the TextureManager does not
   * list (audit §7: the resident total must count raw textures). 0 when
   * RetainedTerrain draws: its canvas texture is listed.
   */
  get rawTextureBytes() {
    return this.texture && this.data
      ? this.data.texWidth * this.data.texHeight * 4 * (this.texture2 ? 2 : 1)
      : 0;
  }

  /** The readout's line: the field's CPU cost per frame (p95 over 10 s). */
  costLine() {
    if (!this.field) return undefined;
    const ms = (window: CostWindow) => window.p95()?.toFixed(1) ?? "—";
    return (
      `field scan ${ms(this.costSync)} · patch ${ms(this.costPatch)} · ` +
      `upload ${ms(this.costUpload)} · draw ${ms(this.costDraw)} ms ` +
      `(${this.costPatch.count} patches)`
    );
  }

  /** The tier policy's line for the readout. */
  tierLine() {
    if (!this.field) return undefined;
    if (!this.policy) return "tier pinned";
    const p95 = this.policy.lastP95;
    return `tier window ${p95 === undefined ? "—" : p95.toFixed(1)} ms`;
  }

  /**
   * One presented frame, for the measured tier step (tier.ts). When the
   * intervals do not hold, the terrain goes to RetainedTerrain from the next
   * frame on.
   */
  sample(frame: TierSample) {
    if (!this.field || !this.policy) return;
    if (this.policy.sample(frame)) this.useFallback(this.policy.reason!);
  }

  invalidate() {
    this.worldKey = "";
    this.fallback?.invalidate();
  }

  private useFallback(reason: string) {
    this.fallbackReason = reason;
    this.status = `retained (${reason})`;
    this.extern.setVisible(false);
    this.ready = false;
    // The field's texture and CPU copy are not needed again this session.
    this.deleteTextures();
    this.data = undefined;
    this.world = undefined;
    this.worldKey = "";
    this.patch = undefined;
    this.fallback ??= new RetainedTerrain(this.scene);
  }

  render(
    campaign: Campaign,
    view: CampaignView,
    highContrast: boolean,
    /** RetainedTerrain's tile size, when the scene overrides it (?tile=). */
    baseTile?: number,
    clock: FieldClock = { seconds: 0, animate: false },
  ) {
    if (
      !this.fallbackReason &&
      campaign.world.width * FIELD_K + 2 * FIELD_PAD > this.maxTexture
    )
      this.useFallback(`world wider than ${this.maxTexture} texels`);
    // A ring must hold every row on screen and the blur's reach around
    // them. A view taller than that (57 rows of a 63-row ring: a desktop
    // window more than 2.6 times taller than wide) keeps RetainedTerrain.
    const ringRows = fieldRingRows(campaign.world.rows, this.maxHeight);
    if (
      !this.fallbackReason &&
      ringRows > 0 &&
      Math.ceil(view.height / view.tile) + 2 + 2 * FIELD_REACH > ringRows
    )
      this.useFallback(`view taller than the field's ${ringRows} rows`);
    if (this.fallbackReason) {
      if (!this.fallback) this.useFallback(this.fallbackReason);
      this.fallback!.render(campaign, view, highContrast, baseTile);
      this.draws = this.fallback!.draws;
      this.dirtyCells = this.fallback!.dirtyCells;
      this.bytes = this.fallback!.bytes;
      return;
    }
    this.renderField(campaign, view, highContrast, clock);
  }

  private renderField(
    campaign: Campaign,
    view: CampaignView,
    highContrast: boolean,
    clock: FieldClock,
  ) {
    const world = campaign.world,
      renderer = this.renderer!,
      transitions = this.transitions;
    const key = `${world.id}:${world.seed}:${world.width}x${world.rows}`;
    const known = new DiscoveredWorldView(world, pristineTiles(world));
    if (world !== this.world || key !== this.worldKey) {
      // A new world or an import: rebuild everything (a loading window).
      const reuse =
        this.data &&
        this.data.width === world.width &&
        this.data.rows === world.rows;
      if (!reuse)
        this.data = new FieldData(world.width, world.rows, this.maxHeight);
      this.data!.load(known, campaign.renderY);
      transitions.reset();
      if (this.texture && !reuse) this.deleteTextures();
      this.releaseOwed();
      if (!this.texture) {
        const gl = this.gl!;
        const create = () =>
          renderer.createTexture2D(
            0,
            gl.LINEAR,
            gl.LINEAR,
            gl.CLAMP_TO_EDGE,
            gl.CLAMP_TO_EDGE,
            gl.RGBA,
            this.data!.pixels as unknown as object,
            this.data!.texWidth,
            this.data!.texHeight,
            false,
            true,
            false,
          );
        this.texture = create();
        if (this.mode === "twotex") this.texture2 = create();
      } else {
        // Same size: re-upload the whole texture once.
        this.patch = {
          x: 0,
          y: 0,
          width: this.data!.texWidth,
          height: this.data!.texHeight,
        };
      }
      this.draws++;
      this.dirtyCells = world.width * world.rows;
      this.world = world;
      this.worldKey = key;
      this.frameKey = "";
    } else {
      const data = this.data!,
        started = realNow();
      // A world taller than the texture: keep the rows on screen in the ring.
      if (data.ring)
        data.setWindow(
          Math.floor(view.scrollY / view.tile) + FIELD_TOP,
          Math.ceil((view.scrollY + view.height) / view.tile) + FIELD_TOP,
          8,
        );
      this.dirtyCells = data.sync(
        known,
        clock.animate && !this.noTransitions
          ? (kind) => transitions.open(kind, clock.seconds)
          : undefined,
      );
      // Transitions that ended: their cells go back to slot 0, and the
      // slots are free once that rewrite is on the GPU.
      if (transitions.running)
        for (const slot of transitions.finished(clock.seconds))
          data.settle(slot);
      const scanned = realNow();
      this.costSync.add(scanned - started, scanned);
      if (!this.patch) {
        if (!data.pending) transitions.release();
        else {
          this.patch = data.nextPatch({
            x: campaign.renderX,
            y: campaign.renderY,
          });
          if (this.patch) {
            const built = realNow();
            this.costPatch.add(built - scanned, built);
            this.patchAreas.push(this.patch.width * this.patch.height);
            if (this.patchAreas.length > 4096) this.patchAreas.shift();
          }
        }
      }
    }
    transitions.values(clock.seconds, this.slotValues);
    this.bytes = this.data!.texWidth * this.data!.texHeight * 4;
    const f = this.frame;
    f.scrollX = view.scrollX;
    f.scrollY = view.scrollY;
    f.tile = view.tile;
    f.dpr = view.dpr;
    f.highContrast = highContrast;
    const frameKey = `${key}:${highContrast}`;
    if (frameKey !== this.frameKey) {
      this.frameKey = frameKey;
      const bandStarts = (
        WORLD_BANDS[world.id as keyof typeof WORLD_BANDS] ?? WORLD_BANDS.W01
      ).map((band) => band.start);
      ["a", "b", "c", "d"].forEach((id, i) => {
        f.darkU[i] = fogDarkness("unknown", world.id, id, highContrast);
        f.darkV[i] = fogDarkness("visible", world.id, id, highContrast);
      });
      f.bands = [
        bandStarts[1] ?? 1e4,
        bandStarts[2] ?? 1e4,
        bandStarts[3] ?? 1e4,
        world.rows,
      ];
      const palette = FIELD_PALETTES[world.id === "W02" ? "W02" : "W01"];
      f.roles = {
        u_unknown: roleUniform(world.id, (band) => band.unknown),
        u_lit: roleUniform(world.id, (band) => band.lit),
        u_lip: roleUniform(world.id, (band) => band.lip),
        u_crack: roleUniform(world.id, (band) => band.crack),
        u_backWall: roleUniform(world.id, (band) => band.backWall),
        u_caveAir: roleUniform(world.id, (band) => band.caveAir),
        // A band without rust never mixes it in: any colour will do.
        u_rust: roleUniform(world.id, (band) => band.rust ?? "#000000"),
      };
      FIELD_BANDS.forEach((id, i) => {
        f.kinds[i] = FIELD_KINDS[palette[id].kind];
        f.rust[i] = palette[id].rust ? (palette[id].rustAmount ?? 1) : 0;
      });
    }
    this.ready = true;
    this.status = "field";
    this.extern.setVisible(true);
  }

  private compile() {
    const gl = this.gl!;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, FIELD_VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FIELD_FRAGMENT));
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    this.locations.clear();
    for (const name of UNIFORMS)
      this.locations.set(name, gl.getUniformLocation(program, name));
    this.program = program;
  }

  /** Inside the Extern render: Phaser has flushed and will rebind afterwards. */
  private deleteTextures() {
    for (const texture of [this.texture, this.texture2])
      if (texture) this.renderer?.deleteTexture(texture);
    this.texture = undefined;
    this.texture2 = undefined;
    this.releaseOwed();
  }

  /** A kept patch's buffer, whole again, back in the pool. */
  private recycle(bytes: Uint8Array) {
    this.pool.push(new Uint8Array(bytes.buffer));
  }

  /** Forget what the copies owe each other (a reload sends everything). */
  private releaseOwed() {
    for (const list of this.owed) {
      for (const { bytes } of list) this.recycle(bytes);
      list.length = 0;
    }
    this.front = 0;
    this.idleFrames = 0;
  }

  /**
   * "copy": the patch goes to a staging texture that is given new storage
   * each time, so the upload never writes into storage a frame still reads,
   * and the GPU copies it into the field texture in command order.
   */
  private copyUpload(
    gl: WebGLRenderingContext,
    rect: FieldRect,
    bytes: Uint8Array,
  ) {
    if (!this.stagingTexture) {
      this.stagingTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.stagingTexture);
      for (const [name, value] of [
        [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
        [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      ] as const)
        gl.texParameteri(gl.TEXTURE_2D, name, value);
      this.stagingFramebuffer = gl.createFramebuffer()!;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.stagingTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      rect.width,
      rect.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.stagingFramebuffer!);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.stagingTexture,
      0,
    );
    gl.bindTexture(gl.TEXTURE_2D, this.texture!.webGLTexture);
    gl.copyTexSubImage2D(
      gl.TEXTURE_2D,
      0,
      rect.x,
      rect.y,
      0,
      0,
      rect.width,
      rect.height,
    );
    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      this.renderer!.currentFramebuffer?.webGLFramebuffer ?? null,
    );
  }

  private draw(renderer: WebGLRenderer, debugAir = false, harness = false) {
    const gl = this.gl;
    if (!gl || this.lost || !this.texture || !this.ready || !this.data) return;
    if (!this.program) {
      try {
        this.compile();
      } catch (error) {
        console.warn("T2 field shader failed; using RetainedTerrain", error);
        this.useFallback("shader failed");
        return;
      }
    }
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    let drawStarted = realNow();
    gl.activeTexture(gl.TEXTURE0);
    const copies = this.texture2
      ? [this.texture, this.texture2]
      : [this.texture];
    const bind = (n: number) =>
      gl.bindTexture(gl.TEXTURE_2D, copies[n]!.webGLTexture);
    const send = (rect: FieldRect, bytes: Uint8Array) =>
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
    /** The other copy catches up on the patches it is owed. */
    const settle = (n: number) => {
      bind(n);
      for (const { rect, bytes } of this.owed[n]!) {
        send(rect, bytes);
        this.recycle(bytes);
      }
      this.owed[n]!.length = 0;
    };
    if (copies.length === 1) this.front = 0;
    if (this.patch && !debugAir && !harness) {
      const rect = this.patch,
        started = realNow();
      const full =
        rect.width === this.data.texWidth &&
        rect.height === this.data.texHeight;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (full) {
        // A loading frame: every copy takes the whole texture.
        this.releaseOwed();
        for (let n = 0; n < copies.length; n++) {
          bind(n);
          send(rect, this.data.pixels);
        }
      } else {
        const bytes = this.data.extract(rect, this.staging);
        if (this.skipUpload) {
          // Debug: built, not sent.
        } else if (copies.length === 2) {
          // The copy the last frame drew may still be in flight: patch the
          // other one, draw it, and leave this patch owed to the first.
          const back = 1 - this.front;
          settle(back);
          send(rect, bytes);
          const kept = this.pool.pop() ?? new Uint8Array(this.staging.length);
          kept.set(bytes);
          this.owed[this.front]!.push({
            rect,
            bytes: kept.subarray(0, bytes.length),
          });
          this.front = back;
        } else if (this.mode === "copy") {
          this.copyUpload(gl, rect, bytes);
        } else {
          bind(0);
          send(rect, bytes);
        }
      }
      drawStarted = realNow();
      if (!full) this.costUpload.add(drawStarted - started, drawStarted);
      this.lastUpload = rect;
      this.patch = undefined;
      this.draws++;
      this.idleFrames = 0;
    } else if (
      copies.length === 2 &&
      !debugAir &&
      !harness &&
      this.owed[1 - this.front]!.length &&
      ++this.idleFrames >= 2
    ) {
      // Two frames after the last patch the other copy is idle: it catches
      // up, so a parked rig owes nothing.
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      settle(1 - this.front);
      this.draws++;
    }
    bind(this.front);
    gl.useProgram(this.program!);
    const size = `${width}x${height}`;
    if (!this.buffer || size !== this.bufferSize) {
      this.buffer ??= gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      // Device pixels, two triangles: the render probe accounts for it.
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          0,
          0,
          width,
          0,
          0,
          height,
          0,
          height,
          width,
          0,
          width,
          height,
        ]),
        gl.STATIC_DRAW,
      );
      this.bufferSize = size;
    } else gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const f = this.frame,
      data = this.data,
      u = (name: string) => this.locations.get(name) ?? null;
    const W = data.width;
    gl.uniform2f(u("u_resolution"), width, height);
    gl.uniform1i(u("u_field"), 0);
    gl.uniform4f(u("u_tex"), data.texWidth, data.texHeight, W, FIELD_K);
    gl.uniform4f(u("u_layout"), FIELD_PAD, FIELD_TOP, height, debugAir ? 1 : 0);
    gl.uniform4f(u("u_view"), f.scrollX, f.scrollY, f.tile, f.dpr);
    gl.uniform4f(u("u_bands"), ...f.bands);
    const cells = (perTile: number) => Math.max(1, Math.round(perTile * W));
    gl.uniform4f(
      u("u_periods"),
      cells(NOISE_FREQUENCY.low),
      cells(NOISE_FREQUENCY.jag),
      cells(NOISE_FREQUENCY.rust),
      cells(NOISE_FREQUENCY.mottle),
    );
    gl.uniform4f(
      u("u_course"),
      cells(NOISE_FREQUENCY.wave),
      cells(NOISE_FREQUENCY.ripple),
      cells(NOISE_FREQUENCY.nodes),
      // The zig-zag alternates sign: an even count closes across x = 0.
      2 * Math.max(1, Math.round((NOISE_FREQUENCY.zigzag * W) / 2)),
    );
    gl.uniform4f(u("u_kind"), ...f.kinds);
    gl.uniform4f(u("u_rustBand"), ...f.rust);
    gl.uniform4f(u("u_darkU"), ...f.darkU);
    gl.uniform4f(u("u_darkV"), ...f.darkV);
    for (const name in f.roles) gl.uniform3fv(u(name), f.roles[name]!);
    gl.uniform1f(u("u_highContrast"), f.highContrast ? 1 : 0);
    gl.uniform4fv(u("u_slots"), this.slotValues);
    // The ring: its height in texels, the repeated row above it, and the
    // last virtual texel row (the bedrock row's end).
    gl.uniform4f(
      u("u_ring"),
      data.ringRows * FIELD_K,
      data.padY,
      data.virtualRows * FIELD_K - 0.01,
      0,
    );
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!harness && !debugAir) this.costDraw.add(realNow() - drawStarted);
    void renderer;
  }

  /** Harness: the shader's cost per full-screen draw (FieldDebug.benchmark). */
  private benchmark(draws: number) {
    const gl = this.gl,
      renderer = this.renderer;
    if (!gl || !renderer || this.status !== "field" || !this.texture)
      return null;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    renderer.pipelines.clear();
    const target = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      target,
      0,
    );
    const pixel = new Uint8Array(4);
    const time = (draw: () => void) => {
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const start = performance.now();
      for (let n = 0; n < draws; n++) draw();
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return (performance.now() - start) / draws;
    };
    const fieldMs = time(() => this.draw(renderer, false, true));
    // A one-tap copy of the field texture over the same quad, for scale.
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const copy = gl.createProgram()!;
    gl.attachShader(copy, shader(gl.VERTEX_SHADER, FIELD_VERTEX));
    gl.attachShader(
      copy,
      shader(
        gl.FRAGMENT_SHADER,
        "precision mediump float; uniform sampler2D u_field; uniform vec2 u_resolution;" +
          "void main() { gl_FragColor = texture2D(u_field, gl_FragCoord.xy / u_resolution); }",
      ),
    );
    gl.bindAttribLocation(copy, 0, "a_position");
    gl.linkProgram(copy);
    const copyMs = time(() => {
      gl.useProgram(copy);
      gl.bindTexture(gl.TEXTURE_2D, this.texture!.webGLTexture);
      gl.uniform1i(gl.getUniformLocation(copy, "u_field"), 0);
      gl.uniform2f(gl.getUniformLocation(copy, "u_resolution"), width, height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer!);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(0);
    });
    gl.deleteProgram(copy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(target);
    renderer.pipelines.rebind();
    return { width, height, fieldMs, copyMs };
  }

  /** Harness: draws the field quad (or its air mask) off screen and reads it back. */
  private capture(air: boolean, view?: { scrollX: number; scrollY: number }) {
    const gl = this.gl,
      renderer = this.renderer;
    if (!gl || !renderer || this.status !== "field" || !this.texture)
      return null;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    renderer.pipelines.clear();
    const target = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      target,
      0,
    );
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const { scrollX, scrollY } = this.frame;
    if (view) {
      this.frame.scrollX = view.scrollX;
      this.frame.scrollY = view.scrollY;
    }
    this.draw(renderer, air, true);
    this.frame.scrollX = scrollX;
    this.frame.scrollY = scrollY;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(target);
    gl.enable(gl.BLEND);
    renderer.pipelines.rebind();
    // GL rows run bottom-up.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(width, height);
    for (let row = 0; row < height; row++)
      image.data.set(
        pixels.subarray(
          (height - 1 - row) * width * 4,
          (height - row) * width * 4,
        ),
        row * width * 4,
      );
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }

  destroy() {
    this.renderer?.off(Phaser.Renderer.Events.LOSE_WEBGL, this.onLose);
    this.renderer?.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore);
    this.extern.destroy();
    this.fallback?.destroy();
    this.deleteTextures();
    if (this.stagingTexture) this.gl?.deleteTexture(this.stagingTexture);
    if (this.stagingFramebuffer)
      this.gl?.deleteFramebuffer(this.stagingFramebuffer);
    if (this.program) this.gl?.deleteProgram(this.program);
    if (this.buffer) this.gl?.deleteBuffer(this.buffer);
    if (window.__campaignField) delete window.__campaignField;
  }
}

/**
 * The terrain layer the scene draws: the field renderer wherever it can run
 * (flag.ts, tier.ts), which keeps RetainedTerrain where it cannot;
 * `?field=0` asks for RetainedTerrain outright.
 */
export function createTerrainLayer(
  scene: Phaser.Scene,
  request: FieldRequest,
  textureLimit?: number,
  debug?: ReadonlySet<FieldSwitch>,
) {
  return request === "off"
    ? new RetainedTerrain(scene)
    : new FieldTerrain(scene, request, textureLimit, debug);
}
