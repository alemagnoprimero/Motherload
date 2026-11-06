/** The only world/CSS/device coordinate conversion used by rendering and HUD. */
export interface ViewPoint {
  x: number;
  y: number;
}
export interface CameraSafeArea {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

/** Ease surface composition into shaft tracking without a hard depth boundary. */
export function surfaceFraming(y: number) {
  const depth = Math.max(0, Math.min(1, y / 4));
  return 1 - depth * depth * (3 - 2 * depth);
}

/** Place the surface and ascent inside the usable view, away from HUD bands. */
export function campaignCameraY(
  y: number,
  velocityY: number,
  tile: number,
  height: number,
  safe: CameraSafeArea,
  reducedMotion: boolean,
) {
  const usable = Math.max(100, height - safe.top - safe.bottom);
  // Short landscape needs room for the three-tile lander below the top HUD.
  // The surface itself still sits above the lower action row.
  const surface = -(safe.top + usable * (height <= 420 ? 0.82 : 0.62));
  // Velocity makes the look-ahead grow with actual ascent rather than jumping
  // by fourteen percent of the viewport when the thrust key changes state.
  const ascent = reducedMotion ? 0 : Math.max(0, Math.min(1, -velocityY / 3));
  const rigAnchor = safe.top + usable * (0.43 + ascent * 0.14);
  const lead = reducedMotion
    ? 0
    : Math.max(-tile, Math.min(tile, velocityY * tile * 0.08));
  const tracking = y * tile - rigAnchor + lead;
  const blend = surfaceFraming(y);
  return tracking + (surface - tracking) * blend;
}

export class CampaignView {
  width = 1;
  height = 1;
  dpr = 1;
  tile = 48;
  scrollX = 0;
  scrollY = 0;
  safe: CameraSafeArea = { top: 0, bottom: 0 };
  revision = 0;
  configure(
    width: number,
    height: number,
    dpr: number,
    tile: number,
    safe: CameraSafeArea,
  ) {
    const signature = JSON.stringify([width, height, dpr, tile, safe]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(1, Math.min(2, dpr));
    this.tile = tile;
    this.safe = safe;
    return this;
  }
  private signature = "";
  scroll(x: number, y: number) {
    this.scrollX = this.snap(x);
    this.scrollY = this.snap(y);
    return this;
  }
  snap(value: number) {
    return Math.round(value * this.dpr) / this.dpr;
  }
  worldToScreen(x: number, y: number): ViewPoint {
    return { x: x * this.tile - this.scrollX, y: y * this.tile - this.scrollY };
  }
  /** Choose the same wrapped copy as the viewport, including repeated laps. */
  nearestWorldX(x: number, worldWidth: number) {
    const center = (this.scrollX + this.width / 2) / this.tile;
    return x + Math.round((center - x) / worldWidth) * worldWidth;
  }
  screenToWorld(x: number, y: number): ViewPoint {
    return {
      x: (x + this.scrollX) / this.tile,
      y: (y + this.scrollY) / this.tile,
    };
  }
  clientToScreen(
    x: number,
    y: number,
    bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
  ): ViewPoint {
    return {
      x: ((x - bounds.left) * this.width) / Math.max(1, bounds.width),
      y: ((y - bounds.top) * this.height) / Math.max(1, bounds.height),
    };
  }
  clamp(point: ViewPoint, padding = 22): ViewPoint {
    return {
      x: Math.max(
        (this.safe.left ?? 0) + padding,
        Math.min(this.width - (this.safe.right ?? 0) - padding, point.x),
      ),
      y: Math.max(
        this.safe.top + padding,
        Math.min(this.height - this.safe.bottom - padding, point.y),
      ),
    };
  }
  snapshot() {
    return {
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      tile: this.tile,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      safe: this.safe,
      revision: this.revision,
    };
  }
}

/** The backing scales the Render quality setting offers and the budget steps between. */
export const BACKING_LEVELS = [1, 1.5, 2] as const;

/** Device classes chosen once at boot (audit §7). Each sets a backing floor. */
export type QualityTier = "high" | "medium" | "low";
export const BACKING_FLOOR: Record<QualityTier, number> = {
  high: 2,
  medium: 1.5,
  low: 1,
};

/**
 * High: WebGL with fragment highp on a fine-pointer (desktop) device. Medium:
 * WebGL on a coarse-pointer device, or without fragment highp. No boot-time
 * signal tells a recent phone from a mid-range one, so phones start at Medium;
 * recovery still raises them to 2.0 when their frames allow. Low: Canvas.
 */
export function qualityTier(
  renderer: "webgl" | "canvas",
  fragmentHighp: boolean,
  coarsePointer: boolean,
): QualityTier {
  if (renderer === "canvas") return "low";
  return fragmentHighp && !coarsePointer ? "high" : "medium";
}

/** `?backing=1|1.5|2` pins the backing scale; `?debug=frametime` shows the readout. */
export function renderDebugOptions(search: string) {
  const params = new URLSearchParams(search);
  const pin = Number(params.get("backing"));
  return {
    backingPin: (BACKING_LEVELS as readonly number[]).includes(pin)
      ? pin
      : undefined,
    frameTime: (params.get("debug") ?? "").split(",").includes("frametime"),
  };
}

function percentile95(values: readonly number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return (
    ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))] ??
    0
  );
}

