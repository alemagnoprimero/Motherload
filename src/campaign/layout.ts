/** Camera reserves describe overlays, never the size of the mining world. */
export function campaignTileSize(width: number, height: number) {
  if (height <= 420 || width < 600) return 48;
  return Math.max(48, Math.min(76, Math.round(width / 22)));
}

export function campaignSafeArea(
  width: number,
  height: number,
  coarsePointer = false,
) {
  if (width < 760 || coarsePointer)
    return height <= 420 ? { top: 64, bottom: 64 } : { top: 96, bottom: 100 };
  return { top: 56, bottom: 48 };
}
