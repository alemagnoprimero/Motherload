import { WORLD_BANDS, worldBand } from "../world-content";
export interface RenderBand {
  id: string;
  from: number;
  to: number;
  name: string;
  soil: [string, string, string];
  rock: [string, string, string];
  wall: string;
  ambient: number;
}
export const shade = (hex: string, amount: number) =>
  "#" +
  hex
    .slice(1)
    .match(/../g)!
    .map((channel) =>
      Math.max(0, Math.min(255, parseInt(channel, 16) + amount))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const palette = (base: string): [string, string, string] => [
  shade(base, -27),
  base,
  shade(base, 32),
];
export const RENDER_BANDS: Record<string, readonly RenderBand[]> =
  Object.fromEntries(
    Object.entries(WORLD_BANDS).map(([id, bands]) => [
      id,
      bands.map((b) => ({
        id: b.id.slice(-1).toLowerCase(),
        from: b.start,
        to: b.end,
        name: b.name,
        soil: palette(b.soil),
        rock: palette(b.stone),
        wall: b.backWall,
        ambient: b.ambient,
      })),
    ]),
  );
export function renderBand(worldId: string, row: number) {
  const band = worldBand(worldId, row);
  return (
    RENDER_BANDS[worldId]?.find(
      (b) => b.id === band.id.slice(-1).toLowerCase(),
    ) ?? RENDER_BANDS.W01![0]!
  );
}

/**
 * Darkness of each cell state, set per band from its ambient light: unknown
 * rock is the darkest, remembered space next, visible space the lightest, in
 * every band (F4). Unknown rock already has a dark base and rock page
 * (terrain.ts), so its darkness stays low enough to keep it legible.
 */
export function stateDarkness(ambient: number) {
  const depth = 1 - ambient;
  return {
    unknown: 0.08 + depth * 0.31,
    remembered: 0.04 + depth * 0.28,
    visible: depth * 0.25,
  };
}
/**
 * High contrast lightens every state by ×0.65 and never darkens unknown rock
 * past L* 18. On the darkest unknown band (W02 D: base #2f4250 and a rock page
 * of mean luma 65 at 0.5 alpha, about luma 64 before darkness), darkness 0.36
 * leaves luma 44, which is L* 18.
 */
export const HIGH_CONTRAST_UNKNOWN_DARKNESS = 0.36;
