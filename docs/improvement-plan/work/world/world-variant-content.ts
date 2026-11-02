// PROTOTYPE ONLY (scratchpad): a W01 layout with depth bands, per-seed chambers,
// route-adjacent set pieces, per-seed shelves and one placed relic. It keeps the
// pinned mission depths, the 60/30/9/1 ore counts and the post-carving value
// floor, so its novelty metrics can be compared with the shipped createW01.
import { BALANCE_VERSION, W01, W01_ORES } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignPackage, CampaignWorld } from "/home/user/Motherload/src/campaign/types.ts";

export interface SetPiece {
  id: string;
  kind: "salvage-pod" | "survey-camp" | "plate-arch" | "crystal-geode" | "collapsed-shaft";
  band: "A" | "B" | "C" | "D";
  /** interior cells (world indices) */
  cells: number[];
  /** a readable log is attached to this set piece */
  log: string;
}
export type ContentWorld = CampaignWorld & { setPieces: SetPiece[]; plateRows: number[] };

const STARTER = [
  [0, 0, 0, 0, 1, 2, 2],
  [0, 1, 0, 1, 2, 2, 2],
] as const;
export const BANDS = [
  { id: "A", name: "Regolith", rows: [0, 10], rock: 0.06 },
  { id: "B", name: "Broken plates", rows: [11, 29], rock: 0.12 },
  { id: "C", name: "Iron shelf", rows: [30, 47], rock: 0.2 },
  { id: "D", name: "Core rubble", rows: [48, 59], rock: 0.14 },
] as const;
const bandOfRow = (row: number) => BANDS.find((b) => row >= b.rows[0] && row <= b.rows[1])!;

