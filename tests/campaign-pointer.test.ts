import { describe, expect, it } from "vitest";
import { CampaignPointer } from "../src/campaign/pointer";

function pilot() {
  let time = 0;
  return {
    pointer: new CampaignPointer(() => time),
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}

describe("direct world piloting", () => {
  it("keeps a short stationary tap available for inspection without driving", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 100, 180);
    advance(100);
    expect(pointer.controls(100, 100)).toEqual({});
    expect(pointer.end(1)).toEqual({ x: 100, y: 180 });
    expect(pointer.controls(100, 100)).toEqual({});
  });

  it("turns a deliberate hold into downward drilling and consumes its tap", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 100, 180);
    advance(100);
    pointer.controls(100, 100);
    advance(80);
    expect(pointer.controls(100, 100)).toEqual({ down: true });
    expect(pointer.end(1)).toBeUndefined();
    expect(pointer.controls(100, 100)).toEqual({});
  });

  it("supports immediate drag steering and diagonal flight", () => {
    const { pointer } = pilot();
    pointer.begin(7, 100, 100);
    pointer.move(7, 20, 20);
    expect(pointer.controls(100, 100)).toEqual({ left: true, up: true });
    pointer.move(7, 180, 20);
    expect(pointer.controls(100, 100)).toEqual({ right: true, up: true });
    pointer.move(7, 180, 102);
    expect(pointer.controls(100, 100)).toEqual({ right: true });
  });

  it("gives the rig a neutral zone without cancelling the held gesture", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 110, 110);
    advance(200);
    expect(pointer.controls(100, 100)).toEqual({});
    pointer.move(1, 100, 180);
    expect(pointer.controls(100, 100)).toEqual({ down: true });
    pointer.move(1, 100, 100);
    expect(pointer.controls(100, 100)).toEqual({});
  });

  it("does not let a second pointer redirect or release the active finger", () => {
    const { pointer, advance } = pilot();
    expect(pointer.begin(1, 20, 100)).toBe(true);
    expect(pointer.begin(2, 180, 100)).toBe(false);
    pointer.move(2, 180, 20);
    expect(pointer.end(2)).toBeUndefined();
    advance(200);
    expect(pointer.controls(100, 100)).toEqual({ left: true });
    expect(pointer.end(1)).toBeUndefined();
    expect(pointer.controls(100, 100)).toEqual({});
  });

  it("requires a fresh press after cancellation rather than resuming a hold", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 100, 180);
    advance(200);
    expect(pointer.controls(100, 100)).toEqual({ down: true });
    pointer.clear();
    pointer.move(1, 100, 20);
    expect(pointer.controls(100, 100)).toEqual({});
    expect(pointer.end(1)).toBeUndefined();
    pointer.begin(2, 100, 20);
    advance(200);
    expect(pointer.controls(100, 100)).toEqual({ up: true });
  });

  it("activates at the same held duration on slow frames and never inspects a long press between frames", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 100, 180);
    advance(100);
    expect(pointer.controls(100, 100)).toEqual({});
    advance(100);
    expect(pointer.controls(100, 100)).toEqual({ down: true });
    pointer.end(1);

    pointer.begin(2, 100, 180);
    advance(250);
    expect(pointer.end(2)).toBeUndefined();
    expect(pointer.controls(100, 100)).toEqual({});
  });
});
