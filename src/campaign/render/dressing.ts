import type { KnownCaveView } from "./cave-known";

/** A7's generated runtime catalog; the SVG generator never enters the game. */
export interface DressingCatalog {
  readonly frames: readonly DressingFrame[];
}

export interface DressingFrame {
  readonly name: string;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly anchor: string;
  readonly family: string;
  /** Contact baseline in the @2x SVG's 96-pixel cell coordinates. */
  readonly baseline?: number;
}

export interface DressingViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DressingOptions {
  quality?: "high" | "medium" | "low";
  canvas?: boolean;
  highContrast?: boolean;
  /** At least two backing pixels, expressed in world tiles by the caller. */
  gutter: number;
}

export interface DressingPlacement {
  id: string;
  frame: string;
  family: string;
  /** Source rectangle centre and dimensions in world tiles (before trimming). */
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  depth: number;
  face: "ceiling" | "floor" | "left" | "right";
  cellX: number;
  cellY: number;
  /** Selection order is seeded world position, never camera distance. */
  priority: number;
  rank: number;
}

export interface DressingPlan {
  placements: DressingPlacement[];
  limit: number;
  gutter: number;
  exposedCeilings: number;
  decoratedCeilings: number;
}

export const DRESSING_FADE_SECONDS = 0.3;
const AIR = 0;
const ROOT_BURIAL = 0.28;
const wrap = (x: number, width: number) => ((x % width) + width) % width;

