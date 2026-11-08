import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const MAX_PAGE = 2048;
const GUTTER = 2;
const range = (count, start = 0) =>
  Array.from({ length: count }, (_, index) => index + start);
const REQUIRED_FRAMES = [
  ...range(8).map((index) => `soil-${index}`),
  ...range(16).map((index) => `soil-edge-${index}`),
  ...range(4).map((index) => `stone-${index}`),
  ...range(15, 1).map((index) => `stone-edge-${index}`),
  ...range(15, 1).map((index) => `bedrock-edge-${index}`),
  "bedrock-0",
  "sky-body",
  ...range(3, 1).map((index) => `crack-${index}`),
  ...range(4, 1).flatMap((index) => [`ore-o${index}`, `package-o${index}`]),
  "relic",
  ...["beacon", "valve", "antenna", "core"].map((id) => `mission-${id}`),
  "warning-shelf",
  ...range(8).map((index) => `rig-body-${index}`),
  "rig-cabin",
  ...["engine", "energy", "bay", "hull"].flatMap((id) =>
    range(2).map((index) => `rig-${id}-${index}`),
  ),
  "rig-drill-idle",
  ...["right", "down", "left"].flatMap((id) =>
    range(8).map((index) => `rig-drill-${id}-${index}`),
  ),
  ...["right", "down", "left"].map((id) => `rig-drill-collar-${id}-1`),
  "rig-feet-stowed",
  "rig-feet-deployed",
  "rig-rack",
  ...range(3, 1).map((index) => `rig-damage-${index}`),
  ...range(6).map((index) => `thrust-${index}`),
  ...range(4).map((index) => `dock-stage-${index}`),
  ...["refuge", "relay"].flatMap((id) =>
    range(3).map((index) => `${id}-stage-${index}`),
  ),
  ...["drill", "energy", "cargo", "hull", "engine", "feet", "rack", "core"].map(
    (id) => `icon-${id}`,
  ),
  ...[
    "energy",
    "hull",
    "cargo",
    "depth",
    "mission",
    "relic",
    "map",
    "shop",
    "warning",
    "cooldown",
  ].map((id) => `ui-${id}`),
  "world-w01",
];

const expectedFrameSize = (name) =>
  name === "sky-body"
    ? { w: 256, h: 256 }
    : name.startsWith("dock-stage-")
      ? { w: 384, h: 288 }
      : name.startsWith("refuge-stage-")
        ? { w: 288, h: 192 }
        : name.startsWith("relay-stage-")
          ? { w: 192, h: 192 }
          : name.startsWith("rig-") ||
              name.startsWith("thrust-") ||
              name.startsWith("icon-")
            ? { w: 128, h: 128 }
            : { w: 96, h: 96 };

export function decodeCampaignPixels(
  png,
  width = png.readUInt32BE(16),
  height = png.readUInt32BE(20),
) {
  assert.equal(
    png.subarray(0, 8).toString("hex"),
    PNG_SIGNATURE,
    "Invalid PNG signature",
  );
  assert.equal(png[24], 8, "Readability checks need 8-bit PNGs");
  assert.equal(png[25], 6, "Readability checks need RGBA PNGs");
  assert.equal(png[28], 0, "Interlaced PNG is unsupported");
  const data = [];
  let ended = false;
  for (let offset = 8; offset < png.length;) {
    assert.ok(offset + 12 <= png.length, "Truncated campaign PNG chunk");
    const size = png.readUInt32BE(offset);
    assert.ok(offset + 12 + size <= png.length, "Invalid campaign PNG chunk");
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") data.push(png.subarray(offset + 8, offset + 8 + size));
    if (type === "IEND") ended = true;
    offset += size + 12;
  }
  assert.ok(
    ended && data.length,
    "Campaign PNG lacks image data or end marker",
  );
  const rowBytes = width * 4;
  const packed = inflateSync(Buffer.concat(data), {
    maxOutputLength: (rowBytes + 1) * height,
  });
  assert.equal(packed.length, (rowBytes + 1) * height, "Invalid PNG scanlines");
  const pixels = Buffer.alloc(rowBytes * height);
  const paeth = (left, above, corner) => {
    const prediction = left + above - corner;
    const dl = Math.abs(prediction - left);
    const da = Math.abs(prediction - above);
    const dc = Math.abs(prediction - corner);
    return dl <= da && dl <= dc ? left : da <= dc ? above : corner;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (rowBytes + 1)];
    assert.ok(filter >= 0 && filter <= 4, "Invalid campaign PNG row filter");
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= 4 ? pixels[y * rowBytes + x - 4] : 0;
      const above = y > 0 ? pixels[(y - 1) * rowBytes + x] : 0;
      const corner = y > 0 && x >= 4 ? pixels[(y - 1) * rowBytes + x - 4] : 0;
      const prediction =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth(left, above, corner);
      pixels[y * rowBytes + x] =
        (packed[y * (rowBytes + 1) + x + 1] + prediction) & 255;
    }
  }
  return pixels;
}

