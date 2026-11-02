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
