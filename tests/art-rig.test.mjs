import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OUTLINE, board, lightness } from "../assets/campaign/kit/palette.mjs";
import { outlineWidth } from "../assets/campaign/kit/svg.mjs";
import {
  CABIN_INDICATOR,
  HALO_R,
  HEADLAMP_LENS,
  MOUNT_R,
  RIG_LIGHTS,
  RIG_TONES,
  RIG_VARIANT,
  RIG_VARIANTS,
  rigFrames,
  rigLateFrames,
} from "../assets/campaign/source/w01-rig.mjs";
import { T1_LITE_HEADLAMP_LENS } from "../src/campaign/render/t1-lite-headlamp.ts";

// Art item A13 (asset 40): the rig's shading, checked structurally from the
// shipped sources (style guide §6.1 "Shading model": generator art is
// checked structurally, at least 3 shading tiers per material zone; audit
// §9.2 "hero props structural"). The pixel reading (which fills reach the
// screen) is review evidence: scripts/art-review-a13.mjs/.py.

const source = (name) =>
  readFile(
    new URL(`../assets/campaign/source/${name}.svg`, import.meta.url),
    "utf8",
  );
const svg = (name, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><title>${name}</title><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const FRAMES = [...rigFrames(), ...rigLateFrames()];
/** Emitters, drawn unlit in the base and lit in the sibling: not a shaded material. */
const EMITTERS = new Set(["light"]);
/** The style guide holds tier targets within ±3 L*; closer fills are one tier. */
const MERGE_L = 3;
const OUTLINE_INKS = new Set([OUTLINE, "#111e26", "#101820", "#0e151d"]);

/** [zone, text] for each data-zone group (zone groups are never nested). */
function zones(text) {
  const out = [];
  const open = /<g[^>]*data-zone="([^"]+)"[^>]*>/g;
  let match;
  while ((match = open.exec(text))) {
    let depth = 1,
      end = text.length;
    const tag = /<(\/?)g\b/g;
    tag.lastIndex = match.index + match[0].length;
    let t;
    while ((t = tag.exec(text))) {
      depth += t[1] ? -1 : 1;
      if (!depth) {
        end = t.index;
        break;
      }
    }
    out.push([match[1], text.slice(match.index + match[0].length, end)]);
    open.lastIndex = end;
  }
  return out;
}
const fills = (text) =>
  [...text.matchAll(/fill="(#[0-9a-f]{6})"/g)]
    .map((m) => m[1])
    .filter((colour) => !OUTLINE_INKS.has(colour));
/** Distinct L* levels after merging fills within MERGE_L (art_tiers.py). */
function tiers(colours) {
  const levels = [...new Set(colours)].map(lightness).sort((a, b) => a - b);
  let count = 0,
    last = -Infinity;
  for (const L of levels) {
    if (L - last > MERGE_L) count++;
    last = L;
  }
  return count;
}

