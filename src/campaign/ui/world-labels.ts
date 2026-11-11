/**
 * The camera's safe area: the HUD bands at the top and bottom of the screen.
 * The HOME and target beacons that lived here are annotations since T8
 * (render/annotations.ts, placed by the scene with every other label).
 */
let measuredAt = -Infinity;
let measuredWidth = 0,
  measuredHeight = 0;
let measuredSafe = { top: 0, bottom: 48, left: 0, right: 0 };
export function cameraSafeArea() {
  const width = innerWidth,
    height = innerHeight;
  if (
    width === measuredWidth &&
    height === measuredHeight &&
    performance.now() - measuredAt < 150
  )
    return measuredSafe;
  measuredAt = performance.now();
  measuredWidth = width;
  measuredHeight = height;
  const topBoxes = Array.from(
    document.querySelectorAll<HTMLElement>(".campaign-hud,.campaign-objective"),
  );
  const top = Math.max(
    0,
    ...topBoxes
      .filter((node) => !node.hidden)
      .map((node) => node.getBoundingClientRect().bottom),
  );
  const toolbar = document
    .querySelector<HTMLElement>(".campaign-toolbar")!
    .getBoundingClientRect();
  measuredSafe = {
    top: Math.min(height * 0.36, top + 8),
    bottom: Math.max(48, height - toolbar.top + 8),
    left: width < 600 ? 8 : 0,
    right: width < 600 ? 8 : 0,
  };
  return measuredSafe;
}
