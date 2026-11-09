/**
 * T2 spike: the terrain field texture (audit §5.3 T2), built on the CPU from
 * a known-world view only. One RGBA8 texel holds, at 16 texels per tile:
 *
 *   R  F, visual solidity: the cell grid blurred (natural σ 0.30 tile, sharp
 *      σ 0.045 tile), mixed by S. The shader draws the rock edge at F = 0.5.
 *   G  AO: visual solid blurred at σ 0.42 tile (ambient occlusion in air).
 *   B  S, sharpness: twice the σ 0.30 blur of the sharp sources (known hard
 *      rock, bedrock, plate, known dug air, sky), clamped. Natural edges get
 *      the shader's displacement noise in proportion to 1 − S.
 *   A  The texel's own cell, as code + 8 × natural: constant over the cell,
 *      so the shader reads it with a tap snapped to a texel centre.
 *
 * Unknown cells read as "solid, unknown": every channel depends on known
 * cells and position only, never on hidden geology (F7). The texture wraps
 * horizontally: FIELD_PAD texel columns on each side repeat the far side, so
 * clamped bilinear taps are continuous across x = 0.
 */

/** Texels per tile. */
export const FIELD_K = 16;
/** Wrapped texel columns on each side. */
export const FIELD_PAD = 4;
/** Sky tiles above row 0 held in the texture (air, sharp). */
export const FIELD_TOP = 2;
/** Bedrock tiles below the last row (known, solid, sharp). */
export const FIELD_BOTTOM = 1;
/** Cells whose texels one cell's change can reach (3σ of the widest blur). */
export const FIELD_REACH = 2;
/** At most one upload of this many texels square per frame (§7). */
export const FIELD_UPLOAD_MAX = 160;

/** Cell codes in the A channel. Unknown is the only code a hidden cell gets. */
export const CODE = {
  air: 0,
  soil: 1,
  rock: 2,
  bedrock: 3,
  plate: 4,
  unknown: 5,
} as const;

const SIGMA = { soft: 0.34, sharp: 0.045, sharpness: 0.3, ao: 0.42 };

/**
 * The renderer's whole input (audit F7, minimal form for the spike): per
 * cell, its code (CODE.unknown when undiscovered) and, for known air only,
 * whether the air is natural. Nothing else about the world is visible here.
 */
export interface KnownWorldView {
  readonly id: string;
  readonly width: number;
  readonly rows: number;
  /** Canonical x in [0, width), y in [0, rows). */
  code(x: number, y: number): number;
  /** Known air only; false for every other cell. */
  natural(x: number, y: number): boolean;
}

/** Map a tile type to its code, for known cells. */
export function tileCode(type: number) {
  return type === 0
    ? CODE.air
    : type === 2
      ? CODE.rock
      : type === 3
        ? CODE.bedrock
        : type === 4
          ? CODE.plate
          : CODE.soil;
}

function erf(x: number) {
  // Abramowitz and Stegun 7.1.26: |error| < 1.5e-7.
  const sign = x < 0 ? -1 : 1,
    a = Math.abs(x),
    t = 1 / (1 + 0.3275911 * a),
    y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-a * a);
  return sign * y;
}
const phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/**
 * kernel[sub][o + REACH]: the weight of the cell `o` cells away for a texel
 * at sub-position `sub` of its cell: the Gaussian's integral over that cell,
 * normalised over the reach. Separable, so a blur is two passes of these.
 */
function kernel(sigma: number) {
  const span = 2 * FIELD_REACH + 1;
  const table = new Float32Array(FIELD_K * span);
  for (let sub = 0; sub < FIELD_K; sub++) {
    const u = (sub + 0.5) / FIELD_K;
    let sum = 0;
    for (let o = -FIELD_REACH; o <= FIELD_REACH; o++) {
      const w = phi((o + 1 - u) / sigma) - phi((o - u) / sigma);
      table[sub * span + o + FIELD_REACH] = w;
      sum += w;
    }
    for (let o = 0; o < span; o++) table[sub * span + o]! /= sum;
  }
  return table;
}
const KERNELS = {
  soft: kernel(SIGMA.soft),
  sharp: kernel(SIGMA.sharp),
  sharpness: kernel(SIGMA.sharpness),
  ao: kernel(SIGMA.ao),
};

export interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The CPU copy of the field texture and the patch queue. sync() takes the
 * known-world view each frame, marks the texels a changed cell reaches, and
 * nextPatch() computes and hands out at most one rect of at most
 * FIELD_UPLOAD_MAX texels square, nearest the focus first.
 */
export class FieldData {
  readonly width: number;
  readonly rows: number;
  /** Texture size in texels. */
  readonly texWidth: number;
  readonly texHeight: number;
  readonly pixels: Uint8Array;
  /** Cell codes (CODE.*) and natural flags as last synced. */
  private codes: Uint8Array;
  private naturals: Uint8Array;
  /** Dirty groups of FIELD_K × FIELD_K texels in texture space. */
  private groupsX: number;
  private groupsY: number;
  private dirty: Uint8Array;
  private dirtyCount = 0;
  /** Cells changed by the last sync. */
  changed = 0;
  constructor(width: number, rows: number) {
    this.width = width;
    this.rows = rows;
    this.texWidth = width * FIELD_K + 2 * FIELD_PAD;
    this.texHeight = (rows + FIELD_TOP + FIELD_BOTTOM) * FIELD_K;
    this.pixels = new Uint8Array(this.texWidth * this.texHeight * 4);
    this.codes = new Uint8Array(width * rows).fill(CODE.unknown);
    this.naturals = new Uint8Array(width * rows);
    this.groupsX = Math.ceil(this.texWidth / FIELD_K);
    this.groupsY = Math.ceil(this.texHeight / FIELD_K);
    this.dirty = new Uint8Array(this.groupsX * this.groupsY);
  }

