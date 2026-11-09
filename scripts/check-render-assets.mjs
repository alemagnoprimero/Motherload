/** Native-resolution page and macro material gates; no authoring tools required. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  checkCampaignAtlas,
  decodeCampaignPixels,
} from "./check-campaign-assets.mjs";
import { oreMarkGeometry } from "../assets/campaign/render-sources.mjs";
const directory = new URL("../assets/campaign/generated/", import.meta.url);
const json = async (name) =>
  JSON.parse(await readFile(new URL(name, directory), "utf8"));
const lab = (rgb) => {
  const c = rgb.map((v) =>
    v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4,
  );
  const xyz = [
    (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047,
    c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722,
    (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
};
// Audit T13a: raster-source frames reach the runtime pages at every scale.
const rasterFrames = JSON.parse(
  await readFile(
    new URL("../assets/campaign/source/frames.json", import.meta.url),
    "utf8",
  ),
)
  .frames.filter((frame) => frame.source === "raster")
  .map((frame) => frame.name);
let frames = 0;
for (const world of ["w01", "w02"])
  for (const scale of [2, 3]) {
    const index = await json(`${world}-pages-runtime-${scale}x.json`);
    assert.equal(index.scale, scale);
    const names = new Set(),
      raster = new Set();
    for (const page of index.pages) {
      const png = await readFile(new URL(page.image, directory));
      const atlas = await json(page.data);
      checkCampaignAtlas(png, atlas, []);
      assert.equal(Number(atlas.meta.scale), scale);
      assert.deepEqual(atlas.meta.rigPivot, [32 * scale, 32 * scale]);
      assert.equal(atlas.meta.rigTreadBaseline, 50 * scale);
      for (const [name, frame] of Object.entries(atlas.frames)) {
        assert.ok(!names.has(name), "Duplicate frame across pages");
        names.add(name);
        assert.equal(frame.sourceSize.w / frame.logicalSize.w, scale);
        assert.equal(frame.sourceSize.h / frame.logicalSize.h, scale);
        if (frame.source === "raster") raster.add(name);
        frames++;
      }
    }
    if (world === "w01")
      for (const name of rasterFrames)
        assert.ok(
          raster.has(name),
          `Raster frame ${name} is missing from the @${scale}x runtime pages`,
        );
    assert.ok(names.has("sky-body"));
    assert.ok(names.has(world === "w01" ? "rig-cabin" : "mission-sample"));
  }
const manifest = await json("bands/manifest.json");
assert.equal(manifest.pages.length, 48);
const means = {};
let maximumSeam = 0;
for (const page of manifest.pages) {
  const png = await readFile(new URL("bands/" + page.file, directory));
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20),
    pixels = decodeCampaignPixels(png);
  assert.equal(width, 48 * 8 * page.scale);
  assert.equal(height, width);
  assert.ok(width <= 2048);
  const sample = (x, y, k) => pixels[(y * width + x) * 4 + k];
  let seam = 0;
  for (let i = 0; i < width; i++)
    for (let k = 0; k < 4; k++) {
      seam = Math.max(
        seam,
        Math.abs(sample(0, i, k) - sample(width - 1, i, k)),
        Math.abs(sample(i, 0, k) - sample(i, height - 1, k)),
      );
    }
  assert.ok(seam <= 6, `${page.file} discontinuous edge (${seam})`);
  maximumSeam = Math.max(maximumSeam, seam);
  if (page.scale === 2) {
    const mean = [0, 0, 0];
    let count = 0;
    for (let y = 0; y < height; y += 4)
      for (let x = 0; x < width; x += 4) {
        for (let k = 0; k < 3; k++) mean[k] += sample(x, y, k);
        count++;
      }
    means[`${page.world}-${page.band}-${page.material}`] = lab(
      mean.map((v) => v / count),
    );
  }
}
let minimumMaterial = Infinity,
  minimumBand = Infinity;
for (const world of ["W01", "W02"])
  for (const [i, band] of ["A", "B", "C", "D"].entries()) {
    const soil = means[`${world}-${world}-${band}-soil`],
      rock = means[`${world}-${world}-${band}-rock`];
    const dl = Math.abs(soil[0] - rock[0]);
    minimumMaterial = Math.min(minimumMaterial, dl);
    assert.ok(dl >= 8, `${world}-${band} grayscale material separation ${dl}`);
    if (i) {
      const previous =
        means[`${world}-${world}-${["A", "B", "C", "D"][i - 1]}-soil`];
      const de = Math.hypot(...soil.map((v, k) => v - previous[k]));
      minimumBand = Math.min(minimumBand, de);
      assert.ok(de >= 10, `${world}-${band} adjacent band separation ${de}`);
    }
  }
console.log(
  `Render kit verified: ${frames} native scaled sprite frames;48seamlessmacro pages;maximumseam${maximumSeam};material ΔL≥${minimumMaterial.toFixed(1)},band ΔE≥${minimumBand.toFixed(1)}.`,
);

// Art item A12 with T9: the tier mark. Its place and size come from one
// source, oreMarkGeometry() in assets/campaign/render-sources.mjs: a dark
// disc of radius 8 in the 96-unit frame (0.167 of the frame) with a light
// glyph and no ring, baked into every ore and package frame of both worlds at
// each world's centres. The identification edge stays the gate it was: the
// 2nd and 98th L* percentiles of the opaque disc pixels must clear every
// band's soil and rock page means by ΔE ≥ 30 and ΔL ≥ 15, on the @2x and @3x
// runtime pages. It measures the identification edge, not a misleading
// whole-fill average. The size and ring gates read the rendered pixels.
const MARK_SHARE = 0.18; // audit §5.3 T9: the mark ≤ 0.18 of the ore frame
const HC_COPPER_DL = 20; // the HC mark's value against copper's body
const HC_LIGHT_SHARE = 0.45; // the HC disc's field is light (L* ≥ 85); a dark disc with a light glyph reads 0.1 to 0.3
const HC_MARK_DL = 60; // the HC disc against the normal (dark) disc
const pagesOf = async (world, scale) => {
  const index = await json(`${world}-pages-runtime-${scale}x.json`);
  const frames = new Map();
  for (const page of index.pages) {
    const png = await readFile(new URL(page.image, directory));
    const atlas = await json(page.data);
    const pixels = decodeCampaignPixels(png),
      stride = png.readUInt32BE(16);
    for (const [name, entry] of Object.entries(atlas.frames))
      frames.set(name, { entry, pixels, stride });
  }
  return frames;
};
/** One source pixel of a frame as [L, a, b, alpha], or null outside its trim. */
const pixelAt = ({ entry, pixels, stride }, x, y) => {
  const px = x - entry.spriteSourceSize.x,
    py = y - entry.spriteSourceSize.y;
  if (px < 0 || py < 0 || px >= entry.frame.w || py >= entry.frame.h)
    return null;
  const offset = ((entry.frame.y + py) * stride + entry.frame.x + px) * 4;
  return [
    ...lab([pixels[offset], pixels[offset + 1], pixels[offset + 2]]),
    pixels[offset + 3],
  ];
};
/**
 * Pixels of a frame between `inner` and `radius` source px of (cx, cy), as
 * [L,a,b,alpha]; `angles` keeps a sector (degrees, 0 = right, 90 = down).
 * With `all`, pixels outside the trimmed box count as transparent.
 */
