import { describe, expect, it } from "vitest";
import {
  BACKING_LEVELS,
  CAMERA_FOLLOW_OMEGA,
  CAMERA_ZOOM,
  CampaignView,
  DEEP_BLEND,
  RenderScaleBudget,
  SURFACE_BLEND,
  backoffLine,
  cameraZoomTarget,
  campaignCameraY,
  followSpring,
  harnessOptions,
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
  it("keeps surface composition stable above ground and blends into the shaft (F5)", () => {
    expect(SURFACE_BLEND).toEqual({ from: -0.4, to: 1.6 });
    expect(surfaceFraming(-4)).toBe(1);
    expect(surfaceFraming(-0.4)).toBe(1);
    expect(surfaceFraming(0.6)).toBe(0.5);
    expect(surfaceFraming(1.6)).toBe(0);
    expect(surfaceFraming(200)).toBe(0);
    // No step at the surface line: a smoothstep's slope is at most 1.5 / 2
    // per row over a 2-row blend.
    for (let y = -1; y < 2.2; y += 0.01)
      expect(
        Math.abs(surfaceFraming(y + 0.01) - surfaceFraming(y)),
      ).toBeLessThan(0.0076);
  });
});

describe("camera zoom and follow (F5)", () => {
  it("blends the zoom targets by depth instead of switching", () => {
    expect(cameraZoomTarget(-2)).toBe(CAMERA_ZOOM.surface);
    expect(cameraZoomTarget(SURFACE_BLEND.from)).toBe(CAMERA_ZOOM.surface);
    expect(cameraZoomTarget(SURFACE_BLEND.to)).toBe(CAMERA_ZOOM.shaft);
    expect(cameraZoomTarget(DEEP_BLEND.from)).toBe(CAMERA_ZOOM.shaft);
    expect(cameraZoomTarget(DEEP_BLEND.to)).toBe(CAMERA_ZOOM.deep);
    expect(cameraZoomTarget(55)).toBe(CAMERA_ZOOM.deep);
    // The former step at 120 m (a resting rig at renderY 11.64) is the
    // middle of the deep blend.
    expect(cameraZoomTarget(11.64)).toBeCloseTo(
      (CAMERA_ZOOM.shaft + CAMERA_ZOOM.deep) / 2,
      6,
    );
    let largest = 0;
    for (let y = -1; y < 15; y += 0.01)
      largest = Math.max(
        largest,
        Math.abs(cameraZoomTarget(y + 0.01) - cameraZoomTarget(y)),
      );
    expect(largest).toBeLessThan(0.001);
  });
  it("takes its zoom targets as parameters, for T11 under D1", () => {
    const zoom = {
      surface: 0.95,
      shaft: 1.25,
      deep: 1.4,
      dock: 0.9,
      inspection: 1.3,
    };
    expect(cameraZoomTarget(-1, zoom)).toBe(0.95);
    expect(cameraZoomTarget(5, zoom)).toBe(1.25);
    expect(cameraZoomTarget(20, zoom)).toBe(1.4);
  });
  it("follows with a critically damped spring of about 110 ms", () => {
    expect(1 / CAMERA_FOLLOW_OMEGA).toBeCloseTo(0.111, 3);
    // From rest, one time constant leaves (1 + 1)/e of the offset.
    expect(followSpring(1, 0, 0, 1 / CAMERA_FOLLOW_OMEGA).position).toBeCloseTo(
      2 / Math.E,
      9,
    );
    // It approaches without overshoot, whatever the frame length.
    for (const dt of [1 / 120, 1 / 60, 0.05]) {
      let state = { position: 100, velocity: 0 },
        previous = state.position;
      for (let t = 0; t < 2; t += dt) {
        state = followSpring(state.position, state.velocity, 0, dt);
        expect(state.position).toBeGreaterThanOrEqual(0);
        expect(state.position).toBeLessThanOrEqual(previous);
        previous = state.position;
      }
      expect(state.position).toBeLessThan(0.01);
    }
    // Exact for a held target: two half frames equal one whole frame.
    const half = followSpring(3, -2, 1, 0.025),
      twice = followSpring(half.position, half.velocity, 1, 0.025),
      once = followSpring(3, -2, 1, 0.05);
    expect(twice.position).toBeCloseTo(once.position, 12);
    expect(twice.velocity).toBeCloseTo(once.velocity, 12);
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
      testRaster: false,
      emissive: true,
    });
    expect(
      renderDebugOptions("?mode=campaign&backing=1.5&debug=frametime"),
    ).toEqual({
      backingPin: 1.5,
      frameTime: true,
      testRaster: false,
      emissive: true,
    });
    expect(renderDebugOptions("?backing=3&debug=x,frametime")).toEqual({
      backingPin: undefined,
      frameTime: true,
      testRaster: false,
      emissive: true,
    });
    expect(renderDebugOptions("")).toEqual({
      backingPin: undefined,
      frameTime: false,
      testRaster: false,
      emissive: true,
    });
  });
  it("parses the raster placeholder switch from the URL (T13a)", () => {
    expect(renderDebugOptions("?debug=test-raster").testRaster).toBe(true);
    expect(
      renderDebugOptions("?debug=frametime,test-raster&backing=2"),
    ).toEqual({
      backingPin: 2,
      frameTime: true,
      testRaster: true,
      emissive: true,
    });
    expect(renderDebugOptions("?debug=test-rasters").testRaster).toBe(false);
    expect(renderDebugOptions("?test-raster=1").testRaster).toBe(false);
  });
  it("parses the HUD-free switch from the URL (F3)", () => {
    expect(harnessOptions("?overlays=0")).toEqual({ overlays: false });
    expect(
      harnessOptions("?mode=campaign&backing=1&overlays=0&debug=frametime"),
    ).toEqual({ overlays: false });
    for (const search of ["", "?overlays=1", "?overlays=", "?overlays=off"])
      expect(harnessOptions(search)).toEqual({ overlays: true });
  });
  it("parses the Scan switch from the URL (T8)", () => {
    expect(harnessOptions("?scan=1").scan).toBe(true);
    expect(harnessOptions("?mode=campaign&scan=0").scan).toBe(false);
    for (const search of ["", "?scan=", "?scan=on", "?scan=true"])
      expect(harnessOptions(search).scan).toBeUndefined();
  });
  it("reports its state for the readout's back-off line (F3)", () => {
    const desktop = budgetFor("high");
    frames(desktop, 5, 2);
    expect(desktop.state()).toMatchObject({
      pinned: false,
      level: 2,
      floor: 2,
      cap: 2,
      next: undefined,
      wait: undefined,
      backoff: [],
      raised: undefined,
    });
    expect(backoffLine(desktop.state())).toBe("at ceiling");

    const phone = budgetFor("medium");
    frames(phone, 40, 4, { dpr: 3 });
    expect(phone.state()).toMatchObject({ level: 1.5, next: 2, wait: 10 });
    frames(phone, 5, 4.5, { dpr: 3 });
    expect(Math.floor(phone.state().cheapSeconds)).toBe(4);
    expect(backoffLine(phone.state())).toBe("next 2× after 4/10 s");

    phone.hold(1);
    expect(phone.state().held).toBe(1);
    expect(backoffLine(phone.state())).toBe("held 1.0 s");

    phone.pin = 1;
    // A pin replaces the policy: the pinned scale, no floor or ceiling.
    expect(phone.state()).toMatchObject({
      pinned: true,
      level: 1,
      floor: undefined,
      cap: undefined,
      next: undefined,
      wait: undefined,
    });
    expect(backoffLine(phone.state())).toBe("policy off (pinned)");
  });
  it("never counts a reset below 0 while a hold delays it (F3)", () => {
    const budget = budgetFor("medium");
    play(budget, 20, ({ scale }) => (scale === 2 ? 20 : 11), 3);
    for (let n = 0; n < 40 && !budget.state().raised; n++)
      play(budget, 1, () => 6, 3);
    // A long hold (a slow world load) runs past the 60 s mark: the reset
    // waits for the first measured frame.
    budget.hold(70);
    frames(budget, 6, 65, { dpr: 3 });
    expect(budget.state().raised!.age).toBeGreaterThan(60);
    expect(backoffLine(budget.state())).toBe(
      "held 5.0 s · back-off 2× 20 s (resets in 0 s)",
    );
  });
  it("shows a failed raise's doubled wait and a raise on probation (F3)", () => {
    const budget = budgetFor("medium");
    // Cheap at 1.5, expensive at 2 (as above): the first raise fails.
    play(budget, 20, ({ scale }) => (scale === 2 ? 20 : 11), 3);
    expect(budget.state().backoff).toEqual([{ level: 2, wait: 20 }]);
    expect(backoffLine(budget.state())).toMatch(/· back-off 2× 20 s$/);
    // Cheap everywhere: after 20 s the next raise comes, on probation, and
    // holding 60 s clears the doubled wait.
    for (let n = 0; n < 40 && !budget.state().raised; n++)
      play(budget, 1, () => 6, 3);
    play(budget, 2, () => 6, 3);
    expect(backoffLine(budget.state())).toMatch(
      /^at ceiling · probation 2× 2\/8 s · back-off 2× 20 s \(resets in 5[78] s\)$/,
    );
    play(budget, 7, () => 6, 3);
    expect(backoffLine(budget.state())).toMatch(
      /^at ceiling · back-off 2× 20 s \(resets in 5[01] s\)$/,
    );
    play(budget, 52, () => 6, 3);
    expect(budget.state()).toMatchObject({ backoff: [], raised: undefined });
    expect(backoffLine(budget.state())).toBe("at ceiling");

    const raised = budgetFor("medium");
    play(raised, 4, () => 40, 3);
    play(raised, 13, () => 6, 3);
    expect(raised.state().raised).toMatchObject({ to: 2 });
    expect(raised.state().raised!.age).toBeGreaterThan(0);
    expect(raised.state().raised!.age).toBeLessThan(3);
    expect(backoffLine(raised.state())).toMatch(
      /^(held \d\.\d s|at ceiling) · probation 2× [0-2]\/8 s$/,
    );
  });
});
