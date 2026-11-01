import type { HardwareKey } from "./types";

/** Numeric gameplay contracts curated from design/v0.1; prices use tenths of CR. */
export const BALANCE_VERSION = "0.1" as const;
export const GENERATOR_VERSION = 1 as const;
export const HARDWARE_KEYS = [
  "drill",
  "energy",
  "cargo",
  "hull",
  "engine",
] as const;
export const HARDWARE_LEVELS: Record<HardwareKey, readonly number[]> = {
  drill: [2, 2.8, 4, 5.6, 7.8, 10.5, 14, 19, 26, 36],
  energy: [10, 16, 25, 40, 60, 90, 130, 180, 250, 350],
  cargo: [7, 12, 20, 32, 48, 72, 100, 140, 195, 270],
  hull: [10, 18, 30, 48, 72, 105, 150, 215, 300, 420],
  engine: [150, 185, 230, 285, 350, 430, 525, 640, 780, 950],
};
export const HARDWARE_PRICES: Record<HardwareKey, readonly number[]> = {
  drill: [
    0, 7500, 22000, 65000, 180000, 550000, 1600000, 4800000, 14000000, 40000000,
  ],
  energy: [
    0, 6500, 18000, 50000, 140000, 400000, 1200000, 3500000, 10000000, 28000000,
  ],
  cargo: [
    0, 7000, 24000, 70000, 200000, 600000, 1800000, 5400000, 16000000, 46000000,
  ],
  hull: [
    0, 4500, 12000, 35000, 100000, 300000, 900000, 2600000, 7500000, 22000000,
  ],
  engine: [
    0, 5000, 16000, 45000, 120000, 350000, 1100000, 3200000, 9500000, 27000000,
  ],
};
export interface WorldDefinition {
  id: string;
  name: string;
  era: number;
  step: number;
  parents: readonly string[];
  width: number;
  rows: number;
  layers: number;
  depth: number;
  minutes: number;
  coreCap: number;
  bulk: number;
  referenceBudget: number;
  ordinaryFloor: number;
  topology: "wrap" | "bounded";
  implemented: boolean;
  palette: readonly string[];
}
export const WORLD_CATALOG: readonly WorldDefinition[] = [
  {
    id: "W01",
    name: "Broken asteroid",
    era: 0,
    step: 0,
    parents: [],
    width: 40,
    rows: 60,
    layers: 1,
    depth: 600,
    minutes: 45,
    coreCap: 1,
    bulk: 1,
    referenceBudget: 53500,
    ordinaryFloor: 160500,
    topology: "wrap",
    implemented: true,
    palette: ["17232B", "56616A", "A8B0B4", "F0A43C", "F6E1AF"],
  },
  {
    id: "W02",
    name: "Ice comet",
    era: 0,
    step: 1,
    parents: ["W01"],
    width: 48,
    rows: 100,
    layers: 1,
    depth: 1000,
    minutes: 75,
    coreCap: 2,
    bulk: 2,
    referenceBudget: 186000,
    ordinaryFloor: 558000,
    topology: "wrap",
    implemented: true,
    palette: ["102B3D", "3C8196", "B8E6EB", "49D8C6", "F7C673"],
  },
  {
    id: "W03",
    name: "Fractured moon",
    era: 0,
    step: 1,
    parents: ["W01"],
    width: 48,
    rows: 100,
    layers: 1,
    depth: 1000,
    minutes: 75,
    coreCap: 2,
    bulk: 2,
    referenceBudget: 186000,
    ordinaryFloor: 558000,
    topology: "wrap",
    implemented: false,
    palette: ["1C2334", "696A85", "A8A7BD", "AE9BD9", "E4C680"],
  },
  {
    id: "W04",
    name: "Iron planet",
    era: 1,
    step: 2,
    parents: ["W02", "W03"],
    width: 48,
    rows: 600,
    layers: 1,
    depth: 5950,
    minutes: 135,
    coreCap: 4,
    bulk: 3,
    referenceBudget: 1400000,
    ordinaryFloor: 4200000,
    topology: "wrap",
    implemented: false,
    palette: ["25252A", "8D4938", "B88365", "C7CACE", "F2B047"],
  },
  {
    id: "W05",
    name: "Ocean moon",
    era: 1,
    step: 3,
    parents: ["W04"],
    width: 64,
    rows: 250,
    layers: 1,
    depth: 2500,
    minutes: 90,
    coreCap: 4,
    bulk: 3,
    referenceBudget: 1000000,
    ordinaryFloor: 3000000,
    topology: "wrap",
    implemented: false,
    palette: ["0B2634", "18576B", "4B97A1", "72E0D0", "F3BA71"],
  },
  {
    id: "W06",
    name: "Volcanic world",
    era: 1,
    step: 3,
    parents: ["W04"],
    width: 64,
    rows: 250,
    layers: 1,
    depth: 2500,
    minutes: 90,
    coreCap: 4,
    bulk: 3,
    referenceBudget: 1000000,
    ordinaryFloor: 3000000,
    topology: "wrap",
    implemented: false,
    palette: ["211E24", "6D3838", "AD6651", "FFB345", "FFE1A1"],
  },
  {
    id: "W07",
    name: "Gas giant reefs",
    era: 2,
    step: 4,
    parents: ["W05", "W06"],
    width: 64,
    rows: 180,
    layers: 1,
    depth: 1800,
    minutes: 100,
    coreCap: 5,
    bulk: 5,
    referenceBudget: 5600000,
    ordinaryFloor: 16800000,
    topology: "bounded",
    implemented: false,
    palette: ["18313F", "567C8E", "AFC8CE", "E8D57D", "F6F0C9"],
  },
  {
    id: "W08",
    name: "Stellar corona",
    era: 2,
    step: 5,
    parents: ["W07", "W09"],
    width: 72,
    rows: 240,
    layers: 1,
    depth: 2400,
    minutes: 110,
    coreCap: 6,
    bulk: 7,
    referenceBudget: 15600000,
    ordinaryFloor: 46800000,
    topology: "bounded",
    implemented: false,
    palette: ["171F35", "655029", "D19A38", "FFD778", "FFF0C7"],
  },
  {
    id: "W09",
    name: "White dwarf remnant",
    era: 2,
    step: 4,
    parents: ["W05", "W06"],
    width: 64,
    rows: 220,
    layers: 1,
    depth: 2200,
    minutes: 100,
    coreCap: 5,
    bulk: 5,
    referenceBudget: 5600000,
    ordinaryFloor: 16800000,
    topology: "bounded",
    implemented: false,
    palette: ["111C33", "586F94", "B4CBE0", "BCDFFF", "E6CB8F"],
  },
  {
    id: "W10",
    name: "Accretion belt",
    era: 3,
    step: 6,
    parents: ["W08"],
    width: 72,
    rows: 220,
    layers: 1,
    depth: 2200,
    minutes: 100,
    coreCap: 7,
    bulk: 9,
    referenceBudget: 42000000,
    ordinaryFloor: 126000000,
    topology: "bounded",
    implemented: false,
    palette: ["211D2E", "714552", "B27883", "F0B487", "B3DAE1"],
  },
  {
    id: "W11",
    name: "Wormhole junction",
    era: 3,
    step: 7,
    parents: ["W10", "W12"],
    width: 96,
    rows: 180,
    layers: 1,
    depth: 1800,
    minutes: 100,
    coreCap: 8,
    bulk: 12,
    referenceBudget: 115000000,
    ordinaryFloor: 345000000,
    topology: "bounded",
    implemented: false,
    palette: ["122A35", "356A7C", "94BBC5", "67DFEF", "E5B5F4"],
  },
  {
    id: "W12",
    name: "Dark matter reef",
    era: 3,
    step: 6,
    parents: ["W08"],
    width: 64,
    rows: 260,
    layers: 1,
    depth: 2600,
    minutes: 100,
    coreCap: 7,
    bulk: 9,
    referenceBudget: 42000000,
    ordinaryFloor: 126000000,
    topology: "bounded",
    implemented: false,
    palette: ["1D1730", "514077", "8F7CB7", "C4A4F4", "6AE0CE"],
  },
  {
    id: "W13",
    name: "Mirror dimension",
    era: 4,
    step: 8,
    parents: ["W11"],
    width: 56,
    rows: 260,
    layers: 2,
    depth: 2600,
    minutes: 100,
    coreCap: 9,
    bulk: 16,
    referenceBudget: 310000000,
    ordinaryFloor: 930000000,
    topology: "bounded",
    implemented: false,
    palette: ["132B32", "367F86", "A1D6D5", "70E1D5", "D98EBE"],
  },
  {
    id: "W14",
    name: "Fossilized time world",
    era: 4,
    step: 8,
    parents: ["W11"],
    width: 64,
    rows: 260,
    layers: 1,
    depth: 2600,
    minutes: 100,
    coreCap: 9,
    bulk: 16,
    referenceBudget: 310000000,
    ordinaryFloor: 930000000,
    topology: "bounded",
    implemented: false,
    palette: ["302522", "8B6545", "CCAA72", "E8CB8C", "80C9C4"],
  },
  {
    id: "W15",
    name: "Reality foundry",
    era: 4,
    step: 9,
    parents: ["W13", "W14"],
    width: 80,
    rows: 320,
    layers: 2,
    depth: 3200,
    minutes: 105,
    coreCap: 9,
    bulk: 16,
    referenceBudget: 310000000,
    ordinaryFloor: 930000000,
    topology: "bounded",
    implemented: false,
    palette: ["25333B", "7E9994", "D5DDD1", "9CE5CF", "E7B8D2"],
  },
];
export const W01 = {
  id: "W01",
  name: "Broken asteroid",
  width: 40,
  rows: 60,
  depth: 600,
  gravity: 0.55,
  dockX: 5.5,
  spawnX: 20.5,
  budget: 53500,
  minOrdinary: 160500,
  beaconRow: 9,
  valveRow: 24,
  antennaRow: 39,
  coreRow: 59,
  bodyHalfX: 0.39,
  bodyHalfY: 0.36,
} as const;
export interface OreDefinition {
  id: string;
  name: string;
  value: number;
  bulk: number;
  mass: number;
  weight: number;
  tags: readonly string[];
}
export const W01_ORES: readonly OreDefinition[] = [
  {
    id: "W01-O1",
    name: "Ironium",
    value: 300,
    bulk: 1,
    mass: 1,
    weight: 60,
    tags: ["ordinary"],
  },
  {
    id: "W01-O2",
    name: "Bronzium",
    value: 600,
    bulk: 1,
    mass: 1.15,
    weight: 30,
    tags: ["ordinary"],
  },
  {
    id: "W01-O3",
    name: "Silverium",
    value: 1000,
    bulk: 1,
    mass: 1.35,
    weight: 9,
    tags: ["ordinary"],
  },
  {
    id: "W01-O4",
    name: "Goldium",
    value: 2500,
    bulk: 1,
    mass: 1.6,
    weight: 1,
    tags: ["ordinary"],
  },
];
export interface GearDefinition {
  id: string;
  name: string;
  price: number;
  slot:
    "drill" | "mobility" | "processor" | "utility" | "integrated" | "mission";
  requires: string | null;
  milestone: number;
  description: string;
}
export const W01_GEAR: readonly GearDefinition[] = [
  {
    id: "W01-R1",
    name: "Salvaged auger",
    price: 0,
    slot: "drill",
    requires: null,
    milestone: 0,
    description:
      "Soil cut time x0.90; all other material unchanged. Passive drill attachment.",
  },
  {
    id: "W01-R2",
    name: "Anchoring feet",
    price: 4000,
    slot: "mobility",
    requires: "W01-R1",
    milestone: 1,
    description:
      "Deploy in 0.35 s. While held on a solid edge, horizontal drift -60% and thrust energy -20%; drilling still allowed.",
  },
  {
    id: "W01-R3",
    name: "External cargo rack",
    price: 9000,
    slot: "processor",
    requires: "W01-R2",
    milestone: 2,
    description:
      "Cargo capacity +20%, rounded down; acceleration -8% while loaded. Removable cargo attachment.",
  },
];
export const W01_EFFECTS = {
  auger: { soilCutMultiplier: 0.9 },
  feet: {
    deploySeconds: 0.35,
    horizontalDriftMultiplier: 0.4,
    thrustEnergyMultiplier: 0.8,
  },
  rack: { bulkMultiplier: 1.2, loadedAccelerationMultiplier: 0.92 },
  shelf: { warningSeconds: 2, damage: 3 },
} as const;
export const W01_MILESTONES = [
  {
    id: 1,
    name: "Survey the wreck",
    fee: 2000,
    description:
      "Reach the marked beacon at 100 m and bank any three ore deposits. Unlock R2 and a surface service dock.",
    requiredMissionIds: [],
  },
  {
    id: 2,
    name: "Recover the lander parts",
    fee: 3000,
    description:
      "Recover a valve at 250 m and an antenna at 400 m; bank both. Unlock R3 and the star map.",
    requiredMissionIds: ["W01-VALVE", "W01-ANTENNA"],
  },
  {
    id: 3,
    name: "Restore the lander",
    fee: 5000,
    description:
      "Retrieve the navigation core at 600 m and complete construction. Grant Frontier certificate; open W02 and W03.",
    requiredMissionIds: ["W01-Q"],
  },
] as const;
/** Sources describe further destinations; they are intentionally not playable yet. */
export function isWorldUnlocked(
  id: string,
  completedWorlds: readonly string[],
) {
  const world = WORLD_CATALOG.find((entry) => entry.id === id);
  return Boolean(
    world &&
    (!world.parents.length ||
      world.parents.some((parent) => completedWorlds.includes(parent))),
  );
}
export function formatCredits(tenths: number) {
  return (tenths / 10).toLocaleString("en-US", {
    minimumFractionDigits: tenths % 10 ? 1 : 0,
    maximumFractionDigits: 1,
  });
}
