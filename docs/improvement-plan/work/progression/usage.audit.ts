// How much of each world do players use? Relic discovery, mined value by depth band.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Sim, PLANS, type Policy } from "./sim.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
const policy: Policy = { name: "skilled-completionist", reserveFraction: 0.25, reserveMin: 1, volatileSuccess: 0.85, missionMode: "completionist", plan: PLANS.smart, dockOverhead: 20, precision: true, moveOverhead: 0 };
function usage(sim: Sim, world: "W01" | "W02") {
  const w = sim.s.worlds[world]!;
  const bands: Record<string, { total: number; taken: number }> = {};
  let relicTaken = 0, relics = 0;
  for (const p of w.packages) {
    if (p.tags.includes("emergency")) continue;
    if (p.tags.includes("relic")) { relics++; if (["sold", "banked", "carried"].includes(p.status)) relicTaken++; continue; }
    const band = Math.floor(Math.floor(p.y) / (world === "W01" ? 10 : 20));
    const b = (bands[band] ??= { total: 0, taken: 0 });
    b.total++;
    if (["sold", "banked", "carried"].includes(p.status)) b.taken++;
  }
  const discovered = w.discovered.reduce((a, b) => a + b, 0) / w.discovered.length;
  return { relics, relicTaken, discoveredPct: +(100 * discovered).toFixed(1), bands: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, +(100 * v.taken / v.total).toFixed(1)])) };
}
it("world usage at completion", () => {
  const out: unknown[] = [];
  for (const seed of [1, 8, 15, 22, 29, 36, 43, 50, 57, 64]) {
    const sim = new Sim(policy, seed);
    sim.runWorld(5 * 3600);
    const u1 = usage(sim, "W01");
    sim.travelToComet();
    sim.runWorld(8 * 3600);
    out.push({ seed, W01: u1, W02: usage(sim, "W02") });
  }
  writeFileSync(OUT + "/usage.json", JSON.stringify(out, null, 1));
});
