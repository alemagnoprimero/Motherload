/** Production audit: committed PNG/JSON files and Node builtins only. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { checkCampaignAtlas } from "./check-campaign-assets.mjs";

const range = (count) => Array.from({ length: count }, (_, index) => index);
export const FRONTIER_REQUIRED_FRAMES = [
  ...range(8).map((i) => `ice-${i}`),
  ...range(16).map((i) => `ice-edge-${i}`),
  ...range(4).map((i) => `frozen-rock-${i}`),
  ...range(16).map((i) => `frozen-rock-edge-${i}`),
  ...range(4).flatMap((i) => [`ore-o${i + 1}`, `package-o${i + 1}`]),
  "mission-sample",
  "mission-cryovein",
  "mission-catalyst",
  "relic",
  "tool-thermal",
  "tool-condenser",
  "tool-preservation",
  "rig-engine-2",
  "rig-energy-2",
  "rig-bay-2",
  "rig-hull-2",
  ...["left", "right", "down"].map(
    (direction) => `rig-drill-collar-${direction}-2`,
  ),
  ...range(4).map((i) => `dock-stage-${i}`),
  "cold-warning",
  "ice-vent",
  "world-w02",
];

export async function checkFrontierAssets(
  directory = new URL("../assets/campaign/generated/", import.meta.url),
) {
  const [png, raw, registryRaw] = await Promise.all([
    readFile(new URL("w02-atlas.png", directory)),
    readFile(new URL("w02-atlas.json", directory), "utf8"),
    readFile(new URL("w02-assets.json", directory), "utf8"),
  ]);
  const atlas = JSON.parse(raw),
    registry = JSON.parse(registryRaw);
  const result = checkCampaignAtlas(png, atlas, FRONTIER_REQUIRED_FRAMES);
  assert.equal(
    result.count,
    FRONTIER_REQUIRED_FRAMES.length,
    "W02 contains unexpected or missing frames",
  );
  assert.deepEqual(atlas.meta.size, { w: result.width, h: result.height });
  assert.equal(atlas.meta.logicalTile, 48);
  assert.equal(atlas.meta.framePadding, 2);
  assert.deepEqual(atlas.meta.rigPivot, [64, 64]);
  for (const name of FRONTIER_REQUIRED_FRAMES) {
    const expected = name.startsWith("dock-stage-")
      ? { w: 384, h: 288 }
      : name.startsWith("tool-") || name.startsWith("rig-")
        ? { w: 128, h: 128 }
        : { w: 96, h: 96 };
    assert.deepEqual(
      atlas.frames[name].sourceSize,
      expected,
      `W02 frame changes anchors: ${name}`,
    );
    assert.deepEqual(atlas.frames[name].logicalSize, {
      w: expected.w / 2,
      h: expected.h / 2,
    });
  }
  for (const [name, width, height] of [
    ["w02-sky", 1024, 512],
    ["w02-ridge-far", 1024, 384],
    ["w02-ridge-near", 1024, 384],
  ]) {
    const data = await readFile(new URL(`${name}.png`, directory));
    assert.equal(
      data.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      `Invalid W02 background: ${name}`,
    );
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), height);
    assert.equal(data[25], 6, "W02 backgrounds must retain alpha");
  }
  assert.equal(registry.version, "0.1");
  assert.equal(registry.world, "W02");
  assert.equal(
    registry.completeManifest,
    false,
    "W02 registry must describe its implemented subset",
  );
  assert.deepEqual(
    Object.keys(registry.assets).sort(),
    [
      "W02",
      "W02-R1",
      "W02-R2",
      "W02-R3",
      "W02-O1",
      "W02-O2",
      "W02-O3",
      "W02-O4",
      "W02-J",
      "W02-Q",
      "W02-S1",
      "W02-S3",
      "CORE-2-DRILL",
      "CORE-2-ENERGY",
      "CORE-2-CARGO",
      "CORE-2-HULL",
      "CORE-2-ENGINE",
    ].sort(),
  );
  for (const [id, record] of Object.entries(registry.assets)) {
    assert.ok(record.frames.length, `Empty W02 asset mapping: ${id}`);
    for (const name of record.frames)
      assert.ok(
        Object.hasOwn(atlas.frames, name),
        `Unmapped W02 frame ${id}: ${name}`,
      );
    assert.ok(Object.hasOwn(atlas.frames, record.icon));
    assert.deepEqual(record.iconSizes, [64, 128]);
    if (id.startsWith("CORE-2-")) {
      assert.equal(record.category, "core_hardware");
      assert.deepEqual(record.pendingOutputs, [
        "rank-specific damage overlays",
      ]);
      assert.deepEqual(record.implementedOutputs, [
        "installed module",
        "64px icon",
        "128px icon",
      ]);
    }
    for (const size of record.iconSizes) {
      const name = `w02-icons/${id.toLowerCase()}-icon-${size}.png`;
      const data = await readFile(new URL(name, directory));
      assert.equal(
        data.subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a",
        `Invalid W02 icon: ${name}`,
      );
      assert.equal(data.readUInt32BE(16), size);
      assert.equal(data.readUInt32BE(20), size);
      assert.equal(data[25], 6, "W02 icons must retain alpha");
    }
  }
  assert.deepEqual(registry.pendingBriefs, ["W02-S2"]);
  for (const name of Object.values(registry.gameplayFrames))
    assert.ok(Object.hasOwn(atlas.frames, name));
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await checkFrontierAssets();
  console.log(
    `W02 artwork verified: ${result.count} frames, 17 design briefs, ${result.width}×${result.height}, ${(result.bytes / 1024).toFixed(0)} KiB PNG.`,
  );
}
