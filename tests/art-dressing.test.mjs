import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import {
  dressingFrames,
  DRESSING_VARIANTS,
  DRESSING_DEFAULTS,
  CRYSTAL_TONES,
  CRYSTAL_HC_TONES,
} from "../assets/campaign/source/w01-dressing.mjs";
import {
  ROCK_ARCHETYPES,
  rockChunk,
} from "../assets/campaign/kit/rock-chunk.mjs";
import { RUST_ARCHETYPES, rustRun } from "../assets/campaign/kit/rust.mjs";
import { lab, board } from "../assets/campaign/kit/palette.mjs";
import { canonicalPng, decodePng } from "../scripts/png-canonical.mjs";
import {
  zoneOf,
  isHero,
  densitiesOf,
  zoneWorlds,
} from "../scripts/campaign-zones.mjs";

const source = (name) =>
  new URL(`../assets/campaign/source/${name}`, import.meta.url);
const render = (f, scale = 2) =>
  new Resvg(f.svg, {
    fitTo: { mode: "width", value: f.width * scale },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
const frames = dressingFrames();

describe("A7 seeded cave dressing", () => {
  it("delivers the complete families, distinct from HC and additive states", () => {
    const count = (pattern) =>
      frames.filter((f) => pattern.test(f.name)).length;
    expect(count(/^cave-stalactite-\d$/)).toBe(9);
    expect(count(/^cave-rust-drip-\d$/)).toBe(4);
    expect(count(/^cave-rust-particle-\d$/)).toBe(6);
    expect(count(/^cave-rubble-\d$/)).toBe(6);
    expect(count(/^cave-boulder-\d$/)).toBe(3);
    expect(count(/^cave-crystal-(floor|wall)-\d$/)).toBe(6);
    expect(count(/-hc$/)).toBe(6);
    expect(count(/-emissive$/)).toBe(12);
    expect(new Set(frames.map((f) => f.name)).size).toBe(52);
    expect(
      frames
        .filter((f) => f.family === "stalactite")
        .map((f) => [f.width, f.height]),
    ).toEqual([
      ...Array.from({ length: 6 }, () => [96, 96]),
      ...Array.from({ length: 3 }, () => [192, 116]),
    ]);
  });

  it("rebuilds every SVG and generated @4 raster master byte identically", () => {
    const manifest = JSON.parse(readFileSync(source("frames.json"), "utf8"));
    for (const f of frames) {
      expect(readFileSync(source(`${f.name}.svg`), "utf8"), f.name).toBe(
        f.svg + "\n",
      );
      const bytes = readFileSync(source(`${f.name}.png`));
      expect(Buffer.compare(bytes, canonicalPng(render(f))), f.name).toBe(0);
      const png = decodePng(bytes);
      expect([png.width, png.height], f.name).toEqual([
        f.width * 2,
        f.height * 2,
      ]);
      const { svg, body, ...record } = f;
      expect(
        manifest.frames.find((x) => x.name === f.name),
        f.name,
      ).toEqual(record);
    }
  }, 30000);

  it("keeps every family on W01 cave pages and its sparkle with the base", () => {
    for (const f of frames) {
      expect(zoneOf(f.name), f.name).toBe("cave");
      expect(isHero(f.name), f.name).toBe(false);
      expect(densitiesOf(f), f.name).toEqual([2, 3]);
      expect(f.source).toBe("raster");
      if (f.name.endsWith("-emissive")) {
        const base = frames.find((x) => x.name === f.name.slice(0, -9));
        expect([f.width, f.height, f.anchor], f.name).toEqual([
          base.width,
          base.height,
          base.anchor,
        ]);
      }
    }
    expect(
      zoneWorlds(
        "W01",
        "cave",
        frames.map((f) => f.name),
      ),
    ).toEqual(["W01"]);
  });

  it("publishes a narrow runtime catalog from the generated frame metadata", () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL(
          "../assets/campaign/generated/w01-dressing.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(catalog).toEqual({
      version: 1,
      logicalTile: 48,
      frames: frames.map((f) =>
        JSON.parse(
          JSON.stringify({
            name: f.name,
            width: f.width,
            height: f.height,
            logicalWidth: f.logicalWidth,
            logicalHeight: f.logicalHeight,
            anchor: f.anchor ?? "particle",
            baseline: f.baseline,
            family: f.family,
            highContrast: f.highContrast,
            phase: f.phase,
          }),
        ),
      ),
    });
    expect(JSON.stringify(catalog)).not.toMatch(
      /<svg|data-zone|source|variant/,
    );
  });

  it("keeps all three authored variants selectable and seeded", () => {
    expect(Object.keys(ROCK_ARCHETYPES)).toEqual(DRESSING_VARIANTS);
    expect(Object.keys(RUST_ARCHETYPES)).toEqual(DRESSING_VARIANTS);
    for (const family of Object.keys(DRESSING_DEFAULTS)) {
      const sets = DRESSING_VARIANTS.map((variant) =>
        dressingFrames({ variants: { [family]: variant } })
          .filter((f) => f.family === family)
          .map((f) => f.svg)
          .join(""),
      );
      expect(new Set(sets).size, family).toBe(3);
    }
    expect(dressingFrames({ seed: "first" })).toEqual(
      dressingFrames({ seed: "first" }),
    );
    expect(dressingFrames({ seed: "first" }).map((f) => f.svg)).not.toEqual(
      dressingFrames({ seed: "second" }).map((f) => f.svg),
    );
    expect(() => dressingFrames({ variants: { rubble: "noise" } })).toThrow(
      /Unknown dressing/,
    );
    expect(rockChunk({ seed: "r" })).toBe(rockChunk({ seed: "r" }));
    expect(rustRun({ seed: "r" })).toBe(rustRun({ seed: "r" }));
  });

  it("uses flat material tiers and a cool HC value separated from copper", () => {
    expect(CRYSTAL_TONES.body).toBe("#bd8df6");
    const copper = lab(board("ore_copper"))[0];
    expect(lab(CRYSTAL_HC_TONES.body)[0]).toBeCloseTo(42, 0);
    expect(copper - lab(CRYSTAL_HC_TONES.light)[0]).toBeGreaterThan(14);
    for (const f of frames.filter((f) => !f.name.endsWith("-emissive"))) {
      expect(f.svg, f.name).not.toMatch(
        /linearGradient|radialGradient|filter|feTurbulence/,
      );
      expect(f.svg, f.name).toContain("data-zone=");
      const fills = [...f.svg.matchAll(/fill="(#[0-9a-f]{6})"/g)]
        .map((m) => m[1])
        .filter((c) => c !== "#14232b");
      const tiers = [...new Set(fills)]
        .map((c) => lab(c)[0])
        .sort((a, b) => a - b);
      const distinct = tiers.filter((v, i) => !i || v - tiers[i - 1] > 3);
      expect(distinct.length, f.name).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps three authored facets visible after rasterization in every variant", () => {
    for (const variant of DRESSING_VARIANTS) {
      const variants = Object.fromEntries(
        Object.keys(DRESSING_DEFAULTS).map((family) => [family, variant]),
      );
      for (const f of dressingFrames({ variants }).filter(
        (f) => !f.name.endsWith("-emissive"),
      )) {
        const fills = new Set(
          [...f.svg.matchAll(/fill="(#[0-9a-f]{6})"/g)]
            .map((m) => m[1])
            .filter((c) => c !== "#14232b")
            .map((c) => Number.parseInt(c.slice(1), 16)),
        );
        const image = decodePng(render(f));
        const colour = (x, y) => {
          const i = (y * image.width + x) * 4;
          return image.data[i + 3] === 255
            ? (image.data[i] << 16) |
                (image.data[i + 1] << 8) |
                image.data[i + 2]
            : -1;
        };
        const counts = new Map([...fills].map((c) => [c, 0]));
        for (let y = 1; y < image.height - 1; y++) {
          for (let x = 1; x < image.width - 1; x++) {
            const c = colour(x, y);
            if (!fills.has(c)) continue;
            let flat = true;
            for (let dy = -1; dy <= 1 && flat; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if (colour(x + dx, y + dy) !== c) flat = false;
            if (flat) counts.set(c, counts.get(c) + 1);
          }
        }
        // A thin edge or an anti-aliased pixel cannot make a shading tier.
        for (const [c, count] of counts)
          expect(
            count,
            `${variant}/${f.name} #${c.toString(16)} flat @4 pixels`,
          ).toBeGreaterThanOrEqual(8);
      }
    }
  }, 30000);

  it("keeps sparkles inside the base and HC additive light at zero", () => {
    for (const f of frames.filter((f) => f.name.endsWith("-emissive"))) {
      const glow = decodePng(render(f)),
        base = decodePng(
          render(frames.find((b) => b.name === f.name.slice(0, -9))),
        );
      let lit = 0,
        energy = 0;
      for (let i = 3; i < glow.data.length; i += 4) {
        if (!glow.data[i]) continue;
        lit++;
        energy += glow.data[i - 3] + glow.data[i - 2] + glow.data[i - 1];
        expect(
          base.data[i],
          `${f.name} sparkle outside base at pixel ${(i - 3) / 4}`,
        ).toBeGreaterThan(0);
      }
      expect(lit, f.name).toBeGreaterThan(0);
      expect(energy > 0, f.name).toBe(!f.highContrast);
    }
  });
});
