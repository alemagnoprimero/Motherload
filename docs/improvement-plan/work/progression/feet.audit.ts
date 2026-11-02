// Does the W01-R2 anchoring feet change anything measurable in normal play?
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
const dt = 1 / 60;
function rig(feet: boolean) {
  const s = createCampaign(5);
  s.progress.completed = [1];
  if (feet) { s.ownedGear.push("W01-R2"); s.equipped.mobility = "W01-R2"; }
  const g = new Campaign(s);
  const w = g.world;
  for (let y = 0; y <= 30; y++) w.tiles[y * w.width + 10] = 0;
  w.tiles[31 * w.width + 10] = 1;
  g.state.vehicle.x = 10.5; g.state.vehicle.y = 31 - 0.36; g.state.vehicle.energy = 10;
  return g;
}
it("feet vs no feet: climb energy and side-cut time from a ledge", () => {
  const res: Record<string, unknown> = {};
  for (const feet of [false, true]) {
    const g = rig(feet);
    // brace for 0.5 s first (deploy), then climb 30 rows holding mobility + up
    for (let t = 0; t < 0.5; t += dt) g.tick(dt, { mobility: true });
    const e0 = g.state.vehicle.energy; let t = 0; let deployedFrames = 0;
    while (g.state.vehicle.y > -0.36 + 1e-6 && t < 20) { g.tick(dt, { up: true, mobility: true }); if (g.feetDeployed) deployedFrames++; t += dt; }
    res[feet ? "feet" : "plain"] = { climbSeconds: +t.toFixed(3), climbEnergy: +(e0 - g.state.vehicle.energy).toFixed(4), framesWithFeetDeployedWhileClimbing: deployedFrames };
  }
  // surface stopping distance from full speed, releasing input (feet held vs not)
  for (const feet of [false, true]) {
    const s = createCampaign(5); s.progress.completed = [1];
    if (feet) { s.ownedGear.push("W01-R2"); s.equipped.mobility = "W01-R2"; }
    const g = new Campaign(s);
    for (let t = 0; t < 1.5; t += dt) g.tick(dt, { right: true });
    const x0 = g.state.vehicle.x; let t = 0;
    while (Math.abs(g.velocityX) > 0.05 && t < 5) { g.tick(dt, { mobility: true }); t += dt; }
    res[(feet ? "feet" : "plain") + "Stop"] = { stopSeconds: +t.toFixed(3), slideTiles: +(g.state.vehicle.x - x0).toFixed(3) };
  }
  writeFileSync(OUT + "/feet.json", JSON.stringify(res, null, 1));
});
