import { describe, expect, it } from "vitest";
import {
  HIGH_CONTRAST_UNKNOWN_DARKNESS,
  RENDER_BANDS,
  fogDarkness,
} from "../src/campaign/render/bands";

/** L* of a grey of sRGB value `luma`. */
function lightness(luma: number) {
  const c = luma / 255,
    y = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27;
}
// The darkest unknown cell before darkness: W02 D, base #2f4250 under its
// rock page (mean luma 65.4) at 0.5 alpha. The fog colour is rgba(5,9,13).
const darkestUnknown = 0.5 * 63.0 + 0.5 * 65.4,
  fog = 0.2126 * 5 + 0.7152 * 9 + 0.0722 * 13;
const afterDarkness = (darkness: number) =>
  darkestUnknown * (1 - darkness) + fog * darkness;

describe("value key (F4)", () => {
  const bands = Object.entries(RENDER_BANDS).flatMap(([world, list]) =>
    list.map((band) => [`${world}-${band.id}`, band.ambient] as const),
  );
  it.each(bands)(
    "orders darkness unknown > remembered > visible in band %s",
    (_band, ambient) => {
      for (const highContrast of [false, true]) {
        const unknown = fogDarkness("unknown", ambient, highContrast),
          remembered = fogDarkness("remembered", ambient, highContrast),
          visible = fogDarkness("visible", ambient, highContrast);
        expect(unknown).toBeGreaterThan(remembered);
        expect(remembered).toBeGreaterThan(visible);
        expect(visible).toBeGreaterThan(0);
      }
      // High contrast lightens every state.
      for (const state of ["unknown", "remembered", "visible"] as const)
        expect(fogDarkness(state, ambient, true)).toBeLessThan(
          fogDarkness(state, ambient, false),
        );
    },
  );
  it("keeps unknown rock at or above L* 18 in high contrast", () => {
    expect(
      lightness(afterDarkness(HIGH_CONTRAST_UNKNOWN_DARKNESS)),
    ).toBeGreaterThanOrEqual(18);
    for (const [, ambient] of bands)
      expect(
        lightness(afterDarkness(fogDarkness("unknown", ambient, true))),
      ).toBeGreaterThanOrEqual(18);
  });
  it("darkens every state with depth", () => {
    for (const list of Object.values(RENDER_BANDS))
      for (let n = 1; n < list.length; n++)
        for (const state of ["unknown", "remembered", "visible"] as const)
          expect(fogDarkness(state, list[n]!.ambient, false)).toBeGreaterThan(
            fogDarkness(state, list[n - 1]!.ambient, false),
          );
  });
});
