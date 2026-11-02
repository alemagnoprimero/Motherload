// Feel audit: precision/forgiveness of navigation through 1-tile shafts and tunnels.
// Run: cd /home/user/Motherload && npx vitest run --dir <this folder>
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { HARDWARE_LEVELS } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/feel/precision-results.json";
const SURFACE_Y = -0.36;
const results: Record<string, unknown> = {};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function make() {
  const game = new Campaign(createCampaign(73021));
  game.state.hardware.energy = 9;
  game.state.vehicle.energy = HARDWARE_LEVELS.energy[9]!;
  const w = game.world;
  for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 1;
  for (const p of w.packages) p.status = "sold";
  for (const m of w.missions) m.status = "banked";
  w.shelves.length = 0;
  return game;
}
const col = 15; // shaft column
function shaft(game: Campaign, depth = 10) {
  const w = game.world;
  for (let y = 0; y < depth; y++) w.tiles[y * w.width + col] = 0;
}
function place(game: Campaign, x: number, y = SURFACE_Y) {
  game.state.vehicle.x = x;
  game.state.vehicle.y = y;
  game.velocityX = game.velocityY = 0;
}
function hold(game: Campaign, controls: CampaignControls, seconds: number, dt = 1 / 120) {
  for (let t = 0; t < seconds - 1e-9; t += dt) game.tick(dt, controls);
}

it("S1: pressing Down at the surface at an offset from an existing shaft", { timeout: 120000 }, () => {
  const out: Record<string, unknown> = {};
  for (const offset of [0, 0.05, 0.1, 0.11, 0.12, 0.15, 0.2, 0.3, 0.45]) {
    const game = make();
    shaft(game);
    place(game, col + 0.5 + offset);
    game.tick(1 / 120, { down: true });
    const target = game.drillTarget;
    hold(game, { down: true }, 1.2);
    out[`offset${offset}`] = target
      ? { result: "drilled a new tile", column: target.x, row: target.y, rigYAfter1_2s: r3(game.state.vehicle.y) }
      : { result: "dropped into the existing shaft", rigYAfter1_2s: r3(game.state.vehicle.y) };
  }
  results.surfaceShaftEntry = { shaftColumn: col, shaftCentre: col + 0.5, rigHalfWidth: 0.39, ...out };
});

it("S2: flying up a shaft past a side-tunnel mouth with Left held", { timeout: 120000 }, () => {
  const out: Record<string, unknown> = {};
  for (const engine of [0, 2]) {
    const game = make();
    game.state.hardware.engine = engine;
    const w = game.world;
    for (let y = 0; y < 30; y++) w.tiles[y * w.width + col] = 0; // 30-deep shaft
    for (let x = col - 4; x < col; x++) w.tiles[12 * w.width + x] = 0; // tunnel at row 12, left side
    place(game, col + 0.5, 30 - 0.36);
    let captured = false;
    let t = 0;
    while (t < 6) {
      game.tick(1 / 60, { up: true, left: true });
      t += 1 / 60;
      if (game.state.vehicle.x < col) { captured = true; break; }
    }
    out[`engine${engine}`] = { capturedIntoTunnel: captured, atS: r3(t), rigY: r3(game.state.vehicle.y) };
  }
  results.tunnelCaptureWhileClimbing = out;
});

it("S3: ground nudge distance per tap length (fine positioning)", { timeout: 120000 }, () => {
  const out: Record<string, unknown> = {};
  for (const ms of [17, 33, 50, 100, 150, 250]) {
    const game = make();
    place(game, 10.5);
    hold(game, { right: true }, ms / 1000, 1 / 240);
    hold(game, {}, 3, 1 / 240);
    out[`tap${ms}ms`] = r3(game.state.vehicle.x - 10.5);
  }
  results.groundNudgeTiles = { windowToDropIntoShaftTiles: 0.22, ...out };
});

it("S4: descending from the air onto an existing shaft opening", { timeout: 120000 }, () => {
  const out: Record<string, unknown> = {};
  for (const offset of [0, 0.08, 0.11, 0.15, 0.3]) {
    const game = make();
    shaft(game);
    place(game, col + 0.5 + offset, -3);
    hold(game, {}, 1.5); // fall with no input
    const afterFall = r3(game.state.vehicle.y);
    out[`offset${offset}`] = { rigYAfterFalling: afterFall, enteredShaft: game.state.vehicle.y > 0 };
  }
  results.airDropOntoShaft = out;
});

it("S5: hover duty cycle and keyboard hover difficulty", { timeout: 120000 }, () => {
  // Bang-bang hover: press Up whenever the rig sinks below the target height; count toggles.
  const game = make();
  const w = game.world;
  for (let y = 0; y < 40; y++) w.tiles[y * w.width + col] = 0;
  place(game, col + 0.5, 20);
  let toggles = 0, prev = false, upTime = 0, min = 99, max = -99;
  const target = 20;
  for (let i = 0; i < 600; i++) {
    const up = game.state.vehicle.y > target;
    if (up !== prev) toggles++;
    prev = up;
    game.tick(1 / 60, { up });
    if (up) upTime += 1 / 60;
    if (i > 60) { min = Math.min(min, game.state.vehicle.y); max = Math.max(max, game.state.vehicle.y); }
  }
  results.hover = {
    upDutyCycle: r3(upTime / 10),
    keyTogglesPer10sAt60Hz: toggles,
    heightBandTiles: r3(max - min),
    note: "Perfect 60 Hz bang-bang controller; a human with ~100 ms reaction holds a wider band",
  };
});

it("write", () => writeFileSync(OUT, JSON.stringify(results, null, 2)));
