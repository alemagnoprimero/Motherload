import { describe, expect, it } from "vitest";
import {
  CHEVRON_SIZE,
  EDGE_INSET,
  RIG_CLEARANCE_TILES,
  edgePoint,
  intersects,
  playfield,
  rigClearance,
  solveAnnotations,
  type AnnotationFrame,
  type AnnotationRequest,
  type PlacedAnnotation,
  type Rect,
} from "../src/campaign/render/annotations";

const frame = (overrides: Partial<AnnotationFrame> = {}): AnnotationFrame => ({
  width: 1440,
  height: 900,
  safe: { top: 150, bottom: 70 },
  rig: { x: 720, y: 520 },
  tile: 65,
  scanning: false,
  obstacles: [],
  ...overrides,
});

const request = (
  id: string,
  x: number,
  y: number,
  extra: Partial<AnnotationRequest & { width: number; height: number }> = {},
) => ({
  id,
  text: id,
  x,
  y,
  priority: 3 as const,
  scan: false,
  tone: "info" as const,
  width: 96,
  height: 22,
  ...extra,
});

const square = (marker: NonNullable<PlacedAnnotation["marker"]>): Rect => ({
  left: marker.x - marker.radius,
  top: marker.y - marker.radius,
  right: marker.x + marker.radius,
  bottom: marker.y + marker.radius,
});

/** The contract every placement keeps (D3, §9.2). */
function expectContract(placed: PlacedAnnotation[], view: AnnotationFrame) {
  const field = playfield(view),
    clearance = rigClearance(view);
  const boxes: Rect[] = [];
  for (const entry of placed) {
    const { box } = entry;
    expect(box.left).toBeGreaterThanOrEqual(field.left - 1e-9);
    expect(box.right).toBeLessThanOrEqual(field.right + 1e-9);
    expect(box.top).toBeGreaterThanOrEqual(field.top - 1e-9);
    expect(box.bottom).toBeLessThanOrEqual(field.bottom + 1e-9);
    expect(intersects(box, clearance)).toBe(false);
    for (const obstacle of view.obstacles)
      expect(intersects(box, obstacle)).toBe(false);
    boxes.push(box);
    if (entry.marker) {
      if (!entry.marker.edge)
        expect(intersects(square(entry.marker), clearance)).toBe(false);
      boxes.push(square(entry.marker));
    }
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(intersects(boxes[i]!, boxes[j]!)).toBe(false);
}

describe("T8 annotations: what shows", () => {
  it("shows Scan labels only while Scan is active", () => {
    const requests = [
      request("home", -400, -300, {
        priority: 2,
        tone: "home",
        marker: "chevron",
      }),
      request("site", 900, 400, { scan: true }),
    ];
    const off = solveAnnotations(requests, frame());
    expect(off.map((entry) => entry.request.id)).toEqual(["home"]);
    const on = solveAnnotations(requests, frame({ scanning: true }));
    expect(on.map((entry) => entry.request.id).sort()).toEqual([
      "home",
      "site",
    ]);
  });

  it("keeps one hazard sentence with Scan off, the nearest, and drops what cannot fit", () => {
    const view = frame({ limits: { hazard: 1 } });
    const placed = solveAnnotations(
      [
        request("far", 1100, 500, { priority: 0, group: "hazard" }),
        request("near", 520, 500, { priority: 0, group: "hazard" }),
      ],
      view,
    );
    expect(placed.map((entry) => entry.request.id)).toEqual(["near"]);
    // A label wider than the playfield never squeezes in.
    expect(
      solveAnnotations([request("wide", 700, 400, { width: 2000 })], view),
    ).toEqual([]);
  });

  it("is deterministic", () => {
    const requests = [
      request("a", 700, 500, { scan: true }),
      request("b", 760, 470, { scan: true, priority: 2 }),
      request("c", 650, 560, { priority: 0 }),
    ];
    const view = frame({ scanning: true });
    expect(solveAnnotations(requests, view)).toEqual(
      solveAnnotations(structuredClone(requests), structuredClone(view)),
    );
  });
});

describe("T8 annotations: placement contract", () => {
  it("never comes within 1.2 tiles of the rig, never overlaps, and stays in the playfield", () => {
    const obstacles = [{ left: 18, top: 154, right: 368, bottom: 232 }];
    for (const [rigX, rigY, tile] of [
      [720, 520, 65],
      [200, 300, 65],
      [196, 420, 44],
      [720, 860, 82],
    ] as const) {
      const view = frame({
        rig: { x: rigX, y: rigY },
        tile,
        scanning: true,
        obstacles,
        width: tile === 44 ? 393 : 1440,
        height: tile === 44 ? 851 : 900,
      });
      // A crowd of anchors at and around the rig, some off screen.
      const requests = [];
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2,
          reach = (i % 4) * tile * 0.6;
        requests.push(
          request(
            `label-${i}`,
            rigX + Math.cos(angle) * reach,
            rigY + Math.sin(angle) * reach,
            {
              priority: (i % 4) as 0 | 1 | 2 | 3,
              width: 60 + (i % 5) * 18,
              marker: i % 6 === 0 ? "ring" : undefined,
            },
          ),
        );
      }
      requests.push(
        request("home", -900, -200, {
          priority: 2,
          marker: "chevron",
          tone: "home",
        }),
        request("target", rigX + 40, 4000, {
          priority: 2,
          marker: "ring",
          tone: "target",
        }),
      );
      const placed = solveAnnotations(requests, view);
      expect(placed.length).toBeGreaterThan(4);
      expectContract(placed, view);
    }
  });

  it("gives a label pushed off its anchor a leader tick pointing back", () => {
    const view = frame();
    // Anchored inside the rig's clearance: the label must move out.
    const [entry] = solveAnnotations(
      [request("cue", 720, 500, { priority: 0 })],
      view,
    );
    expect(entry).toBeDefined();
    expect(intersects(entry!.box, rigClearance(view))).toBe(false);
    expect(entry!.leader).toBeDefined();
    const { x, y, angle } = entry!.leader!;
    // The tick points at the anchor.
    expect(
      Math.cos(angle) * (720 - x) + Math.sin(angle) * (500 - y),
    ).toBeGreaterThan(0);
    expect(entry!.box.bottom).toBeLessThanOrEqual(
      520 - 65 * RIG_CLEARANCE_TILES,
    );
  });

  it("centres a screen callout and lifts it clear of what is already placed", () => {
    const view = frame();
    const placed = solveAnnotations(
      [
        request("callout", 720, 800, { priority: 1, fixed: true, width: 300 }),
        request("again", 720, 800, { priority: 1, fixed: true, width: 300 }),
      ],
      view,
    );
    expect(placed).toHaveLength(2);
    expect(placed[0]!.box.left).toBe(720 - 150);
    expect(placed[1]!.box.bottom).toBeLessThan(placed[0]!.box.top);
    expect(placed[0]!.leader).toBeUndefined();
  });
});

