/**
 * Audit T8 (decision D3): one annotation system for everything drawn over
 * the playfield. It replaces the scene's Phaser text pool (label() and
 * missionLabel()) and the DOM HOME and target beacons (ui/world-labels.ts).
 *
 * - Scan shows the labels on demand (gamepad L2, the tool-tray button, Shift
 *   or F, with a toggle preference; input.ts). With Scan off the playfield
 *   keeps only HOME, an edge chevron with its distance, the hazard markers
 *   and their one live warning, and the prompts the player triggered.
 * - One placement solver, by priority: hazards, then interaction prompts,
 *   navigation, information. A label never comes within 1.2 tiles of the rig,
 *   never crosses another label, a marker or a DOM advisory, and stays in the
 *   playfield; one that cannot fit is dropped rather than overlapped. A label
 *   pushed off its anchor gets a leader tick that points back to it.
 * - Asset 28 (edge chevron, pulse ring, Scan glyph, leader tick) is drawn by
 *   assets/campaign/source/annotation-sources.mjs and reaches the DOM through
 *   frames.json and generated/icons, the path every glyph takes (T13a).
 * - Everything is DOM in #campaign-world-labels: no canvas sprite, so no draw
 *   call (the phone is at its limit of 10), no texture upload (F2), and the
 *   text stays sharp at any backing scale. The scene positions it every frame,
 *   in step with the canvas, from data it already holds for known cells only:
 *   nothing here reads hidden tiles, deposits, sites or hazards (F7).
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Colour roles, styled in style.css (`.annotation-label[data-tone]`). */
export type AnnotationTone =
  "home" | "target" | "info" | "done" | "warn" | "ice";

export interface AnnotationRequest {
  /** Stable key: the DOM element is reused while the key repeats. */
  id: string;
  /** One text node (the F6 counter counts one item per node). */
  text: string;
  /** The anchor on the screen, CSS px. */
  x: number;
  y: number;
  /** 0 hazard, 1 prompt the player triggered, 2 navigation, 3 information. */
  priority: 0 | 1 | 2 | 3;
  /** Shown only while Scan is active. */
  scan: boolean;
  tone: AnnotationTone;
  /**
   * `chevron` (HOME): pinned to the playfield edge, pointing at the anchor,
   * while the anchor is outside the playfield; above the anchor, pointing
   * down, while it is inside. `ring` (a target): the pulse ring around an
   * anchor inside the playfield, the edge chevron outside it.
   */
  marker?: "chevron" | "ring";
  /** Ring radius, CSS px (the ring's art is drawn for its full box). */
  radius?: number;
  /** A screen callout: the label is centred on (x, y), with no marker. */
  fixed?: boolean;
  /** At most `AnnotationFrame.limits[group]` of a group are placed. */
  group?: string;
}

export interface AnnotationFrame {
  width: number;
  height: number;
  /** The HUD bands the camera already keeps clear (cameraSafeArea). */
  safe: { top: number; bottom: number; left?: number; right?: number };
  /** The rig's centre on the screen, CSS px. */
  rig: { x: number; y: number };
  /** CSS px per tile at the current zoom. */
  tile: number;
  scanning: boolean;
  /** DOM boxes in the playfield: advisories, the dock button, the toolbar. */
  obstacles: Rect[];
  limits?: Record<string, number>;
}

export interface PlacedMarker {
  kind: "chevron" | "ring";
  /** Centre, CSS px. */
  x: number;
  y: number;
  /** Radians; the chevron's art points right at 0. */
  angle: number;
  /** A chevron pinned to the playfield edge. */
  edge: boolean;
  /** Half the marker's box, CSS px. */
  radius: number;
}

export interface PlacedAnnotation {
  request: AnnotationRequest;
  box: Rect;
  marker?: PlacedMarker;
  /** The leader tick at the label's edge, pointing at the anchor. */
  leader?: { x: number; y: number; angle: number };
}

