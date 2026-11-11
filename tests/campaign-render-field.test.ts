import { describe, expect, it } from "vitest";
import card from "../scripts/swatch-cards.py?raw";
import { WORLD_CATALOG } from "../src/campaign/config";
import {
  CODE,
  FIELD_K,
  FIELD_MAX_HEIGHT,
  FIELD_PAD,
  FIELD_TOP,
  FIELD_UPLOAD_MAX,
  FieldData,
  fieldRingRows,
  type KnownWorldView,
} from "../src/campaign/render/field/field-data";
import {
  fieldRequest,
  fieldTextureLimit,
} from "../src/campaign/render/field/flag";
import {
  TerrainTierPolicy,
  bootTier,
  coordinateStepPixels,
  softwareRasteriser,
} from "../src/campaign/render/field/tier";
import {
  DIG_SECONDS,
  FieldTransitions,
  REVEAL_SECONDS,
} from "../src/campaign/render/field/transitions";
import { DiscoveredWorldView } from "../src/campaign/render/field/known-world";
import {
  FIELD_PALETTES,
  hexToVec3,
} from "../src/campaign/render/field/palette";
import {
  FIELD_COURSES,
  FIELD_FRAGMENT,
  FIELD_SHAPE,
  FIELD_TAPS,
  FIELD_WORLEY_SEEDS,
} from "../src/campaign/render/field/shader";
import type { CampaignWorld } from "../src/campaign/types";
import { createWorld } from "../src/campaign/world";
import swatches from "../docs/art-direction/swatches/w01-swatches.json";

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** A W01 world with a dug shaft and a known pocket around it. */
function sample(seed = 7) {
  const world = createWorld("W01", seed, 2);
  world.discovered.fill(0);
  for (let y = 0; y < 12; y++) {
    world.tiles[y * world.width + 20] = 0;
    for (let x = 17; x <= 23; x++) world.discovered[y * world.width + x] = 1;
  }
  return world;
}
const view = (world: CampaignWorld) =>
  new DiscoveredWorldView(world, createWorld("W01", world.seed, 2).tiles);

