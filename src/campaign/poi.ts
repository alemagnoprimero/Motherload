import type { Campaign } from "./model";
import { HARDWARE_PRICES, W01, W01_SURVEY_MILESTONE } from "./config";
import { W02 } from "./frontier";

export type MissionPoiKind =
  | "beacon"
  | "valve"
  | "antenna"
  | "core"
  | "sample"
  | "cryo"
  | "catalyst"
  | "lander"
  | "seam"
  | "cache"
  | "relic"
  | "log";
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

/** Ranges use world cells; implemented worlds map each cell to ten metres. */
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

/** M1 fills the hold from marked seam A before turning home (D14). */
export function openingSeamPending(campaign: Campaign) {
  return (
    campaign.state.currentWorld === "W01" &&
    campaign.currentMilestone?.id === 1 &&
    !campaign.missionReady &&
    campaign.cargoBulk < campaign.capacity &&
    campaignPois(campaign).some(
      (poi) => poi.id === "W01-SEAM-A" && poi.status === "source",
    )
  );
}

export interface OpeningRoute {
  phase: "seam" | "sell" | "upgrade";
  title: string;
  next: string;
  remaining: number;
  x: number;
  y: number;
}

/** Advice is derived from real packages; it cannot reset or advance a save. */
export function openingRoute(campaign: Campaign): OpeningRoute | undefined {
  const { state, world } = campaign;
  if (
    state.currentWorld !== "W01" ||
    world.generatorVersion !== 2 ||
    campaign.currentMilestone?.id !== 2 ||
    Object.values(state.hardware).some((rank) => rank > 0) ||
    world.missions.some((mission) => mission.status !== "source")
  )
    return undefined;
  const packages = world.packages.filter((item) =>
    /^W01:deposit:[0-6]:21$/.test(item.id),
  );
  // Missing or edited entry records do not invent a replacement seam.
  if (packages.length !== 7) return undefined;
  const remaining = packages.filter(
    (item) => item.status === "deposit" || item.status === "exposed",
  );
  const last = remaining.reduce<(typeof remaining)[number] | undefined>(
    (deepest, item) => (!deepest || item.y > deepest.y ? item : deepest),
    undefined,
  );
  const base = {
    remaining: remaining.length,
    x: last?.x ?? 21.5,
    y: last?.y ?? 6.5,
  };
  if (state.credits >= HARDWARE_PRICES.energy[1]!)
    return {
      ...base,
      phase: "upgrade",
      title: "Install the expedition tank",
      next: "Lander → Workshop → Expedition tank",
    };
  if (
    campaign.cargoBulk >= campaign.capacity ||
    (!remaining.length &&
      (campaign.cargo.length > 0 || campaign.warehouse.length > 0))
  )
    return {
      ...base,
      phase: "sell",
      title: "Sell the second haul",
      next: "Return to lander → Unload and sell → Expedition tank",
    };
  if (last)
    return {
      ...base,
      phase: "seam",
      title: "Mine the second shallow seam",
      next: "Mine seam B · 70 m → Sell → Expedition tank",
    };
  return undefined;
}