/** Stateless hash: changing a distant cell or viewport cannot move a prop. */
export function dressingHash(seed: number, x: number, y: number, salt: number) {
  let hash = (seed ^ Math.imul(x, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ Math.imul(y, 0x85ebca6b) ^ salt, 0xc2b2ae35);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 0x100000000;
}

export function dressingLimit(
  options: Pick<DressingOptions, "quality" | "canvas">,
) {
  if (options.canvas || options.quality === "low") return 20;
  return options.quality === "medium" ? 30 : 40;
}

function solid(view: KnownCaveView, x: number, y: number) {
  return view.known(x, y) && view.code(x, y) !== AIR;
}

function natural(view: KnownCaveView, x: number, y: number) {
  return view.known(x, y) && view.code(x, y) === AIR && view.natural(x, y);
}

function bounds(placement: DressingPlacement, gutter = 0) {
  return {
    left: Math.floor(placement.x - placement.width / 2 - gutter),
    right: Math.ceil(placement.x + placement.width / 2 + gutter) - 1,
    top: Math.floor(placement.y - placement.height / 2 - gutter),
    bottom: Math.ceil(placement.y + placement.height / 2 + gutter) - 1,
  };
}

/** Includes transparent source padding and the bilinear filter margin. */
export function dressingFootprintKnown(
  view: KnownCaveView,
  placement: DressingPlacement,
  gutter: number,
) {
  const box = bounds(placement, Math.max(0, gutter));
  if (box.top < 0 || box.bottom >= view.rows) return false;
  for (let y = box.top; y <= box.bottom; y++)
    for (let x = box.left; x <= box.right; x++)
      if (!view.known(x, y)) return false;
  return true;
}

/** Each occupied cell contributes its own 3x3 known-deposit exclusion. */
export function dressingNearDeposit(
  view: KnownCaveView,
  placement: DressingPlacement,
) {
  const box = bounds(placement);
  for (let y = box.top - 1; y <= box.bottom + 1; y++)
    for (let x = box.left - 1; x <= box.right + 1; x++)
      if (view.known(x, y) && view.deposit(x, y)) return true;
  return false;
}

function intersects(p: DressingPlacement, viewport: DressingViewport) {
  return (
    p.x + p.width / 2 > viewport.left &&
    p.x - p.width / 2 < viewport.right &&
    p.y + p.height / 2 > viewport.top &&
    p.y - p.height / 2 < viewport.bottom
  );
}

const order = (a: DressingPlacement, b: DressingPlacement) =>
  a.priority - b.priority || a.rank - b.rank || a.id.localeCompare(b.id);

/**
 * Pure, bounded render plan. W01's cave-zone pages are used only in C/D.
 * Every query passes through the T4 known view; even a view that throws on
 * unknown contents is safe. This module has no simulation or texture API.
 */
export function planDressing(
  view: KnownCaveView,
  viewport: DressingViewport,
  options: DressingOptions,
  catalog: DressingCatalog,
): DressingPlan {
  const limit = dressingLimit(options);
  const gutter = Math.max(0, options.gutter);
  const result: DressingPlan = {
    placements: [],
    limit,
    gutter,
    exposedCeilings: 0,
    decoratedCeilings: 0,
  };
  if (
    view.id !== "W01" ||
    view.width <= 0 ||
    ![
      viewport.left,
      viewport.top,
      viewport.right,
      viewport.bottom,
      gutter,
    ].every(Number.isFinite) ||
    viewport.left >= viewport.right ||
    viewport.top >= viewport.bottom ||
    gutter >= 0.4
  )
    return result;

  const frames = new Map(catalog.frames.map((frame) => [frame.name, frame]));
  const candidates: DressingPlacement[] = [];
  const ceilingEdges = new Set<string>();
  // A 3-cell boulder is the widest source; no farther anchor can enter view.
  const left = Math.floor(viewport.left) - 2;
  const right = Math.ceil(viewport.right) + 2;
  const top = Math.max(30, Math.floor(viewport.top) - 2);
  const bottom = Math.min(view.rows - 1, 59, Math.ceil(viewport.bottom) + 2);
  const scale = Math.min(0.92, 1 - 2 * gutter - 0.02);

  const make = (
    frameName: string,
    x: number,
    y: number,
    face: DressingPlacement["face"],
    priority: number,
    salt: number,
  ): DressingPlacement | undefined => {
    const frame = frames.get(frameName);
    if (!frame) return;
    const width = (frame.logicalWidth / 48) * scale;
    const height = (frame.logicalHeight / 48) * scale;
    const cellX = wrap(x, view.width);
    let centreX = x + 0.5;
    let centreY = y + 0.5;
    if (face === "ceiling") {
      // The root overlaps the natural field's <=0.28-tile ceiling displacement.
      // Its 4px source inset is inside the overlap; no collision edge moves.
      centreY = y - ROOT_BURIAL - (4 / 96) * scale + height / 2;
    } else if (face === "floor") {
      if (frame.baseline === undefined) return;
      // A7 records the OUTER outline contact, not the geometric path centre.
      centreY = y + 1 - (frame.baseline / 96) * scale + height / 2;
    } else {
      if (frame.baseline === undefined) return;
      // The authored wall crystal is the floor crystal rotated clockwise.
      const inset = width - (frame.baseline / 96) * scale;
      centreX =
        face === "left"
          ? x - ROOT_BURIAL - inset + width / 2
          : x + 1 + ROOT_BURIAL + inset - width / 2;
    }
    const placement: DressingPlacement = {
      // Contrast changes replace a material immediately, without keeping a
      // normal-value crystal alive during a 300 ms cross-fade.
      id: `${view.id}:${view.seed}:${cellX}:${y}:${face}:${frameName.replace(/-hc$/, "")}`,
      frame: frameName,
      family: frame.family,
      x: centreX,
      y: centreY,
      width,
      height,
      flipX: face === "right",
      // T6 will own a foreground slot. Until then boulders stay below the rig.
      depth: frame.family === "boulder" ? 12.2 : 12,
      face,
      cellX,
      cellY: y,
      priority,
      rank: dressingHash(view.seed, cellX, y, salt),
    };
    if (
      !intersects(placement, viewport) ||
      !dressingFootprintKnown(view, placement, gutter)
    )
      return;
    if (frame.family === "crystal" && dressingNearDeposit(view, placement))
      return;
    if (face === "floor" || face === "ceiling") {
      const supportY = face === "floor" ? y + 1 : y - 1;
      // Every root in a multi-cell source has an actual known support face.
      const span = bounds(placement);
      for (let supportX = span.left; supportX <= span.right; supportX++)
        if (!solid(view, supportX, supportY) || !natural(view, supportX, y))
          return;
    } else {
      const supportX = face === "left" ? x - 1 : x + 1;
      const span = bounds(placement);
      for (let supportY = span.top; supportY <= span.bottom; supportY++)
        if (!solid(view, supportX, supportY) || !natural(view, x, supportY))
          return;
    }
    return placement;
  };

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (!natural(view, x, y)) continue;
      const canonicalX = wrap(x, view.width);
      const hash = (salt: number) =>
        dressingHash(view.seed, canonicalX, y, salt);
      if (solid(view, x, y - 1)) {
        if (
          x + 1 > viewport.left &&
          x < viewport.right &&
          y >= viewport.top &&
          y < viewport.bottom
        )
          ceilingEdges.add(`${canonicalX}:${y}`);
        const index = Math.floor(hash(11) * 9);
        const stal =
          make(`cave-stalactite-${index}`, x, y, "ceiling", 0, 12) ??
          make(`cave-stalactite-${index % 6}`, x, y, "ceiling", 0, 12);
        if (stal) candidates.push(stal);
        if (hash(21) < 0.42) {
          const rust = make(
            `cave-rust-drip-${Math.floor(hash(22) * 4)}`,
            x,
            y,
            "ceiling",
            2,
            23,
          );
          if (rust) candidates.push(rust);
        }
      }
      if (solid(view, x, y + 1)) {
        const choice = hash(31);
        let floor: DressingPlacement | undefined;
        if (choice < 0.38) {
          const suffix = options.highContrast ? "-hc" : "";
          floor = make(
            `cave-crystal-floor-${Math.floor(hash(32) * 3)}${suffix}`,
            x,
            y,
            "floor",
            1,
            33,
          );
        } else if (choice < 0.62) {
          const index = Math.floor(hash(34) * 3);
          floor =
            make(`cave-boulder-${index}`, x, y, "floor", 2, 35) ??
            make("cave-boulder-0", x, y, "floor", 2, 35);
        }
        floor ??= make(
          `cave-rubble-${Math.floor(hash(36) * 6)}`,
          x,
          y,
          "floor",
          3,
          37,
        );
        if (floor) candidates.push(floor);
      }
      for (const dx of [-1, 1]) {
        const salt = dx < 0 ? 41 : 51;
        if (!solid(view, x + dx, y) || hash(salt) >= 0.32) continue;
        const suffix = options.highContrast ? "-hc" : "";
        const crystal = make(
          `cave-crystal-wall-${Math.floor(hash(salt + 1) * 3)}${suffix}`,
          x,
          y,
          dx < 0 ? "left" : "right",
          1,
          salt + 2,
        );
        if (crystal) candidates.push(crystal);
      }
    }
  }
  // A seam-crossing viewport keeps the world copy nearest its centre. The
  // identity and seeded variation stay canonical when the camera wraps.
  const centre = (viewport.left + viewport.right) / 2;
  const nearest = new Map<string, DressingPlacement>();
  for (const candidate of candidates) {
    const previous = nearest.get(candidate.id);
    if (
      !previous ||
      Math.abs(candidate.x - centre) < Math.abs(previous.x - centre)
    )
      nearest.set(candidate.id, candidate);
  }
  result.placements = [...nearest.values()].sort(order).slice(0, limit);
  result.exposedCeilings = ceilingEdges.size;
  result.decoratedCeilings = new Set(
    result.placements
      .filter(
        (p) =>
          p.face === "ceiling" && ceilingEdges.has(`${p.cellX}:${p.cellY}`),
      )
      .map((p) => `${p.cellX}:${p.cellY}`),
  ).size;
  return result;
}