describe("T2 field texture", () => {
  it("never reads hidden geology: scrambled unknown cells give identical texels", () => {
    const world = sample();
    const scrambled = structuredClone(world);
    let state = 12345;
    for (let i = 0; i < scrambled.tiles.length; i++)
      if (scrambled.discovered[i] !== 1) {
        state = (state * 1103515245 + 12345) % 2 ** 31;
        scrambled.tiles[i] = state % 5;
      }
    const a = new FieldData(world.width, world.rows),
      b = new FieldData(world.width, world.rows);
    a.load(view(world));
    b.load(view(scrambled));
    expect(same(a.pixels, b.pixels)).toBe(true);
  });

  it("reads unknown cells as solid with the unknown code", () => {
    const world = sample();
    const known = view(world);
    // Row 30 is undiscovered everywhere.
    expect(known.code(5, 30)).toBe(CODE.unknown);
    expect(known.natural(5, 30)).toBe(false);
    const data = new FieldData(world.width, world.rows);
    data.load(known);
    const texel = (x: number, y: number) =>
      ((y + FIELD_TOP) * FIELD_K + 8) * data.texWidth +
      x * FIELD_K +
      8 +
      FIELD_PAD;
    expect(data.pixels[texel(5, 30) * 4]).toBe(255); // solid
    expect(data.pixels[texel(5, 30) * 4 + 3]).toBe(CODE.unknown);
    // The dug shaft is known, sharp, dug air.
    expect(data.pixels[texel(20, 5) * 4]).toBe(0);
    expect(data.pixels[texel(20, 5) * 4 + 2]).toBe(255);
    expect(data.pixels[texel(20, 5) * 4 + 3]).toBe(CODE.air);
  });

  it("repeats the far side in the pad columns, so x = 0 has no seam", () => {
    const world = sample();
    world.discovered.fill(1);
    const data = new FieldData(world.width, world.rows);
    data.load(view(world));
    const W = world.width * FIELD_K;
    for (let y = 0; y < data.texHeight; y += 7)
      for (let p = 0; p < FIELD_PAD; p++) {
        const row = y * data.texWidth * 4;
        expect(data.pixels[row + p * 4]).toBe(data.pixels[row + (W + p) * 4]);
        expect(data.pixels[row + (W + FIELD_PAD + p) * 4]).toBe(
          data.pixels[row + (FIELD_PAD + p) * 4],
        );
      }
  });

  it("patches a dig with one upload of at most 160 × 160 texels, matching a full rebuild", () => {
    const world = sample();
    const data = new FieldData(world.width, world.rows);
    data.load(view(world));
    expect(data.nextPatch()).toBeUndefined();
    // Dig one cell beside the shaft: it was known soil.
    world.tiles[10 * world.width + 21] = 0;
    expect(data.sync(view(world))).toBe(1);
    const patch = data.nextPatch({ x: 21, y: 10 })!;
    expect(patch.width).toBeLessThanOrEqual(FIELD_UPLOAD_MAX);
    expect(patch.height).toBeLessThanOrEqual(FIELD_UPLOAD_MAX);
    expect(data.pending).toBe(0);
    const fresh = new FieldData(world.width, world.rows);
    fresh.load(view(world));
    expect(same(data.pixels, fresh.pixels)).toBe(true);
  });

  it("splits a large reveal into several patches, each within the limit", () => {
    const world = sample();
    const data = new FieldData(world.width, world.rows);
    data.load(view(world));
    for (let y = 20; y < 40; y++)
      for (let x = 0; x < world.width; x++)
        world.discovered[y * world.width + x] = 1;
    data.sync(view(world));
    let patches = 0;
    for (let patch = data.nextPatch(); patch; patch = data.nextPatch()) {
      expect(patch.width * patch.height).toBeLessThanOrEqual(
        FIELD_UPLOAD_MAX ** 2,
      );
      patches++;
    }
    expect(patches).toBeGreaterThan(1);
    const fresh = new FieldData(world.width, world.rows);
    fresh.load(view(world));
    expect(same(data.pixels, fresh.pixels)).toBe(true);
  });

  it("treats known air as natural only where the pristine world had air", () => {
    const world = sample();
    const pristine = createWorld("W01", world.seed, 2).tiles;
    const known: KnownWorldView = new DiscoveredWorldView(world, pristine);
    for (let y = 0; y < 12; y++) {
      const i = y * world.width + 20;
      expect(known.natural(20, y)).toBe(pristine[i] === 0);
    }
  });
});

