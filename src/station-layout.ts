import type { ServiceAction, StationId } from "./model";

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const ACTIONS: Record<StationId, readonly ServiceAction[]> = {
  exchange: ["sell"],
  fuel: ["refuel"],
  repair: ["repair"],
  upgrades: ["drill", "tank", "cargo", "hull", "engine"],
};
export const stationActions = (station: StationId) => ACTIONS[station];
export const insideRect = (point: { x: number; y: number }, rect: CanvasRect) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;
export function nearbyPromptRect(width: number, height: number): CanvasRect {
  const w = Math.min(340, width - 16);
  return { x: (width - w) / 2, y: height - 50, width: w, height: 42 };
}

/** Pure shared layout keeps canvas hit targets deterministic across resizing. */
export function stationLayout(
  width: number,
  height: number,
  station: StationId,
  selectedIndex = 0,
) {
  const fullHeight = station === "upgrades" ? 480 : 330;
  const compact = height < fullHeight + 24 || width < 520;
  const inline = compact && height < 190;
  const panelWidth = Math.min(720, width - (compact ? 8 : 24));
  const panelHeight = Math.min(
    height - (compact ? 8 : 24),
    compact ? 250 : fullHeight,
  );
  const panel = {
    x: (width - panelWidth) / 2,
    y: (height - panelHeight) / 2,
    width: panelWidth,
    height: panelHeight,
  };
  const close = {
    x: panel.x + panel.width - 48,
    y: panel.y + 4,
    width: 44,
    height: 40,
  };
  const all = stationActions(station);
  const selected = Math.max(0, Math.min(all.length - 1, selectedIndex));
  const cards = compact
    ? (() => {
        const rect = {
          x: panel.x + 10,
          y: panel.y + 46,
          width: panel.width - 20,
          height: Math.max(44, panel.height - 82),
        };
        const buttonWidth = Math.min(140, Math.max(96, rect.width * 0.26));
        return [
          {
            action: all[selected],
            index: selected,
            rect,
            buy: {
              x: inline ? rect.x + rect.width - buttonWidth - 8 : rect.x + 8,
              y: inline
                ? rect.y + (rect.height - 44) / 2
                : rect.y + rect.height - 48,
              width: inline ? buttonWidth : rect.width - 16,
              height: 44,
            },
          },
        ];
      })()
    : all.map((action, index) => {
        const rowHeight = station === "upgrades" ? 58 : panel.height - 142;
        const rect = {
          x: panel.x + 18,
          y: panel.y + 74 + index * (rowHeight + 6),
          width: panel.width - 36,
          height: rowHeight,
        };
        const buy = {
          x: rect.x + rect.width - 150,
          y: rect.y + (rect.height - 44) / 2,
          width: 140,
          height: 44,
        };
        return { action, index, rect, buy };
      });
  const firstCard = cards[0].rect;
  const previous =
    compact && all.length > 1 && (!inline || panel.width >= 360)
      ? {
          x: firstCard.x + 2,
          y: inline
            ? firstCard.y + (firstCard.height - 40) / 2
            : firstCard.y + 1,
          width: 40,
          height: 40,
        }
      : undefined;
  const next =
    compact && all.length > 1
      ? {
          x: inline
            ? firstCard.x + (previous ? 44 : 2)
            : firstCard.x + firstCard.width - 42,
          y: inline
            ? firstCard.y + (firstCard.height - 40) / 2
            : firstCard.y + 1,
          width: 40,
          height: 40,
        }
      : undefined;
  return {
    panel,
    close,
    compact,
    inline,
    cards,
    actions: cards.map((card) => ({ action: card.action, rect: card.buy })),
    previous,
    next,
  };
}