const disc = (frame, cx, cy, radius, inner = 0, angles = null, all = false) => {
  const out = [];
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius || d < inner) continue;
      if (angles) {
        const angle = (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) * 180) / Math.PI;
        if (angle < angles[0] || angle > angles[1]) continue;
      }
      const pixel = pixelAt(frame, x, y);
      if (pixel) out.push(pixel);
      else if (all) out.push([0, 0, 0, 0]);
    }
  return out;
};
/**
 * The dark disc's radius as drawn: from 0.7 r (past the glyph) along the
 * rays right of and below the centre, away from the ore, while the pixels
 * stay opaque and dark.
 */
const darkReach = (frame, cx, cy, r) => {
  let reach = 0;
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    let step = Math.ceil(0.7 * r),
      edge = step;
    for (;;) {
      const pixel = pixelAt(
        frame,
        Math.floor(cx + dx * step),
        Math.floor(cy + dy * step),
      );
      if (!pixel || pixel[3] < 128 || pixel[0] > 30) break;
      edge = step++;
    }
    reach = Math.max(reach, edge + 0.5);
  }
  return reach;
};
const percentile = (values, share) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * share))
  ];
let minimumBadgeE = Infinity,
  minimumBadgeL = Infinity,
  minimumHcL = Infinity,
  minimumHcLight = Infinity,
  maximumSpan = 0,
  maximumSocketAlpha = 0,
  markFrames = 0;
