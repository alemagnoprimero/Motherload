/** Native-resolution page and macro material gates; no authoring tools required. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  checkCampaignAtlas,
  decodeCampaignPixels,
} from "./check-campaign-assets.mjs";
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
let frames = 0;
for (const world of ["w01", "w02"])
  for (const scale of [2, 3]) {
    const index = await json(`${world}-pages-runtime-${scale}x.json`);
    assert.equal(index.scale, scale);
    const names = new Set();
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
        frames++;
      }
    }
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

// Baked two-tone edges remain readable where mineral body colours meet their local rock.
// This deliberately measures the identification edge, not a misleading whole-fill average.
let minimumBadgeE = Infinity,
  minimumBadgeL = Infinity;
for (const world of ["W01", "W02"]) {
  const atlas = await json(world.toLowerCase() + "-runtime.json");
  const png = await readFile(
    new URL(world.toLowerCase() + "-runtime.png", directory),
  );
  const pixels = decodeCampaignPixels(png),
    stride = png.readUInt32BE(16);
  for (const family of ["ore", "package"])
    for (let tier = 1; tier <= 4; tier++) {
      const entry = atlas.frames[`${family}-o${tier}`],
        samples = [];
      for (let y = 62; y <= 90; y++)
        for (let x = 62; x <= 90; x++) {
          if (Math.hypot(x - 76, y - 76) > 14) continue;
          const px = x - entry.spriteSourceSize.x,
            py = y - entry.spriteSourceSize.y;
          if (px < 0 || py < 0 || px >= entry.frame.w || py >= entry.frame.h)
            continue;
          const offset =
            ((entry.frame.y + py) * stride + entry.frame.x + px) * 4;
          if (pixels[offset + 3] < 245) continue;
          samples.push(
            lab([pixels[offset], pixels[offset + 1], pixels[offset + 2]]),
          );
        }
      samples.sort((a, b) => a[0] - b[0]);
      assert.ok(samples.length > 250, "Baked tier badge is missing");
      const edges = [
        samples[Math.floor(samples.length * 0.02)],
        samples[Math.floor(samples.length * 0.98)],
      ];
      for (const band of ["A", "B", "C", "D"])
        for (const material of ["soil", "rock"]) {
          const ground = means[`${world}-${world}-${band}-${material}`];
          const contrast = edges
            .map((edge) => ({
              de: Math.hypot(...edge.map((v, k) => v - ground[k])),
              dl: Math.abs(edge[0] - ground[0]),
            }))
            .sort((a, b) => b.dl - a.dl)[0];
          minimumBadgeE = Math.min(minimumBadgeE, contrast.de);
          minimumBadgeL = Math.min(minimumBadgeL, contrast.dl);
          assert.ok(
            contrast.de >= 30 && contrast.dl >= 15,
            `${world} ${family}${tier} identification edge blends into ${band} ${material}`,
          );
        }
    }
}
console.log(
  `Baked ore/package tier-edge contrast across all bands: ΔE≥${minimumBadgeE.toFixed(1)}, ΔL≥${minimumBadgeL.toFixed(1)}; body-fill contrast and player naming still require visual review.`,
);
