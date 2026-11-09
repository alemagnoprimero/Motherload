import Phaser from "phaser";
import type { Campaign } from "../../model";
import type { CampaignWorld } from "../../types";
import type { CampaignView } from "../../view";
import { WORLD_BANDS } from "../../world-content";
import { fogDarkness } from "../bands";
import { RetainedTerrain } from "../terrain";
import {
  FIELD_K,
  FIELD_PAD,
  FIELD_TOP,
  FieldData,
  type FieldRect,
} from "./field-data";
import { DiscoveredWorldView, pristineTiles } from "./known-world";
import { FIELD_PALETTE, hexToVec3 } from "./palette";
import {
  FIELD_FRAGMENT,
  FIELD_TAPS,
  FIELD_VERTEX,
  FIELD_WORLEY_SEEDS,
} from "./shader";

type WebGLRenderer = Phaser.Renderer.WebGL.WebGLRenderer;
type TextureWrapper = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/** Lattice cells per tile of the shader's value noise; periodic over the world. */
const NOISE_FREQUENCY = { low: 1.1, jag: 4.3, warp: 1.3, mottle: 0.8 };

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
  "u_unknown",
  "u_lit",
  "u_lip",
  "u_crack",
  "u_interior",
  "u_caveAir",
  "u_rust",
  "u_highContrast",
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
}