describe("T2 field patches (D4 condition 2)", () => {
  const texel = (data: FieldData, x: number, y: number) =>
    ((y + FIELD_TOP) * FIELD_K + 8) * data.texWidth +
    x * FIELD_K +
    8 +
    FIELD_PAD;

  it("rewrites only the cell when a reveal leaves the blur alone", () => {
    const world = sample();
    const data = new FieldData(world.width, world.rows);
    data.load(view(world));
    // Unknown soil becomes known soil: solid before and after, soft both.
    const pristine = createWorld("W01", world.seed, 2).tiles;
    let cell = -1;
    for (let x = 24; x < world.width && cell < 0; x++)
      if (pristine[5 * world.width + x] === 1) cell = x;
    expect(cell).toBeGreaterThan(0);
    world.discovered[5 * world.width + cell] = 1;
    expect(data.sync(view(world))).toBe(1);
    expect(data.changedBlur).toBe(0);
    const patch = data.nextPatch({ x: cell, y: 5 })!;
    // One cell's texels, on the 16-texel group grid (the pad shifts cells
    // by 4 texels, so a cell spans two groups).
    expect(patch.width).toBeLessThanOrEqual(2 * FIELD_K);
    expect(patch.height).toBe(FIELD_K);
    expect(data.pixels[texel(data, cell, 5) * 4 + 3]).toBe(CODE.soil);
    const fresh = new FieldData(world.width, world.rows);
    fresh.load(view(world));
    expect(same(data.pixels, fresh.pixels)).toBe(true);
  });

  it("recomputes the reach when a dig moves the blur", () => {
    const world = sample();
    const data = new FieldData(world.width, world.rows);
    data.load(view(world));
    world.tiles[10 * world.width + 21] = 0;
    data.sync(view(world));
    expect(data.changedBlur).toBe(1);
    const patch = data.nextPatch({ x: 21, y: 10 })!;
    expect(patch.height).toBe(5 * FIELD_K);
  });

  it("carries a transition slot in the A byte and settles it without a blur", () => {
    const world = sample();
    const data = new FieldData(world.width, world.rows);
    data.load(view(world));
    world.tiles[10 * world.width + 21] = 0;
    const asked: string[] = [];
    data.sync(view(world), (kind) => {
      asked.push(kind);
      return kind === "dig" ? 3 : 4;
    });
    expect(asked).toEqual(["dig"]);
    while (data.nextPatch());
    expect(data.pixels[texel(data, 21, 10) * 4 + 3]).toBe(CODE.air + 16 * 3);
    expect(data.slotCount(3)).toBe(1);
    data.settle(3);
    expect(data.slotCount(3)).toBe(0);
    const patch = data.nextPatch()!;
    expect(patch.height).toBe(FIELD_K);
    expect(data.pixels[texel(data, 21, 10) * 4 + 3]).toBe(CODE.air);
    const fresh = new FieldData(world.width, world.rows);
    fresh.load(view(world));
    expect(same(data.pixels, fresh.pixels)).toBe(true);
  });
});

describe("T2 field ring (worlds taller than one texture)", () => {
  /** The texel of virtual texel row vy and texture column x, in either layout. */
  const at = (data: FieldData, x: number, vy: number) =>
    ((data.padY + (vy % (data.ringRows * FIELD_K))) * data.texWidth + x) * 4;

  it("holds a window of rows that matches the whole texture, texel for texel", () => {
    const world = sample();
    world.discovered.fill(1);
    const whole = new FieldData(world.width, world.rows);
    whole.load(view(world));
    expect(whole.ring).toBe(false);
    // 400 texels: 24 cell rows of the 63 virtual rows.
    const ring = new FieldData(world.width, world.rows, 400);
    expect(ring.ring).toBe(true);
    expect(ring.ringRows).toBe(24);
    expect(ring.texHeight).toBe(24 * FIELD_K + 2);
    ring.load(view(world), 30);
    const compare = () => {
      for (let v = ring.window; v < ring.window + ring.ringRows; v++)
        for (let row = 0; row < FIELD_K; row++)
          for (let x = 0; x < ring.texWidth; x += 3) {
            const a = at(ring, x, v * FIELD_K + row),
              b = at(whole, x, v * FIELD_K + row);
            for (let c = 0; c < 4; c++)
              if (ring.pixels[a + c] !== whole.pixels[b + c])
                throw new Error(`row ${v} texel ${x},${row} channel ${c}`);
          }
    };
    compare();
    // The camera moves down: rows enter, patch by patch, within the limit.
    ring.setWindow(40, 55, 8);
    expect(ring.pending).toBeGreaterThan(0);
    for (
      let patch = ring.nextPatch({ x: 20, y: 45 });
      patch;
      patch = ring.nextPatch({ x: 20, y: 45 })
    )
      expect(patch.width * patch.height).toBeLessThanOrEqual(
        FIELD_UPLOAD_MAX ** 2,
      );
    compare();
    // A still camera inside the window marks nothing.
    ring.setWindow(41, 56, 8);
    expect(ring.pending).toBe(0);
    // A dig inside the window patches the ring as it does the whole texture.
    world.tiles[45 * world.width + 12] = 0;
    world.tiles[46 * world.width + 12] = 0;
    ring.sync(view(world));
    whole.sync(view(world));
    while (ring.nextPatch());
    while (whole.nextPatch());
    compare();
  });

  it("repeats the far texel row above and below the ring", () => {
    const world = sample();
    world.discovered.fill(1);
    const ring = new FieldData(world.width, world.rows, 400);
    ring.load(view(world), 30);
    const row = (y: number) =>
      ring.pixels.slice(y * ring.texWidth * 4, (y + 1) * ring.texWidth * 4);
    expect(same(row(0), row(ring.texHeight - 2))).toBe(true);
    expect(same(row(ring.texHeight - 1), row(1))).toBe(true);
    ring.setWindow(40, 55, 8);
    while (ring.nextPatch());
    expect(same(row(0), row(ring.texHeight - 2))).toBe(true);
    expect(same(row(ring.texHeight - 1), row(1))).toBe(true);
  });
});

