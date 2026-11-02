// Feel audit: headless physics measurements of the campaign simulation.
// Run: cd /home/user/Motherload && npx vitest run --dir <this folder>
// Writes results to physics-results.json next to this file.
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { HARDWARE_LEVELS, W01 } from "/home/user/Motherload/src/campaign/config.ts";
import { createW02 } from "/home/user/Motherload/src/campaign/world.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/feel/physics-results.json";
const FRAME = 1 / 60;
const SURFACE_Y = -0.36;
const results: Record<string, unknown> = {};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

type World = "W01" | "W02";
function make(world: World = "W01", engine = 0, drill = 0) {
  const game = new Campaign(createCampaign(73021));
  if (world === "W02") {
    game.state.worlds.W02 = createW02(12345);
    game.state.currentWorld = "W02";
  }
  game.state.hardware.engine = engine;
  game.state.hardware.drill = drill;
  game.state.hardware.energy = 9; // effectively infinite energy for motion tests
  game.state.vehicle.energy = HARDWARE_LEVELS.energy[9]!;
  game.state.vehicle.hull = 10;
  return game;
}
/** Flat solid floor of soil everywhere below the surface; nothing else. */
function flatWorld(game: Campaign, material = 1) {
  const w = game.world;
  for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = material;
  for (const p of w.packages) p.status = "sold";
  for (const m of w.missions) m.status = "banked";
  w.shelves.length = 0;
}
function place(game: Campaign, x: number, y = SURFACE_Y) {
  game.state.vehicle.x = x;
  game.state.vehicle.y = y;
  game.velocityX = game.velocityY = 0;
}
function run(game: Campaign, controls: CampaignControls, seconds: number, sample?: (t: number) => void) {
  let t = 0;
  while (t < seconds - 1e-9) {
    game.tick(FRAME, controls);
    t += FRAME;
    sample?.(t);
  }
  return t;
}

it("ground horizontal acceleration, top speed, release and reversal", { timeout: 300000 }, () => {
  const out: Record<string, unknown> = {};
  for (const engine of [0, 1, 2]) {
    for (const cargo of [0, 7]) {
      const game = make("W01", engine);
      flatWorld(game);
      place(game, 10.5);
      // fill hold with heaviest W01 ore to measure mass effect
      for (let i = 0; i < cargo; i++)
        game.world.packages.push({
          id: "test-" + i, itemId: "W01-O4", name: "Goldium", origin: "W01", balanceVersion: "0.1",
          value: 2500, bulk: 1, mass: 1.6, tags: ["ordinary"], x: 0, y: 0, status: "carried", processedBy: [],
        });
      let t50 = NaN, t90 = NaN, tTop = NaN, top = 0;
      const startX = game.state.vehicle.x;
      run(game, { right: true }, 2, (t) => {
        const v = game.velocityX;
        top = Math.max(top, v);
      });
      // second pass for timings using known top
      const g2 = make("W01", engine);
      flatWorld(g2);
      place(g2, 10.5);
      for (let i = 0; i < cargo; i++) g2.world.packages.push({ ...(game.world.packages.at(-1) as any), id: "t2-" + i });
      run(g2, { right: true }, 2, (t) => {
        const v = g2.velocityX;
        if (isNaN(t50) && v >= top * 0.5) t50 = t;
        if (isNaN(t90) && v >= top * 0.9) t90 = t;
        if (isNaN(tTop) && v >= top - 1e-6) tTop = t;
      });
      // release: coast to stop
      const vRelease = g2.velocityX;
      const x0 = g2.state.vehicle.x;
      let tStop = NaN;
      run(g2, {}, 4, (t) => {
        if (isNaN(tStop) && Math.abs(g2.velocityX) < 0.05) tStop = t;
      });
      let coast = g2.state.vehicle.x - x0;
      // reversal: full right then hold left until v <= -0.9 top
      const g3 = make("W01", engine);
      flatWorld(g3);
      place(g3, 10.5);
      run(g3, { right: true }, 1.5);
      let tRev = NaN;
      run(g3, { left: true }, 3, (t) => {
        if (isNaN(tRev) && g3.velocityX <= -top * 0.9) tRev = t;
      });
      out[`engine${engine}_cargo${cargo}`] = {
        topSpeedTilesPerS: r3(top),
        massFactor: r3(1 + (cargo * 1.6) / 198),
        t50: r3(t50), t90: r3(t90), tTop: r3(tTop),
        releaseFromV: r3(vRelease),
        stopTimeTo0_05: r3(tStop), coastTiles: r3(coast),
        reverseTo90pct: r3(tRev),
        distanceIn2s: r3(game.state.vehicle.x - startX),
      };
    }
  }
  results.ground = out;
});

