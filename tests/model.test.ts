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
  type Controls,
} from "../src/model";
const hold = (
  mine: Mine,
  direction: Direction | Controls | undefined,
  seconds: number,
) => {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++)
    mine.tick(0.05, direction);
};
function until(
  m: Mine,
  input: Direction | Controls | undefined,
  done: () => boolean,
  seconds = 10,
) {
  for (let i = 0; i < seconds * 120 && !done(); i++) m.tick(1 / 120, input);
  expect(done(), "simulation reached the requested gameplay outcome").toBe(
    true,
  );
}
describe("first playable loop", () => {
  it("mines, returns, sells, services, upgrades and restores a complete expedition", () => {
    const m = new Mine();
    until(m, "down", () => m.state.inventory.length === 4);
    expect(m.state.inventory).toEqual([3, 3, 3, 3]);
    expect(Math.round(m.state.y)).toBe(7);
    expect(m.state.fuel).toBeLessThan(100);
    expect(m.state.hull).toBeLessThan(100);
    expect(m.service("sell")).toBe(false);
    until(m, "up", () => m.docked);
    expect(m.docked).toBe(true);
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
    until(m, "up", () => m.docked);
    hold(m, undefined, 2);
    expect(m.docked).toBe(true);
    expect(m.service("sell")).toBe(true);
  });
  it("drill upgrade changes actual excavation time", () => {
    const a = new Mine(),
      b = new Mine();
    b.state.upgrades.drill = 1;
    for (let i = 0; i < 120 * 3 && b.state.mined === 0; i++) {
      a.tick(1 / 120, "down");
      b.tick(1 / 120, "down");
    }
    expect(a.state.mined).toBe(0);
    expect(b.state.mined).toBe(1);
  });
  it("blocks full cargo without deleting the mineral", () => {
    const m = new Mine();
    m.state.inventory = Array(capacity(m.state)).fill(3);
    hold(m, "down", 2);
    expect(m.state.y).toBeCloseTo(3.15, 4);
    expect(m.state.tiles[4 * WIDTH + 12]).toBe(3);
  });
  it("never drills upward, crosses walls or spends credits underground", () => {
    const m = new Mine();
    m.state.tiles[4 * WIDTH + 12] = 0;
    m.state.tiles[5 * WIDTH + 12] = 0;
    m.state.y = 5;
    m.state.tiles[4 * WIDTH + 12] = 1;
    hold(m, "up", 2);
    expect(m.state.y).toBeCloseTo(4.85, 4);
    expect(m.state.tiles[4 * WIDTH + 12]).toBe(1);
    expect(m.service("refuel")).toBe(false);
    m.state.x = 0;
    m.state.y = 5;
    m.state.tiles[5 * WIDTH] = 0;
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
    until(m, undefined, () => m.grounded);
    expect(m.state.y).toBeCloseTo(11.15, 4);
    expect(m.state.hull).toBeLessThan(100);
    const hullAfterLanding = m.state.hull;
    m.state.tiles[12 * WIDTH + 12] = 7;
    until(m, "down", () => m.state.mined === 1);
    expect(m.state.hull).toBe(hullAfterLanding - 30);
    m.state.hull = 0;
    const y = m.state.y;
    hold(m, "up", 1);
    expect(m.state.y).toBe(y);
  });
  it("rejects corrupt, future, oversized and impossible saves", () => {
    for (const patch of [
      { version: 3 },
      { money: -1 },
      { money: 1.5 },
      { fuel: 999 },
      { x: 24 },
      { tiles: [] },
      { inventory: [99] },
      { upgrades: { drill: 8 } },
      { y: -1 },
    ])
      expect(() =>
        decodeSave(JSON.stringify({ ...createState(), ...patch })),
      ).toThrow();
    expect(() => decodeSave("broken")).toThrow();
    expect(() => decodeSave("null")).toThrow();
  });
});

