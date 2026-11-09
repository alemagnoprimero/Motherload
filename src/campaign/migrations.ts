import { W02_HAZARDS } from "./frontier";
import type { CampaignState, CampaignWorld } from "./types";
import { knownBalanceVersion, knownGeneratorVersion } from "./versions";
import { CONTRACTS } from "./contracts";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, min = 0, max = 1e13): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const integer = (value: unknown, min = 0, max = 1e13): value is number =>
  finite(value, min, max) && Number.isInteger(value);
const text = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const unique = (values: readonly unknown[]) =>
  new Set(values).size === values.length;
const worldId = (value: unknown) => value === "W01" || value === "W02";
const invalid = (name: string): never => {
  throw new Error(`Campaign ${name} is invalid.`);
};

/** Additive migration only: never generate terrain or recalculate a package's money. */
export function migrateProgress(state: CampaignState) {
  const progress = state.progress;
  if (progress.volatileTraining === undefined) progress.volatileTraining = 0;
  if (progress.contracts === undefined) progress.contracts = [];
  if (progress.records === undefined) progress.records = {};
  if (progress.waypoints === undefined) progress.waypoints = [];
  if (progress.caches === undefined) progress.caches = [];
  // D14 moved the W01 beacon from the 95 m route cell to the SITE-4 crew
  // gallery and its survey from M1 to M2, which is the only stage that can
  // record it. A save still in M1 can hold only the retired 95 m survey: M1 no
  // longer needs it, and M2 will ask for the wreck instead. A save past M1
  // keeps its survey, so no started stage loses proof it already has.
  if (!progress.completed.includes(1)) progress.beacon = false;
  if (!integer(progress.volatileTraining, 0, 1e7))
    invalid("volatile training history");
  if (
    !Array.isArray(progress.contracts) ||
    progress.contracts.length > 32 ||
    !unique(progress.contracts.map((entry) => entry?.id)) ||
    progress.contracts.some(
      (entry) =>
        !record(entry) ||
        !text(entry.id) ||
        !worldId(entry.worldId) ||
        !integer(entry.progress, 0, 1e7) ||
        typeof entry.completed !== "boolean" ||
        typeof entry.claimed !== "boolean" ||
        (entry.claimed && !entry.completed),
    )
  )
    invalid("contract ledger");
  if (record(progress.records)) {
    for (const entry of Object.values(progress.records)) {
      if (!record(entry)) continue;
      if (entry.historyComplete === undefined) entry.historyComplete = false;
      if (entry.bestHaul === undefined) entry.bestHaul = 0;
    }
  }
  if (
    !record(progress.records) ||
    Object.keys(progress.records).length > 2 ||
    Object.entries(progress.records).some(
      ([id, entry]) =>
        !worldId(id) ||
        !record(entry) ||
        typeof entry.historyComplete !== "boolean" ||
        !integer(entry.bestHaul) ||
        (entry.completion !== undefined &&
          (!record(entry.completion) ||
            !finite(entry.completion.elapsed, 0, 1e10) ||
            !integer(entry.completion.recoveries, 0, 1e7))) ||
        !finite(entry.elapsed, 0, 1e10) ||
        !integer(entry.ordinaryIncome) ||
        !integer(entry.mined) ||
        !integer(entry.recoveries) ||
        !finite(entry.deepest, 0, 1000) ||
        !integer(entry.contracts, 0, 32) ||
        !integer(entry.mastery, 0, 3),
    )
  )
    invalid("chapter records");
  if (
    !Array.isArray(progress.waypoints) ||
    progress.waypoints.length > 32 ||
    !unique(progress.waypoints.map((entry) => entry?.id)) ||
    progress.waypoints.some(
      (entry) =>
        !record(entry) ||
        !text(entry.id) ||
        !worldId(entry.worldId) ||
        !text(entry.label, 80) ||
        !finite(
          entry.x,
          0,
          entry.worldId === "W01" ? 39.9999999 : 47.9999999,
        ) ||
        !finite(entry.y, -6, entry.worldId === "W01" ? 59.9999999 : 99.9999999),
    )
  )
    invalid("waypoints");
  if (
    !Array.isArray(progress.caches) ||
    progress.caches.length > 100 ||
    !unique(progress.caches) ||
    progress.caches.some((id) => !text(id))
  )
    invalid("cache history");
}

