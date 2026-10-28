// Exploration is independent of the viewport: widening the screen must never
// turn the mine into an ore map. Solid ground blocks the lamp at its first face.
export const DISCOVERY_RADIUS = 4.5;

export function observeTerrain(
  tiles: readonly number[],
  discovered: number[],
  width: number,
  surface: number,
  x: number,
  y: number,
): Set<number> {
  const height = tiles.length / width;
  const columnIndex = (column: number) => ((column % width) + width) % width;
  const visible = new Set<number>();
  const reveal = (column: number, row: number) => {
    if (row < 0 || row >= height) return;
    const index = row * width + columnIndex(column);
    discovered[index] = 1;
    visible.add(index);
  };
  // The surface is a known base, not an underground discovery reward.
  for (let row = 0; row <= surface; row++)
    for (let column = 0; column < width; column++) reveal(column, row);

  const originX = x + 0.5,
    originY = y + 0.5,
    startX = Math.floor(originX),
    startY = Math.floor(originY);
  const solid = (column: number, row: number) =>
    row < 0 || row >= height || tiles[row * width + columnIndex(column)] !== 0;
  const unobstructed = (
    targetX: number,
    targetY: number,
    faceX = 0.5,
    faceY = 0.5,
  ) => {
    if (targetX === startX && targetY === startY) return true;
    const dx = targetX + faceX - originX,
      dy = targetY + faceY - originY,
      stepX = Math.sign(dx),
      stepY = Math.sign(dy),
      deltaX = dx === 0 ? Infinity : Math.abs(1 / dx),
      deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    let column = startX,
      row = startY,
      crossingX =
        dx === 0
          ? Infinity
          : ((stepX > 0 ? column + 1 : column) - originX) / dx,
      crossingY =
        dy === 0 ? Infinity : ((stepY > 0 ? row + 1 : row) - originY) / dy;
    for (let steps = 0; steps < 24; steps++) {
      if (Math.abs(crossingX - crossingY) < 1e-9) {
        // Supercover corner test prevents peeking through two touching walls.
        if (solid(column + stepX, row) || solid(column, row + stepY))
          return false;
        column += stepX;
        row += stepY;
        crossingX += deltaX;
        crossingY += deltaY;
      } else if (crossingX < crossingY) {
        column += stepX;
        crossingX += deltaX;
      } else {
        row += stepY;
        crossingY += deltaY;
      }
      // The wall face itself is visible, but never the cell behind it.
      if (column === targetX && row === targetY) return true;
      if (solid(column, row)) return false;
    }
    return false;
  };
  const radius = DISCOVERY_RADIUS;
  for (
    let row = Math.max(surface + 1, Math.floor(y - radius));
    row <= Math.min(height - 1, Math.ceil(y + radius));
    row++
  )
    for (
      let column = Math.floor(x - radius);
      column <= Math.ceil(x + radius);
      column++
    )
      if ((column - x) ** 2 + (row - y) ** 2 <= radius ** 2) {
        // A wall can have a visible exposed face even when its center is
        // hidden behind the preceding floor cell. Test face midpoints without
        // ever looking through that wall into the cell behind it.
        const seen =
          unobstructed(column, row) ||
          (tiles[row * width + columnIndex(column)] !== 0 &&
            (unobstructed(column, row, 0.5, 0.001) ||
              unobstructed(column, row, 0.5, 0.999) ||
              unobstructed(column, row, 0.001, 0.5) ||
              unobstructed(column, row, 0.999, 0.5)));
        if (seen) reveal(column, row);
      }
  return visible;
}
