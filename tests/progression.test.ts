import { describe, expect, it } from "vitest";
import {
  Mine,
  createState,
  decodeSave,
  HEIGHT,
  WIDTH,
  SURFACE,
  STRATA,
  ORES,
  isOre,
  maxDepth,
  maxFuel,
  maxHull,
  worldHeight,
  stratumAtDepth,
  magmaDamageAtDepth,
} from "../src/model";

function earlierExpedition() {
  const state = createState(4321);
  state.tiles = state.tiles.slice(0, 100 * WIDTH);
  state.tiles.fill(8, 99 * WIDTH);
  state.discovered = state.discovered.slice(0, state.tiles.length);
  state.tiles[4 * WIDTH + 12] = 0;
  state.money = 8456;
  state.inventory = [10, 12, 14];
  state.upgrades = { drill: 3, tank: 2, cargo: 4, hull: 3, engine: 2 };
  state.fuel = 12.5;
  state.hull = 37;
  return state;
}

// An established access shaft represents earlier expeditions. Each test run
// still descends from the surface, brakes the landing, cuts, and flies home
// through actual simulation input. No teleportation occurs during the trip.
function excursion(meters: number, tank: number, drill: number, cuts = 5) {
  const state = createState(42);
  state.upgrades.tank = tank;
  state.upgrades.drill = drill;
  state.fuel = maxFuel(state);
  const initialFuel = state.fuel;
  const floor = SURFACE + meters / 10;
  for (let row = SURFACE + 1; row < floor; row++)
    state.tiles[row * WIDTH + 12] = 0;
  for (let row = floor; row <= floor + cuts; row++)
    state.tiles[row * WIDTH + 12] = 2;
  const mine = new Mine(state);
  let seconds = 0;
  for (
    let tick = 0;
    tick < 120 * 180 && !mine.grounded && state.fuel > 0;
    tick++
  ) {
    const landingDistance = floor - 0.85 - state.y;
    mine.tick(1 / 120, {
      down: true,
      up: mine.velocityY > (landingDistance < 3 ? 2 : 6),
    });
    seconds += 1 / 120;
  }
  const afterDescent = state.fuel;
  for (
    let tick = 0;
    tick < 120 * 180 && state.mined < cuts && state.fuel > 0;
    tick++
  ) {
    mine.tick(1 / 120, "down");
    seconds += 1 / 120;
  }
  const afterCuts = state.fuel;
  for (
    let tick = 0;
    tick < 120 * 180 && !mine.docked && state.fuel > 0;
    tick++
  ) {
    mine.tick(1 / 120, "up");
    seconds += 1 / 120;
  }
  return { mine, initialFuel, afterDescent, afterCuts, seconds };
}

describe("exploration and compatible expedition geography", () => {
  it("starts a 600-row mine with a local, persistent discovery mask", () => {
    const state = createState();
    expect(worldHeight(state)).toBe(600);
    expect(maxDepth(state)).toBe(5950);
    expect(state.discovered).toHaveLength(state.tiles.length);
    expect(
      state.discovered.reduce((total, known) => total + known, 0),
    ).toBeLessThan(150);
    const mine = new Mine(state);
    expect(mine.isKnown(12, 4)).toBe(true);
    expect(mine.isKnown(12, 5)).toBe(false);
    for (let tick = 0; tick < 120 * 3 && state.mined < 1; tick++)
      mine.tick(1 / 120, "down");
    expect(state.mined).toBe(1);
    expect(mine.isKnown(12, 5)).toBe(true);
    expect(mine.isVisible(12, 5)).toBe(true);
    mine.recover();
    expect(mine.isKnown(12, 5)).toBe(true);
    expect(mine.isKnown(12, 100)).toBe(false);
    expect(decodeSave(JSON.stringify(state))).toEqual(state);
  });

  it("upgrades a schema3 save without regenerating terrain or converting modern equipment", () => {
    const state = earlierExpedition();
    const { discovered: _discovered, ...previous } = state;
    const migrated = decodeSave(JSON.stringify({ ...previous, version: 3 }));
    expect(migrated).toMatchObject({ ...previous, version: 4 });
    expect(migrated.tiles).toEqual(state.tiles);
    expect(worldHeight(migrated)).toBe(100);
    expect(maxDepth(migrated)).toBe(950);
    expect(migrated.discovered).toHaveLength(100 * WIDTH);
    expect(migrated.discovered[4 * WIDTH + 12]).toBe(1);
    expect(migrated.discovered[50 * WIDTH + 12]).toBe(0);
    expect(decodeSave(JSON.stringify(migrated))).toEqual(migrated);
  });

  it("retains exact schema4 discovery and accepts both supported world heights", () => {
    for (const state of [createState(), earlierExpedition()]) {
      state.discovered.fill(0);
      state.discovered[60 * WIDTH + 7] = 1;
      expect(decodeSave(JSON.stringify(state))).toEqual(state);
      const mine = new Mine(state);
      expect(mine.isKnown(7, 60)).toBe(true);
      expect(mine.isVisible(7, 60)).toBe(false);
      const floor = worldHeight(state) - 1;
      state.x = 12;
      state.y = floor - 0.85;
      state.tiles[(floor - 1) * WIDTH + 12] = 0;
      mine.tick(0.25, "down");
      expect(mine.message).toContain("Bedrock");
      expect(state.y).toBeCloseTo(floor - 0.85, 4);
      expect(mine.tile(12, floor + 1)).toBe(8);
      expect(decodeSave(JSON.stringify(state))).toEqual(state);
    }
  });

  it("rejects malformed discovery and unsupported world sizes before loading", () => {
    const state = createState();
    for (const discovered of [
      undefined,
      [],
      state.discovered.slice(1),
      state.discovered.map((value, index) => (index === 123 ? true : value)),
      state.discovered.map((value, index) => (index === 123 ? 2 : value)),
    ])
      expect(() =>
        decodeSave(JSON.stringify({ ...state, discovered })),
      ).toThrow();
    for (const version of [1, 2, 3])
      expect(() => decodeSave(JSON.stringify({ ...state, version }))).toThrow();
    const invalidHeight = {
      ...state,
      tiles: state.tiles.slice(0, WIDTH * 200),
      discovered: state.discovered.slice(0, WIDTH * 200),
    };
    invalidHeight.tiles.fill(8, WIDTH * 199);
    expect(() => decodeSave(JSON.stringify(invalidHeight))).toThrow();
  });

  it("round-trips a portable pretty-printed full-size expedition", () => {
    const state = createState();
    const portable = JSON.stringify(state, null, 2);
    expect(portable.length).toBeGreaterThan(150_000);
    expect(portable.length).toBeLessThan(256 * 1024);
    expect(decodeSave(portable)).toEqual(state);
  });
});

