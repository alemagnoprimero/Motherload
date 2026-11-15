import type { KnownCaveView } from "./cave-known";

/** After T2's opaque terrain/air quad, before every prop and the light map. */
export const BACK_WALL_DEPTH = 10.1;
export const BACK_WALL_INSET = 0.3;
export const BACK_WALL_REVEAL_SECONDS = 0.3;
export const BACK_WALL_SOURCE = { width: 1024, height: 384 } as const;
export const BACK_WALL_LAYERS = [
  {
    frame: "cave-backwall-far",
    alternateFrame: "cave-backwall-near",
    parallax: 0.25,
  },
  {
    frame: "cave-backwall-near",
    alternateFrame: "cave-backwall-far",
    parallax: 0.5,
  },
] as const;

export interface CaveRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface CaveClock {
  seconds: number;
  frozen: boolean;
  reducedMotion: boolean;
}
export interface BackWallLayer {
  frame: string;
  alternateFrame: string;
  parallax: number;
}
export interface BackWallFragment {
  id: string;
  frame: string;
  layer: number;
  depth: number;
  alpha: number;
  /** Known natural-air rectangle, in unwrapped world tiles. */
  bounds: CaveRect;
  /** Full uncropped sprite box, in world tiles; origin is its top left. */
  image: CaveRect;
  /** Crop in the full authored @2x source, not the atlas's trimmed rectangle. */
  crop: { x: number; y: number; width: number; height: number };
}

const wrap = (x: number, width: number) => ((x % width) + width) % width;
const canonicalCell = (view: KnownCaveView, x: number, y: number) =>
  `${wrap(x, view.width)}:${y}`;
const eligible = (view: KnownCaveView, x: number, y: number) =>
  view.id === "W01" && y >= 30 && y <= 47 && view.natural(x, y);

/**
 * A reveal affects alpha only: no pixel canvas, texture update or timer.
 * The first snapshot is existing knowledge and draws at once. Further
 * discoveries fade for 300 ms. A frozen scene/reduced motion snaps them.
 */
export class BackWallReveals {
  private world = "";
  private lastTime = -Infinity;
  private revealed = new Map<string, number>();

  update(view: KnownCaveView, clock: CaveClock) {
    const key = `${view.id}:${view.seed}:${view.width}:${view.rows}`;
    const initial = key !== this.world;
    if (initial) {
      this.world = key;
      this.revealed.clear();
    }
    const snap =
      initial ||
      clock.frozen ||
      clock.reducedMotion ||
      clock.seconds < this.lastTime;
    const present = new Set<string>();
    for (let y = 30; y <= Math.min(47, view.rows - 1); y++)
      for (let x = 0; x < view.width; x++) {
        if (!eligible(view, x, y)) continue;
        const cell = canonicalCell(view, x, y);
        present.add(cell);
        if (snap) this.revealed.set(cell, -Infinity);
        else if (!this.revealed.has(cell))
          this.revealed.set(cell, clock.seconds);
      }
    for (const cell of this.revealed.keys())
      if (!present.has(cell)) this.revealed.delete(cell);
    this.lastTime = clock.seconds;
  }

  alpha(view: KnownCaveView, x: number, y: number, seconds: number) {
    const start = this.revealed.get(canonicalCell(view, x, y));
    if (start === undefined) return 0;
    return Math.max(
      0,
      Math.min(1, (seconds - start) / BACK_WALL_REVEAL_SECONDS),
    );
  }

  reset() {
    this.world = "";
    this.lastTime = -Infinity;
    this.revealed.clear();
  }
}

/**
 * The field moves a natural boundary by at most 0.28 tile. Erode the
 * known-natural region by 0.30 tile at all eight neighbours, including
 * diagonal corners, so these overlays never cover the field's rock/lip or
 * an unknown pixel. No stencil mask or second terrain shader is needed.
 */
