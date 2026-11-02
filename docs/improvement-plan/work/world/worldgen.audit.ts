// World-design audit: headless multi-seed measurements of W01/W02 generation.
// Run: cd /home/user/Motherload && npx vitest run --dir <this dir>
// Writes JSON to ./out/. Read-only with respect to the repository.
import { describe, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { createW01, createW02 } from "/home/user/Motherload/src/campaign/world.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import { W02, W02_HAZARDS } from "/home/user/Motherload/src/campaign/frontier.ts";
import {
  Campaign,
  createCampaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import type {
  CampaignState,
  CampaignWorld,
} from "/home/user/Motherload/src/campaign/types.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/world/out";
mkdirSync(OUT, { recursive: true });
const SEEDS = 200;
const HALF_Y = 0.36;

type WorldId = "W01" | "W02";
const DEF = { W01, W02 } as const;
const CORRIDOR: Record<WorldId, [number, number]> = {
  W01: [18, 23],
  W02: [22, 27],
};
const SHAFT_COL: Record<WorldId, number> = { W01: 20, W02: 24 };

const wrapC = (c: number, w: number) => ((c % w) + w) % w;
const q = (values: number[], p: number) => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]!;
};
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const summary = (v: number[]) => ({
  n: v.length,
  mean: round(mean(v)),
  min: q(v, 0),
  p10: q(v, 0.1),
  median: q(v, 0.5),
  p90: q(v, 0.9),
  max: q(v, 1),
});

function oreNo(itemId: string) {
  const m = /-O(\d)$/.exec(itemId);
  return m ? Number(m[1]) : 0;
}

/** 4-connected air components with horizontal wrap. */
function components(world: CampaignWorld) {
  const { width: w, rows: h, tiles } = world;
  const seen = new Int32Array(w * h).fill(-1);
  const comps: {
    cells: number[];
    size: number;
    minRow: number;
    maxRow: number;
    columns: number;
    centroidRow: number;
  }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (tiles[i] !== 0 || seen[i] !== -1) continue;
    const id = comps.length;
    const cells: number[] = [];
    const stack = [i];
    seen[i] = id;
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      const c = k % w,
        r = Math.floor(k / w);
      const nb = [
        r * w + wrapC(c - 1, w),
        r * w + wrapC(c + 1, w),
        r > 0 ? k - w : -1,
        r < h - 1 ? k + w : -1,
      ];
      for (const n of nb)
        if (n >= 0 && tiles[n] === 0 && seen[n] === -1) {
          seen[n] = id;
          stack.push(n);
        }
    }
    const rowsOf = cells.map((k) => Math.floor(k / w));
    comps.push({
      cells,
      size: cells.length,
      minRow: Math.min(...rowsOf),
      maxRow: Math.max(...rowsOf),
      columns: new Set(cells.map((k) => k % w)).size,
      centroidRow: mean(rowsOf),
    });
  }
  return { comps, compOf: seen };
}

function makeWorld(id: WorldId, seed: number) {
  return id === "W01" ? createW01(seed) : createW02(seed);
}

/** Build a Campaign whose active world is `id`, using the real visibility code. */
function makeCampaign(id: WorldId, seed: number) {
  const state: CampaignState = createCampaign(seed);
  if (id === "W02") {
    state.worlds.W02 = createW02(seed);
    state.currentWorld = "W02";
    state.vehicle.x = W02.spawnX;
  }
  const game = new Campaign(state);
  return game;
}

/** Type keys for novelty accounting. */
function cellTypes(
  id: WorldId,
  world: CampaignWorld,
  pristine: number[],
  index: number,
  shaftCells: Set<number>,
  pkgByCell: Map<number, string[]>,
) {
  const out: string[] = [];
  const t = pristine[index]!;
  if (t === 1) out.push(id === "W01" ? "material:soil" : "material:ice");
  else if (t === 2) out.push("material:rock");
  else if (t === 0 && !shaftCells.has(index)) out.push("cave");
  for (const p of pkgByCell.get(index) ?? []) out.push(p);
  return out;
}

