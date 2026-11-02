import type { GearDefinition, OreDefinition } from "./config";
import { BALANCE_VERSION } from "./config.ts";
const improvedW02 = BALANCE_VERSION === "0.3";

/** Current W02 balance 0.3. Legacy worlds retain stored packages and hazards. */
export const W02 = {
  id: "W02",
  name: "Ice comet",
  width: 48,
  rows: 100,
  depth: 1000,
  gravity: 0.35,
  dockX: 5.5,
  spawnX: 24.5,
  sampleRow: 14,
  cryoRow: 44,
  coreRow: 99,
  bodyHalfX: 0.39,
  bodyHalfY: 0.36,
  budget: improvedW02 ? 180000 : 186000,
  minOrdinary: improvedW02 ? 540000 : 558000,
} as const;

export const W02_ORES: readonly OreDefinition[] = [
  {
    id: "W02-O1",
    name: "Frost iron",
    value: 500,
    bulk: improvedW02 ? 1 : 2,
    mass: 2,
    weight: 60,
    tags: ["ordinary"],
  },
  {
    id: "W02-O2",
    name: "Blue nickel",
    value: 1200,
    bulk: improvedW02 ? 1 : 2,
    mass: 2.3,
    weight: 30,
    tags: ["ordinary"],
  },
  {
    id: "W02-O3",
    name: "Cryosilicate",
    value: 3000,
    bulk: 2,
    mass: 2.7,
    weight: 9,
    tags: ["ordinary", "volatile", "intact_eligible"],
  },
  {
    id: "W02-O4",
    name: "Helion ice",
    value: 12000,
    bulk: 2,
    mass: 3.2,
    weight: 1,
    tags: ["ordinary", "volatile", "intact_eligible"],
  },
];

export const W02_GEAR: readonly GearDefinition[] = [
  {
    id: "W02-R1",
    name: "Thermal auger",
    price: 12000,
    slot: "drill",
    requires: null,
    milestone: 0,
    description:
      "Ice cut time ×0.55; drilling energy ×1.20 while active. Rock cutting is unchanged.",
  },
  {
    id: "W02-R2",
    name: "Steam reserve",
    price: improvedW02 ? 16000 : 22000,
    slot: "utility",
    requires: "W02-R1",
    milestone: 1,
    description:
      "Banks 20% of actual ice-drilling energy in a separate 5 L reserve. Automatically releases at an empty main tank, or release it manually from the tool dock.",
  },
  {
    id: "W02-R3",
    name: "Preservation chamber",
    price: 40000,
    slot: "processor",
    requires: "W02-R2",
    milestone: 2,
    description:
      "Hold precision while starting a volatile cut: 35% slower; preserved ordinary volatile cargo gains 30% sale value once. Mission objects and relics are excluded.",
  },
];

export const W02_MILESTONES = [
  {
    id: 1,
    name: "Sample the thermal seam",
    fee: 4000,
    description:
      "Bank five Helion thermal samples from the marked 150 m seam. Samples have no cash value. Build the heated refuge and unlock the steam reserve.",
    requiredMissionIds: Array.from(
      { length: 5 },
      (_, index) => `W02-SAMPLE-${index + 1}`,
    ),
  },
  {
    id: 2,
    name: "Recover without rupture",
    fee: 6000,
    description:
      "Bank three intact cryosilicate packages from the marked 450 m vein or deeper. Release drilling at the completion cue to preserve each package: 1.5 seconds for your first three cuts, then 0.75 seconds. Unlock the preservation chamber.",
    requiredMissionIds: [] as string[],
  },
  {
    id: 3,
    name: "Stabilize the comet fuel",
    fee: 10000,
    description:
      "Recover the cryogenic catalyst at 1000 m and complete the condenser project. Earn the Planetary certificate and chart Iron planet.",
    requiredMissionIds: ["W02-Q"],
  },
] as const;

/** Optional hazard pockets never overlap the required central mission route. */
export const W02_HAZARDS = {
  coldPockets: [
    { x: 10.5, y: 28.5 },
    { x: 37.5, y: 61.5 },
  ],
  vents: [
    { x: 8.5, y: 48.5 },
    { x: 39.5, y: 83.5 },
  ],
} as const;

export const W02_EFFECTS = {
  thermal: { iceCutMultiplier: 0.55, drillingEnergyMultiplier: 1.2 },
  condenser: { refundFraction: 0.2 },
  preservation: { cutMultiplier: 1.35, valueMultiplier: 1.3 },
  volatile: {
    releaseSeconds: 0.75,
    trainingReleaseSeconds: 1.5,
    trainingCuts: 3,
  },
  cold: { warningSeconds: 1.5, slowSeconds: 4, accelerationMultiplier: 0.75 },
  vent: { damage: 6, contactCooldown: 3 },
} as const;
