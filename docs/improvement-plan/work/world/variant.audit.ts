// Compares the shipped W01 generator with the scratchpad content-layout prototype
// on the same novelty, cave and route metrics (200 seeds, real visibility code).
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01 } from "/home/user/Motherload/src/campaign/world.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import { Campaign, createCampaign } from "/home/user/Motherload/src/campaign/model.ts";
import { createW01Content, type ContentWorld } from "./world-variant-content.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/world/out";
const SEEDS = 200;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const q = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]!;
};
const summary = (v: number[]) => ({ mean: round(mean(v)), min: q(v, 0), median: q(v, 0.5), p90: q(v, 0.9), max: q(v, 1) });
const wrapC = (c: number, w: number) => ((c % w) + w) % w;
type Factory = (seed: number) => ContentWorld | ReturnType<typeof createW01>;

function typeMap(world: ContentWorld | ReturnType<typeof createW01>) {
  const w = world.width;
  const m = new Map<number, string[]>();
  const push = (k: number, t: string) => m.set(k, [...(m.get(k) ?? []), t]);
  for (const p of world.packages) {
    const k = Math.floor(p.y) * w + Math.floor(p.x);
    push(k, p.tags.includes("relic") ? "relic" : `ore:O${p.itemId.slice(-1)}`);
  }
  for (const s of world.shelves) push(Math.floor(s.y) * w + Math.floor(s.x), "hazard:shelf");
  push(W01.beaconRow * w + 20, "landmark:beacon");
  for (const mi of world.missions) push(Math.floor(mi.y) * w + Math.floor(mi.x), "landmark:" + mi.id);
  for (const sp of (world as ContentWorld).setPieces ?? []) {
    for (const k of sp.cells) push(k, "setpiece:" + sp.kind);
    if (sp.cells[0] !== undefined) push(sp.cells[0], "log");
  }
  return m;
}

function walk(factory: Factory, seed: number, path: [number, number][]) {
  const state = createCampaign(seed);
  state.worlds.W01 = factory(seed) as never;
  const game = new Campaign(state);
  const world = game.world;
  const w = world.width;
  const pristine = [...world.tiles];
  const types = typeMap(world as never);
  const nb = 12;
  const bands = Array.from({ length: nb }, () => ({ newTypes: [] as string[], notable: 0, relic: 0 }));
  const seen = new Set<string>(),
    first = new Set<number>(),
    shaft = new Set<number>();
  const account = (rigRow: number) => {
    const b = bands[Math.max(0, Math.min(nb - 1, Math.floor(rigRow / 5)))]!;
    for (let k = 0; k < world.discovered.length; k++) {
      if (world.discovered[k] !== 1 || first.has(k)) continue;
      first.add(k);
      const t = pristine[k];
      const all = [
        t === 1 ? "material:soil" : t === 2 ? "material:rock" : t === 4 ? "material:fused-plate" : !shaft.has(k) ? "cave" : "",
        ...(types.get(k) ?? []),
      ].filter(Boolean);
      for (const x of all)
        if (!seen.has(x)) {
          seen.add(x);
          b.newTypes.push(x);
        }
      if (all.includes("relic")) b.relic++;
      if (all.some((x) => x === "cave" || x === "relic" || x === "log" || x.startsWith("hazard") || x.startsWith("landmark") || x.startsWith("setpiece") || x === "ore:O3" || x === "ore:O4" || x.startsWith("material:fused")))
        b.notable++;
    }
  };
  game.refreshVisibility();
  account(0);
  for (const [c, r] of path) {
    const k = r * w + wrapC(c, w);
    world.tiles[k] = 0;
    shaft.add(k);
    game.state.vehicle.x = wrapC(c, w) + 0.5;
    game.state.vehicle.y = r + 1 - 0.36;
    game.refreshVisibility();
    account(r);
  }
  return bands;
}
const shaftPath = (): [number, number][] => Array.from({ length: 60 }, (_, r) => [20, r]);
const combPath = (): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < 60; r++) {
    out.push([20, r]);
    if (r % 5 === 4) {
      for (let d = 1; d <= 10; d++) out.push([20 + d, r]);
      for (let d = 1; d <= 10; d++) out.push([20 - d, r]);
      out.push([20, r]);
    }
  }
  return out;
};

