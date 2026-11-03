import { describe, expect, it } from "vitest";
import { NoticeQueue } from "../src/campaign/notices";
import { coachStep, type CoachContext } from "../src/campaign/onboarding";

describe("notice priorities and readable duration", () => {
  it("preserves a full-hold notice across a hazard instead of suppressing either", () => {
    const queue = new NoticeQueue();
    queue.push("Hold full · 7/7", 2, 0);
    expect(queue.current(0)?.text).toContain("Hold full");
    queue.setCondition("energy", "Energy critical");
    queue.push("Cold pocket · move clear", 1, 1000);
    expect(queue.current(1000)?.text).toContain("Cold pocket");
    expect(queue.critical).toBe("Energy critical");
    expect(queue.current(2999)?.text).toContain("Cold pocket");
    expect(queue.current(3000)?.text).toContain("Hold full");
    expect(queue.current(4499)?.text).toContain("Hold full");
    expect(queue.current(4500)).toBeUndefined();
  });
  it("deduplicates announcements and drops stale informational messages", () => {
    const queue = new NoticeQueue();
    queue.push("Lander restored", 2, 0);
    queue.push("Lander restored", 2, 10);
    queue.push("Welcome back", 3, 0);
    expect(queue.recent).toHaveLength(2);
    expect(queue.current(6000)?.text).toBe("Lander restored");
    expect(queue.current(8500)).toBeUndefined();
  });
  it("clears critical conditions independently of the recent list", () => {
    const queue = new NoticeQueue();
    queue.setCondition("hull", "Critical hull");
    queue.push("Ore banked", 2, 0);
    queue.setCondition("hull");
    expect(queue.critical).toBe("");
    expect(queue.current(0)?.text).toBe("Ore banked");
  });
  it("holds protected announcements while extraction owns the advisory slot", () => {
    const queue = new NoticeQueue();
    queue.push("Hold full · 7/7", 2, 0);
    expect(queue.current(0)?.text).toContain("Hold full");
    expect(queue.current(500, 0)).toBeUndefined();
    queue.push("Collected slag iron", 3, 600);
    expect(queue.current(6000, 0)).toBeUndefined();
    expect(queue.current(6000)?.text).toContain("Hold full");
    expect(queue.current(7999)?.text).toContain("Hold full");
    expect(queue.current(8000)).toBeUndefined();
  });
});

const opening: CoachContext = {
  mined: 0,
  cargo: 0,
  atDock: false,
  banked: 0,
  credits: 200,
  milestone: 0,
  energyRatio: 1,
  upgraded: false,
  row: -0.4,
  beacon: false,
};
describe("ordered first-expedition guide", () => {
  it("does not send a full hold home before the survey beacon", () => {
    const full = { ...opening, mined: 7, cargo: 7, row: 6.5 };
    expect(coachStep(full, 1).next).toBe(2);
    expect(coachStep(full, 2).text).toContain("Survey");
    expect(coachStep({ ...full, row: -0.4 }, 2).next).toBe(2);
    expect(coachStep({ ...full, beacon: true, row: -0.4 }, 2).next).toBe(3);
  });
  it("waits for actual banking, construction and the useful tank purchase", () => {
    expect(coachStep({ ...opening, atDock: true, cargo: 7 }, 4).next).toBe(4);
    expect(coachStep({ ...opening, atDock: true, banked: 7 }, 4).next).toBe(5);
    expect(coachStep({ ...opening, atDock: true, banked: 7 }, 5).next).toBe(5);
    expect(coachStep({ ...opening, atDock: true, milestone: 1 }, 5).next).toBe(
      6,
    );
    expect(
      coachStep({ ...opening, atDock: true, credits: 6300 }, 10).next,
    ).toBe(10);
    expect(
      coachStep({ ...opening, atDock: true, upgraded: true }, 10).next,
    ).toBe(11);
  });
  it("resumes exactly the persisted cursor without revisiting earlier completed steps", () => {
    const restored = {
      ...opening,
      beacon: true,
      milestone: 1,
      mined: 16,
      row: 2,
    };
    expect(coachStep(restored, 8).text).toBe("Fill your hold again.");
    expect(coachStep({ ...restored, upgraded: true }, 12).complete).toBe(true);
  });
});