it("air horizontal control and coast", { timeout: 300000 }, () => {
  const out: Record<string, unknown> = {};
  for (const world of ["W01", "W02"] as World[]) {
    const game = make(world, 0);
    flatWorld(game);
    // open sky: rig starts high in the air (negative y is air)
    place(game, 10.5, -4.5);
    // hover: alternate thrust to stay roughly level is complex; instead measure with up held (rising, capped)
    let t90 = NaN, top = 0;
    run(game, { up: true, right: true }, 1.5, (t) => {
      top = Math.max(top, game.velocityX);
    });
    const g2 = make(world, 0);
    flatWorld(g2);
    place(g2, 10.5, -4.5);
    run(g2, { up: true, right: true }, 1.5, (t) => {
      if (isNaN(t90) && g2.velocityX >= top * 0.9) t90 = t;
    });
    // release right but keep up held (stays pinned to ceiling y=-5.5): measure horizontal coast
    const x0 = g2.state.vehicle.x;
    const v0 = g2.velocityX;
    let tStop = NaN;
    run(g2, { up: true }, 10, (t) => {
      if (isNaN(tStop) && Math.abs(g2.velocityX) < 0.05) tStop = t;
    });
    out[world] = {
      airTopSpeed: r3(top), airT90: r3(t90),
      releaseFromV: r3(v0), airStopTimeTo0_05: r3(tStop), airCoastTiles: r3(g2.state.vehicle.x - x0),
      note: "Up held during coast pins rig at sky ceiling y=-5.5; vertical motion excluded",
    };
  }
  results.air = out;
});

it("vertical: lift-off, climb, apex, fall and terminal speeds per world and engine", { timeout: 300000 }, () => {
  const out: Record<string, unknown> = {};
  for (const world of ["W01", "W02"] as World[]) {
    for (const engine of [0, 1, 2, 3, 5, 9]) {
      const game = make(world, engine);
      flatWorld(game, 0); // all air: an open shaft down to the bottom
      // floor at the bottom row only
      const w = game.world;
      for (let x = 0; x < w.width; x++) w.tiles[(w.rows - 1) * w.width + x] = 1;
      // climb test from rest at mid-depth
      place(game, 10.5, 30);
      let tUp1 = NaN, tUpMax = NaN, upTop = 0;
      const y0 = game.state.vehicle.y;
      run(game, { up: true }, 2, (t) => {
        upTop = Math.min(upTop, game.velocityY);
        if (isNaN(tUp1) && y0 - game.state.vehicle.y >= 1) tUp1 = t;
      });
      const g2 = make(world, engine);
      flatWorld(g2, 0);
      for (let x = 0; x < w.width; x++) g2.world.tiles[(w.rows - 1) * w.width + x] = 1;
      place(g2, 10.5, 30);
      run(g2, { up: true }, 2, (t) => {
        if (isNaN(tUpMax) && g2.velocityY <= upTop + 1e-6) tUpMax = t;
      });
      // release at full climb speed: time to apex and apex overshoot
      const yRel = g2.state.vehicle.y;
      let tApex = NaN, apexY = yRel;
      run(g2, {}, 3, (t) => {
        if (g2.state.vehicle.y < apexY) apexY = g2.state.vehicle.y;
        if (isNaN(tApex) && g2.velocityY >= 0) tApex = t;
      });
      // free fall from rest: terminal speed and time to reach 95% of it
      const g3 = make(world, engine);
      flatWorld(g3, 0);
      for (let x = 0; x < g3.world.width; x++) g3.world.tiles[(g3.world.rows - 1) * g3.world.width + x] = 1;
      place(g3, 10.5, 1);
      let fallTop = 0, tFall95 = NaN, damageAt: number | null = null;
      const hull0 = g3.state.vehicle.hull;
      const samples: number[] = [];
      run(g3, {}, 12, (t) => {
        fallTop = Math.max(fallTop, g3.velocityY);
        samples.push(g3.velocityY);
        if (damageAt === null && g3.state.vehicle.hull < hull0) damageAt = t;
      });
      for (let i = 0; i < samples.length; i++)
        if (samples[i]! >= fallTop * 0.95) { tFall95 = (i + 1) * FRAME; break; }
      out[`${world}_engine${engine}`] = {
        gravityTilesPerS2: r3(11.54 * (world === "W01" ? 0.55 : 0.35)),
        climbTopSpeed: r3(-upTop), timeToRise1Tile: r3(tUp1), timeToClimbTop: r3(tUpMax),
        releaseToApexS: r3(tApex), apexOvershootTiles: r3(yRel - apexY),
        fallTerminal: r3(fallTop), fallTimeTo95pct: r3(tFall95),
        fallFromRow1ToBottomDamage: hull0 - g3.state.vehicle.hull, damageAtS: damageAt === null ? null : r3(damageAt),
        hardLandingThresholdTilesPerS: 7,
      };
    }
  }
  results.vertical = out;
});

