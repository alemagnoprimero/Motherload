// Share of seeds in which a mission-following shaft (and a shaft + lateral comb) sees a relic.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW02 } from "/home/user/Motherload/src/campaign/world.ts";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/world/out";
function run(id: "W01" | "W02", comb: boolean) {
  let seen = 0, present = 0;
  for (let s = 1; s <= 200; s++) {
    const st = createCampaign(s);
    if (id === "W02") { st.worlds.W02 = createW02(s); st.currentWorld = "W02"; }
    const g = new Campaign(st);
    const w = g.world, W = w.width, col = id === "W01" ? 20 : 24;
    const relics = w.packages.filter((p) => p.tags.includes("relic")).map((p) => Math.floor(p.y) * W + Math.floor(p.x));
    if (relics.length) present++;
    const visit = (c: number, r: number) => { const cc = ((c % W) + W) % W; w.tiles[r * W + cc] = 0; g.state.vehicle.x = cc + 0.5; g.state.vehicle.y = r + 1 - 0.36; g.refreshVisibility(); };
    for (let r = 0; r < w.rows; r++) {
      visit(col, r);
      if (comb && r % 5 === 4) { for (let d = 1; d <= 10; d++) visit(col + d, r); for (let d = 1; d <= 10; d++) visit(col - d, r); visit(col, r); }
    }
    if (relics.some((k) => w.discovered[k] === 1)) seen++;
  }
  return { presentPct: present / 2, seenPct: seen / 2, seenWhenPresentPct: Math.round((seen / Math.max(1, present)) * 1000) / 10 };
}
it("relic sightings", () => {
  writeFileSync(OUT + "/relic-seen.json", JSON.stringify({ W01: { shaft: run("W01", false), comb: run("W01", true) }, W02: { shaft: run("W02", false), comb: run("W02", true) } }, null, 1));
}, 300000);
