import { describe, expect, it } from "vitest";
import {
  Mine,
  createState,
  decodeSave,
  WIDTH,
  SURFACE,
  wrapColumn,
  horizontalDelta,
  type Controls,
} from "../src/model";

function room(x = 23) {
  const state = createState(772);
  for (let row = 4; row <= 8; row++)
    state.tiles.fill(0, row * WIDTH, (row + 1) * WIDTH);
  state.tiles.fill(1, 9 * WIDTH, 10 * WIDTH);
  state.x = x;
  state.y = 8.15;
  state.fuel = 10;
  return new Mine(state);
}
function hold(mine: Mine, input: Controls, seconds: number) {
  for (let step = 0; step < seconds * 120; step++) mine.tick(1 / 120, input);
}
function finishCut(mine: Mine, input: Controls) {
  const mined = mine.state.mined;
  for (let step = 0; step < 120 * 5 && mine.state.mined === mined; step++)
    mine.tick(1 / 120, input);
  expect(mine.state.mined).toBe(mined + 1);
}

describe("continuous horizontal world wrapping", () => {
  it("uses canonical fractional coordinates and short periodic distances", () => {
    expect(wrapColumn(-1)).toBe(23);
    expect(wrapColumn(24)).toBe(0);
    expect(wrapColumn(48.25)).toBe(0.25);
    expect(horizontalDelta(23.8, 0.2)).toBeCloseTo(0.4);
    expect(horizontalDelta(0.2, 23.8)).toBeCloseTo(-0.4);
  });

  it.each([
    { start: 23.8, controls: { right: true }, expectedSign: 1 },
    { start: 0.2, controls: { left: true }, expectedSign: -1 },
  ])(
    "crosses the seam from x=$start without braking",
    ({ start, controls, expectedSign }) => {
      const mine = new Mine(createState());
      mine.state.x = start;
      mine.state.y = SURFACE + 0.15;
      let traveled = 0,
        previous = start,
        crossings = 0;
      for (let step = 0; step < 120 * 6; step++) {
        mine.tick(1 / 120, controls);
        const current = mine.state.x;
        if (Math.abs(current - previous) > WIDTH / 2) crossings++;
        traveled += horizontalDelta(previous, current);
        expect(current).toBeGreaterThanOrEqual(0);
        expect(current).toBeLessThan(WIDTH);
        previous = current;
      }
      expect(crossings).toBeGreaterThanOrEqual(2);
      expect(traveled * expectedSign).toBeGreaterThan(40);
      expect(mine.velocityX * expectedSign).toBeGreaterThan(8);
      expect(mine.state.hull).toBe(10);
      expect(decodeSave(JSON.stringify(mine.state))).toEqual(mine.state);
    },
  );

  it.each([
    { x: 23.9, direction: "right" },
    { x: 0.1, direction: "left" },
  ] as const)(
    "keeps thrust and steering while crossing toward $direction",
    ({ x, direction }) => {
      const mine = room(x),
        before = mine.state.y;
      hold(mine, { up: true, [direction]: true }, 0.35);
      expect(mine.state.y).toBeLessThan(before - 0.3);
      expect(Math.abs(mine.velocityX)).toBeGreaterThan(2);
      expect(
        horizontalDelta(x, mine.state.x) * (direction === "right" ? 1 : -1),
      ).toBeGreaterThan(0.3);
      expect(decodeSave(JSON.stringify(mine.state))).toEqual(mine.state);
    },
  );

  it.each([
    { x: 23, direction: "right", target: 0, unwrapped: 24 },
    { x: 0, direction: "left", target: 23, unwrapped: -1 },
  ] as const)(
    "cuts the $direction wall through the seam without a long render jump",
    ({ x, direction, target, unwrapped }) => {
      const mine = room(x);
      mine.state.tiles[8 * WIDTH + target] = 4;
      mine.refreshVisibility();
      expect(mine.tile(unwrapped, 8)).toBe(4);
      expect(mine.isVisible(unwrapped, 8)).toBe(true);
      mine.tick(1 / 120, { [direction]: true });
      expect(mine.drillTarget).toEqual({ x: target, y: 8 });
      let last = mine.renderX;
      while (mine.state.mined === 0) {
        mine.tick(1 / 120, {});
        expect(Math.abs(horizontalDelta(last, mine.renderX))).toBeLessThan(
          0.03,
        );
        last = mine.renderX;
      }
      expect(mine.state.x).toBe(target);
      expect(mine.state.tiles[8 * WIDTH + target]).toBe(0);
      expect(mine.state.inventory).toEqual([4]);
      expect(mine.state.money).toBe(20);
      expect(mine.isKnown(unwrapped, 8)).toBe(true);
      expect(decodeSave(JSON.stringify(mine.state))).toEqual(mine.state);
    },
  );

  it("cuts the wrapped floor beneath a fractional seam position", () => {
    const mine = room(23.9);
    mine.state.tiles[9 * WIDTH] = 10;
    finishCut(mine, { down: true });
    expect(mine.state.x).toBe(0);
    expect(mine.state.y).toBeCloseTo(9.15);
    expect(mine.state.tiles[9 * WIDTH]).toBe(0);
    expect(mine.state.tiles[9 * WIDTH + 23]).toBe(1);
    expect(mine.state.inventory).toEqual([10]);
    expect(decodeSave(JSON.stringify(mine.state))).toEqual(mine.state);
  });

  it.each([
    { x: 23, direction: "right", wall: 0 },
    { x: 0, direction: "left", wall: 23 },
  ] as const)(
    "respects real bedrock beyond the $direction seam",
    ({ x, direction, wall }) => {
      const mine = room(x);
      mine.state.tiles[8 * WIDTH + wall] = 8;
      hold(mine, { [direction]: true }, 1);
      expect(Math.abs(horizontalDelta(x, mine.state.x))).toBeLessThan(0.151);
      expect(mine.state.mined).toBe(0);
      expect(mine.state.tiles[8 * WIDTH + wall]).toBe(8);
      expect(mine.message).toContain("Bedrock");
      expect(decodeSave(JSON.stringify(mine.state))).toEqual(mine.state);
    },
  );

  it("reveals a seam-facing wall while keeping the terrain behind it occluded", () => {
    const mine = room(23);
    mine.state.tiles[8 * WIDTH] = 3;
    mine.state.tiles[8 * WIDTH + 1] = 14;
    mine.state.discovered.fill(0);
    mine.refreshVisibility();
    expect(mine.isVisible(24, 8)).toBe(true);
    expect(mine.isVisible(0, 8)).toBe(true);
    expect(mine.isKnown(1, 8)).toBe(false);
    expect(mine.isVisible(25, 8)).toBe(false);
    finishCut(mine, { right: true });
    expect(mine.isVisible(25, 8)).toBe(true);
    hold(mine, { left: true }, 1.3);
    expect(mine.isVisible(25, 8)).toBe(false);
    expect(mine.isKnown(25, 8)).toBe(true);
    expect(decodeSave(JSON.stringify(mine.state))).toEqual(mine.state);
  });

  it("loads fractional positions straddling the seam and rejects a noncanonical saved x", () => {
    const state = createState();
    state.x = 23.9;
    state.y = SURFACE + 0.15;
    expect(decodeSave(JSON.stringify(state))).toEqual(state);
    expect(() => decodeSave(JSON.stringify({ ...state, x: 24 }))).toThrow();
    expect(() => decodeSave(JSON.stringify({ ...state, x: -0.1 }))).toThrow();
    const mine = room(23.9);
    mine.state.tiles[8 * WIDTH] = 2;
    expect(() => decodeSave(JSON.stringify(mine.state))).toThrow(/overlaps/);
  });
});
