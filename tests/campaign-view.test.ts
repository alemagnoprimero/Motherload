import { describe, expect, it } from "vitest";
import { CampaignView } from "../src/campaign/view";

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
