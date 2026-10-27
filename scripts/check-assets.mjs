import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Normal builds use the committed renders; Blender is only needed to author
// new artwork. Fail before publishing if those renders are absent or invalid.
const directory = new URL("../assets/generated/", import.meta.url);
const [png, raw] = await Promise.all([
  readFile(new URL("frontier-atlas.png", directory)),
  readFile(new URL("frontier-atlas.json", directory), "utf8"),
]).catch((error) => {
  throw new Error(
    "Generated artwork is missing. Restore assets/generated from Git or run npm run assets:build with Blender installed.",
    { cause: error },
  );
});
assert.ok(png.length > 32, "Atlas PNG is empty");
assert.equal(
  png.subarray(0, 8).toString("hex"),
  "89504e470d0a1a0a",
  "Invalid atlas PNG",
);
const width = png.readUInt32BE(16),
  height = png.readUInt32BE(20);
assert.ok(
  width > 0 && height > 0 && width <= 4096 && height <= 4096,
  "Atlas exceeds the mobile texture budget",
);
const atlas = JSON.parse(raw);
assert.ok(
  atlas.frames && typeof atlas.frames === "object",
  "Atlas frames are missing",
);
const expected = [
  ...["idle", "drive", "flight", "side", "down", "damaged"].flatMap((state) =>
    Array.from(
      { length: state === "idle" || state === "damaged" ? 1 : 4 },
      (_, frame) => `rig-${state}-${frame}`,
    ),
  ),
  ...["exchange", "fuel", "repair", "upgrades"].map((id) => `building-${id}`),
  ...[3, 4, 5, 6, 9, 10, 11, 12, 13, 14].map((id) => `ore-${id}`),
];
for (const name of expected)
  assert.ok(Object.hasOwn(atlas.frames, name), `Missing 3D asset: ${name}`);
for (const [name, entry] of Object.entries(atlas.frames)) {
  const { x, y, w, h } = entry.frame ?? {};
  assert.ok(
    [x, y, w, h].every(Number.isInteger),
    `Invalid frame coordinates: ${name}`,
  );
  assert.ok(
    x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height,
    `Frame outside atlas: ${name}`,
  );
}
console.log(
  `3D artwork verified: ${expected.length} required frames, ${width}×${height}, ${(png.length / 1024).toFixed(0)} KiB PNG.`,
);