interface WalkResult {
  /** per 50 m band: counts */
  bands: {
    ores: number;
    oreValue: number;
    rare: number;
    rock: number;
    caveCells: number;
    relic: number;
    hazard: number;
    landmark: number;
    newTypes: string[];
    notable: number;
  }[];
  oreRows: number[];
  discoveredCells: number;
  digs: number;
}

/**
 * Walks a dig path with the real Campaign.refreshVisibility().
 * path: ordered list of [column,row] cells to excavate; the rig stands in each
 * cell (bottom-aligned) after digging it. Band attribution uses the rig row.
 */
function walk(id: WorldId, seed: number, path: [number, number][]): WalkResult {
  const game = makeCampaign(id, seed);
  const world = game.world;
  const w = world.width;
  const pristine = [...world.tiles];
  const bandsN = Math.ceil(world.rows / 5);
  const bands: WalkResult["bands"] = Array.from({ length: bandsN }, () => ({
    ores: 0,
    oreValue: 0,
    rare: 0,
    rock: 0,
    caveCells: 0,
    relic: 0,
    hazard: 0,
    landmark: 0,
    newTypes: [],
    notable: 0,
  }));
  const pkgByCell = new Map<number, string[]>();
  for (const p of world.packages) {
    const k = Math.floor(p.y) * w + Math.floor(p.x);
    const n = oreNo(p.itemId);
    const key = p.tags.includes("relic") ? "relic" : `ore:O${n}`;
    pkgByCell.set(k, [...(pkgByCell.get(k) ?? []), key]);
  }
  const valueByCell = new Map<number, number>();
  for (const p of world.packages)
    if (!p.tags.includes("relic")) {
      const k = Math.floor(p.y) * w + Math.floor(p.x);
      valueByCell.set(k, (valueByCell.get(k) ?? 0) + p.value / 10);
    }
  // Hazard cells and landmark cells (by type)
  const hazardCells = new Map<number, string>();
  if (id === "W01")
    for (const s of world.shelves)
      hazardCells.set(Math.floor(s.y) * w + Math.floor(s.x), "hazard:shelf");
  else {
    for (const p of W02_HAZARDS.coldPockets)
      hazardCells.set(Math.floor(p.y) * w + Math.floor(p.x), "hazard:cold");
    for (const v of W02_HAZARDS.vents)
      hazardCells.set(Math.floor(v.y) * w + Math.floor(v.x), "hazard:vent");
  }
  const landmarkCells = new Map<number, string>();
  if (id === "W01") {
    landmarkCells.set(W01.beaconRow * w + Math.floor(W01.spawnX), "landmark:beacon");
    for (const m of world.missions)
      landmarkCells.set(
        Math.floor(m.y) * w + Math.floor(m.x),
        "landmark:" + m.id.replace("W01-", "").toLowerCase(),
      );
  } else {
    for (const m of world.missions)
      landmarkCells.set(
        Math.floor(m.y) * w + Math.floor(m.x),
        m.id.startsWith("W02-SAMPLE") ? "landmark:sample-seam" : "landmark:catalyst",
      );
    for (const p of world.packages)
      if (
        p.tags.includes("cryosample") &&
        [W02.cryoRow, W02.cryoRow + 1].includes(Math.floor(p.y)) &&
        Math.floor(p.x) >= 22 &&
        Math.floor(p.x) <= 25
      )
        landmarkCells.set(Math.floor(p.y) * w + Math.floor(p.x), "landmark:cryo-vein");
  }
  const seenTypes = new Set<string>();
  const shaftCells = new Set<number>();
  const firstSeen = new Map<number, number>(); // cell -> rig row
  let digs = 0;
  const oreRows: number[] = [];
  const account = (rigRow: number) => {
    const band = Math.max(0, Math.min(bandsN - 1, Math.floor(rigRow / 5)));
    for (let k = 0; k < world.discovered.length; k++) {
      if (world.discovered[k] !== 1 || firstSeen.has(k)) continue;
      firstSeen.set(k, rigRow);
      const types = cellTypes(id, world, pristine, k, shaftCells, pkgByCell);
      const extra: string[] = [];
      if (hazardCells.has(k)) extra.push(hazardCells.get(k)!);
      if (landmarkCells.has(k)) extra.push(landmarkCells.get(k)!);
      const all = [...types, ...extra];
      const b = bands[band]!;
      for (const t of all) {
        if (t.startsWith("ore:")) {
          b.ores++;
          b.oreValue += valueByCell.get(k) ?? 0;
          oreRows.push(rigRow);
          if (t === "ore:O3" || t === "ore:O4") b.rare++;
        } else if (t === "material:rock") b.rock++;
        else if (t === "cave") b.caveCells++;
        else if (t === "relic") b.relic++;
        else if (t.startsWith("hazard")) b.hazard++;
        else if (t.startsWith("landmark")) b.landmark++;
        if (!seenTypes.has(t)) {
          seenTypes.add(t);
          b.newTypes.push(t);
        }
      }
      if (
        all.some(
          (t) =>
            t === "cave" ||
            t === "relic" ||
            t.startsWith("hazard") ||
            t.startsWith("landmark") ||
            t === "ore:O3" ||
            t === "ore:O4",
        )
      )
        b.notable++;
    }
  };
  // Surface view first.
  game.refreshVisibility();
  account(0);
  for (const [c, r] of path) {
    const k = r * w + wrapC(c, w);
    if (world.tiles[k] !== 0) digs++;
    world.tiles[k] = 0;
    shaftCells.add(k);
    game.state.vehicle.x = wrapC(c, w) + 0.5;
    game.state.vehicle.y = r + 1 - HALF_Y;
    game.refreshVisibility();
    account(r);
  }
  return {
    bands,
    oreRows,
    discoveredCells: world.discovered.filter((x) => x === 1).length,
    digs,
  };
}