/** D3 and §9.2: no annotation within 1.2 tiles of the rig. */
export const RIG_CLEARANCE_TILES = 1.2;
/** Asset 28's chevron, CSS px (the board's 22 px glyph in a 24 px box). */
export const CHEVRON_SIZE = 24;
/** The leader tick's length, CSS px. */
export const LEADER_SIZE = 10;
/** Space between a label and its marker or anchor, CSS px. */
export const LABEL_GAP = 5;
/** Space kept between two annotations, CSS px. */
export const SPACING = 4;
/** The chevron's centre sits this far inside the playfield edge. */
export const EDGE_INSET = CHEVRON_SIZE / 2 + 6;

export const intersects = (a: Rect, b: Rect, pad = 0) =>
  a.left < b.right + pad &&
  a.right > b.left - pad &&
  a.top < b.bottom + pad &&
  a.bottom > b.top - pad;

const contains = (outer: Rect, inner: Rect) =>
  inner.left >= outer.left &&
  inner.right <= outer.right &&
  inner.top >= outer.top &&
  inner.bottom <= outer.bottom;

const squareAt = (x: number, y: number, radius: number): Rect => ({
  left: x - radius,
  top: y - radius,
  right: x + radius,
  bottom: y + radius,
});

/** The square the rig keeps clear: its centre ± 1.2 tiles. */
export function rigClearance(frame: Pick<AnnotationFrame, "rig" | "tile">) {
  return squareAt(frame.rig.x, frame.rig.y, frame.tile * RIG_CLEARANCE_TILES);
}

/** The playfield: the view less the HUD bands, 4 px in. */
export function playfield(frame: AnnotationFrame): Rect {
  return {
    left: (frame.safe.left ?? 0) + 4,
    top: frame.safe.top + 4,
    right: frame.width - (frame.safe.right ?? 0) - 4,
    bottom: frame.height - frame.safe.bottom - 4,
  };
}

/**
 * Where the ray from `from` towards `to` leaves `bounds`, and its angle: the
 * edge chevron's place. `from` is clamped into `bounds` first.
 */
export function edgePoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bounds: Rect,
) {
  const x0 = Math.min(bounds.right, Math.max(bounds.left, from.x)),
    y0 = Math.min(bounds.bottom, Math.max(bounds.top, from.y));
  const dx = to.x - x0,
    dy = to.y - y0;
  const angle = Math.atan2(dy, dx);
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (bounds.right - x0) / dx);
  if (dx < 0) t = Math.min(t, (bounds.left - x0) / dx);
  if (dy > 0) t = Math.min(t, (bounds.bottom - y0) / dy);
  if (dy < 0) t = Math.min(t, (bounds.top - y0) / dy);
  if (!Number.isFinite(t)) t = 0;
  return { x: x0 + dx * t, y: y0 + dy * t, angle };
}

type Sized = AnnotationRequest & { width: number; height: number };

/**
 * Label boxes around a point, nearest ring first. `order` lists unit
 * directions in preference order; each ring moves the box further out.
 */
function candidates(
  x: number,
  y: number,
  width: number,
  height: number,
  gap: number,
  order: [number, number][],
  step: number,
  rings: number,
) {
  const boxes: Rect[] = [];
  for (let ring = 0; ring < rings; ring++) {
    const reach = gap + ring * step;
    for (const [ux, uy] of order) {
      // The box's near edge sits `reach` from the point along the direction.
      const cx = x + ux * (reach + width / 2),
        cy = y + uy * (reach + height / 2);
      boxes.push({
        left: cx - width / 2,
        top: cy - height / 2,
        right: cx + width / 2,
        bottom: cy + height / 2,
      });
    }
  }
  return boxes;
}

const ANCHORED: [number, number][] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [0.7, -0.7],
  [-0.7, -0.7],
  [0.7, 0.7],
  [-0.7, 0.7],
];

/** The point of `box` nearest to (x, y). */
function nearestPoint(box: Rect, x: number, y: number) {
  return {
    x: Math.min(box.right, Math.max(box.left, x)),
    y: Math.min(box.bottom, Math.max(box.top, y)),
  };
}

/**
 * Places every request that fits, most important first, and drops the rest.
 * Deterministic: the same requests and frame give the same placement.
 */
