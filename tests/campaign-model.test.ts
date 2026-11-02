import { describe, expect, it } from "vitest";
import {
  Campaign,
  campaignDelta,
  createCampaign,
  decodeCampaign,
} from "../src/campaign/model";
import { W01 } from "../src/campaign/config";
import type { CampaignControls } from "../src/campaign/types";

const dt = 1 / 60;
function advance(game: Campaign, controls: CampaignControls, seconds: number) {
  for (let tick = 0; tick < seconds / dt; tick++) game.tick(dt, controls);
}
function until(
  game: Campaign,
  controls: CampaignControls,
  predicate: () => boolean,
  seconds = 60,
) {
  for (let tick = 0; tick < seconds / dt && !predicate(); tick++)
    game.tick(dt, controls);
  expect(
    predicate(),
    `condition failed: ${game.message}; position ${JSON.stringify(game.state.vehicle)}`,
  ).toBe(true);
}
function drive(game: Campaign, x: number) {
  for (let tick = 0; tick < 60 * 15; tick++) {
    const delta = campaignDelta(game.state.vehicle.x, x);
    if (
      Math.abs(delta) < 0.08 &&
      Math.abs(game.velocityX) < 0.4 &&
      Math.abs(game.state.vehicle.y + 0.36) < 0.001
    )
      return;
    const desired = Math.max(-4, Math.min(4, delta * 3));
    const direction = desired - game.velocityX;
    game.tick(dt, { left: direction < -0.15, right: direction > 0.15 });
  }
  throw new Error(
    `Cannot drive to ${x}: ${JSON.stringify(game.state.vehicle)}`,
  );
}
function dock(game: Campaign) {
  until(game, { up: true }, () => game.state.vehicle.y <= -0.36, 30);
  drive(game, W01.dockX);
  expect(game.atDock).toBe(true);
}
function trip(game: Campaign, column: number, depth: number) {
  drive(game, column + 0.5);
  until(game, { down: true }, () => game.depth >= depth, 60);
  dock(game);
  expect(game.bank()).toBe(true);
  expect(game.sell()).toBe(true);
}

