import { describe, expect, it } from "vitest";
import { CampaignPointer, TOUCH_JOYSTICK } from "../src/campaign/pointer";

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

describe("floating touch joystick", () => {
  it("appears at fingerdown and leaves a short tap available for inspection", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 240, 520, "touch");
    expect(pointer.joystick).toEqual({
      centerX: 240,
      centerY: 520,
      knobX: 240,
      knobY: 520,
    });
    advance(100);
    expect(pointer.controls(50, 20)).toEqual({});
    expect(pointer.end(1)).toEqual({ x: 240, y: 520 });
    expect(pointer.joystick).toBeUndefined();
  });

  it("keeps a stationary hold neutral while the rig and camera move", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 100, 400, "touch");
    advance(250);
    expect(pointer.controls(300, 80)).toEqual({});
    expect(pointer.controls(0, 900)).toEqual({});
    expect(pointer.joystick?.centerX).toBe(100);
    expect(pointer.joystick?.centerY).toBe(400);
    expect(pointer.end(1)).toBeUndefined();
  });

  it("drives and flies diagonally relative to its gesture center", () => {
    const { pointer } = pilot();
    pointer.begin(1, 200, 300, "touch");
    pointer.move(1, 235, 300);
    expect(pointer.controls(800, 900)).toEqual({ right: true });
    pointer.move(1, 170, 270);
    expect(pointer.controls(800, 900)).toEqual({ left: true, up: true });
    expect(pointer.controls(-200, -400)).toEqual({ left: true, up: true });
    pointer.move(1, 200, 340);
    expect(pointer.controls(100, 500)).toEqual({ down: true });
  });

  it("has a circular dead zone and becomes neutral again at its center", () => {
    const { pointer, advance } = pilot();
    pointer.begin(1, 100, 200, "touch");
    pointer.move(1, 108, 208);
    advance(250);
    expect(pointer.controls(800, 400)).toEqual({});
    pointer.move(1, 110, 210);
    expect(pointer.controls(800, 400)).toEqual({ right: true, down: true });
    pointer.move(1, 100, 200);
    expect(pointer.controls(0, 0)).toEqual({});
    expect(pointer.current?.active).toBe(true);
    expect(pointer.end(1)).toBeUndefined();
  });

  it("bounds the visible knob without moving the center or losing direction", () => {
    const { pointer } = pilot();
    pointer.begin(1, 100, 200, "touch");
    pointer.move(1, 400, 600);
    const stick = pointer.joystick!;
    expect(stick.centerX).toBe(100);
    expect(stick.centerY).toBe(200);
    expect(Math.hypot(stick.knobX - 100, stick.knobY - 200)).toBeCloseTo(
      TOUCH_JOYSTICK.travel,
    );
    expect(pointer.controls(400, 600)).toEqual({ right: true, down: true });
    pointer.end(1);
    pointer.begin(2, 300, 500, "touch");
    expect(pointer.joystick).toEqual({
      centerX: 300,
      centerY: 500,
      knobX: 300,
      knobY: 500,
    });
    expect(pointer.controls(0, 0)).toEqual({});
  });

  it("keeps another finger independent and requires a fresh center after cancellation", () => {
    const { pointer } = pilot();
    pointer.begin(1, 100, 200, "touch");
    pointer.move(1, 100, 160);
    expect(pointer.begin(2, 300, 500, "touch")).toBe(false);
    pointer.move(2, 340, 500);
    pointer.end(2);
    expect(pointer.controls(0, 0)).toEqual({ up: true });
    pointer.clear();
    pointer.move(1, 100, 250);
    expect(pointer.joystick).toBeUndefined();
    expect(pointer.controls(0, 0)).toEqual({});
    pointer.begin(3, 240, 500, "touch");
    expect(pointer.joystick?.centerX).toBe(240);
    expect(pointer.joystick?.centerY).toBe(500);
    pointer.move(3, 200, 500);
    expect(pointer.controls(0, 0)).toEqual({ left: true });
  });
});