for (const world of ["W01", "W02"])
  for (const tier of [1, 2, 3, 4]) {
    const { r } = oreMarkGeometry(tier, world);
    assert.ok(
      (2 * r) / 96 <= MARK_SHARE,
      `${world} tier ${tier} mark is ${((2 * r) / 96).toFixed(3)} of the ore frame (≤ ${MARK_SHARE})`,
    );
  }
const w01Pages = {};
for (const scale of [2, 3]) w01Pages[scale] = await pagesOf("w01", scale);
for (const world of ["W01", "W02"])
  for (const scale of [2, 3]) {
    const frames =
        world === "W01" ? w01Pages[scale] : await pagesOf("w02", scale),
      k = scale / 2;
    const darkDisc = {};
    for (const family of ["ore", "package"])
      for (let tier = 1; tier <= 4; tier++) {
        const name = `${family}-o${tier}`,
          frame = frames.get(name);
        assert.ok(frame, `${world} @${scale}x has no ${name}`);
        const g = oreMarkGeometry(tier, world);
        const [cx, cy, r] = [g.cx * k, g.cy * k, g.r * k];
        // The opaque disc: anti-aliased rim pixels (alpha < 245) are left out.
        const samples = disc(frame, cx, cy, r).filter((p) => p[3] >= 245);
        const floor = 0.75 * Math.PI * r * r;
        assert.ok(
          samples.length >= floor,
          `${world} ${name} @${scale}x: the tier mark is missing (${samples.length} of ${Math.ceil(floor)} disc pixels)`,
        );
        const lightness = samples.map((p) => p[0]);
        // A dark disc with a light glyph.
        assert.ok(
          percentile(lightness, 0.5) <= 25 && percentile(lightness, 0.98) >= 85,
          `${world} ${name} @${scale}x: the mark is not a dark disc with a light glyph`,
        );
        darkDisc[tier] = Math.max(
          darkDisc[tier] ?? 0,
          percentile(lightness, 0.5),
        );
        // The mark's size as drawn: the dark disc's span ≤ 0.18 of the frame
        // (one pixel of anti-aliasing allowed).
        const span = 2 * darkReach(frame, cx, cy, r);
        maximumSpan = Math.max(maximumSpan, span / (96 * k));
        assert.ok(
          span <= MARK_SHARE * 96 * k + 1,
          `${world} ${name} @${scale}x: the mark spans ${(span / k).toFixed(1)} of 96 (> ${MARK_SHARE})`,
        );
        // No light ring: the disc's outer rim stays dark, and so does the
        // band just outside it on the side away from the ore (right to
        // below), where the frame is otherwise empty.
        const rim = disc(frame, cx, cy, r - 0.25 * k, r - 1.5 * k)
          .filter((p) => p[3] >= 245)
          .map((p) => p[0]);
        assert.ok(
          rim.length && percentile(rim, 0.95) <= 30,
          `${world} ${name} @${scale}x: the mark has a light ring (rim L* p95 ${percentile(rim, 0.95)?.toFixed(1)})`,
        );
        const halo = disc(
          frame,
          cx,
          cy,
          r + 2.5 * k,
          r + 0.5 * k,
          [0, 90],
        ).filter((p) => p[3] >= 128 && p[0] > 30);
        assert.ok(
          halo.length === 0,
          `${world} ${name} @${scale}x: ${halo.length} light pixels ring the mark`,
        );
        samples.sort((a, b) => a[0] - b[0]);
        const edges = [
          samples[Math.floor(samples.length * 0.02)],
          samples[Math.floor(samples.length * 0.98)],
        ].map((p) => p.slice(0, 3));
        for (const band of ["A", "B", "C", "D"])
          for (const material of ["soil", "rock"]) {
            const ground = means[`${world}-${world}-${band}-${material}`];
            const contrast = edges
              .map((edge) => ({
                de: Math.hypot(...edge.map((v, i) => v - ground[i])),
                dl: Math.abs(edge[0] - ground[0]),
              }))
              .sort((a, b) => b.dl - a.dl)[0];
            minimumBadgeE = Math.min(minimumBadgeE, contrast.de);
            minimumBadgeL = Math.min(minimumBadgeL, contrast.dl);
            assert.ok(
              contrast.de >= 30 && contrast.dl >= 15,
              `${world} ${family}${tier} @${scale}x identification edge blends into ${band} ${material}`,
            );
          }
        markFrames++;
      }
    // The high-contrast marks (tier-mark-hc-N, in each world's atlas at its
    // centres): a light disc on the same footprint, with nothing outside it,
    // mostly light, whose value clears copper's body by ≥ 20 L* in greyscale
    // and the normal dark disc by ≥ 60. Copper's body: the median L* of W01
    // ore-o2's opaque copper pixels (C* > 12 and L* > 20 leave out the
    // outline, the seams and the mark).
    const copperL = percentile(
      disc(w01Pages[scale].get("ore-o2"), 48 * k, 48 * k, 70 * k)
        .filter((p) => p[3] >= 245 && p[0] > 20 && Math.hypot(p[1], p[2]) > 12)
        .map((p) => p[0]),
      0.5,
    );
    for (let tier = 1; tier <= 4; tier++) {
      const name = `tier-mark-hc-${tier}`,
        frame = frames.get(name);
      assert.ok(frame, `${world} @${scale}x has no ${name}`);
      const g = oreMarkGeometry(tier, world);
      const [cx, cy, r] = [g.cx * k, g.cy * k, g.r * k];
      const box = frame.entry.spriteSourceSize;
      assert.ok(
        box.x >= cx - r - k &&
          box.y >= cy - r - k &&
          box.x + box.w <= cx + r + k &&
          box.y + box.h <= cy + r + k,
        `${world} ${name} @${scale}x draws outside its mark`,
      );
      const inside = disc(frame, cx, cy, r).filter((p) => p[3] >= 245);
      assert.ok(
        inside.length >= 0.75 * Math.PI * r * r,
        `${world} ${name} @${scale}x does not cover the mark`,
      );
      // Every opaque pixel inside the outline (r - 2), glyph included: the
      // light field must dominate, so its median is the disc's value.
      const field = disc(frame, cx, cy, r - 2 * k)
        .filter((p) => p[3] >= 245)
        .map((p) => p[0]);
      const hcL = percentile(field, 0.5),
        lightShare = field.filter((L) => L >= 85).length / field.length;
      minimumHcL = Math.min(minimumHcL, hcL - copperL);
      minimumHcLight = Math.min(minimumHcLight, lightShare);
      assert.ok(
        lightShare >= HC_LIGHT_SHARE,
        `${world} ${name} @${scale}x: only ${(lightShare * 100).toFixed(0)} % of the disc is light`,
      );
      assert.ok(
        hcL - copperL >= HC_COPPER_DL,
        `${world} ${name} @${scale}x: L* ${hcL?.toFixed(1)} is within ${HC_COPPER_DL} of copper's body (${copperL.toFixed(1)})`,
      );
      assert.ok(
        hcL - darkDisc[tier] >= HC_MARK_DL,
        `${world} ${name} @${scale}x: L* ${hcL?.toFixed(1)} is within ${HC_MARK_DL} of the normal mark (${darkDisc[tier].toFixed(1)})`,
      );
    }
    if (world !== "W01") continue;
    // The deposit socket (art item A12; W01 only, W02 draws it from W01's
    // atlas): translucent everywhere, so it darkens whatever block it lies on
    // and never paints a solid patch. Every variant in w01-ore.mjs keeps to
    // this (tests/art-ore.test.mjs), so a swap of SOCKET_VARIANT stays safe.
    const socket = frames.get("deposit-socket");
    assert.ok(socket, `W01 @${scale}x has no deposit-socket`);
    let maximumAlpha = 0;
    for (let y = 0; y < socket.entry.frame.h; y++)
      for (let x = 0; x < socket.entry.frame.w; x++)
        maximumAlpha = Math.max(
          maximumAlpha,
          socket.pixels[
            ((socket.entry.frame.y + y) * socket.stride +
              socket.entry.frame.x +
              x) *
              4 +
              3
          ],
        );
    maximumSocketAlpha = Math.max(maximumSocketAlpha, maximumAlpha);
    assert.ok(
      maximumAlpha <= 160,
      `deposit-socket @${scale}x is not translucent (alpha ${maximumAlpha})`,
    );
  }
console.log(
  `Tier marks (r ${oreMarkGeometry(1).r} of 96, drawn span ≤ ${maximumSpan.toFixed(3)} of the frame, ≤ ${MARK_SHARE}; no ring inside or outside) on ${markFrames} ore/package frames, W01 and W02, @2x and @3x: identification edge ΔE≥${minimumBadgeE.toFixed(1)}, ΔL≥${minimumBadgeL.toFixed(1)} across all bands; high-contrast marks ≥${minimumHcL.toFixed(1)} L* over copper's body, ≥${(minimumHcLight * 100).toFixed(0)} % light; the socket is translucent (alpha ≤ ${maximumSocketAlpha}). Body-fill contrast and player naming still require visual review.`,
);