describe("depth creates geological and equipment progression", () => {
  it("increases realized mineral rewards, stone, and hazards across 40 generated mines", () => {
    const totals = STRATA.map(() => ({
      cells: 0,
      ore: 0,
      value: 0,
      stone: 0,
      magma: 0,
      rare: 0,
    }));
    for (let seed = 1; seed <= 40; seed++) {
      const state = createState(seed);
      for (let row = SURFACE + 1; row < HEIGHT - 1; row++) {
        const band =
          totals[STRATA.indexOf(stratumAtDepth((row - SURFACE) * 10))]!;
        for (let column = 0; column < WIDTH; column++) {
          const tile = state.tiles[row * WIDTH + column]!;
          band.cells++;
          if (tile === 2) band.stone++;
          if (tile === 7) band.magma++;
          if (tile === 6 || tile === 14) band.rare++;
          if (isOre(tile)) {
            band.ore++;
            band.value += ORES[tile].value;
          }
        }
      }
    }
    for (let index = 1; index < totals.length; index++) {
      const band = totals[index]!,
        previous = totals[index - 1]!;
      expect(band.value / band.ore).toBeGreaterThan(
        (previous.value / previous.ore) * 1.7,
      );
      expect(band.value / band.cells).toBeGreaterThan(
        (previous.value / previous.cells) * 1.5,
      );
      expect(band.stone / band.cells).toBeGreaterThan(
        previous.stone / previous.cells,
      );
      expect(band.ore / band.cells).toBeLessThan(previous.ore / previous.cells);
      if (index >= 2)
        expect(band.magma / band.cells).toBeGreaterThan(
          previous.magma / previous.cells,
        );
    }
    expect(totals.slice(0, 4).reduce((sum, band) => sum + band.rare, 0)).toBe(
      0,
    );
    const abyss = totals[5]!;
    expect(abyss.ore / abyss.cells).toBeLessThan(
      (totals[0]!.ore / totals[0]!.cells) * 0.6,
    );
    expect(abyss.rare / abyss.cells).toBeGreaterThan(0);
    expect(abyss.rare / abyss.cells).toBeLessThan(0.003);
  });

  it("lets stock equipment complete a shallow trip but needs investment for the same deep task", () => {
    const shallow = excursion(300, 0, 0);
    const deepStock = excursion(3000, 0, 0);
    const deepEquipped = excursion(3000, 3, 3);
    expect(shallow.mine.docked).toBe(true);
    expect(shallow.mine.state.mined).toBe(5);
    expect(shallow.mine.state.fuel).toBeGreaterThan(4);
    expect(deepStock.mine.state.mined).toBeGreaterThan(0); // No drill-tier lock.
    expect(deepStock.mine.state.mined).toBeLessThan(5);
    expect(deepStock.mine.state.fuel).toBe(0);
    expect(deepStock.mine.docked).toBe(false);
    expect(deepEquipped.mine.state.mined).toBe(5);
    expect(deepEquipped.mine.docked).toBe(true);
    expect(deepEquipped.mine.state.fuel).toBeGreaterThan(20);
    expect(
      deepEquipped.initialFuel - deepEquipped.mine.state.fuel,
    ).toBeGreaterThan(15);
    expect(deepEquipped.afterDescent - deepEquipped.afterCuts).toBeGreaterThan(
      5,
    );
    expect(deepEquipped.afterDescent - deepEquipped.afterCuts).toBeLessThan(6);
    for (const trip of [shallow, deepStock, deepEquipped])
      expect(trip.mine.state.hull).toBe(10); // Resource pressure, not a bad landing.
  });

  it.each([900, 1800, 3000, 5000])(
    "applies inspectable magma damage at %im and lets hull investment absorb it",
    (meters) => {
      const floor = SURFACE + meters / 10;
      for (const hullTier of [0, 3]) {
        const state = createState();
        state.x = 12;
        state.y = floor - 0.85;
        state.tiles[(floor - 1) * WIDTH + 12] = 0;
        state.tiles[floor * WIDTH + 12] = 7;
        state.upgrades.hull = hullTier;
        state.hull = maxHull(state);
        const initialHull = state.hull;
        const mine = new Mine(state);
        for (let tick = 0; tick < 120 * 12 && state.mined < 1; tick++)
          mine.tick(1 / 120, "down");
        expect(state.mined).toBe(1);
        expect(state.hull).toBe(
          Math.max(0, initialHull - magmaDamageAtDepth(meters)),
        );
        expect(mine.message).toContain(`−${magmaDamageAtDepth(meters)} hull`);
        if (hullTier > 0) expect(state.hull).toBeGreaterThan(0);
      }
    },
  );
});