describe("T2 field texture size per world (audit §7)", () => {
  it("holds W01 to W03 whole and deeper worlds as a ring of 63 rows, under 6 MiB", () => {
    const sizes = Object.fromEntries(
      WORLD_CATALOG.map((world) => {
        const ring = fieldRingRows(world.rows, FIELD_MAX_HEIGHT),
          rows = ring || world.rows + 3,
          height = rows * FIELD_K + (ring ? 2 : 0),
          width = world.width * FIELD_K + 2 * FIELD_PAD;
        expect(height).toBeLessThanOrEqual(FIELD_MAX_HEIGHT);
        expect(width).toBeLessThanOrEqual(2048);
        expect(width * height * 4).toBeLessThanOrEqual(6 * 2 ** 20);
        return [world.id, { ring, width, height }];
      }),
    );
    expect(sizes.W01).toEqual({ ring: 0, width: 648, height: 1008 });
    expect(sizes.W02).toEqual({ ring: 0, width: 776, height: 1648 });
    expect(sizes.W03.ring).toBe(0);
    // 600 rows whole would be 9,648 texels tall: 28.6 MiB.
    expect(sizes.W04).toEqual({ ring: 63, width: 776, height: 1010 });
    for (const world of WORLD_CATALOG)
      if (world.rows > 125) expect(sizes[world.id].ring).toBe(63);
    // The class agrees with the helper, and a debug limit under the ring's
    // height still applies.
    const deep = new FieldData(48, 600, FIELD_MAX_HEIGHT);
    expect([deep.ring, deep.ringRows, deep.texHeight]).toEqual([
      true,
      63,
      1010,
    ]);
    expect(fieldRingRows(60, 512)).toBe(31);
  });
});

describe("T2 transitions (audit §9.3)", () => {
  it("fades a reveal over 250 ms and eases a dig over 120 ms", () => {
    const transitions = new FieldTransitions();
    const reveal = transitions.open("reveal", 10),
      dig = transitions.open("dig", 10);
    expect(reveal).toBeGreaterThan(0);
    expect(dig).not.toBe(reveal);
    const values = new Float32Array(16);
    transitions.values(10, values);
    expect(values[0]).toBe(1);
    expect(values[reveal]).toBe(0);
    expect(values[dig]).toBe(2); // a dig slot: 2 + progress
    transitions.values(10 + REVEAL_SECONDS / 2, values);
    expect(values[reveal]).toBeCloseTo(0.5, 5);
    transitions.values(10 + DIG_SECONDS / 2, values);
    expect(values[dig]! - 2).toBeGreaterThan(0.5);
    expect(values[dig]! - 2).toBeLessThan(1);
    expect(transitions.finished(10 + DIG_SECONDS)).toEqual([dig]);
    expect(transitions.finished(10 + REVEAL_SECONDS)).toEqual([reveal]);
    transitions.values(11, values);
    expect([...values].every((v) => v === 1)).toBe(true);
  });

  it("shares a slot within 1/30 s, frees it only after release, and never runs out", () => {
    const transitions = new FieldTransitions();
    const first = transitions.open("reveal", 1);
    expect(transitions.open("reveal", 1.02)).toBe(first);
    expect(transitions.open("reveal", 1.05)).not.toBe(first);
    transitions.finished(2);
    expect(transitions.running).toBe(0);
    // Settling slots are not handed out again until their rewrite is uploaded.
    const taken = new Set<number>();
    for (let n = 0; n < 13; n++)
      taken.add(transitions.open("dig", 3 + n * 0.05));
    expect(taken.has(first)).toBe(false);
    expect(taken.size).toBe(13);
    // All 15 are busy: the newest running slot of the kind is shared.
    const shared = transitions.open("dig", 3.9);
    expect(taken.has(shared)).toBe(true);
    expect(transitions.open("reveal", 3.9)).toBe(0);
    transitions.release();
    expect(transitions.open("reveal", 3.95)).toBeGreaterThan(0);
  });
});

