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
  name.startsWith("dock-stage-")
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

function decodeAlpha(png, width, height) {
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
  return (x, y) => pixels[(y * width + x) * 4 + 3];
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
  const alpha = decodeAlpha(png, width, height);
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
      entry.trimmed,
      false,
      `Trimmed frame changes campaign anchors: ${name}`,
    );
    assert.deepEqual(
      entry.sourceSize,
      { w, h },
      `Invalid source size: ${name}`,
    );
    assert.deepEqual(
      entry.spriteSourceSize,
      { x: 0, y: 0, w, h },
      `Invalid source rectangle: ${name}`,
    );
    if (REQUIRED_FRAMES.includes(name))
      assert.deepEqual(
        { w, h },
        expectedFrameSize(name),
        `Frame dimensions change campaign anchors: ${name}`,
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
        bottom,
        100,
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
}
