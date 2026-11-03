import type { Campaign } from "../model";
import type { CampaignView } from "../view";
import { campaignSignal } from "../poi";
const wrap = (delta: number, width: number) =>
  ((((delta + width / 2) % width) + width) % width) - width / 2;
let lastLabelAt = -Infinity;
/** DOM labels use the scene's CSS View, never backing-canvas pixels. */
export function updateWorldLabels(
  view: CampaignView,
  campaign: Campaign,
  hidden: boolean,
) {
  const layer = document.getElementById("campaign-world-labels")!;
  layer.hidden = hidden;
  if (hidden) return;
  if (performance.now() - lastLabelAt < 60) return;
  lastLabelAt = performance.now();
  const rig = campaign.state.vehicle;
  const rigX = view.nearestWorldX(rig.x, campaign.world.width);
  const home = document.getElementById("campaign-home-beacon")!;
  const bayX = campaign.activeWorldDefinition.dockX;
  const homeDelta = wrap(bayX - rig.x, campaign.world.width);
  const homeX = rigX + homeDelta;
  place(
    home,
    view,
    homeX,
    -1,
    `HOME · ${Math.round(Math.hypot(homeDelta, -1 - rig.y) * 10)} m`,
  );
  home.hidden = campaign.atDock;
  const target = document.getElementById("campaign-target-beacon")!;
  const signal = campaignSignal(campaign);
  target.hidden = !signal || signal.returning;
  if (signal && !signal.returning)
    place(
      target,
      view,
      rigX + signal.dx,
      rig.y + signal.dy,
      `${signal.name} · ${signal.distanceMeters} m`,
    );
  const cue = document.getElementById("campaign-rig-cue")!;
  const point = view.clamp(view.worldToScreen(rigX, rig.y - 1.1), 12);
  cue.style.left = point.x + "px";
  cue.style.top = point.y + "px";
}
function place(
  element: HTMLElement,
  view: CampaignView,
  x: number,
  y: number,
  text: string,
) {
  if (element.dataset.label !== text) {
    element.dataset.label = text;
    element.textContent = "↑ " + text;
  }
  const point = view.worldToScreen(x, y),
    safe = view.clamp(point, 24);
  // Account for the label itself, not only its anchor.
  const half = Math.max(65, element.offsetWidth / 2);
  let px = Math.max(half + 8, Math.min(view.width - half - 8, safe.x));
  const halfHeight = Math.max(15, element.offsetHeight / 2);
  let py = safe.y;
  const obstacles = Array.from(
    document.querySelectorAll<HTMLElement>(
      "#campaign-coach,#campaign-message.visible,#campaign-danger,#campaign-extraction,#campaign-dock-toggle,#campaign-return",
    ),
  )
    .filter(
      (node) =>
        !node.hidden &&
        node.getClientRects().length &&
        getComputedStyle(node).visibility !== "hidden" &&
        getComputedStyle(node).display !== "none",
    )
    .map((node) => node.getBoundingClientRect())
    .sort((a, b) => {
      const upperA = a.top < view.height / 2,
        upperB = b.top < view.height / 2;
      if (upperA !== upperB) return upperA ? -1 : 1;
      return upperA ? a.top - b.top : b.top - a.top;
    });
  for (const rect of obstacles)
    if (
      px + half + 6 > rect.left &&
      px - half - 6 < rect.right &&
      py + halfHeight + 6 > rect.top &&
      py - halfHeight - 6 < rect.bottom
    )
      py =
        rect.top < view.height / 2
          ? Math.min(
              view.height - view.safe.bottom - halfHeight - 8,
              rect.bottom + halfHeight + 8,
            )
          : Math.max(view.safe.top + halfHeight + 8, rect.top - halfHeight - 8);
  if (element.id === "campaign-target-beacon") {
    const home = document.getElementById("campaign-home-beacon")!;
    if (!home.hidden) {
      const rect = home.getBoundingClientRect();
      if (
        px + half + 6 > rect.left &&
        px - half - 6 < rect.right &&
        py + halfHeight + 6 > rect.top &&
        py - halfHeight - 6 < rect.bottom
      ) {
        const right = rect.right + half + 8,
          left = rect.left - half - 8;
        if (right + half < view.width - 8) px = right;
        else if (left - half > 8) px = left;
        else
          py = Math.min(
            view.height - view.safe.bottom - halfHeight - 8,
            rect.bottom + halfHeight + 8,
          );
      }
    }
  }
  element.style.left = px + "px";
  element.style.top = py + "px";
  element.dataset.clamped = String(
    Math.abs(point.x - px) > 1 || Math.abs(point.y - py) > 1,
  );
  const label = (point.y < py - 5 ? "↑ " : point.y > py + 5 ? "↓ " : "") + text;
  if (element.textContent !== label) element.textContent = label;
}
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
