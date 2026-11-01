import { BALANCE_VERSION, W01, W01_ORES } from "./config";
import { W02, W02_HAZARDS, W02_ORES } from "./frontier";
import type { CampaignPackage, CampaignWorld } from "./types";

const STARTER = [
  [0, 0, 0, 0, 1, 2, 2],
  [0, 1, 0, 1, 2, 2, 2],
] as const;

/** Geometry and mission sources are fixed before caves and resource placement. */
export function createW01(seed: number): CampaignWorld {
  seed >>>= 0;
  let randomState = seed;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const shuffle = <T>(values: T[]) => {
    for (let index = values.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [values[index], values[other]] = [values[other]!, values[index]!];
    }
    return values;
  };
  const width = W01.width,
    rows = W01.rows,
    indexOf = (column: number, row: number) => row * width + column;
  const missions: CampaignWorld["missions"] = [
    {
      id: "W01-VALVE",
      name: "Lander pressure valve",
      x: 20.5,
      y: W01.valveRow + 0.5,
      status: "source",
    },
    {
      id: "W01-ANTENNA",
      name: "Lander antenna",
      x: 21.5,
      y: W01.antennaRow + 0.5,
      status: "source",
    },
    {
      id: "W01-Q",
      name: "Navigation core",
      x: 20.5,
      y: W01.coreRow + 0.5,
      status: "source",
    },
  ];
  const missionCells = new Set(
    missions.map((mission) =>
      indexOf(Math.floor(mission.x), Math.floor(mission.y)),
    ),
  );
  // A continuous soil corridor gives every required depth a drillable return
  // route. It is not pre-excavated: players establish and reuse their own shaft.
  const protectedColumn = (column: number) => column >= 18 && column <= 23;
  const tiles: number[] = Array.from({ length: width * rows }, (_, index) => {
    const column = index % width;
    return !protectedColumn(column) && random() < 0.12 ? 2 : 1;
  });
  const carve = (column: number, row: number) => {
    if (
      column >= 1 &&
      column < width - 1 &&
      row >= 8 &&
      row < rows - 1 &&
      !protectedColumn(column) &&
      !missionCells.has(indexOf(column, row))
    )
      tiles[indexOf(column, row)] = 0;
  };
  for (let row = 9; row < rows - 3; row += 4) {
    for (const side of [0, 1]) {
      const centerX = side === 0 ? 3 + random() * 12 : 27 + random() * 9,
        centerY = row + random() * 1.5,
        radiusX = 1.7 + random() * 1.8,
        radiusY = 0.8 + random() * 0.7;
      for (let y = Math.floor(centerY - radiusY); y <= centerY + radiusY; y++)
        for (let x = Math.floor(centerX - radiusX); x <= centerX + radiusX; x++)
          if (
            ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <
            1
          )
            carve(x, y);
    }
  }

  // Optional shelves teach collapse away from the opening and mission route.
  // Shelf coordinates identify the centre of the breakable ceiling cell.
  const shelves = [
    { column: 8, row: 14 },
    { column: 31, row: 29 },
    { column: 11, row: 46 },
  ].map(({ column, row }, index) => {
    tiles[indexOf(column, row)] = 1;
    for (let x = column - 1; x <= column + 1; x++) carve(x, row + 1);
    tiles[indexOf(column, row + 2)] = 1;
    return {
      id: `W01-SHELF-${index + 1}`,
      x: column + 0.5,
      y: row + 0.5,
      warning: null,
      collapsed: false,
    };
  });
  const shelfCells = new Set(
    shelves.map((shelf) => indexOf(Math.floor(shelf.x), Math.floor(shelf.y))),
  );
  const packages: CampaignPackage[] = [];
  const occupied = new Set<number>();
  const addOrdinary = (column: number, row: number, oreIndex: number) => {
    const ore = W01_ORES[oreIndex]!;
    packages.push({
      id: `W01:deposit:${row}:${column}`,
      itemId: ore.id,
      name: ore.name,
      origin: "W01",
      balanceVersion: BALANCE_VERSION,
      value: ore.value,
      bulk: ore.bulk,
      mass: ore.mass,
      tags: [...ore.tags],
      x: column + 0.5,
      y: row + 0.5,
      status: "deposit",
      processedBy: [],
    });
    occupied.add(indexOf(column, row));
  };
  STARTER.forEach((seam, offset) =>
    seam.forEach((ore, row) => addOrdinary(20 + offset, row, ore)),
  );

  const candidates = tiles
    .map((tile, index) => ({ tile, index }))
    .filter(
      ({ tile, index }) =>
        tile !== 0 &&
        !occupied.has(index) &&
        !missionCells.has(index) &&
        !shelfCells.has(index) &&
        // Keep the initial descent's support and first banked beacon clear.
        !(index < width * 10 && [20, 21].includes(index % width)),
    )
    .map(({ index }) => index);
  const meanValue = W01_ORES.reduce(
    (value, ore) => value + (ore.value * ore.weight) / 100,
    0,
  );
  // Start at 12% anchors, grow adjacent veins, then meet the post-carving floor.
  // Whole hundreds preserve the exact 60/30/9/1 final ordinary rarity mix.
  const depositCount =
    100 *
    Math.ceil(
      Math.max(
        (candidates.length + packages.length) * 0.12,
        W01.minOrdinary / meanValue,
      ) / 100,
    );
  const remainingOres = W01_ORES.flatMap((ore, oreIndex) => {
    const alreadyPlaced = packages.filter(
      (item) => item.itemId === ore.id,
    ).length;
    return Array<number>(
      (depositCount * ore.weight) / 100 - alreadyPlaced,
    ).fill(oreIndex);
  });
  shuffle(remainingOres);
  const bandOf = (index: number) => {
    const row = Math.floor(index / width);
    return row < 10 ? 0 : row < 40 ? 1 : 2;
  };
  const bandTotals = [
    Math.round(depositCount * 0.2),
    Math.round(depositCount * 0.5),
    Math.round(depositCount * 0.3),
  ];
  for (let band = 0; band < 3; band++) {
    const available = new Set(
      candidates.filter((index) => bandOf(index) === band),
    );
    const seeds = shuffle([...available]);
    let needed =
      bandTotals[band]! -
      packages.filter(
        (item) =>
          bandOf(indexOf(Math.floor(item.x), Math.floor(item.y))) === band,
      ).length;
    while (needed > 0) {
      let anchor = seeds.pop();
      while (anchor !== undefined && !available.has(anchor))
        anchor = seeds.pop();
      if (anchor === undefined)
        throw new Error("W01 cannot satisfy its ordinary-resource budget.");
      const queue = [anchor];
      const veinSize = Math.min(needed, 2 + Math.floor(random() * 3));
      let grown = 0;
      while (queue.length && grown < veinSize) {
        const index = queue.shift()!;
        if (!available.delete(index)) continue;
        const column = index % width,
          row = Math.floor(index / width);
        addOrdinary(column, row, remainingOres.pop()!);
        needed--;
        grown++;
        const neighbors = shuffle([
          column > 0 ? index - 1 : -1,
          column < width - 1 ? index + 1 : -1,
          index - width,
          index + width,
        ]).filter((neighbor) => available.has(neighbor));
        queue.push(...neighbors);
      }
    }
  }

  const relicRoll = random();
  const relicCount = relicRoll < 0.25 ? 0 : relicRoll < 0.85 ? 1 : 2;
  const relicSites = shuffle(
    candidates.filter((index) => !occupied.has(index)),
  );
  for (let relic = 0; relic < relicCount; relic++) {
    const index = relicSites.pop()!;
    packages.push({
      id: `W01:relic:${relic + 1}`,
      itemId: "W01-J",
      name: "Broken asteroid relic",
      origin: "W01",
      balanceVersion: BALANCE_VERSION,
      value: 7500,
      bulk: 2,
      mass: 2.5,
      tags: ["relic"],
      x: (index % width) + 0.5,
      y: Math.floor(index / width) + 0.5,
      status: "deposit",
      processedBy: [],
    });
  }

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
  };
}

