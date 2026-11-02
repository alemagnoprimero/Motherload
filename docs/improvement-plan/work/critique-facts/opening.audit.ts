// Re-run the pack's two-trip opening (tests/campaign-model.audit.ts:129-160) and
// check which rank-1 parts are affordable, with and without the minor impact,
// at the current 6 L start and the plan's proposed 10 L start (A2).
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  Campaign,
  campaignDelta,
  createCampaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/critique-facts/opening-results.json";
const dt = 1 / 60;
function advance(game: Campaign, controls: CampaignControls, seconds: number) {
  for (let tick = 0; tick < seconds / dt; tick++) game.tick(dt, controls);
}
function until(game: Campaign, controls: CampaignControls, p: () => boolean, seconds = 60) {
  for (let tick = 0; tick < seconds / dt && !p(); tick++) game.tick(dt, controls);
  if (!p()) throw new Error("until failed: " + game.message);
}
function drive(game: Campaign, x: number) {
  for (let tick = 0; tick < 60 * 15; tick++) {
    const delta = campaignDelta(game.state.vehicle.x, x);
    if (Math.abs(delta) < 0.08 && Math.abs(game.velocityX) < 0.4 && Math.abs(game.state.vehicle.y + 0.36) < 0.001)
      return;
    const desired = Math.max(-4, Math.min(4, delta * 3));
    const direction = desired - game.velocityX;
    game.tick(dt, { left: direction < -0.15, right: direction > 0.15 });
  }
  throw new Error("drive failed");
}
function dock(game: Campaign) {
  until(game, { up: true }, () => game.state.vehicle.y <= -0.36, 30);
  drive(game, W01.dockX);
  if (!game.atDock) throw new Error("not docked");
}
function trip(game: Campaign, column: number, depth: number) {
  drive(game, column + 0.5);
  until(game, { down: true }, () => game.depth >= depth, 60);
  dock(game);
  game.bank();
  game.sell();
}

function opening(seed: number, startEnergy: number, impact: boolean) {
  const game = new Campaign(createCampaign(seed));
  game.state.vehicle.energy = startEnergy;
  const log: Record<string, number> = {};
  until(game, { down: true }, () => game.depth >= 100, 30);
  if (impact) {
    game.world.tiles[7 * W01.width + 20] = 1;
    game.world.shelves.push({ id: "opening-incident", x: 20.5, y: 7.5, warning: null, collapsed: false });
    advance(game, {}, 2.1);
  }
  log.hullAfterTrip1 = game.state.vehicle.hull;
  dock(game);
  log.energyAtDock1 = Math.round(game.state.vehicle.energy * 100) / 100;
  game.bank();
  game.sell();
  log.creditsAfterSale1 = game.state.credits / 10;
  game.payMilestone();
  log.creditsAfterM1 = game.state.credits / 10;
  game.refuel();
  game.repair();
  log.creditsAfterService1 = game.state.credits / 10;
  trip(game, 21, 70);
  log.creditsAfterSale2 = game.state.credits / 10;
  log.energyAtDock2 = Math.round(game.state.vehicle.energy * 100) / 100;
  const snapshot = JSON.stringify(game.state);
  const affordable: Record<string, number | false> = {};
  for (const key of ["energy", "drill", "cargo", "engine", "hull"] as const) {
    const g = new Campaign(JSON.parse(snapshot));
    affordable[key] = g.buyHardware(key) ? g.state.credits / 10 : false;
  }
  // energy after refuel+repair first (a "service reserve" before buying)
  const g2 = new Campaign(JSON.parse(snapshot));
  g2.refuel();
  g2.repair();
  const afterService2 = g2.state.credits / 10;
  const tankAfterService = g2.buyHardware("energy") ? g2.state.credits / 10 : false;
  return { seed, startEnergy, impact, ...log, affordableLeftCR: affordable, afterService2, tankAfterService };
}

it("two-trip opening affordability", () => {
  const rows = [] as any[];
  for (const startEnergy of [6, 10])
    for (const impact of [false, true]) rows.push(opening(10, startEnergy, impact));
  writeFileSync(OUT, JSON.stringify(rows, null, 1));
}, 60000);