function chamber() {
  const m = new Mine();
  for (let y = 4; y <= 20; y++)
    for (let x = 10; x <= 13; x++) m.state.tiles[y * WIDTH + x] = 0;
  m.state.x = 12;
  m.state.y = 8;
  return m;
}
describe("flight, ledges, and drilling regression coverage", () => {
  it("accelerates continuously and decelerates instead of hopping between cells", () => {
    const m = new Mine();
    hold(m, "right", 0.1);
    expect(m.state.x).toBeGreaterThan(12);
    expect(m.state.x).toBeLessThan(12.5);
    const x = m.state.x,
      velocity = m.velocityX;
    hold(m, undefined, 0.15);
    expect(m.state.x).toBeGreaterThan(x);
    expect(m.velocityX).toBeLessThan(velocity);
    const coastingVelocity = m.velocityX;
    hold(m, undefined, 1);
    expect(m.velocityX / coastingVelocity).toBeGreaterThan(0.06);
    expect(m.velocityX / coastingVelocity).toBeLessThan(0.09);
  });
  it("retains airborne momentum longer than ground momentum after release", () => {
    const ground = new Mine(),
      air = chamber();
    ground.state.x = air.state.x = 11;
    ground.velocityX = air.velocityX = 2;
    hold(ground, undefined, 1);
    hold(air, undefined, 1);
    expect(ground.velocityX / 2).toBeGreaterThan(0.06);
    expect(ground.velocityX / 2).toBeLessThan(0.09);
    expect(air.velocityX / 2).toBeGreaterThan(0.4);
    expect(air.velocityX / 2).toBeLessThan(0.46);
    expect(air.state.x).toBeGreaterThan(ground.state.x);
  });
  it("makes heavier minerals affect ascent and steering even with equal cargo slots", () => {
    const light = chamber(),
      heavy = chamber();
    light.state.x = heavy.state.x = 11;
    light.state.inventory = Array(8).fill(3);
    heavy.state.inventory = Array(8).fill(6);
    hold(light, { up: true, right: true }, 0.4);
    hold(heavy, { up: true, right: true }, 0.4);
    expect(light.state.inventory.length).toBe(heavy.state.inventory.length);
    expect(light.state.x).toBeGreaterThan(heavy.state.x + 0.05);
    expect(light.state.y).toBeLessThan(heavy.state.y - 0.05);
    expect(heavy.velocityY).toBeLessThan(0);
  });
  it("can return with the heaviest full upgraded hold before engine upgrades exist", () => {
    const m = chamber();
    m.state.y = 15;
    m.state.upgrades.cargo = 3;
    m.state.inventory = Array(capacity(m.state)).fill(6);
    until(m, "up", () => m.docked);
    expect(m.state.inventory).toHaveLength(26);
    expect(m.state.fuel).toBeGreaterThan(0);
    expect(m.state.hull).toBe(100);
    expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
  });
  it("supports upward thrust and lateral steering in the same tick", () => {
    const m = chamber();
    hold(m, { up: true, right: true }, 0.35);
    expect(m.state.x).toBeGreaterThan(12.4);
    expect(m.state.y).toBeLessThan(7.5);
    expect(m.velocityX).toBeGreaterThan(0);
    expect(m.velocityY).toBeLessThan(0);
  });
  it("drills sideways from an intermediate ledge above a much deeper shaft", () => {
    const m = chamber();
    m.state.x = 13;
    m.state.y = 7.15;
    m.state.tiles[8 * WIDTH + 13] = 1;
    m.state.tiles[7 * WIDTH + 14] = 1;
    expect(m.grounded).toBe(true);
    until(m, "right", () => m.state.mined === 1);
    expect(m.tile(14, 7)).toBe(0);
    expect(m.state.x).toBe(14);
    expect(m.state.y).toBeCloseTo(7.15);
    expect(m.tile(12, 20)).toBe(0);
  });
  it("explains unsupported side drilling instead of repeatedly starting and resetting a cut", () => {
    const m = chamber();
    m.state.x = 13;
    hold(m, "right", 0.2);
    expect(m.state.mined).toBe(0);
    expect(m.progress).toBe(0);
    expect(m.message).toContain("needs a ledge");
    expect(m.state.y).toBeGreaterThan(8);
  });
  it.each([
    { direction: "right" as const, x: 12.8, supportX: 13, targetX: 14 },
    { direction: "left" as const, x: 11.2, supportX: 11, targetX: 10 },
  ])(
    "starts a held $direction cut after landing off-center on an intermediate ledge",
    ({ direction, x, supportX, targetX }) => {
      const m = chamber();
      m.state.x = x;
      m.state.y = 6.75;
      m.state.tiles[8 * WIDTH + supportX] = 1;
      m.state.tiles[7 * WIDTH + targetX] = 1;
      expect(m.grounded).toBe(false);
      until(m, direction, () => m.progress > 0);
      expect(m.state.y).toBeCloseTo(7.15, 4);
      expect(m.grounded).toBe(true);
      until(m, direction, () => m.state.mined === 1);
      expect(m.tile(targetX, 7)).toBe(0);
      expect(m.state.x).toBe(targetX);
      expect(m.state.y).toBeCloseTo(7.15, 4);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    },
  );
  it("finishes one selected cut on key release", () => {
    const m = chamber();
    m.state.x = 13;
    m.state.y = 7.15;
    m.state.tiles[8 * WIDTH + 13] = 1;
    m.state.tiles[7 * WIDTH + 14] = 1;
    hold(m, "right", 0.2);
    expect(m.progress).toBeGreaterThan(0);
    until(m, undefined, () => m.state.mined === 1);
    expect(m.tile(14, 7)).toBe(0);
    expect(m.state.y).toBeCloseTo(7.15);
  });
  it("finishes an active cut before thrusting without snapping back or starting another cut", () => {
    const n = new Mine();
    until(n, "down", () => n.progress >= 0.5);
    const renderedY = n.renderY;
    const savedDuringCut = decodeSave(JSON.stringify(n.state));
    expect(savedDuringCut.tiles[4 * WIDTH + 12]).toBe(3);
    expect(savedDuringCut.mined).toBe(0);
    n.tick(1 / 120, "up");
    expect(n.progress).toBeGreaterThan(0);
    expect(n.renderY).toBeGreaterThanOrEqual(renderedY);
    expect(n.renderY - renderedY).toBeLessThan(0.1);
    until(n, "up", () => n.state.mined === 1);
    expect(n.tile(12, 4)).toBe(0);
    expect(decodeSave(JSON.stringify(n.state))).toEqual(n.state);
    const completedY = n.state.y;
    hold(n, "up", 0.1);
    expect(n.velocityY).toBeLessThan(0);
    expect(n.state.y).toBeLessThan(completedY);
    expect(n.state.mined).toBe(1);
    expect(n.tile(12, 5)).toBe(3);
  });
  it.each([
    { x: 12.6, supportX: 12, emptyX: 13 },
    { x: 12.4, supportX: 13, emptyX: 12 },
  ])(
    "drills the contacted ledge under the tread at x=$x and preserves valid saves",
    ({ x, supportX, emptyX }) => {
      const m = chamber();
      m.state.x = x;
      m.state.y = 7.15;
      m.state.tiles[8 * WIDTH + supportX] = 1;
      expect(m.grounded).toBe(true);
      expect(m.tile(emptyX, 8)).toBe(0);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
      until(m, "down", () => m.progress > 0);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
      until(m, undefined, () => m.state.mined === 1);
      expect(m.tile(supportX, 8)).toBe(0);
      expect(m.tile(emptyX, 8)).toBe(0);
      expect(m.state.x).toBe(supportX);
      expect(Math.round(m.state.y)).toBe(8);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    },
  );
  it.each([
    { direction: "right" as const, y: 7.13 },
    { direction: "down" as const, y: 7.13 },
    { direction: "right" as const, y: 7.14995 },
    { direction: "down" as const, y: 7.14995 },
  ])(
    "applies landing damage before a held $direction cut at y=$y",
    ({ direction, y }) => {
      const falling = () => {
        const m = chamber();
        m.state.x = 13;
        m.state.y = y;
        m.state.tiles[8 * WIDTH + 13] = 1;
        m.state.tiles[7 * WIDTH + 14] = 1;
        m.velocityY = 10;
        return m;
      };
      const held = falling(),
        released = falling();
      held.tick(1 / 120, direction);
      released.tick(1 / 120);
      expect(released.state.hull).toBeLessThan(100);
      expect(held.state.hull).toBe(released.state.hull);
      expect(held.state.mined).toBe(0);
      expect(held.progress).toBe(0);
      expect(held.state.y).toBeCloseTo(released.state.y, 4);
      until(held, direction, () => held.progress > 0);
    },
  );
  it("chains downward cuts without waiting to settle between solid tiles", () => {
    const m = new Mine(),
      completions: number[] = [];
    for (let tick = 1; tick <= 120 * 5 && completions.length < 3; tick++) {
      const mined = m.state.mined;
      m.tick(1 / 120, "down");
      if (m.state.mined > mined) {
        completions.push(tick / 120);
        expect(m.grounded).toBe(true);
        expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
      }
    }
    expect(completions).toHaveLength(3);
    for (let i = 1; i < completions.length; i++)
      expect(completions[i] - completions[i - 1]).toBeLessThanOrEqual(
        // Depth slows successive cuts slightly, but must not add a settling pause.
        completions[0] + i * 0.02 + 2 / 120,
      );
  });
  it("falls into an open pocket after a completed downward cut", () => {
    const m = new Mine();
    for (let y = 5; y <= 8; y++) m.state.tiles[y * WIDTH + 12] = 0;
    until(m, "down", () => m.state.mined === 1);
    const y = m.state.y;
    expect(m.grounded).toBe(false);
    hold(m, undefined, 0.2);
    expect(m.state.y).toBeGreaterThan(y);
    expect(m.velocityY).toBeGreaterThan(0);
    expect(m.state.mined).toBe(1);
    expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
  });
  it("brakes a fall with thrust without applying landing damage in midair", () => {
    const m = chamber();
    hold(m, undefined, 0.4);
    hold(m, "up", 0.6);
    expect(m.velocityY).toBeLessThan(0);
    expect(m.state.hull).toBe(100);
  });
  it("has equivalent motion at 30 and 120 simulation updates per second", () => {
    const a = chamber(),
      b = chamber();
    for (let i = 0; i < 30; i++) a.tick(1 / 30, { up: true, left: true });
    for (let i = 0; i < 120; i++) b.tick(1 / 120, { up: true, left: true });
    expect(a.state.x).toBeCloseTo(b.state.x, 6);
    expect(a.state.y).toBeCloseTo(b.state.y, 6);
    expect(a.state.fuel).toBeCloseTo(b.state.fuel, 6);
  });
  it("migrates old integer-position saves without losing terrain, money or upgrades", () => {
    const legacy = {
      ...createState(),
      version: 1,
      money: 345,
      upgrades: { drill: 1, tank: 1, hull: 0, cargo: 0 },
    };
    legacy.tiles[4 * WIDTH + 12] = 0;
    const loaded = decodeSave(JSON.stringify(legacy));
    expect(loaded).toEqual({ ...legacy, version: 2 });
  });
  it("round-trips fractional position and rejects a hull overlapping an adjacent solid cell", () => {
    const m = chamber();
    hold(m, { up: true, right: true }, 0.25);
    expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    const bad = createState();
    bad.y = 3.4;
    expect(() => decodeSave(JSON.stringify(bad))).toThrow(/overlaps/);
  });
  it("saves at the world boundary and holds position when disabled", () => {
    const m = new Mine();
    hold(m, "left", 10);
    expect(m.state.x).toBe(0);
    expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    m.state.fuel = 0;
    const before = JSON.stringify(m.state);
    hold(m, { up: true, right: true }, 1);
    expect(JSON.stringify(m.state)).toBe(before);
  });
});
