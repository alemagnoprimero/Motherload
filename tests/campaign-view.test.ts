import { describe, expect, it } from "vitest";
import {
  CampaignView,
  campaignCameraY,
  surfaceFraming,
} from "../src/campaign/view";

describe("world labels across horizontal wrapping", () => {
  it.each([-3, -1, 0, 1, 4])(
    "keeps the rig and nearest home copy aligned on lap %s",
    (lap) => {
      const view = new CampaignView().configure(440, 800, 2, 44, {
        top: 140,
        bottom: 60,
      });
      const width = 40,
        rigX = 0.5,
        unwrapped = rigX + lap * width;
      view.scroll(unwrapped * view.tile - view.width / 2, 500);
      const nearest = view.nearestWorldX(rigX, width);
      expect(nearest).toBe(unwrapped);
      expect(view.worldToScreen(nearest, 20).x).toBe(220);
      expect(view.worldToScreen(view.nearestWorldX(39.5, width), 0).x).toBe(
        176,
      );
      expect(view.screenToWorld(220, 380).x).toBe(unwrapped);
    },
  );
});

describe("continuous surface camera framing", () => {
  const forms = [
    {
      name: "desktop",
      height: 900,
      tile: 65.45,
      safe: { top: 160, bottom: 76 },
    },
    { name: "phone", height: 851, tile: 44, safe: { top: 180, bottom: 96 } },
    {
      name: "short landscape",
      height: 320,
      tile: 44,
      safe: { top: 92, bottom: 48 },
    },
  ];
  it.each(forms)(
    "crosses the old surface threshold smoothly on $name",
    ({ height, tile, safe }) => {
      for (const reduced of [false, true]) {
        for (const velocity of [0, -0.01, -1, -3]) {
          const above = campaignCameraY(
            0.199,
            velocity,
            tile,
            height,
            safe,
            reduced,
          );
          const below = campaignCameraY(
            0.201,
            velocity,
            tile,
            height,
            safe,
            reduced,
          );
          expect(Math.abs(above - below)).toBeLessThan(1);
        }
      }
    },
  );
  it.each(forms)(
    "keeps surface landmarks clear of bottom controls on $name",
    ({ height, tile, safe }) => {
      const surface = -campaignCameraY(-0.36, 0, tile, height, safe, false);
      expect(surface).toBeGreaterThan(safe.top + tile * 3);
      expect(surface + tile * 0.5).toBeLessThan(height - safe.bottom);
    },
  );
  it.each(forms)(
    "grows ascent look-ahead with velocity on $name",
    ({ height, tile, safe }) => {
      const atRest = campaignCameraY(8, 0, tile, height, safe, false);
      const firstThrust = campaignCameraY(8, -0.01, tile, height, safe, false);
      expect(Math.abs(firstThrust - atRest)).toBeLessThan(1);
      const ascent = campaignCameraY(8, -3, tile, height, safe, false);
      expect(ascent).toBeLessThan(firstThrust);
      expect(campaignCameraY(8, -3, tile, height, safe, true)).toBe(
        campaignCameraY(8, 0, tile, height, safe, true),
      );
    },
  );
  it("keeps surface composition stable above ground and blends into the shaft", () => {
    expect(surfaceFraming(-4)).toBe(1);
    expect(surfaceFraming(0)).toBe(1);
    expect(surfaceFraming(2)).toBe(0.5);
    expect(surfaceFraming(4)).toBe(0);
    expect(surfaceFraming(200)).toBe(0);
  });
});