describe("W01 campaign expedition and economic transactions", () => {
  it("announces a full cargo hold immediately when the last package fits", () => {
    const game = new Campaign(createCampaign(4));
    until(game, { down: true }, () => game.cargoBulk === game.capacity);
    expect(game.cargoBulk).toBe(7);
    expect(game.message).toContain("Hold full: 7/7 bulk");
  });

  it("previews exact affordable service results before charging fractional condition", () => {
    const game = new Campaign(createCampaign());
    game.state.vehicle.x = W01.dockX;
    game.state.vehicle.energy = 1.05;
    game.state.credits = 3;
    const before = JSON.stringify(game.state);
    const energy = game.servicePreview("refuel");
    expect(JSON.stringify(game.state)).toBe(before);
    expect(energy).toMatchObject({
      cost: 3,
      fullCost: 90,
      remaining: 0,
      partial: true,
    });
    expect(game.refuel()).toBe(true);
    expect(game.state.vehicle.energy).toBe(energy.result);
    expect(game.state.credits).toBe(energy.remaining);

    game.state.vehicle.hull = 9.75;
    game.state.credits = 100;
    const repair = game.servicePreview("repair");
    expect(repair).toMatchObject({
      cost: 38,
      fullCost: 38,
      result: 10,
      remaining: 62,
      partial: false,
    });
    expect(game.repair()).toBe(true);
    expect(game.state.vehicle.hull).toBe(repair.result);
    expect(game.state.credits).toBe(repair.remaining);
  });

  it("preserves healthy campaign resources on recovery and shares its exact quoted fee", () => {
    const game = new Campaign(createCampaign());
    game.state.vehicle.energy = 9;
    game.state.vehicle.hull = 8;
    game.state.credits = 5000;
    game.state.purchases.push({
      id: "CORE-1-ENGINE",
      paid: 5000,
      balanceVersion: "0.1",
    });
    const preview = game.recoveryPreview;
    expect(preview).toEqual({
      freeTow: false,
      keepsCargo: false,
      cost: 1050,
      remaining: 3950,
      energy: 9,
      hull: 8,
    });
    expect(game.recover()).toBe(true);
    expect(game.state.credits).toBe(preview.remaining);
    expect(game.state.vehicle.energy).toBe(preview.energy);
    expect(game.state.vehicle.hull).toBe(preview.hull);
    game.state.credits = 0;
    game.state.vehicle.energy = 0;
    game.state.vehicle.hull = 1;
    expect(game.recover()).toBe(true);
    expect(game.state.vehicle.energy).toBe(5);
    expect(game.state.vehicle.hull).toBe(5);
    expect(game.state.credits).toBe(0);
  });

  it("finishes two native opening trips, funds M1 and a useful purchase after a shelf hit", () => {
    const game = new Campaign(createCampaign(10));
    until(game, { down: true }, () => game.depth >= 100, 30);
    expect(game.state.progress.beacon).toBe(true);
    expect(game.cargoValue).toBe(3800);
    // A taught optional ceiling incident exercises the actual warning/damage
    // rule without replacing the seeded opening or teleporting the vehicle.
    game.world.tiles[7 * W01.width + 20] = 1;
    game.world.shelves.push({
      id: "opening-incident",
      x: 20.5,
      y: 7.5,
      warning: null,
      collapsed: false,
    });
    advance(game, {}, 2.1);
    expect(game.state.vehicle.hull).toBe(7);
    dock(game);
    game.bank();
    game.sell();
    expect(game.payMilestone()).toBe(true);
    expect(game.refuel()).toBe(true);
    expect(game.repair()).toBe(true);
    trip(game, 21, 70);
    expect(game.state.stats.ordinaryIncome).toBe(8600);
    expect(game.buyHardware("hull")).toBe(true);
    expect(game.maxHull).toBe(18);
    expect(game.state.vehicle.hull).toBe(18);
    expect(game.state.credits).toBeGreaterThan(500);
    expect(game.state.stats.recoveries).toBe(0);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("keeps a full-bay mineral exposed and recollects it without multiplying value", () => {
    const game = new Campaign(createCampaign(4));
    game.world.packages.push({
      ...game.world.packages[0]!,
      id: "overflow-proof",
      x: 20.5,
      y: 7.5,
      status: "deposit",
      processedBy: [],
    });
    until(game, { down: true }, () => game.depth >= 100);
    expect(game.cargoBulk).toBe(7);
    expect(game.state.stats.mined).toBeGreaterThanOrEqual(10);
    const exposed = game.world.packages.filter(
      (item) => item.status === "exposed",
    );
    expect(exposed.length).toBeGreaterThan(0);
    const identity = exposed[0]!.id;
    const before = JSON.stringify(exposed[0]);
    const snapshot = decodeCampaign(JSON.stringify(game.state));
    expect(
      JSON.stringify(
        snapshot.worlds.W01!.packages.find((item) => item.id === identity),
      ),
    ).toBe(before);
    const cargo = game.cargo[0]!;
    expect(game.eject(cargo.id)).toBe(true);
    expect(cargo.status).toBe("exposed");
    const totalValue = game.world.packages.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    until(game, { up: true }, () => cargo.status === "carried", 5);
    expect(game.world.packages.reduce((sum, item) => sum + item.value, 0)).toBe(
      totalValue,
    );
    expect(new Set(game.world.packages.map((item) => item.id)).size).toBe(
      game.world.packages.length,
    );
  });

  it("banks packages once, sells only stored cargo, and never sells protected missions", () => {
    const game = new Campaign(createCampaign(1));
    expect(game.buyHardware("engine")).toBe(false);
    expect(game.buyGear("W01-R2")).toBe(false);
    until(game, { down: true }, () => game.depth >= 70);
    expect(game.bank()).toBe(false);
    dock(game);
    expect(game.sell()).toBe(false);
    expect(game.bank()).toBe(true);
    expect(game.state.credits).toBe(200);
    expect(game.state.progress.bankedOre).toBe(7);
    expect(game.bank()).toBe(false);
    expect(game.state.progress.bankedOre).toBe(7);
    expect(game.sell()).toBe(true);
    expect(game.state.credits).toBe(4000);
    expect(game.sell()).toBe(false);
    expect(game.state.credits).toBe(4000);
    expect(game.payMilestone()).toBe(false);
    expect(game.state.progress.completed).toEqual([]);
  });

  it("supports partial service to a tenth of a credit and fills purchased capacities", () => {
    const game = new Campaign(createCampaign());
    game.state.vehicle.x = W01.dockX;
    game.state.vehicle.energy = 1.05;
    game.state.credits = 3;
    expect(game.refuel()).toBe(true);
    expect(game.state.credits).toBe(0);
    expect(game.state.vehicle.energy).toBeCloseTo(1.35);
    game.state.vehicle.hull = 1;
    game.state.credits = 1;
    expect(game.repair()).toBe(true);
    expect(game.state.vehicle.hull).toBeCloseTo(1 + 1 / 150);
    expect(game.state.credits).toBe(0);
    game.state.progress.beacon = true;
    game.state.progress.bankedOre = 3;
    game.state.progress.completed = [1];
    game.state.credits = 20000;
    expect(game.buyHardware("energy")).toBe(true);
    expect(game.state.vehicle.energy).toBe(16);
    expect(game.buyHardware("energy")).toBe(false);
    expect(game.buyHardware("hull")).toBe(true);
    expect(game.state.vehicle.hull).toBe(18);
  });

  it("does not spend or alter the state when shop, construction or departure prerequisites fail", () => {
    const game = new Campaign(createCampaign());
    const snapshot = JSON.stringify(game.state);
    expect(game.buyHardware("drill")).toBe(false);
    expect(game.buyGear("W01-R2")).toBe(false);
    expect(game.payMilestone()).toBe(false);
    expect(game.depart()).toBe(false);
    expect(JSON.stringify(game.state)).toBe(snapshot);
    game.state.vehicle.x = W01.dockX;
    expect(game.depart()).toBe(false);
    expect(game.payMilestone()).toBe(false);
    expect(game.buyHardware("engine")).toBe(false);
  });

  it("restores mission sources on recovery, preserves banking, charges equipment spend and provides salvage", () => {
    const game = new Campaign(createCampaign());
    const mission = game.world.missions[0]!;
    mission.status = "carried";
    game.world.missions[1]!.status = "banked";
    game.world.packages[0]!.status = "carried";
    game.world.packages[1]!.status = "banked";
    for (const item of game.world.packages)
      if (
        item.y < 6 &&
        (item.status === "deposit" || item.status === "exposed")
      )
        item.status = "sold";
    game.state.purchases.push({
      id: "CORE-1-ENGINE",
      paid: 5000,
      balanceVersion: "0.1",
    });
    game.state.credits = 5000;
    game.state.vehicle.energy = 0;
    game.state.progress.towsUsed.push("W01");
    expect(game.recover()).toBe(true);
    expect(game.state.credits).toBe(3950);
    expect(game.state.vehicle.energy).toBe(5);
    expect(game.state.vehicle.hull).toBe(10);
    expect(mission.status).toBe("source");
    expect(game.world.missions[1]!.status).toBe("banked");
    expect(game.world.packages[0]!.status).toBe("lost");
    expect(game.world.packages[1]!.status).toBe("banked");
    expect(
      game.world.packages.some(
        (item) => item.tags.includes("emergency") && item.status === "exposed",
      ),
    ).toBe(true);
    expect(game.atDock).toBe(true);
  });
});

describe("campaign motion, tools and completion", () => {
  it("finishes a committed downward cut before held Up launches", () => {
    const game = new Campaign(createCampaign());
    game.tick(dt, { down: true });
    expect(game.drillTarget).toEqual({ x: 20, y: 0 });
    advance(game, { up: true }, 0.5);
    expect(game.state.stats.mined).toBe(0);
    expect(game.drillProgress).toBeGreaterThan(0);
    advance(game, { up: true }, 0.6);
    expect(game.state.stats.mined).toBe(1);
    expect(game.state.vehicle.y).toBeLessThan(0.64);
    expect(game.world.tiles[20]).toBe(0);
  });

  it("cuts supported lateral and returned floor cells independently of deepest record", () => {
    const game = new Campaign(createCampaign());
    until(game, { down: true }, () => game.depth >= 40);
    until(game, { right: true }, () => game.state.vehicle.x > 21, 5);
    expect(game.world.tiles[3 * W01.width + 21]).toBe(0);
    const deepest = game.state.stats.largestDepth;
    until(game, { down: true }, () => game.depth >= 80);
    advance(game, { up: true }, 0.8);
    advance(game, { left: true }, 0.3);
    expect(game.state.stats.largestDepth).toBeGreaterThan(deepest);
    // A different upper shelf has no dependency on the global deepest mark.
    const state = createCampaign(3);
    state.stats.largestDepth = 600;
    const shelf = new Campaign(state);
    until(shelf, { down: true }, () => shelf.depth >= 10);
    expect(shelf.state.stats.mined).toBe(1);
  });

  it("wraps physical travel while respecting actual rock collision and local sight", () => {
    const game = new Campaign(createCampaign());
    game.state.vehicle.x = 39.8;
    advance(game, { right: true }, 0.5);
    expect(game.state.vehicle.x).toBeLessThan(3);
    expect(game.velocityX).toBeGreaterThan(0);
    const state = createCampaign(4);
    state.vehicle.x = 39.5;
    for (let y = 0; y < 3; y++) state.worlds.W01!.tiles[y * W01.width + 39] = 0;
    state.vehicle.y = 2.64;
    const wall = new Campaign(state);
    expect(wall.isVisible(0, 2)).toBe(true);
    expect(wall.isVisible(1, 2)).toBe(false);
    until(wall, { right: true }, () => wall.state.stats.mined === 1);
    expect(wall.world.tiles[2 * W01.width]).toBe(0);
    expect(wall.state.vehicle.x).toBeCloseTo(0.5);
  });

  it("applies the rack and anchoring feet only when owned and equipped", () => {
    const game = new Campaign(createCampaign());
    game.state.vehicle.x = W01.dockX;
    game.state.progress.beacon = true;
    game.state.progress.bankedOre = 3;
    game.state.progress.completed = [1, 2];
    game.world.missions[0]!.status = "banked";
    game.world.missions[1]!.status = "banked";
    game.state.credits = 50000;
    expect(game.buyGear("W01-R3")).toBe(false);
    expect(game.buyGear("W01-R2")).toBe(true);
    expect(game.buyGear("W01-R3")).toBe(true);
    expect(game.capacity).toBe(8);
    expect(game.toggleGear("W01-R3")).toBe(true);
    expect(game.capacity).toBe(7);
    expect(game.toggleGear("W01-R3")).toBe(true);
    advance(game, { mobility: true }, 0.5);
    expect(game.feetDeployed).toBe(true);
    advance(game, {}, 0.1);
    expect(game.feetDeployed).toBe(false);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("completes banked milestone gates and departure exactly once", () => {
    const game = new Campaign(createCampaign());
    game.state.vehicle.x = W01.dockX;
    game.state.credits = 20000;
    game.state.progress.beacon = true;
    game.state.progress.bankedOre = 3;
    expect(game.payMilestone()).toBe(true);
    const m1Credits = game.state.credits;
    expect(game.payMilestone()).toBe(false);
    expect(game.state.credits).toBe(m1Credits);
    for (const mission of game.world.missions) mission.status = "carried";
    expect(game.payMilestone()).toBe(false);
    game.bank();
    expect(game.payMilestone()).toBe(true);
    expect(game.payMilestone()).toBe(true);
    expect(game.state.progress.completed).toEqual([1, 2, 3]);
    expect(game.state.progress.unlockedWorlds).toEqual(["W01", "W02", "W03"]);
    const beforeDeparture = game.state.credits;
    expect(game.depart()).toBe(true);
    expect(game.depart()).toBe(false);
    expect(game.state.credits).toBe(beforeDeparture);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("physically excavates and returns from all three mission depths with attainable W01 hardware", () => {
    const game = new Campaign(createCampaign(51));
    // Finance is isolated here: the native two-trip test above verifies the
    // opening cash flow, while this run verifies geometry, range and gates.
    game.state.credits = 100000;
    trip(game, 20, 100);
    expect(game.payMilestone()).toBe(true);
    for (const key of ["drill", "energy", "cargo", "hull", "engine"] as const)
      expect(game.buyHardware(key)).toBe(true);
    drive(game, 20.5);
    until(game, { down: true }, () => game.depth >= 250);
    expect(
      game.world.missions.find((item) => item.id === "W01-VALVE")!.status,
    ).toBe("carried");
    dock(game);
    game.bank();
    game.sell();
    game.refuel();
    expect(game.payMilestone()).toBe(false);

    drive(game, 20.5);
    until(game, { down: true }, () => game.depth >= 400);
    until(game, { right: true }, () => game.state.vehicle.x >= 21.45, 5);
    expect(
      game.world.missions.find((item) => item.id === "W01-ANTENNA")!.status,
    ).toBe("carried");
    until(game, { left: true }, () => game.state.vehicle.x <= 20.55, 5);
    dock(game);
    game.bank();
    game.sell();
    game.refuel();
    expect(game.payMilestone()).toBe(true);
    expect(game.buyGear("W01-R2")).toBe(true);
    expect(game.buyGear("W01-R3")).toBe(true);

    drive(game, 20.5);
    until(game, { down: true }, () => game.depth === 600);
    expect(
      game.world.missions.find((item) => item.id === "W01-Q")!.status,
    ).toBe("carried");
    expect(game.state.vehicle.energy).toBeGreaterThan(2);
    dock(game);
    game.bank();
    game.sell();
    expect(game.payMilestone()).toBe(true);
    expect(game.depart()).toBe(true);
    expect(game.state.progress.completed).toEqual([1, 2, 3]);
    expect(game.state.stats.recoveries).toBe(0);
    expect(game.state.stats.largestDepth).toBe(600);
    expect(decodeCampaign(JSON.stringify(game.state))).toEqual(game.state);
  });

  it("keeps a sealed diagonal room hidden and remembers a genuinely observed wall", () => {
    const state = createCampaign();
    state.vehicle = { x: 10.5, y: 10.5, energy: 10, hull: 10 };
    state.worlds.W01!.tiles.fill(1);
    state.worlds.W01!.tiles[10 * W01.width + 10] = 0;
    state.worlds.W01!.tiles[11 * W01.width + 11] = 0;
    const game = new Campaign(state);
    expect(game.isVisible(10, 11)).toBe(true);
    expect(game.isVisible(11, 10)).toBe(true);
    expect(game.isVisible(11, 11)).toBe(false);
    expect(game.isKnown(11, 11)).toBe(false);
    state.vehicle.x = 20.5;
    state.vehicle.y = -0.36;
    game.refreshVisibility();
    expect(game.isVisible(10, 11)).toBe(false);
    expect(game.isKnown(10, 11)).toBe(true);
  });

  it("keeps collision-safe snapshots during varied native controls", () => {
    let randomState = 335;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    for (let seed = 0; seed < 10; seed++) {
      const game = new Campaign(createCampaign(seed));
      let controls: CampaignControls = {};
      for (let tick = 0; tick < 600; tick++) {
        if (tick % 8 === 0)
          controls = {
            down: random() < 0.5,
            up: random() < 0.25,
            left: random() < 0.35,
            right: random() < 0.35,
          };
        game.tick(1 / 30, controls);
        if (tick % 100 === 0)
          expect(decodeCampaign(JSON.stringify(game.state))).toEqual(
            game.state,
          );
      }
    }
  });
});

describe("campaign import boundaries", () => {
  it("round trips real excavations, exposed loot and banked progress", () => {
    const game = new Campaign(createCampaign(392));
    until(game, { down: true }, () => game.depth >= 100);
    const first = decodeCampaign(JSON.stringify(game.state));
    const reloaded = new Campaign(first);
    expect(reloaded.world.tiles).toEqual(game.world.tiles);
    expect(reloaded.world.discovered).toEqual(game.world.discovered);
    expect(reloaded.cargo).toEqual(game.cargo);
    expect(reloaded.state.progress).toEqual(game.state.progress);
    expect(reloaded.state.credits).toBe(200);
  });

  it.each([
    [
      "future schema",
      (state: ReturnType<typeof createCampaign>) => {
        state.schema = 3 as 1;
      },
    ],
    [
      "fractional credits",
      (state: ReturnType<typeof createCampaign>) => {
        state.credits = 2.5;
      },
    ],
    [
      "duplicated package",
      (state: ReturnType<typeof createCampaign>) => {
        state.worlds.W01!.packages.push({ ...state.worlds.W01!.packages[0]! });
      },
    ],
    [
      "invalid equipment slot",
      (state: ReturnType<typeof createCampaign>) => {
        state.equipped.mobility = "W01-R1";
      },
    ],
    [
      "unsupported hardware",
      (state: ReturnType<typeof createCampaign>) => {
        state.hardware.drill = 2;
      },
    ],
    [
      "teleport inside rock",
      (state: ReturnType<typeof createCampaign>) => {
        state.vehicle.y = 3;
      },
    ],
    [
      "unearned departure",
      (state: ReturnType<typeof createCampaign>) => {
        state.progress.departed = true;
      },
    ],
    [
      "out of bounds mission",
      (state: ReturnType<typeof createCampaign>) => {
        state.worlds.W01!.missions[0]!.y = 60;
      },
    ],
    [
      "negative credits",
      (state: ReturnType<typeof createCampaign>) => {
        state.credits = -1;
      },
    ],
  ] as const)("rejects %s without touching the caller's data", (_, corrupt) => {
    const state = createCampaign(2);
    corrupt(state);
    const raw = JSON.stringify(state);
    expect(() => decodeCampaign(raw)).toThrow();
    expect(JSON.stringify(state)).toBe(raw);
  });
});
