import { describe, it, expect } from "vitest";
import {
  Mine,
  createState,
  decodeSave,
  SURFACE,
  WIDTH,
  capacity,
  maxFuel,
  maxHull,
  cargoValue,
  type Direction,
} from "../src/model";
const hold = (
  mine: Mine,
  direction: Direction | undefined,
  seconds: number,
) => {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++)
    mine.tick(0.05, direction);
};
describe("first playable loop", () => {
  it("mines, returns, sells, services, upgrades and restores a complete expedition", () => {
    const m = new Mine();
    hold(m, "down", 2.8);
    expect(m.state.inventory).toEqual([3, 3, 3, 3]);
    expect(m.state.y).toBe(7);
    expect(m.state.fuel).toBeLessThan(100);
    expect(m.state.hull).toBeLessThan(100);
    expect(m.service("sell")).toBe(false);
    hold(m, "up", 1);
    expect(m.state.y).toBe(SURFACE);
    expect(cargoValue(m.state)).toBe(100);
    expect(m.service("sell")).toBe(true);
    expect(m.state.money).toBe(160);
    expect(m.service("refuel")).toBe(true);
    expect(m.state.fuel).toBe(100);
    expect(m.service("repair")).toBe(true);
    expect(m.state.hull).toBe(100);
    expect(m.service("drill")).toBe(true);
    expect(m.state.upgrades.drill).toBe(1);
    const restored = decodeSave(JSON.stringify(m.state));
    expect(restored).toEqual(m.state);
    expect(restored.tiles[7 * WIDTH + 12]).toBe(0);
    expect(restored.inventory).toEqual([]);
  });
  it("stays docked over a mined shaft when thrust is released", () => {
    const m = new Mine();
    hold(m, "down", 1.4);
    hold(m, "up", 1);
    hold(m, undefined, 2);
    expect(m.docked).toBe(true);
    expect(m.service("sell")).toBe(true);
  });
  it("drill upgrade changes actual excavation time", () => {
    const a = new Mine(),
      b = new Mine();
    b.state.upgrades.drill = 1;
    hold(a, "down", 0.5);
    hold(b, "down", 0.5);
    expect(a.state.y).toBe(3);
    expect(b.state.y).toBe(4);
  });
  it("blocks full cargo without deleting the mineral", () => {
    const m = new Mine();
    m.state.inventory = Array(capacity(m.state)).fill(3);
    hold(m, "down", 2);
    expect(m.state.y).toBe(3);
    expect(m.state.tiles[4 * WIDTH + 12]).toBe(3);
  });
  it("never drills upward, crosses walls or spends credits underground", () => {
    const m = new Mine();
    m.state.tiles[4 * WIDTH + 12] = 0;
    m.state.tiles[5 * WIDTH + 12] = 0;
    m.state.y = 5;
    m.state.tiles[4 * WIDTH + 12] = 1;
    hold(m, "up", 2);
    expect(m.state.y).toBe(5);
    expect(m.service("refuel")).toBe(false);
    m.state.x = 0;
    hold(m, "left", 2);
    expect(m.state.x).toBe(0);
  });
  it("handles empty fuel and recovery without trapping the player", () => {
    const m = new Mine();
    hold(m, "down", 1);
    m.state.fuel = 0;
    const y = m.state.y;
    hold(m, "up", 1);
    expect(m.state.y).toBe(y);
    m.recover();
    expect(m.state.y).toBe(SURFACE);
    expect(m.state.inventory).toEqual([]);
    expect(m.state.money).toBe(48);
    expect(m.state.fuel).toBe(50);
  });
  it("charges for partial service, refuses unaffordable upgrades and caps levels", () => {
    const m = new Mine();
    m.state.fuel = 0;
    m.state.money = 3;
    expect(m.service("refuel")).toBe(true);
    expect(m.state.fuel).toBe(3);
    expect(m.state.money).toBe(0);
    expect(m.service("drill")).toBe(false);
    m.state.money = 2000;
    for (const key of ["tank", "cargo", "hull"] as const)
      expect(m.service(key)).toBe(true);
    expect(maxFuel(m.state)).toBe(150);
    expect(maxHull(m.state)).toBe(140);
    expect(capacity(m.state)).toBe(14);
    m.state.upgrades.drill = 3;
    expect(m.service("drill")).toBe(false);
  });
  it("restores a loaded inventory, damaged hull, fuel, money, upgrades and excavated terrain", () => {
    const m = new Mine();
    hold(m, "down", 1.5);
    m.state.upgrades.cargo = 2;
    m.state.money = 1234;
    expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
  });
  it("generates repeatable terrain and a finite bedrock floor", () => {
    expect(createState(42).tiles).toEqual(createState(42).tiles);
    expect(createState(43).tiles).not.toEqual(createState(42).tiles);
    expect(createState().tiles.slice(-WIDTH)).toEqual(Array(WIDTH).fill(8));
  });
  it("damages hull on a hard fall and magma; destroyed rigs cannot move", () => {
    const m = new Mine();
    m.state.y = 4;
    for (let y = 4; y <= 11; y++) m.state.tiles[y * WIDTH + 12] = 0;
    hold(m, undefined, 2);
    expect(m.state.y).toBe(11);
    expect(m.state.hull).toBe(80);
    m.state.tiles[12 * WIDTH + 12] = 7;
    hold(m, "down", 0.7);
    expect(m.state.hull).toBe(50);
    m.state.hull = 0;
    const y = m.state.y;
    hold(m, "up", 1);
    expect(m.state.y).toBe(y);
  });
  it("rejects corrupt, future, oversized and impossible saves", () => {
    for (const patch of [
      { version: 2 },
      { money: -1 },
      { money: 1.5 },
      { fuel: 999 },
      { x: 24 },
      { tiles: [] },
      { inventory: [99] },
      { upgrades: { drill: 8 } },
      { y: 0 },
    ])
      expect(() =>
        decodeSave(JSON.stringify({ ...createState(), ...patch })),
      ).toThrow();
    expect(() => decodeSave("broken")).toThrow();
    expect(() => decodeSave("null")).toThrow();
  });
});
