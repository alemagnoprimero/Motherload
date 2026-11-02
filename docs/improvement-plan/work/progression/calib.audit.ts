// Calibration of movement/drilling primitives and simple true-engine policies.
// Run: cd /home/user/Motherload && npx vitest run --dir <this dir> calib
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  Campaign,
  campaignDelta,
  createCampaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/progression/out";
const dt = 1 / 60;
const SURFACE_Y = -0.36;

function tickUntil(
  game: Campaign,
  controls: CampaignControls | (() => CampaignControls),
  predicate: () => boolean,
  limit = 120,
) {
  let t = 0;
  while (t < limit && !predicate()) {
    game.tick(dt, typeof controls === "function" ? controls() : controls);
    t += dt;
  }
  return { t, ok: predicate() };
}
function drive(game: Campaign, x: number) {
  let t = 0;
  for (let tick = 0; tick < 60 * 30; tick++) {
    const delta = campaignDelta(game.state.vehicle.x, x, game.world.width);
    if (
      Math.abs(delta) < 0.08 &&
      Math.abs(game.velocityX) < 0.4 &&
      Math.abs(game.state.vehicle.y - SURFACE_Y) < 0.001
    )
      return t;
    const desired = Math.max(-5, Math.min(5, delta * 3));
    const direction = desired - game.velocityX;
    game.tick(dt, { left: direction < -0.15, right: direction > 0.15 });
    t += dt;
  }
  throw new Error("cannot drive");
}

const results: Record<string, unknown> = {};

it("measures drilling primitives", () => {
  const rows: unknown[] = [];
  for (const drillRank of [0, 1, 2])
    for (const material of [1, 2])
      for (const row of [0, 10, 20, 30, 40, 50, 59])
        for (const dir of ["down", "right"] as const) {
          const state = createCampaign(5);
          state.hardware.drill = drillRank;
          if (drillRank === 2) state.worlds.W02 = undefined as never; // keep W01
          const game = new Campaign(state);
          const w = game.world;
          // clear a pocket: rig sits at column 10 resting on row `row` floor
          const col = 10;
          for (let y = 0; y < row; y++) w.tiles[y * w.width + col] = 0;
          if (dir === "down") {
            w.tiles[row * w.width + col] = material;
            w.tiles[(row + 1 < 60 ? row + 1 : row) * w.width + col] =
              row + 1 < 60 ? 1 : material;
            game.state.vehicle.x = col + 0.5;
            game.state.vehicle.y = row - 0.36;
          } else {
            // rig at (col,row) resting on (col,row+1); cut (col+1,row)
            if (row >= 59) continue;
            for (let y = 0; y <= row; y++) w.tiles[y * w.width + col] = 0;
            w.tiles[(row + 1) * w.width + col] = 1;
            w.tiles[row * w.width + col + 1] = material;
            game.state.vehicle.x = col + 0.5;
            game.state.vehicle.y = row + 1 - 0.36;
          }
          game.state.vehicle.energy = 10;
          game.velocityX = game.velocityY = 0;
          const e0 = game.state.vehicle.energy,
            m0 = game.state.stats.mined;
          const controls: CampaignControls =
            dir === "down" ? { down: true } : { right: true };
          // run until the first cut completes
          const r = tickUntil(game, controls, () => game.state.stats.mined > m0, 30);
          rows.push({
            drillRank,
            material,
            row: dir === "down" ? row : row,
            dir,
            seconds: +r.t.toFixed(3),
            energy: +(e0 - game.state.vehicle.energy).toFixed(4),
          });
        }
  results.drill = rows;
});

