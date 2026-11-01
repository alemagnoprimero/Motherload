import type { CampaignControls } from "./types";

interface Gesture {
  id: number;
  kind: "mouse" | "touch";
  x: number;
  y: number;
  originX: number;
  originY: number;
  startedAt: number;
  active: boolean;
}

export const TOUCH_JOYSTICK = {
  radius: 46,
  knobRadius: 14,
  travel: 32,
  deadZone: 12,
} as const;

/** Taps inspect, mouse holds aim from the rig, and touch drags use their own center. */
export class CampaignPointer {
  private gesture?: Gesture;

  constructor(private now: () => number = () => performance.now()) {}

  get current() {
    return this.gesture;
  }

  get joystick() {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== "touch") return undefined;
    const dx = gesture.x - gesture.originX,
      dy = gesture.y - gesture.originY,
      distance = Math.hypot(dx, dy),
      scale = distance ? Math.min(1, TOUCH_JOYSTICK.travel / distance) : 0;
    return {
      centerX: gesture.originX,
      centerY: gesture.originY,
      knobX: gesture.originX + dx * scale,
      knobY: gesture.originY + dy * scale,
    };
  }

  begin(id: number, x: number, y: number, kind: "mouse" | "touch" = "mouse") {
    if (this.gesture) return false;
    this.gesture = {
      id,
      kind,
      x,
      y,
      originX: x,
      originY: y,
      startedAt: this.now(),
      active: false,
    };
    return true;
  }

  move(id: number, x: number, y: number) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return;
    gesture.x = x;
    gesture.y = y;
    const slop = gesture.kind === "touch" ? TOUCH_JOYSTICK.deadZone : 8;
    if (Math.hypot(x - gesture.originX, y - gesture.originY) > slop)
      gesture.active = true;
  }

  end(id: number) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return undefined;
    gesture.active ||= this.now() - gesture.startedAt >= 180;
    this.gesture = undefined;
    return gesture.active ? undefined : { x: gesture.x, y: gesture.y };
  }

  clear() {
    this.gesture = undefined;
  }

  controls(rigX: number, rigY: number): CampaignControls {
    const gesture = this.gesture;
    if (!gesture) return {};
    gesture.active ||= this.now() - gesture.startedAt >= 180;
    if (!gesture.active) return {};
    const touch = gesture.kind === "touch";
    const dx = gesture.x - (touch ? gesture.originX : rigX),
      dy = gesture.y - (touch ? gesture.originY : rigY),
      distance = Math.hypot(dx, dy),
      threshold = touch ? distance * 0.38 : Math.max(20, distance * 0.38);
    if (touch && distance <= TOUCH_JOYSTICK.deadZone) return {};
    return {
      ...(dx < -threshold ? { left: true } : {}),
      ...(dx > threshold ? { right: true } : {}),
      ...(dy < -threshold ? { up: true } : {}),
      ...(dy > threshold ? { down: true } : {}),
    };
  }
}
