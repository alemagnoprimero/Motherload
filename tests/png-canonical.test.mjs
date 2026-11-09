// Audit T13b: the canonical PNG encoder behind byte-identical asset rebuilds.
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import {
  canonicalPng,
  canonicalizePngs,
  decodePng,
  encodePng,
} from "../scripts/png-canonical.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Red, half-transparent green, invisible blue; then three odd values.
const tiny = {
  width: 3,
  height: 2,
  data: Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 12, 34, 56, 78, 255, 255, 255,
    255, 0, 0, 0, 1,
  ]),
};

// Seeded noise: it does not compress, so its stream spans several IDATs.
function noise(width, height) {
  let state = 1;
  const data = Uint8Array.from(
    { length: width * height * 4 },
    () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) >>> 24,
  );
  return { width, height, data };
}

function chunks(png) {
  const out = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    out.push({ type: png.toString("latin1", at + 4, at + 8), length });
    at += 12 + length;
  }
  return out;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  let crc = -1;
  for (const byte of body) crc = CRC[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(~crc >>> 0, body.length + 4);
  return out;
}

/** The same pixels written another way: Paeth/Sub rows, node's zlib, extra chunks. */
function otherwiseEncoded({ width, height, data }, colour = 6) {
  const channels = { 4: 2, 6: 4 }[colour];
  const stride = width * channels;
  const px = new Uint8Array(height * stride);
  for (let p = 0; p < width * height; p++)
    if (colour === 6) px.set(data.subarray(4 * p, 4 * p + 4), 4 * p);
    else px.set([data[4 * p], data[4 * p + 3]], 2 * p);
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const filter = y % 2 ? 4 : 1;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const v = px[y * stride + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      const predictor =
        filter === 1 ? a : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[y * (stride + 1) + 1 + x] = (v - predictor) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colour;
  const stream = deflateSync(raw, { level: 1 });
  const half = Math.ceil(stream.length / 2);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("gAMA", Buffer.from([0, 0, 177, 143])),
    chunk("tEXt", Buffer.from("Software\0another encoder", "latin1")),
    chunk("IDAT", stream.subarray(0, half)),
    chunk("IDAT", stream.subarray(half)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("canonical PNG encoder (T13b)", () => {
  it("writes the golden bytes for a fixed image (catches a pako change)", () => {
    expect(createRequire(import.meta.url)("pako/package.json").version).toBe(
      "2.1.0",
    );
    const png = encodePng(tiny);
    expect(png.length).toBe(86);
    expect(sha256(png)).toBe(
      "dc1f1d7997ea3ba347aba804fd3c74bee316c10af927877dbd34186b3e5e0c1c",
    );
    const big = encodePng(noise(256, 256));
    expect(sha256(big)).toBe(
      "279206122ac7f99193e94b54f9984b0071143de7dce8201e7768af4fc9087911",
    );
  });

  it("writes IHDR, IDATs of 65536 bytes, IEND and nothing else", () => {
    const list = chunks(encodePng(noise(256, 256)));
    expect(list[0]).toEqual({ type: "IHDR", length: 13 });
    expect(list.at(-1)).toEqual({ type: "IEND", length: 0 });
    const idat = list.slice(1, -1);
    expect(idat.length).toBeGreaterThan(2);
    expect(idat.every((c) => c.type === "IDAT")).toBe(true);
    expect(idat.slice(0, -1).every((c) => c.length === 65536)).toBe(true);
    expect(idat.at(-1).length).toBeLessThanOrEqual(65536);
  });

  it("filters every row with type 0 and decodes back to the same pixels", () => {
    for (const image of [tiny, noise(37, 11)]) {
      const png = encodePng(image);
      const decoded = decodePng(png);
      expect(decoded.width).toBe(image.width);
      expect(decoded.height).toBe(image.height);
      expect(Buffer.from(decoded.data).equals(Buffer.from(image.data))).toBe(
        true,
      );
    }
  });

  it("gives the same bytes for the same pixels however they were encoded", () => {
    const image = noise(29, 13);
    const canonical = encodePng(image);
    const other = otherwiseEncoded(image);
    expect(other.equals(canonical)).toBe(false);
    expect(canonicalPng(other).equals(canonical)).toBe(true);
    expect(canonicalPng(canonical).equals(canonical)).toBe(true);
    // Grey + alpha decodes to RGBA with r = g = b.
    const grey = { ...image, data: Uint8Array.from(image.data) };
    for (let p = 0; p < grey.data.length; p += 4)
      grey.data[p + 1] = grey.data[p + 2] = grey.data[p];
    expect(
      canonicalPng(otherwiseEncoded(grey, 4)).equals(encodePng(grey)),
    ).toBe(true);
  });

  describe("canonicalizePngs", () => {
    let folder;
    afterAll(() => folder && rm(folder, { recursive: true, force: true }));
    it("rewrites only the files that are not canonical yet", async () => {
      folder = await mkdtemp(join(tmpdir(), "png-canonical-"));
      const images = [tiny, noise(64, 40), noise(9, 70)];
      const paths = images.map((_, i) => join(folder, `${i}.png`));
      await writeFile(paths[0], encodePng(images[0]));
      await writeFile(paths[1], otherwiseEncoded(images[1]));
      await writeFile(paths[2], otherwiseEncoded(images[2]));
      expect(await canonicalizePngs(paths, { workers: 2 })).toEqual({
        files: 3,
        rewritten: 2,
      });
      for (const [i, path] of paths.entries())
        expect((await readFile(path)).equals(encodePng(images[i]))).toBe(true);
      expect(await canonicalizePngs(paths)).toEqual({ files: 3, rewritten: 0 });
    });
  });
});
