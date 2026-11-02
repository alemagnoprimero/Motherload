import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { W01_MILESTONES } from "../../src/campaign/config";
import { PLANS, Sim } from "./sim";

it.skipIf(!process.env.PACING_TRACE)(
  "retains failed-seed event traces and exact final campaign",
  () => {
    const seeds = (process.env.PACING_TRACE || "").split(",").map(Number);
    const fee = Number(process.env.PACING_FEE || 1100);
    const original = W01_MILESTONES[2].fee;
    mkdirSync("artifacts/pacing/traces", { recursive: true });
    try {
      W01_MILESTONES[2].fee = fee * 10;
      for (const seed of seeds) {
        const policy = {
          name: "novice",
          missionMode: "completionist",
          plan: PLANS.cheap,
          reserveFraction: 0.35,
          reserveMin: 1,
          volatileSuccess: 0.5,
          dockOverhead: 40,
          precision: true,
          moveOverhead: 0.35,
        };
        const sim = new Sim(policy, seed);
        const complete = sim.runWorld(3 * 3600);
        const result = {
          seed,
          fee,
          complete,
          minutes: sim.t / 60,
          message: sim.game.message,
          milestone: sim.game.currentMilestone,
          ready: sim.game.missionReady,
          planComplete: sim.planComplete(),
          planBlocked: sim.planBlocked(),
          hullDamage: sim.hullDamage,
          events: sim.events,
          trips: sim.trips,
          state: sim.s,
        };
        writeFileSync(
          `artifacts/pacing/traces/novice-${seed}.json`,
          JSON.stringify(result, null, 2),
        );
        console.log(
          JSON.stringify({
            seed,
            complete,
            minutes: result.minutes,
            message: result.message,
            milestone: result.milestone?.id,
            credits: sim.s.credits,
            recoveries: sim.s.stats.recoveries,
          }),
        );
      }
    } finally {
      W01_MILESTONES[2].fee = original;
    }
  },
  15 * 60 * 1000,
);
