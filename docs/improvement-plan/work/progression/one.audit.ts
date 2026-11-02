import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, PLANS, type Policy } from "./sim.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
it("one seed sanity", () => {
  const policy: Policy = { name: "balanced-smart", reserveFraction: 0.25, reserveMin: 1, volatileSuccess: 0.85, missionMode: "balanced", plan: PLANS.smart, dockOverhead: 20, precision: true, moveOverhead: 0 };
  const sim = new Sim(policy, 3);
  const t0 = Date.now();
  const w1 = sim.runWorld(4 * 3600);
  const t1 = Date.now();
  const ok = sim.travelToComet();
  const w2 = ok && sim.runWorld(6 * 3600);
  writeFileSync(OUT + "/one.json", JSON.stringify({ w1, w2, wall: [t1 - t0, Date.now() - t1], events: sim.events, trips: sim.trips, ruptured: sim.ruptured, preserved: sim.preserved, credits: sim.s.credits / 10, hw: sim.s.hardware, gear: sim.s.ownedGear }, null, 1));
});