interface DressingTransition {
  placement: DressingPlacement;
  start: number;
  from: number;
  target: 0 | 1;
}

export interface FadedDressing extends DressingPlacement {
  alpha: number;
}

/** Alpha-only transitions; this class cannot allocate or upload textures. */
export class DressingTransitions {
  private entries = new Map<string, DressingTransition>();
  private world = "";

  reset() {
    this.entries.clear();
    this.world = "";
  }

  private alpha(entry: DressingTransition, now: number) {
    if (now < entry.start) return entry.target;
    const t = Math.min(
      1,
      Math.max(0, (now - entry.start) / DRESSING_FADE_SECONDS),
    );
    const eased = t * t * (3 - 2 * t);
    return entry.from + (entry.target - entry.from) * eased;
  }

  update(
    view: KnownCaveView,
    plan: DressingPlan,
    viewport: DressingViewport,
    now: number,
    motion: { frozen: boolean; reducedMotion: boolean },
  ): FadedDressing[] {
    const world = `${view.id}:${view.seed}:${view.width}:${view.rows}`;
    if (world !== this.world) {
      this.reset();
      this.world = world;
    }
    const snap = motion.frozen || motion.reducedMotion;
    const desired = new Map(plan.placements.map((p) => [p.id, p]));
    for (const [id, entry] of this.entries) {
      const placement = desired.get(id);
      if (placement) entry.placement = placement;
      // A source that touches fog is removed immediately, even mid-fade.
      if (
        !dressingFootprintKnown(view, entry.placement, plan.gutter) ||
        !intersects(entry.placement, viewport)
      ) {
        this.entries.delete(id);
        continue;
      }
      const target = placement ? 1 : 0;
      if (snap) {
        if (!target) this.entries.delete(id);
        else {
          entry.placement = placement!;
          entry.from = entry.target = 1;
        }
        continue;
      }
      const alpha = this.alpha(entry, now);
      if (entry.target !== target) {
        entry.from = alpha;
        entry.start = now;
        entry.target = target;
      }
      if (placement) entry.placement = placement;
      if (entry.target === 0 && this.alpha(entry, now) <= 0)
        this.entries.delete(id);
    }
    // Outgoing fades reserve their slots. A reveal never makes 41 props
    // visible while an ore-adjacent crystal is completing its 300 ms exit.
    if (this.entries.size > plan.limit) {
      const retained = [...this.entries.values()]
        .sort((a, b) => order(a.placement, b.placement))
        .slice(0, plan.limit);
      this.entries = new Map(
        retained.map((entry) => [entry.placement.id, entry]),
      );
    }
    for (const placement of plan.placements) {
      if (this.entries.has(placement.id) || this.entries.size >= plan.limit)
        continue;
      this.entries.set(placement.id, {
        placement,
        start: now,
        from: snap ? 1 : 0,
        target: 1,
      });
    }
    return [...this.entries.values()]
      .map((entry) => ({
        ...entry.placement,
        alpha: snap ? 1 : this.alpha(entry, now),
      }))
      .filter((p) => p.alpha > 0)
      .sort(order);
  }
}
