import {
  BALANCE_VERSION,
  GENERATOR_VERSION,
  W01,
  W01_ORES,
  type OreDefinition,
} from "./config";
import { W02, W02_ORES } from "./frontier";
import type { CampaignPackage, CampaignWorld } from "./types";
import { FIELD_LOG_TEXT, WORLD_BANDS, worldBand } from "./world-content";
import { createW01V1, createW02V1 } from "./world-v1";

export { createW01V1, createW02V1 } from "./world-v1";
export { WORLD_BANDS, worldBand } from "./world-content";

const STARTER = [
  [0, 0, 0, 0, 0, 2, 2],
  [0, 1, 1, 1, 1, 2, 2],
] as const;

type WorldId = "W01" | "W02";
function randomFor(seed: number, salt: number) {
  let state = (seed ^ salt) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function shuffled<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other]!, values[index]!];
  }
  return values;
}

/** Explicit stages keep resource placement independent of decorative randomness. */
interface Generation {
  world: CampaignWorld;
  id: WorldId;
  route: number;
  missionCells: Set<number>;
  occupied: Set<number>;
  random: () => number;
  index: (x: number, y: number) => number;
  carve: (x: number, y: number) => void;
}

function establishWorld(id: WorldId, seed: number): Generation {
  const definition = id === "W01" ? W01 : W02;
  const { width, rows } = definition;
  const route = id === "W01" ? 20 : 24;
  const index = (x: number, y: number) => y * width + x;
  const random = randomFor(seed, id === "W01" ? 0x1a7202 : 0x2ce202);
  const missions: CampaignWorld["missions"] =
    id === "W01"
      ? [
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
        ]
      : [
          ...Array.from({ length: 5 }, (_, n) => ({
            id: `W02-SAMPLE-${n + 1}`,
            name: `Helion thermal sample ${n + 1}`,
            x: 22.5 + n,
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
      index(Math.floor(mission.x), Math.floor(mission.y)),
    ),
  );
  const tiles: number[] = Array.from({ length: width * rows }, (_, cell) => {
    const x = cell % width,
      y = Math.floor(cell / width);
    if (x === route || missionCells.has(cell) || (y < 10 && x === route + 1))
      return 1;
    return random() < worldBand(id, y).rockChance ? 2 : 1;
  });
  const world: CampaignWorld = {
    id,
    seed: seed >>> 0,
    width,
    rows,
    generatorVersion: 2,
    balanceVersion: id === "W01" ? "0.2" : "0.3",
    tiles,
    discovered: Array(width * rows).fill(0),
    packages: [],
    missions,
    shelves: [],
    pressureSeams: [],
    hazards: { coldPockets: [], vents: [] },
    sites: [],
    fieldLogs: [],
    ...(id === "W02"
      ? {
          completed: [],
          climate: { coldRemaining: 0, ventCooldown: 0, warning: null },
        }
      : {}),
  };
  const carve = (x: number, y: number) => {
    if (
      x >= 1 &&
      x < width - 1 &&
      y >= 7 &&
      y < rows - 1 &&
      x !== route &&
      !missionCells.has(index(x, y))
    )
      tiles[index(x, y)] = 0;
  };
  return {
    world,
    id,
    route,
    missionCells,
    occupied: new Set(),
    random,
    index,
    carve,
  };
}

function ellipse(g: Generation, x: number, y: number, rx: number, ry: number) {
  for (let row = Math.floor(y - ry); row <= y + ry; row++)
    for (let column = Math.floor(x - rx); column <= x + rx; column++)
      if (((column - x) / rx) ** 2 + ((row - y) / ry) ** 2 < 1)
        g.carve(column, row);
}

/** Bands each have a silhouette, not merely a different ore distribution. */
function shapeBands(g: Generation) {
  const { world, id, route, random } = g;
  for (const band of WORLD_BANDS[id]) {
    for (let row = Math.max(9, band.start + 2); row < band.end; row += 6) {
      for (const side of [-1, 1]) {
        const x = route + side * (6 + Math.floor(random() * 8));
        const rx =
          band.cave === "gallery" ? 4 + random() * 2 : 1.8 + random() * 2;
        const ry = band.cave === "geode" ? 2.8 : 1 + random() * 1.1;
        ellipse(g, x, row, rx, ry);
      }
    }
  }
  // Every 50 m has a small branch touching the route. A player sees its mouth
  // while excavating the route, but the solid route itself is never pre-dug.
  for (let row = 8, n = 0; row < world.rows - 2; row += 5, n++) {
    if (id === "W01" && row >= 28 && row <= 32) continue;
    const side = n % 2 === 0 ? -1 : 1;
    for (let dx = 1; dx <= 3; dx++) {
      g.carve(route + side * dx, row);
      if (dx > 1) g.carve(route + side * dx, row - 1);
    }
  }
  // The deep gallery is deliberately large enough to change how a shaft feels.
  ellipse(g, route - 7, id === "W01" ? 43 : 63, 6.2, 3.4);
  const galleryRow = id === "W01" ? 43 : 63;
  for (let x = route - 7; x < route; x++) g.carve(x, galleryRow);
  // Each mission is flanked by a recognizable room while its object stays buried.
  for (const mission of world.missions) {
    const x = Math.floor(mission.x),
      y = Math.floor(mission.y);
    ellipse(g, x - 3, Math.min(world.rows - 3, y), 2.5, 1.6);
    for (let column = x - 3; column < x; column++)
      g.carve(column, Math.min(world.rows - 2, y));
  }
}

function placeSites(g: Generation) {
  const { world, id, route } = g;
  const definitions =
    id === "W01"
      ? [
          { row: 8, x: route - 2, kind: "survey", name: "Broken survey mast" },
          {
            row: 23,
            x: route - 2,
            kind: "mission",
            name: "Lander valve store",
          },
          { row: 38, x: route + 2, kind: "mission", name: "Antenna workshop" },
          {
            row: 43,
            x: route - 5,
            kind: "wreck",
            name: "Collapsed crew gallery",
          },
          {
            row: 53,
            x: route - 2,
            kind: "geode",
            name: "Surveyor's compass geode",
          },
          {
            row: 56,
            x: route + 3,
            kind: "cache",
            name: "Thermal service locker",
          },
        ]
      : [
          { row: 12, x: route - 3, kind: "wreck", name: "Old refuge crawler" },
          {
            row: 28,
            x: route + 2,
            kind: "survey",
            name: "Blue glacier listening post",
          },
          {
            row: 43,
            x: route - 3,
            kind: "mission",
            name: "Intact sample gallery",
          },
          {
            row: 58,
            x: route + 4,
            kind: "wreck",
            name: "Steam collector wreck",
          },
          { row: 72, x: route - 3, kind: "survey", name: "Pressure relay" },
          { row: 86, x: route - 2, kind: "geode", name: "Lantern seed geode" },
          {
            row: 94,
            x: route + 3,
            kind: "cache",
            name: "Preservation instrument case",
          },
        ];
  world.sites = definitions.map((site, n) => {
    ellipse(g, site.x, site.row, site.kind === "geode" ? 3.1 : 2.1, 1.5);
    for (
      let x = Math.min(site.x, route - 1);
      x <= Math.max(site.x, route + 1);
      x++
    )
      g.carve(x, site.row);
    return {
      id: `${id}-SITE-${n + 1}`,
      kind: site.kind as "survey" | "mission" | "wreck" | "geode" | "cache",
      name: site.name,
      x: site.x + 0.5,
      y: site.row + 0.5,
      opened: false,
      discovered: false,
      ...(site.kind === "cache"
        ? {
            tool: id === "W01" ? "W02-R1" : "W02-R3",
            reward: id === "W01" ? 2000 : 6000,
          }
        : {}),
    };
  });
  const logRows =
    id === "W01"
      ? [6, 8, 18, 23, 29, 38, 53, 56]
      : [8, 24, 28, 43, 58, 72, 86, 94];
  world.fieldLogs = FIELD_LOG_TEXT[id].map((log, n) => ({
    id: `${id}-LOG-${n + 1}`,
    ...log,
    x: route + (n % 2 ? -1.5 : 1.5),
    y: logRows[n]! + 0.5,
    read: false,
  }));
  for (const site of world.sites) {
    const nearest = world.fieldLogs.reduce((a, b) =>
      Math.abs(a.y - site.y) < Math.abs(b.y - site.y) ? a : b,
    );
    site.logId = nearest.id;
  }
}

function placeHazards(g: Generation) {
  const { world, id, route, index } = g;
  const random = randomFor(world.seed, id === "W01" ? 0x51e1f : 0xc01d);
  if (id === "W01") {
    world.shelves = [14, 35, 46].map((row, n) => {
      const side = n % 2 ? 1 : -1;
      const column = route + side * (6 + Math.floor(random() * 7));
      world.tiles[index(column, row)] = 1;
      for (let x = column - 1; x <= column + 1; x++) g.carve(x, row + 1);
      world.tiles[index(column, row + 2)] = 1;
      return {
        id: `W01-SHELF-${n + 1}`,
        x: column + 0.5,
        y: row + 0.5,
        warning: null,
        collapsed: false,
      };
    });
  } else {
    world.hazards = {
      coldPockets: [28, 61].map((y, n) => ({
        x: route + (n % 2 ? 1 : -1) * (7 + Math.floor(random() * 7)) + 0.5,
        y: y + Math.floor(random() * 3) + 0.5,
      })),
      vents: [48, 83].map((y, n) => ({
        x: route + (n % 2 ? 1 : -1) * (8 + Math.floor(random() * 7)) + 0.5,
        y: y + Math.floor(random() * 3) + 0.5,
      })),
    };
    for (const hazard of [...world.hazards.coldPockets, ...world.hazards.vents])
      ellipse(g, Math.floor(hazard.x), Math.floor(hazard.y), 2.2, 1.8);
  }
  const minimumRow = id === "W01" ? 45 : 75;
  for (let row = minimumRow; row < world.rows; row++)
    for (let column = 0; column < world.width; column++) {
      if (
        Math.abs(column - route) <= 1 ||
        g.missionCells.has(index(column, row)) ||
        world.tiles[index(column, row)] !== 1 ||
        random() >= 0.08
      )
        continue;
      world.pressureSeams!.push({
        id: `${id}-PRESSURE-${row}-${column}`,
        x: column + 0.5,
        y: row + 0.5,
        warning: null,
        spent: false,
      });
    }
}

function protectRoute(g: Generation) {
  const { world, route, id } = g;
  for (let row = 0; row < world.rows; row++)
    world.tiles[g.index(route, row)] = 1;
  for (const cell of g.missionCells) world.tiles[cell] = 1;
  if (id === "W01") {
    // Includes previous cave air: wrapping or a lucky cavity cannot bypass it.
    for (const row of [30, 31])
      for (let x = 0; x < world.width; x++) world.tiles[g.index(x, row)] = 4;
  } else {
    for (const row of [W02.cryoRow, W02.cryoRow + 1])
      for (const x of [22, 23, 24, 25]) world.tiles[g.index(x, row)] = 1;
  }
}

function placeResources(g: Generation) {
  const { world, id, route, index, occupied } = g;
  const ores = id === "W01" ? W01_ORES : W02_ORES;
  const random = randomFor(world.seed, id === "W01" ? 0x0ae102 : 0x0ae203);
  const add = (x: number, y: number, oreIndex: number) => {
    const ore: OreDefinition = ores[oreIndex]!;
    if (occupied.has(index(x, y)))
      throw new Error(`Duplicate resource at ${id}:${x},${y}`);
    world.tiles[index(x, y)] =
      world.tiles[index(x, y)] === 4
        ? 4
        : Math.max(1, world.tiles[index(x, y)]!);
    world.packages.push({
      id: `${id}:deposit:${y}:${x}`,
      itemId: ore.id,
      name: ore.name,
      origin: id,
      balanceVersion: world.balanceVersion!,
      value: ore.value,
      bulk: ore.bulk,
      mass: ore.mass,
      tags: [
        ...ore.tags,
        ...(id === "W02" && oreIndex === 2 && y >= W02.cryoRow
          ? ["cryosample"]
          : []),
      ],
      x: x + 0.5,
      y: y + 0.5,
      status: "deposit",
      processedBy: [],
    });
    occupied.add(index(x, y));
  };
  if (id === "W01")
    STARTER.forEach((seam, offset) =>
      seam.forEach((ore, row) => add(route + offset, row, ore)),
    );
  else {
    for (const x of [24, 25])
      [0, 1, 1, 0, 1, 1, 0, 1, 1, 0].forEach((ore, row) => add(x, row, ore));
    add(24, 24, 2);
    for (const row of [W02.cryoRow, W02.cryoRow + 1])
      for (const x of [22, 23, 24, 25]) add(x, row, 2);
  }
  // A visible pocket beside the route every 50 m prevents empty middle bands.
  const pocketRows = [
    ...(id === "W01" ? [10] : []),
    ...Array.from(
      { length: Math.floor((world.rows - 15) / 5) + 1 },
      (_, n) => 13 + n * 5,
    ),
  ];
  for (const [n, row] of pocketRows.entries()) {
    if (id === "W01" && row >= 30 && row <= 31) continue;
    const x = route + (n % 2 ? 2 : -2);
    if (g.missionCells.has(index(x, row)) || occupied.has(index(x, row)))
      continue;
    const tier =
      id === "W01"
        ? row >= 15 && n % 3 === 0
          ? 2
          : 1
        : row >= 64 && n % 5 === 0
          ? 3
          : row >= 24 && n % 3 === 0
            ? 2
            : 1;
    add(x, row, tier);
  }
  // Hazards guard optional value, never an objective or the guaranteed shaft.
  const hazardPoints = [
    ...world.shelves,
    ...(world.hazards?.coldPockets ?? []),
    ...(world.hazards?.vents ?? []),
  ];
  for (const hazard of hazardPoints) {
    const x = Math.floor(hazard.x) + 2,
      row = Math.floor(hazard.y);
    if (
      x >= world.width ||
      occupied.has(index(x, row)) ||
      g.missionCells.has(index(x, row))
    )
      continue;
    add(x, row, row >= (id === "W01" ? 15 : 24) ? 2 : 1);
  }
  const shelfCells = new Set(
    world.shelves.map((s) => index(Math.floor(s.x), Math.floor(s.y))),
  );
  const available = new Set(
    world.tiles
      .map((tile, cell) => ({ tile, cell }))
      .filter(
        ({ tile, cell }) =>
          tile > 0 &&
          tile !== 4 &&
          !occupied.has(cell) &&
          !g.missionCells.has(cell) &&
          !shelfCells.has(cell) &&
          !(
            Math.floor(cell / world.width) < 10 &&
            [route, route + 1].includes(cell % world.width)
          ),
      )
      .map(({ cell }) => cell),
  );
  const count = id === "W01" ? 400 : 600;
  const bandOf = (cell: number) => {
    const y = Math.floor(cell / world.width);
    return y < 10 ? 0 : y < 40 ? 1 : 2;
  };
  const quotas =
    id === "W01"
      ? [0.16, 0.4, 0.44].map((share) => Math.round(share * count))
      : [count, count, count];
  const placed = [0, 0, 0];
  for (const item of world.packages)
    placed[bandOf(index(Math.floor(item.x), Math.floor(item.y)))]!++;
  const minimum = id === "W01" ? [0, 4, 15, 32] : [0, 0, 24, 64];
  const exponents = id === "W01" ? [0, 1.0, 2.4, 3.2] : [0, 0.5, 1.6, 2.7];
  for (const tier of [3, 2, 1, 0]) {
    let needed =
      (count * ores[tier]!.weight) / 100 -
      world.packages.filter((item) => item.itemId === ores[tier]!.id).length;
    const allowed = (cell: number) =>
      available.has(cell) &&
      Math.floor(cell / world.width) >= minimum[tier]! &&
      placed[bandOf(cell)]! < quotas[bandOf(cell)]!;
    const anchors = [...available]
      .filter(allowed)
      .map((cell) => ({
        cell,
        key: Math.pow(
          random(),
          1 /
            Math.pow(1 + Math.floor(cell / world.width) / 15, exponents[tier]!),
        ),
      }))
      .sort((a, b) => a.key - b.key)
      .map(({ cell }) => cell);
    while (needed > 0) {
      let anchor = anchors.pop();
      while (anchor !== undefined && !allowed(anchor)) anchor = anchors.pop();
      if (anchor === undefined)
        throw new Error(`${id} resource stage cannot place ${ores[tier]!.id}`);
      const queue = [anchor],
        veinSize = Math.min(needed, 2 + Math.floor(random() * 3));
      let grown = 0;
      while (queue.length && grown < veinSize) {
        const cell = queue.shift()!;
        if (!allowed(cell)) continue;
        available.delete(cell);
        placed[bandOf(cell)]!++;
        const x = cell % world.width,
          row = Math.floor(cell / world.width);
        add(x, row, tier);
        needed--;
        grown++;
        queue.push(
          ...shuffled(
            [
              x > 0 ? cell - 1 : -1,
              x < world.width - 1 ? cell + 1 : -1,
              cell - world.width,
              cell + world.width,
            ],
            random,
          ).filter(allowed),
        );
      }
    }
  }
  const geode = world.sites!.find((site) => site.kind === "geode")!;
  let relicX = Math.floor(geode.x),
    relicY = Math.floor(geode.y);
  while (
    occupied.has(index(relicX, relicY)) ||
    g.missionCells.has(index(relicX, relicY))
  )
    relicX--;
  world.tiles[index(relicX, relicY)] = 1;
  world.packages.push({
    id: `${id}:relic:1`,
    itemId: `${id}-J1`,
    relicId: `${id}-J1`,
    name: id === "W01" ? "Surveyor's compass" : "Lantern seed",
    origin: id,
    balanceVersion: world.balanceVersion!,
    value: id === "W01" ? 7500 : 30000,
    bulk: id === "W01" ? 2 : 4,
    mass: id === "W01" ? 2.5 : 5,
    tags: ["relic"],
    x: relicX + 0.5,
    y: relicY + 0.5,
    status: "deposit",
    processedBy: [],
  });
}

export function createWorld(
  id: WorldId,
  seed: number,
  generatorVersion: 1 | 2 = id === "W01"
    ? GENERATOR_VERSION
    : BALANCE_VERSION === "0.3"
      ? 2
      : 1,
): CampaignWorld {
  if (generatorVersion === 1)
    return id === "W01" ? createW01V1(seed) : createW02V1(seed);
  const generation = establishWorld(id, seed);
  shapeBands(generation);
  placeSites(generation);
  placeHazards(generation);
  protectRoute(generation);
  placeResources(generation);
  return generation.world;
}

export function createW01(
  seed: number,
  generatorVersion: 1 | 2 = GENERATOR_VERSION,
): CampaignWorld {
  return createWorld("W01", seed, generatorVersion);
}

/** A fresh world gets current rules; revisits always use the stored instance. */
export function createW02(
  seed: number,
  generatorVersion: 1 | 2 = BALANCE_VERSION === "0.3" ? 2 : 1,
): CampaignWorld {
  return createWorld("W02", seed, generatorVersion);
}