export function solveAnnotations(
  requests: Sized[],
  frame: AnnotationFrame,
): PlacedAnnotation[] {
  const field = playfield(frame);
  const clearance = rigClearance(frame);
  const edge: Rect = {
    left: field.left + EDGE_INSET,
    top: field.top + EDGE_INSET,
    right: field.right - EDGE_INSET,
    bottom: field.bottom - EDGE_INSET,
  };
  const taken: Rect[] = [];
  const placed: PlacedAnnotation[] = [];
  const counts = new Map<string, number>();
  const blocked = (box: Rect, own?: Rect) =>
    !contains(field, box) ||
    intersects(box, clearance) ||
    frame.obstacles.some((obstacle) => intersects(box, obstacle, SPACING)) ||
    taken.some((other) => intersects(box, other, SPACING)) ||
    (own !== undefined && intersects(box, own, 1));
  const ordered = requests
    .filter((request) => frame.scanning || !request.scan)
    .map((request, index) => ({ request, index }))
    .sort(
      (a, b) =>
        a.request.priority - b.request.priority ||
        Math.hypot(a.request.x - frame.rig.x, a.request.y - frame.rig.y) -
          Math.hypot(b.request.x - frame.rig.x, b.request.y - frame.rig.y) ||
        a.index - b.index,
    );
  for (const { request } of ordered) {
    const limit = request.group ? frame.limits?.[request.group] : undefined;
    if (
      request.group &&
      limit !== undefined &&
      (counts.get(request.group) ?? 0) >= limit
    )
      continue;
    const { width, height } = request;
    if (!(width > 0 && height > 0)) continue;
    let box: Rect | undefined;
    let marker: PlacedMarker | undefined;
    if (request.fixed) {
      for (let lift = 0; lift < 4 && !box; lift++) {
        const top = Math.min(
          field.bottom - height,
          Math.max(field.top, request.y - height / 2),
        );
        const left = Math.min(
          field.right - width,
          Math.max(field.left, request.x - width / 2),
        );
        const candidate = {
          left,
          top: top - lift * (height + SPACING),
          right: left + width,
          bottom: top - lift * (height + SPACING) + height,
        };
        if (!blocked(candidate)) box = candidate;
      }
    } else {
      const inside =
        request.x >= field.left &&
        request.x <= field.right &&
        request.y >= field.top &&
        request.y <= field.bottom;
      let refX = request.x,
        refY = request.y,
        gap = LABEL_GAP,
        order = ANCHORED;
      if (request.marker && !inside) {
        // Off the playfield: the edge chevron, from the rig towards the anchor.
        const point = edgePoint(frame.rig, request, edge);
        marker = {
          kind: "chevron",
          x: point.x,
          y: point.y,
          angle: point.angle,
          edge: true,
          radius: CHEVRON_SIZE / 2,
        };
        // Slide along the edge, nearest first, until the chevron is clear of
        // advisories, other annotations and the rig (a corner can sit under
        // the advisory stack). With no clear place it is left out.
        const clear = (x: number, y: number) => {
          const own = squareAt(x, y, CHEVRON_SIZE / 2);
          return (
            !frame.obstacles.some((obstacle) =>
              intersects(own, obstacle, SPACING),
            ) &&
            !taken.some((other) => intersects(own, other, SPACING)) &&
            !intersects(own, clearance)
          );
        };
        const vertical =
          Math.abs(point.x - edge.left) < 0.5 ||
          Math.abs(point.x - edge.right) < 0.5;
        const span = vertical ? edge.bottom - edge.top : edge.right - edge.left;
        let found = clear(point.x, point.y);
        for (let step = 1; !found && step * CHEVRON_SIZE <= span; step++)
          for (const sign of [1, -1]) {
            const x = vertical
                ? point.x
                : Math.min(
                    edge.right,
                    Math.max(edge.left, point.x + sign * step * CHEVRON_SIZE),
                  ),
              y = vertical
                ? Math.min(
                    edge.bottom,
                    Math.max(edge.top, point.y + sign * step * CHEVRON_SIZE),
                  )
                : point.y;
            if (clear(x, y)) {
              marker.x = x;
              marker.y = y;
              found = true;
              break;
            }
          }
        refX = marker.x;
        refY = marker.y;
        gap = CHEVRON_SIZE / 2 + LABEL_GAP;
        if (!found) marker = undefined;
        // Inward first: the label sits on the playfield side of the chevron.
        const inwardX = (field.left + field.right) / 2 - refX,
          inwardY = (field.top + field.bottom) / 2 - refY;
        order = [...ANCHORED].sort(
          ([ax, ay], [bx, by]) =>
            bx * inwardX + by * inwardY - (ax * inwardX + ay * inwardY),
        );
      } else if (request.marker === "chevron") {
        // HOME in view: the chevron above the lander, pointing down at it.
        marker = {
          kind: "chevron",
          x: request.x,
          y: request.y - CHEVRON_SIZE * 0.75,
          angle: Math.PI / 2,
          edge: false,
          radius: CHEVRON_SIZE / 2,
        };
        refX = marker.x;
        refY = marker.y;
        gap = marker.radius + LABEL_GAP;
      } else if (request.marker === "ring") {
        const radius = Math.max(8, request.radius ?? frame.tile * 0.53);
        marker = {
          kind: "ring",
          x: request.x,
          y: request.y,
          angle: 0,
          edge: false,
          radius,
        };
        gap = radius + LABEL_GAP;
      }
      // An anchored marker at the rig would cover it (the object is there),
      // and one under an advisory or another annotation would cross it.
      if (marker && !marker.edge) {
        const own = squareAt(marker.x, marker.y, marker.radius);
        if (
          intersects(own, clearance) ||
          frame.obstacles.some((obstacle) => intersects(own, obstacle)) ||
          taken.some((other) => intersects(own, other, SPACING))
        )
          marker = undefined;
      }
      const own = marker
        ? squareAt(marker.x, marker.y, marker.radius)
        : undefined;
      for (const candidate of candidates(
        refX,
        refY,
        width,
        height,
        gap,
        order,
        Math.max(12, frame.tile * 0.5),
        9,
      ))
        if (!blocked(candidate, own)) {
          box = candidate;
          break;
        }
    }
    if (!box) continue;
    if (request.group)
      counts.set(request.group, (counts.get(request.group) ?? 0) + 1);
    taken.push(box);
    if (marker) taken.push(squareAt(marker.x, marker.y, marker.radius));
    const result: PlacedAnnotation = { request, box };
    if (marker) result.marker = marker;
    if (!request.fixed) {
      // A label pushed off its anchor (or its marker) points back to it.
      const targetX = marker?.x ?? request.x,
        targetY = marker?.y ?? request.y,
        reach = (marker?.radius ?? 0) + LABEL_GAP;
      const near = nearestPoint(box, targetX, targetY);
      const distance = Math.hypot(targetX - near.x, targetY - near.y);
      if (distance > reach + LEADER_SIZE)
        result.leader = {
          x: near.x,
          y: near.y,
          angle: Math.atan2(targetY - near.y, targetX - near.x),
        };
    }
    placed.push(result);
  }
  return placed;
}

