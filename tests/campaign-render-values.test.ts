import { describe, expect, it } from "vitest";
import {
  HIGH_CONTRAST_UNKNOWN_DARKNESS,
  RENDER_BANDS,
  stateDarkness,
} from "../src/campaign/render/bands";

describe("value key (F4)", () => {
  const bands = Object.entries(RENDER_BANDS).flatMap(([world, list]) =>
    list.map((band) => [`${world}-${band.id}`, band.ambient] as const),
  );
  it.each(bands)(
    "orders darkness unknown > remembered > visible in band %s",
    (_band, ambient) => {
      const level = stateDarkness(ambient);
      expect(level.unknown).toBeGreaterThan(level.remembered);
      expect(level.remembered).toBeGreaterThan(level.visible);
      expect(level.visible).toBeGreaterThan(0);
      // High contrast keeps the order and the L* 18 floor on unknown rock.
      const unknownHigh = Math.min(
        level.unknown * 0.65,
        HIGH_CONTRAST_UNKNOWN_DARKNESS,
      );
      expect(unknownHigh).toBeGreaterThan(level.remembered * 0.65);
      expect(unknownHigh).toBeLessThanOrEqual(HIGH_CONTRAST_UNKNOWN_DARKNESS);
    },
  );
  it("darkens every state with depth", () => {
    for (const list of Object.values(RENDER_BANDS))
      for (let n = 1; n < list.length; n++) {
        const above = stateDarkness(list[n - 1]!.ambient),
          below = stateDarkness(list[n]!.ambient);
        expect(below.unknown).toBeGreaterThan(above.unknown);
        expect(below.remembered).toBeGreaterThan(above.remembered);
        expect(below.visible).toBeGreaterThan(above.visible);
      }
  });
});
