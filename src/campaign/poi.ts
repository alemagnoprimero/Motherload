import type { Campaign } from "./model";
import { W01 } from "./config";

export type MissionPoiKind = "beacon" | "valve" | "antenna" | "core" | "lander";
export type MissionPoiStatus =
  "source" | "surveyed" | "carried" | "banked" | "ready";
export type MissionSignalBand = "distant" | "near" | "close" | "at";
export type MissionDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right"
  | "here";

export interface MissionPoi {
  id: string;
  kind: MissionPoiKind;
  name: string;
  title: string;
  x: number;
  y: number;
  frame: string;
  stage: number;
  status: MissionPoiStatus;
  known: boolean;
  visible: boolean;
  buried: boolean;
  depthMeters: number;
}

export interface MissionSignal {
  targetId: string;
  poi: MissionPoi;
  kind: MissionPoiKind;
  name: string;
  title: string;
  dx: number;
  dy: number;
  distanceMeters: number;
  depthMeters: number;
  direction: MissionDirection;
  arrow: string;
  band: MissionSignalBand;
  action: string;
  returning: boolean;
  /** A stable announcement key; movement within a band does not create alerts. */
  alertKey: string;
}

/** Ranges use world cells; W01 maps each cell to ten displayed metres. */
export const MISSION_SIGNAL_RANGES = {
  near: 8,
  close: 3,
  beacon: 1.15,
  part: 0.9,
} as const;

const PARTS = [
  {
    id: "W01-VALVE",
    kind: "valve",
    title: "Pressure assembly",
    frame: "mission-valve",
    stage: 2,
  },
  {
    id: "W01-ANTENNA",
    kind: "antenna",
    title: "Communications wreck",
    frame: "mission-antenna",
    stage: 2,
  },
  {
    id: "W01-Q",
    kind: "core",
    title: "Navigation capsule",
    frame: "mission-core",
    stage: 3,
  },
] as const;

const wrapDelta = (from: number, to: number, width: number) =>
  ((((to - from + width / 2) % width) + width) % width) - width / 2;

/** Physical landmarks read existing state; radio guidance never discovers terrain. */
export function campaignPois(campaign: Campaign): MissionPoi[] {
  const describe = (
    poi: Omit<MissionPoi, "known" | "visible" | "buried" | "depthMeters">,
  ): MissionPoi => ({
    ...poi,
    known: campaign.isKnown(Math.floor(poi.x), Math.floor(poi.y)),
    visible: campaign.isVisible(Math.floor(poi.x), Math.floor(poi.y)),
    buried: campaign.tile(poi.x, poi.y) !== 0,
    depthMeters: Math.max(0, (Math.floor(poi.y) + 1) * 10),
  });
  const result: MissionPoi[] = [
    describe({
      id: "W01-BEACON",
      kind: "beacon",
      name: "Wreck survey beacon",
      title: "Survey wreck",
      x: W01.spawnX,
      y: W01.beaconRow + 0.5,
      frame: "mission-beacon",
      stage: 1,
      status: campaign.state.progress.beacon ? "surveyed" : "source",
    }),
  ];
  for (const definition of PARTS) {
    const mission = campaign.world.missions.find(
      (item) => item.id === definition.id,
    );
    if (mission)
      result.push(
        describe({
          ...definition,
          name: mission.name,
          x: mission.x,
          y: mission.y,
          status: mission.status,
        }),
      );
  }
  return result;
}

type ReturnReason = "ore" | "mission" | "construction" | "launch";