/** Writes a data attribute only when it changes: a still frame writes nothing. */
function setData(element: HTMLElement, key: string, value: string) {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

/** A layer entry: the label, and the marker and leader images it may use. */
interface LayerItem {
  label: HTMLElement;
  marker?: HTMLImageElement;
  leader?: HTMLImageElement;
  text: string;
  tone: string;
  size?: { width: number; height: number };
  /** Last written transforms, so a still frame writes nothing. */
  written: { label: string; marker: string; leader: string; ring: string };
  adopted: boolean;
}

/** Asset 28 as the DOM loads it: generated/icons, one entry per frame. */
export interface AnnotationArt {
  chevronHome: string;
  chevronTarget: string;
  ring: string;
  leader: string;
}

/**
 * Asset 28's icons, at the largest size the build writes (frames.json
 * `iconSizes`), so a 24 px chevron stays sharp at DPR 3.
 */
export const ANNOTATION_ART: AnnotationArt = {
  chevronHome: new URL(
    "../../../assets/campaign/generated/icons/ui-chevron-home-72.png",
    import.meta.url,
  ).href,
  chevronTarget: new URL(
    "../../../assets/campaign/generated/icons/ui-chevron-target-72.png",
    import.meta.url,
  ).href,
  ring: new URL(
    "../../../assets/campaign/generated/icons/ui-pulse-ring-192.png",
    import.meta.url,
  ).href,
  leader: new URL(
    "../../../assets/campaign/generated/icons/ui-leader-tick-72.png",
    import.meta.url,
  ).href,
};

/**
 * The DOM boxes over the playfield that annotations keep clear of: the
 * advisory stack, the dock and context buttons, the toolbar and the HUD.
 */
export const OBSTACLE_SELECTORS = [
  "#campaign-coach",
  "#campaign-return",
  "#campaign-message",
  "#campaign-danger",
  "#campaign-extraction",
  "#campaign-dock-toggle",
  ".campaign-toolbar",
  ".campaign-hud",
  ".campaign-objective",
  "#campaign-menu-toggle",
  ".campaign-touch",
].join(",");

/**
 * Reads the obstacle boxes at most every `every` ms (layout reads, done
 * before the frame writes anything), in the scene's screen coordinates.
 */
export class ObstacleReader {
  private at = -Infinity;
  private boxes: Rect[] = [];

  read(
    now: number,
    toScreen: (x: number, y: number) => { x: number; y: number },
    every = 120,
  ) {
    if (now >= this.at && now - this.at < every) return this.boxes;
    this.at = now;
    this.boxes = [];
    for (const node of document.querySelectorAll<HTMLElement>(
      OBSTACLE_SELECTORS,
    )) {
      if (node.hidden || !node.getClientRects().length) continue;
      const css = getComputedStyle(node);
      if (
        css.display === "none" ||
        css.visibility === "hidden" ||
        Number(css.opacity) === 0
      )
        continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const corner = toScreen(rect.left, rect.top);
      this.boxes.push({
        left: corner.x,
        top: corner.y,
        right: corner.x + rect.width,
        bottom: corner.y + rect.height,
      });
    }
    return this.boxes;
  }
}

/**
 * The DOM side: pooled elements in #campaign-world-labels. measure() sizes a
 * label (once per text), render() writes the placement. The ids the smoke
 * tests know stay: HOME's label is #campaign-home-beacon and the target's
 * #campaign-target-beacon, both `.world-beacon`.
 */
export class AnnotationLayer {
  private items = new Map<string, LayerItem>();
  private drawn: PlacedAnnotation[] = [];

  constructor(
    private root: HTMLElement,
    private art: AnnotationArt,
    private adopt: Record<string, HTMLElement> = {},
  ) {
    // Inter loads with font-display: swap; sizes taken before it are stale,
    // as are sizes taken before a text-size or interface-scale change.
    document.fonts?.addEventListener?.("loadingdone", () => this.invalidate());
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => this.invalidate());
      observer.observe(document.body, { attributeFilter: ["class"] });
      observer.observe(document.documentElement, {
        attributeFilter: ["style"],
      });
    }
  }

  /** Forget every measured size (fonts, text size or interface scale changed). */
  invalidate() {
    for (const item of this.items.values()) item.size = undefined;
  }

  private item(request: AnnotationRequest) {
    let item = this.items.get(request.id);
    if (!item) {
      const adopted = this.adopt[request.id];
      const label = adopted ?? document.createElement("span");
      label.classList.add("annotation-label");
      if (!adopted) this.root.append(label);
      item = {
        label,
        text: "",
        tone: "",
        written: { label: "", marker: "", leader: "", ring: "" },
        adopted: Boolean(adopted),
      };
      this.items.set(request.id, item);
    }
    if (item.text !== request.text) {
      item.label.textContent = request.text;
      item.label.dataset.label = request.text;
      item.text = request.text;
      item.size = undefined;
    }
    if (item.tone !== request.tone) {
      item.label.dataset.tone = request.tone;
      item.tone = request.tone;
      item.size = undefined;
    }
    setData(item.label, "scan", String(request.scan));
    return item;
  }

  /** The label's size in CSS px: measured on first use and on change. */
  measure(request: AnnotationRequest) {
    const item = this.item(request);
    if (!item.size) {
      item.label.hidden = false;
      item.size = {
        width: item.label.offsetWidth,
        height: item.label.offsetHeight,
      };
    }
    return item.size;
  }

  private image(item: LayerItem, key: "marker" | "leader") {
    let image = item[key];
    if (!image) {
      image = document.createElement("img");
      image.alt = "";
      image.decoding = "async";
      image.className =
        key === "marker" ? "annotation-marker" : "annotation-leader";
      if (key === "leader") image.src = this.art.leader;
      this.root.append(image);
      item[key] = image;
    }
    return image;
  }

  /**
   * Writes this frame's placement; elements without one are hidden. `pulse`
   * is the ring's scale on the scene clock (1 under reduced motion), `dpr`
   * snaps text to device pixels.
   */
  render(placed: PlacedAnnotation[], dpr: number, pulse: number) {
    const snap = (value: number) => Math.round(value * dpr) / dpr;
    const used = new Set<string>();
    for (const entry of placed) {
      const item = this.item(entry.request);
      used.add(entry.request.id);
      if (item.label.hidden) item.label.hidden = false;
      const transform = `translate(${snap(entry.box.left)}px, ${snap(entry.box.top)}px)`;
      if (item.written.label !== transform) {
        item.label.style.transform = transform;
        item.written.label = transform;
      }
      setData(
        item.label,
        "placed",
        [entry.box.left, entry.box.top, entry.box.right, entry.box.bottom]
          .map((value) => value.toFixed(1))
          .join(","),
      );
      const marker = entry.marker;
      if (marker) {
        const image = this.image(item, "marker");
        const source =
          marker.kind === "ring"
            ? this.art.ring
            : entry.request.tone === "home"
              ? this.art.chevronHome
              : this.art.chevronTarget;
        if (image.getAttribute("src") !== source) image.src = source;
        setData(image, "kind", marker.kind);
        setData(image, "edge", String(marker.edge));
        setData(image, "tone", entry.request.tone);
        const size = marker.radius * 2;
        const ring = `${size}`;
        if (item.written.ring !== ring) {
          image.style.width = image.style.height = `${size}px`;
          item.written.ring = ring;
        }
        const scale = marker.kind === "ring" ? pulse : 1;
        const markerTransform =
          `translate(${snap(marker.x - marker.radius)}px, ${snap(marker.y - marker.radius)}px)` +
          (marker.kind === "chevron"
            ? ` rotate(${marker.angle.toFixed(4)}rad)`
            : scale === 1
              ? ""
              : ` scale(${scale.toFixed(4)})`);
        if (item.written.marker !== markerTransform) {
          image.style.transform = markerTransform;
          item.written.marker = markerTransform;
        }
        if (image.hidden) image.hidden = false;
      } else if (item.marker && !item.marker.hidden) item.marker.hidden = true;
      if (entry.leader) {
        const image = this.image(item, "leader");
        const leaderTransform = `translate(${snap(entry.leader.x - LEADER_SIZE / 2)}px, ${snap(entry.leader.y - LEADER_SIZE / 2)}px) rotate(${entry.leader.angle.toFixed(4)}rad)`;
        if (item.written.leader !== leaderTransform) {
          image.style.transform = leaderTransform;
          item.written.leader = leaderTransform;
        }
        if (image.hidden) image.hidden = false;
      } else if (item.leader && !item.leader.hidden) item.leader.hidden = true;
    }
    for (const [id, item] of this.items)
      if (!used.has(id))
        for (const element of [item.label, item.marker, item.leader])
          if (element && !element.hidden) element.hidden = true;
    this.drawn = placed;
  }

  /** What render() drew last, for the debug hook and the datasets. */
  get placed() {
    return this.drawn;
  }
}
