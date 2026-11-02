import type { CampaignWorld } from "./types";
import { WORLD_BANDS } from "./world-content";

/** Deterministic content checks, deliberately separate from human pacing claims. */
export function measureWorld(world: CampaignWorld) {
  const route = world.id === "W01" ? 20 : 24;
  const width = world.width;
  const cells = new Set<number>();
  let largestCave = 0;
  for (let index = 0; index < world.tiles.length; index++) {
    if (world.tiles[index] !== 0 || cells.has(index)) continue;
    const queue = [index];
    cells.add(index);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor]!,
        x = cell % width,
        y = Math.floor(cell / width);
      for (const [nx, ny] of [
        [(x + width - 1) % width, y],
        [(x + 1) % width, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const next = ny! * width + nx!;
        if (
          ny! >= 0 &&
          ny! < world.rows &&
          world.tiles[next] === 0 &&
          !cells.has(next)
        ) {
          cells.add(next);
          queue.push(next);
        }
      }
    }
    largestCave = Math.max(largestCave, queue.length);
  }
  const ordinary = world.packages.filter((item) =>
    item.tags.includes("ordinary"),
  );
  const routePackages = ordinary.filter(
    (item) => Math.abs(item.x - route - 0.5) <= 3,
  );
  const rows = [
    ...new Set(routePackages.map((item) => Math.floor(item.y))),
  ].sort((a, b) => a - b);
  let longestOreGap = 0;
  for (let index = 1; index < rows.length; index++)
    longestOreGap = Math.max(
      longestOreGap,
      (rows[index]! - rows[index - 1]!) * 10,
    );
  const featureBands = new Set<number>();
  for (let row = 5; row < world.rows; row++) {
    const nearbyCave = [-1, 1].some(
      (dx) => world.tiles[row * width + route + dx] === 0,
    );
    const nearbyOre = routePackages.some((item) => Math.floor(item.y) === row);
    const nearbySite = (world.sites ?? []).some(
      (site) =>
        Math.abs(site.y - row - 0.5) < 2 && Math.abs(site.x - route - 0.5) <= 5,
    );
    if (nearbyCave || nearbyOre || nearbySite)
      featureBands.add(Math.floor(row / 5));
  }
  const signatures = WORLD_BANDS[world.id === "W02" ? "W02" : "W01"].map(
    (band) => ({
      id: band.id,
      present: (world.sites ?? []).some(
        (site) => site.y >= band.start && site.y < band.end + 1,
      ),
    }),
  );
  const depthValue = Array.from({ length: world.rows / 10 }, (_, band) => ({
    start: band * 100,
    valuePerCell:
      ordinary
        .filter((item) => item.y >= band * 10 && item.y < (band + 1) * 10)
        .reduce((sum, item) => sum + item.value, 0) /
      (width * 10),
  }));
  return {
    largestCave,
    longestOreGap,
    routeFeatureBands: featureBands.size,
    signatures,
    depthValue,
    relicVisibleFromRoute: world.packages
      .filter((item) => item.tags.includes("relic"))
      .some((item) => Math.abs(item.x - route - 0.5) <= 4),
    ordinaryCount: ordinary.length,
    ordinaryValue: ordinary.reduce((sum, item) => sum + item.value, 0),
  };
}