describe("T2 terrain tier (D4 condition 3)", () => {
  it("starts on the field with fragment highp, whatever the pointer", () => {
    expect(bootTier("webgl", true)).toEqual({ tier: "field" });
    expect(bootTier("webgl", false).tier).toBe("retained");
    expect(bootTier("canvas", true).tier).toBe("retained");
  });

  it("starts a software rasteriser on RetainedTerrain", () => {
    for (const name of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "Microsoft Basic Render Driver",
    ]) {
      expect(softwareRasteriser(name)).toBe(true);
      expect(bootTier("webgl", true, name)).toEqual({
        tier: "retained",
        reason: "software rasteriser",
      });
    }
    for (const name of [
      "ANGLE (Qualcomm, Adreno (TM) 830, OpenGL ES 3.2)",
      "Mali-G68 MC4",
      "Apple GPU",
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)",
      "",
    ])
      expect(bootTier("webgl", true, name)).toEqual({ tier: "field" });
  });

  it("puts devices without fragment highp on the Canvas path by measurement", () => {
    // A phone at backing 1.5 (590 px across, 84 device px per tile) and a
    // desktop at backing 2 (2880 px, 164 per tile), W02's 48-tile world.
    const phone = coordinateStepPixels(10, 590, 48, 84),
      desktop = coordinateStepPixels(10, 2880, 48, 164);
    // Floors must sit within 2 device px of collision (§9.2): mediump cannot.
    expect(phone).toBeGreaterThan(2);
    expect(desktop).toBeGreaterThan(2);
    // highp (23 bits) is far inside it.
    expect(coordinateStepPixels(23, 2880, 48, 164)).toBeLessThan(0.01);
  });

  const frame = (interval: number, backing = 2, floor = 2) => ({
    interval,
    cost: 4,
    frameSeconds: interval / 1000,
    held: false,
    backing,
    backingFloor: floor,
  });
  const run = (
    policy: TerrainTierPolicy,
    seconds: number,
    f: ReturnType<typeof frame>,
  ) => {
    let stepped = false;
    const frames = Math.ceil(seconds / Math.min(0.05, f.frameSeconds));
    for (let n = 0; n < frames; n++) stepped = policy.sample(f) || stepped;
    return stepped;
  };

  it("keeps the field at the 60 Hz readout's 18 to 20 ms", () => {
    const policy = new TerrainTierPolicy();
    expect(run(policy, 60, frame(19.5))).toBe(false);
    expect(policy.tier).toBe("field");
  });

  it("steps down after two 3 s windows over 25 ms at the backing floor", () => {
    const policy = new TerrainTierPolicy();
    expect(run(policy, 5.9, frame(34))).toBe(false);
    expect(run(policy, 0.3, frame(34))).toBe(true);
    expect(policy.tier).toBe("retained");
    expect(policy.reason).toMatch(/interval p95 34\.0 ms at backing 2/);
  });

  it("waits four windows while the backing scale can still go down", () => {
    const policy = new TerrainTierPolicy();
    expect(run(policy, 11.9, frame(34, 2, 1.5))).toBe(false);
    // The resolution drops: the count starts again at the new level.
    expect(run(policy, 5.9, frame(34, 1.5, 1.5))).toBe(false);
    expect(run(policy, 0.3, frame(34, 1.5, 1.5))).toBe(true);
  });

  it("ignores loading holds, a clock that is not moving and hidden tabs", () => {
    const policy = new TerrainTierPolicy();
    expect(run(policy, 30, { ...frame(50), held: true })).toBe(false);
    expect(run(policy, 30, { ...frame(50), cost: 0 })).toBe(false);
    expect(run(policy, 30, frame(5000))).toBe(false);
    // One slow frame in twenty-five is under the p95.
    for (let n = 0; n < 500; n++)
      expect(policy.sample(frame(n % 25 ? 16.7 : 50))).toBe(false);
  });
});