function shaftPath(id: WorldId): [number, number][] {
  const c = SHAFT_COL[id];
  return Array.from({ length: DEF[id].rows }, (_, r) => [c, r] as [number, number]);
}

/** Shaft plus a +-10 cell lateral tunnel every 50 m (rows 4, 9, 14, ...). */
function combPath(id: WorldId): [number, number][] {
  const c = SHAFT_COL[id];
  const out: [number, number][] = [];
  for (let r = 0; r < DEF[id].rows; r++) {
    out.push([c, r]);
    if (r % 5 === 4) {
      for (let d = 1; d <= 10; d++) out.push([c + d, r]);
      for (let d = 1; d <= 10; d++) out.push([c - d, r]);
      out.push([c, r]);
    }
  }
  return out;
}

function analyseWorld(id: WorldId) {
  const def = DEF[id];
  const w = def.width,
    h = def.rows;
  const res: Record<string, unknown> = {};
  const emptyFrac: number[] = [],
    rockFrac: number[] = [];
  const caveCounts: number[] = [],
    caveSizes: number[] = [],
    caveHeights: number[] = [],
    caveWidths: number[] = [],
    largest: number[] = [],
    caves10: number[] = [],
    caves20: number[] = [];
  const bandEmpty: number[][] = Array.from({ length: h / 10 }, () => []);
  const bandRock: number[][] = Array.from({ length: h / 10 }, () => []);
  const bandOres: number[][] = Array.from({ length: h / 10 }, () => []);
  const bandValue: number[][] = Array.from({ length: h / 10 }, () => []);
  const bandRare: number[][] = Array.from({ length: h / 10 }, () => []);
  const bandCaves: number[][] = Array.from({ length: h / 10 }, () => []);
  const firstRow: Record<string, number[]> = { O1: [], O2: [], O3: [], O4: [] };
  const oreCaveAdj: number[] = [],
    solidCaveAdj: number[] = [];
  const oresPerCave: number[] = [];
  const relicCount: number[] = [],
    relicRow: number[] = [],
    relicInCorridor: number[] = [],
    relicFirst100: number[] = [],
    relicLateral: number[] = [];
  const corridorRock: number[] = [],
    corridorAir: number[] = [];
  const lateralValue: number[][] = Array.from({ length: Math.floor(w / 2) + 1 }, () => []);
  const lateralDensity: number[][] = Array.from({ length: Math.floor(w / 2) + 1 }, () => []);
  const shelfInfo: Record<string, number[]> = {
    airAbove: [],
    componentBelowSize: [],
    lateralFromCorridor: [],
  };
  const shelfPositions = new Set<string>();
  const caveRowPhase: number[] = [];
  const totalValue: number[] = [];
  const valueWithin3: number[] = [];
  const depositCount: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = makeWorld(id, seed);
    const tiles = world.tiles;
    emptyFrac.push(tiles.filter((t) => t === 0).length / tiles.length);
    rockFrac.push(tiles.filter((t) => t === 2).length / tiles.length);
    const { comps, compOf } = components(world);
    caveCounts.push(comps.length);
    for (const c of comps) {
      caveSizes.push(c.size);
      caveHeights.push(c.maxRow - c.minRow + 1);
      caveWidths.push(c.columns);
      caveRowPhase.push(
        id === "W01" ? (Math.round(c.centroidRow) - 9 + 400) % 4 : (Math.round(c.centroidRow) - 12 + 600) % 6,
      );
    }
    largest.push(Math.max(...comps.map((c) => c.size)));
    caves10.push(comps.filter((c) => c.size >= 10).length);
    caves20.push(comps.filter((c) => c.size >= 20).length);
    for (let b = 0; b < h / 10; b++) {
      let e = 0,
        r = 0;
      for (let row = b * 10; row < b * 10 + 10; row++)
        for (let col = 0; col < w; col++) {
          const t = tiles[row * w + col];
          if (t === 0) e++;
          if (t === 2) r++;
        }
      bandEmpty[b]!.push(e / (10 * w));
      bandRock[b]!.push(r / (10 * w));
      bandCaves[b]!.push(
        comps.filter((c) => Math.floor(c.centroidRow / 10) === b).length,
      );
    }
    const ordinary = world.packages.filter((p) => p.tags.includes("ordinary"));
    depositCount.push(ordinary.length);
    totalValue.push(ordinary.reduce((a, p) => a + p.value / 10, 0));
    for (let b = 0; b < h / 10; b++) {
      const inBand = ordinary.filter((p) => Math.floor(p.y / 10) === b);
      bandOres[b]!.push(inBand.length);
      bandValue[b]!.push(inBand.reduce((a, p) => a + p.value / 10, 0));
      bandRare[b]!.push(inBand.filter((p) => oreNo(p.itemId) >= 3).length);
    }
    for (const n of [1, 2, 3, 4]) {
      const rows = ordinary
        .filter((p) => oreNo(p.itemId) === n)
        .map((p) => Math.floor(p.y));
      firstRow[`O${n}`]!.push(rows.length ? Math.min(...rows) : NaN);
    }
    // Cave adjacency
    const isAdjAir = (k: number) => {
      const c = k % w,
        r = Math.floor(k / w);
      return [
        r * w + wrapC(c - 1, w),
        r * w + wrapC(c + 1, w),
        r > 0 ? k - w : -1,
        r < h - 1 ? k + w : -1,
      ].some((n) => n >= 0 && tiles[n] === 0);
    };
    let solid = 0,
      solidAdj = 0;
    for (let k = 0; k < tiles.length; k++)
      if (tiles[k] !== 0) {
        solid++;
        if (isAdjAir(k)) solidAdj++;
      }
    solidCaveAdj.push(solidAdj / solid);
    const oreCells = ordinary.map((p) => Math.floor(p.y) * w + Math.floor(p.x));
    oreCaveAdj.push(oreCells.filter(isAdjAir).length / oreCells.length);
    // ores per cave (deposits touching each component)
    const touch = new Map<number, number>();
    for (const k of oreCells) {
      const c = k % w,
        r = Math.floor(k / w);
      const ids = new Set<number>();
      for (const n of [
        r * w + wrapC(c - 1, w),
        r * w + wrapC(c + 1, w),
        r > 0 ? k - w : -1,
        r < h - 1 ? k + w : -1,
      ])
        if (n >= 0 && tiles[n] === 0) ids.add(compOf[n]!);
      for (const i of ids) touch.set(i, (touch.get(i) ?? 0) + 1);
    }
    for (let i = 0; i < comps.length; i++) oresPerCave.push(touch.get(i) ?? 0);
    // Relics
    const relics = world.packages.filter((p) => p.tags.includes("relic"));
    relicCount.push(relics.length);
    const [c0, c1] = CORRIDOR[id];
    const centre = (c0 + c1 + 1) / 2;
    for (const r of relics) {
      relicRow.push(Math.floor(r.y));
      relicInCorridor.push(r.x >= c0 && r.x < c1 + 1 ? 1 : 0);
      relicFirst100.push(r.y < 10 ? 1 : 0);
      relicLateral.push(
        Math.abs(((r.x - centre + w / 2 + w) % w) - w / 2),
      );
    }
    // Corridor sterility
    let cr = 0,
      ca = 0;
    for (let row = 0; row < h; row++)
      for (let col = c0; col <= c1; col++) {
        if (tiles[row * w + col] === 2) cr++;
        if (tiles[row * w + col] === 0) ca++;
      }
    corridorRock.push(cr);
    corridorAir.push(ca);
    // Lateral value profile: distance (in columns) from the shaft column.
    const shaft = SHAFT_COL[id] + 0.5;
    const perDist = new Map<number, { v: number; n: number; s: number }>();
    for (let k = 0; k < tiles.length; k++) {
      const col = k % w;
      const d = Math.round(Math.abs(((col + 0.5 - shaft + w / 2 + w) % w) - w / 2) - 0.0001);
      const e = perDist.get(d) ?? { v: 0, n: 0, s: 0 };
      if (tiles[k] !== 0) e.s++;
      perDist.set(d, e);
    }
    let within3 = 0;
    for (const p of ordinary) {
      const d = Math.round(Math.abs(((p.x - shaft + w / 2 + w) % w) - w / 2) - 0.0001);
      const e = perDist.get(d)!;
      e.v += p.value / 10;
      e.n++;
      if (d <= 3) within3 += p.value / 10;
    }
    valueWithin3.push(within3 / ordinary.reduce((a, p) => a + p.value / 10, 0));
    for (const [d, e] of perDist) {
      if (d < lateralValue.length) {
        lateralValue[d]!.push(e.v);
        lateralDensity[d]!.push(e.s ? e.n / e.s : 0);
      }
    }
    // Shelves
    for (const s of world.shelves) {
      const col = Math.floor(s.x),
        row = Math.floor(s.y);
      shelfPositions.add(`${col},${row}`);
      shelfInfo.airAbove!.push(tiles[(row - 1) * w + col] === 0 ? 1 : 0);
      const below = (row + 1) * w + col;
      shelfInfo.componentBelowSize!.push(
        tiles[below] === 0 ? comps[compOf[below]!]!.size : 0,
      );
      shelfInfo.lateralFromCorridor!.push(
        Math.min(Math.abs(col - c0), Math.abs(col - c1)),
      );
    }
  }
  const bandsTable = Array.from({ length: h / 10 }, (_, b) => ({
    band: `${b * 100}-${b * 100 + 100} m`,
    emptyPct: round(mean(bandEmpty[b]!) * 100, 1),
    rockPct: round(mean(bandRock[b]!) * 100, 1),
    caves: round(mean(bandCaves[b]!), 2),
    ores: round(mean(bandOres[b]!), 1),
    valueCR: round(mean(bandValue[b]!), 0),
    rareO3O4: round(mean(bandRare[b]!), 2),
  }));
  res.world = id;
  res.seeds = SEEDS;
  res.size = { width: w, rows: h, cells: w * h };
  res.depositCount = summary(depositCount);
  res.totalOrdinaryValueCR = summary(totalValue);
  res.emptyPct = summary(emptyFrac.map((x) => round(x * 100, 2)));
  res.rockPct = summary(rockFrac.map((x) => round(x * 100, 2)));
  res.caves = {
    componentsPerWorld: summary(caveCounts),
    sizeCells: summary(caveSizes),
    heightRows: summary(caveHeights),
    widthCols: summary(caveWidths),
    largestPerWorld: summary(largest),
    componentsAtLeast10Cells: summary(caves10),
    componentsAtLeast20Cells: summary(caves20),
    centroidRowPhaseHistogram: [0, 1, 2, 3, 4, 5]
      .slice(0, id === "W01" ? 4 : 6)
      .map((p) => caveRowPhase.filter((x) => x === p).length),
    oresTouchingEachCave: summary(oresPerCave),
    cavesWithNoAdjacentOrePct: round(
      (oresPerCave.filter((x) => x === 0).length / oresPerCave.length) * 100,
      1,
    ),
    oreCellsAdjacentToAirPct: round(mean(oreCaveAdj) * 100, 1),
    solidCellsAdjacentToAirPct: round(mean(solidCaveAdj) * 100, 1),
  };
  res.bands100m = bandsTable;
  res.firstAppearanceRow = Object.fromEntries(
    Object.entries(firstRow).map(([k, v]) => [k, summary(v.filter((x) => !Number.isNaN(x)))]),
  );
  res.relics = {
    countHistogram: [0, 1, 2].map((n) => relicCount.filter((x) => x === n).length),
    meanPerWorld: round(mean(relicCount), 2),
    rowSummary: summary(relicRow),
    inMissionCorridorPct: round(mean(relicInCorridor) * 100, 1),
    inFirst100mPct: round(mean(relicFirst100) * 100, 1),
    lateralColumnsFromCorridorCentre: summary(relicLateral.map((x) => round(x, 1))),
  };
  res.corridor = {
    columns: CORRIDOR[id],
    rockCellsPerWorld: summary(corridorRock),
    airCellsPerWorld: summary(corridorAir),
  };
  res.lateralProfile = lateralValue.map((v, d) => ({
    columnsFromShaft: d,
    valueCR: round(mean(v), 0),
    depositsPerSolidCell: round(mean(lateralDensity[d]!), 3),
  }));
  res.valueWithin3ColumnsOfShaftPct = round(mean(valueWithin3) * 100, 1);
  if (id === "W01")
    res.shelves = {
      distinctPositionsAcrossSeeds: [...shelfPositions],
      airAbovePct: round(mean(shelfInfo.airAbove!) * 100, 1),
      airRegionBelowSize: summary(shelfInfo.componentBelowSize!),
      lateralFromCorridor: summary(shelfInfo.lateralFromCorridor!),
    };
  else
    res.hazards = {
      fixed: W02_HAZARDS,
      lateralFromCorridorEdge: [
        ...W02_HAZARDS.coldPockets,
        ...W02_HAZARDS.vents,
      ].map((p) => Math.min(Math.abs(p.x - 22), Math.abs(p.x - 28))),
    };
  return res;
}