it("drop-height table for landing damage (W01, engine ranks)", { timeout: 300000 }, () => {
  const out: Record<string, unknown> = {};
  for (const engine of [0, 1, 2, 5, 9]) {
    const rows: Record<string, number> = {};
    for (const drop of [2, 4, 8, 12, 16, 20, 30, 50]) {
      const game = make("W01", engine);
      flatWorld(game, 0);
      const w = game.world;
      const floorRow = 55;
      for (let x = 0; x < w.width; x++) w.tiles[floorRow * w.width + x] = 1;
      place(game, 10.5, floorRow - drop - 0.36);
      const hull0 = game.state.vehicle.hull;
      run(game, {}, 15);
      rows[`drop${drop}tiles`] = hull0 - game.state.vehicle.hull;
    }
    out[`engine${engine}`] = rows;
  }
  results.landingDamageByDrop = out;
});

it("drill durations: formula vs measured, per material, depth, rank and direction", { timeout: 300000 }, () => {
  const out: Record<string, unknown> = {};
  const measure = (world: World, drill: number, material: number, row: number, direction: "down" | "left" | "right") => {
    const game = make(world, 0, drill);
    flatWorld(game, 0);
    const w = game.world;
    // ground under the rig at `row`, target tile at row (down) or beside (side)
    if (direction === "down") {
      for (let x = 0; x < w.width; x++) w.tiles[row * w.width + x] = material;
      place(game, 10.5, row - 0.36);
    } else {
      for (let x = 0; x < w.width; x++) w.tiles[(row + 1) * w.width + x] = 1; // floor
      w.tiles[row * w.width + 12] = material; // wall to the right
      place(game, 11.5, row + 1 - 0.36);
    }
    const mined0 = game.state.stats.mined;
    const e0 = game.state.vehicle.energy;
    let t = 0, started = NaN;
    const controls: CampaignControls = direction === "down" ? { down: true } : { right: true };
    while (t < 20 && game.state.stats.mined === mined0) {
      game.tick(1 / 240, controls);
      t += 1 / 240;
      if (isNaN(started) && game.drillTarget) started = t;
    }
    return { seconds: r3(t - (isNaN(started) ? 0 : started) ), totalFromInput: r3(t), energy: r3(e0 - game.state.vehicle.energy) };
  };
  for (const world of ["W01", "W02"] as World[]) {
    const deepest = world === "W01" ? 59 : 99;
    for (const drill of world === "W01" ? [0, 1] : [0, 1, 2]) {
      for (const material of [1, 2]) {
        for (const row of [0, 20, 40, deepest]) {
          out[`${world}_drill${drill}_${material === 1 ? "soil" : "stone"}_row${row}_down`] = measure(world, drill, material, row, "down");
        }
        out[`${world}_drill${drill}_${material === 1 ? "soil" : "stone"}_row1_side`] = measure(world, drill, material, 1, "right");
        out[`${world}_drill${drill}_${material === 1 ? "soil" : "stone"}_row${deepest - 1}_side`] = measure(world, drill, material, deepest - 1, "right");
      }
    }
  }
  results.drill = out;
});

