// Feel audit: what the rig does physically when energy hits zero mid-flight, and frame-rate dependence.
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/feel/depletion-results.json";
const results: Record<string, unknown> = {};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

it("energy runs out while climbing a shaft", () => {
  const game = new Campaign(createCampaign(73021));
  const w = game.world;
  for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 1;
  for (const p of w.packages) p.status = "sold";
  for (const m of w.missions) m.status = "banked";
  w.shelves.length = 0;
  for (let y = 0; y < 30; y++) w.tiles[y * w.width + 15] = 0;
  game.state.vehicle.x = 15.5;
  game.state.vehicle.y = 30 - 0.36;
  game.state.vehicle.energy = 0.05;
  const trace: { t: number; y: number; vy: number; energy: number }[] = [];
  for (let i = 0; i < 180; i++) {
    game.tick(1 / 60, { up: true });
    if (i % 15 === 0) trace.push({ t: r3((i + 1) / 60), y: r3(game.state.vehicle.y), vy: r3(game.velocityY), energy: r3(game.state.vehicle.energy) });
  }
  results.climbDepletion = { trace, finalMessage: game.message, floorRowBelow: 30 };
});

it("simulation speed when the browser frame time exceeds 50 ms (scene.ts:863 clamps dt to 0.05)", () => {
  const out: Record<string, number> = {};
  for (const frameMs of [16.7, 33.3, 50, 66.7, 100]) {
    const simPerFrame = Math.min(0.05, frameMs / 1000);
    out[`frame${frameMs}ms`] = r3(simPerFrame / (frameMs / 1000));
  }
  results.simSpeedRatio = out;
});

it("write", () => writeFileSync(OUT, JSON.stringify(results, null, 2)));
