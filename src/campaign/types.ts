/** Campaign data is independent of the preserved single-mine save format. */
export type HardwareKey = "drill" | "energy" | "cargo" | "hull" | "engine";
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

export interface CampaignWorld {
  id: string;
  seed: number;
  width: number;
  rows: number;
  /** Exploration rows begin at y=0; arrival air has negative y. */
  tiles: number[];
  discovered: number[];
  packages: CampaignPackage[];
  missions: CampaignMission[];
  shelves: CampaignShelf[];
  /** Local construction is independent of the restored W01 lander. */
  completed?: number[];
  /** A cut's release window freezes while paused or on an inactive world. */
  volatile?: {
    packageIds: string[];
    remaining: number;
    spent: number;
    precision: boolean;
  };
  climate?: {
    coldRemaining: number;
    ventCooldown: number;
    warning: number | null;
  };
}

export interface CampaignState {
  schema: 1 | 2;
  balanceVersion: "0.1";
  generatorVersion: 1;
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
  vehicle: { x: number; y: number; energy: number; hull: number };
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
