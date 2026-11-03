import type { MissionPoi } from "../poi";

export interface PoiArtwork {
  scenery?: string;
  marker?: string;
  width: number;
  height: number;
}

/** A navigation target is not necessarily another physical object in the mine. */
export function poiArtwork(
  poi: Pick<MissionPoi, "kind" | "frame">,
): PoiArtwork {
  // These already have a world renderer: deposits, sites, relic packages and logs.
  // Drawing another broad wreck at their radio target duplicated the same object.
  if (["seam", "cache", "relic", "log", "lander"].includes(poi.kind))
    return { width: 0, height: 0 };
  if (poi.kind === "beacon")
    return { marker: poi.frame, width: 1.2, height: 1.6 };
  if (poi.kind === "sample" || poi.kind === "cryo")
    return { marker: poi.frame, width: 0.8, height: 0.8 };
  return {
    scenery:
      poi.kind === "core" || poi.kind === "catalyst"
        ? "site-core"
        : "site-wreck",
    marker: poi.frame,
    width: poi.kind === "antenna" ? 1.1 : 0.8,
    height: poi.kind === "antenna" ? 1.1 : 0.8,
  };
}

/** A small readable record marker, never the full survey-mast scenery. */
export const FIELD_LOG_FRAME = "ui-mission";

/** Ore already has tile art and active route guidance; extra labels obscure it. */
export function poiSecondaryCaption(
  poi: Pick<MissionPoi, "kind" | "title" | "status">,
) {
  if (["seam", "cache", "log", "lander"].includes(poi.kind)) return undefined;
  if (poi.kind === "sample" || poi.kind === "cryo") return poi.title;
  const suffix =
    poi.status === "surveyed"
      ? "surveyed"
      : poi.status === "carried" || poi.status === "banked"
        ? "recovered"
        : poi.kind === "beacon"
          ? "survey signal"
          : poi.kind === "relic"
            ? "relic"
            : "mission part";
  return `${poi.title} · ${suffix}`;
}