function analyseWalk(id: WorldId, kind: "shaft" | "comb") {
  const path = kind === "shaft" ? shaftPath(id) : combPath(id);
  const nb = Math.ceil(DEF[id].rows / 5);
  const per = Array.from({ length: nb }, () => ({
    ores: [] as number[],
    value: [] as number[],
    rare: [] as number[],
    rock: [] as number[],
    cave: [] as number[],
    relic: [] as number[],
    hazard: [] as number[],
    landmark: [] as number[],
    newTypes: [] as number[],
    notable: [] as number[],
    newTypeNames: new Map<string, number>(),
  }));
  const gaps: number[] = [],
    maxGap: number[] = [],
    discovered: number[] = [],
    digs: number[] = [];
  const bandsWithNew: number[] = [],
    bandsWithNotable: number[] = [];
  const typesTotal: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = walk(id, seed, path);
    discovered.push(r.discoveredCells);
    digs.push(r.digs);
    r.bands.forEach((b, i) => {
      per[i]!.ores.push(b.ores);
      per[i]!.value.push(b.oreValue);
      per[i]!.rare.push(b.rare);
      per[i]!.rock.push(b.rock);
      per[i]!.cave.push(b.caveCells);
      per[i]!.relic.push(b.relic);
      per[i]!.hazard.push(b.hazard);
      per[i]!.landmark.push(b.landmark);
      per[i]!.newTypes.push(b.newTypes.length);
      per[i]!.notable.push(b.notable);
      for (const t of b.newTypes)
        per[i]!.newTypeNames.set(t, (per[i]!.newTypeNames.get(t) ?? 0) + 1);
    });
    // Count bands from 50 m downward (exclude the surface band 0 where everything is first)
    bandsWithNew.push(r.bands.slice(1).filter((b) => b.newTypes.length > 0).length);
    bandsWithNotable.push(r.bands.slice(1).filter((b) => b.notable > 0).length);
    typesTotal.push(r.bands.reduce((a, b) => a + b.newTypes.length, 0));
    const rows = [...new Set(r.oreRows)].sort((a, b) => a - b);
    let mg = rows.length ? rows[0]! : DEF[id].rows;
    for (let i = 1; i < rows.length; i++) {
      gaps.push((rows[i]! - rows[i - 1]!) * 10);
      mg = Math.max(mg, rows[i]! - rows[i - 1]!);
    }
    mg = Math.max(mg, DEF[id].rows - 1 - (rows.at(-1) ?? 0));
    maxGap.push(mg * 10);
  }
  return {
    world: id,
    path: kind,
    pathCells: path.length,
    seeds: SEEDS,
    discoveredCells: summary(discovered),
    discoveredPctOfWorld: round(
      (mean(discovered) / (DEF[id].width * DEF[id].rows)) * 100,
      1,
    ),
    excavatedCells: summary(digs),
    bands50m: per.map((b, i) => ({
      band: `${i * 50}-${i * 50 + 50} m`,
      ores: round(mean(b.ores), 2),
      oreValueCR: round(mean(b.value), 0),
      rareO3O4: round(mean(b.rare), 2),
      rockCells: round(mean(b.rock), 2),
      caveCellsSeen: round(mean(b.cave), 2),
      relicSeenPct: round(mean(b.relic.map((x) => (x > 0 ? 1 : 0))) * 100, 1),
      hazardSeenPct: round(mean(b.hazard.map((x) => (x > 0 ? 1 : 0))) * 100, 1),
      landmarkSeenPct: round(mean(b.landmark.map((x) => (x > 0 ? 1 : 0))) * 100, 1),
      newTypeEvents: round(mean(b.newTypes), 2),
      newTypes: Object.fromEntries(
        [...b.newTypeNames.entries()].map(([k, v]) => [k, round((v / SEEDS) * 100, 0) + "%"]),
      ),
      notableCells: round(mean(b.notable), 2),
      bandsWithNotablePct: round(mean(b.notable.map((x) => (x > 0 ? 1 : 0))) * 100, 0),
    })),
    bandsBelowSurfaceWithANewContentType: summary(bandsWithNew),
    bandsBelowSurfaceWithANotableEncounter: summary(bandsWithNotable),
    of50mBandsBelowSurface: nb - 1,
    distinctContentTypesMet: summary(typesTotal),
    oreDiscoveryGapM: summary(gaps),
    longestOreDroughtM: summary(maxGap),
  };
}

