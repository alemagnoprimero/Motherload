// Supplementary world-design measurements: cave lanes, hidden caves beside the
// mission shaft, relic sightings and per-seed variety. Read-only.
import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01, createW02 } from "/home/user/Motherload/src/campaign/world.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import { W02 } from "/home/user/Motherload/src/campaign/frontier.ts";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/world/out";
const SEEDS = 200;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

type Id = "W01" | "W02";
const make = (id: Id, s: number) => (id === "W01" ? createW01(s) : createW02(s));
const DEF = { W01, W02 };
const SHAFT = { W01: 20, W02: 24 };

function lanes(id: Id) {
  const w = DEF[id].width;
  const hist = Array(w).fill(0);
  for (let s = 1; s <= SEEDS; s++) {
    const world = make(id, s);
    for (let k = 0; k < world.tiles.length; k++)
      if (world.tiles[k] === 0) hist[k % w]++;
  }
  return hist.map((n) => round(n / SEEDS, 2));
}

/** Per row: is there a cave within the 4.5-cell lamp radius of the shaft, and is it hidden? */
function hiddenCaves(id: Id) {
  const def = DEF[id];
  const w = def.width;
  const rowsWithCaveInRadius: number[] = [];
  const hiddenCaveCells: number[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    const state = createCampaign(s);
    if (id === "W02") {
      state.worlds.W02 = createW02(s);
      state.currentWorld = "W02";
    }
    const game = new Campaign(state);
    const world = game.world;
    const pristine = [...world.tiles];
    let rows = 0;
    let hidden = 0;
    const c = SHAFT[id];
    for (let r = 0; r < def.rows; r++) {
      world.tiles[r * w + c] = 0;
      game.state.vehicle.x = c + 0.5;
      game.state.vehicle.y = r + 1 - 0.36;
      game.refreshVisibility();
      let inRadius = false;
      for (let rr = Math.max(0, r - 4); rr <= Math.min(def.rows - 1, r + 5); rr++)
        for (let cc = c - 5; cc <= c + 5; cc++) {
          const col = ((cc % w) + w) % w;
          const k = rr * w + col;
          if (cc === c) continue;
          if (pristine[k] !== 0) continue;
          if (Math.hypot(cc + 0.5 - (c + 0.5), rr + 0.5 - (r + 0.64)) > 4.5) continue;
          inRadius = true;
          if (!game.isVisible(col, rr)) hidden++;
        }
      if (inRadius) rows++;
    }
    rowsWithCaveInRadius.push(rows);
    hiddenCaveCells.push(hidden);
  }
  return {
    rowsOfShaftWithAirWithinLampRadius: round(mean(rowsWithCaveInRadius), 1),
    ofRows: def.rows,
    hiddenAirCellSightingsPerDescent: round(mean(hiddenCaveCells), 1),
  };
}

/** How much of the generated layout is identical across seeds? */
function variety(id: Id) {
  const def = DEF[id];
  const n = def.width * def.rows;
  const airCount = new Array(n).fill(0);
  for (let s = 1; s <= SEEDS; s++) {
    const world = make(id, s);
    for (let k = 0; k < n; k++) if (world.tiles[k] === 0) airCount[k]++;
  }
  // Probability that a given row (lane) has a cave: by row, any air in left/right lanes
  const rowAir = Array.from({ length: def.rows }, (_, r) =>
    round(
      mean(
        Array.from({ length: def.width }, (_, c) => airCount[r * def.width + c] / SEEDS),
      ) * 100,
      1,
    ),
  );
  return { rowAirPct: rowAir };
}

describe("supplement", () => {
  it("lanes, hidden caves, variety", () => {
    const out = {
      caveColumnMeanAirCells: { W01: lanes("W01"), W02: lanes("W02") },
      hiddenCaves: { W01: hiddenCaves("W01"), W02: hiddenCaves("W02") },
      variety: { W01: variety("W01"), W02: variety("W02") },
    };
    writeFileSync(`${OUT}/supplement.json`, JSON.stringify(out, null, 1));
  }, 600_000);
});
