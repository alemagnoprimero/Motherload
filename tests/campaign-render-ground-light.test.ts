import { describe, expect, it } from "vitest";
import {
  GROUND_LIGHT,
  groundLightAdd,
  groundLightPixels,
  groundLightStrength,
} from "../src/campaign/render/t1-lite-ground-light";

describe("T1-lite surface ground light", () => {
  it("falls off smoothly to zero at its radius, with no rim", () => {
    const at = (r: number) => groundLightAdd(r)[0];
    expect(at(0)).toBeCloseTo(GROUND_LIGHT.peak * GROUND_LIGHT.colour[0], 6);
    expect(at(GROUND_LIGHT.radius)).toBe(0);
    expect(at(GROUND_LIGHT.radius * 2)).toBe(0);
    let previous = at(0);
    for (let r = 0.01; r <= GROUND_LIGHT.radius; r += 0.01) {
      const value = at(r);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      // No step anywhere: under a quarter level per hundredth of a tile.
      expect(previous - value).toBeLessThan(0.25);
      previous = value;
    }
    // Zero slope where it ends.
    expect(at(GROUND_LIGHT.radius * 0.97)).toBeLessThan(1);
  });

  it("stays a few levels, so unknown rock keeps its luma", () => {
    const [r, g, b] = groundLightAdd(0);
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(40);
    expect(r).toBeGreaterThan(b);
  });

  it("is on at the surface and off once the rig is below ground", () => {
    expect(groundLightStrength(-0.36)).toBe(1);
    expect(groundLightStrength(0)).toBe(1);
    expect(groundLightStrength(0.9)).toBeGreaterThan(0);
    expect(groundLightStrength(0.9)).toBeLessThan(1);
    expect(groundLightStrength(1.5)).toBe(0);
    expect(groundLightStrength(6)).toBe(0);
  });

  it("bakes an opaque texture, black outside the radius", () => {
    const size = 64,
      pixels = groundLightPixels(size);
    expect(pixels).toHaveLength(size * size * 4);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
    expect([...pixels.slice(0, 3)]).toEqual([0, 0, 0]);
    const centre = ((size / 2) * size + size / 2) * 4;
    expect(pixels[centre]).toBeGreaterThan(25);
  });
});