it("cut chaining gap, mid-cut input handling and facing flip", { timeout: 300000 }, () => {
  const game = make("W01", 0, 0);
  flatWorld(game, 1);
  place(game, 10.5, SURFACE_Y);
  const completions: number[] = [];
  const starts: number[] = [];
  let t = 0, last = game.state.stats.mined, hadTarget = false;
  while (t < 6) {
    game.tick(1 / 240, { down: true });
    t += 1 / 240;
    if (game.drillTarget && !hadTarget) starts.push(r3(t));
    hadTarget = Boolean(game.drillTarget);
    if (game.state.stats.mined > last) { completions.push(r3(t)); last = game.state.stats.mined; }
  }
  const gaps = starts.slice(1).map((s, i) => r3(s - completions[i]!));
  // up pressed mid-cut: does the cut continue? horizontal mid-cut: does facing flip while drill points down?
  const g2 = make("W01", 0, 0);
  flatWorld(g2, 2); // stone, long cut
  place(g2, 10.5, SURFACE_Y);
  g2.tick(1 / 60, { down: true });
  const progressAfterStart = g2.drillProgress;
  g2.tick(0.2, { up: true });
  const stillCutting = Boolean(g2.drillTarget);
  const facingBefore = g2.facing;
  g2.tick(0.05, { left: true });
  const facingAfterLeftMidCut = g2.facing;
  const dirMidCut = g2.drillDirection;
  // time from up-press to actually leaving the cut
  let tUp = 0;
  while (g2.drillTarget && tUp < 5) { g2.tick(1 / 240, { up: true }); tUp += 1 / 240; }
  results.chaining = {
    downCutStartsS: starts.slice(0, 5), downCutCompletionsS: completions.slice(0, 5),
    gapBetweenCompletionAndNextStartS: gaps.slice(0, 4),
    progressAfterFirstFrame: r3(progressAfterStart),
    upPressedMidCut_cutContinues: stillCutting,
    facingBefore, facingAfterLeftMidCut, drillDirectionMidCut: dirMidCut,
    upHeldWaitUntilCutEndsS: r3(tUp),
  };
});

