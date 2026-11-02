/** Campaign data is independent of the preserved single-mine save format. */
export type HardwareKey = "drill" | "energy" | "cargo" | "hull" | "engine";
export type BalanceVersion = "0.1" | "0.2" | "0.3";
export type GeneratorVersion = 1 | 2;
export type PackageStatus =
  "deposit" | "exposed" | "carried" | "banked" | "sold" | "lost";

export interface CampaignPackage {
  id: string;
  itemId: string;
  name: string;
  origin: string;
  balanceVersion: string;
  /** Value in integer tenths of a credit. */
  value: number;
  bulk: number;
  mass: number;
  tags: string[];
  x: number;
  y: number;
  status: PackageStatus;
  processedBy: string[];
  /** Stable identity for named relic presentation; accounting stays on this package. */
  relicId?: string;
}

export interface CampaignMission {
  id: string;
  name: string;
  x: number;
  y: number;
  status: "source" | "carried" | "banked";
}

export interface CampaignShelf {
  id: string;
  x: number;
  y: number;
  warning: number | null;
  collapsed: boolean;
}

export interface CampaignPressureSeam {
  id: string;
  x: number;
  y: number;
  warning: number | null;
  spent: boolean;
}

export interface CampaignSite {
  id: string;
  kind: "wreck" | "geode" | "cache" | "survey" | "mission";
  name: string;
  x: number;
  y: number;
  logId?: string;
  tool?: string;
  opened: boolean;
  discovered?: boolean;
  /** Optional cache reward, in integer tenths of a credit. */
  reward?: number;
}

export interface CampaignFieldLog {
  id: string;
  title: string;
  text: string;
  x: number;
  y: number;
  read: boolean;
}

export interface CampaignContract {
  id: string;
  worldId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface CampaignRecord {
  /** Only complete per-world timing/recovery history can earn a speed mastery star. */
  historyComplete?: boolean;
  /** Largest carried haul banked in one visit, in integer tenths of CR. */
  bestHaul?: number;
  /** Captured once at M3 so later salvage trips do not revoke completion mastery. */
  completion?: { elapsed: number; recoveries: number };
  elapsed: number;
  ordinaryIncome: number;
  mined: number;
  recoveries: number;
  deepest: number;
  contracts: number;
  mastery: number;
}

export interface CampaignWaypoint {
  id: string;
  worldId: string;
  x: number;
  y: number;
  label: string;
}

export interface CampaignWorld {
  id: string;
  /** Omitted only by schema 1/2 snapshots; decode normalizes both versions. */
  balanceVersion?: BalanceVersion;
  generatorVersion?: GeneratorVersion;
  seed: number;
  width: number;
  rows: number;
  /** Exploration rows begin at y=0; arrival air has negative y. */
  tiles: number[];
  discovered: number[];
  packages: CampaignPackage[];
  missions: CampaignMission[];
  shelves: CampaignShelf[];
  pressureSeams?: CampaignPressureSeam[];
  hazards?: {
    coldPockets: { id?: string; x: number; y: number }[];
    vents: { id?: string; x: number; y: number }[];
  };
  sites?: CampaignSite[];
  fieldLogs?: CampaignFieldLog[];
  /** Local construction is independent of the restored W01 lander. */
  completed?: number[];
  /** A cut's release window freezes while paused or on an inactive world. */
  volatile?: {
    packageIds: string[];
    remaining: number;
    spent: number;
    precision: boolean;
    /** Stored so a training window restores correctly after its counter advances. */
    duration?: 0.75 | 1.5;
  };
  climate?: {
    coldRemaining: number;
    ventCooldown: number;
    warning: number | null;
  };
}

export interface CampaignState {
  schema: 1 | 2 | 3;
  balanceVersion: BalanceVersion;
  generatorVersion: GeneratorVersion;
  id: string;
  seed: number;
  /** Integer tenths of a credit throughout accounting and persistence. */
  credits: number;
  hardware: Record<HardwareKey, number>;
  purchases: { id: string; paid: number; balanceVersion: string }[];
  ownedGear: string[];
  equipped: {
    drill: string | null;
    mobility: string | null;
    processor: string | null;
    utilities: string[];
  };
  vehicle: {
    x: number;
    y: number;
    energy: number;
    hull: number;
    reserve?: number;
  };
  currentWorld: "W01" | "W02";
  worlds: Record<string, CampaignWorld>;
  progress: {
    beacon: boolean;
    bankedOre: number;
    completed: number[];
    unlockedWorlds: string[];
    departed: boolean;
    /** Worlds whose one complimentary disabled-rig tow has been used. */
    towsUsed: string[];
    volatileTraining?: number;
    contracts?: CampaignContract[];
    records?: Record<string, CampaignRecord>;
    waypoints?: CampaignWaypoint[];
    caches?: string[];
  };
  elapsed: number;
  stats: {
    mined: number;
    ordinarySold: number;
    ordinaryIncome: number;
    recoveries: number;
    largestDepth: number;
    expeditions: number;
  };
}

export interface CampaignControls {
  /** Unsigned analog axis strength; omitted means full digital input. */
  throttleX?: number;
  throttleY?: number;
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
  mobility?: boolean;
  primary?: boolean;
  secondary?: boolean;
}

export interface CampaignCheckpoint {
  format: "motherload-campaign";
  version: 1;
  revision: number;
  savedAt: string;
  state: CampaignState;
}
