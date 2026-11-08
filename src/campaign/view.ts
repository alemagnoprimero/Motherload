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
/** A raise undone within this many seconds doubles that level's wait. */
const RAISE_PROBATION_SECONDS = 8;
/** A raise that holds this long resets that level's wait. */
const RAISE_RESET_SECONDS = 60;

/** Device classes chosen once at boot (audit §7). Each sets a backing floor. */
export type QualityTier = "high" | "medium" | "low";
const BACKING_FLOOR: Readonly<Record<QualityTier, number>> = {
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

/**
 * `?backing=1|1.5|2` pins the backing scale. `?debug=` takes a comma list:
 * `frametime` shows the readout, and `test-raster` draws T13a's placeholder
 * raster frame in the 60 m scene.
 */
export function renderDebugOptions(search: string) {
  const params = new URLSearchParams(search);
  const pin = Number(params.get("backing"));
  const debug = (params.get("debug") ?? "").split(",");
  return {
    backingPin: (BACKING_LEVELS as readonly number[]).includes(pin)
      ? pin
      : undefined,
    frameTime: debug.includes("frametime"),
    testRaster: debug.includes("test-raster"),
  };
}

/**
 * Visual-harness switches (audit F3): `?overlays=0` starts with every
 * annotation hidden (HUD, chips, labels, markers and UI strokes), for
 * HUD-free frames.
 */
export function harnessOptions(search: string) {
  return { overlays: new URLSearchParams(search).get("overlays") !== "0" };
}

/** RenderScaleBudget's adaptive state, as the debug readout shows it. */
export interface BackingBudgetState {
  pinned: boolean;
  /** The backing scale in use: the pin when pinned. */
  level: number;
  /** The tier's floor and the ceiling; undefined under a pin, which the policy never sees. */
  floor: number | undefined;
  cap: number | undefined;
  /** The next level a recovery would raise to; undefined at the ceiling. */
  next: number | undefined;
  /** Whole seconds of cheap frames counted towards that raise. */
  cheapSeconds: number;
  /** Cheap seconds that raise needs: 10, or more after failed raises. */
  wait: number | undefined;
  /** Scene seconds left in a loading or resize hold. */
  held: number;
  /** Levels whose raises failed, with their doubled waits in seconds. */
  backoff: { level: number; wait: number }[];
  /**
   * The last raise, kept until a step down or its 60 s reset. Its first 8 s
   * are the probation in which a step down doubles that level's wait.
   */
  raised: { to: number; age: number } | undefined;
}

/**
 * The readout's policy line (F3): the budget's next step, a raise still on
 * probation (a step down now doubles that level's wait) and each doubled wait,
 * with the time a holding raise needs to reset it.
 */
export function backoffLine(state: BackingBudgetState) {
  if (state.pinned) return "policy off (pinned)";
  const { raised } = state;
  const probation =
    raised && raised.age < RAISE_PROBATION_SECONDS
      ? ` · probation ${raised.to}× ${Math.floor(raised.age)}/${RAISE_PROBATION_SECONDS} s`
      : "";
  const waits = state.backoff.length
    ? ` · back-off ${state.backoff
        .map(
          (entry) =>
            `${entry.level}× ${entry.wait} s` +
            (raised?.to === entry.level
              ? ` (resets in ${Math.max(0, Math.ceil(RAISE_RESET_SECONDS - raised.age))} s)`
              : ""),
        )
        .join(", ")}`
    : "";
  if (state.held > 0)
    return `held ${state.held.toFixed(1)} s${probation}${waits}`;
  if (state.next === undefined) return `at ceiling${probation}${waits}`;
  return `next ${state.next}× after ${Math.floor(state.cheapSeconds)}/${state.wait} s${probation}${waits}`;
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
 * cheap frames. A raise that the next two windows undo (within 8 s) doubles
 * the wait before the next raise to that level, up to 160 s, so a device that
 * is cheap at one level and expensive at the next does not flip every few
 * seconds; a raise that holds for 60 s resets that level's wait. Loading and
 * resize windows are not measured. Time is the scene clock: frame dt clamped
 * as the scene clamps it, so every window freezes with the test clock and one
 * long frame counts as one short step.
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
  /** Cheap seconds needed before a raise to each level, if not 10. */
  private recoverAfter = new Map<number, number>();
  private raised: { to: number; at: number } | undefined;
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
  /**
   * Loading and resizes are not steady cost: the policy ignores frames for
   * `seconds` of scene time and starts its windows and recovery count again.
   * The readout's p95 still counts them.
   */
  hold(seconds = 1) {
    this.held = Math.max(this.held, seconds);
    this.restart();
  }
  /** p95 frame cost over the last 10 s of scene time, if any frames. */
  p95() {
    return this.recent.length
      ? percentile95(this.recent.map((frame) => frame.milliseconds))
      : undefined;
  }
  /**
   * One frame: its cost in milliseconds (Phaser PRE_STEP to POST_RENDER) and
   * the loop's frame interval in seconds.
   */
  sample(milliseconds: number, frameSeconds: number) {
    // The scene's own clock step (scene.ts update): at most 50 ms per frame.
    const dt = Math.min(0.05, Math.max(0, frameSeconds));
    this.clock += dt;
    this.recent.push({ milliseconds, at: this.clock });
    while (this.recent.length && this.recent[0]!.at <= this.clock - 10)
      this.recent.shift();
    if (this.held > 0) {
      this.held -= dt;
      return false;
    }
    if (this.pin !== undefined) return false;
    if (this.raised && this.clock - this.raised.at >= RAISE_RESET_SECONDS) {
      this.recoverAfter.delete(this.raised.to);
      this.raised = undefined;
    }
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
        if (
          this.raised &&
          this.clock - this.raised.at < RAISE_PROBATION_SECONDS
        )
          this.recoverAfter.set(
            this.raised.to,
            Math.min(160, this.waitFor(this.raised.to) * 2),
          );
        this.raised = undefined;
        this.level = lower;
        this.restart();
        return true;
      }
    }
    if (current >= this.cap) return false;
    const next = BACKING_LEVELS.find((level) => level > current) ?? 2;
    if (this.cheapSeconds < this.waitFor(next)) return false;
    this.level = next;
    this.raised = { to: next, at: this.clock };
    this.restart();
    return true;
  }
  /** A read-only view of the adaptive policy for the debug readout. */
  state(): BackingBudgetState {
    const pinned = this.pin !== undefined;
    const level = this.pin ?? this.current();
    const next =
      pinned || level >= this.cap
        ? undefined
        : BACKING_LEVELS.find((candidate) => candidate > level);
    return {
      pinned,
      level,
      // scale() returns a pin before it sets the cap: under a pin neither
      // value was worked out for this device.
      floor: pinned ? undefined : this.floor(),
      cap: pinned ? undefined : this.cap,
      next,
      cheapSeconds: this.cheapSeconds,
      wait: next === undefined ? undefined : this.waitFor(next),
      held: Math.max(0, this.held),
      backoff: [...this.recoverAfter]
        .sort(([a], [b]) => a - b)
        .map(([level, wait]) => ({ level, wait })),
      raised: this.raised
        ? { to: this.raised.to, age: this.clock - this.raised.at }
        : undefined,
    };
  }
  private waitFor(level: number) {
    return this.recoverAfter.get(level) ?? 10;
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
