import { describe, expect, it } from "vitest";
import { DISCOVERY_RADIUS, observeTerrain } from "../src/discovery";

const width = 24,
  height = 100,
  surface = 3;
function chamber() {
  const tiles = Array<number>(width * height).fill(1);
  for (let row = 0; row <= surface; row++)
    tiles.fill(0, row * width, (row + 1) * width);
  return { tiles, discovered: Array<number>(tiles.length).fill(0) };
}
const at = (x: number, y: number) => y * width + x;
const observe = (state: ReturnType<typeof chamber>, x: number, y: number) =>
  observeTerrain(state.tiles, state.discovered, width, surface, x, y);

describe("local exploration and remembered terrain", () => {
  it("shows the nearby rock face without exposing ore or caves behind it", () => {
    const state = chamber();
    state.tiles[at(12, 5)] = 14;
    state.tiles[at(13, 5)] = 0;
    const visible = observe(state, 12, 3.15);
    expect(visible.has(at(12, 4))).toBe(true);
    expect(visible.has(at(10, 4))).toBe(true);
    expect(visible.has(at(14, 4))).toBe(true);
    expect(state.discovered[at(12, 5)]).toBe(0);
    expect(state.discovered[at(13, 5)]).toBe(0);
    expect(state.discovered[at(0, 4)]).toBe(0);
  });

  it("reveals a new face after excavation and keeps it remembered after retreat", () => {
    const state = chamber();
    state.tiles[at(12, 5)] = 14;
    observe(state, 12, 3.15);
    state.tiles[at(12, 4)] = 0;
    const visible = observe(state, 12, 4.15);
    expect(visible.has(at(12, 5))).toBe(true);
    const later = observe(state, 2, 3.15);
    expect(later.has(at(12, 5))).toBe(false);
    expect(state.discovered[at(12, 5)]).toBe(1);
    expect(state.discovered[at(12, 6)]).toBe(0);
  });

  it("limits sight even in an unobstructed cavern and does not leak diagonal walls", () => {
    const state = chamber();
    for (let row = 8; row <= 20; row++)
      for (let x = 3; x <= 21; x++) state.tiles[at(x, row)] = 0;
    const visible = observe(state, 12, 12);
    expect(visible.has(at(12, 16))).toBe(true);
    expect(visible.has(at(12, 17))).toBe(false);
    for (const index of visible) {
      const row = Math.floor(index / width),
        x = index % width;
      if (row > surface)
        expect(Math.hypot(x - 12, row - 12)).toBeLessThanOrEqual(
          DISCOVERY_RADIUS,
        );
    }
    state.tiles[at(13, 12)] = 1;
    state.tiles[at(12, 13)] = 1;
    state.discovered.fill(0);
    expect(observe(state, 12, 12).has(at(13, 13))).toBe(false);
  });

  it("uses identical discovery for hidden mineral and hidden cave layouts", () => {
    const a = chamber(),
      b = chamber();
    b.tiles[at(12, 5)] = 6;
    b.tiles[at(13, 5)] = 0;
    expect([...observe(a, 12, 3.15)]).toEqual([...observe(b, 12, 3.15)]);
    expect(a.discovered).toEqual(b.discovered);
  });
});