/** Version-1 worlds keep their original hazards and their already excavated geometry. */
export function migrateWorld(world: CampaignWorld) {
  if (world.balanceVersion === undefined) world.balanceVersion = "0.1";
  if (world.generatorVersion === undefined) world.generatorVersion = 1;
  if (
    !knownBalanceVersion(world.balanceVersion) ||
    !knownGeneratorVersion(world.generatorVersion) ||
    (world.generatorVersion === 1 && world.balanceVersion !== "0.1")
  )
    invalid("world version");
  if (world.pressureSeams === undefined) world.pressureSeams = [];
  if (world.sites === undefined) world.sites = [];
  if (world.fieldLogs === undefined) world.fieldLogs = [];
  if (world.hazards === undefined)
    world.hazards =
      world.id === "W02"
        ? {
            coldPockets: W02_HAZARDS.coldPockets.map((entry) => ({ ...entry })),
            vents: W02_HAZARDS.vents.map((entry) => ({ ...entry })),
          }
        : { coldPockets: [], vents: [] };
  const position = (entry: unknown) =>
    record(entry) &&
    finite(entry.x, 0, world.width - 1e-7) &&
    finite(entry.y, 0, world.rows - 1e-7);
  if (
    !Array.isArray(world.pressureSeams) ||
    world.pressureSeams.length > world.tiles.length ||
    !unique(world.pressureSeams.map((entry) => entry?.id)) ||
    world.pressureSeams.some(
      (entry) =>
        !position(entry) ||
        !text(entry.id) ||
        typeof entry.spent !== "boolean" ||
        (entry.warning !== null && !finite(entry.warning, 0, 1.2)),
    )
  )
    invalid("pressure seams");
  if (
    !record(world.hazards) ||
    ![world.hazards.coldPockets, world.hazards.vents].every(
      (entries) =>
        Array.isArray(entries) &&
        entries.length <= 100 &&
        entries.every(
          (entry) =>
            position(entry) && (entry.id === undefined || text(entry.id)),
        ),
    )
  )
    invalid("world hazards");
  if (
    !Array.isArray(world.sites) ||
    world.sites.length > 100 ||
    !unique(world.sites.map((site) => site?.id)) ||
    world.sites.some(
      (site) =>
        !position(site) ||
        !text(site.id) ||
        !text(site.name) ||
        !["wreck", "geode", "cache", "survey", "mission"].includes(site.kind) ||
        typeof site.opened !== "boolean" ||
        (site.discovered !== undefined &&
          typeof site.discovered !== "boolean") ||
        (site.logId !== undefined && !text(site.logId)) ||
        (site.tool !== undefined &&
          ![
            "W01-R1",
            "W01-R2",
            "W01-R3",
            "W02-R1",
            "W02-R2",
            "W02-R3",
          ].includes(site.tool)) ||
        (site.reward !== undefined && !integer(site.reward, 0, 1000000)),
    )
  )
    invalid("field sites");
  if (
    !Array.isArray(world.fieldLogs) ||
    world.fieldLogs.length > 100 ||
    !unique(world.fieldLogs.map((entry) => entry?.id)) ||
    world.fieldLogs.some(
      (entry) =>
        !position(entry) ||
        !text(entry.id) ||
        !text(entry.title) ||
        !text(entry.text, 2000) ||
        typeof entry.read !== "boolean",
    )
  )
    invalid("field logs");
  if (
    world.sites.some(
      (site) =>
        site.logId !== undefined &&
        !world.fieldLogs!.some((entry) => entry.id === site.logId),
    )
  )
    invalid("site log reference");
}

/** Validate new ledgers against already validated worlds after migration. */
export function validateProgressReferences(state: CampaignState) {
  for (const contract of state.progress.contracts ?? []) {
    const definition = CONTRACTS.find((entry) => entry.id === contract.id);
    if (
      !definition ||
      definition.worldId !== contract.worldId ||
      !state.worlds[contract.worldId] ||
      contract.progress > definition.target ||
      (contract.completed && contract.progress !== definition.target)
    )
      invalid("contract proof");
  }
  for (const [id, entry] of Object.entries(state.progress.records ?? {})) {
    if (!state.worlds[id]) invalid("chapter record destination");
    const completed =
      id === "W01" ? state.progress.completed : state.worlds[id]!.completed;
    if (entry.completion !== undefined && !completed?.includes(3))
      invalid("chapter completion proof");
  }
  for (const waypoint of state.progress.waypoints ?? [])
    if (!state.worlds[waypoint.worldId]) invalid("waypoint destination");
  for (const id of state.progress.caches ?? [])
    if (
      !Object.values(state.worlds).some((world) =>
        world.sites?.some(
          (site) => site.id === id && site.kind === "cache" && site.opened,
        ),
      )
    )
      invalid("cache proof");
}
