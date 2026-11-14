/**
 * T2: the terrain field texture (audit §5.3 T2), built on the CPU from a
 * known-world view only. One RGBA8 texel holds, at 16 texels per tile:
 *
 *   R  F, visual solidity: the cell grid blurred (natural σ 0.34 tile, sharp
 *      σ 0.045 tile), mixed by S. The shader draws the rock edge at F = 0.5.
 *   G  AO: visual solid blurred at σ 0.42 tile (ambient occlusion in air).
 *   B  S, sharpness: twice the σ 0.30 blur of the sharp sources (known hard
 *      rock, bedrock, plate, known dug air, sky), clamped. Natural edges get
 *      the shader's displacement noise in proportion to 1 − S.
 *   A  The texel's own cell: code + 8 × natural + 16 × slot, constant over
 *      the cell, so the shader reads it with a tap snapped to a texel centre.
 *      The slot (0 to 15) names the transition the cell is in (transitions.ts:
 *      the reveal cross-fade or the dig easing); 0 is settled.
 *
 * Unknown cells read as "solid, unknown": every channel depends on known
 * cells and position only, never on hidden geology (F7). The texture wraps
 * horizontally: FIELD_PAD texel columns on each side repeat the far side, so
 * clamped bilinear taps are continuous across x = 0.
 *
 * A world taller than the largest texture is held as a ring of cell rows:
 * virtual row v (world row + FIELD_TOP) lives in texture row v mod R, the
 * window of R rows follows the camera, and one texel row above and below
 * repeats the far end so bilinear taps are continuous across the ring's
 * join. Worlds that fit use no ring and no extra rows.
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
/** Transition slots a cell's A byte can name (1 to 15; 0 is settled). */
export const FIELD_SLOTS = 15;
/**
 * The tallest field texture the game makes whole, in texels: W01 to W03
 * (60 and 100 rows; 2.5 and 4.9 MiB) fit. A deeper world is a ring of rows
 * around the camera, FIELD_RING_HEIGHT texels tall (63 rows), so its
 * texture is at most 5.9 MiB (96 tiles wide) where the whole of W04's 600
 * rows would be 28.6 MiB and taller than most phones' largest texture.
 */
export const FIELD_MAX_HEIGHT = 2048;
export const FIELD_RING_HEIGHT = 1024;

/**
 * Cell rows of the ring a world of `rows` needs when its whole texture
 * would be taller than `maxTexture`; 0 when it fits whole.
 */
export function fieldRingRows(rows: number, maxTexture: number) {
  return (rows + FIELD_TOP + FIELD_BOTTOM) * FIELD_K > maxTexture
    ? Math.floor((Math.min(maxTexture, FIELD_RING_HEIGHT) - 2) / FIELD_K)
    : 0;
}

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
const SPAN = 2 * FIELD_REACH + 1;
const GROUPS_MAX = FIELD_UPLOAD_MAX / FIELD_K;
const COMPUTE = 1;
const UPLOAD = 2;

/**
 * The renderer's whole input (audit F7): per cell, its code (CODE.unknown
 * when undiscovered) and, for known air only, whether the air is natural.
 * Nothing else about the world is visible here.
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
 * kernel[sub * SPAN + o + REACH]: the weight of the cell `o` cells away for
 * a texel at sub-position `sub` of its cell: the Gaussian's integral over
 * that cell, normalised over the reach. Separable, so a blur is two passes.
 */
function kernel(sigma: number) {
  const table = new Float32Array(FIELD_K * SPAN);
  for (let sub = 0; sub < FIELD_K; sub++) {
    const u = (sub + 0.5) / FIELD_K;
    let sum = 0;
    for (let o = -FIELD_REACH; o <= FIELD_REACH; o++) {
      const w = phi((o + 1 - u) / sigma) - phi((o - u) / sigma);
      table[sub * SPAN + o + FIELD_REACH] = w;
      sum += w;
    }
    for (let o = 0; o < SPAN; o++) table[sub * SPAN + o]! /= sum;
  }
  return table;
}
const K_SOFT = kernel(SIGMA.soft),
  K_SHARP = kernel(SIGMA.sharp),
  K_SHARPNESS = kernel(SIGMA.sharpness),
  K_AO = kernel(SIGMA.ao);

export interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The transition slot for the cells that change in one sync(): asked once
 * per kind, and only if a cell of that kind changed. "reveal" is a cell that
 * was unknown; "dig" is a known cell that changed. 0 means no transition.
 */
export type SlotFor = (kind: "reveal" | "dig") => number;

const solidOf = (packed: number) => (packed & 7) !== CODE.air;
/** Sharp sources: known hard rock, bedrock, plate and dug (not natural) air. */
const sharpOf = (packed: number) => {
  const code = packed & 7;
  return (
    code === CODE.rock ||
    code === CODE.bedrock ||
    code === CODE.plate ||
    (packed & 15) === CODE.air
  );
};

/**
 * The CPU copy of the field texture and the patch queue. sync() takes the
 * known-world view each frame and marks what a changed cell touches: its own
 * texels when only its code changed (a reveal of solid ground changes no
 * blur), or every texel within reach when its solidity or sharpness did.
 * nextPatch() computes and hands out at most one rect of at most
 * FIELD_UPLOAD_MAX texels square, nearest the focus first.
 */
export class FieldData {
  readonly width: number;
  readonly rows: number;
  /** Texture size in texels. */
  readonly texWidth: number;
  readonly texHeight: number;
  /** Cell rows the texture holds: every virtual row, or the ring's size. */
  readonly ringRows: number;
  /** True when the world is taller than the texture and rows are a ring. */
  readonly ring: boolean;
  /** Texel rows above and below the rows (1 with a ring, else 0). */
  readonly padY: number;
  readonly pixels: Uint8Array;
  /** Cell codes (CODE.*), natural flags and slots as last synced. */
  private codes: Uint8Array;
  private naturals: Uint8Array;
  private slots: Uint8Array;
  private slotCells: number[][] = [];
  /** The virtual row each texture row holds (−1: none yet). */
  private held: Int32Array;
  private windowStart = 0;
  /** Flags per group of FIELD_K × FIELD_K texels: COMPUTE, UPLOAD. */
  private groupsX: number;
  private flags: Uint8Array;
  /** Ring only: the repeated texel rows (top, bottom) waiting for a copy. */
  private padFlags: Uint8Array;
  private dirtyCount = 0;
  /** Cells changed by the last sync, and how many of them moved the blur. */
  changed = 0;
  changedBlur = 0;
  // Scratch for computeRun: five cell rows of solid and sharp flags, and the
  // horizontal pass of the four blurs for one cell.
  private solidRows: Uint8Array;
  private sharpRows: Uint8Array;
  private packedRow: Uint8Array;
  private h = new Float32Array(4 * SPAN * FIELD_K);
  constructor(width: number, rows: number, maxTexture = Infinity) {
    this.width = width;
    this.rows = rows;
    const virtual = rows + FIELD_TOP + FIELD_BOTTOM,
      ringRows = fieldRingRows(rows, maxTexture);
    this.ring = ringRows > 0;
    this.padY = this.ring ? 1 : 0;
    this.ringRows = this.ring ? ringRows : virtual;
    this.texWidth = width * FIELD_K + 2 * FIELD_PAD;
    this.texHeight = this.ringRows * FIELD_K + 2 * this.padY;
    this.pixels = new Uint8Array(this.texWidth * this.texHeight * 4);
    this.codes = new Uint8Array(width * rows).fill(CODE.unknown);
    this.naturals = new Uint8Array(width * rows);
    this.slots = new Uint8Array(width * rows);
    this.held = new Int32Array(this.ringRows).fill(-1);
    this.groupsX = Math.ceil(this.texWidth / FIELD_K);
    this.flags = new Uint8Array(this.groupsX * this.ringRows);
    this.padFlags = new Uint8Array(this.groupsX * 2);
    const cells = GROUPS_MAX + 1 + 2 * FIELD_REACH;
    this.solidRows = new Uint8Array(SPAN * cells);
    this.sharpRows = new Uint8Array(SPAN * cells);
    this.packedRow = new Uint8Array(cells);
  }

  /** Virtual cell rows: the sky rows, the world, the bedrock row. */
  get virtualRows() {
    return this.rows + FIELD_TOP + FIELD_BOTTOM;
  }

  /** The first virtual row of the window (0 without a ring). */
  get window() {
    return this.windowStart;
  }

