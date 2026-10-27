import { describe, it, expect } from "vitest";
import {
  Mine,
  createState,
  decodeSave,
  SURFACE,
  WIDTH,
  HEIGHT,
  ORES,
  UPGRADE_KEYS,
  STATIONS,
  nearbyStation,
  stationForAction,
  type StationId,
  type ServiceAction,
  UPGRADE_LEVELS,
  upgradeCost,
  isOre,
  cargoMass,
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
function park(m: Mine, stationId: StationId) {
  const station = STATIONS.find((entry) => entry.id === stationId)!;
  m.state.x = station.center;
  m.state.y = SURFACE + 0.15;
  m.velocityX = m.velocityY = 0;
}
function driveToX(m: Mine, x: number) {
  for (let tick = 0; tick < 120 * 20; tick++) {
    if (
      m.state.y >= SURFACE - 0.05 &&
      m.docked &&
      Math.abs(m.state.x - x) < 0.1 &&
      Math.abs(m.velocityX) < 0.3
    )
      return;
    const correction = (x - m.state.x) * 6 - m.velocityX * 2;
    m.tick(
      1 / 120,
      correction > 0.15 ? "right" : correction < -0.15 ? "left" : undefined,
    );
  }
  expect(Math.abs(m.state.x - x)).toBeLessThan(0.1);
}
function driveTo(m: Mine, stationId: StationId) {
  const station = STATIONS.find((entry) => entry.id === stationId)!;
  driveToX(m, station.center);
  expect(nearbyStation(m.state)?.id).toBe(stationId);
}
describe("first playable loop", () => {
  it("funds a real upgrade through two mining trips and restores the full expedition", () => {
    const m = new Mine();
    expect([
      m.state.money,
      m.state.fuel,
      m.state.hull,
      capacity(m.state),
    ]).toEqual([20, 6, 10, 7]);
    for (let trip = 0; trip < 2; trip++) {
      if (trip) {
        driveToX(m, 13);
      }
      until(
        m,
        "down",
        () => m.state.inventory.length === capacity(m.state),
        20,
      );
      expect(m.state.fuel).toBeGreaterThan(0);
      expect(m.state.hull).toBe(10); // Ordinary soil drilling does not damage the hull.
      expect(m.service("sell")).toBe(false);
      until(m, "up", () => m.docked);
      driveTo(m, "exchange");
      expect(m.service("sell")).toBe(true);
      driveTo(m, "fuel");
      expect(m.service("refuel")).toBe(true);
      expect(m.state.fuel).toBe(10);
    }
    expect(m.state.money).toBeGreaterThanOrEqual(750);
    driveTo(m, "upgrades");
    expect(m.service("drill")).toBe(true);
    expect(m.state.upgrades.drill).toBe(1);
    expect(m.state.money).toBeGreaterThan(100);
    const restored = decodeSave(JSON.stringify(m.state));
    expect(restored).toEqual(m.state);
    expect(restored.tiles[10 * WIDTH + 12]).toBe(0);
    expect(restored.tiles[10 * WIDTH + 13]).toBe(0);
    expect(restored.inventory).toEqual([]);
  });
  it("stays docked over a mined shaft when thrust is released", () => {
    const m = new Mine();
    hold(m, "down", 1.4);
    until(m, "up", () => m.docked);
    hold(m, undefined, 2);
    expect(m.docked).toBe(true);
    driveTo(m, "exchange");
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
  it("keeps a full bay intact while excavating and discarding excess ore", () => {
    const m = new Mine();
    m.state.inventory = Array(capacity(m.state)).fill(3);
    until(m, "down", () => m.state.mined === 1);
    expect(m.state.y).toBeCloseTo(4.15, 4);
    expect(m.state.tiles[4 * WIDTH + 12]).toBe(0);
    expect(m.state.inventory).toEqual(Array(7).fill(3));
    expect(m.state.money).toBe(20);
    expect(m.message).toContain("Cargo full: Ironium discarded");
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
    expect(m.state.money).toBe(16);
    expect(m.state.fuel).toBe(5);
  });
  it("charges for partial service, refuses unaffordable upgrades and caps levels", () => {
    const m = new Mine();
    park(m, "fuel");
    m.state.fuel = 0;
    m.state.money = 3;
    expect(m.service("refuel")).toBe(true);
    expect(m.state.fuel).toBe(3);
    expect(m.state.money).toBe(0);
    park(m, "upgrades");
    expect(m.service("drill")).toBe(false);
    m.state.money = 3000;
    for (const key of ["tank", "cargo", "hull"] as const)
      expect(m.service(key)).toBe(true);
    expect(maxFuel(m.state)).toBe(15);
    expect(maxHull(m.state)).toBe(17);
    expect(capacity(m.state)).toBe(15);
    m.state.upgrades.drill = 6;
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
    expect(m.state.hull).toBeLessThan(10);
    const hullAfterLanding = m.state.hull;
    m.state.tiles[12 * WIDTH + 12] = 7;
    until(m, "down", () => m.state.mined === 1);
    expect(m.state.hull).toBe(hullAfterLanding - 3);
    m.state.hull = 0;
    const y = m.state.y;
    hold(m, "up", 1);
    expect(m.state.y).toBe(y);
  });
  it("rejects corrupt, future, oversized and impossible saves", () => {
    for (const patch of [
      { version: 4 },
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

// Reach an earlier shelf through real input, after filling the stock bay and
// proving that the deeper dirt remains drillable. No position is teleported.
function returnToOreShelf(cargoTier = 0) {
  const m = new Mine(createState(73021));
  m.state.fuel = 10;
  m.state.upgrades.cargo = cargoTier;
  for (let y = SURFACE + 1; y < HEIGHT - 1; y++)
    for (let x = 0; x < WIDTH; x++) m.state.tiles[y * WIDTH + x] = 1;
  for (let y = 4; y <= 7; y++)
    for (let x = 10; x <= 15; x++) m.state.tiles[y * WIDTH + x] = 0;
  for (let y = 8; y <= 14; y++) m.state.tiles[y * WIDTH + 12] = 3;
  m.state.tiles[8 * WIDTH + 13] = 3;
  until(m, "down", () => m.state.mined === 8, 20);
  expect(m.state.inventory).toHaveLength(7);
  expect(m.state.y).toBeCloseTo(15.15);
  expect(m.tile(12, 15)).toBe(0);
  until(m, "up", () => m.state.y <= 6.5);
  for (let tick = 0; tick < 8 * 120; tick++) {
    const correction = (13 - m.state.x) * 6 - m.velocityX * 2;
    m.tick(
      1 / 120,
      correction > 0.15 ? "right" : correction < -0.15 ? "left" : undefined,
    );
    if (
      m.grounded &&
      Math.abs(m.state.x - 13) < 0.04 &&
      Math.abs(m.velocityX) < 0.1
    )
      break;
  }
  expect(m.grounded).toBe(true);
  expect(m.velocityY).toBe(0);
  expect(m.state.x).toBeCloseTo(13, 1);
  expect(m.state.y).toBeCloseTo(7.15, 4);
  expect(m.state.deepest).toBe(120);
  return m;
}

describe("returning to a shallower ledge", () => {
  it.each([
    { cargoTier: 0, expectedCargo: 7, discarded: true },
    { cargoTier: 1, expectedCargo: 8, discarded: false },
  ])(
    "deploys Down after a full descent/ascent with cargo tier $cargoTier",
    ({ cargoTier, expectedCargo, discarded }) => {
      const m = returnToOreShelf(cargoTier);
      const money = m.state.money,
        fuel = m.state.fuel;
      until(m, "down", () => m.state.mined === 9, 2);
      expect(m.tile(13, 8)).toBe(0);
      expect(m.state.inventory).toHaveLength(expectedCargo);
      expect(m.state.inventory.length).toBeLessThanOrEqual(capacity(m.state));
      expect(m.state.money).toBe(money);
      expect(m.state.fuel).toBeLessThan(fuel);
      expect(m.state.deepest).toBe(120);
      expect(m.state.y).toBeCloseTo(8.15);
      expect(m.message.includes("discarded")).toBe(discarded);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    },
  );

  it.each(["left", "right"] as const)(
    "honors Down while holding %s to align on a returned-to shelf",
    (direction) => {
      const m = returnToOreShelf(1);
      m.tick(1 / 120, { down: true, [direction]: true });
      expect(m.progress).toBeGreaterThan(0);
      expect(m.drillDirection).toBe("down");
      expect(m.drillTarget).toEqual({ x: 13, y: 8 });
      until(m, undefined, () => m.state.mined === 9, 2);
      expect(m.tile(13, 8)).toBe(0);
      expect(m.state.inventory).toHaveLength(8);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    },
  );

  it("keeps horizontal steering while holding Down above a ledge", () => {
    const m = chamber();
    m.state.y = 6;
    m.state.tiles[8 * WIDTH + 13] = 1;
    hold(m, { down: true, right: true }, 0.1);
    expect(m.state.x).toBeGreaterThan(12);
    expect(m.state.y).toBeGreaterThan(6);
    expect(m.progress).toBe(0);
    expect(m.state.mined).toBe(0);
  });

  it("cuts an ore wall with a full bay without creating cargo or credits", () => {
    const m = chamber();
    m.state.x = 13;
    m.state.y = 7.15;
    m.state.inventory = Array(capacity(m.state)).fill(3);
    m.state.tiles[8 * WIDTH + 13] = 1;
    m.state.tiles[7 * WIDTH + 14] = 6;
    const inventory = [...m.state.inventory],
      money = m.state.money;
    until(m, "right", () => m.state.mined === 1, 2);
    expect(m.tile(14, 7)).toBe(0);
    expect(m.state.inventory).toEqual(inventory);
    expect(m.state.money).toBe(money);
    expect(m.message).toContain("Diamond discarded");
    expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
  });
});

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
    light.state.inventory = Array(7).fill(3);
    heavy.state.inventory = Array(7).fill(6);
    hold(light, { up: true, right: true }, 0.4);
    hold(heavy, { up: true, right: true }, 0.4);
    expect(light.state.inventory.length).toBe(heavy.state.inventory.length);
    expect(light.state.x).toBeGreaterThan(heavy.state.x + 0.05);
    expect(light.state.y).toBeLessThan(heavy.state.y - 0.05);
    expect(heavy.velocityY).toBeLessThan(0);
  });
  it("can return with a full largest bay of heavy ore without stranding existing saves", () => {
    const m = chamber();
    m.state.y = 15;
    m.state.upgrades.cargo = 5;
    m.state.inventory = Array(capacity(m.state)).fill(14);
    until(m, "up", () => m.docked);
    expect(m.state.inventory).toHaveLength(120);
    expect(m.state.fuel).toBeGreaterThan(0);
    expect(m.state.hull).toBe(10);
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
      expect(released.state.hull).toBeLessThan(10);
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
    expect(m.state.hull).toBe(10);
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
  it.each([1, 2])(
    "migrates schema %i without losing excavations, cargo or equipment capability",
    (version) => {
      const legacy = {
        ...createState(),
        version,
        money: 345,
        fuel: 75,
        hull: 80,
        inventory: Array(8).fill(3),
        upgrades: { drill: 1, tank: 1, hull: 2, cargo: 0 },
      };
      legacy.tiles = legacy.tiles.map((tile) => (tile > 8 ? 1 : tile));
      legacy.tiles[4 * WIDTH + 12] = 0;
      const loaded = decodeSave(JSON.stringify(legacy));
      expect(loaded.version).toBe(3);
      expect(loaded.tiles).toEqual(legacy.tiles);
      expect(loaded.inventory).toEqual(legacy.inventory);
      expect(loaded.money).toBe(345);
      expect([loaded.x, loaded.y]).toEqual([legacy.x, legacy.y]);
      expect(loaded.upgrades).toEqual({
        drill: 2,
        tank: 1,
        hull: 2,
        cargo: 1,
        engine: 0,
      });
      expect(loaded.fuel / maxFuel(loaded)).toBeCloseTo(75 / 150);
      expect(loaded.hull / maxHull(loaded)).toBeCloseTo(80 / 180);
      expect(capacity(loaded)).toBeGreaterThanOrEqual(8);
      expect(decodeSave(JSON.stringify(loaded))).toEqual(loaded);
    },
  );
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

describe("caves and reference progression", () => {
  it.each([1, 2, 42, 73021, 123456])(
    "creates reproducible chambers, ledges and every mineral at valid depths for seed %i",
    (seed) => {
      const s = createState(seed),
        underground = s.tiles.slice(4 * WIDTH, -WIDTH);
      const emptyFraction =
        underground.filter((tile) => tile === 0).length / underground.length;
      expect(emptyFraction).toBeGreaterThan(0.15);
      expect(emptyFraction).toBeLessThan(0.45);
      expect(createState(seed).tiles).toEqual(s.tiles);
      expect(s.tiles.slice(-WIDTH)).toEqual(Array(WIDTH).fill(8));
      const minimumRows: Record<number, number> = {
        3: 4,
        9: 5,
        10: 8,
        4: 14,
        11: 24,
        12: 36,
        5: 48,
        13: 62,
        6: 76,
        14: 88,
        7: 52,
      };
      for (const ore of Object.keys(ORES).map(Number))
        expect(underground).toContain(ore);
      for (let index = 4 * WIDTH; index < WIDTH * (HEIGHT - 1); index++) {
        const tile = s.tiles[index];
        if (minimumRows[tile])
          expect(Math.floor(index / WIDTH)).toBeGreaterThanOrEqual(
            minimumRows[tile],
          );
      }
      // At least one roomy chamber has a floor: flight and landing are useful.
      let chamberFloor = false;
      for (let y = 5; y < HEIGHT - 2; y++)
        for (let x = 1; x < WIDTH - 2; x++) {
          const at = (dx: number, dy: number) =>
            s.tiles[(y + dy) * WIDTH + x + dx];
          if (
            at(0, 0) === 0 &&
            at(1, 0) === 0 &&
            at(0, -1) === 0 &&
            at(1, -1) === 0 &&
            at(0, 1) !== 0
          )
            chamberFloor = true;
        }
      expect(chamberFloor).toBe(true);
    },
  );

  it("uses the verified prices, capacities and values rather than the shortened prototype economy", () => {
    const m = new Mine();
    expect(
      Object.values(ORES)
        .map((ore) => ore.value)
        .sort((a, b) => a - b),
    ).toEqual([30, 60, 100, 250, 750, 2000, 5000, 20000, 100000, 500000]);
    for (const key of UPGRADE_KEYS) expect(upgradeCost(m.state, key)).toBe(750);
    m.state.upgrades = { drill: 6, tank: 6, hull: 6, cargo: 5, engine: 6 };
    expect([maxFuel(m.state), maxHull(m.state), capacity(m.state)]).toEqual([
      150, 180, 120,
    ]);
    for (const key of UPGRADE_KEYS)
      expect(upgradeCost(m.state, key)).toBe(Infinity);
  });

  it("collects all ten mineral identifiers and separates mass, slots and sale value", () => {
    for (const ore of Object.keys(ORES).map(Number)) {
      expect(isOre(ore)).toBe(true);
      const m = new Mine();
      m.state.tiles[4 * WIDTH + 12] = ore;
      until(m, "down", () => m.state.mined === 1);
      expect(m.state.inventory).toEqual([ore]);
      expect(cargoValue(m.state)).toBe(ORES[ore as keyof typeof ORES].value);
      expect(cargoMass(m.state)).toBe(ORES[ore as keyof typeof ORES].mass);
      expect(decodeSave(JSON.stringify(m.state))).toEqual(m.state);
    }
    expect(isOre("3")).toBe(false);
    expect(isOre("__proto__")).toBe(false);
  });

  it("engine upgrades increase steering and lift while using more fuel", () => {
    const stock = chamber(),
      upgraded = chamber();
    stock.state.y = upgraded.state.y = 15;
    stock.state.x = upgraded.state.x = 11;
    upgraded.state.upgrades.engine = 6;
    hold(stock, { up: true, right: true }, 0.4);
    hold(upgraded, { up: true, right: true }, 0.4);
    expect(upgraded.state.x).toBeGreaterThan(stock.state.x + 0.15);
    expect(upgraded.state.y).toBeLessThan(stock.state.y - 0.15);
    expect(upgraded.state.fuel).toBeLessThan(stock.state.fuel);
    expect((6 - upgraded.state.fuel) / (6 - stock.state.fuel)).toBeCloseTo(
      1.4,
      6,
    );
  });

  it("uses time-based liters with no fuel charge for docked idle and no soil hull wear", () => {
    const parked = new Mine();
    hold(parked, undefined, 10);
    expect(parked.state.fuel).toBe(6);
    const idle = chamber();
    idle.state.y = 12;
    hold(idle, undefined, 1);
    expect(6 - idle.state.fuel).toBeCloseTo(0.063, 6);
    const thrust = chamber();
    thrust.state.y = 15;
    hold(thrust, "up", 1);
    expect(6 - thrust.state.fuel).toBeCloseTo(0.189, 6);
    const drill = new Mine();
    until(drill, "down", () => drill.state.mined === 1);
    expect(6 - drill.state.fuel).toBeGreaterThan(0.2);
    expect(6 - drill.state.fuel).toBeLessThan(0.5);
    expect(drill.state.hull).toBe(10);
    const exhausted = chamber();
    exhausted.state.fuel = 0.000001;
    const position = [exhausted.state.x, exhausted.state.y];
    exhausted.tick(1 / 120, { up: true, right: true });
    expect(exhausted.state.fuel).toBe(0);
    expect([exhausted.state.x, exhausted.state.y]).toEqual(position);
  });

  it("allows fractional repairs with a small balance and charges the original rate", () => {
    const m = new Mine();
    park(m, "repair");
    m.state.hull = 4.25;
    m.state.money = 5;
    expect(m.service("repair")).toBe(true);
    expect(m.state.hull).toBeCloseTo(4.25 + 5 / 15);
    expect(m.state.money).toBe(0);
    m.state.money = 100;
    expect(m.service("repair")).toBe(true);
    expect(m.state.hull).toBe(10);
    expect(m.state.money).toBe(18);
    expect(m.service("constructor" as "engine")).toBe(false);
  });
});

describe("progression save migration and validation", () => {
  it("retains a full legacy bay, all upgrade benefits and condition fractions", () => {
    const legacy = {
      ...createState(),
      version: 2,
      fuel: 200,
      hull: 110,
      money: 1500,
      inventory: Array(26).fill(6),
      upgrades: { drill: 3, tank: 3, hull: 3, cargo: 3 },
    };
    legacy.tiles = legacy.tiles.map((tile) => (tile > 8 ? 1 : tile));
    legacy.tiles[4 * WIDTH + 12] = 0;
    const loaded = decodeSave(JSON.stringify(legacy));
    expect(loaded.upgrades).toEqual({
      drill: 4,
      tank: 2,
      hull: 2,
      cargo: 3,
      engine: 0,
    });
    expect(loaded.inventory).toEqual(legacy.inventory);
    expect(loaded.tiles).toEqual(legacy.tiles);
    expect(loaded.fuel).toBe(20);
    expect(loaded.hull).toBe(15);
    expect(loaded.money).toBe(1500);
    expect(
      UPGRADE_LEVELS.drill[loaded.upgrades.drill] / 2,
    ).toBeGreaterThanOrEqual(2.65);
  });

  it("rejects malformed new and legacy saves before modifying their representation", () => {
    const base = createState();
    for (const patch of [
      { upgrades: { drill: 0, tank: 0, hull: 0, cargo: 0 } },
      { upgrades: { ...base.upgrades, engine: 7 } },
      { upgrades: { ...base.upgrades, cargo: 6 } },
      { inventory: Array(8).fill(3) },
      { inventory: ["3"] },
      { tiles: base.tiles.map((tile, i) => (i === WIDTH * 10 ? 15 : tile)) },
      { version: 2 }, // A legacy map cannot contain newly introduced identifiers.
    ])
      expect(() => decodeSave(JSON.stringify({ ...base, ...patch }))).toThrow();
    expect(() => decodeSave(" ".repeat(150001))).toThrow();
    expect(() =>
      decodeSave('{"version":3,"upgrades":{"__proto__":{"engine":0}}}'),
    ).toThrow();
    expect(decodeSave(JSON.stringify(base))).toEqual(base);
  });
});

describe("physical surface stations", () => {
  it.each(STATIONS)(
    "recognizes the $id bay and rejects air, depth and distance",
    (station) => {
      const position = { x: station.center, y: SURFACE + 0.15 };
      expect(nearbyStation(position)?.id).toBe(station.id);
      expect(nearbyStation({ ...position, x: station.center - 1 })?.id).toBe(
        station.id,
      );
      expect(nearbyStation({ ...position, x: station.center + 1 })?.id).toBe(
        station.id,
      );
      expect(
        nearbyStation({ ...position, x: station.center + 1.001 }),
      ).toBeUndefined();
      expect(nearbyStation({ ...position, y: SURFACE - 0.1 })).toBeUndefined();
      expect(nearbyStation({ ...position, y: SURFACE + 0.2 })).toBeUndefined();
      expect(nearbyStation({ ...position, y: SURFACE + 4 })).toBeUndefined();
      expect(nearbyStation({ ...position, y: NaN })).toBeUndefined();
    },
  );

  it.each(STATIONS)(
    "only performs services assigned to the $id building",
    (station) => {
      const actions: ServiceAction[] = [
        "sell",
        "refuel",
        "repair",
        ...UPGRADE_KEYS,
      ];
      for (const action of actions) {
        const m = new Mine();
        park(m, station.id);
        m.state.money = 10000;
        m.state.inventory = [3, 9, 10];
        m.state.fuel = 4;
        m.state.hull = 5;
        const before = structuredClone(m.state);
        const allowed = stationForAction(action) === station.id;
        expect(m.service(action)).toBe(allowed);
        if (allowed) expect(m.state).not.toEqual(before);
        else {
          expect(m.state).toEqual(before);
          for (let repeat = 0; repeat < 3; repeat++)
            expect(m.service(action)).toBe(false);
          expect(m.state).toEqual(before);
          expect(m.message).toContain("Park at");
        }
      }
    },
  );

  it("does not sell, refill, repair or upgrade from a remote surface or underground position", () => {
    const actions: ServiceAction[] = [
      "sell",
      "refuel",
      "repair",
      ...UPGRADE_KEYS,
    ];
    for (const position of [
      { x: 12, y: SURFACE },
      { x: 2, y: 1 },
      { x: 7, y: 4 },
      { x: 16, y: 4 },
      { x: 21, y: 4 },
    ]) {
      const m = new Mine();
      Object.assign(m.state, position, {
        money: 10000,
        fuel: 4,
        hull: 5,
        inventory: [3, 9, 10],
      });
      const before = structuredClone(m.state);
      for (const action of actions) expect(m.service(action)).toBe(false);
      expect(m.state).toEqual(before);
    }
  });

  it("maps every action to its physical building and rejects unknown actions", () => {
    expect(stationForAction("sell")).toBe("exchange");
    expect(stationForAction("refuel")).toBe("fuel");
    expect(stationForAction("repair")).toBe("repair");
    for (const action of UPGRADE_KEYS)
      expect(stationForAction(action)).toBe("upgrades");
    expect(stationForAction("constructor" as ServiceAction)).toBeUndefined();
    expect(STATIONS.map((station) => station.center)).toEqual([2, 7, 16, 21]);
  });
});