function caveStats(factory: Factory) {
  const sizes: number[] = [],
    largest: number[] = [],
    big: number[] = [],
    phase: number[] = [0, 0, 0, 0];
  for (let s = 1; s <= SEEDS; s++) {
    const world = factory(s);
    const { width: w, rows: h, tiles } = world;
    const seenC = new Int8Array(w * h);
    const comp: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (tiles[i] !== 0 || seenC[i]) continue;
      const stack = [i];
      seenC[i] = 1;
      const cells: number[] = [];
      while (stack.length) {
        const k = stack.pop()!;
        cells.push(k);
        const c = k % w,
          r = Math.floor(k / w);
        for (const n of [r * w + wrapC(c - 1, w), r * w + wrapC(c + 1, w), r > 0 ? k - w : -1, r < h - 1 ? k + w : -1])
          if (n >= 0 && tiles[n] === 0 && !seenC[n]) {
            seenC[n] = 1;
            stack.push(n);
          }
      }
      comp.push(cells.length);
      const cr = Math.round(mean(cells.map((k) => Math.floor(k / w))));
      phase[(cr - 9 + 400) % 4]!++;
    }
    sizes.push(...comp);
    largest.push(Math.max(...comp));
    big.push(comp.filter((x) => x >= 20).length);
  }
  return { size: summary(sizes), largest: summary(largest), atLeast20: summary(big), rowPhase: phase };
}

function validity(factory: Factory) {
  let bad = 0;
  const value: number[] = [];
  const relics: number[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    const world = factory(s);
    const w = world.width;
    const ordinary = world.packages.filter((p) => p.tags.includes("ordinary"));
    value.push(ordinary.reduce((a, p) => a + p.value, 0));
    relics.push(world.packages.filter((p) => p.tags.includes("relic")).length);
    const locs = new Set(world.packages.map((p) => `${p.x},${p.y}`));
    if (locs.size !== world.packages.length) bad++;
    if (world.packages.some((p) => world.tiles[Math.floor(p.y) * w + Math.floor(p.x)] === 0)) bad++;
    for (let r = 0; r < 60; r++) if (world.tiles[r * w + 20] === 0) bad++;
    for (const m of world.missions) if (world.tiles[Math.floor(m.y) * w + Math.floor(m.x)] === 0) bad++;
    const counts = [1, 2, 3, 4].map((n) => ordinary.filter((p) => p.itemId === `W01-O${n}`).length);
    if (counts.join() !== "240,120,36,4") bad++;
  }
  return { invalidSeeds: bad, ordinaryValueTenths: summary(value), relicsPerWorld: summary(relics), floorTenths: W01.minOrdinary };
}

function walkSummary(factory: Factory, path: [number, number][]) {
  const newBands: number[] = [],
    notableBands: number[] = [],
    relicSeen: number[] = [];
  const perBand = Array.from({ length: 12 }, () => ({ n: [] as number[], names: new Map<string, number>() }));
  for (let s = 1; s <= SEEDS; s++) {
    const bands = walk(factory, s, path);
    newBands.push(bands.slice(1).filter((b) => b.newTypes.length).length);
    notableBands.push(bands.slice(1).filter((b) => b.notable).length);
    relicSeen.push(bands.some((b) => b.relic) ? 1 : 0);
    bands.forEach((b, i) => {
      perBand[i]!.n.push(b.newTypes.length);
      for (const t of b.newTypes) perBand[i]!.names.set(t, (perBand[i]!.names.get(t) ?? 0) + 1);
    });
  }
  return {
    bandsWithNewContentType: summary(newBands),
    bandsWithNotableEncounter: summary(notableBands),
    of: 11,
    relicSeenPct: round(mean(relicSeen) * 100, 1),
    perBand: perBand.map((b, i) => ({
      band: `${i * 50}-${i * 50 + 50} m`,
      newTypes: round(mean(b.n), 2),
      firsts: Object.fromEntries([...b.names.entries()].filter(([, v]) => v >= SEEDS * 0.1).map(([k, v]) => [k, Math.round((v / SEEDS) * 100) + "%"])),
    })),
  };
}

it("shipped vs prototype", () => {
  const shipped: Factory = (s) => createW01(s);
  const proto: Factory = (s) => createW01Content(s);
  const out = {
    shipped: {
      validity: validity(shipped),
      caves: caveStats(shipped),
      shaft: walkSummary(shipped, shaftPath()),
      comb: walkSummary(shipped, combPath()),
    },
    prototype: {
      validity: validity(proto),
      caves: caveStats(proto),
      shaft: walkSummary(proto, shaftPath()),
      comb: walkSummary(proto, combPath()),
    },
  };
  writeFileSync(`${OUT}/variant-compare.json`, JSON.stringify(out, null, 1));
  // also dump two prototype worlds for rendering
  writeFileSync(
    `${OUT}/variant-dump.json`,
    JSON.stringify({
      worlds: [73021, 11].map((s) => {
        const w = createW01Content(s);
        return { id: "W01", seed: s, width: w.width, rows: w.rows, tiles: w.tiles, packages: w.packages.map((p) => ({ itemId: p.itemId, x: p.x, y: p.y, tags: p.tags })), missions: w.missions, shelves: w.shelves, setPieces: w.setPieces };
      }),
    }),
  );
}, 600_000);
