import { describe, expect, it } from "vitest";
import { Campaign, createCampaign, campaignDelta } from "../src/campaign/model";
import { clearShaft, FRAME, until } from "./pacing/native";

function comet(seed: number) {
  const state = createCampaign(seed);
  state.progress.beacon = true;
  state.progress.bankedOre = 3;
  state.progress.completed = [1, 2, 3];
  state.progress.unlockedWorlds = ["W01", "W02", "W03"];
  state.progress.departed = true;
  state.vehicle.x = 5.5;
  for (const mission of state.worlds.W01!.missions) mission.status = "banked";
  const game = new Campaign(state);
  expect(game.travel("W02")).toBe(true);
  return game;
}

function attemptReturn(game: Campaign) {
  for (
    let frame = 0;
    frame < 60 * 60 && game.state.vehicle.energy > 0 && !game.atDock;
    frame++
  ) {
    if (game.state.vehicle.y > -0.36) game.tick(FRAME, { up: true });
    else {
      const delta = campaignDelta(
        game.state.vehicle.x,
        game.activeWorldDefinition.dockX,
        game.world.width,
      );
      game.tick(FRAME, { left: delta < 0, right: delta > 0 });
    }
  }
  return game.atDock && game.state.vehicle.energy > 0;
}

describe("hardware and reserve capability jobs", () => {
  it("cuts comet hard rock at least 25% faster with rank-two drill", () => {
    const samples = [1, 2].map((drill) => {
      const game = comet(30);
      game.state.hardware.drill = drill;
      clearShaft(game, 24, 10);
      game.world.tiles[10 * game.world.width + 24] = 2;
      const before = game.state.vehicle.energy;
      const seconds = until(
        game,
        { down: true },
        () => game.state.stats.mined === 1,
      );
      return { seconds, energy: before - game.state.vehicle.energy };
    });
    expect(samples[1]!.seconds).toBeLessThanOrEqual(samples[0]!.seconds * 0.75);
    expect(samples[1]!.energy).toBeLessThanOrEqual(samples[0]!.energy * 0.75);
  });

  it("makes a first 450 m plate expedition returnable with rank-one energy", () => {
    const results: boolean[] = [];
    for (const energy of [0, 1]) {
      const game = new Campaign(createCampaign(31));
      game.state.hardware.drill = 1;
      game.state.hardware.energy = energy;
      game.state.vehicle.energy = game.maxEnergy;
      // Preserve generated terrain and depth costs; the required route excludes hazards.
      until(
        game,
        { down: true },
        () => game.drillTarget?.y === 44 || game.state.vehicle.energy <= 0,
        90,
      );
      if (game.state.vehicle.energy > 0)
        until(
          game,
          {},
          () => !game.drillTarget || game.state.vehicle.energy <= 0,
          10,
        );
      results.push(game.depth >= 450 && attemptReturn(game));
    }
    expect(results).toEqual([false, true]);
  });

  it("gives rank-two energy a safe final comet descent beyond an existing 450 m shaft", () => {
    const results: boolean[] = [];
    for (const energy of [1, 2]) {
      const game = comet(32);
      game.state.hardware = { drill: 1, energy, cargo: 1, hull: 1, engine: 1 };
      game.state.ownedGear.push("W02-R1");
      game.state.equipped.drill = "W02-R1";
      game.state.vehicle.energy = game.maxEnergy;
      game.state.vehicle.hull = game.maxHull;
      clearShaft(game, 24, 45);
      // An earlier expedition excavated this shaft; begin the next at the surface.
      game.state.vehicle.y = -0.36;
      for (const item of game.world.packages)
        if (Math.floor(item.x) === 24) item.status = "lost";
      until(
        game,
        () => (game.volatileWindow ? {} : { down: true }),
        () => game.depth === 1000 || game.state.vehicle.energy <= 0,
        120,
      );
      results.push(game.depth === 1000 && attemptReturn(game));
    }
    expect(results).toEqual([false, true]);
  });

  it("makes a loaded 990 m comet return at least 15% faster with rank-two engine", () => {
    const times: number[] = [];
    for (const engine of [1, 2]) {
      const game = comet(33);
      game.state.hardware = { drill: 1, energy: 2, cargo: 1, hull: 1, engine };
      game.state.vehicle.energy = game.maxEnergy;
      for (const item of game.world.packages
        .filter((item) => item.bulk === 1)
        .slice(0, 12))
        item.status = "carried";
      clearShaft(game, 24, 99);
      times.push(
        until(game, { up: true }, () => game.state.vehicle.y <= -0.36),
      );
    }
    expect(times[1]).toBeLessThanOrEqual(times[0]! * 0.85);
  });

  it("lets rank-two hull survive four timed vent contacts that disable rank one", () => {
    const remaining: number[] = [];
    for (const hull of [1, 2]) {
      const game = comet(34);
      game.state.hardware.hull = hull;
      game.state.vehicle.hull = game.maxHull;
      game.world.hazards = { coldPockets: [], vents: [{ x: 10.5, y: 10.5 }] };
      game.world.shelves = [];
      game.world.pressureSeams = [];
      game.world.tiles[10 * game.world.width + 10] = 0;
      game.world.tiles[11 * game.world.width + 10] = 1;
      game.state.vehicle.x = 10.5;
      game.state.vehicle.y = 10.64;
      for (let frame = 0; frame < 60 * 9.1; frame++) game.tick(FRAME);
      remaining.push(game.state.vehicle.hull);
    }
    expect(remaining).toEqual([0, 6]);
  });

  it("turns depletion at 400 m into a native safe return with the banked steam reserve", () => {
    const game = comet(35);
    game.state.ownedGear.push("W02-R1", "W02-R2");
    game.state.equipped.utilities = ["W02-R2"];
    clearShaft(game, 24, 40);
    game.state.vehicle.energy = 0;
    game.state.vehicle.reserve = 5;
    game.tick(FRAME);
    expect(game.state.vehicle.reserve).toBe(0);
    expect(attemptReturn(game)).toBe(true);
    expect(game.state.stats.recoveries).toBe(0);
  });
});