it("measures vertical flight, falling and surface driving", () => {
  const flight: unknown[] = [];
  for (const engine of [0, 1, 2])
    for (const depthRows of [10, 20, 30, 45, 59])
      for (const massCount of [0, 7, 12]) {
        const state = createCampaign(5);
        state.hardware.engine = engine;
        const game = new Campaign(state);
        const w = game.world;
        const col = 10;
        for (let y = 0; y <= depthRows; y++) w.tiles[y * w.width + col] = 0;
        w.tiles[(depthRows + 1) * w.width + col] = 1;
        // add cargo mass by marking packages carried (fake, mass 1.15 avg)
        const pk = w.packages.filter((p) => p.status === "deposit").slice(0, massCount);
        for (const p of pk) p.status = "carried";
        game.state.hardware.cargo = 2; // capacity irrelevant for flight
        game.state.vehicle.x = col + 0.5;
        game.state.vehicle.y = depthRows + 1 - 0.36;
        game.state.vehicle.energy = 10;
        const e0 = game.state.vehicle.energy;
        const up = tickUntil(game, { up: true }, () => game.state.vehicle.y <= SURFACE_Y + 1e-6, 60);
        const eUp = e0 - game.state.vehicle.energy;
        // fall back down
        game.state.vehicle.energy = 10;
        game.velocityY = 0;
        const e1 = game.state.vehicle.energy;
        const fall = tickUntil(
          game,
          () => ({ down: true }),
          () =>
            Math.abs(game.state.vehicle.y - (depthRows + 1 - 0.36)) < 1e-3 &&
            Math.abs(game.velocityY) < 1e-6,
          60,
        );
        flight.push({
          engine,
          depthRows,
          cargoPackages: massCount,
          cargoMass: +pk.reduce((s, p) => s + p.mass, 0).toFixed(2),
          upSeconds: +up.t.toFixed(3),
          upEnergy: +eUp.toFixed(4),
          fallSeconds: +fall.t.toFixed(3),
          fallEnergy: +(e1 - game.state.vehicle.energy).toFixed(4),
          hullAfterFall: game.state.vehicle.hull,
        });
      }
  results.flight = flight;
  // surface driving spawn -> dock
  const drives: unknown[] = [];
  for (const engine of [0, 1, 2]) {
    const state = createCampaign(5);
    state.hardware.engine = engine;
    const game = new Campaign(state);
    const e0 = game.state.vehicle.energy;
    const t = drive(game, W01.dockX);
    drives.push({ engine, tiles: 15, seconds: +t.toFixed(3), energy: +(e0 - game.state.vehicle.energy).toFixed(4), docked: game.atDock });
  }
  results.surfaceDrive = drives;
});

it("measures a 1-tile tunnel shuffle (move sideways one open cell and settle)", () => {
  const out: unknown[] = [];
  for (const engine of [0, 1, 2]) {
    const state = createCampaign(5);
    state.hardware.engine = engine;
    const game = new Campaign(state);
    const w = game.world;
    const row = 20,
      col = 10;
    for (let x = col - 3; x <= col + 3; x++) {
      w.tiles[row * w.width + x] = 0;
      w.tiles[(row + 1) * w.width + x] = 1;
    }
    game.state.vehicle.x = col + 0.5;
    game.state.vehicle.y = row + 1 - 0.36;
    game.state.vehicle.energy = 10;
    for (const tiles of [1, 2, 3]) {
      game.state.vehicle.x = col - 1.5 + 0.0 + 0; // start at col-2 centre
      game.state.vehicle.x = col - 2 + 0.5;
      game.velocityX = 0;
      const target = game.state.vehicle.x + tiles;
      const e0 = game.state.vehicle.energy;
      let t = 0;
      for (let k = 0; k < 600; k++) {
        const delta = target - game.state.vehicle.x;
        if (Math.abs(delta) < 0.08 && Math.abs(game.velocityX) < 0.4) break;
        const desired = Math.max(-5, Math.min(5, delta * 3));
        const d = desired - game.velocityX;
        game.tick(dt, { left: d < -0.15, right: d > 0.15 });
        t += dt;
      }
      out.push({ engine, tiles, seconds: +t.toFixed(3), energy: +(e0 - game.state.vehicle.energy).toFixed(4) });
    }
  }
  results.tunnelMove = out;
});

