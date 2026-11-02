import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../src/campaign/model";
import { clearShaft, FRAME, until } from "./pacing/native";
import { MOTION } from "../src/campaign/motion";

function advance(
  game: Campaign,
  seconds: number,
  controls: Parameters<Campaign["tick"]>[1],
) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += FRAME)
    game.tick(Math.min(FRAME, seconds - elapsed), controls);
}

describe("proportional steering and truthful navigation estimates", () => {
  it("keeps keyboard input full strength and charges proportional horizontal energy", () => {
    const samples = [0, 0.5, 1, undefined].map((throttleX) => {
      const game = new Campaign(createCampaign(41));
      const x = game.state.vehicle.x;
      advance(game, 0.1, { right: true, throttleX });
      return {
        distance: game.state.vehicle.x - x,
        spent: game.maxEnergy - game.state.vehicle.energy,
      };
    });
    expect(samples[0]).toEqual({ distance: 0, spent: 0 });
    expect(samples[1]!.distance).toBeGreaterThan(0);
    expect(samples[1]!.distance).toBeLessThanOrEqual(0.4);
    expect(samples[1]!.distance).toBeLessThan(samples[2]!.distance);
    expect(samples[1]!.spent).toBeCloseTo(samples[2]!.spent * 0.5, 9);
    expect(samples[2]).toEqual(samples[3]);
  });

  it("scales upward thrust and its cost while leaving underground idle consumption intact", () => {
    const samples = [0, 0.5, 1].map((throttleY) => {
      const game = new Campaign(createCampaign(42));
      clearShaft(game, 20, 8);
      const y = game.state.vehicle.y;
      advance(game, 0.5, { up: true, throttleY });
      return {
        ascent: y - game.state.vehicle.y,
        spent: game.maxEnergy - game.state.vehicle.energy,
      };
    });
    expect(samples[0]!.ascent).toBeCloseTo(0, 5);
    expect(samples[0]!.spent).toBeCloseTo(MOTION.idleEnergy * 0.5, 8);
    expect(samples[1]!.ascent).toBeGreaterThan(0);
    expect(samples[1]!.ascent).toBeLessThan(samples[2]!.ascent);
    expect(samples[1]!.spent - samples[0]!.spent).toBeCloseTo(
      (samples[2]!.spent - samples[0]!.spent) * 0.5,
      8,
    );
  });

  it("commits the same complete cut at partial and full directional throttle", () => {
    const samples = [0.35, 1].map((throttleY) => {
      const game = new Campaign(createCampaign(43));
      until(game, { down: true, throttleY }, () => game.state.stats.mined >= 1);
      return {
        time: game.state.elapsed,
        energy: game.state.vehicle.energy,
        terrain: game.world.tiles,
      };
    });
    expect(samples[0]).toEqual(samples[1]);
  });

  it("keeps safe-depth estimates independent of unrevealed geometry", () => {
    for (let seed = 0; seed < 20; seed++) {
      const rock = new Campaign(createCampaign(seed));
      const cave = new Campaign(structuredClone(rock.state));
      for (let row = 3; row < cave.world.rows; row++) {
        rock.world.discovered[row * rock.world.width + 20] = 0;
        cave.world.discovered[row * cave.world.width + 20] = 0;
        cave.world.tiles[row * cave.world.width + 20] = 0;
      }
      expect(cave.safeDescentDepth).toBe(rock.safeDescentDepth);
      const full = rock.safeDescentDepth;
      rock.state.vehicle.energy = 3;
      expect(rock.safeDescentDepth).toBeLessThan(full);
      expect(rock.safeDescentDepth).toBeGreaterThanOrEqual(rock.depth);
    }
  });
});