export function safeCaveCell(
  view: KnownCaveView,
  x: number,
  y: number,
): CaveRect[] {
  if (!eligible(view, x, y)) return [];
  const natural = (dx: number, dy: number) => eligible(view, x + dx, y + dy);
  const inset = BACK_WALL_INSET;
  const left = natural(-1, 0) ? 0 : inset;
  const right = natural(1, 0) ? 1 : 1 - inset;
  const top = natural(0, -1) ? 0 : inset;
  const bottom = natural(0, 1) ? 1 : 1 - inset;
  const rectangles: CaveRect[] = [];
  for (const [a, b, dy] of [
    [0, inset, -1],
    [inset, 1 - inset, 0],
    [1 - inset, 1, 1],
  ] as const) {
    const t = Math.max(top, a),
      btm = Math.min(bottom, b);
    if (btm <= t) continue;
    const l = Math.max(left, dy && !natural(-1, dy) ? inset : 0);
    const r = Math.min(right, dy && !natural(1, dy) ? 1 - inset : 1);
    if (r <= l) continue;
    const previous = rectangles[rectangles.length - 1];
    if (
      previous &&
      previous.left === x + l &&
      previous.right === x + r &&
      previous.bottom === y + t
    )
      previous.bottom = y + btm;
    else
      rectangles.push({
        left: x + l,
        top: y + t,
        right: x + r,
        bottom: y + btm,
      });
  }
  return rectangles;
}

const intersect = (a: CaveRect, b: CaveRect): CaveRect | undefined => {
  const rect = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
};

/**
 * A newly known neighbour also exposes an old cell's inset margin. Fade
 * that margin with the neighbour instead of making it pop at full alpha.
 * Only a live reveal splits the old cell; parked geometry stays compact.
 */
function fadingRegions(
  view: KnownCaveView,
  column: number,
  row: number,
  reveals: BackWallReveals | undefined,
  seconds: number,
) {
  const alpha = reveals ? reveals.alpha(view, column, row, seconds) : 1;
  if (alpha <= 0) return [];
  const safe = safeCaveCell(view, column, row);
  const xs = new Set<number>();
  const ys = new Set<number>();
  if (reveals)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          !(dx || dy) ||
          !eligible(view, column + dx, row + dy) ||
          reveals.alpha(view, column + dx, row + dy, seconds) >= alpha
        )
          continue;
        if (dx)
          xs.add(column + (dx < 0 ? BACK_WALL_INSET : 1 - BACK_WALL_INSET));
        if (dy) ys.add(row + (dy < 0 ? BACK_WALL_INSET : 1 - BACK_WALL_INSET));
      }
  if (!xs.size && !ys.size) return safe.map((bounds) => ({ bounds, alpha }));
  const regions: { bounds: CaveRect; alpha: number }[] = [];
  for (const bounds of safe) {
    const columns = [
      bounds.left,
      ...[...xs]
        .filter((x) => x > bounds.left && x < bounds.right)
        .sort((a, b) => a - b),
      bounds.right,
    ];
    const rows = [
      bounds.top,
      ...[...ys]
        .filter((y) => y > bounds.top && y < bounds.bottom)
        .sort((a, b) => a - b),
      bounds.bottom,
    ];
    for (let y = 0; y < rows.length - 1; y++) {
      const runs: { bounds: CaveRect; alpha: number }[] = [];
      for (let x = 0; x < columns.length - 1; x++) {
        const left = columns[x]!,
          right = columns[x + 1]!;
        const top = rows[y]!,
          bottom = rows[y + 1]!;
        const centerX = (left + right) / 2 - column;
        const centerY = (top + bottom) / 2 - row;
        const dx =
          centerX < BACK_WALL_INSET
            ? -1
            : centerX > 1 - BACK_WALL_INSET
              ? 1
              : 0;
        const dy =
          centerY < BACK_WALL_INSET
            ? -1
            : centerY > 1 - BACK_WALL_INSET
              ? 1
              : 0;
        let amount = alpha;
        if (dx)
          amount = Math.min(
            amount,
            reveals!.alpha(view, column + dx, row, seconds),
          );
        if (dy)
          amount = Math.min(
            amount,
            reveals!.alpha(view, column, row + dy, seconds),
          );
        if (dx && dy)
          amount = Math.min(
            amount,
            reveals!.alpha(view, column + dx, row + dy, seconds),
          );
        if (amount <= 0) continue;
        const previous = runs[runs.length - 1];
        if (
          previous &&
          previous.alpha === amount &&
          previous.bounds.right === left
        )
          previous.bounds.right = right;
        else runs.push({ bounds: { left, top, right, bottom }, alpha: amount });
      }
      for (const run of runs) {
        const previous = regions.find(
          (region) =>
            region.alpha === run.alpha &&
            region.bounds.left === run.bounds.left &&
            region.bounds.right === run.bounds.right &&
            region.bounds.bottom === run.bounds.top,
        );
        if (previous) previous.bounds.bottom = run.bounds.bottom;
        else regions.push(run);
      }
    }
  }
  return regions;
}