  /**
   * Ring only: move the window so it covers the virtual rows from `first`
   * to `last` with as much margin as fits, and mark the rows that enter.
   * It moves only when the range is not covered with `margin` rows to
   * spare, so a still or slow camera marks nothing.
   */
  setWindow(first: number, last: number, margin = 4) {
    if (!this.ring) return;
    const most = this.virtualRows - this.ringRows;
    // No more margin than the ring has room for around the range.
    margin = Math.max(
      0,
      Math.min(
        margin,
        Math.floor((this.ringRows - (last - first + 1)) / 2) - 1,
      ),
    );
    const covered =
      Math.max(0, first - margin) >= this.windowStart &&
      Math.min(this.virtualRows - 1, last + margin) <
        this.windowStart + this.ringRows;
    if (covered && this.held[this.windowStart % this.ringRows] >= 0) return;
    const centred = Math.round((first + last + 1) / 2 - this.ringRows / 2);
    this.windowStart = Math.max(0, Math.min(most, centred));
    this.holdWindow(true);
  }

  private holdWindow(mark: boolean) {
    for (let v = this.windowStart; v < this.windowStart + this.ringRows; v++) {
      const r = v % this.ringRows;
      if (this.held[r] === v) continue;
      this.held[r] = v;
      if (mark) for (let gx = 0; gx < this.groupsX; gx++) this.flag(gx, r, 3);
    }
  }

