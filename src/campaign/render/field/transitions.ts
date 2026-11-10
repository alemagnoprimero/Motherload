import { FIELD_SLOTS } from "./field-data";

/**
 * T2 motion (audit §9.3): a revealed cell cross-fades from the unknown look
 * over 250 ms and a dug cell eases out over 120 ms, both on the scene clock
 * (§5.1 principle 6): the clock's seconds are handed in, so the transitions
 * freeze with it, and with the clock frozen or reduced motion on, no
 * transition starts and cells change at once.
 *
 * A cell names its transition by a slot in its A byte (field-data.ts); the
 * shader reads each slot's progress from a uniform, so a transition costs no
 * upload while it runs. Cells that change within 1/30 s share a slot. When a
 * slot ends its cells are rewritten to slot 0 (FieldData.settle), and the
 * slot is free again once that rewrite has been uploaded.
 */
export const REVEAL_SECONDS = 0.25;
export const DIG_SECONDS = 0.12;
const JOIN_SECONDS = 1 / 30;

export type TransitionKind = "reveal" | "dig";

interface Slot {
  kind: TransitionKind;
  start: number;
  /** running: animating; settling: over, its cells' rewrite not yet uploaded. */
  state: "free" | "running" | "settling";
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class FieldTransitions {
  private slots: Slot[] = Array.from({ length: FIELD_SLOTS + 1 }, () => ({
    kind: "reveal" as TransitionKind,
    start: 0,
    state: "free" as Slot["state"],
  }));
  /** Slots that are running (the shader needs their progress each frame). */
  running = 0;

  /** Every slot free: a new world or an import. */
  reset() {
    for (const slot of this.slots) slot.state = "free";
    this.running = 0;
  }

  /**
   * The slot for cells of `kind` that change at scene time `now`: the slot
   * of that kind opened less than 1/30 s ago, else a free one, else the
   * newest running slot of that kind (those cells start part-way), else 0
   * (they change at once).
   */
  open(kind: TransitionKind, now: number) {
    let free = 0,
      newest = 0;
    for (let s = 1; s <= FIELD_SLOTS; s++) {
      const slot = this.slots[s]!;
      if (slot.state === "free") free ||= s;
      else if (slot.state === "running" && slot.kind === kind) {
        if (now - slot.start < JOIN_SECONDS && now >= slot.start) return s;
        if (!newest || slot.start > this.slots[newest]!.start) newest = s;
      }
    }
    if (!free) return newest;
    this.slots[free] = { kind, start: now, state: "running" };
    this.running++;
    return free;
  }

  /** Slots whose transition is over at `now`: settle their cells. */
  finished(now: number) {
    const done: number[] = [];
    for (let s = 1; s <= FIELD_SLOTS; s++) {
      const slot = this.slots[s]!;
      if (slot.state !== "running") continue;
      const seconds = slot.kind === "dig" ? DIG_SECONDS : REVEAL_SECONDS;
      // A clock set back (a frozen clock reset to 0) ends the transition.
      if (now - slot.start >= seconds - 1e-9 || now < slot.start) {
        slot.state = "settling";
        this.running--;
        done.push(s);
      }
    }
    return done;
  }

  /** The settled cells' rewrite is on the GPU: settling slots are free. */
  release() {
    for (const slot of this.slots)
      if (slot.state === "settling") slot.state = "free";
  }

  /**
   * The 16 slot uniforms at `now`: eased progress in [0, 1], plus 2 for a
   * dig slot. Slot 0 and every slot that is not running read 1 (settled).
   */
  values(now: number, out: Float32Array) {
    out[0] = 1;
    for (let s = 1; s <= FIELD_SLOTS; s++) {
      const slot = this.slots[s]!;
      if (slot.state !== "running") {
        out[s] = 1;
        continue;
      }
      const dig = slot.kind === "dig";
      const t = Math.max(
        0,
        Math.min(1, (now - slot.start) / (dig ? DIG_SECONDS : REVEAL_SECONDS)),
      );
      // The dig eases out; the reveal is a smooth cross-fade.
      out[s] = dig ? 2 + (1 - (1 - t) * (1 - t)) : smooth(t);
    }
    return out;
  }
}