/** Uses committed output only; no authoring browser or graphics library needed. */
export function checkCampaignAtlas(
  png,
  atlas,
  requiredFrames = REQUIRED_FRAMES,
) {
  assert.ok(png.length > 32, "Campaign atlas PNG is empty");
  assert.equal(
    png.subarray(0, 8).toString("hex"),
    PNG_SIGNATURE,
    "Invalid campaign PNG",
  );
  assert.equal(
    png.toString("ascii", 12, 16),
    "IHDR",
    "Missing PNG image header",
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.ok(
    width > 0 && height > 0 && width <= MAX_PAGE && height <= MAX_PAGE,
    "Campaign atlas exceeds the 2048×2048 mobile page budget",
  );
  assert.equal(png[24], 8, "Campaign atlas must use 8-bit colour");
  assert.equal(png[25], 6, "Campaign atlas must retain RGBA transparency");
  assert.equal(png[28], 0, "Interlaced campaign atlas is unsupported");
  assert.ok(
    atlas.frames && typeof atlas.frames === "object",
    "Missing campaign frames",
  );
  assert.ok(
    !Array.isArray(atlas.frames),
    "Campaign atlas needs named Phaser frames",
  );
  for (const name of requiredFrames)
    assert.ok(
      Object.hasOwn(atlas.frames, name),
      `Missing campaign asset: ${name}`,
    );
  const frames = Object.entries(atlas.frames);
  assert.ok(frames.length, "Campaign atlas contains no frames");
  const pixels = decodeCampaignPixels(png, width, height);
  const alpha = (x, y) => pixels[(y * width + x) * 4 + 3];
  const bounds = [];
  for (const [name, entry] of frames) {
    const { x, y, w, h } = entry.frame ?? {};
    assert.ok(
      [x, y, w, h].every(Number.isInteger),
      `Invalid frame coordinates: ${name}`,
    );
    assert.ok(
      x >= GUTTER &&
        y >= GUTTER &&
        w > 0 &&
        h > 0 &&
        x + w + GUTTER <= width &&
        y + h + GUTTER <= height,
      `Frame or its gutter is outside campaign atlas: ${name}`,
    );
    assert.equal(
      entry.rotated,
      false,
      `Rotated frame changes campaign anchors: ${name}`,
    );
    assert.equal(
      typeof entry.trimmed,
      "boolean",
      `Missing trim metadata: ${name}`,
    );
    const source = entry.sourceSize,
      rect = entry.spriteSourceSize;
    assert.ok(
      source &&
        rect &&
        [source.w, source.h, rect.x, rect.y, rect.w, rect.h].every(
          Number.isInteger,
        ),
      `Invalid source rectangle: ${name}`,
    );
    assert.ok(
      rect.x >= 0 &&
        rect.y >= 0 &&
        rect.w === w &&
        rect.h === h &&
        rect.x + w <= source.w &&
        rect.y + h <= source.h,
      `Trimmed frame leaves its source: ${name}`,
    );
    if (!entry.trimmed)
      assert.deepEqual(
        rect,
        { x: 0, y: 0, w: source.w, h: source.h },
        `Untrimmed frame changes source: ${name}`,
      );
    if (REQUIRED_FRAMES.includes(name))
      assert.deepEqual(
        source,
        Object.fromEntries(
          Object.entries(expectedFrameSize(name)).map(([key, value]) => [
            key,
            (value * Number(atlas.meta?.scale ?? 2)) / 2,
          ]),
        ),
        `Source dimensions change campaign anchors: ${name}`,
      );
    for (const other of bounds)
      assert.ok(
        x >= other.x + other.w + GUTTER ||
          other.x >= x + w + GUTTER ||
          y >= other.y + other.h + GUTTER ||
          other.y >= y + h + GUTTER,
        `Campaign frames overlap or lack gutters: ${other.name}, ${name}`,
      );
    let visible = false;
    for (let row = y; row < y + h && !visible; row++)
      for (let col = x; col < x + w; col++)
        if (alpha(col, row)) {
          visible = true;
          break;
        }
    assert.ok(visible, `Campaign frame is entirely transparent: ${name}`);
    if (name.startsWith("rig-body-")) {
      let bottom = 0;
      for (let row = y; row < y + h; row++)
        for (let col = x; col < x + w; col++)
          if (alpha(col, row)) bottom = row - y + 1;
      assert.equal(
        bottom + entry.spriteSourceSize.y,
        (100 * Number(atlas.meta?.scale ?? 2)) / 2,
        `Tread pixels drift from the rig baseline: ${name}`,
      );
    }
    for (let row = y - GUTTER; row < y + h + GUTTER; row++)
      for (let col = x - GUTTER; col < x + w + GUTTER; col++) {
        if (col >= x && col < x + w && row >= y && row < y + h) continue;
        assert.equal(
          alpha(col, row),
          0,
          `Campaign frame gutter contains pixels: ${name}`,
        );
      }
    bounds.push({ name, x, y, w, h });
  }
  return { count: frames.length, width, height, bytes: png.length };
}

/**
 * Audit T13a: a frame listed with `"source": "raster"` is a PNG beside the
 * SVGs, which the build resamples to each page. Its PNG must exist, keep the
 * frame's proportions and be at least the frame's @2x size (a smaller one
 * would be enlarged on every page), and the atlas must carry the frame with
 * its raster mark.
 */
export async function checkRasterSources(sourceDirectory, manifest, atlas) {
  const raster = manifest.frames.filter((frame) => frame.source === "raster");
  for (const frame of raster) {
    const png = await readFile(new URL(`${frame.name}.png`, sourceDirectory));
    assert.equal(
      png.subarray(0, 8).toString("hex"),
      PNG_SIGNATURE,
      `Raster source is not a PNG: ${frame.name}`,
    );
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    assert.equal(
      width * frame.logicalHeight,
      height * frame.logicalWidth,
      `Raster source changes the frame's proportions: ${frame.name}`,
    );
    assert.ok(
      width >= frame.width && height >= frame.height,
      `Raster source is smaller than its @2x frame: ${frame.name}`,
    );
    assert.equal(
      atlas.frames[frame.name]?.source,
      "raster",
      `Raster frame is missing from the atlas or lost its mark: ${frame.name}`,
    );
  }
  return raster.map((frame) => frame.name);
}

/** Pixel checks stay in the normal Node-only production asset audit. */
export async function checkCampaignReadability(directory, world, png, atlas) {
  const backgrounds = {};
  for (const suffix of ["sky", "ridge-far", "ridge-near"]) {
    const bytes = await readFile(new URL(`${world}-${suffix}.png`, directory));
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    const pixels = decodeCampaignPixels(bytes, width, height);
    backgrounds[suffix] = { width, height, pixels };
    for (let y = 0; y < height; y++)
      for (let channel = 0; channel < 4; channel++)
        assert.equal(
          pixels[y * width * 4 + channel],
          pixels[(y * width + width - 1) * 4 + channel],
          `${world} ${suffix} has a horizontal wrap seam at row ${y}`,
        );
    if (suffix === "sky") {
      let stars = 0;
      for (let x = 0; x < width; x++)
        for (let channel = 0; channel < 4; channel++)
          assert.equal(
            pixels[x * 4 + channel],
            pixels[((height - 1) * width + x) * 4 + channel],
            `${world} stars have a vertical wrap seam`,
          );
      for (let i = 3; i < pixels.length; i += 4) stars += pixels[i] > 0;
      assert.ok(
        stars > 0 && stars / (width * height) < 0.015,
        `${world} stars must stay transparent without a baked gradient or sky body`,
      );
    } else {
      for (let y = Math.floor(height * 0.75); y < height; y++)
        for (let x = 0; x < width; x++)
          assert.equal(
            pixels[(y * width + x) * 4 + 3],
            255,
            `${world} ${suffix} needs a continuous opaque ground base`,
          );
    }
  }
  // Compare the skyline height, not empty sky or the shared solid ground base.
  // Pixel-mask equality over the entire canvas would count those intentional
  // common areas and hide identical mountain silhouettes.
  const skyline = ({ width, height, pixels }, x) => {
    for (let y = 0; y < height; y++)
      if (pixels[(y * width + x) * 4 + 3] > 127) return y;
    return height;
  };
  let matchingSkyline = 0;
  for (let x = 0; x < backgrounds["ridge-far"].width; x++)
    matchingSkyline +=
      Math.abs(
        skyline(backgrounds["ridge-far"], x) -
          skyline(backgrounds["ridge-near"], x),
      ) <= 8;
  const silhouetteAgreement = matchingSkyline / backgrounds["ridge-far"].width;
  assert.ok(
    silhouetteAgreement < 0.4,
    `${world} parallax ridge silhouettes are too similar`,
  );

  const pixels = decodeCampaignPixels(png);
  const stride = png.readUInt32BE(16);
  const sample = (name, x, y) => {
    const entry = atlas.frames[name];
    const frame = entry?.frame;
    assert.ok(frame, `Missing material-readability frame ${world}:${name}`);
    const sx = x - entry.spriteSourceSize.x,
      sy = y - entry.spriteSourceSize.y;
    if (sx < 0 || sy < 0 || sx >= frame.w || sy >= frame.h) return [0, 0, 0, 0];
    const at = ((frame.y + sy) * stride + frame.x + sx) * 4;
    return [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]];
  };
  const lab = (rgb) => {
    const c = rgb.map((v) =>
      v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4,
    );
    const xyz = [
      (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047,
      c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722,
      (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883,
    ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
    return [
      116 * xyz[1] - 16,
      500 * (xyz[0] - xyz[1]),
      200 * (xyz[1] - xyz[2]),
    ];
  };
  const meanLab = (material, variant, mask) => {
    const sum = [0, 0, 0];
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const base = sample(`${material}-${variant}`, x, y);
        const rim = mask
          ? sample(`${material}-edge-${mask}`, x, y)
          : [0, 0, 0, 0];
        const alpha = rim[3] / 255;
        const colour = lab(
          base
            .slice(0, 3)
            .map((v, channel) => v * (1 - alpha) + rim[channel] * alpha),
        );
        colour.forEach((v, channel) => {
          sum[channel] += v;
        });
      }
    return sum.map((v) => v / (96 * 96));
  };
  const soft = world === "w01" ? "soil" : "ice";
  const hard = world === "w01" ? "stone" : "frozen-rock";
  let minimumDeltaE = Infinity,
    minimumDeltaL = Infinity;
  for (let mask = 0; mask < 16; mask++) {
    const softLab = meanLab(soft, 0, mask);
    for (let variant = 0; variant < 4; variant++) {
      const hardLab = meanLab(hard, variant, mask);
      const deltaE = Math.hypot(
        ...softLab.map((v, channel) => v - hardLab[channel]),
      );
      const deltaL = Math.abs(softLab[0] - hardLab[0]);
      minimumDeltaE = Math.min(minimumDeltaE, deltaE);
      minimumDeltaL = Math.min(minimumDeltaL, deltaL);
      assert.ok(
        deltaE >= 12 && deltaL >= 8,
        `${world} exposed ${hard}-${variant} mask ${mask} is indistinct: ΔE ${deltaE.toFixed(2)}, ΔL ${deltaL.toFixed(2)}`,
      );
    }
  }
  for (const material of [soft, hard, "bedrock"])
    for (let mask = 1; mask < 16; mask++)
      assert.equal(
        sample(`${material}-edge-${mask}`, 48, 48)[3],
        0,
        `${world} ${material} rim must leave the interior variant visible`,
      );
  return { minimumDeltaE, minimumDeltaL, silhouetteAgreement };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const directory = new URL("../assets/campaign/generated/", import.meta.url);
  const [png, raw] = await Promise.all([
    readFile(new URL("w01-atlas.png", directory)),
    readFile(new URL("w01-atlas.json", directory), "utf8"),
  ]).catch((error) => {
    throw new Error(
      "Campaign artwork is missing. Restore assets/campaign/generated from Git or run node scripts/build-campaign-assets.mjs.",
      { cause: error },
    );
  });
  const result = checkCampaignAtlas(png, JSON.parse(raw));
  const atlas = JSON.parse(raw);
  const readability = await checkCampaignReadability(
    directory,
    "w01",
    png,
    atlas,
  );
  const source = new URL("../assets/campaign/source/", import.meta.url);
  const rasterFrames = await checkRasterSources(
    source,
    JSON.parse(await readFile(new URL("frames.json", source), "utf8")),
    atlas,
  );
  assert.deepEqual(
    atlas.meta?.size,
    { w: result.width, h: result.height },
    "Campaign atlas metadata dimensions disagree with its PNG",
  );
  assert.equal(atlas.meta?.logicalTile, 48, "Campaign logical tile changed");
  assert.deepEqual(
    atlas.meta?.rigPivot,
    [64, 64],
    "Campaign rig pivot changed",
  );
  assert.equal(
    atlas.meta?.rigTreadBaseline,
    100,
    "Campaign tread baseline changed",
  );
  assert.equal(
    atlas.meta?.framePadding,
    GUTTER,
    "Campaign atlas gutter changed",
  );
  for (const [name, expectedWidth, expectedHeight] of [
    ["w01-sky.png", 1024, 512],
    ["w01-ridge-far.png", 1024, 384],
    ["w01-ridge-near.png", 1024, 384],
  ]) {
    const background = await readFile(new URL(name, directory));
    assert.equal(
      background.subarray(0, 8).toString("hex"),
      PNG_SIGNATURE,
      `Invalid campaign background PNG: ${name}`,
    );
    assert.equal(
      background.readUInt32BE(16),
      expectedWidth,
      `Invalid background width: ${name}`,
    );
    assert.equal(
      background.readUInt32BE(20),
      expectedHeight,
      `Invalid background height: ${name}`,
    );
  }
  const iconFrames = REQUIRED_FRAMES.filter(
    (name) =>
      name.startsWith("icon-") ||
      name.startsWith("ore-") ||
      name.startsWith("package-") ||
      name.startsWith("mission-") ||
      name === "relic" ||
      name.startsWith("ui-"),
  );
  let iconCount = 0;
  const checkIcon = async (filename, size) => {
    const icon = await readFile(new URL(filename, directory));
    assert.equal(
      icon.subarray(0, 8).toString("hex"),
      PNG_SIGNATURE,
      `Invalid icon PNG: ${filename}`,
    );
    assert.equal(
      icon.readUInt32BE(16),
      size,
      `Invalid icon width: ${filename}`,
    );
    assert.equal(
      icon.readUInt32BE(20),
      size,
      `Invalid icon height: ${filename}`,
    );
    assert.equal(icon[25], 6, `Icon lost RGBA transparency: ${filename}`);
    iconCount++;
    return icon;
  };
  if (Object.hasOwn(atlas.frames, "world-w01")) iconFrames.push("world-w01");
  for (const name of iconFrames) {
    for (const size of name.startsWith("ui-") ? [24, 48] : [64, 128]) {
      const filename = `icons/${name}-${size}.png`;
      await checkIcon(filename, size);
    }
  }
  const registry = JSON.parse(
    await readFile(new URL("w01-assets.json", directory), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("../design/v0.1/motherload-asset-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const expectedIds = manifest
    .map((entry) => entry.id)
    .filter(
      (id) =>
        id === "RIG-CABIN" ||
        id.startsWith("CORE-1-") ||
        id.startsWith("UI-") ||
        id === "W01" ||
        id.startsWith("W01-"),
    );
  assert.equal(expectedIds.length, 29, "Unexpected W01 design-brief count");
  assert.equal(registry.version, "0.1", "Unknown W01 asset-registry version");
  assert.equal(registry.world, "W01", "Asset registry is for another world");
  assert.deepEqual(
    Object.keys(registry.assets ?? {}).sort(),
    [...expectedIds].sort(),
    "W01 registry must map all 29 stable design IDs exactly once",
  );
  for (const [id, record] of Object.entries(registry.assets)) {
    assert.ok(
      Array.isArray(record.frames) && record.frames.length,
      `Asset has no frame outputs: ${id}`,
    );
    for (const frame of record.frames)
      assert.ok(
        Object.hasOwn(atlas.frames, frame),
        `Unknown mapped frame: ${id} → ${frame}`,
      );
    for (const background of record.backgrounds ?? []) {
      assert.ok(
        ["w01-sky", "w01-ridge-far", "w01-ridge-near"].includes(background),
        `Unknown mapped background: ${id}`,
      );
      await readFile(new URL(`${background}.png`, directory));
    }
    if (!record.icon) continue;
    assert.ok(
      Object.hasOwn(atlas.frames, record.icon),
      `Unknown mapped icon: ${id}`,
    );
    const sizes = id.startsWith("UI-") ? [24, 48] : [64, 128];
    assert.deepEqual(
      record.iconSizes ?? [64, 128],
      sizes,
      `Unexpected mapped icon sizes: ${id}`,
    );
    for (const size of sizes) {
      const filename = `icons/${id.toLowerCase()}-icon-${size}.png`;
      const icon = await checkIcon(filename, size);
      const original = await readFile(
        new URL(`icons/${record.icon}-${size}.png`, directory),
      );
      assert.ok(
        icon.equals(original),
        `Icon alias differs from mapped artwork: ${filename}`,
      );
    }
  }
  console.log(
    `W01 artwork verified: ${result.count} frames, ${expectedIds.length} design IDs, ${iconCount} sized icons, ${result.width}×${result.height}, ${(result.bytes / 1024).toFixed(0)} KiB PNG.`,
  );
  console.log(
    `W01 readability: material ΔE ≥${readability.minimumDeltaE.toFixed(1)}, ΔL ≥${readability.minimumDeltaL.toFixed(1)}; seamless backgrounds.`,
  );
  console.log(
    `W01 raster sources (T13a): ${rasterFrames.length ? rasterFrames.join(", ") : "none"}.`,
  );
}
