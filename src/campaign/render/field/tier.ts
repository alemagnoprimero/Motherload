/**
 * T2 terrain tiers (audit §7; D4 condition 3). Which renderer draws the
 * terrain is chosen by what the device can do and by measured frames, never
 * by pointer type:
 *
 *   field     WebGL with fragment highp: the field shader (the High tier).
 *   retained  main's RetainedTerrain: the Canvas renderer (the Low tier);
 *             WebGL without fragment highp (the Medium tier); a software
 *             rasteriser; and a device whose measured frame interval does
 *             not hold with the field.
 *
 * Without fragment highp the Medium tier is the Canvas path, not a reduced
 * shader, by measurement: GLSL ES guarantees a mediump float only 10 bits
 * of mantissa, and the field's coordinate chain (device pixel, world tile,
 * field texel) then steps by several device pixels (mediumpStep below; the
 * unit test holds it against the 2-pixel floor-contact limit), and the
 * shader's hashes need more bits than that as well. A mediump shader would
 * need per-tile geometry and baked material pages (the audit's T2-fallback).
 *
 * A software rasteriser (SwiftShader, llvmpipe: WebGL with no GPU, which is
 * also what CI runs) starts on RetainedTerrain as well, by measurement: at
 * 2880 × 1800 SwiftShader presents a field frame every 1.65 s against 0.38 s
 * with RetainedTerrain (docs/qa/t2/README.md), mostly the ten bilinear taps
 * per pixel, so the measured step below would take it there within seconds
 * anyway. `?field=1` still pins the field there, which is how the checks
 * that are about the field run it in CI.
 *
 * The measured step reads the frame interval, the time between presented
 * frames, which is where a GPU-bound frame shows (F1's cost is CPU time
 * from pre-step to post-render and cannot see it). It counts windows of 3 s
 * of scene time whose interval p95 is above 25 ms: more than one frame in
 * twenty took two 60 Hz refreshes or longer. The 60 Hz readout sits at 18 to
 * 20 ms with main's renderer too, so 16.7 ms is the refresh period, not a
 * target. Resolution goes first: while the backing scale can still go down
 * the policy waits four windows for F1 to lower it, and at the floor (or
 * under a pin) it waits two. It then steps down to `retained` for the rest
 * of the session; nothing here raises it again. A pinned request
 * (`?field=1`) never steps.
 */
export type TerrainTier = "field" | "retained";

export const TIER_WINDOW_SECONDS = 3;
export const TIER_INTERVAL_LIMIT_MS = 25;
export const TIER_WINDOWS_AT_FLOOR = 2;
export const TIER_WINDOWS_ABOVE_FLOOR = 4;

/** True for the WebGL renderer strings of rasterisers that run on the CPU. */
export function softwareRasteriser(rendererName: string) {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(
    rendererName,
  );
}

/**
 * The tier a device starts in, and why when it is not the field.
 * `rendererName` is WebGL's unmasked renderer string, when the browser
 * gives one; a pinned field (`?field=1`) passes none.
 */
export function bootTier(
  renderer: "webgl" | "canvas",
  fragmentHighp: boolean,
  rendererName = "",
): { tier: TerrainTier; reason?: string } {
  if (renderer === "canvas")
    return { tier: "retained", reason: "Canvas renderer" };
  if (!fragmentHighp) return { tier: "retained", reason: "no fragment highp" };
  if (softwareRasteriser(rendererName))
    return { tier: "retained", reason: "software rasteriser" };
  return { tier: "field" };
}

/**
 * The spacing of representable values near `value` in a float with
 * `mantissaBits` of mantissa: 10 for the mediump GLSL ES guarantees, 23 for
 * highp on every GPU that reports it.
 */
export function floatStep(value: number, mantissaBits: number) {
  if (value === 0) return 0;
  return 2 ** (Math.floor(Math.log2(Math.abs(value))) - mantissaBits);
}

/**
 * The worst rounding of the field's coordinate chain in device pixels, for a
 * frame `devicePixels` across over a world `worldTiles` wide drawn at
 * `tileDevicePixels` per tile: gl_FragCoord itself, the world position in
 * tiles and the field coordinate in texels each round to the float's step.
 */
export function coordinateStepPixels(
  mantissaBits: number,
  devicePixels: number,
  worldTiles: number,
  tileDevicePixels: number,
  texelsPerTile = 16,
) {
  const fragCoord = floatStep(devicePixels, mantissaBits);
  const world = floatStep(worldTiles, mantissaBits) * tileDevicePixels;
  const texel =
    (floatStep(worldTiles * texelsPerTile, mantissaBits) / texelsPerTile) *
    tileDevicePixels;
  return Math.max(fragCoord, world, texel);
}

function percentile95(values: readonly number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return (
    ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))] ??
    0
  );
}

export interface TierSample {
  /** Time since the previous presented frame, in milliseconds. */
  interval: number;
  /** CPU cost of the frame (F1's sample), in milliseconds. */
  cost: number;
  /** The loop's frame delta in seconds (the scene clamps it to 0.05). */
  frameSeconds: number;
  /** A loading or resize hold: not steady frames. */
  held: boolean;
  /** The backing scale in use and the lowest the policy may set (pin: equal). */
  backing: number;
  backingFloor: number;
}

/** Steps the terrain from `field` to `retained` on measured frame intervals. */
export class TerrainTierPolicy {
  tier: TerrainTier = "field";
  /** Why the policy stepped down, for the readout. */
  reason: string | undefined;
  private window: number[] = [];
  private seconds = 0;
  private strikes = 0;
  private backing = 0;
  /** The last finished window's interval p95, for the readout. */
  lastP95: number | undefined;

  /** One presented frame. Returns true when this frame steps the tier down. */
  sample(frame: TierSample) {
    if (this.tier !== "field") return false;
    // A frame whose cost reads exactly 0 ran on a clock that was not moving
    // (the test clock): its interval is the test's step, not a measurement.
    // A hidden tab or a breakpoint gives intervals of seconds: skipped too.
    if (frame.held || frame.cost <= 0 || frame.interval > 1000) {
      if (frame.held) this.restart();
      return false;
    }
    if (frame.backing !== this.backing) {
      // The resolution moved: measure the new level from the start.
      this.backing = frame.backing;
      this.strikes = 0;
      this.restart();
    }
    this.window.push(frame.interval);
    this.seconds += Math.min(0.05, Math.max(0, frame.frameSeconds));
    if (this.seconds < TIER_WINDOW_SECONDS) return false;
    const p95 = percentile95(this.window);
    this.lastP95 = p95;
    this.restart();
    if (p95 <= TIER_INTERVAL_LIMIT_MS) {
      this.strikes = 0;
      return false;
    }
    this.strikes++;
    const needed =
      frame.backing <= frame.backingFloor
        ? TIER_WINDOWS_AT_FLOOR
        : TIER_WINDOWS_ABOVE_FLOOR;
    if (this.strikes < needed) return false;
    this.tier = "retained";
    this.reason = `measured: interval p95 ${p95.toFixed(1)} ms at backing ${frame.backing}`;
    return true;
  }

  private restart() {
    this.window = [];
    this.seconds = 0;
  }
}