/** Ready salvage stays actionable; a tool-locked locker cannot hide other goals. */
export function postChapterGoal(campaign: Campaign) {
  const goals = campaign.postChapterObjectives;
  const equipped = [
    campaign.state.equipped.drill,
    campaign.state.equipped.mobility,
    campaign.state.equipped.processor,
    ...campaign.state.equipped.utilities,
  ];
  return (
    goals.find((goal) => goal.kind === "relic" && goal.carried) ??
    goals.find(
      (goal) =>
        goal.kind === "cache" && (!goal.tool || equipped.includes(goal.tool)),
    ) ??
    goals.find((goal) => goal.kind === "relic") ??
    goals
      .filter((goal) => goal.kind === "log")
      .sort((a, b) => distanceTo(campaign, a) - distanceTo(campaign, b))[0] ??
    goals[0]
  );
}

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
  const caches = campaign.postChapterObjectives.map((site) =>
    describe({
      id: site.id,
      kind: site.kind,
      name: site.name,
      title: site.name,
      x: site.x,
      y: site.y,
      frame:
        site.kind === "cache"
          ? "site-cache"
          : site.kind === "relic"
            ? "relic"
            : "site-survey",
      stage: 4,
      status: site.carried ? "carried" : "source",
    }),
  );
  if (campaign.state.currentWorld === "W02")
    return [...cometPois(campaign, describe), ...caches];
  const result: MissionPoi[] = [
    describe({
      id: "W01-BEACON",
      kind: "beacon",
      name: "Wreck survey beacon",
      title: "Survey wreck",
      x: W01.beaconX,
      y: W01.beaconRow + 0.5,
      frame: "mission-beacon",
      stage: W01_SURVEY_MILESTONE,
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
  if (campaign.world.generatorVersion === 2) {
    for (const [offset, letter] of [
      [0, "A"],
      [1, "B"],
    ] as const) {
      const packages = campaign.world.packages.filter((item) =>
        new RegExp(`^W01:deposit:[0-6]:${20 + offset}$`).test(item.id),
      );
      if (packages.length !== 7) continue;
      const remaining = packages.filter(
        (item) => item.status === "deposit" || item.status === "exposed",
      );
      const last = remaining.reduce<(typeof remaining)[number] | undefined>(
        (deepest, item) => (!deepest || item.y > deepest.y ? item : deepest),
        undefined,
      );
      result.push(
        describe({
          id: `W01-SEAM-${letter}`,
          kind: "seam",
          name: `Marked seam ${letter}`,
          title: `Seam ${letter} · shallow ore`,
          x: last?.x ?? 20.5 + offset,
          y: last?.y ?? 6.5,
          frame: "ore-o1",
          stage: offset + 1,
          status: remaining.length ? "source" : "surveyed",
        }),
      );
    }
  }
  return [...result, ...caches];
}

function cometPois(
  campaign: Campaign,
  describe: (
    poi: Omit<MissionPoi, "known" | "visible" | "buried" | "depthMeters">,
  ) => MissionPoi,
): MissionPoi[] {
  const missions = campaign.world.missions
    .filter((item) => item.id.startsWith("W02-SAMPLE-") || item.id === "W02-Q")
    .map((item) =>
      describe({
        id: item.id,
        kind: item.id === "W02-Q" ? "catalyst" : "sample",
        name: item.name,
        title: item.id === "W02-Q" ? "Cryogenic capsule" : "Helion sample seam",
        frame: item.id === "W02-Q" ? "mission-catalyst" : "mission-sample",
        stage: item.id === "W02-Q" ? 3 : 1,
        x: item.x,
        y: item.y,
        status: item.status,
      }),
    );
  const crystals = campaign.world.packages.filter(
    (item) =>
      item.itemId === "W02-O3" &&
      item.tags.includes("cryosample") &&
      item.status !== "lost" &&
      ((item.status !== "carried" &&
        item.status !== "banked" &&
        item.status !== "sold") ||
        item.tags.includes("intact")),
  );
  const marked = crystals.filter((item) => {
    const [, , row, column] = item.id.split(":");
    return (
      [W02.cryoRow, W02.cryoRow + 1].includes(Number(row)) &&
      Number(column) >= 22 &&
      Number(column) <= 25
    );
  });
  // Retain the authored seam and one real replacement source if it is spent.
  // Ordinary deposits remain ordinary ore rather than dozens of POI landmarks.
  const nearest = crystals
    .filter((item) => item.status === "deposit" || item.status === "exposed")
    .sort((a, b) => distanceTo(campaign, a) - distanceTo(campaign, b))[0];
  const relevant = new Map(marked.map((item) => [item.id, item]));
  if (campaign.currentMilestone?.id === 2 && nearest)
    relevant.set(nearest.id, nearest);
  for (const id of campaign.volatileWindow?.packageIds ?? []) {
    const item = crystals.find((crystal) => crystal.id === id);
    if (item) relevant.set(item.id, item);
  }
  return [
    ...missions,
    ...Array.from(relevant.values(), (item) =>
      describe({
        id: item.id,
        kind: "cryo",
        name: "Intact cryosilicate",
        title: "Crystal preservation seam",
        frame: "mission-cryovein",
        stage: 2,
        x: item.x,
        y: item.y,
        status:
          item.status === "banked" || item.status === "sold"
            ? "banked"
            : item.status === "carried"
              ? "carried"
              : "source",
      }),
    ),
  ];
}

function distanceTo(campaign: Campaign, target: { x: number; y: number }) {
  return Math.hypot(
    wrapDelta(campaign.state.vehicle.x, target.x, campaign.world.width),
    target.y - campaign.state.vehicle.y,
  );
}

type ReturnReason =
  | "ore"
  | "mission"
  | "samples"
  | "intact"
  | "space"
  | "construction"
  | "launch"
  | "travel"
  | "opening-sale"
  | "upgrade"
  | "energy"
  | "relic";

/** Current-stage bearings are mission broadcasts, not a scanner for hidden ore. */
/**
 * H1 (D3): the target's distance and bearing as the objective pill shows
 * them ("398 m ↑"), with words for assistive technology.
 */
export function objectiveDistance(
  signal: Pick<MissionSignal, "direction" | "distanceMeters" | "arrow">,
) {
  return signal.direction === "here"
    ? { text: "here", label: "At the target" }
    : {
        text: `${signal.distanceMeters} m ${signal.arrow}`,
        label: `${signal.distanceMeters} metres, ${signal.direction.replace("-", " and ")}`,
      };
}

export function campaignSignal(campaign: Campaign): MissionSignal | undefined {
  const state = campaign.state;
  const comet = state.currentWorld === "W02";
  const milestone = campaign.currentMilestone;
  const pois = campaignPois(campaign);
  let poi: MissionPoi | undefined;
  let returnReason: ReturnReason | undefined;
  const distance = (target: MissionPoi) => distanceTo(campaign, target);
  const opening = openingRoute(campaign);
  const equipped = [
    state.equipped.drill,
    state.equipped.mobility,
    state.equipped.processor,
    ...state.equipped.utilities,
  ];
  const goal = postChapterGoal(campaign);
  if ((!milestone && comet) || (!comet && state.progress.departed)) {
    if (goal?.kind === "relic" && goal.carried) returnReason = "relic";
    else if (goal && (!goal.tool || equipped.includes(goal.tool)))
      poi = pois.find((item) => item.id === goal.id);
    else if (comet) returnReason = "travel";
  } else if (opening) {
    if (opening.phase === "seam")
      poi = pois.find((item) => item.id === "W01-SEAM-B");
    else returnReason = opening.phase === "sell" ? "opening-sale" : "upgrade";
  } else if (comet) {
    if (!milestone) returnReason = "travel";
    else if (campaign.missionReady) returnReason = "construction";
    else {
      const required = pois.filter((item) => item.stage === milestone.id);
      if (milestone.id === 1) {
        const carried = required.filter(
          (item) => item.status === "carried",
        ).length;
        if (carried + campaign.bankedSamples >= 5) returnReason = "samples";
      } else if (milestone.id === 2) {
        const carried = campaign.cargo.filter(
          (item) =>
            item.itemId === "W02-O3" &&
            item.tags.includes("cryosample") &&
            item.tags.includes("intact"),
        ).length;
        if (
          carried + campaign.bankedIntact >= 3 ||
          campaign.cargoBulk + 2 > campaign.capacity
        )
          returnReason = carried ? "intact" : "space";
      } else if (required.some((item) => item.status === "carried"))
        returnReason = "mission";
      if (!returnReason)
        poi = required
          .filter((item) => item.status === "source")
          .sort((a, b) => distance(a) - distance(b))[0];
    }
  } else if (!milestone) returnReason = "launch";
  else if (milestone.id === 1) {
    if (campaign.missionReady) returnReason = "construction";
    else if (openingSeamPending(campaign))
      poi = pois.find((item) => item.id === "W01-SEAM-A");
    else if (campaign.cargo.some((item) => item.tags.includes("ordinary")))
      returnReason = "ore";
  } else {
    const required = pois.filter(
      (item) =>
        milestone.requiredMissionIds.some((id) => id === item.id) ||
        (item.kind === "beacon" && milestone.id === W01_SURVEY_MILESTONE),
    );
    // A survey carries nothing, so a recovered part need not go home first
    // when the wreck beacon is within the local band (the antenna room is
    // about 70 m from it); a farther beacon waits for the next dive.
    const wreck = required.find(
      (item) => item.kind === "beacon" && item.status === "source",
    );
    if (required.some((item) => item.status === "carried"))
      if (wreck && distance(wreck) <= MISSION_SIGNAL_RANGES.near) poi = wreck;
      else returnReason = "mission";
    else if (campaign.missionReady) returnReason = "construction";
    else
      poi = required
        .filter((item) => item.status === "source")
        .sort((a, b) => distance(a) - distance(b))[0];
  }
  if (
    !campaign.atDock &&
    state.vehicle.y > 0 &&
    ["turn", "stranded"].includes(campaign.returnReserve.state)
  )
    returnReason = "energy";
  if (returnReason)
    poi = {
      id: `${state.currentWorld}-LANDER`,
      kind: "lander",
      name: comet ? "Comet lander" : "Salvage lander",
      title: "Surface lander",
      x: campaign.activeWorldDefinition.dockX,
      y: -campaign.activeWorldDefinition.bodyHalfY,
      frame: "dock-stage-" + campaign.completedMilestones.length,
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
  if (returnReason === "energy")
    action =
      campaign.returnReserve.state === "stranded"
        ? "Cannot reach home · use reserve or request recovery"
        : "Turn back · preserve energy for the climb";
  else if (returnReason === "opening-sale")
    action = campaign.atDock
      ? "Unload and sell, then install the expedition tank"
      : "Return to the lander to sell the second haul";
  else if (returnReason === "upgrade")
    action = campaign.atDock
      ? "Workshop → Install the expedition tank"
      : "Return to the lander to install the expedition tank";
  else if (returnReason === "relic")
    action = campaign.atDock
      ? "Dock and bank the recovered relic"
      : "Return to the lander to bank the relic";
  else if (returnReason === "ore")
    action = campaign.atDock
      ? "Dock and bank your ore"
      : "Return to the lander to bank ore";
  else if (returnReason === "samples")
    action = campaign.atDock
      ? "Dock and bank Helion samples"
      : "Return to the lander to bank Helion samples";
  else if (returnReason === "intact")
    action = campaign.atDock
      ? "Dock and bank intact cryosilicate"
      : "Return to the lander to bank intact cryosilicate";
  else if (returnReason === "space")
    action = campaign.atDock
      ? "Dock and bank cargo to make room"
      : "Return to the lander and bank cargo to make room";
  else if (returnReason === "mission")
    action = campaign.atDock
      ? "Dock and bank mission cargo"
      : "Return to the lander to bank mission cargo";
  else if (returnReason === "launch")
    action = campaign.atDock
      ? "Dock and launch"
      : "Return to the lander to launch";
  else if (returnReason === "travel")
    action = campaign.atDock
      ? "Dock to travel or continue mining this claim"
      : "Return to the lander to travel";
  else if (returnReason === "construction")
    action =
      state.credits >= milestone!.fee
        ? campaign.atDock
          ? "Dock and fund construction"
          : "Return to the lander to fund construction"
        : "Sell ore at the lander to fund construction";
  else if (poi.kind === "seam")
    action =
      poi.id === "W01-SEAM-A"
        ? "Mine seam A to 70 m, then return and bank"
        : "Mine seam B to 70 m, then return and sell";
  else if (poi.kind === "relic")
    action = poi.buried
      ? "Excavate the named relic"
      : "Approach to recover the relic";
  else if (poi.kind === "log") action = "Approach and read the field log";
  else if (poi.kind === "cache")
    action = poi.buried
      ? "Excavate the sealed cache"
      : "Approach and open the sealed cache";
  else if (poi.kind === "beacon")
    action = "Approach the wreck beacon to survey";
  else if (poi.kind === "sample")
    action = poi.buried
      ? "Excavate the marked Helion sample pods"
      : "Approach to recover the Helion sample";
  else if (poi.kind === "cryo")
    action = poi.buried
      ? "Cut the marked crystal, then release at the completion cue"
      : "Approach to recover the preserved crystal";
  else if (poi.kind === "catalyst")
    action = poi.buried
      ? "Excavate the cryogenic capsule"
      : "Approach to recover the cryogenic catalyst";
  else
    action = poi.buried
      ? "Excavate the marked debris"
      : "Approach to recover the mission part";

  // The wreck beacon stands in open gallery air, so it is never "buried", but
  // from afar the useful advice is still its depth.
  if (
    !returnReason &&
    band === "distant" &&
    (poi.buried || poi.kind === "beacon") &&
    poi.kind !== "seam"
  )
    action = `Descend to ${poi.depthMeters} m (${arrows[direction]})`;

  if (returnReason && !campaign.atDock && cells <= 3 && state.vehicle.y < 0)
    action = "Land in the illuminated bay to dock";
  if (comet && campaign.volatileWindow)
    action = "Release drilling now to preserve the crystal";

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
