import { describe, expect, it } from "vitest";
import {
  reviewFrameKnown,
  type DressingReviewFrame,
  type DressingReviewView,
} from "../src/campaign/render/dressing-review";

const frame: DressingReviewFrame = {
  frame: "cave-boulder-0",
  world: "W01",
  x: 3.5,
  y: 4.5,
  width: 1,
  height: 1,
};
const view: DressingReviewView = {
  id: "W01",
  width: 40,
  rows: 60,
  known: () => true,
  deposit: () => false,
};

describe("dressing art fixture information boundary", () => {
  it("rejects padding that touches an unknown neighbour, even when the centre is known", () => {
    expect(reviewFrameKnown(frame, { ...view, known: (x) => x !== 2 }, 0)).toBe(
      true,
    );
    expect(
      reviewFrameKnown(frame, { ...view, known: (x) => x !== 2 }, 0.02),
    ).toBe(false);
  });
  it("wraps footprints at the world seam and refuses above-ground or other-world poses", () => {
    const calls: number[] = [];
    expect(
      reviewFrameKnown(
        { ...frame, x: 0.2 },
        {
          ...view,
          known: (x) => {
            calls.push(x);
            return true;
          },
        },
        0.02,
      ),
    ).toBe(true);
    expect(calls).toContain(39);
    expect(calls.every((x) => x >= 0 && x < 40)).toBe(true);
    expect(reviewFrameKnown({ ...frame, y: 0 }, view, 0.02)).toBe(false);
    expect(reviewFrameKnown({ ...frame, world: "W02" }, view, 0.02)).toBe(
      false,
    );
  });
  it("excludes crystals within a 3×3 neighbourhood of each occupied cell's known deposit", () => {
    const occupied = {
      ...view,
      deposit: (x: number, y: number) => x === 4 && y === 5,
    };
    expect(
      reviewFrameKnown(
        { ...frame, frame: "cave-crystal-floor-0" },
        occupied,
        0,
      ),
    ).toBe(false);
    expect(reviewFrameKnown(frame, occupied, 0)).toBe(true);
  });
  it("accepts only bounded cave art poses", () => {
    for (const patch of [
      { frame: "site-wreck" },
      { x: NaN },
      { width: -1 },
      { height: 50 },
    ])
      expect(reviewFrameKnown({ ...frame, ...patch }, view, 0)).toBe(false);
  });
});