/** Current-stage bearings are mission broadcasts, not a scanner for hidden ore. */
export function campaignSignal(campaign: Campaign): MissionSignal | undefined {
  const state = campaign.state;
  if (state.progress.departed) return undefined;
  const milestone = campaign.currentMilestone;
  const pois = campaignPois(campaign);
  let poi: MissionPoi | undefined;
  let returnReason: ReturnReason | undefined;
  const distance = (target: MissionPoi) =>
    Math.hypot(
      wrapDelta(state.vehicle.x, target.x, campaign.world.width),
      target.y - state.vehicle.y,
    );
  if (!milestone) returnReason = "launch";
  else if (milestone.id === 1) {
    if (!state.progress.beacon)
      poi = pois.find((item) => item.kind === "beacon");
    else if (campaign.missionReady) returnReason = "construction";
    else if (campaign.cargo.some((item) => item.tags.includes("ordinary")))
      returnReason = "ore";
  } else {
    const required = pois.filter((item) =>
      milestone.requiredMissionIds.some((id) => id === item.id),
    );
    if (required.some((item) => item.status === "carried"))
      returnReason = "mission";
    else if (campaign.missionReady) returnReason = "construction";
    else
      poi = required
        .filter((item) => item.status === "source")
        .sort((a, b) => distance(a) - distance(b))[0];
  }
  if (returnReason)
    poi = {
      id: "W01-LANDER",
      kind: "lander",
      name: "Salvage lander",
      title: "Surface lander",
      x: W01.dockX,
      y: -W01.bodyHalfY,
      frame: "dock-stage-" + state.progress.completed.length,
      stage: milestone?.id ?? 3,
      status: "ready",
      known: true,
      visible: true,
      buried: false,
      depthMeters: 0,
    };
  if (!poi) return undefined;

  const dx = wrapDelta(state.vehicle.x, poi.x, campaign.world.width),
    dy = poi.y - state.vehicle.y,
    cells = Math.hypot(dx, dy),
    at =
      poi.kind === "lander"
        ? campaign.atDock
        : cells <
          (poi.kind === "beacon"
            ? MISSION_SIGNAL_RANGES.beacon
            : MISSION_SIGNAL_RANGES.part),
    band: MissionSignalBand = at
      ? "at"
      : cells <= MISSION_SIGNAL_RANGES.close
        ? "close"
        : cells <= MISSION_SIGNAL_RANGES.near
          ? "near"
          : "distant";
  const headings: MissionDirection[] = [
    "right",
    "down-right",
    "down",
    "down-left",
    "left",
    "up-left",
    "up",
    "up-right",
  ];
  const direction =
    at || cells < 0.12
      ? "here"
      : headings[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]!;
  const arrows: Record<MissionDirection, string> = {
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    "up-left": "↖",
    "up-right": "↗",
    "down-left": "↙",
    "down-right": "↘",
    here: "◉",
  };
  let action: string;
  if (returnReason === "ore")
    action = campaign.atDock
      ? "Dock and bank your ore"
      : "Return to the lander to bank ore";
  else if (returnReason === "mission")
    action = campaign.atDock
      ? "Dock and bank mission cargo"
      : "Return to the lander to bank mission cargo";
  else if (returnReason === "launch")
    action = campaign.atDock
      ? "Dock and launch"
      : "Return to the lander to launch";
  else if (returnReason === "construction")
    action =
      state.credits >= milestone!.fee
        ? campaign.atDock
          ? "Dock and fund construction"
          : "Return to the lander to fund construction"
        : "Sell ore at the lander to fund construction";
  else if (poi.kind === "beacon")
    action = "Approach the wreck beacon to survey";
  else
    action = poi.buried
      ? "Excavate the marked debris"
      : "Approach to recover the mission part";

  if (returnReason && !campaign.atDock && cells <= 3 && state.vehicle.y < 0)
    action = "Land in the illuminated bay to dock";

  return {
    targetId: poi.id,
    poi,
    kind: poi.kind,
    name: poi.name,
    title: poi.title,
    dx,
    dy,
    distanceMeters: Math.round(cells * 10),
    depthMeters: poi.depthMeters,
    direction,
    arrow: arrows[direction],
    band,
    action,
    returning: Boolean(returnReason),
    alertKey: `${poi.id}:${band}:${poi.buried ? "buried" : "clear"}`,
  };
}
