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
/**
 * Play `seconds` in the scene's frame order: scale() each update, hold(1)
 * when the backing changes (the resize branch), sample() at post-render.
 * Returns each backing change as [scene time, new scale].
 */
function play(
  budget: RenderScaleBudget,
  seconds: number,
  cost: (frame: {
    scale: number;
    t: number;
    raises: number;
    since: number;
  }) => number,
  dpr = 2,
) {
  const dt = 1 / 60,
    changes: [number, number][] = [];
  let backing = budget.scale(dpr, 2),
    raises = 0,
    raisedAt = 0;
  for (let n = 1; n <= Math.round(seconds / dt); n++) {
    const t = n * dt,
      scale = budget.scale(dpr, 2);
    if (scale !== backing) {
      changes.push([t, scale]);
      if (scale > backing) {
        raises++;
        raisedAt = t;
      }
      backing = scale;
      budget.hold(1);
    }
    budget.sample(cost({ scale, t, raises, since: t - raisedAt }), dt);
  }
  return changes;
}
/** Seconds from each step down to the raise after it. */
function waits(changes: [number, number][]) {
  return changes
    .map(([at, scale], i) =>
      i && scale > changes[i - 1]![1] ? at - changes[i - 1]![0] : undefined,
    )
    .filter((wait) => wait !== undefined)
    .map(Math.round);
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
    // A p95 of exactly 18 ms is not expensive.
    expect([...frames(budgetFor("low"), 18, 30)]).toEqual([2]);
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
    // Two seconds at 10 fps of 100 ms frames (one second of scene time, which
    // clamps each frame to 50 ms): few frames, but a slow stretch.
    for (let n = 0; n < 20; n++) budget.sample(100, 0.1);
    expect(budget.scale(2, 2)).toBe(1);
    frames(budget, 8, 9.5);
    expect(budget.scale(2, 2)).toBe(1);
    frames(budget, 8, 1.6);
    expect(budget.scale(2, 2)).toBe(1.5);
  });
  it("recovers on each second's p95, not on every frame or the mean", () => {
    // 64 frames of 1/64 s make an exact one-second slice; its p95 is the
    // 61st fastest frame, so three slow frames per second still count as
    // cheap and four do not. Every frame would reject three; the mean
    // (about 9.4 ms) would accept four.
    const secondsToRecover = (slowFramesPerSecond: number) => {
      const budget = budgetFor("low"),
        dt = 1 / 64;
      for (let n = 0; n < 7 * 64; n++) budget.sample(40, dt);
      expect(budget.scale(2, 2)).toBe(1);
      for (let n = 1; n <= 30 * 64; n++) {
        budget.sample(n % 64 < slowFramesPerSecond ? 30 : 8, dt);
        if (budget.scale(2, 2) > 1) return n * dt;
      }
      return undefined;
    };
    expect(secondsToRecover(3)).toBe(10);
    expect(secondsToRecover(4)).toBeUndefined();
  });
  it("does not recover while frames stay at or above 12 ms", () => {
    for (const milliseconds of [12, 14]) {
      const budget = budgetFor("low");
      frames(budget, 40, 7);
      frames(budget, milliseconds, 30);
      expect(budget.scale(2, 2)).toBe(1);
    }
  });
  it("backs off after a raise that is undone at once", () => {
    // Cheap at 1.5, expensive at 2: each failed raise doubles the wait, up
    // to 160 s, instead of flipping every 15 s.
    const changes = play(
      budgetFor("medium"),
      600,
      ({ scale }) => (scale === 2 ? 20 : 11),
      3,
    );
    expect(changes.length).toBe(13);
    // One second of resize hold, then 10, 20, 40, 80, 160 and 160 s.
    expect(waits(changes)).toEqual([11, 21, 41, 81, 161, 161]);
  });
  it("counts a raise undone by its first two windows as failed", () => {
    // After a raise: 1 s of resize hold, then windows end at 4, 7 and 10 s.
    // Expensive frames from 4.5 s fail the second window (doubled wait);
    // from 7.5 s they fail the third, which no longer counts.
    const after = (cheapFor: number) =>
      waits(
        play(
          budgetFor("medium"),
          60,
          ({ scale, raises, since }) =>
            scale !== 2 ? 11 : raises && since < cheapFor ? 11 : 20,
          3,
        ),
      );
    expect(after(4.5).slice(0, 2)).toEqual([11, 21]);
    expect(after(7.5).slice(0, 2)).toEqual([11, 11]);
  });
  it("resets a level's wait once a raise to it holds for 60 s", () => {
    // The first raise fails (the wait for 2 doubles to 20 s); the second
    // holds for `holds` seconds, then 2 turns expensive.
    const after = (holds: number) =>
      waits(
        play(
          budgetFor("medium"),
          160,
          ({ scale, raises, since }) =>
            scale !== 2 ? 11 : raises === 2 && since < holds ? 6 : 20,
          3,
        ),
      );
    expect(after(50).slice(0, 3)).toEqual([11, 21, 21]);
    expect(after(70).slice(0, 3)).toEqual([11, 21, 11]);
  });
  it("keeps a separate wait for each level", () => {
    // Low tier: cheap at 1 and 1.5, expensive at 2, so failed raises grow
    // the wait for 2 to 160 s. A burst drops 1.5 to 1; 1.5 still comes back
    // 10 s after the burst, and 2 still waits 160 s.
    const changes = play(budgetFor("low"), 800, ({ scale, t }) =>
      t >= 600 && t < 610 ? 30 : scale === 2 ? 20 : scale === 1.5 ? 11 : 9,
    ).filter(([at]) => at > 600);
    expect(changes.map(([, scale]) => scale).slice(0, 3)).toEqual([1, 1.5, 2]);
    expect(changes[1]![0]).toBeLessThan(622);
    expect(changes[2]![0] - changes[1]![0]).toBeGreaterThan(160);
  });
  it("counts a long frame as one scene-clock step", () => {
    // The scene clamps frame dt to 50 ms; so does the budget. Each case
    // starts the frame on fresh windows: a hold of exactly 64 × 1/64 s.
    const fresh = (budget: RenderScaleBudget) => {
      budget.hold(1);
      for (let n = 0; n < 64; n++) budget.sample(40, 1 / 64);
    };
    // One cheap frame that took 10 s of wall time is not 10 s of cheap frames.
    const phone = budgetFor("medium");
    frames(phone, 40, 7, { dpr: 3 });
    expect(phone.scale(3, 2)).toBe(1.5);
    fresh(phone);
    phone.sample(8, 10);
    expect(phone.scale(3, 2)).toBe(1.5);
    // Nor does one 3 s hitch fill a 3 s window on its own.
    const desk = budgetFor("medium");
    fresh(desk);
    desk.sample(3000, 3);
    expect(desk.scale(2, 2)).toBe(2);
    // Frames of 100 ms count 50 ms each: a 3 s window takes 60 of them.
    const slow = budgetFor("low");
    for (let n = 0; n < 58; n++) slow.sample(40, 0.1);
    expect(slow.scale(2, 2)).toBe(2);
    for (let n = 0; n < 4; n++) slow.sample(40, 0.1);
    expect(slow.scale(2, 2)).toBe(1.5);
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
  it("starts its windows again after a hold", () => {
    // Two seconds before a resize and one after are not one 3 s window.
    const budget = budgetFor("low");
    frames(budget, 40, 2);
    budget.hold(1);
    frames(budget, 40, 1);
    frames(budget, 40, 2.9);
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
    expect(budget.p95()).toBe(40);
    expect(new RenderScaleBudget().p95()).toBeUndefined();
  });
  it("reports p95 over the last 10 s, held frames included", () => {
    const budget = budgetFor("high");
    frames(budget, 40, 10);
    frames(budget, 5, 10);
    expect(budget.p95()).toBe(5);
    // The readout counts loading and resize frames that the policy skips.
    frames(budget, 40, 1, { hold: true });
    expect(budget.p95()).toBe(40);
    // Older frames age out.
    frames(budget, 5, 10);
    expect(budget.p95()).toBe(5);
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
