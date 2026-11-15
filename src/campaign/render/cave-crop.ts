/** A crop uses full-source pixels, including padding trimmed out of the atlas. */
export interface SourceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Map authored pixels to the resident frame density and intersect its trim.
 * Phaser's empty trimmed crop leaves a nonempty WebGL quad sampling (0, 0),
 * so empty intersections must be skipped before setCrop().
 */
export function trimmedSourceCrop(
  frame: {
    realWidth: number;
    realHeight: number;
    x: number;
    y: number;
    cutWidth: number;
    cutHeight: number;
  },
  crop: SourceCrop,
  authored: { width: number; height: number },
): SourceCrop | undefined {
  const sx = frame.realWidth / authored.width;
  const sy = frame.realHeight / authored.height;
  const left = Math.max(frame.x, crop.x * sx);
  const top = Math.max(frame.y, crop.y * sy);
  const right = Math.min(frame.x + frame.cutWidth, (crop.x + crop.width) * sx);
  const bottom = Math.min(
    frame.y + frame.cutHeight,
    (crop.y + crop.height) * sy,
  );
  if (right <= left || bottom <= top) return;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
