// Energy accounting for the guided M2 trips with the stock 10 L tank, and an
// option comparison for the opening (start tank / spawn distance).
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Campaign, campaignDelta, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/first-session/sim2-results.json";
const dt = 1 / 60;
const SURFACE = -0.36;
const r2 = (x: number) => Math.round(x * 100) / 100;

function run(g: Campaign, c: CampaignControls, p: () => boolean, max = 90) {
  let t = 0;
  while (!p() && t < max) {
    g.tick(dt, c);
    t += dt;
    if (g.state.vehicle.energy <= 0) return { ok: false, t };
  }
  return { ok: p(), t };
}
function drive(g: Campaign, x: number) {
  let t = 0;
  for (let n = 0; n < 60 * 30; n++) {
    const delta = campaignDelta(g.state.vehicle.x, x);
    if (Math.abs(delta) < 0.05 && Math.abs(g.velocityX) < 0.3 && Math.abs(g.state.vehicle.y - SURFACE) < 0.001) return t;
    const desired = Math.max(-4, Math.min(4, delta * 3));
    const d = desired - g.velocityX;
    g.tick(dt, { left: d < -0.15, right: d > 0.15 });
    t += dt;
  }
  return t;
}
/** From a docked, refuelled rig: go down column 20 to targetRow, optionally side-cut, return. */
function missionTrip(targetRow: number, side: "right" | null, tank = 10) {
  const g = new Campaign(createCampaign(10));
  // trip 1 state: shaft open to row 8 in column 20, at dock, full tank
  for (let row = 0; row <= 8; row++) g.world.tiles[row * W01.width + 20] = 0;
  g.state.vehicle = { x: W01.dockX, y: SURFACE, energy: tank, hull: 10 };
  g.state.progress.beacon = true;
  g.state.progress.bankedOre = 3;
  g.state.progress.completed = [1];
  const log: any[] = [];
  const snap = (label: string) => log.push({ label, energy: r2(g.state.vehicle.energy), depth: g.depth });
  drive(g, 20.5);
  snap("at shaft");
  let r = run(g, { down: true }, () => g.depth >= (targetRow + 1) * 10 - 1 || g.state.vehicle.y >= targetRow + 0.6, 120);
  snap("at target row");
  if (!r.ok) return { targetRow, ok: false, phase: "descent", log };
  if (side) {
    r = run(g, { right: true }, () => g.state.vehicle.x >= 21.4, 10);
    snap("side cut");
  }
  run(g, {}, () => !g.drillTarget, 3);
  r = run(g, { up: true }, () => g.state.vehicle.y <= SURFACE + 1e-3, 40);
  snap("surface");
  if (!r.ok) return { targetRow, ok: false, phase: "ascent", log };
  drive(g, W01.dockX);
  snap("dock");
  return { targetRow, ok: g.state.vehicle.energy > 0 && g.atDock, energyLeft: r2(g.state.vehicle.energy), log };
}

it("guided M2 trip energy", { timeout: 120000 }, () => {
  const results: any = {};
  results.valve = missionTrip(W01.valveRow, null);
  results.antennaViaColumn20 = missionTrip(W01.antennaRow, "right");
  results.antennaWithValveShaftOpen = (() => {
    const g = new Campaign(createCampaign(10));
    for (let row = 0; row <= W01.valveRow; row++) g.world.tiles[row * W01.width + 20] = 0;
    g.state.vehicle = { x: W01.dockX, y: SURFACE, energy: 10, hull: 10 };
    g.state.progress.completed = [1];
    const log: any[] = [];
    const snap = (label: string) => log.push({ label, energy: r2(g.state.vehicle.energy), depth: g.depth });
    drive(g, 20.5);
    snap("at shaft");
    const r = run(g, { down: true }, () => g.state.vehicle.y >= W01.antennaRow + 0.6, 120);
    snap("at antenna row " + r.ok);
    if (r.ok) {
      run(g, { right: true }, () => g.state.vehicle.x >= 21.4, 10);
      snap("side cut");
      run(g, {}, () => !g.drillTarget, 3);
      run(g, { left: true }, () => g.state.vehicle.x <= 20.55, 5);
      run(g, {}, () => Math.abs(g.velocityX) < 0.05, 2);
      snap("back under shaft x=" + g.state.vehicle.x.toFixed(2));
      const up = run(g, { up: true }, () => g.state.vehicle.y <= SURFACE + 1e-3, 40);
      snap("surface " + up.ok);
      if (up.ok) { drive(g, W01.dockX); snap("dock"); }
    }
    return { energyLeft: r2(g.state.vehicle.energy), log };
  })();
  writeFileSync(OUT, JSON.stringify(results, null, 1));
});
