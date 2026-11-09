import { describe, expect, it } from "vitest";
import {
  CODE,
  FIELD_K,
  FIELD_PAD,
  FIELD_TOP,
  FIELD_UPLOAD_MAX,
  FieldData,
  type KnownWorldView,
} from "../src/campaign/render/field/field-data";
import { fieldRequested } from "../src/campaign/render/field/flag";
import { DiscoveredWorldView } from "../src/campaign/render/field/known-world";
import { FIELD_PALETTE } from "../src/campaign/render/field/palette";
import {
  FIELD_FRAGMENT,
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

describe("T2 spike field texture", () => {
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
    const patch = data.nextPatch({ x: 21 * FIELD_K, y: 12 * FIELD_K })!;
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

describe("T2 spike shader and flag", () => {
  it("stays within the §7 budget of 12 taps and 9 Worley seeds", () => {
    expect(FIELD_TAPS).toBeLessThanOrEqual(12);
    expect(FIELD_WORLEY_SEEDS).toBeLessThanOrEqual(9);
    const taps = FIELD_FRAGMENT.match(/texture2D\(/g)!.length;
    // Five literal taps in main, one in cellAt (called five times).
    expect(taps).toBe(6);
    expect(FIELD_FRAGMENT.match(/cellAt\(/g)!.length - 1).toBe(5);
    expect(FIELD_FRAGMENT).toContain("vec2 seeds[9]");
    expect(FIELD_FRAGMENT).not.toMatch(/texelFetch|#version 300/);
  });

  it("uses the W01 swatch values (A1, D6 ladder)", () => {
    const a = swatches.bands.A.roles,
      c = swatches.bands.C.roles;
    expect(FIELD_PALETTE.unknown).toBe(a.unknown.hex);
    expect(FIELD_PALETTE.lit).toBe(a.lit.hex);
    expect(FIELD_PALETTE.lip).toBe(a.lip.hex);
    expect(FIELD_PALETTE.crack).toBe(a.crack.hex);
    expect(FIELD_PALETTE.interior).toBe(a["back wall"].hex);
    expect(FIELD_PALETTE.caveAir).toBe(a["cave air"].hex);
    expect(FIELD_PALETTE.rust).toBe(c.rust.hex);
  });

  it("is off unless asked for", () => {
    expect(fieldRequested("")).toBe(false);
    expect(fieldRequested("?mode=campaign")).toBe(false);
    expect(fieldRequested("?field=1")).toBe(true);
    expect(fieldRequested("?field=0", "1")).toBe(false);
    expect(fieldRequested("", "1")).toBe(true);
    expect(fieldRequested("?field=yes")).toBe(false);
  });
});
