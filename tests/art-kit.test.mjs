import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { random } from "../assets/campaign/kit/random.mjs";
import {
  band,
  board,
  fromLab,
  lab,
  lightness,
  withL,
} from "../assets/campaign/kit/palette.mjs";
import { num, svgDocument } from "../assets/campaign/kit/svg.mjs";
import { emissiveOf, emissivePair } from "../assets/campaign/kit/emissive.mjs";
import {
  provenanceRecord,
  upsertFrames,
} from "../assets/campaign/kit/records.mjs";
import {
  W01_RIDGE_LAYERS,
  ridges,
  skyBody,
  w01RidgeLayout,
} from "../assets/campaign/phase0-sources.mjs";

const source = (path) =>
  readFile(new URL(`../assets/campaign/${path}`, import.meta.url), "utf8");

describe("art kit: seeded random source", () => {
  it("repeats a stream for a seed and keeps forks independent", () => {
    const a = random("seed"),
      b = random("seed");
    expect([a.next(), a.next(), a.next()]).toEqual([
      b.next(),
      b.next(),
      b.next(),
    ]);
    const quiet = random("seed").fork("peaks").next();
    const busy = random("seed");
    busy.next();
    busy.next();
    expect(busy.fork("peaks").next()).toBe(quiet);
    expect(random("other").next()).not.toBe(random("seed").next());
  });
});

describe("art kit: palette tokens", () => {
  it("reads the swatch cards and the board samples", () => {
    expect(band("A").unknown).toBe("#303941");
    expect(board("planet_crescent")).toBe("#d79a61");
    // art_metrics.py lab(): the board's lit ridge face reads L* 41.5.
    expect(lightness("#586468")).toBe(41.5);
  });
  it("round-trips Lab and moves lightness only", () => {
    for (const hex of ["#586468", "#2a3d48", "#d79a61", "#112631"])
      expect(fromLab(lab(hex))).toBe(hex);
    const darker = withL("#586468", 32);
    expect(Math.abs(lab(darker)[0] - 32)).toBeLessThan(0.5);
  });
});

describe("art kit: SVG writing", () => {
  it("formats numbers one way", () => {
    expect(num(1.005)).toBe("1");
    expect(num(2.3456)).toBe("2.35");
    expect(num(-0.001)).toBe("0");
  });
  it("wraps a body as create-w01-sources.mjs does", () => {
    expect(svgDocument(4, 2, "<g/>", "t")).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2"><title>t</title><g stroke-linecap="round" stroke-linejoin="round"><g/></g></svg>',
    );
  });
});

describe("art kit: -emissive siblings", () => {
  it("draws lit parts unlit in the base and lit in the sibling", () => {
    const [base, glow] = emissivePair({
      name: "lamp",
      width: 96,
      height: 96,
      layers: [
        { name: "post", body: "<rect/>" },
        {
          name: "head",
          unlit: '<circle fill="#555"/>',
          lit: '<circle fill="#fcb032"/>',
        },
      ],
    });
    expect(base.body).toContain("#555");
    expect(base.body).not.toContain("#fcb032");
    expect(glow.name).toBe("lamp-emissive");
    expect(glow.body).toContain("#fcb032");
    expect(glow.body).not.toContain("<rect/>");
    expect(emissiveOf("lamp-emissive")).toBe("lamp");
    expect(emissiveOf("lamp")).toBeNull();
    expect(
      emissivePair({
        name: "crate",
        width: 1,
        height: 1,
        layers: [{ name: "box", body: "<rect/>" }],
      }),
    ).toHaveLength(1);
  });
});

describe("art kit: frames.json and provenance writers", () => {
  const fields = {
    asset: 1,
    item: "A2",
    method: "layered SVG",
    source: "assets/campaign/source/dock-stage-0.svg",
    reference: "board",
    reviewer: "director",
    redrawnShare: 1,
    underlays: [],
    boardPixelsCopied: false,
  };
  it("checks a provenance record and orders its keys", () => {
    expect(Object.keys(provenanceRecord({ extra: 1, ...fields }))).toEqual([
      ...Object.keys(fields),
      "extra",
    ]);
    expect(() =>
      provenanceRecord({ ...fields, boardPixelsCopied: true }),
    ).toThrow();
    expect(() => provenanceRecord({ ...fields, redrawnShare: 2 })).toThrow();
    expect(() =>
      provenanceRecord({
        ...fields,
        underlays: [{ tool: "Figma", prompt: "lander" }],
      }),
    ).toThrow();
    const { reviewer, ...missing } = fields;
    void reviewer;
    expect(() => provenanceRecord(missing)).toThrow();
  });
  it("replaces frames by name and appends new ones", async () => {
    const folder = await mkdtemp(join(tmpdir(), "art-kit-"));
    const file = join(folder, "frames.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        frames: [
          { name: "a", width: 1 },
          { name: "b", width: 1 },
        ],
        backgrounds: [],
      }),
    );
    const manifest = await upsertFrames(file, {
      frames: [
        { name: "a", width: 2 },
        { name: "c", width: 3 },
      ],
      backgrounds: [{ name: "sky", width: 4 }],
    });
    expect(manifest.frames.map((f) => [f.name, f.width])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 3],
    ]);
    expect(manifest.version).toBe(1);
    expect(JSON.parse(await readFile(file, "utf8")).backgrounds).toEqual([
      { name: "sky", width: 4 },
    ]);
    await rm(folder, { recursive: true });
  });
});

describe("A4: W01 ridges and sky body", () => {
  it("rebuild the committed sources byte for byte", async () => {
    for (const which of ["far", "mid", "near"])
      expect(await source(`source/w01-ridge-${which}.svg`)).toContain(
        ridges(which),
      );
    expect(await source("source/sky-body.svg")).toContain(skyBody());
  });
  it("leave the W02 drawings unchanged", async () => {
    expect(await source("w02/w02-ridge-far.svg")).toContain(
      ridges(false, true),
    );
    expect(await source("w02/w02-ridge-near.svg")).toContain(
      ridges(true, true),
    );
    expect(await source("w02/sky-body.svg")).toContain(skyBody(true));
  });
  it("keep every shape under the seam col, so the page's edge columns match", () => {
    for (const which of Object.keys(W01_RIDGE_LAYERS)) {
      const { ground, colTop, back, front } = w01RidgeLayout(which);
      const col = ground - colTop;
      for (const shape of [...back, ...front]) {
        const flat = shape.top ? shape.top / 2 : 0;
        const left = shape.h - Math.max(0, shape.x - 12 - flat) / shape.runL;
        const right =
          shape.h - Math.max(0, 1024 - 12 - shape.x - flat) / shape.runR;
        expect(Math.max(left, right)).toBeLessThan(col);
      }
    }
  });
  it("stand the tallest mid peak at the board's height, near 31 % of its frame", () => {
    const { back } = w01RidgeLayout("mid");
    const tallest = Math.max(...back.map((shape) => shape.h)) / 96;
    expect(tallest).toBeCloseTo(2.65, 5);
    // 2.65 tiles at the board's 44.1 px a tile, in its 358 px frame.
    expect((tallest * 693) / 15.7 / 358).toBeGreaterThan(0.3);
  });
});
