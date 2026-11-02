import { describe, expect, it } from "vitest";
import { Campaign, campaignDelta, createCampaign } from "../src/campaign/model";
import { W01 } from "../src/campaign/config";
import { clearShaft, drive, FRAME, returnToDock, until } from "./pacing/native";

describe("progression plan native acceptance", () => {
  it("estimates a loaded native return within −10%/+30% over 20 seeds and ten depths", () => {
    const depths = [3, 6, 9, 12, 18, 24, 30, 39, 48, 59];
    for (let seed = 0; seed < 20; seed++)
      for (const depth of depths) {
        const game = new Campaign(createCampaign(seed));
        game.state.hardware.energy = 3;
        game.state.hardware.engine = seed % 3;
        game.state.hardware.cargo = 2;
        game.state.vehicle.energy = game.maxEnergy;
        const cargo = game.world.packages
          .filter((item) => Math.floor(item.x) !== 20)
          .slice(0, seed % 8);
        for (const item of cargo) item.status = "carried";
        clearShaft(game, 20, depth);
        const estimate = game.returnReserve.estimate;
        const before = game.state.vehicle.energy;
        until(game, { up: true }, () => game.state.vehicle.y <= -0.36);
        until(
          game,
          () => {
            const delta = campaignDelta(
              game.state.vehicle.x,
              game.activeWorldDefinition.dockX,
              game.world.width,
            );
            return { left: delta < 0, right: delta > 0 };
          },
          () => game.atDock,
        );
        const actual = before - game.state.vehicle.energy;
        const ratio = estimate / actual;
        const detail = `seed=${seed}, rows=${depth}, estimate=${estimate}, actual=${actual}`;
        expect(ratio, detail).toBeGreaterThanOrEqual(0.9);
        expect(ratio, detail).toBeLessThanOrEqual(1.3);
      }
  }, 30000);

  it("funds the useful tank after two opening trips and a 3 HP impact", () => {
    for (const seed of [4, 10, 999]) {
      const game = new Campaign(createCampaign(seed));
      until(game, { down: true }, () => game.depth >= 100, 30);
      expect(game.state.progress.beacon).toBe(true);
      expect(game.cargoValue).toBe(3800);
      // Isolate the opening economy's required minor impact; hazard timing has
      // separate native coverage and is not approximated by this cost fixture.
      game.state.vehicle.hull -= 3;
      returnToDock(game);
      game.bank();
      game.sell();
      expect(game.payMilestone()).toBe(true);
      expect(game.refuel()).toBe(true);
      expect(game.repair()).toBe(true);
      drive(game, 21.5);
      until(game, { down: true }, () => game.cargoBulk === game.capacity, 30);
      expect(game.cargoValue).toBe(4800);
      returnToDock(game);
      game.bank();
      game.sell();
      game.refuel();
      expect(game.buyHardware("energy")).toBe(true);
      expect(game.state.hardware.energy).toBe(1);
      expect(game.state.credits).toBeGreaterThanOrEqual(250);
      expect(game.state.vehicle.energy).toBe(game.maxEnergy);
      expect(game.state.stats.recoveries).toBe(0);
      expect(game.state.elapsed).toBeLessThanOrEqual(35);
    }
  });

  it("warns to turn back at least three seconds before the naive dive disables", () => {
    const game = new Campaign(createCampaign(10));
    let turn: number | undefined;
    for (
      let tick = 0;
      tick < 60 * 150 && game.state.vehicle.energy > 0;
      tick++
    ) {
      game.tick(FRAME, { down: true });
      if (turn === undefined && game.returnReserve.state === "turn")
        turn = game.state.elapsed;
    }
    expect(turn).toBeDefined();
    expect(game.state.vehicle.energy).toBe(0);
    expect(game.state.elapsed - turn!).toBeGreaterThanOrEqual(3);
  });

  it("climbs 59 rows with a full hold at least 15% faster with engine rank one", () => {
    const times: number[] = [];
    for (const rank of [0, 1]) {
      const game = new Campaign(createCampaign(8));
      game.state.hardware.engine = rank;
      game.state.hardware.energy = 3;
      game.state.vehicle.energy = game.maxEnergy;
      for (const item of game.world.packages.slice(0, 7))
        item.status = "carried";
      clearShaft(game, 20, 59);
      times.push(
        until(game, { up: true }, () => game.state.vehicle.y <= -0.36),
      );
    }
    expect(times[1]).toBeLessThanOrEqual(times[0] * 0.85);
  });

  it("buys the 30% rack without feet and reaches a wall deposit using the shaft brace", () => {
    const game = new Campaign(createCampaign(12));
    game.state.progress.completed = [1, 2];
    game.state.credits = 100000;
    game.state.vehicle.x = W01.dockX;
    expect(game.buyGear("W01-R3")).toBe(true);
    expect(game.capacity).toBe(10);
    expect(game.state.ownedGear).not.toContain("W01-R2");
    expect(game.buyGear("W01-R2")).toBe(true);
    for (let row = 0; row <= 20; row++)
      game.world.tiles[row * game.world.width + 10] = 0;
    game.world.tiles[10 * game.world.width + 11] = 1;
    game.state.vehicle.x = 10.5;
    game.state.vehicle.y = 10.5;
    game.state.vehicle.energy = game.maxEnergy;
    game.velocityX = game.velocityY = 0;
    const mined = game.state.stats.mined;
    until(
      game,
      { right: true, mobility: true },
      () => game.state.stats.mined > mined,
      5,
    );
    expect(game.world.tiles[10 * game.world.width + 11]).toBe(0);
  });
});