  /** Read the whole view and build every texel of the window; nothing is left dirty. */
  load(view: KnownWorldView, focusRow = 0) {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        this.codes[i] = view.code(x, y);
        this.naturals[i] = view.natural(x, y) ? 1 : 0;
      }
    this.slots.fill(0);
    this.slotCells = [];
    this.held.fill(-1);
    if (this.ring) {
      const most = this.virtualRows - this.ringRows;
      this.windowStart = Math.max(
        0,
        Math.min(most, Math.round(focusRow + FIELD_TOP - this.ringRows / 2)),
      );
    } else this.windowStart = 0;
    this.holdWindow(false);
    for (let r = 0; r < this.ringRows; r++)
      for (let x = 0; x < this.texWidth; x += FIELD_UPLOAD_MAX)
        this.computeRun(r, x, Math.min(this.texWidth, x + FIELD_UPLOAD_MAX));
    if (this.ring) {
      this.copyPad(0, 0, this.texWidth);
      this.copyPad(1, 0, this.texWidth);
    }
    this.flags.fill(0);
    this.padFlags.fill(0);
    this.dirtyCount = 0;
    this.changed = 0;
    this.changedBlur = 0;
  }

  /**
   * Compare the view with the last sync and mark what changed. Changed cells
   * take the slot `slotFor` gives for their kind.
   */
  sync(view: KnownWorldView, slotFor?: SlotFor) {
    let changed = 0,
      blur = 0,
      reveal = -1,
      dig = -1;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x,
          code = view.code(x, y),
          natural = view.natural(x, y) ? 1 : 0;
        const before = this.codes[i]! + 8 * this.naturals[i]!;
        if (before === code + 8 * natural) continue;
        this.codes[i] = code;
        this.naturals[i] = natural;
        let slot = 0;
        if (slotFor) {
          if ((before & 7) === CODE.unknown) {
            if (reveal < 0) reveal = slotFor("reveal");
            slot = reveal;
          } else {
            if (dig < 0) dig = slotFor("dig");
            slot = dig;
          }
        }
        this.slots[i] = slot;
        if (slot) (this.slotCells[slot] ??= []).push(i);
        const after = code + 8 * natural;
        if (
          solidOf(before) !== solidOf(after) ||
          sharpOf(before) !== sharpOf(after)
        ) {
          this.markReach(x, y);
          blur++;
        } else this.writeCell(x, y);
        changed++;
      }
    this.changed = changed;
    this.changedBlur = blur;
    return changed;
  }

  /** Cells still in `slot`. */
  slotCount(slot: number) {
    return this.slotCells[slot]?.length ?? 0;
  }

  /**
   * End a transition: every cell in `slot` goes back to slot 0 (their A
   * bytes are rewritten, with no blur to recompute) and waits for an upload.
   */
  settle(slot: number) {
    const cells = this.slotCells[slot];
    if (!cells) return;
    this.slotCells[slot] = [];
    for (const i of cells) {
      if (this.slots[i] !== slot) continue;
      this.slots[i] = 0;
      this.writeCell(i % this.width, Math.floor(i / this.width));
    }
  }

  /** Groups and repeated rows waiting for a patch. */
  get pending() {
    return this.dirtyCount;
  }

  private flag(gx: number, r: number, bits: number) {
    const g = r * this.groupsX + gx;
    if (!this.flags[g]) this.dirtyCount++;
    this.flags[g]! |= bits;
  }

  /** The texture row that holds world row y now, or −1. */
  private rowOf(y: number) {
    const v = y + FIELD_TOP;
    if (v < 0 || v >= this.virtualRows) return -1;
    const r = v % this.ringRows;
    return this.held[r] === v ? r : -1;
  }

  /** Flag the groups under texel columns [x0, x1) of texture row r, with their wrapped images. */
  private flagColumns(x0: number, x1: number, r: number, bits: number) {
    const W = this.width * FIELD_K;
    for (const offset of [-W, 0, W]) {
      const left = Math.max(0, x0 + offset),
        right = Math.min(this.texWidth, x1 + offset);
      for (
        let gx = Math.floor(left / FIELD_K);
        gx * FIELD_K < right && left < right;
        gx++
      )
        this.flag(gx, r, bits);
    }
  }

  /** A cell whose solidity or sharpness changed: every texel within reach. */
  private markReach(x: number, y: number) {
    const x0 = (x - FIELD_REACH) * FIELD_K + FIELD_PAD,
      x1 = x0 + SPAN * FIELD_K;
    for (let cy = y - FIELD_REACH; cy <= y + FIELD_REACH; cy++) {
      const r = this.rowOf(cy);
      if (r >= 0) this.flagColumns(x0, x1, r, COMPUTE | UPLOAD);
    }
  }

  /** A cell whose code or slot alone changed: rewrite its A bytes. */
  private writeCell(x: number, y: number) {
    const r = this.rowOf(y);
    if (r < 0) return;
    const value = this.packed(x, y),
      W = this.width * FIELD_K,
      x0 = x * FIELD_K + FIELD_PAD,
      top = this.padY + r * FIELD_K;
    for (const offset of [-W, 0, W]) {
      const left = Math.max(0, x0 + offset),
        right = Math.min(this.texWidth, x0 + FIELD_K + offset);
      if (right <= left) continue;
      for (let row = 0; row < FIELD_K; row++) {
        let p = ((top + row) * this.texWidth + left) * 4 + 3;
        for (let tx = left; tx < right; tx++, p += 4) this.pixels[p] = value;
      }
    }
    this.flagColumns(x0, x0 + FIELD_K, r, UPLOAD);
  }

  /**
   * The next patch: every dirty group when they fit in one
   * FIELD_UPLOAD_MAX square, else the square of groups around the dirty
   * group nearest `focus` (a world position in tiles). Computes the texels
   * that need it and clears the groups. Undefined when nothing is dirty.
   */
  nextPatch(focus?: { x: number; y: number }): FieldRect | undefined {
    if (!this.dirtyCount) return undefined;
    const GX = this.groupsX,
      GY = this.ringRows;
    const focusX = focus
        ? (((focus.x % this.width) + this.width) % this.width) * FIELD_K +
          FIELD_PAD
        : 0,
      focusV = focus ? focus.y + FIELD_TOP : 0;
    let gx0 = Infinity,
      gy0 = Infinity,
      gx1 = -1,
      gy1 = -1,
      nearest = -1,
      best = Infinity;
    for (let gy = 0; gy < GY; gy++)
      for (let gx = 0; gx < GX; gx++) {
        if (!this.flags[gy * GX + gx]) continue;
        gx0 = Math.min(gx0, gx);
        gx1 = Math.max(gx1, gx);
        gy0 = Math.min(gy0, gy);
        gy1 = Math.max(gy1, gy);
        // Without a focus, the first dirty group in scan order.
        const d = focus
          ? Math.hypot(
              (gx + 0.5) * FIELD_K - focusX,
              (this.held[gy]! + 0.5 - focusV) * FIELD_K,
            )
          : nearest < 0
            ? 0
            : Infinity;
        if (d < best) {
          best = d;
          nearest = gy * GX + gx;
        }
      }
    if (nearest < 0) return this.nextPad();
    if (gx1 - gx0 + 1 > GROUPS_MAX || gy1 - gy0 + 1 > GROUPS_MAX) {
      const cx = nearest % GX,
        cy = Math.floor(nearest / GX);
      // The square of groups around the nearest dirty group, inside the
      // dirty bounds, then shrunk to its dirty groups.
      const sx = Math.max(
          gx0,
          Math.min(cx - (GROUPS_MAX >> 1), gx1 - GROUPS_MAX + 1),
        ),
        sy = Math.max(
          gy0,
          Math.min(cy - (GROUPS_MAX >> 1), gy1 - GROUPS_MAX + 1),
        );
      let ax0 = Infinity,
        ay0 = Infinity,
        ax1 = -1,
        ay1 = -1;
      for (let gy = sy; gy < sy + GROUPS_MAX && gy <= gy1; gy++)
        for (let gx = sx; gx < sx + GROUPS_MAX && gx <= gx1; gx++)
          if (this.flags[gy * GX + gx]) {
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
    for (let gy = gy0; gy <= gy1; gy++) {
      // Compute each run of groups that needs it; a group whose A bytes
      // alone changed is already current in `pixels`.
      let run = -1;
      for (let gx = gx0; gx <= gx1 + 1; gx++) {
        const needs = gx <= gx1 && (this.flags[gy * GX + gx]! & COMPUTE) !== 0;
        if (needs && run < 0) run = gx;
        if (!needs && run >= 0) {
          this.computeRun(
            gy,
            run * FIELD_K,
            Math.min(this.texWidth, gx * FIELD_K),
          );
          run = -1;
        }
      }
      for (let gx = gx0; gx <= gx1; gx++) {
        const g = gy * GX + gx;
        if (!this.flags[g]) continue;
        this.flags[g] = 0;
        this.dirtyCount--;
        // The repeated rows follow the first and the last texture row.
        if (this.ring && (gy === 0 || gy === GY - 1)) {
          const p = (gy === 0 ? 1 : 0) * GX + gx;
          if (!this.padFlags[p]) {
            this.padFlags[p] = 1;
            this.dirtyCount++;
          }
        }
      }
    }
    return {
      x: gx0 * FIELD_K,
      y: this.padY + gy0 * FIELD_K,
      width: Math.min(this.texWidth, (gx1 + 1) * FIELD_K) - gx0 * FIELD_K,
      height: (gy1 - gy0 + 1) * FIELD_K,
    };
  }

  /** Ring only: one run of a repeated texel row (top: 0, bottom: 1). */
  private nextPad(): FieldRect | undefined {
    const GX = this.groupsX;
    for (let side = 0; side < 2; side++)
      for (let gx = 0; gx < GX; gx++) {
        if (!this.padFlags[side * GX + gx]) continue;
        let end = gx;
        while (
          end + 1 < GX &&
          end + 1 - gx < GROUPS_MAX &&
          this.padFlags[side * GX + end + 1]
        )
          end++;
        for (let g = gx; g <= end; g++) {
          this.padFlags[side * GX + g] = 0;
          this.dirtyCount--;
        }
        const x0 = gx * FIELD_K,
          x1 = Math.min(this.texWidth, (end + 1) * FIELD_K);
        this.copyPad(side, x0, x1);
        return {
          x: x0,
          y: side === 0 ? 0 : this.texHeight - 1,
          width: x1 - x0,
          height: 1,
        };
      }
    return undefined;
  }

  /** Top row ← the last ring texel row; bottom row ← the first. */
  private copyPad(side: number, x0: number, x1: number) {
    const from = side === 0 ? this.texHeight - 2 : 1,
      to = side === 0 ? 0 : this.texHeight - 1;
    this.pixels.copyWithin(
      (to * this.texWidth + x0) * 4,
      (from * this.texWidth + x0) * 4,
      (from * this.texWidth + x1) * 4,
    );
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

  /** A cell's A byte: code + 8 × natural + 16 × slot (sky is air, below is bedrock). */
  private packed(x: number, y: number) {
    if (y < 0) return CODE.air;
    if (y >= this.rows) return CODE.bedrock;
    const i = y * this.width + (((x % this.width) + this.width) % this.width);
    return this.codes[i]! + 8 * this.naturals[i]! + 16 * this.slots[i]!;
  }

  /**
   * Recompute texel columns [x0, x1) (at most FIELD_UPLOAD_MAX of them) of
   * texture row r into `pixels`. A cell whose 5 × 5 neighbourhood is all
   * solid or all air, and all sharp or all soft, is a constant fill.
   */
  private computeRun(r: number, x0: number, x1: number) {
    const K = FIELD_K,
      cy = this.held[r]! - FIELD_TOP,
      first = Math.floor((x0 - FIELD_PAD) / K),
      last = Math.floor((x1 - 1 - FIELD_PAD) / K),
      cells = last - first + 1 + 2 * FIELD_REACH,
      solid = this.solidRows,
      sharp = this.sharpRows,
      h = this.h,
      pixels = this.pixels;
    for (let j = 0; j < SPAN; j++) {
      const y = cy + j - FIELD_REACH;
      for (let c = 0; c < cells; c++) {
        const v = this.packed(first - FIELD_REACH + c, y);
        solid[j * cells + c] = solidOf(v) ? 1 : 0;
        // The sky above row 0 is a sharp source too.
        sharp[j * cells + c] = y < 0 || sharpOf(v) ? 1 : 0;
        if (j === FIELD_REACH) this.packedRow[c] = v;
      }
    }
    const top = this.padY + r * K;
    for (let cell = first; cell <= last; cell++) {
      const c0 = cell - first,
        left = Math.max(x0, cell * K + FIELD_PAD),
        right = Math.min(x1, (cell + 1) * K + FIELD_PAD),
        a = this.packedRow[c0 + FIELD_REACH]!;
      let solids = 0,
        sharps = 0;
      for (let j = 0; j < SPAN; j++)
        for (let o = 0; o < SPAN; o++) {
          solids += solid[j * cells + c0 + o]!;
          sharps += sharp[j * cells + c0 + o]!;
        }
      const span2 = SPAN * SPAN;
      if (
        (solids === 0 || solids === span2) &&
        (sharps === 0 || sharps === span2)
      ) {
        const f = solids ? 255 : 0,
          s = sharps ? 255 : 0;
        for (let row = 0; row < K; row++) {
          let p = ((top + row) * this.texWidth + left) * 4;
          for (let tx = left; tx < right; tx++, p += 4) {
            pixels[p] = f;
            pixels[p + 1] = f;
            pixels[p + 2] = s;
            pixels[p + 3] = a;
          }
        }
        continue;
      }
      // Horizontal pass: for each of the five cell rows and each texel
      // column of this cell, the four blurs along x.
      const subFirst = left - (cell * K + FIELD_PAD),
        subLast = right - 1 - (cell * K + FIELD_PAD);
      for (let j = 0; j < SPAN; j++) {
        const row = j * cells + c0;
        for (let sub = subFirst; sub <= subLast; sub++) {
          const k = sub * SPAN;
          let soft = 0,
            sh = 0,
            sharpness = 0,
            ao = 0;
          for (let o = 0; o < SPAN; o++) {
            const s = solid[row + o]!;
            soft += s * K_SOFT[k + o]!;
            sh += s * K_SHARP[k + o]!;
            ao += s * K_AO[k + o]!;
            sharpness += sharp[row + o]! * K_SHARPNESS[k + o]!;
          }
          const q = (j * K + sub) * 4;
          h[q] = soft;
          h[q + 1] = sh;
          h[q + 2] = sharpness;
          h[q + 3] = ao;
        }
      }
      // Vertical pass and packing.
      for (let row = 0; row < K; row++) {
        const k = row * SPAN;
        let p = ((top + row) * this.texWidth + left) * 4;
        for (let sub = subFirst; sub <= subLast; sub++, p += 4) {
          let soft = 0,
            sh = 0,
            sharpness = 0,
            ao = 0;
          for (let o = 0; o < SPAN; o++) {
            const q = (o * K + sub) * 4;
            soft += h[q]! * K_SOFT[k + o]!;
            sh += h[q + 1]! * K_SHARP[k + o]!;
            sharpness += h[q + 2]! * K_SHARPNESS[k + o]!;
            ao += h[q + 3]! * K_AO[k + o]!;
          }
          const s = Math.min(1, sharpness * 2),
            f = soft + (sh - soft) * s;
          pixels[p] = Math.round(Math.max(0, Math.min(1, f)) * 255);
          pixels[p + 1] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
          pixels[p + 2] = Math.round(s * 255);
          pixels[p + 3] = a;
        }
      }
    }
  }
}
