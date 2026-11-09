import type { CameraSafeArea } from "./view";
/** Camera reserves describe overlays, never the size of the mining world. */
export function campaignTileSize(width: number, height: number) {
  if (height <= 420) return 44;
  if (width < 600) return 44;
  return Math.max(48, width / 22);
}

/**
 * The retained terrain buffer (render/terrain.ts) for a view: its raster
 * tile, its grid and its size in device px. Pure, so the T13b budget guard
 * (render/zones.ts) can project the buffer before it exists.
 */
export function retainedTerrainGrid(
  width: number,
  height: number,
  baseTile: number,
  viewDpr: number,
  coarse: boolean,
) {
  const dpr = Math.min(viewDpr, 1.5),
    // Camera zoom scales the retained image; it never resizes or rerasterizes
    // the material canvas. Whole raster pixels also make scrolling copies exact.
    tile = Math.round(baseTile * (coarse ? 0.88 : 1) * dpr) / dpr,
    padding = coarse ? 4 : 3,
    columns = Math.ceil(width / (baseTile * 0.88)) + padding,
    rows = Math.ceil(height / (baseTile * 0.88)) + padding;
  return {
    dpr,
    tile,
    columns,
    rows,
    pixelWidth: Math.ceil(columns * tile * dpr),
    pixelHeight: Math.ceil(rows * tile * dpr),
  };
}

export function campaignSafeArea(
  width: number,
  height: number,
  coarsePointer = false,
): CameraSafeArea {
  if (width < 760 || coarsePointer)
    return height <= 420 ? { top: 92, bottom: 48 } : { top: 142, bottom: 70 };
  return { top: 72, bottom: 48 };
}
/** Measure overlay rectangles in CSS pixels. Floating centre notices never become camera bands. */
export function cameraSafeArea(
  rects: readonly Pick<
    DOMRect,
    "top" | "bottom" | "left" | "right" | "width" | "height"
  >[],
  width: number,
  height: number,
): CameraSafeArea {
  let top = 0,
    bottom = 0;
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.top < height * 0.24) top = Math.max(top, rect.bottom + 8);
    if (rect.bottom > height * 0.76)
      bottom = Math.max(bottom, height - rect.top + 8);
  }
  return {
    top: Math.min(height * 0.32, top),
    bottom: Math.min(height * 0.24, bottom),
  };
}
