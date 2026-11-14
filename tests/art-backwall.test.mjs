import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import {
  backwallFrames,
  BACKWALL_VARIANTS,
  BACKWALL_BASE,
  BACKWALL_TONES,
} from "../assets/campaign/source/w01-backwall.mjs";
import { canonicalPng, decodePng } from "../scripts/png-canonical.mjs";
import {
  frameRasterScale,
  rasterizeCampaignSources,
} from "../scripts/rasterize-campaign-svgs.mjs";
import { zoneOf, densitiesOf } from "../scripts/campaign-zones.mjs";
import { lab } from "../assets/campaign/kit/palette.mjs";

const source = new URL("../assets/campaign/source/", import.meta.url);
const render = (f) =>
  new Resvg(f.svg, { font: { loadSystemFonts: false } }).render().asPng();
const rgba = (f) => decodePng(render(f));
const frames = backwallFrames();

describe("A8 native-density periodic back walls", () => {
  it("regenerates the two native @2 source frames exactly", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("frames.json", source), "utf8"),
    );
    expect(frames.map((f) => f.name)).toEqual([
      "cave-backwall-far",
      "cave-backwall-near",
    ]);
    for (const f of frames) {
      expect([
        f.width,
        f.height,
        f.logicalWidth,
        f.logicalHeight,
        f.maxDensity,
      ]).toEqual([1024, 384, 512, 192, 2]);
      expect([f.verticalRepeat, f.periodY]).toEqual(["mirror", 384]);
      expect(readFileSync(new URL(`${f.name}.svg`, source), "utf8")).toBe(
        f.svg + "\n",
      );
      expect(
        Buffer.compare(
          readFileSync(new URL(`${f.name}.png`, source)),
          canonicalPng(render(f)),
        ),
      ).toBe(0);
      const { body, svg, ...record } = f;
      expect(manifest.frames.find((x) => x.name === f.name)).toEqual(record);
    }
  });

  it("keeps three selectable hand-drawn shapes with seed-stable silhouettes", () => {
    const sets = BACKWALL_VARIANTS.map((variant) =>
      backwallFrames({ variant }),
    );
    expect(
      new Set(sets.map((set) => set.map((f) => f.svg).join(""))).size,
    ).toBe(3);
    expect(backwallFrames({ seed: "a" })).toEqual(
      backwallFrames({ seed: "a" }),
    );
    expect(backwallFrames({ seed: "a" })).not.toEqual(
      backwallFrames({ seed: "b" }),
    );
    expect(() => backwallFrames({ variant: "noise" })).toThrow(
      /Unknown back-wall/,
    );
    const first = backwallFrames({ seed: "a" }).map(rgba),
      second = backwallFrames({ seed: "b" }).map(rgba);
    for (let n = 0; n < 2; n++) {
      const a = Buffer.from(first[n].data.filter((_, i) => i % 4 === 3)),
        b = Buffer.from(second[n].data.filter((_, i) => i % 4 === 3));
      expect(Buffer.compare(a, b), `seed changed alpha ${n}`).toBe(0);
    }
  });

  it("has seamless edges and distinct layer silhouettes in every variant", () => {
    for (const variant of BACKWALL_VARIANTS) {
      const images = backwallFrames({ variant }).map(rgba);
      for (const image of images)
        for (let y = 0; y < image.height; y++)
          for (let c = 0; c < 4; c++)
            expect(
              image.data[y * image.width * 4 + c],
              `${variant} edge ${y}/${c}`,
            ).toBe(image.data[(y * image.width + image.width - 1) * 4 + c]);
      let intersection = 0,
        union = 0;
      for (let i = 3; i < images[0].data.length; i += 4) {
        const a = images[0].data[i] > 127,
          b = images[1].data[i] > 127;
        if (a && b) intersection++;
        if (a || b) union++;
      }
      expect(
        intersection / union,
        `${variant} far/near IoU`,
      ).toBeLessThanOrEqual(0.7);
    }
  });

  it("provides flat collars for seamless mirrored vertical world repeats", () => {
    for (const variant of BACKWALL_VARIANTS) {
      for (const frame of backwallFrames({ variant })) {
        const image = rgba(frame),
          stride = image.width * 4;
        const row = (y) => image.data.subarray(y * stride, (y + 1) * stride);
        // Alternating flipY means bottom/bottom then top/top at each join.
        // Four flat source rows keep both colour and derivative continuous.
        for (let offset = 1; offset <= 4; offset++) {
          expect(
            Buffer.compare(row(0), row(offset)),
            `${variant}/${frame.layer} top collar`,
          ).toBe(0);
          expect(
            Buffer.compare(
              row(image.height - 1),
              row(image.height - 1 - offset),
            ),
            `${variant}/${frame.layer} bottom collar`,
          ).toBe(0);
        }
      }
    }
  });

  it("uses three visible cool flat tiers without outlines or gradients", () => {
    for (const tones of Object.values(BACKWALL_TONES)) {
      const levels = Object.values(tones)
        .map((c) => lab(c)[0])
        .sort((a, b) => a - b);
      expect(levels[1] - levels[0]).toBeGreaterThan(3);
      expect(levels[2] - levels[1]).toBeGreaterThan(3);
    }
    for (const variant of BACKWALL_VARIANTS)
      for (const f of backwallFrames({ variant })) {
        expect(f.svg).not.toMatch(/stroke=|Gradient|filter|feTurbulence/);
        const image = rgba(f),
          fills = Object.values(BACKWALL_TONES[f.layer]);
        for (const fill of fills) {
          const rgb = [1, 3, 5].map((i) =>
            Number.parseInt(fill.slice(i, i + 2), 16),
          );
          expect(rgb[2]).toBeGreaterThan(rgb[1]);
          expect(rgb[1]).toBeGreaterThan(rgb[0]);
          let flat = 0;
          for (let y = 1; y < image.height - 1; y++)
            for (let x = 1; x < image.width - 1; x++) {
              let same = true;
              for (let dy = -1; dy <= 1 && same; dy++)
                for (let dx = -1; dx <= 1 && same; dx++) {
                  const i = ((y + dy) * image.width + x + dx) * 4;
                  same =
                    image.data[i + 3] === 255 &&
                    rgb.every((v, c) => image.data[i + c] === v);
                }
              if (same) flat++;
            }
          expect(flat, `${variant}/${f.layer}/${fill}`).toBeGreaterThanOrEqual(
            8,
          );
        }
      }
  }, 30000);

  it("retains native @2 pixels in both cave page density groups", async () => {
    for (const f of frames) {
      expect(zoneOf(f.name)).toBe("cave");
      expect(densitiesOf(f)).toEqual([2, 3]);
      expect(frameRasterScale(f, 1)).toBe(1);
      expect(frameRasterScale(f, 1.5)).toBe(1);
    }
    expect(() =>
      frameRasterScale({ ...frames[0], maxDensity: 1 }, 1.5),
    ).toThrow(/density cap/);
    expect(() =>
      frameRasterScale({ ...frames[0], source: "svg" }, 1.5),
    ).toThrow(/density cap/);
    const temp = await mkdtemp(join(tmpdir(), "a8-native-"));
    try {
      const a = pathToFileURL(`${temp}/2/`),
        b = pathToFileURL(`${temp}/3/`);
      await mkdir(a);
      await mkdir(b);
      await rasterizeCampaignSources(source, a, { frames, backgrounds: [] }, 1);
      await rasterizeCampaignSources(
        source,
        b,
        { frames, backgrounds: [] },
        1.5,
      );
      for (const f of frames) {
        const one = readFileSync(new URL(`${f.name}.png`, a)),
          two = readFileSync(new URL(`${f.name}.png`, b));
        expect(Buffer.compare(one, two)).toBe(0);
        const image = decodePng(two);
        expect([image.width, image.height]).toEqual([1024, 384]);
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30000);

  it("packs strips with dressing on one cave page at each runtime density", () => {
    const generated = new URL("../assets/campaign/generated/", import.meta.url);
    const manifest = JSON.parse(
      readFileSync(new URL("w01-zones.json", generated), "utf8"),
    );
    for (const density of [2, 3]) {
      const pages = manifest.pages.filter(
        (p) => p.zone === "cave" && p.density === density,
      );
      expect(pages).toHaveLength(1);
      expect(pages[0].bytes).toBeLessThanOrEqual(6 * 2 ** 20);
      const atlas = JSON.parse(
        readFileSync(new URL(pages[0].data, generated), "utf8"),
      );
      for (const f of frames) {
        expect(pages[0].frames).toContain(f.name);
        const packed = atlas.frames[f.name];
        expect(packed.sourceSize).toEqual({ w: 1024, h: 384 });
        expect(packed.logicalSize).toEqual({ w: 512, h: 192 });
        expect(packed.maxDensity).toBe(2);
      }
    }
  });

  it("keeps the default art composite within the back-wall luma range", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="384"><rect width="1024" height="384" fill="${BACKWALL_BASE}"/>${frames.map((f) => f.body).join("")}</svg>`;
    const p = decodePng(new Resvg(svg).render().asPng());
    let sum = 0,
      squares = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      const l =
        p.data[i] * 0.2126 + p.data[i + 1] * 0.7152 + p.data[i + 2] * 0.0722;
      sum += l;
      squares += l * l;
    }
    const mean = sum / (p.width * p.height),
      sd = Math.sqrt(squares / (p.width * p.height) - mean * mean);
    expect(mean).toBeGreaterThanOrEqual(28);
    expect(mean).toBeLessThanOrEqual(42);
    expect(sd).toBeGreaterThanOrEqual(4);
  });
});