it("fresh-rig straight dive (hold down from spawn until disabled)", () => {
  const out: unknown[] = [];
  for (let seed = 0; seed < 40; seed++) {
    const game = new Campaign(createCampaign(seed));
    const r = tickUntil(game, { down: true }, () => game.state.vehicle.energy <= 0, 200);
    out.push({
      seed,
      seconds: +r.t.toFixed(2),
      depth: game.depth,
      cargo: game.cargoBulk,
      haul: game.cargoValue / 10,
      beacon: game.state.progress.beacon,
      mined: game.state.stats.mined,
    });
  }
  results.freshDive = out;
});

it("fresh-rig dive with a return reserve: deepest safe round trip by energy/drill", () => {
  const out: unknown[] = [];
  for (const [energyRank, start] of [
    [0, 6],
    [0, 10],
    [1, 16],
    [2, 25],
  ] as const)
    for (const drillRank of [0, 1, 2])
      for (const seed of [0, 1, 2, 3, 4]) {
        const state = createCampaign(seed);
        state.hardware.energy = energyRank;
        state.hardware.drill = drillRank;
        state.vehicle.energy = start;
        const game = new Campaign(state);
        // dive down column 20 (soil corridor) until energy margin hits estimated return cost
        // return cost estimate: rows * 0.033 + 0.6 surface drive + 0.25 margin
        let t = 0;
        while (t < 300) {
          const rows = game.state.vehicle.y + 0.36;
          const need = rows * 0.034 + 0.45 + 0.25 + 0.35; // fly + drive + margin + one more cut
          if (game.state.vehicle.energy <= need || game.depth >= 600) break;
          game.tick(dt, { down: true });
          t += dt;
        }
        // finish any committed cut
        const depthReached = game.depth;
        const fly = tickUntil(game, { up: true }, () => game.state.vehicle.y <= SURFACE_Y + 1e-6, 60);
        let driveT = 0;
        let docked = false;
        try {
          driveT = drive(game, W01.dockX);
          docked = game.atDock;
        } catch {
          docked = false;
        }
        out.push({
          seed,
          energyRank,
          startEnergy: start,
          drillRank,
          depthReached,
          diveSeconds: +t.toFixed(2),
          flySeconds: +fly.t.toFixed(2),
          driveSeconds: +driveT.toFixed(2),
          energyLeft: +game.state.vehicle.energy.toFixed(3),
          docked,
          haul: game.cargoValue / 10,
          cargo: game.cargoBulk,
        });
      }
  results.safeDive = out;
});

it("native opening: column 20 to beacon, bank, M1; column 21; time and credits", () => {
  const out: unknown[] = [];
  for (let seed = 0; seed < 20; seed++) {
    const game = new Campaign(createCampaign(seed));
    let t = 0;
    const log: unknown[] = [];
    // trip 1: column 20 to beacon (row 9 -> depth 100)
    t += tickUntil(game, { down: true }, () => game.depth >= 100, 60).t;
    const haul1 = game.cargoValue;
    t += tickUntil(game, { up: true }, () => game.state.vehicle.y <= SURFACE_Y + 1e-6, 30).t;
    t += drive(game, W01.dockX);
    game.bank();
    game.sell();
    const m1 = game.payMilestone();
    game.refuel();
    log.push({ trip: 1, t: +t.toFixed(1), haul: haul1 / 10, credits: game.state.credits / 10, m1, energy: +game.state.vehicle.energy.toFixed(2) });
    // trip 2: column 21 seam 7 rows
    t += drive(game, 21.5);
    t += tickUntil(game, { down: true }, () => game.cargoBulk >= game.capacity || game.depth >= 80, 60).t;
    const haul2 = game.cargoValue;
    t += tickUntil(game, { up: true }, () => game.state.vehicle.y <= SURFACE_Y + 1e-6, 30).t;
    t += drive(game, W01.dockX);
    game.bank();
    game.sell();
    game.refuel();
    log.push({ trip: 2, t: +t.toFixed(1), haul: haul2 / 10, credits: game.state.credits / 10, energy: +game.state.vehicle.energy.toFixed(2) });
    out.push({ seed, log });
  }
  results.opening = out;
});

it("writes", () => {
  writeFileSync(OUT + "/calib.json", JSON.stringify(results, null, 1));
});