  /** Read the whole view; returns true when nothing was known before (full build). */
  load(view: KnownWorldView) {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        this.codes[i] = view.code(x, y);
        this.naturals[i] = view.natural(x, y) ? 1 : 0;
      }
    this.compute({ x: 0, y: 0, width: this.texWidth, height: this.texHeight });
    this.dirty.fill(0);
    this.dirtyCount = 0;
  }

  /** Compare the view with the last sync and mark what changed. */
  sync(view: KnownWorldView) {
    let changed = 0;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x,
          code = view.code(x, y),
          natural = view.natural(x, y) ? 1 : 0;
        if (this.codes[i] === code && this.naturals[i] === natural) continue;
        this.codes[i] = code;
        this.naturals[i] = natural;
        this.markCell(x, y);
        changed++;
      }
    this.changed = changed;
    return changed;
  }

  get pending() {
    return this.dirtyCount;
  }

  private markCell(x: number, y: number) {
    const span = FIELD_K * (2 * FIELD_REACH + 1),
      x0 = (x - FIELD_REACH) * FIELD_K + FIELD_PAD,
      y0 = (y + FIELD_TOP - FIELD_REACH) * FIELD_K;
    // The canonical rect and its wrapped images inside the padded texture.
    for (const offset of [-this.width * FIELD_K, 0, this.width * FIELD_K]) {
      const left = Math.max(0, x0 + offset),
        right = Math.min(this.texWidth, x0 + offset + span);
      if (right <= left) continue;
      const top = Math.max(0, y0),
        bottom = Math.min(this.texHeight, y0 + span);
      for (let gy = Math.floor(top / FIELD_K); gy * FIELD_K < bottom; gy++)
        for (let gx = Math.floor(left / FIELD_K); gx * FIELD_K < right; gx++) {
          const g = gy * this.groupsX + gx;
          if (!this.dirty[g]) {
            this.dirty[g] = 1;
            this.dirtyCount++;
          }
        }
    }
  }

  /**
   * The next patch: every dirty group when they fit in one
   * FIELD_UPLOAD_MAX square, else the square of groups around the dirty
   * group nearest `focus` (texture texels). Computes its texels and clears
   * its groups. Undefined when nothing is dirty.
   */
  nextPatch(focus?: { x: number; y: number }): FieldRect | undefined {
    if (!this.dirtyCount) return undefined;
    let gx0 = Infinity,
      gy0 = Infinity,
      gx1 = -1,
      gy1 = -1,
      nearest = -1,
      best = Infinity;
    for (let gy = 0; gy < this.groupsY; gy++)
      for (let gx = 0; gx < this.groupsX; gx++) {
        if (!this.dirty[gy * this.groupsX + gx]) continue;
        gx0 = Math.min(gx0, gx);
        gx1 = Math.max(gx1, gx);
        gy0 = Math.min(gy0, gy);
        gy1 = Math.max(gy1, gy);
        // Without a focus, the first dirty group in scan order.
        const d = focus
          ? Math.hypot(
              (gx + 0.5) * FIELD_K - focus.x,
              (gy + 0.5) * FIELD_K - focus.y,
            )
          : nearest < 0
            ? 0
            : Infinity;
        if (d < best) {
          best = d;
          nearest = gy * this.groupsX + gx;
        }
      }
    const most = FIELD_UPLOAD_MAX / FIELD_K;
    if (gx1 - gx0 + 1 > most || gy1 - gy0 + 1 > most) {
      const start = nearest;
      const cx = start % this.groupsX,
        cy = Math.floor(start / this.groupsX);
      // The square of groups around the nearest dirty group, inside the
      // dirty bounds, then shrunk to its dirty groups.
      const sx = Math.max(gx0, Math.min(cx - (most >> 1), gx1 - most + 1)),
        sy = Math.max(gy0, Math.min(cy - (most >> 1), gy1 - most + 1));
      let ax0 = Infinity,
        ay0 = Infinity,
        ax1 = -1,
        ay1 = -1;
      for (let gy = sy; gy < sy + most && gy <= gy1; gy++)
        for (let gx = sx; gx < sx + most && gx <= gx1; gx++)
          if (this.dirty[gy * this.groupsX + gx]) {
            ax0 = Math.min(ax0, gx);
            ax1 = Math.max(ax1, gx);
            ay0 = Math.min(ay0, gy);
            ay1 = Math.max(ay1, gy);
          }
      gx0 = ax0;
      gx1 = ax1;
      gy0 = ay0;
      gy1 = ay1;
    }
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const g = gy * this.groupsX + gx;
        if (this.dirty[g]) {
          this.dirty[g] = 0;
          this.dirtyCount--;
        }
      }
    const rect = {
      x: gx0 * FIELD_K,
      y: gy0 * FIELD_K,
      width: Math.min(this.texWidth, (gx1 + 1) * FIELD_K) - gx0 * FIELD_K,
      height: Math.min(this.texHeight, (gy1 + 1) * FIELD_K) - gy0 * FIELD_K,
    };
    this.compute(rect);
    return rect;
  }

  /** The texels of `rect` (texture space), copied out row by row. */
  extract(rect: FieldRect, out?: Uint8Array) {
    const bytes = rect.width * rect.height * 4;
    const target =
      out && out.length >= bytes
        ? out.subarray(0, bytes)
        : new Uint8Array(bytes);
    for (let row = 0; row < rect.height; row++) {
      const from = ((rect.y + row) * this.texWidth + rect.x) * 4;
      target.set(
        this.pixels.subarray(from, from + rect.width * 4),
        row * rect.width * 4,
      );
    }
    return target;
  }

  /** A cell's A-channel value: code + 8 × natural (sky is air, below is bedrock). */
  private packed(x: number, y: number) {
    if (y < 0) return CODE.air;
    if (y >= this.rows) return CODE.bedrock;
    const i = y * this.width + (((x % this.width) + this.width) % this.width);
    return this.codes[i]! + 8 * this.naturals[i]!;
  }

  /** Recompute the texels of `rect` (texture space) into `pixels`. */
  private compute(rect: FieldRect) {
    const span = 2 * FIELD_REACH + 1,
      K = FIELD_K,
      W = this.width * K;
    // Each texel column's canonical cell and sub-position.
    const columnCell = new Int32Array(rect.width),
      columnSub = new Int32Array(rect.width);
    for (let i = 0; i < rect.width; i++) {
      const canonical = (((rect.x + i - FIELD_PAD) % W) + W) % W;
      columnCell[i] = Math.floor(canonical / K);
      columnSub[i] = canonical % K;
    }
    const rowFirst = Math.floor(rect.y / K) - FIELD_TOP - FIELD_REACH,
      rowLast =
        Math.floor((rect.y + rect.height - 1) / K) - FIELD_TOP + FIELD_REACH,
      cellRows = rowLast - rowFirst + 1;
    // Horizontal pass: per cell row and texel column, for the four blurs.
    const hSoft = new Float32Array(cellRows * rect.width),
      hSharp = new Float32Array(cellRows * rect.width),
      hSharpness = new Float32Array(cellRows * rect.width),
      hAo = new Float32Array(cellRows * rect.width);
    const solid = new Uint8Array(this.width + 2 * FIELD_REACH),
      sharp = new Uint8Array(this.width + 2 * FIELD_REACH);
    for (let r = 0; r < cellRows; r++) {
      const y = rowFirst + r;
      for (let x = -FIELD_REACH; x < this.width + FIELD_REACH; x++) {
        const v = this.packed(x, y),
          code = v & 7;
        solid[x + FIELD_REACH] = code === CODE.air ? 0 : 1;
        // Sharp sources: known hard rock, bedrock, plate, dug air and sky.
        sharp[x + FIELD_REACH] =
          y < 0 ||
          code === CODE.rock ||
          code === CODE.bedrock ||
          code === CODE.plate ||
          v === CODE.air
            ? 1
            : 0;
      }
      for (let i = 0; i < rect.width; i++) {
        const base = columnSub[i]! * span,
          cx = columnCell[i]!;
        let soft = 0,
          sh = 0,
          sharpness = 0,
          ao = 0;
        for (let o = 0; o < span; o++) {
          const s = solid[cx + o]!,
            k = sharp[cx + o]!;
          soft += s * KERNELS.soft[base + o]!;
          sh += s * KERNELS.sharp[base + o]!;
          sharpness += k * KERNELS.sharpness[base + o]!;
          ao += s * KERNELS.ao[base + o]!;
        }
        const j = r * rect.width + i;
        hSoft[j] = soft;
        hSharp[j] = sh;
        hSharpness[j] = sharpness;
        hAo[j] = ao;
      }
    }
    // Vertical pass and packing.
    for (let row = 0; row < rect.height; row++) {
      const ty = rect.y + row,
        cy = Math.floor(ty / K) - FIELD_TOP,
        base = (ty % K) * span,
        r0 = cy - FIELD_REACH - rowFirst;
      for (let i = 0; i < rect.width; i++) {
        let soft = 0,
          sh = 0,
          sharpness = 0,
          ao = 0;
        for (let o = 0; o < span; o++) {
          const j = (r0 + o) * rect.width + i;
          soft += hSoft[j]! * KERNELS.soft[base + o]!;
          sh += hSharp[j]! * KERNELS.sharp[base + o]!;
          sharpness += hSharpness[j]! * KERNELS.sharpness[base + o]!;
          ao += hAo[j]! * KERNELS.ao[base + o]!;
        }
        const s = Math.min(1, sharpness * 2),
          f = soft + (sh - soft) * s,
          p = (ty * this.texWidth + rect.x + i) * 4;
        this.pixels[p] = Math.round(Math.max(0, Math.min(1, f)) * 255);
        this.pixels[p + 1] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
        this.pixels[p + 2] = Math.round(s * 255);
        this.pixels[p + 3] = this.packed(columnCell[i]!, cy);
      }
    }
  }
}
