// Feel audit: time share per activity in representative W01 round trips (real seed 73021 world).
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { Campaign, createCampaign, campaignDelta } from "/home/user/Motherload/src/campaign/model.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/feel/trip-results.json";
const results: Record<string, unknown> = {};
const r2 = (v: number) => Math.round(v * 100) / 100;
const DT = 1 / 60;

function trip(targetDepth: number, drill = 0) {
  const game = new Campaign(createCampaign(73021));
  game.state.hardware.energy = 9;
  game.state.vehicle.energy = 350;
  game.state.hardware.drill = drill;
  const time = { drilling: 0, flying: 0, driving: 0, other: 0 };
  let cuts = 0, lastMined = game.state.stats.mined, pickups = 0, lastCargo = 0, t = 0;
  const tickWith = (c: any, bucket: keyof typeof time) => {
    game.tick(DT, c);
    t += DT;
    if (game.drillTarget) time.drilling += DT; else time[bucket] += DT;
    if (game.state.stats.mined > lastMined) { cuts += game.state.stats.mined - lastMined; lastMined = game.state.stats.mined; }
    if (game.cargo.length > lastCargo) pickups += game.cargo.length - lastCargo;
    lastCargo = game.cargo.length;
  };
  // descend in the protected soil corridor (spawn column 20)
  while (game.depth < targetDepth && t < 600) tickWith({ down: true }, "other");
  // climb back to the surface
  while (game.state.vehicle.y > -0.36 + 1e-3 && t < 900) tickWith({ up: true }, "flying");
  // drive to the lander
  for (let i = 0; i < 60 * 20; i++) {
    const delta = campaignDelta(game.state.vehicle.x, W01.dockX);
    if (Math.abs(delta) < 0.1 && Math.abs(game.velocityX) < 0.4) break;
    const desired = Math.max(-5, Math.min(5, delta * 3));
    const dir = desired - game.velocityX;
    tickWith({ left: dir < -0.15, right: dir > 0.15 }, "driving");
  }
  const total = time.drilling + time.flying + time.driving + time.other;
  return {
    targetDepthM: targetDepth, drillRank: drill, totalS: r2(total),
    drillingS: r2(time.drilling), drillingShare: r2(time.drilling / total),
    flyingS: r2(time.flying), drivingS: r2(time.driving), otherS: r2(time.other),
    cuts, cutsPerMinuteWhileDrilling: r2(cuts / (time.drilling / 60)), pickups,
    reachedDepthM: game.depth,
  };
}

it("round trips", { timeout: 300000 }, () => {
  results.trips = [trip(150, 0), trip(300, 0), trip(590, 0), trip(590, 1)];
  writeFileSync(OUT, JSON.stringify(results, null, 2));
});