/** A fresh W02 instance is created only on first arrival, never on return. */
export function createW02(seed: number): CampaignWorld {
  seed >>>= 0;
  let randomState = (seed ^ 0x1ce02) >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const shuffle = <T>(values: T[]) => {
    for (let index = values.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [values[index], values[other]] = [values[other]!, values[index]!];
    }
    return values;
  };
  const width = W02.width,
    rows = W02.rows,
    indexOf = (column: number, row: number) => row * width + column,
    protectedColumn = (column: number) => column >= 22 && column <= 27;
  const missions: CampaignWorld["missions"] = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `W02-SAMPLE-${index + 1}`,
      name: `Helion thermal sample ${index + 1}`,
      x: 22.5 + index,
      y: W02.sampleRow + 0.5,
      status: "source" as const,
    })),
    {
      id: "W02-Q",
      name: "Cryogenic catalyst",
      x: W02.spawnX,
      y: W02.coreRow + 0.5,
      status: "source",
    },
  ];
  const missionCells = new Set(
    missions.map((mission) =>
      indexOf(Math.floor(mission.x), Math.floor(mission.y)),
    ),
  );
  const tiles: number[] = Array.from({ length: width * rows }, (_, index) =>
    !protectedColumn(index % width) && random() < 0.12 ? 2 : 1,
  );
  const carve = (column: number, row: number) => {
    if (
      column >= 0 &&
      column < width &&
      row >= 10 &&
      row < rows - 1 &&
      !protectedColumn(column) &&
      !missionCells.has(indexOf(column, row))
    )
      tiles[indexOf(column, row)] = 0;
  };
  // Long facets and rounded bubble pockets sit beside a drillable central route.
  // The route remains solid ice: new objectives still require actual excavation.
  for (let row = 12; row < rows - 5; row += 6)
    for (const side of [0, 1]) {
      const centerX = side === 0 ? 3 + random() * 14 : 32 + random() * 11,
        centerY = row + random() * 2,
        radiusX = 1.6 + random() * 2.2,
        radiusY = 0.8 + random() * 1.2;
      for (let y = Math.floor(centerY - radiusY); y <= centerY + radiusY; y++)
        for (let x = Math.floor(centerX - radiusX); x <= centerX + radiusX; x++)
          if (
            ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <
            1
          )
            carve(x, y);
    }
  for (const hazard of [...W02_HAZARDS.coldPockets, ...W02_HAZARDS.vents])
    for (let x = Math.floor(hazard.x) - 1; x <= Math.floor(hazard.x) + 1; x++)
      for (let y = Math.floor(hazard.y) - 1; y <= Math.floor(hazard.y) + 1; y++)
        carve(x, y);

  const packages: CampaignPackage[] = [];
  const occupied = new Set<number>();
  const addOrdinary = (column: number, row: number, oreIndex: number) => {
    const ore = W02_ORES[oreIndex]!;
    packages.push({
      id: `W02:deposit:${row}:${column}`,
      itemId: ore.id,
      name: ore.name,
      origin: "W02",
      balanceVersion: BALANCE_VERSION,
      value: ore.value,
      bulk: ore.bulk,
      mass: ore.mass,
      tags: [
        ...ore.tags,
        ...(oreIndex === 2 && row >= W02.cryoRow ? ["cryosample"] : []),
      ],
      x: column + 0.5,
      y: row + 0.5,
      status: "deposit",
      processedBy: [],
    });
    occupied.add(indexOf(column, row));
  };
  // 1,840 CR in the first ten rows buys R1 plus a service reserve, without
  // requiring R1, volatile handling or an income-bearing mission sample.
  for (const column of [24, 25])
    [0, 1, 1, 0, 1, 1, 0, 1, 1, 0].forEach((ore, row) =>
      addOrdinary(column, row, ore),
    );
  // A safe first volatile occurs well before the required intact-sample vein.
  addOrdinary(24, 24, 2);
  for (const row of [W02.cryoRow, W02.cryoRow + 1])
    for (const column of [22, 23, 24, 25]) addOrdinary(column, row, 2);

  const candidates = tiles
    .map((tile, index) => ({ tile, index }))
    .filter(
      ({ tile, index }) =>
        tile !== 0 && !occupied.has(index) && !missionCells.has(index),
    )
    .map(({ index }) => index);
  const meanValue = W02_ORES.reduce(
    (total, ore) => total + (ore.value * ore.weight) / 100,
    0,
  );
  const depositCount =
    100 *
    Math.ceil(
      Math.max(
        (candidates.length + packages.length) * 0.12,
        W02.minOrdinary / meanValue,
      ) / 100,
    );
  const available = new Set(candidates);
  // Rarity escalates with depth rather than placing the most valuable crowns
  // beside the arrival site. Exact global weights still match the design data.
  for (const oreIndex of [3, 2, 1, 0]) {
    const ore = W02_ORES[oreIndex]!;
    const minimumRow = oreIndex === 3 ? 64 : oreIndex === 2 ? 24 : 0;
    const allowed = (index: number) =>
      available.has(index) && Math.floor(index / width) >= minimumRow;
    const anchors = shuffle([...available].filter(allowed));
    let needed =
      (depositCount * ore.weight) / 100 -
      packages.filter((item) => item.itemId === ore.id).length;
    while (needed > 0) {
      let anchor = anchors.pop();
      while (anchor !== undefined && !allowed(anchor)) anchor = anchors.pop();
      if (anchor === undefined)
        throw new Error("W02 cannot satisfy its ordinary-resource budget.");
      const queue = [anchor];
      const veinSize = Math.min(needed, 2 + Math.floor(random() * 4));
      let grown = 0;
      while (queue.length && grown < veinSize) {
        const index = queue.shift()!;
        if (!allowed(index)) continue;
        available.delete(index);
        const column = index % width,
          row = Math.floor(index / width);
        addOrdinary(column, row, oreIndex);
        needed--;
        grown++;
        queue.push(
          ...shuffle([
            column > 0 ? index - 1 : -1,
            column < width - 1 ? index + 1 : -1,
            index - width,
            index + width,
          ]).filter(allowed),
        );
      }
    }
  }

  const relicRoll = random();
  const relicCount = relicRoll < 0.25 ? 0 : relicRoll < 0.85 ? 1 : 2;
  const relicSites = shuffle(
    [...available].filter((index) => Math.floor(index / width) >= 20),
  );
  for (let relic = 0; relic < relicCount; relic++) {
    const index = relicSites.pop()!;
    packages.push({
      id: `W02:relic:${relic + 1}`,
      itemId: "W02-J",
      name: "Ice comet relic",
      origin: "W02",
      balanceVersion: BALANCE_VERSION,
      value: 30000,
      bulk: 4,
      mass: 5,
      tags: ["relic"],
      x: (index % width) + 0.5,
      y: Math.floor(index / width) + 0.5,
      status: "deposit",
      processedBy: [],
    });
  }

  return {
    id: "W02",
    seed,
    width,
    rows,
    tiles,
    discovered: Array(width * rows).fill(0),
    packages,
    missions,
    shelves: [],
    completed: [],
    climate: { coldRemaining: 0, ventCooldown: 0, warning: null },
  };
}