/** What `window.__campaignField` reports (the harness reads it). */
export interface FieldDebug {
  info(): {
    active: boolean;
    status: string;
    world: string | null;
    texture: [number, number] | null;
    uploads: number;
    lastUpload: FieldRect | null;
    pendingGroups: number;
    taps: number;
    worleySeeds: number;
  };
  /** The visual air mask of the last frame as a PNG data URL (white = air). */
  airMask(): string | null;
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
 * T2 spike: the terrain drawn by one shader quad from the field texture,
 * behind `?field=1` (flag.ts). The quad is an Extern game object at
 * RetainedTerrain's depth, so the rest of the stack is unchanged: ores,
 * the light overlay (lighting.ts) and the rig draw on top as before.
 *
 * Uploads happen inside the Extern's render, between Phaser's
 * pipelines.clear() and rebind(), which restore Phaser's bound textures,
 * program and attributes: one texSubImage2D of at most 160 × 160 texels per
 * frame, none in a still frame. Without WebGL fragment highp, or if the
 * world does not fit a texture, it keeps RetainedTerrain and says why in
 * `status` (the Medium tier would bake periodic pages instead, §7).
 */
export class FieldTerrain {
  draws = 0;
  dirtyCells = 0;
  bytes = 0;
  /** "field" when the shader draws the terrain, else why not. */
  status = "starting";
  private extern: Phaser.GameObjects.Extern;
  private renderer: WebGLRenderer | undefined;
  private gl: WebGLRenderingContext | undefined;
  private fallback: RetainedTerrain | undefined;
  private data: FieldData | undefined;
  private world: CampaignWorld | undefined;
  private worldKey = "";
  private texture: TextureWrapper | undefined;
  private program: WebGLProgram | undefined;
  private buffer: WebGLBuffer | undefined;
  private bufferSize = "";
  private locations = new Map<string, WebGLUniformLocation | null>();
  private patch: FieldRect | undefined;
  private lastUpload: FieldRect | undefined;
  private staging = new Uint8Array(160 * 160 * 4);
  private frame: FrameState | undefined;
  private lost = false;
  private highp = false;
  private maxTexture = 0;
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
  };
  constructor(private scene: Phaser.Scene) {
    this.extern = scene.add.extern().setDepth(10);
    (
      this.extern as unknown as {
        render: (renderer: WebGLRenderer) => void;
      }
    ).render = (renderer) => this.draw(renderer);
    if (scene.game.renderer.type === Phaser.WEBGL) {
      this.renderer = scene.game.renderer as WebGLRenderer;
      const gl = this.renderer.gl;
      this.gl = gl;
      this.highp =
        (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
          ?.precision ?? 0) > 0;
      this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      this.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, this.onLose);
      this.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore);
    }
    window.__campaignField = {
      info: () => ({
        active: this.status === "field",
        status: this.status,
        world: this.world?.id ?? null,
        texture: this.data ? [this.data.texWidth, this.data.texHeight] : null,
        uploads: this.draws,
        lastUpload: this.lastUpload ?? null,
        pendingGroups: this.data?.pending ?? 0,
        taps: FIELD_TAPS,
        worleySeeds: FIELD_WORLEY_SEEDS,
      }),
      airMask: () => this.airMask(),
      benchmark: (draws = 5) => this.benchmark(draws),
    };
  }

  invalidate() {
    this.worldKey = "";
    this.fallback?.invalidate();
  }

  private useFallback(reason: string) {
    this.status = `retained (${reason})`;
    this.extern.setVisible(false);
    this.fallback ??= new RetainedTerrain(this.scene);
  }

  render(campaign: Campaign, view: CampaignView, highContrast: boolean) {
    const world = campaign.world;
    const fits =
      world.width * FIELD_K + 2 * FIELD_PAD <= this.maxTexture &&
      (world.rows + FIELD_TOP + 1) * FIELD_K <= this.maxTexture;
    if (!this.renderer || !this.gl) this.useFallback("Canvas renderer");
    else if (!this.highp) this.useFallback("no fragment highp");
    else if (!fits) this.useFallback(`world exceeds ${this.maxTexture} texels`);
    else if (this.status === "retained (shader failed)") {
      // A shader that failed to build stays failed.
    } else {
      if (this.fallback) {
        this.fallback.destroy();
        this.fallback = undefined;
      }
      this.renderField(campaign, view, highContrast);
      return;
    }
    this.fallback!.render(campaign, view, highContrast);
    this.draws = this.fallback!.draws;
    this.dirtyCells = this.fallback!.dirtyCells;
    this.bytes = this.fallback!.bytes;
  }

  private renderField(
    campaign: Campaign,
    view: CampaignView,
    highContrast: boolean,
  ) {
    const world = campaign.world,
      renderer = this.renderer!;
    const key = `${world.id}:${world.seed}:${world.width}x${world.rows}`;
    const known = new DiscoveredWorldView(world, pristineTiles(world));
    if (world !== this.world || key !== this.worldKey) {
      // A new world or an import: rebuild everything (a loading window).
      const reuse =
        this.data &&
        this.data.width === world.width &&
        this.data.rows === world.rows;
      if (!reuse) this.data = new FieldData(world.width, world.rows);
      this.data!.load(known);
      if (this.texture && !reuse) {
        renderer.deleteTexture(this.texture);
        this.texture = undefined;
      }
      if (!this.texture) {
        const gl = this.gl!;
        this.texture = renderer.createTexture2D(
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
    } else {
      this.dirtyCells = this.data!.sync(known);
      if (!this.patch) {
        const wrapX =
          ((campaign.renderX % world.width) + world.width) % world.width;
        this.patch = this.data!.nextPatch({
          x: wrapX * FIELD_K + FIELD_PAD,
          y: (campaign.renderY + FIELD_TOP) * FIELD_K,
        });
      }
    }
    this.bytes = this.data!.texWidth * this.data!.texHeight * 4;
    const bandStarts = (
      WORLD_BANDS[world.id as keyof typeof WORLD_BANDS] ?? WORLD_BANDS.W01
    ).map((band) => band.start);
    const bandIds = ["a", "b", "c", "d"];
    this.frame = {
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      tile: view.tile,
      dpr: view.dpr,
      highContrast,
      darkU: bandIds.map((id) =>
        fogDarkness("unknown", world.id, id, highContrast),
      ) as FrameState["darkU"],
      darkV: bandIds.map((id) =>
        fogDarkness("visible", world.id, id, highContrast),
      ) as FrameState["darkV"],
      bands: [
        bandStarts[1] ?? 1e4,
        bandStarts[2] ?? 1e4,
        bandStarts[3] ?? 1e4,
        world.rows,
      ],
    };
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
  private draw(renderer: WebGLRenderer, debugAir = false, harness = false) {
    const gl = this.gl;
    if (!gl || this.lost || !this.texture || !this.frame || !this.data) return;
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture.webGLTexture);
    if (this.patch && !debugAir && !harness) {
      const rect = this.patch;
      const full =
        rect.width === this.data.texWidth &&
        rect.height === this.data.texHeight;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        full ? this.data.pixels : this.data.extract(rect, this.staging),
      );
      this.lastUpload = rect;
      this.patch = undefined;
      this.draws++;
    }
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
      u = (name: string) => this.locations.get(name) ?? null;
    const W = this.data.width;
    gl.uniform2f(u("u_resolution"), width, height);
    gl.uniform1i(u("u_field"), 0);
    gl.uniform4f(
      u("u_tex"),
      this.data.texWidth,
      this.data.texHeight,
      W,
      FIELD_K,
    );
    gl.uniform4f(u("u_layout"), FIELD_PAD, FIELD_TOP, height, debugAir ? 1 : 0);
    gl.uniform4f(u("u_view"), f.scrollX, f.scrollY, f.tile, f.dpr);
    gl.uniform4f(u("u_bands"), ...f.bands);
    gl.uniform4f(
      u("u_periods"),
      Math.max(1, Math.round(NOISE_FREQUENCY.low * W)),
      Math.max(1, Math.round(NOISE_FREQUENCY.jag * W)),
      Math.max(1, Math.round(NOISE_FREQUENCY.warp * W)),
      Math.max(1, Math.round(NOISE_FREQUENCY.mottle * W)),
    );
    gl.uniform4f(u("u_darkU"), ...f.darkU);
    gl.uniform4f(u("u_darkV"), ...f.darkV);
    for (const [name, hex] of [
      ["u_unknown", FIELD_PALETTE.unknown],
      ["u_lit", FIELD_PALETTE.lit],
      ["u_lip", FIELD_PALETTE.lip],
      ["u_crack", FIELD_PALETTE.crack],
      ["u_interior", FIELD_PALETTE.interior],
      ["u_caveAir", FIELD_PALETTE.caveAir],
      ["u_rust", FIELD_PALETTE.rust],
    ] as const)
      gl.uniform3f(u(name), ...hexToVec3(hex));
    gl.uniform1f(u("u_highContrast"), f.highContrast ? 1 : 0);
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(0);
    gl.bindTexture(gl.TEXTURE_2D, null);
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

  /** Harness: draws the debug air mask off screen and reads it back. */
  private airMask() {
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
    this.draw(renderer, true);
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
    if (this.texture) this.renderer?.deleteTexture(this.texture);
    if (this.program) this.gl?.deleteProgram(this.program);
    if (this.buffer) this.gl?.deleteBuffer(this.buffer);
    if (window.__campaignField) delete window.__campaignField;
  }
}

/**
 * The terrain layer the scene draws: main's RetainedTerrain unless the T2
 * spike flag is on (flag.ts), in which case the field renderer, which keeps
 * RetainedTerrain where the field cannot run.
 */
export function createTerrainLayer(scene: Phaser.Scene, field: boolean) {
  return field ? new FieldTerrain(scene) : new RetainedTerrain(scene);
}
