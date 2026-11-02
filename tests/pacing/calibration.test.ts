import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../../src/campaign/model";
import { HARDWARE_LEVELS } from "../../src/campaign/config";
import { cutDuration, MOTION, motionProfile } from "../../src/campaign/motion";
import { clearShaft, FRAME, until } from "./native";

/** These compare the planner's primitives with independent production ticks.
 * No fitting to chapter duration or human-completion targets occurs here. */
describe("pacing primitive calibration", () => {
  it("keeps predicted cut time and energy within 10% of native cuts", () => {
    for (const drillRank of [0, 1, 2])
      for (const row of [0, 6, 15, 32, 48, 58])
        for (const material of [1, 2, 4]) {
          if (material === 4 && drillRank === 0) continue;
          const game = new Campaign(createCampaign(5));
          game.state.hardware.drill = drillRank;
          game.state.hardware.energy = 3;
          game.state.vehicle.energy = game.maxEnergy;
          clearShaft(game, 10, row);
          game.world.tiles[row * game.world.width + 10] = material;
          const expected = cutDuration({
            material,
            row,
            down: true,
            drill: HARDWARE_LEVELS.drill[drillRank],
            worldId: "W01",
            augerId: game.state.equipped.drill,
            precision: false,
          });
          const before = game.state.vehicle.energy;
          const mined = game.state.stats.mined;
          const actual = until(
            game,
            { down: true },
            () => game.state.stats.mined > mined,
            30,
          );
          const detail = `rank=${drillRank}, row=${row}, material=${material}`;
          expect(Math.abs(actual / expected - 1), detail).toBeLessThanOrEqual(
            0.1,
          );
          const expectedEnergy =
            expected * (MOTION.drillingEnergy + (row ? MOTION.idleEnergy : 0));
          expect(
            Math.abs((before - game.state.vehicle.energy) / expectedEnergy - 1),
            detail,
          ).toBeLessThanOrEqual(0.1);
        }
  });

  it("keeps flight and movement burn within 10% after the startup interval", () => {
    for (const rank of [0, 1, 2])
      for (const cargoCount of [0, 7]) {
        const game = new Campaign(createCampaign(51));
        game.state.hardware.engine = rank;
        game.state.hardware.energy = 3;
        game.state.vehicle.energy = game.maxEnergy;
        for (const item of game.world.packages.slice(0, cargoCount))
          item.status = "carried";
        clearShaft(game, 20, 59);
        for (let frame = 0; frame < 120; frame++)
          game.tick(FRAME, { up: true });
        const profile = motionProfile(
          HARDWARE_LEVELS.engine[rank],
          game.cargoMass,
        );
        const before = {
          y: game.state.vehicle.y,
          energy: game.state.vehicle.energy,
        };
        for (let frame = 0; frame < 120; frame++)
          game.tick(FRAME, { up: true });
        expect(
          Math.abs(
            (before.y - game.state.vehicle.y) / (2 * profile.verticalSpeed) - 1,
          ),
        ).toBeLessThanOrEqual(0.1);
        expect(
          Math.abs(
            (before.energy - game.state.vehicle.energy) /
              (2 * (MOTION.idleEnergy + profile.movementEnergy)) -
              1,
          ),
        ).toBeLessThanOrEqual(0.1);
      }
  });
});