/** The bounding box of absolute path data (M L H V Q A Z, as the rig uses). */
function pathBox(d) {
  const tokens = d.match(/[MLHVQAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  let x = 0,
    y = 0,
    command = "";
  const xs = [],
    ys = [];
  const add = (px, py) => {
    xs.push(px);
    ys.push(py);
  };
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    if (command !== command.toUpperCase())
      throw new Error(`relative path data in a clip path: ${d}`);
    const n = () => Number(tokens[i++]);
    if (command === "Z") continue;
    if (command === "M" || command === "L") [x, y] = [n(), n()];
    else if (command === "H") x = n();
    else if (command === "V") y = n();
    else if (command === "Q") {
      add(n(), n()); // the control point: a conservative box
      [x, y] = [n(), n()];
    } else if (command === "A") {
      const [rx, ry] = [n(), n()];
      n(); // rotation: the rig's arcs are circles
      const [large, sweep] = [n(), n()];
      const [x1, y1] = [n(), n()];
      // SVG arc endpoint to centre (SVG 1.1 F.6.5, rx = ry, no rotation).
      const r = Math.max(rx, Math.hypot(x1 - x, y1 - y) / 2);
      const mx = (x + x1) / 2,
        my = (y + y1) / 2;
      const half = Math.hypot(x1 - x, y1 - y) / 2;
      const h = Math.sqrt(Math.max(0, r * r - half * half));
      const sign = large === sweep ? -1 : 1;
      const ux = (x1 - x) / (2 * half || 1),
        uy = (y1 - y) / (2 * half || 1);
      const cx = mx + sign * h * -uy,
        cy = my + sign * h * ux;
      let a0 = Math.atan2(y - cy, x - cx),
        a1 = Math.atan2(y1 - cy, x1 - cx);
      if (sweep && a1 < a0) a1 += 2 * Math.PI;
      if (!sweep && a1 > a0) a1 -= 2 * Math.PI;
      for (let k = 0; k <= 64; k++) {
        const a = a0 + ((a1 - a0) * k) / 64;
        add(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      void ry;
      [x, y] = [x1, y1];
    }
    add(x, y);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
/** An axis-aligned box facet "M x0 y0 L x1 y0 L x1 y1 L x0 y1 Z", or null. */
function boxOf(d) {
  const m = d.match(
    /^M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+) Z$/,
  );
  if (!m) return null;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number);
  if (y0 !== y1 || x1 !== x2 || y2 !== y3 || x3 !== x0) return null;
  return [
    Math.min(x0, x1),
    Math.min(y0, y2),
    Math.max(x0, x1),
    Math.max(y0, y2),
  ];
}
/** A drawing box to screen: the down pose turns the drawing a quarter turn. */
function toScreen([x0, y0, x1, y1], transform) {
  if (transform === "down") return [132 - y1, x0, 132 - y0, x1];
  if (transform === "left") return [128 - x1, y0, 128 - x0, y1];
  return [x0, y0, x1, y1];
}
const transformOf = (text) =>
  text.includes('<g transform="translate(132 0) rotate(90 0 0)">')
    ? "down"
    : text.includes('<g transform="translate(128 0) scale(-1 1)">')
      ? "left"
      : "right";

/**
 * Each part of a zone (a clip group, as w01-rig.mjs part() writes it): the
 * silhouette's box and the fills inside, in order (the first is the base).
 */
function parts(zoneText) {
  const out = [];
  for (const m of zoneText.matchAll(
    /<clipPath id="([^"]+)"><path d="([^"]+)"\/><\/clipPath><\/defs><g clip-path="url\(#\1\)">(.*?)<\/g>/g,
  ))
    out.push({
      id: m[1],
      box: pathBox(m[2]),
      fills: [...m[3].matchAll(/<path d="([^"]+)" fill="(#[0-9a-f]{6})"/g)].map(
        (f) => ({ d: f[1], fill: f[2] }),
      ),
    });
  return out;
}

describe("A13: rig shading, structurally", () => {
  it("ships the facets variant, rebuilt from w01-rig.mjs byte for byte", async () => {
    expect(RIG_VARIANT).toBe("facets");
    expect(Object.keys(RIG_VARIANTS)).toEqual(["facets", "bevel", "rim"]);
    // Facets: hard tier edges, no soft gradients, no bevel strips, no rims.
    expect(RIG_VARIANTS.facets).toMatchObject({
      soft: false,
      bevel: 0,
      rim: 0,
    });
    expect(FRAMES.length).toBeGreaterThanOrEqual(58);
    for (const [name, body] of FRAMES) {
      const text = await source(name);
      expect(text, name).toBe(svg(name, body));
      // Only literal fills, which the tier count reads: no gradient or
      // pattern fill escapes it (the sibling's halo is light, not shading).
      if (!name.endsWith("-emissive"))
        expect(text, name).not.toMatch(
          /<(linear|radial)Gradient|<pattern|fill="url\(/,
        );
    }
  });

  it("draws every material zone in at least 3 shading tiers in every frame", async () => {
    const seen = new Map();
    for (const [name] of FRAMES) {
      if (name.endsWith("-emissive")) continue;
      const text = await source(name);
      const byZone = new Map();
      let unzoned = text;
      for (const [zone, chunk] of zones(text)) {
        byZone.set(zone, [...(byZone.get(zone) ?? []), ...fills(chunk)]);
        unzoned = unzoned.replace(chunk, "");
      }
      // Every fill belongs to a zone, so none escapes the count; only the
      // wear marks (strokes) have no zone.
      expect(fills(unzoned), `${name}: fills outside a zone`).toEqual([]);
      if (!name.startsWith("rig-damage-"))
        expect(byZone.size, `${name}: zones`).toBeGreaterThan(0);
      for (const [zone, colours] of byZone) {
        if (EMITTERS.has(zone)) continue;
        expect(RIG_TONES, `${name}: zone ${zone}`).toHaveProperty(zone);
        // Every fill is one of the zone's tones (no stray colour).
        const palette = new Set(Object.values(RIG_TONES[zone]));
        for (const colour of colours)
          expect(palette.has(colour), `${name} ${zone} ${colour}`).toBe(true);
        expect(
          new Set(colours).size,
          `${name}: ${zone} fills`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          tiers(colours),
          `${name}: ${zone} L* tiers`,
        ).toBeGreaterThanOrEqual(3);
        seen.set(zone, [...(seen.get(zone) ?? []), name]);
      }
    }
    // The user's zones (yellow hull, copper, silver top, tracks) and the
    // design's others all appear, each with its anchor colour.
    for (const zone of [
      "hull",
      "copper",
      "silver",
      "tracks",
      "paint",
      "steel",
      "glass",
      "rank1",
      "pads",
      "flame",
    ])
      expect(seen.get(zone)?.length ?? 0, zone).toBeGreaterThan(0);
    expect(RIG_TONES.hull.lit).toBe(board("rig_yellow")); // #f6e791
    expect(RIG_TONES.copper.body).toBe(board("ore_copper")); // #d69d6e
    expect(RIG_TONES.silver.lit).toBe(board("ore_silver_top")); // #e4e7e3
    expect(seen.get("hull")).toEqual(
      expect.arrayContaining(["rig-cabin", "rig-body-0", "rig-hull-0"]),
    );
    expect(seen.get("tracks")).toEqual(
      expect.arrayContaining([...Array(8)].map((_, i) => `rig-body-${i}`)),
    );
    expect(seen.get("copper")).toEqual(
      expect.arrayContaining(["rig-drill-idle", "rig-drill-collar-down-1"]),
    );
  });

  it("orders each zone's tones lit, body, shadow, deep (top-lit)", () => {
    for (const [zone, tones] of Object.entries(RIG_TONES)) {
      const order = ["lit", "body", "shadow", "deep"].filter((t) => t in tones);
      if (order.length < 3) continue; // the flame and the lights name others
      const L = order.map((t) => lightness(tones[t]));
      for (let i = 1; i < L.length; i++)
        expect(L[i], `${zone} ${order[i]}`).toBeLessThan(L[i - 1] - MERGE_L);
    }
  });

  it("lights each part from above: its full-width bands darken downward", async () => {
    // Two parts carry lit bars over their tiers by design: thin bands in
    // the zone's lit tone that are markings or rails, not faces. They are
    // left out of the order (and must still be there, so the list stays
    // true).
    const decals = {
      "rig-energy-1-body-clip":
        "the rank-1 canister's two painted stripes cross its shadow foot",
      "rig-rack-frame-clip": "the cargo rack's rails, lit bars over the frame",
    };
    const decalsSeen = new Set();
    let tested = 0;
    for (const [name] of FRAMES) {
      if (name.endsWith("-emissive")) continue;
      const text = await source(name);
      const transform = transformOf(text);
      for (const [zone, chunk] of zones(text)) {
        if (EMITTERS.has(zone)) continue;
        for (const part of parts(chunk)) {
          const sil = toScreen(part.box, transform);
          // Tier bands: box facets that, cut to the silhouette, span its
          // whole width on screen (flutes, streaks, reflections and the
          // down bit's symmetric stripes are not bands).
          const bands = [];
          for (const { d, fill } of part.fills.slice(1)) {
            const box = boxOf(d);
            if (!box) continue;
            const [x0, y0, x1, y1] = toScreen(box, transform);
            const cut = [
              Math.max(x0, sil[0]),
              Math.max(y0, sil[1]),
              Math.min(x1, sil[2]),
              Math.min(y1, sil[3]),
            ];
            if (cut[2] - cut[0] <= 0 || cut[3] - cut[1] <= 0) continue;
            if (cut[0] - sil[0] > 0.01 || sil[2] - cut[2] > 0.01) continue;
            if (
              part.id in decals &&
              fill === RIG_TONES[zone].lit &&
              cut[3] - cut[1] <= 2.41
            ) {
              decalsSeen.add(part.id);
              continue;
            }
            bands.push({ y0: cut[1], y1: cut[3], L: lightness(fill), fill });
          }
          if (bands.length < 2) continue;
          bands.sort((a, b) => a.y0 - b.y0);
          for (let i = 1; i < bands.length; i++) {
            const [above, below] = [bands[i - 1], bands[i]];
            const where = `${name} ${part.id}: ${above.fill} over ${below.fill}`;
            // Lighter (or equal) above, darker below, with the part's own
            // base tone showing between (bands never overlap).
            expect(below.L, where).toBeLessThanOrEqual(above.L + 0.01);
            expect(below.y0, where).toBeGreaterThanOrEqual(above.y1 - 0.01);
          }
          tested++;
        }
      }
    }
    // The rule ran on the body deck, modules, canister, armour, mount,
    // bit, collars, feet, pads and crates, not vacuously.
    expect(tested).toBeGreaterThanOrEqual(80);
    expect([...decalsSeen].sort()).toEqual(Object.keys(decals).sort());
  });

  it("closes every frame with the §6.1 outline, one ink", async () => {
    const width = Math.round(outlineWidth(96) * 100) / 100; // 4.22 units
    expect(width).toBeCloseTo(96 * 0.044, 1);
    // Plates lying on another part take the thinner seam (module header).
    const seams = new Set(["rig-hull-0", "rig-bay-0"]);
    for (const [name] of FRAMES) {
      if (/^thrust-|^rig-damage-|-emissive$/.test(name)) continue;
      const text = await source(name);
      const widths = new Set(
        [...text.matchAll(/stroke="#14232b" stroke-width="([\d.]+)"/g)].map(
          (m) => Number(m[1]),
        ),
      );
      if (!seams.has(name)) expect(widths.has(width), name).toBe(true);
      expect(widths.size, name).toBeGreaterThan(0);
      // No second outline ink (the pre-A13 #111e26).
      expect(text, name).not.toContain("#111e26");
    }
  });

  it("puts the lamp and indicator unlit in rig-cabin and lit in rig-cabin-emissive", async () => {
    const base = await source("rig-cabin");
    const lit = await source("rig-cabin-emissive");
    const names = FRAMES.map(([name]) => name);
    expect(names.indexOf("rig-cabin-emissive")).toBe(
      names.indexOf("rig-cabin") + 1,
    );
    // The board's lamp halo and bulb (palette.json), and the indicator.
    expect(RIG_LIGHTS.halo).toBe("#fcb032");
    expect(RIG_LIGHTS.bulb).toBe("#f9fdff");
    for (const colour of [
      RIG_LIGHTS.halo,
      RIG_LIGHTS.bulb,
      RIG_LIGHTS.indicator,
    ]) {
      expect(lit).toContain(colour);
      expect(base).not.toContain(colour);
    }
    expect(lit).toContain(`cx="${HEADLAMP_LENS.x}" cy="${HEADLAMP_LENS.y}"`);
    expect(lit).toContain(
      `cx="${CABIN_INDICATOR.x}" cy="${CABIN_INDICATOR.y}"`,
    );
    for (const colour of [RIG_TONES.light.lens, RIG_TONES.light.led])
      expect(base).toContain(`fill="${colour}"`);
    // The sibling holds only light: nothing but the light zone.
    expect(zones(lit).map(([zone]) => zone)).toEqual(["light", "light"]);
    expect(lit).not.toContain(RIG_TONES.hull.lit);
    // The halo ends inside the dark mount disc, so it stays on the rig's
    // silhouette (§9.2), with half a unit to spare for texture filtering.
    expect(lit).toContain(`r="${HALO_R}"`);
    expect(base).toContain(`fill="${OUTLINE}"`);
    expect(MOUNT_R - HALO_R).toBeGreaterThanOrEqual(0.5);
  });

  it("puts T1-lite's core on the lens the art draws", () => {
    // render/t1-lite-headlamp.ts places the core at the lens, as a fraction
    // of the 128-unit frame from its centre; it must follow HEADLAMP_LENS.
    expect(T1_LITE_HEADLAMP_LENS.x).toBeCloseTo(
      (HEADLAMP_LENS.x - 64) / 128,
      9,
    );
    expect(T1_LITE_HEADLAMP_LENS.y).toBeCloseTo(
      (HEADLAMP_LENS.y - 64) / 128,
      9,
    );
  });

  it("keeps the drill bit's tip inside the 128-unit frame (no outline cut flat)", async () => {
    // The bit's tip is the rig's farthest point (the review driver found no
    // other frame reaching the canvas edge): its round outline join (half
    // the §6.1 width) must end inside the frame, right-facing and, turned a
    // quarter, facing down.
    const half = outlineWidth(96) / 2;
    const tip = await source("rig-drill-idle");
    const cone = tip.match(
      /<clipPath id="rig-drill-idle-bit-clip"><path d="M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/,
    );
    expect(cone, "the bit's clip path").not.toBeNull();
    const tipX = Number(cone[3]);
    expect(tipX + half).toBeLessThanOrEqual(128 - 0.5);
    // The down drill maps x to y (translate(132 0) rotate(90)), so the same
    // tip lies at y = tipX.
    expect(await source("rig-drill-down-0")).toContain(
      '<g transform="translate(132 0) rotate(90 0 0)">',
    );
  });
});
