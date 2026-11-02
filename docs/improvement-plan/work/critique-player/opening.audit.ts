// Critique (player lens): opening purchase arithmetic under the draft plan.
// Re-creates the repo's own two-trip opening test (tests/campaign-model.audit.ts:129-160)
// with the plan's A2 change (10 L start) and checks which "useful" purchase is
// affordable with a service reserve after one minor impact (the pack's Phase 1 gate).
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { Campaign, campaignDelta, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { W01, HARDWARE_PRICES } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls, HardwareKey } from "/home/user/Motherload/src/campaign/types.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/critique-player/opening-results.json";
const dt = 1 / 60;
function advance(game: Campaign, controls: CampaignControls, seconds: number) {
  for (let tick = 0; tick < seconds / dt; tick++) game.tick(dt, controls);
}
function until(game: Campaign, controls: CampaignControls, predicate: () => boolean, seconds = 60) {
  for (let tick = 0; tick < seconds / dt && !predicate(); tick++) game.tick(dt, controls);
  if (!predicate()) throw new Error(`condition failed: ${game.message}`);
}
function drive(game: Campaign, x: number) {
  for (let tick = 0; tick < 60 * 15; tick++) {
    const delta = campaignDelta(game.state.vehicle.x, x);
    if (Math.abs(delta) < 0.08 && Math.abs(game.velocityX) < 0.4 && Math.abs(game.state.vehicle.y + 0.36) < 0.001) return;
    const desired = Math.max(-4, Math.min(4, delta * 3));
    const direction = desired - game.velocityX;
    game.tick(dt, { left: direction < -0.15, right: direction > 0.15 });
  }
  throw new Error("cannot drive");
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

function opening(startEnergy: number, shelfHit: boolean, seed = 10) {
  const game = new Campaign(createCampaign(seed));
  game.state.vehicle.energy = startEnergy;
  until(game, { down: true }, () => game.depth >= 100, 30);
  if (shelfHit) {
    game.world.tiles[7 * W01.width + 20] = 1;
    game.world.shelves.push({ id: "opening-incident", x: 20.5, y: 7.5, warning: null, collapsed: false });
    advance(game, {}, 2.1);
  }
  dock(game);
  game.bank();
  game.sell();
  const afterTrip1Sale = game.state.credits / 10;
  game.payMilestone();
  const refuel1 = game.servicePreview("refuel").cost / 10;
  game.refuel();
  const repair1 = game.servicePreview("repair").cost / 10;
  game.repair();
  const afterService1 = game.state.credits / 10;
  trip(game, 21, 70);
  const beforeBuy = game.state.credits / 10;
  const refuel2 = game.servicePreview("refuel").fullCost / 10;
  const repair2 = game.servicePreview("repair").fullCost / 10;
  const options: Record<string, { price: number; affordable: boolean; reserveAfterBuyAndService: number }> = {};
  for (const key of ["energy", "hull", "engine", "cargo", "drill"] as HardwareKey[]) {
    const price = HARDWARE_PRICES[key][1]! / 10;
    // service needed afterwards: energy purchase fills the tank; hull purchase fills the hull.
    const service = (key === "energy" ? 0 : refuel2) + (key === "hull" ? 0 : repair2);
    options[key] = { price, affordable: beforeBuy >= price, reserveAfterBuyAndService: +(beforeBuy - price - service).toFixed(1) };
  }
  // Plan A4 brace at 250 CR (feet re-spec)
  options["brace(A4 proposal)"] = { price: 250, affordable: beforeBuy >= 250, reserveAfterBuyAndService: +(beforeBuy - 250 - refuel2 - repair2).toFixed(1) };
  return {
    startEnergy, shelfHit, seed, afterTrip1Sale, refuel1, repair1, afterService1,
    beforeBuy, refuel2, repair2, hull: game.state.vehicle.hull, options,
  };
}

it("opening purchase arithmetic", () => {
  const results = [] as unknown[];
  for (const startEnergy of [6, 10])
    for (const shelfHit of [false, true])
      for (const seed of [10, 4, 999]) results.push(opening(startEnergy, shelfHit, seed));
  writeFileSync(OUT, JSON.stringify(results, null, 1));
}, 120000);
