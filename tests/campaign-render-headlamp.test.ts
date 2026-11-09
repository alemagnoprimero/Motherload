import { describe, expect, it } from "vitest";
import {
  T1_LITE_HEADLAMP_CORE,
  T1_LITE_HEADLAMP_LENS,
  t1LiteHeadlampAdd,
  t1LiteHeadlampPixels,
} from "../src/campaign/render/t1-lite-headlamp";

/** CIE L* and b* of an sRGB colour (D65), as scripts/art_metrics.py lab(). */
function lab([r, g, b]: number[]) {
  const linear = [r!, g!, b!].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [lr, lg, lb] = linear as [number, number, number];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.9505,
    y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb,
    z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.089;
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  return { L: 116 * f(y) - 16, b: 200 * (f(y) - f(z)) };
}
// The harness probe (scripts/art_metrics.py headlamp_axis): 0.35 tile along
// a ray 14° below horizontal from (0.40, −0.13), measured from the lens,
// which sits 0.015 tile above the rig's centre as the rig is drawn.
const lens = {
  x: T1_LITE_HEADLAMP_LENS.x * (64 / 48),
  y: T1_LITE_HEADLAMP_LENS.y * (64 / 48) - 0.015,
};
const probe = Math.hypot(
  0.4 + 0.35 * Math.cos((14 * Math.PI) / 180) - lens.x,
  -0.13 + 0.35 * Math.sin((14 * Math.PI) / 180) - lens.y,
);
// Cave air under that probe at SITE-4 on main, before T1-lite (F3 table).
const caveAir = [30, 39, 45];

describe("T1-lite headlamp core", () => {
  it("puts the lens where rig-cabin.svg draws it", () => {
    // HEADLAMP_LENS (100.2, 44.5) of the 128-unit frame (A13).
    expect(lens.x).toBeCloseTo((36.2 / 128) * (64 / 48), 6);
    expect(lens.y).toBeCloseTo((-19.5 / 128) * (64 / 48) - 0.015, 6);
    // The lens on the cabin's shoulder is 0.40 tile from the probe.
    expect(probe).toBeGreaterThan(0.39);
    expect(probe).toBeLessThan(0.41);
  });
  it("lifts cave air at the probe to L* ≥ 70 with b* +15 to +30", () => {
    const add = t1LiteHeadlampAdd(probe);
    const lit = caveAir.map((v, n) => Math.min(255, v + add[n]!));
    const { L, b } = lab(lit);
    expect(L).toBeGreaterThanOrEqual(70);
    expect(b).toBeGreaterThanOrEqual(15);
    expect(b).toBeLessThanOrEqual(30);
  });
  it("is warm, falls off with distance and ends at its radius", () => {
    let previous = Infinity;
    for (let r = 0; r <= T1_LITE_HEADLAMP_CORE.radius; r += 0.05) {
      const [red, green, blue] = t1LiteHeadlampAdd(r);
      expect(red).toBeGreaterThanOrEqual(green);
      expect(green).toBeGreaterThanOrEqual(blue);
      expect(red).toBeLessThanOrEqual(previous);
      previous = red;
    }
    expect(t1LiteHeadlampAdd(T1_LITE_HEADLAMP_CORE.radius)).toEqual([0, 0, 0]);
    expect(t1LiteHeadlampAdd(T1_LITE_HEADLAMP_CORE.radius + 1)).toEqual([
      0, 0, 0,
    ]);
  });
  it("bakes an opaque, symmetric texture with black corners", () => {
    const size = 32,
      pixels = t1LiteHeadlampPixels(size);
    const at = (x: number, y: number) =>
      Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4));
    for (let n = 3; n < pixels.length; n += 4) expect(pixels[n]).toBe(255);
    expect(at(0, 0)).toEqual([0, 0, 0, 255]);
    expect(at(size - 1, size - 1)).toEqual([0, 0, 0, 255]);
    expect(at(5, 9)).toEqual(at(size - 1 - 5, size - 1 - 9));
    expect(at(size / 2, size / 2)[0]).toBe(255);
    // Static: the same bytes every time it is built.
    expect(t1LiteHeadlampPixels(size)).toEqual(pixels);
  });
});
