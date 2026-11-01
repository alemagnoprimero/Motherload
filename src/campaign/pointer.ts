import type { CampaignControls } from "./types";

interface Gesture {
  id: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  startedAt: number;
  active: boolean;
}

/** A short tap inspects; a deliberate hold or drag directly pilots the rig. */
export class CampaignPointer {
  private gesture?: Gesture;

  constructor(private now: () => number = () => performance.now()) {}

  get current() {
    return this.gesture;
  }

  begin(id: number, x: number, y: number) {
    if (this.gesture) return false;
    this.gesture = {
      id,
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
    if (Math.hypot(x - gesture.originX, y - gesture.originY) > 8)
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
    const dx = gesture.x - rigX,
      dy = gesture.y - rigY,
      distance = Math.hypot(dx, dy),
      threshold = Math.max(20, distance * 0.38);
    return {
      ...(dx < -threshold ? { left: true } : {}),
      ...(dx > threshold ? { right: true } : {}),
      ...(dy < -threshold ? { up: true } : {}),
      ...(dy > threshold ? { down: true } : {}),
    };
  }
}