export function createW01Content(seed: number): ContentWorld {
  seed >>>= 0;
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const int = (a: number, b: number) => a + Math.floor(random() * (b - a + 1));
  const shuffle = <T>(v: T[]) => {
    for (let i = v.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [v[i], v[j]] = [v[j]!, v[i]!];
    }
    return v;
  };
  const width = W01.width,
    rows = W01.rows;
  const wrap = (c: number) => ((c % width) + width) % width;
  const indexOf = (c: number, r: number) => r * width + wrap(c);
  const missions: CampaignWorld["missions"] = [
    { id: "W01-VALVE", name: "Lander pressure valve", x: 20.5, y: W01.valveRow + 0.5, status: "source" },
    { id: "W01-ANTENNA", name: "Lander antenna", x: 21.5, y: W01.antennaRow + 0.5, status: "source" },
    { id: "W01-Q", name: "Navigation core", x: 20.5, y: W01.coreRow + 0.5, status: "source" },
  ];
  const missionCells = new Set(missions.map((m) => indexOf(Math.floor(m.x), Math.floor(m.y))));
  // A one-column soil route (was six). Everything else may hold rock, rooms and caves.
  // The antenna at (21, 39) stays protected as a mission cell beside it.
  const route = (c: number) => c === 20;
  const tiles: number[] = Array.from({ length: width * rows }, (_, k) => {
    const c = k % width,
      r = Math.floor(k / width);
    return !route(c) && random() < bandOfRow(r).rock ? 2 : 1;
  });
  const reserved = new Set<number>();
  const carve = (c: number, r: number) => {
    const k = indexOf(c, r);
    if (r >= 8 && r < rows - 1 && !route(wrap(c)) && !missionCells.has(k) && !reserved.has(k)) tiles[k] = 0;
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 < 1) carve(x, y);
  };
  // Band B: plate slabs (horizontal rock runs) and thin fracture slots, no lanes.
  for (let n = 0; n < 7; n++) {
    const r = int(12, 28),
      c = int(0, width - 1),
      len = int(3, 7);
    for (let d = 0; d < len; d++) if (!route(wrap(c + d))) tiles[indexOf(c + d, r)] = 2;
  }
  for (let n = 0; n < 5; n++) ellipse(random() * width, 12 + random() * 16, 2 + random() * 2.5, 0.6 + random() * 0.45);
  // Band C: fused plate stratum (material 4) at rows 30-31 across the claim, and
  // two quiet cavities; one breaches the route's wall so a straight shaft opens it.
  const plateRows = [30, 31];
  for (const r of plateRows) for (let c = 0; c < width; c++) if (!missionCells.has(indexOf(c, r))) tiles[indexOf(c, r)] = 4;
  const sideC = random() < 0.5 ? -1 : 1;
  ellipse(sideC < 0 ? 19.5 - 4.2 : 22.5 + 4.2, 35 + random() * 3, 4.6 + random() * 1.2, 2.2 + random() * 0.8);
  ellipse(random() * width, 41 + random() * 4, 4 + random() * 2, 1.8 + random() * 1);
  // Band D: rubble halls of medium size.
  for (let n = 0; n < 3; n++) ellipse(random() * width, 49 + random() * 8, 2.5 + random() * 1.5, 1.2 + random() * 0.8);

  // Set pieces: stamped after caves; interiors are air; walls are rock.
  const setPieces: SetPiece[] = [];
  const stamp = (
    kind: SetPiece["kind"],
    band: SetPiece["band"],
    x0: number,
    y0: number,
    grid: string[],
    log: string,
  ) => {
    // '.' air interior, '#' rock wall, '=' fused/plate, ' ' leave as is
    const cells: number[] = [];
    grid.forEach((line, dy) =>
      [...line].forEach((ch, dx) => {
        const c = x0 + dx,
          r = y0 + dy;
        if (r < 1 || r >= rows - 1 || route(wrap(c))) return;
        const k = indexOf(c, r);
        if (missionCells.has(k)) return;
        if (ch === ".") {
          tiles[k] = 0;
          cells.push(k);
        } else if (ch === "#") tiles[k] = 2;
        if (ch !== " ") reserved.add(k);
      }),
    );
    setPieces.push({ id: `W01:${kind}:${setPieces.length + 1}`, kind, band, cells, log });
    return cells;
  };
  const side = () => (random() < 0.5 ? -1 : 1);
  // B anchor: a survey camp whose doorway touches the route wall (col 19 or 22).
  {
    const s = side(),
      y = int(15, 22);
    const grid = ["#######", "#.....#", "#.....#", "#######"];
    stamp("survey-camp", "B", s < 0 ? 13 : 21, y, s < 0 ? grid.map((l) => l.slice(0, 6) + ".") : grid.map((l) => "." + l.slice(1)), "camp-log");
  }
  // B free: a salvage pod 6-14 columns from the route.
  {
    const s = side();
    stamp("salvage-pod", "B", s < 0 ? int(4, 12) : int(26, 32), int(19, 27), ["#####", "#...#", "#####"], "pod-log");
  }
  // C anchor: plate arch (rock columns inside the breached cavity) + a log.
  {
    const s = sideC,
      x = s < 0 ? 12 : 23;
    stamp("plate-arch", "C", x, 33, ["#  #  #", "#  #  #"], "arch-log");
  }
  // D anchor: crystal geode beside the route at 480-560 m; holds the relic.
  const geodeY = int(49, 54),
    geodeSide = side();
  const geodeX = geodeSide < 0 ? 15 : 21;
  const geode = stamp(
    "crystal-geode",
    "D",
    geodeX,
    geodeY,
    [" ### ", "#...#", "#...#", "#...#", " ### "].map((l) => (geodeSide < 0 ? l.slice(0, 4) + "." : "." + l.slice(1))),
    "geode-log",
  );
  // D free: collapsed shaft (vertical air column) with a brittle shelf at its top.
  const shaftX = (geodeSide < 0 ? int(26, 34) : int(5, 13)),
    shaftY = int(45, 50);
  stamp("collapsed-shaft", "D", shaftX, shaftY, ["#.#", "#.#", "#.#", "#.#", "#.#"], "shaft-log");

  // Per-seed shelves: the ceilings of three chambers in bands B/C, away from the route.
  const shelves: CampaignWorld["shelves"] = [];
  const ceilingCandidates: number[] = [];
  for (let r = 12; r < 47; r++)
    for (let c = 0; c < width; c++) {
      if (Math.abs(c - 20) < 4) continue;
      const k = indexOf(c, r);
      if (tiles[k] === 1 && tiles[indexOf(c, r + 1)] === 0 && tiles[indexOf(c - 1, r + 1)] === 0 && tiles[indexOf(c + 1, r + 1)] === 0)
        ceilingCandidates.push(k);
    }
  for (const k of shuffle(ceilingCandidates)) {
    if (shelves.length >= 3) break;
    const c = k % width,
      r = Math.floor(k / width);
    if (shelves.some((s) => Math.abs(s.y - (r + 0.5)) < 6)) continue;
    shelves.push({ id: `W01-SHELF-${shelves.length + 1}`, x: c + 0.5, y: r + 0.5, warning: null, collapsed: false });
  }
  const shelfCells = new Set(shelves.map((s) => indexOf(Math.floor(s.x), Math.floor(s.y))));

  // Ores: same 400-package budget and exact 60/30/9/1 mix; min rows follow PROG-P1.
  const packages: CampaignPackage[] = [];
  const occupied = new Set<number>();
  const add = (c: number, r: number, oreIndex: number, extraTags: string[] = []) => {
    const ore = W01_ORES[oreIndex]!;
    packages.push({
      id: `W01:deposit:${r}:${c}`,
      itemId: ore.id,
      name: ore.name,
      origin: "W01",
      balanceVersion: BALANCE_VERSION,
      value: ore.value,
      bulk: ore.bulk,
      mass: ore.mass,
      tags: [...ore.tags, ...extraTags],
      x: c + 0.5,
      y: r + 0.5,
      status: "deposit",
      processedBy: [],
    });
    occupied.add(indexOf(c, r));
  };
  STARTER.forEach((seam, offset) => seam.forEach((ore, r) => add(20 + offset, r, ore)));
  // Geode ring holds the world's rare crystals (2 Goldium + 3 Silverium) around its air.
  const ring = new Set<number>();
  for (const k of geode) {
    const c = k % width,
      r = Math.floor(k / width);
    for (const n of [indexOf(c - 1, r), indexOf(c + 1, r), indexOf(c, r - 1), indexOf(c, r + 1)])
      if (tiles[n] !== 0 && !missionCells.has(n) && !route(n % width)) ring.add(n);
  }
  const ringCells = shuffle([...ring]);
  const preset = [3, 3, 2, 2, 2];
  for (const oreIndex of preset) {
    const k = ringCells.pop();
    if (k === undefined) break;
    tiles[k] = 1;
    add(k % width, Math.floor(k / width), oreIndex, ["geode"]);
  }
  // Reserve the relic's cell in the geode ring before ordinary veins grow.
  const relicCell =
    ringCells.pop() ??
    shuffle(tiles.map((t, k) => k).filter((k) => tiles[k] !== 0 && tiles[k] !== 4 && Math.floor(k / width) >= 48 && !occupied.has(k) && !missionCells.has(k)))[0]!;
  tiles[relicCell] = 1;
  occupied.add(relicCell);
  const candidates = tiles
    .map((t, k) => ({ t, k }))
    .filter(({ t, k }) => t !== 0 && t !== 4 && !occupied.has(k) && !missionCells.has(k) && !shelfCells.has(k) && !(k < width * 10 && [20, 21].includes(k % width)))
    .map(({ k }) => k);
  const depositCount = 400;
  const minRow = [0, 4, 15, 32];
  for (const oreIndex of [3, 2, 1, 0]) {
    let needed = (depositCount * W01_ORES[oreIndex]!.weight) / 100 - packages.filter((p) => p.itemId === W01_ORES[oreIndex]!.id).length;
    const allowed = (k: number) => !occupied.has(k) && Math.floor(k / width) >= minRow[oreIndex]!;
    const anchors = shuffle(candidates.filter(allowed));
    while (needed > 0) {
      let anchor = anchors.pop();
      while (anchor !== undefined && !allowed(anchor)) anchor = anchors.pop();
      if (anchor === undefined) throw new Error("prototype budget");
      const queue = [anchor];
      const size = Math.min(needed, 2 + Math.floor(random() * 3));
      let grown = 0;
      while (queue.length && grown < size) {
        const k = queue.shift()!;
        if (!allowed(k) || tiles[k] === 0 || tiles[k] === 4 || missionCells.has(k) || shelfCells.has(k)) continue;
        add(k % width, Math.floor(k / width), oreIndex);
        needed--;
        grown++;
        const c = k % width;
        queue.push(...shuffle([indexOf(c - 1, Math.floor(k / width)), indexOf(c + 1, Math.floor(k / width)), k - width, k + width]).filter((n) => n >= 0 && n < tiles.length));
      }
    }
  }
  // Exactly one relic, in the geode's ring (reserved above).
  packages.push({
    id: "W01:relic:1",
    itemId: "W01-J",
    name: "Broken asteroid relic",
    origin: "W01",
    balanceVersion: BALANCE_VERSION,
    value: 7500,
    bulk: 2,
    mass: 2.5,
    tags: ["relic"],
    x: (relicCell % width) + 0.5,
    y: Math.floor(relicCell / width) + 0.5,
    status: "deposit",
    processedBy: [],
  });
  return {
    id: "W01",
    seed,
    width,
    rows,
    tiles,
    discovered: Array(width * rows).fill(0),
    packages,
    missions,
    shelves,
    setPieces,
    plateRows,
  };
}