describe("T2 field shader and flag", () => {
  it("stays within the §7 budget of 12 taps and 9 Worley seeds", () => {
    expect(FIELD_TAPS).toBeLessThanOrEqual(12);
    expect(FIELD_WORLEY_SEEDS).toBeLessThanOrEqual(9);
    const taps = FIELD_FRAGMENT.match(/texture2D\(/g)!.length;
    // Five literal taps in main, one in cellAt (called five times).
    expect(taps).toBe(6);
    expect(FIELD_FRAGMENT.match(/cellAt\(/g)!.length - 1).toBe(5);
    expect(FIELD_TAPS).toBe(taps - 1 + 5);
    // Courses, not a seed search: no loop longer than the three joints.
    expect(FIELD_WORLEY_SEEDS).toBe(0);
    for (const loop of FIELD_FRAGMENT.matchAll(
      /for \(int \w+ = 0; \w+ < (\d+)/g,
    ))
      expect(Number(loop[1])).toBeLessThanOrEqual(4);
    expect(FIELD_FRAGMENT).not.toMatch(/texelFetch|#version 300/);
    // GLSL ES 1.00 reserves these; a driver that enforces it fails to compile.
    expect(FIELD_FRAGMENT).not.toMatch(
      /\b(float|vec[234]|bool|int)\s+(flat|packed|input|output|filter|fixed|half|sample|common|partition|active|superp|inline|noinline|volatile|public|static|extern|external|interface|long|short|double|unsigned|template|this|class|union|enum|typedef|goto|switch|default|asm|cast|namespace|using|sizeof)\b/,
    );
  });

  it("uses the W01 swatch cards in every band (A1, D6 ladder)", () => {
    const bands = { a: "A", b: "B", c: "C", d: "D" } as const;
    for (const [id, card] of Object.entries(bands)) {
      const roles = swatches.bands[card].roles as Record<
          string,
          { hex: string; L: number }
        >,
        band = FIELD_PALETTES.W01[id as keyof typeof bands];
      expect(band.unknown).toBe(roles.unknown!.hex);
      expect(band.lit).toBe(roles.lit!.hex);
      expect(band.lip).toBe(roles.lip!.hex);
      expect(band.crack).toBe(roles.crack!.hex);
      expect(band.backWall).toBe(roles["back wall"]!.hex);
      expect(band.caveAir).toBe(roles["cave air"]!.hex);
      expect(band.rust).toBe(roles.rust?.hex);
      // The D6 ladder holds in every band.
      expect(roles.unknown!.L).toBeGreaterThan(21);
      expect(roles.unknown!.L).toBeLessThan(27);
      expect(roles.lit!.L - roles.unknown!.L).toBeGreaterThan(13);
    }
    expect(FIELD_PALETTES.W01.a.kind).toBe("strata");
    expect(FIELD_PALETTES.W01.b.kind).toBe("strata");
    expect(FIELD_PALETTES.W01.c.kind).toBe("blocks");
    expect(FIELD_PALETTES.W01.d.kind).toBe("rubble");
  });

  it("keeps W02 on the audit's provisional key", () => {
    // Rec. 709 luma on sRGB bytes, as scripts/art_metrics.py measures it.
    const luma = (hex: string) => {
      const [r, g, b] = hexToVec3(hex);
      return 255 * (0.2126 * r + 0.7152 * g + 0.0722 * b);
    };
    for (const band of Object.values(FIELD_PALETTES.W02)) {
      // Unexplored ice-rock at luma 64 to 75 on screen: the base colour sits
      // at the bottom of that range, and the courses' tones, facets and
      // pebbles lift the frame's mean by about 8 % (scripts/t2-field.mjs
      // "look" holds the frame). Lit walls and hard rock (the lit colour at
      // 0.79) at least 15 above it; cave air at least 10 below.
      expect(luma(band.unknown)).toBeGreaterThanOrEqual(64);
      expect(luma(band.unknown) * 1.08).toBeLessThanOrEqual(75);
      expect(0.79 * luma(band.lit) - luma(band.unknown)).toBeGreaterThanOrEqual(
        15,
      );
      expect(luma(band.unknown) - luma(band.caveAir)).toBeGreaterThanOrEqual(
        10,
      );
      expect(band.rust).toBeUndefined();
    }
  });

  it("draws the swatch cards' edges and courses (scripts/swatch-cards.py)", () => {
    const value = (name: string) =>
      Number(card.match(new RegExp(`^${name} = ([0-9.]+)`, "m"))![1]);
    expect(FIELD_SHAPE.gap).toBe(value("GAP"));
    expect(FIELD_SHAPE.bevel).toBe(value("BEVEL"));
    expect(FIELD_SHAPE.bevelBottom).toBe(value("BEVEL_BOTTOM"));
    expect(FIELD_SHAPE.lip).toBe(value("LIP"));
    expect(FIELD_SHAPE.lipShade).toBe(value("LIP_SHADE"));
    expect(FIELD_SHAPE.ceilingEdge).toBe(value("CEIL_EDGE"));
    expect(FIELD_SHAPE.undercut).toBe(value("UNDERCUT"));
    expect(FIELD_SHAPE.occlusion).toBe(value("AO"));
    // §6.1: lips 0.085 to 0.1 tile, undercut 0.03, occlusion 0.3 to 0.4.
    expect(FIELD_SHAPE.lip).toBeGreaterThanOrEqual(0.085);
    expect(FIELD_SHAPE.lip).toBeLessThanOrEqual(0.1);
    // Course heights and slab lengths, from pitch and jitter: strata 0.7 to
    // 1.2 tiles tall in slabs 2 to 4 long, blocks about 1 by 1 to 2.
    const range = (pitch: number, jitter: number) => [
      pitch * (1 - 2 * jitter),
      pitch * (1 + 2 * jitter),
    ];
    const { strata, blocks } = FIELD_COURSES;
    const [low, high] = range(strata.pitch, strata.jitter);
    expect(low).toBeGreaterThanOrEqual(0.7);
    expect(high).toBeLessThanOrEqual(1.2);
    const [short, long] = range(strata.joint, strata.spread);
    expect(short).toBeGreaterThanOrEqual(2);
    expect(long).toBeLessThanOrEqual(4);
    const [narrow, wide] = range(blocks.joint, blocks.spread);
    expect(narrow).toBeGreaterThanOrEqual(1);
    expect(wide).toBeLessThanOrEqual(2);
    // A joint never leaves its half pitch, so three joints find every slab:
    // its jitter, plus its slant over half a course (the tallest, with the
    // 0.12-tile wave of a block's top).
    for (const kind of Object.values(FIELD_COURSES))
      expect(
        kind.spread * kind.joint +
          kind.slant * (kind.pitch * (0.5 + kind.jitter) + 0.12),
      ).toBeLessThan(kind.joint / 2);
  });

  it("is the default, pinned by ?field=1 and off with ?field=0", () => {
    expect(fieldRequest("")).toBe("auto");
    expect(fieldRequest("?mode=campaign")).toBe("auto");
    expect(fieldRequest("?field=1")).toBe("full");
    expect(fieldRequest("?field=0")).toBe("off");
    expect(fieldRequest("?field=0", "1")).toBe("off");
    expect(fieldRequest("", "1")).toBe("full");
    expect(fieldRequest("", "0")).toBe("off");
    expect(fieldRequest("?field=yes")).toBe("auto");
    expect(fieldTextureLimit("?fieldmax=512")).toBe(512);
    expect(fieldTextureLimit("")).toBeUndefined();
  });
});
