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

/** Lower resolution only after a sustained expensive render window, never on a single hitch. */
export class RenderScaleBudget {
  private samples: number[] = [];
  private elapsed = 0;
  private ceiling = 2;
  scale(deviceDpr: number, requested = 2) {
    return Math.max(1, Math.min(deviceDpr, requested, this.ceiling));
  }
  sample(milliseconds: number, dt: number) {
    this.samples.push(milliseconds);
    this.elapsed += dt;
    if (this.elapsed < 3) return false;
    const ordered = this.samples.sort((a, b) => a - b);
    const p95 =
      ordered[
        Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))
      ] ?? 0;
    this.samples = [];
    this.elapsed = 0;
    if (p95 <= 18 || this.ceiling <= 1) return false;
    this.ceiling = this.ceiling > 1.5 ? 1.5 : 1;
    return true;
  }
}
