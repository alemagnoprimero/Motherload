import { describe, expect, it } from "vitest";
import { Campaign, createCampaign } from "../src/campaign/model";
import { campaignPois } from "../src/campaign/poi";
import {
  FIELD_LOG_FRAME,
  poiArtwork,
  poiSecondaryCaption,
} from "../src/campaign/render/poi-art";
import zones from "../assets/campaign/generated/w01-zones.json";

describe("physical ownership of mission artwork", () => {
  it("keeps the opening ore routes from creating phantom survey wrecks", () => {
    const campaign = new Campaign(createCampaign(23));
    const entry = campaignPois(campaign).filter((poi) => poi.y < 10);
    // D14: the 95 m route cell lost its beacon; only the marked seams remain.
    expect(entry.map((poi) => poi.id).sort()).toEqual([
      "W01-SEAM-A",
      "W01-SEAM-B",
    ]);
    expect(
      entry.map(poiArtwork).filter((art) => art.marker || art.scenery),
    ).toHaveLength(0);
    for (const poi of entry.filter((poi) => poi.kind === "seam"))
      expect(poiSecondaryCaption(poi)).toBeUndefined();
    // One beacon, and it is the objective: the tripod in the SITE-4 gallery.
    const beacons = campaignPois(campaign).filter(
      (poi) => poi.kind === "beacon",
    );
    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toMatchObject({ id: "W01-BEACON", y: 45.5 });
    const art = poiArtwork(beacons[0]!);
    expect(art.marker).toBe("mission-beacon");
    expect(art.scenery).toBeUndefined();
    expect(art.height).toBeGreaterThan(1);
  });

  it("does not duplicate caches, field records or relics when the chapter unlocks their radio signals", () => {
    const campaign = new Campaign(createCampaign(23));
    campaign.state.progress.completed = [1, 2, 3];
    const before = JSON.stringify(campaign.state);
    const goals = campaignPois(campaign).filter((poi) => poi.stage === 4);
    expect(new Set(goals.map((poi) => poi.kind))).toEqual(
      new Set(["cache", "log", "relic"]),
    );
    for (const poi of goals) {
      const art = poiArtwork(poi);
      expect(art.marker, poi.id).toBeUndefined();
      expect(art.scenery, poi.id).toBeUndefined();
    }
    expect(JSON.stringify(campaign.state)).toBe(before);
  });

  it("captions a mission part with its title alone (F6)", () => {
    for (const kind of ["valve", "antenna", "core", "catalyst"] as const)
      expect(
        poiSecondaryCaption({
          kind,
          title: "Pressure valve",
          status: "source",
        }),
      ).toBe("Pressure valve");
    // The other states keep their suffix.
    expect(
      poiSecondaryCaption({
        kind: "valve",
        title: "Pressure valve",
        status: "carried",
      }),
    ).toBe("Pressure valve · recovered");
    expect(
      poiSecondaryCaption({
        kind: "beacon",
        title: "Wreck survey beacon",
        status: "source",
      }),
    ).toBe("Wreck survey beacon · survey signal");
    expect(
      poiSecondaryCaption({ kind: "relic", title: "Relic", status: "source" }),
    ).toBe("Relic · relic");
  });

  it("retains real atlas frames for recoverable mission parts and compact records", () => {
    const campaign = new Campaign(createCampaign(23));
    // On a W01 zone page (audit T13b), the pages the game loads.
    const frames = zones.frames as Record<string, string>;
    for (const poi of campaignPois(campaign)) {
      const art = poiArtwork(poi);
      if (art.marker) expect(frames[art.marker], poi.id).toBeDefined();
      if (art.scenery) expect(frames[art.scenery], poi.id).toBeDefined();
      if (["valve", "antenna", "core"].includes(poi.kind))
        expect(art.marker).toBe(poi.frame);
    }
    expect(frames[FIELD_LOG_FRAME]).toBeDefined();
    expect(FIELD_LOG_FRAME).not.toMatch(/^site-/);
  });
});
