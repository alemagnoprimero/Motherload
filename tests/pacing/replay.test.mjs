import { it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Campaign, decodeCampaign } from "../../src/campaign/model";
import { drive, until, returnToDock } from "./native";

it.skipIf(!process.env.PACING_NATIVE_REPLAY)(
  "replays a direct mission return with production physics on stalled planner saves",
  () => {
    const seeds = (process.env.PACING_NATIVE_REPLAY || "")
      .split(",")
      .map(Number);
    const directory =
      process.env.PACING_REPLAY_SOURCE ||
      "artifacts/pacing/traces-before-brace";
    const strategy = process.env.PACING_REPLAY_STRATEGY || "direct";
    const results = [];
    for (const seed of seeds) {
      const trace = JSON.parse(
        readFileSync(`${directory}/novice-${seed}.json`, "utf8"),
      );
      const game = new Campaign(decodeCampaign(JSON.stringify(trace.state)));
      const start = game.state.elapsed;
      let error;
      const trips = [];
      try {
        for (
          let sortie = 0;
          sortie < (strategy === "reserve" ? 8 : 1);
          sortie++
        ) {
          if (
            game.world.missions.find((item) => item.id === "W01-Q").status ===
            "banked"
          )
            break;
          // Follow the actual signal's central shaft with full native movement.
          drive(game, 20.5);
          until(
            game,
            { down: true },
            () =>
              game.depth === 600 ||
              game.state.vehicle.energy <= 0 ||
              (strategy === "reserve" &&
                ["turn", "stranded"].includes(game.returnReserve.state)),
            120,
          );
          const depth = game.depth;
          if (game.state.vehicle.energy > 0) returnToDock(game);
          if (game.atDock) {
            game.bank();
            game.sell();
            trips.push({
              depth,
              energyOnReturn: game.state.vehicle.energy,
              mined: game.state.stats.mined,
            });
            game.refuel();
            game.repair();
          }
        }
      } catch (cause) {
        error = String(cause);
      }
      results.push({
        seed,
        strategy,
        coreBanked:
          game.world.missions.find((item) => item.id === "W01-Q").status ===
          "banked",
        seconds: game.state.elapsed - start,
        energy: game.state.vehicle.energy,
        recoveries: game.state.stats.recoveries,
        trips,
        error,
      });
    }
    mkdirSync("artifacts/pacing", { recursive: true });
    writeFileSync(
      `artifacts/pacing/native-replays${strategy === "direct" ? "" : `-${strategy}`}.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results));
    expect(
      results.filter((result) => !result.coreBanked),
      "A native replay failure is distinct from an abstract planner failure",
    ).toEqual([]);
  },
  60000,
);