/**
 * World-periodic horizontal tiling. W01's 40 columns fit four 10-tile
 * repeats: 6.25% narrower than the authored 10 2/3 tiles. Quarter/half
 * parallax each advances an integer number of repeats on a world lap,
 * so crossing x=0 or returning a world width later never changes phase.
 * Four-tile vertical strips alternate the two authored sources. Their
 * opposite edges match, making an eight-row repeat with upright facets.
 * Discovery never chooses the strip's extent, phase, or source frame.
 */
export function planBackWalls(
  view: KnownCaveView,
  viewport: CaveRect,
  cameraX: number,
  reveals?: BackWallReveals,
  seconds = 0,
  layers: readonly BackWallLayer[] = BACK_WALL_LAYERS,
): BackWallFragment[] {
  if (view.id !== "W01") return [];
  const repeatCount = Math.max(1, Math.round(view.width / (512 / 48)));
  const period = view.width / repeatCount;
  const height = 4;
  const fragments: BackWallFragment[] = [];
  for (
    let row = Math.max(30, Math.floor(viewport.top));
    row <= Math.min(47, Math.ceil(viewport.bottom) - 1);
    row++
  )
    for (
      let column = Math.floor(viewport.left);
      column < Math.ceil(viewport.right);
      column++
    ) {
      const safe = fadingRegions(view, column, row, reveals, seconds);
      for (let layer = 0; layer < layers.length; layer++) {
        const definition = layers[layer]!;
        const phase = cameraX * (1 - definition.parallax);
        let part = 0;
        for (const { bounds, alpha } of safe) {
          const clipped = intersect(bounds, viewport);
          if (!clipped) continue;
          let top = clipped.top;
          while (top < clipped.bottom - 1e-10) {
            const imageTop = Math.floor(top / height + 1e-10) * height;
            const bottom = Math.min(clipped.bottom, imageTop + height);
            let left = clipped.left;
            while (left < clipped.right - 1e-10) {
              const imageLeft =
                Math.floor((left - phase) / period + 1e-10) * period + phase;
              const right = Math.min(clipped.right, imageLeft + period);
              const scaleX = BACK_WALL_SOURCE.width / period,
                scaleY = BACK_WALL_SOURCE.height / height;
              fragments.push({
                id: `${layer}:${canonicalCell(view, column, row)}:${part++}`,
                frame:
                  wrap(Math.floor(imageTop / height), 2) === 1
                    ? definition.alternateFrame
                    : definition.frame,
                layer,
                depth: BACK_WALL_DEPTH + layer * 0.01,
                alpha,
                bounds: { left, top, right, bottom },
                image: {
                  left: imageLeft,
                  top: imageTop,
                  right: imageLeft + period,
                  bottom: imageTop + height,
                },
                crop: {
                  x: (left - imageLeft) * scaleX,
                  y: (top - imageTop) * scaleY,
                  width: (right - left) * scaleX,
                  height: (bottom - top) * scaleY,
                },
              });
              left = right;
            }
            top = bottom;
          }
        }
      }
    }
  return fragments;
}
