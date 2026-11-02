import type { BalanceVersion, GeneratorVersion } from "./types";

/** Versions describe stored contracts, not an invitation to regenerate a save. */
export const KNOWN_BALANCE_VERSIONS: readonly BalanceVersion[] = [
  "0.1",
  "0.2",
  "0.3",
];
export const KNOWN_GENERATOR_VERSIONS: readonly GeneratorVersion[] = [1, 2];
export const knownBalanceVersion = (value: unknown): value is BalanceVersion =>
  KNOWN_BALANCE_VERSIONS.includes(value as BalanceVersion);
export const knownGeneratorVersion = (
  value: unknown,
): value is GeneratorVersion =>
  KNOWN_GENERATOR_VERSIONS.includes(value as GeneratorVersion);

export const WORLD_BALANCE_VERSIONS = { W01: "0.2", W02: "0.3" } as const;

/** Development tools may inspect older contracts; production never reads a URL override. */
export function developmentBalanceVersion(
  requested: string | null,
  development: boolean,
): BalanceVersion {
  return development && knownBalanceVersion(requested) ? requested : "0.3";
}

const development =
  typeof import.meta.env !== "undefined" && import.meta.env.DEV === true;
export const ACTIVE_BALANCE_VERSION = developmentBalanceVersion(
  development && typeof location !== "undefined"
    ? new URLSearchParams(location.search).get("balance")
    : null,
  development,
);