/**
 * Lower resolution only after a sustained expensive render window, never on a
 * single hitch, and never below the tier's floor. Raise it again after 10 s of
 * cheap frames. Loading and resize windows are not measured. All windows are
 * scene time: `dt` comes from the game loop, so they freeze with the test clock.
 */
export class RenderScaleBudget {
  tier: QualityTier = "high";
  /** Debug pin: one of BACKING_LEVELS, or undefined for the adaptive policy. */
  pin: number | undefined;
  private level = 2;
  private cap = 2;
  private window: number[] = [];
  private windowSeconds = 0;
  private slice: number[] = [];
  private sliceSeconds = 0;
  private cheapSeconds = 0;
  private recent: { milliseconds: number; at: number }[] = [];
  private clock = 0;
  private held = 0;
  setTier(tier: QualityTier) {
    this.tier = tier;
    this.level = Math.max(this.level, BACKING_FLOOR[tier]);
  }
  /** The tier's floor, limited by what this device and setting allow. */
  floor() {
    return Math.min(BACKING_FLOOR[this.tier], this.cap);
  }
  scale(deviceDpr: number, requested = 2) {
    if (this.pin !== undefined) return this.pin;
    this.cap = Math.max(1, Math.min(deviceDpr, requested, 2));
    return this.current();
  }
  /** Ignore frames for `seconds` of scene time: loading and resizes are not steady cost. */
  hold(seconds = 1) {
    this.held = Math.max(this.held, seconds);
    this.restart();
  }
  /** p95 frame time over the last `seconds` of measured frames, if any. */
  p95(seconds = 10) {
    const since = this.clock - seconds;
    const frames = this.recent
      .filter((frame) => frame.at > since)
      .map((frame) => frame.milliseconds);
    return frames.length ? percentile95(frames) : undefined;
  }
  sample(milliseconds: number, dt: number) {
    this.clock += dt;
    if (this.held > 0) {
      this.held -= dt;
      return false;
    }
    this.recent.push({ milliseconds, at: this.clock });
    while (this.recent.length && this.recent[0]!.at <= this.clock - 10)
      this.recent.shift();
    if (this.pin !== undefined) return false;
    const current = this.current();
    this.window.push(milliseconds);
    this.windowSeconds += dt;
    // Recovery counts whole seconds of cheap frames, so a slow stretch is not
    // outweighed by the many fast frames that follow it.
    this.slice.push(milliseconds);
    this.sliceSeconds += dt;
    if (this.sliceSeconds >= 1) {
      this.cheapSeconds =
        percentile95(this.slice) < 12
          ? this.cheapSeconds + this.sliceSeconds
          : 0;
      this.slice = [];
      this.sliceSeconds = 0;
    }
    if (this.windowSeconds >= 3) {
      const p95 = percentile95(this.window);
      this.window = [];
      this.windowSeconds = 0;
      if (p95 > 18) {
        const lower = Math.max(
          this.floor(),
          [...BACKING_LEVELS].reverse().find((level) => level < current) ?? 1,
        );
        if (lower >= current) return false;
        this.level = lower;
        this.restart();
        return true;
      }
    }
    if (this.cheapSeconds < 10 || current >= this.cap) return false;
    this.level = BACKING_LEVELS.find((level) => level > current) ?? 2;
    this.restart();
    return true;
  }
  private restart() {
    this.window = [];
    this.windowSeconds = 0;
    this.slice = [];
    this.sliceSeconds = 0;
    this.cheapSeconds = 0;
  }
  private current() {
    return Math.max(this.floor(), Math.min(this.cap, this.level));
  }
}