/** Full-reveal novelty: what each 50 m band contains if fully explored. */
function fullReveal(id: WorldId) {
  const nb = Math.ceil(DEF[id].rows / 5);
  const newCounts: number[][] = Array.from({ length: nb }, () => []);
  const firsts: Map<string, number>[] = Array.from({ length: nb }, () => new Map());
  const notableKinds: number[][] = Array.from({ length: nb }, () => []);
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = makeWorld(id, seed);
    const w = world.width;
    const seen = new Set<string>();
    for (let b = 0; b < nb; b++) {
      const types = new Set<string>();
      for (let row = b * 5; row < b * 5 + 5; row++)
        for (let col = 0; col < w; col++) {
          const t = world.tiles[row * w + col];
          types.add(t === 0 ? "cave" : t === 2 ? "material:rock" : "material:base");
        }
      for (const p of world.packages)
        if (Math.floor(p.y / 5) === b)
          types.add(p.tags.includes("relic") ? "relic" : `ore:O${oreNo(p.itemId)}`);
      if (id === "W01") {
        for (const s of world.shelves) if (Math.floor(s.y / 5) === b) types.add("hazard:shelf");
        if (Math.floor(W01.beaconRow / 5) === b) types.add("landmark:beacon");
        for (const m of world.missions)
          if (Math.floor(m.y / 5) === b) types.add("landmark:" + m.id);
      } else {
        for (const p of W02_HAZARDS.coldPockets) if (Math.floor(p.y / 5) === b) types.add("hazard:cold");
        for (const v of W02_HAZARDS.vents) if (Math.floor(v.y / 5) === b) types.add("hazard:vent");
        for (const m of world.missions)
          if (Math.floor(m.y / 5) === b)
            types.add(m.id.startsWith("W02-SAMPLE") ? "landmark:samples" : "landmark:catalyst");
        if (Math.floor(W02.cryoRow / 5) === b) types.add("landmark:cryo-vein");
      }
      let n = 0;
      for (const t of types)
        if (!seen.has(t)) {
          seen.add(t);
          n++;
          firsts[b]!.set(t, (firsts[b]!.get(t) ?? 0) + 1);
        }
      newCounts[b]!.push(n);
      notableKinds[b]!.push(
        [...types].filter((t) => !t.startsWith("material") && t !== "ore:O1" && t !== "ore:O2").length,
      );
    }
  }
  return Array.from({ length: nb }, (_, b) => ({
    band: `${b * 50}-${b * 50 + 50} m`,
    newContentTypes: round(mean(newCounts[b]!), 2),
    firsts: Object.fromEntries(
      [...firsts[b]!.entries()].map(([k, v]) => [k, round((v / SEEDS) * 100, 0) + "%"]),
    ),
    distinctNonCommonKindsPresent: round(mean(notableKinds[b]!), 2),
  }));
}

describe("world design audit measurements", () => {
  it("generation statistics", () => {
    const out = { W01: analyseWorld("W01"), W02: analyseWorld("W02") };
    writeFileSync(`${OUT}/generation.json`, JSON.stringify(out, null, 1));
  }, 600_000);
  it("walk statistics (real visibility code)", () => {
    const out = {
      W01: { shaft: analyseWalk("W01", "shaft"), comb: analyseWalk("W01", "comb") },
      W02: { shaft: analyseWalk("W02", "shaft"), comb: analyseWalk("W02", "comb") },
    };
    writeFileSync(`${OUT}/walks.json`, JSON.stringify(out, null, 1));
  }, 600_000);
  it("full-reveal novelty", () => {
    const out = { W01: fullReveal("W01"), W02: fullReveal("W02") };
    writeFileSync(`${OUT}/novelty-full-reveal.json`, JSON.stringify(out, null, 1));
  }, 600_000);
});
