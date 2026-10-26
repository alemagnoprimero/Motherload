import { describe, expect, it } from "vitest";
import { STATIONS } from "../src/model";
import { stationActions, stationLayout } from "../src/station-layout";

describe("station touch targets", () => {
  it.each([
    { width: 280, height: 133 },
    { width: 320, height: 133 },
    { width: 568, height: 133 },
    { width: 568, height: 183 },
    { width: 851, height: 203 },
    { width: 393, height: 640 },
    { width: 520, height: 420 },
    { width: 900, height: 440 },
    { width: 1248, height: 560 },
  ])(
    "keeps every action distinct and reachable at $width×$height",
    ({ width, height }) => {
      for (const station of STATIONS) {
        for (
          let selected = 0;
          selected < stationActions(station.id).length;
          selected++
        ) {
          const layout = stationLayout(width, height, station.id, selected);
          const targets = [
            layout.close,
            ...layout.actions.map((action) => action.rect),
            ...(layout.previous ? [layout.previous] : []),
            ...(layout.next ? [layout.next] : []),
          ];
          for (const rect of targets) {
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.x + rect.width).toBeLessThanOrEqual(width);
            expect(rect.y + rect.height).toBeLessThanOrEqual(height);
            expect(rect.width).toBeGreaterThanOrEqual(40);
            expect(rect.height).toBeGreaterThanOrEqual(40);
          }
          // A navigation tap must never share a purchase hitbox, including while
          // a phone's canvas is resizing after its driving controls disappear.
          for (let i = 0; i < targets.length; i++) {
            for (let j = i + 1; j < targets.length; j++) {
              const a = targets[i],
                b = targets[j];
              const overlapX =
                Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
              const overlapY =
                Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
              expect(overlapX > 0 && overlapY > 0).toBe(false);
            }
          }
        }
      }
    },
  );
});
