import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { board, lightness } from "../assets/campaign/kit/palette.mjs";
import {
  ORE_MARK_CENTRES,
  ORE_MARK_GLYPHS,
  ORE_MARK_HC_FILL,
  oreBadge,
  oreMarkGeometry,
  oreMarkHighContrast,
} from "../assets/campaign/render-sources.mjs";
import {
  ORE_TONES,
  SOCKET_VARIANT,
  SOCKET_VARIANTS,
  depositSocket,
  oreFrame,
  packageFrame,
  socketStackedAlpha,
  tierMarkHighContrastFrame,
} from "../assets/campaign/source/w01-ore.mjs";
import { campaignOreMarker } from "../src/mineral-legend";

const source = (path) =>
  readFile(new URL(`../assets/campaign/${path}`, import.meta.url), "utf8");
const TIERS = [1, 2, 3, 4];

describe("A12: ore frames, socket and tier marks", () => {
  it("rebuild the committed W01 sources byte for byte", async () => {
    for (const tier of TIERS) {
      expect(await source(`source/ore-o${tier}.svg`)).toContain(
        oreFrame(tier - 1),
      );
      expect(await source(`source/package-o${tier}.svg`)).toContain(
        packageFrame(tier - 1),
      );
      expect(await source(`source/tier-mark-hc-${tier}.svg`)).toContain(
        tierMarkHighContrastFrame(tier),
      );
    }
    expect(await source("source/deposit-socket.svg")).toContain(
      depositSocket(SOCKET_VARIANT),
    );
  });
  it("draw the journal legend's mark for each tier (dot, II, three bars, triangle)", () => {
    expect(ORE_MARK_GLYPHS).toEqual(
      TIERS.map((tier) => campaignOreMarker(tier).marker),
    );
    for (const tier of TIERS)
      expect(oreBadge(tier)).toContain(
        `data-glyph="${campaignOreMarker(tier).marker}"`,
      );
  });
  it("keep the mark small, ringless and dark, the HC mark clear of copper", () => {
    expect(Object.keys(ORE_MARK_CENTRES)).toEqual(["W01", "W02"]);
    for (const world of ["W01", "W02"])
      for (const tier of TIERS) {
        const { cx, cy, r } = oreMarkGeometry(tier, world);
        expect((2 * r) / 96).toBeLessThanOrEqual(0.18);
        // Inside the frame, with room for anti-aliasing.
        expect(cx + r).toBeLessThanOrEqual(94);
        expect(cy + r).toBeLessThanOrEqual(94);
        expect(oreBadge(tier, world)).not.toContain("stroke");
      }
    expect(lightness(board("ore_copper"))).toBeCloseTo(
      lightness(ORE_TONES[1].body),
      5,
    );
    expect(
      lightness(ORE_MARK_HC_FILL) - lightness(board("ore_copper")),
    ).toBeGreaterThanOrEqual(20);
  });
  it("drop the notches and tag squares in both worlds; W02 takes the mark at its centres", async () => {
    for (const tier of TIERS) {
      for (const [world, id] of [
        ["source", "W01"],
        ["w02", "W02"],
      ]) {
        const ore = await source(`${world}/ore-o${tier}.svg`);
        const pack = await source(`${world}/package-o${tier}.svg`);
        expect(ore).toContain(oreBadge(tier, id));
        expect(pack).toContain(oreBadge(tier, id));
        expect(await source(`${world}/tier-mark-hc-${tier}.svg`)).toContain(
          oreMarkHighContrast(tier, id),
        );
        // W01's cream notches, W02's pale notches, both tag squares.
        expect(ore + pack).not.toMatch(/#e6d8b8|#f0a43c|#F7C673/);
      }
      expect(await source(`w02/ore-o${tier}.svg`)).not.toContain(
        'y="89" width="6" height="3"',
      );
    }
  });
  it("keep every socket variant translucent, so a swap of the default stays safe", () => {
    for (const variant of Object.keys(SOCKET_VARIANTS)) {
      const v = SOCKET_VARIANTS[variant];
      // The fills (recess, core, contact shadow) stacked where they overlap:
      // the asset check's limit, alpha 160 of 255.
      expect(socketStackedAlpha(variant)).toBeLessThanOrEqual(160 / 255);
      // A faint lit lip (the board's rim is +2 to +4 L*) and thin cracks.
      expect(v.lip.opacity).toBeLessThanOrEqual(0.1);
      if (v.cracks) {
        expect(v.crack.opacity).toBeLessThanOrEqual(0.4);
        expect(v.crack.light).toBeLessThanOrEqual(0.1);
      }
      const drawing = depositSocket(variant);
      expect(drawing).toContain(`data-variant="${variant}"`);
      for (const [, opacity] of drawing.matchAll(
        /(?:fill|stroke)-opacity="([\d.]+)"/g,
      ))
        expect(Number(opacity)).toBeLessThanOrEqual(0.4);
    }
  });
  it("ship one socket variant out of three, as a decal that exports no icon", async () => {
    expect(Object.keys(SOCKET_VARIANTS)).toEqual([
      "shallow",
      "deep",
      "cracked",
    ]);
    expect(SOCKET_VARIANTS).toHaveProperty(SOCKET_VARIANT);
    const frames = JSON.parse(await source("source/frames.json")).frames;
    const names = frames.map((frame) => frame.name);
    for (const name of [
      "deposit-socket",
      ...TIERS.map((tier) => `tier-mark-hc-${tier}`),
    ]) {
      expect(names).toContain(name);
      const record = frames.find((frame) => frame.name === name);
      expect(record.width).toBe(96);
      expect(record.category).not.toBe("icon");
      expect(name).not.toMatch(/^(ore|package|mission)-|^relic$/);
    }
    // The existing frames keep their order.
    const ore = names.indexOf("ore-o1");
    expect(names.slice(ore, ore + 8)).toEqual(
      TIERS.flatMap((tier) => [`ore-o${tier}`, `package-o${tier}`]),
    );
    // W02 has its own high-contrast marks (no socket: it draws W01's).
    const w02 = JSON.parse(await source("w02/frames.json")).frames;
    for (const tier of TIERS) {
      const record = w02.find((frame) => frame.name === `tier-mark-hc-${tier}`);
      expect(record).toMatchObject({ width: 96, category: "overlay" });
    }
    expect(w02.map((frame) => frame.name)).not.toContain("deposit-socket");
  });
});
