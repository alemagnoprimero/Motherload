import { describe, expect, it } from "vitest";
import { createW01 } from "../src/campaign/world";
import { W01, W01_ORES } from "../src/campaign/config";

describe("W01 mission-first generation", () => {
  it("repeats an exact world for a seed while changing layout for another", () => {
    const world = createW01(739);
    expect(createW01(739)).toEqual(world);
    expect(createW01(740).tiles).not.toEqual(world.tiles);
    expect(createW01(740).packages).not.toEqual(world.packages);
  });

  it("retains the two assisted opening hauls without relying on relics", () => {
    for (const [column, value] of [
      [20, 3800],
      [21, 4800],
    ]) {
      const seam = createW01(18).packages.filter(
        (item) => Math.floor(item.x) === column && item.y < 7,
      );
      expect(seam).toHaveLength(7);
      expect(seam.reduce((total, item) => total + item.value, 0)).toBe(value);
    }
  });

  it("keeps mission sources, ordinary budgets and safe entry routes across 100 seeds", () => {
    const required = [
      ["W01-VALVE", 20, 24],
      ["W01-ANTENNA", 21, 39],
      ["W01-Q", 20, 59],
    ] as const;
    for (let seed = 1; seed <= 100; seed++) {
      const world = createW01(seed);
      const ordinary = world.packages.filter((item) =>
        item.tags.includes("ordinary"),
      );
      expect(
        ordinary.reduce((total, item) => total + item.value, 0),
      ).toBeGreaterThanOrEqual(W01.minOrdinary);
      const bands = [
        { start: 0, end: 10, fraction: 0.25 },
        { start: 10, end: 40, fraction: 0.35 },
        { start: 40, end: 60, fraction: 0.4 },
      ];
      for (const { start, end, fraction } of bands)
        expect(
          ordinary
            .filter((item) => item.y >= start && item.y < end)
            .reduce((total, item) => total + item.value, 0),
        ).toBeGreaterThanOrEqual(W01.budget * fraction);
      const uniqueIds = new Set(world.packages.map((item) => item.id));
      const uniqueLocations = new Set(
        world.packages.map((item) => `${item.x},${item.y}`),
      );
      expect(uniqueIds.size).toBe(world.packages.length);
      expect(uniqueLocations.size).toBe(world.packages.length);
      for (const item of world.packages) {
        expect(
          world.tiles[Math.floor(item.y) * world.width + Math.floor(item.x)],
        ).toBeGreaterThan(0);
        expect(item.status).toBe("deposit");
        expect(item.origin).toBe("W01");
      }
      for (const [id, column, row] of required) {
        expect(
          world.missions.find((mission) => mission.id === id),
        ).toMatchObject({ x: column + 0.5, y: row + 0.5, status: "source" });
        expect(world.tiles[row * world.width + column]).toBe(1);
        expect(
          world.packages.some(
            (item) =>
              Math.floor(item.x) === column && Math.floor(item.y) === row,
          ),
        ).toBe(false);
      }
      for (let row = 0; row < world.rows; row++)
        expect(world.tiles[row * world.width + 20]).toBe(
          row === 30 || row === 31 ? 4 : 1,
        );
      expect(
        world.shelves.every(
          (shelf) => shelf.y > 10 && (shelf.x < 18 || shelf.x > 24),
        ),
      ).toBe(true);
      expect(world.discovered.every((known) => known === 0)).toBe(true);
      for (const ore of W01_ORES)
        expect(
          ordinary.filter((item) => item.itemId === ore.id).length /
            ordinary.length,
        ).toBeCloseTo(ore.weight / 100, 10);
      expect(
        world.packages.filter((item) => item.tags.includes("relic")).length,
      ).toBe(1);
    }
  });

  it("provides cave ledges and optional two-stage shelf teaching geometry", () => {
    const world = createW01(27);
    expect(world.tiles.filter((tile) => tile === 0).length).toBeGreaterThan(50);
    for (const shelf of world.shelves) {
      const column = Math.floor(shelf.x),
        row = Math.floor(shelf.y);
      expect(world.tiles[row * world.width + column]).toBe(1);
      expect(world.tiles[(row + 1) * world.width + column]).toBe(0);
      expect(world.tiles[(row + 2) * world.width + column]).toBe(1);
      expect(shelf.warning).toBeNull();
      expect(shelf.collapsed).toBe(false);
    }
  });
});
