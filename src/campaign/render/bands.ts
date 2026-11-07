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

export type CellState = "unknown" | "remembered" | "visible";
/**
 * Darkness of each cell state per band (F4): unknown rock is the darkest,
 * remembered space next, visible space the lightest, in every band. Unknown
 * rock takes most of its value from its dark base and rock page
 * (terrain.ts), so its darkness only trims it into luma 45–65.
 * - W01 follows depth (d = 1 − ambient): about 0.08 + 0.31d, 0.04 + 0.28d
 *   and 0.25d.
 * - W02's rock pages are much lighter in bands A–C (mean luma 100–124,
 *   against 77–83 on W01), so its unknown darkness is higher there. Band D
 *   matches W01 D but for unknown rock, whose base and page are darker.
 */
const STATE_DARKNESS: Record<
  string,
  Record<string, Readonly<Record<CellState, number>>>
> = {
  W01: {
    a: { unknown: 0.13, remembered: 0.08, visible: 0.04 },
    b: { unknown: 0.18, remembered: 0.13, visible: 0.08 },
    c: { unknown: 0.25, remembered: 0.19, visible: 0.14 },
    d: { unknown: 0.3, remembered: 0.24, visible: 0.18 },
  },
  W02: {
    a: { unknown: 0.4, remembered: 0.08, visible: 0.04 },
    b: { unknown: 0.27, remembered: 0.14, visible: 0.09 },
    c: { unknown: 0.31, remembered: 0.2, visible: 0.14 },
    d: { unknown: 0.31, remembered: 0.24, visible: 0.18 },
  },
};
export function stateDarkness(worldId: string, bandId: string) {
  const world = STATE_DARKNESS[worldId] ?? STATE_DARKNESS.W01!;
  return world[bandId] ?? STATE_DARKNESS.W01!.a!;
}
/**
 * A backstop for the L* 18 floor on unknown rock in high contrast. On the
 * darkest unknown band (W02 D: base #2f4250 under a rock page of mean luma 65
 * at 0.5 alpha, about luma 64 before darkness), darkness 0.36 leaves luma 44,
 * which is L* 18. At the values above it never takes effect: high contrast's
 * ×0.65 already keeps unknown rock lighter than that.
 */
export const HIGH_CONTRAST_UNKNOWN_DARKNESS = 0.36;
/** The light map's darkness for a cell, as lighting.ts draws it. */
export function fogDarkness(
  state: CellState,
  worldId: string,
  bandId: string,
  highContrast: boolean,
) {
  const darkness = stateDarkness(worldId, bandId)[state];
  if (!highContrast) return darkness;
  return state === "unknown"
    ? Math.min(darkness * 0.65, HIGH_CONTRAST_UNKNOWN_DARKNESS)
    : darkness * 0.65;
}
