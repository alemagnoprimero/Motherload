import { describe, expect, it } from "vitest";
import {
  BACKING_LEVELS,
  CampaignView,
  RenderScaleBudget,
  campaignCameraY,
  qualityTier,
  renderDebugOptions,
  surfaceFraming,
  type QualityTier,
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

/** Feed `seconds` of frames at a fixed cost; return every scale the scene would draw at. */
function frames(
  budget: RenderScaleBudget,
  milliseconds: number,
  seconds: number,
  { dpr = 2, requested = 2, hold = false } = {},
) {
  const dt = 1 / 60,
    scales = new Set<number>();
  for (let n = 0; n < Math.round(seconds / dt); n++) {
    scales.add(budget.scale(dpr, requested));
    if (hold) budget.hold(1);
    budget.sample(milliseconds, dt);
  }
  scales.add(budget.scale(dpr, requested));
  return scales;
}
function budgetFor(tier: QualityTier) {
  const budget = new RenderScaleBudget();
  budget.setTier(tier);
  return budget;
}

describe("render scale budget (F1)", () => {
  it.each([
    ["high", 2],
    ["medium", 1.5],
    ["low", 1],
  ] as const)(
    "never drops a %s-tier device below its %s floor",
    (tier, floor) => {
      const budget = budgetFor(tier);
      const scales = frames(budget, 40, 30);
      expect(budget.scale(2, 2)).toBe(floor);
      for (const scale of scales)
        expect(BACKING_LEVELS as readonly number[]).toContain(scale);
      expect(Math.min(...scales)).toBe(floor);
    },
  );
  it("steps down one level per expensive 3 s window", () => {
    const budget = budgetFor("low");
    frames(budget, 40, 2.9);
    expect(budget.scale(2, 2)).toBe(2);
    frames(budget, 40, 0.2);
    expect(budget.scale(2, 2)).toBe(1.5);
    frames(budget, 40, 3);
    expect(budget.scale(2, 2)).toBe(1);
  });
  it("recovers one level after 10 s of frames with p95 below 12 ms", () => {
    const budget = budgetFor("low");
    frames(budget, 40, 7);
    expect(budget.scale(2, 2)).toBe(1);
    const dt = 1 / 60,
      changes: [number, number][] = [];
    let previous = budget.scale(2, 2);
    for (let n = 1; n <= 30 * 60; n++) {
      budget.sample(8, dt);
      const scale = budget.scale(2, 2);
      if (scale !== previous) changes.push([n * dt, scale]);
      previous = scale;
    }
    expect(changes.map(([, scale]) => scale)).toEqual([1.5, 2]);
    const [[first], [second]] = changes;
    // Ten whole one-second slices of cheap frames, counted from the first
    // slice that holds only cheap frames.
    expect(first).toBeGreaterThan(9.99);
    expect(first).toBeLessThanOrEqual(11.1);
    expect(second! - first!).toBeGreaterThan(9.99);
    expect(second! - first!).toBeLessThanOrEqual(10.2);
  });
  it("counts recovery in seconds, so a sparse slow stretch is not outvoted", () => {
    const budget = budgetFor("low");
    frames(budget, 40, 7);
    frames(budget, 8, 8);
    // Two seconds at 10 fps of 100 ms frames: few frames, but a slow stretch.
    for (let n = 0; n < 20; n++) budget.sample(100, 0.1);
    expect(budget.scale(2, 2)).toBe(1);
    frames(budget, 8, 9.5);
    expect(budget.scale(2, 2)).toBe(1);
    frames(budget, 8, 1.6);
    expect(budget.scale(2, 2)).toBe(1.5);
  });
  it("does not recover while frames stay at or above 12 ms", () => {
    const budget = budgetFor("low");
    frames(budget, 40, 7);
    frames(budget, 14, 30);
    expect(budget.scale(2, 2)).toBe(1);
  });
  it("ignores frames inside loading and resize windows", () => {
    const budget = budgetFor("low");
    frames(budget, 40, 10, { hold: true });
    expect(budget.scale(2, 2)).toBe(2);
    // One more second of hold after the window, then a full 3 s window.
    frames(budget, 40, 3.9);
    expect(budget.scale(2, 2)).toBe(2);
    frames(budget, 40, 0.2);
    expect(budget.scale(2, 2)).toBe(1.5);
  });
  it("stays within what the device and the Render quality setting allow", () => {
    expect([...frames(budgetFor("high"), 8, 20, { dpr: 1 })]).toEqual([1]);
    expect([...frames(budgetFor("high"), 40, 20, { requested: 1.5 })]).toEqual([
      1.5,
    ]);
    const phone = budgetFor("medium");
    frames(phone, 40, 10, { dpr: 3 });
    expect(phone.scale(3, 2)).toBe(1.5);
  });
  it("honours a debug pin and still reports p95 for the readout", () => {
    const budget = budgetFor("high");
    budget.pin = 1.5;
    expect([...frames(budget, 40, 20)]).toEqual([1.5]);
    expect(budget.p95(10)).toBe(40);
    expect(new RenderScaleBudget().p95(10)).toBeUndefined();
  });
  it("chooses the quality tier from renderer, precision and pointer", () => {
    expect(qualityTier("canvas", true, false)).toBe("low");
    expect(qualityTier("webgl", true, false)).toBe("high");
    expect(qualityTier("webgl", true, true)).toBe("medium");
    expect(qualityTier("webgl", false, false)).toBe("medium");
  });
  it("parses the backing pin and the frame-time readout from the URL", () => {
    expect(renderDebugOptions("?backing=2")).toEqual({
      backingPin: 2,
      frameTime: false,
    });
    expect(
      renderDebugOptions("?mode=campaign&backing=1.5&debug=frametime"),
    ).toEqual({
      backingPin: 1.5,
      frameTime: true,
    });
    expect(renderDebugOptions("?backing=3&debug=x,frametime")).toEqual({
      backingPin: undefined,
      frameTime: true,
    });
    expect(renderDebugOptions("")).toEqual({
      backingPin: undefined,
      frameTime: false,
    });
  });
});
