/** A7/A8 art fixtures only. Shipping placement is T5, not this review hook. */
export interface DressingReviewFrame {
  frame: string;
  world: string;
  /** Centre and full source size in world tiles, including transparent padding. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DressingReviewView {
  id: string;
  width: number;
  rows: number;
  known(x: number, y: number): boolean;
  /** Must contain known deposits only. */
  deposit(x: number, y: number): boolean;
}

/** Full source bounds plus a filtering gutter must stay in discovered cells. */
export function reviewFrameKnown(
  frame: DressingReviewFrame,
  view: DressingReviewView,
  gutter: number,
) {
  if (
    frame.world !== view.id ||
    !/^cave-(stalactite|rust-drip|rust-particle|rubble|boulder|crystal|backwall)-[a-z0-9-]+$/.test(
      frame.frame,
    ) ||
    ![frame.x, frame.y, frame.width, frame.height, gutter].every(
      Number.isFinite,
    ) ||
    frame.width <= 0 ||
    frame.width > 11 ||
    frame.height <= 0 ||
    frame.height > 4 ||
    gutter < 0
  )
    return false;
  const wrap = (x: number) => ((x % view.width) + view.width) % view.width;
  const left = Math.floor(frame.x - frame.width / 2 - gutter);
  const right = Math.ceil(frame.x + frame.width / 2 + gutter) - 1;
  const top = Math.floor(frame.y - frame.height / 2 - gutter);
  const bottom = Math.ceil(frame.y + frame.height / 2 + gutter) - 1;
  for (let y = top; y <= bottom; y++) {
    if (y < 0 || y >= view.rows) return false;
    for (let x = left; x <= right; x++) {
      if (!view.known(wrap(x), y)) return false;
      if (frame.frame.startsWith("cave-crystal-"))
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (view.deposit(wrap(x + dx), y + dy)) return false;
    }
  }
  return true;
}