describe("T8 annotations: HOME and target markers", () => {
  it("pins HOME to the playfield edge, pointing at the lander, with the label inside", () => {
    const view = frame();
    const lander = { x: -600, y: -900 };
    const [home] = solveAnnotations(
      [
        request("home", lander.x, lander.y, {
          priority: 2,
          marker: "chevron",
          tone: "home",
        }),
      ],
      view,
    );
    expect(home?.marker?.edge).toBe(true);
    const field = playfield(view);
    const marker = home!.marker!;
    const onEdge =
      Math.abs(marker.x - (field.left + EDGE_INSET)) < 0.5 ||
      Math.abs(marker.y - (field.top + EDGE_INSET)) < 0.5;
    expect(onEdge).toBe(true);
    const expected = Math.atan2(lander.y - view.rig.y, lander.x - view.rig.x);
    expect(marker.angle).toBeCloseTo(expected, 6);
    // Inward: the label's centre is nearer the playfield's centre than the chevron.
    const centre = {
      x: (field.left + field.right) / 2,
      y: (field.top + field.bottom) / 2,
    };
    const labelX = (home!.box.left + home!.box.right) / 2,
      labelY = (home!.box.top + home!.box.bottom) / 2;
    expect(Math.hypot(labelX - centre.x, labelY - centre.y)).toBeLessThan(
      Math.hypot(marker.x - centre.x, marker.y - centre.y),
    );
  });

  it("slides an edge chevron out from under an advisory", () => {
    const advisory = { left: 18, top: 154, right: 368, bottom: 240 };
    const view = frame({ obstacles: [advisory] });
    const [home] = solveAnnotations(
      [
        request("home", -2000, -1400, {
          priority: 2,
          marker: "chevron",
          tone: "home",
        }),
      ],
      view,
    );
    const marker = home!.marker!;
    expect(
      intersects(
        {
          left: marker.x - CHEVRON_SIZE / 2,
          top: marker.y - CHEVRON_SIZE / 2,
          right: marker.x + CHEVRON_SIZE / 2,
          bottom: marker.y + CHEVRON_SIZE / 2,
        },
        advisory,
      ),
    ).toBe(false);
  });

  it("points down at a lander in view, and drops a marker that would cover the rig", () => {
    const view = frame();
    const [home] = solveAnnotations(
      [
        request("home", 1000, 400, {
          priority: 2,
          marker: "chevron",
          tone: "home",
        }),
      ],
      view,
    );
    expect(home!.marker).toMatchObject({ edge: false, angle: Math.PI / 2 });
    expect(home!.marker!.y).toBeLessThan(400);
    const [at] = solveAnnotations(
      [
        request("target", 730, 515, {
          priority: 2,
          marker: "ring",
          scan: false,
        }),
      ],
      view,
    );
    expect(at!.marker).toBeUndefined();
  });

  it("rings a target in view and turns an off-screen one into an edge chevron", () => {
    const view = frame({ scanning: true });
    const [ring] = solveAnnotations(
      [
        request("target", 1100, 400, {
          priority: 2,
          marker: "ring",
          radius: 34,
          scan: true,
        }),
      ],
      view,
    );
    expect(ring!.marker).toMatchObject({
      kind: "ring",
      x: 1100,
      y: 400,
      radius: 34,
    });
    const [chevron] = solveAnnotations(
      [
        request("target", 1100, 3000, {
          priority: 2,
          marker: "ring",
          scan: true,
        }),
      ],
      view,
    );
    expect(chevron!.marker).toMatchObject({ kind: "chevron", edge: true });
  });
});

describe("T8 annotations: edge point", () => {
  it("finds where the ray leaves the box and its angle", () => {
    const box = { left: 0, top: 0, right: 100, bottom: 50 };
    expect(edgePoint({ x: 50, y: 25 }, { x: 250, y: 25 }, box)).toEqual({
      x: 100,
      y: 25,
      angle: 0,
    });
    const up = edgePoint({ x: 50, y: 25 }, { x: 50, y: -500 }, box);
    expect(up.x).toBeCloseTo(50);
    expect(up.y).toBeCloseTo(0);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
    // A start outside the box is clamped into it first.
    const clamped = edgePoint({ x: -40, y: 25 }, { x: -400, y: 25 }, box);
    expect(clamped).toMatchObject({ x: 0, y: 25 });
  });
});