it("side-cut trigger distance and accidental wall cuts while driving", { timeout: 300000 }, () => {
  const game = make("W01", 0, 0);
  flatWorld(game, 0);
  const w = game.world;
  for (let x = 0; x < w.width; x++) w.tiles[0 * w.width + x] = 1; // floor row 0
  // build a 1-tile-high wall step at column 20, row -1 is air (y<0 always air) -> use underground tunnel instead
  for (let x = 0; x < w.width; x++) { w.tiles[10 * w.width + x] = 1; w.tiles[9 * w.width + x] = 0; }
  w.tiles[9 * w.width + 20] = 2; // stone block in the tunnel
  place(game, 14.5, 10 - 0.36);
  let t = 0, cutStartX = NaN, cutStartV = NaN, prevV = 0;
  while (t < 5 && !game.drillTarget) {
    prevV = game.velocityX;
    game.tick(1 / 240, { right: true });
    t += 1 / 240;
  }
  cutStartX = game.state.vehicle.x;
  cutStartV = prevV;
  const gapToWall = 20 - (cutStartX + 0.39);
  // a mid-air rig pressing into a wall: does it cut? (it should not: needs support)
  const g2 = make("W01", 0, 0);
  flatWorld(g2, 0);
  for (let y = 0; y < g2.world.rows; y++) g2.world.tiles[y * g2.world.width + 20] = 1; // vertical wall column 20
  place(g2, 19.5, 30);
  let airCut = false;
  for (let i = 0; i < 120; i++) { g2.tick(1 / 60, { right: true, up: i % 2 === 0 }); if (g2.drillTarget) airCut = true; }
  // right+up held against a wall from the ground: does Up block the side cut?
  const g3 = make("W01", 0, 0);
  flatWorld(g3, 0);
  for (let x = 0; x < g3.world.width; x++) g3.world.tiles[10 * g3.world.width + x] = 1;
  g3.world.tiles[9 * g3.world.width + 20] = 1;
  place(g3, 19.5, 10 - 0.36);
  g3.tick(1 / 60, { right: true, up: true });
  const cutWithUp = Boolean(g3.drillTarget);
  // timing: from arriving at full speed to the cut beginning: velocity at start
  results.sideCut = {
    cutBeganAtRigX: r3(cutStartX), gapFromBodyToWallTiles: r3(gapToWall), speedWhenCutBegan: r3(cutStartV),
    timeDrivingBeforeCut: r3(t),
    hoveringAgainstWallStartsCut: airCut,
    rightPlusUpOnGroundStartsCut: cutWithUp,
  };
});

it("input buffering: a short Down tap just before landing", { timeout: 300000 }, () => {
  const out: Record<string, unknown> = {};
  for (const leadMs of [0, 50, 100, 150]) {
    const game = make("W01", 0, 0);
    flatWorld(game, 0);
    const w = game.world;
    for (let x = 0; x < w.width; x++) w.tiles[20 * w.width + x] = 1;
    place(game, 10.5, 17);
    // fall until we predict landing within leadMs, then tap down for 60 ms and release
    let t = 0;
    const landY = 20 - 0.36;
    while (t < 5) {
      const v = Math.max(game.velocityY, 0.01);
      const eta = (landY - game.state.vehicle.y) / v;
      if (eta * 1000 <= leadMs + 60) break;
      game.tick(1 / 240, {});
      t += 1 / 240;
    }
    for (let i = 0; i < Math.round(0.06 * 240); i++) game.tick(1 / 240, { down: true });
    let cut = Boolean(game.drillTarget);
    for (let i = 0; i < 240; i++) { game.tick(1 / 240, {}); if (game.drillTarget) cut = true; }
    out[`tapEnds${leadMs}msBeforeLanding`] = { cutStarted: cut };
  }
  results.inputBuffer = out;
});

it("energy and fuel per second by activity, and per-tile drilling cost", { timeout: 300000 }, () => {
  const game = make("W01", 0, 0);
  results.fuelRates = {
    idleUndergroundPerS: 0.063, drivePerS: 0.126, thrustPerS: 0.126, drillPerS: 0.252,
    sourceLines: "model.ts:398-406",
    stockEnergy: 10, startEnergy: game.state.vehicle.energy === HARDWARE_LEVELS.energy[9] ? 6 : game.state.vehicle.energy,
  };
});

it("camera follow math (scene.ts:992-1009) at measured speeds", { timeout: 300000 }, () => {
  // camera = exponential approach with rate 8/s toward target = rig + 0.06 * vx * tile
  const tau = 1 / 8;
  const out: Record<string, unknown> = {};
  for (const v of [1, 5, 6]) {
    out[`v${v}`] = {
      lookAheadTiles: r3(0.06 * v),
      steadyLagTiles: r3(v * tau),
      netRigOffsetFromCameraCentreTiles: r3(v * tau - 0.06 * v),
    };
  }
  results.camera = { timeConstantS: tau, ...out };
});

it("write results", { timeout: 300000 }, () => {
  writeFileSync(OUT, JSON.stringify(results, null, 2));
});
