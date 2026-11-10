/**
 * Canonical PNG encoding for the campaign assets (audit T13b, byte-identical
 * rebuilds). Authoring only: the game reads these PNGs like any others.
 *
 * A PNG's bytes depend on the deflater that wrote it. Pillow's bundled zlib-ng
 * and Node's zlib pick SIMD paths at run time, so the same pixels compress to
 * different bytes on another CPU, Node or Pillow release. Every generated PNG
 * is therefore decoded and written again here, in pure JavaScript, with one
 * fixed recipe:
 *
 * - RGBA, 8 bits per channel, not interlaced;
 * - filter type 0 (None) on every row;
 * - zlib stream from pako (pinned in package.json): level 9, windowBits 15,
 *   memLevel 8, default strategy;
 * - chunks IHDR, then IDAT split every 65536 bytes, then IEND; no ancillary
 *   chunks (no gAMA, iCCP, pHYs, tEXt or tIME).
 *
 * The output depends only on the pixels and on pako's version. A pako upgrade
 * changes the bytes, which tests/png-canonical.test.mjs pins with a golden hash.
 */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import pako from "pako";

const PAKO_VERSION = createRequire(import.meta.url)(
  "pako/package.json",
).version;
/** Written into provenance records next to the pages it encoded. */
export const CANONICAL_PNG = `every PNG re-encoded by scripts/png-canonical.mjs (pako ${PAKO_VERSION}: RGBA8, filter 0, deflate level 9, no ancillary chunks)`;

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const IDAT_SIZE = 65536;
export const DEFLATE = Object.freeze({
  level: 9,
  windowBits: 15,
  memLevel: 8,
  strategy: 0,
});

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++)
    crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return ~crc >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode an 8-bit, non-interlaced PNG of any colour type (grey, RGB, palette,
 * grey + alpha, RGBA, with tRNS) to `{ width, height, data }`, where `data` is
 * RGBA8, row by row. Throws on 16-bit or interlaced files, which no campaign
 * build writes.
 */
export function decodePng(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (buf.length < 8 || !SIGNATURE.equals(buf.subarray(0, 8)))
    throw new Error("Not a PNG file");
  let header, palette, transparency;
  const idat = [];
  for (let at = 8; at + 8 <= buf.length;) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") header = data;
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!header || !idat.length) throw new Error("PNG without IHDR or IDAT");
  const width = header.readUInt32BE(0),
    height = header.readUInt32BE(4);
  const depth = header[8],
    colour = header[9],
    interlace = header[12];
  const channels = CHANNELS[colour];
  if (depth !== 8 || interlace !== 0 || !channels)
    throw new Error(
      `Unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`,
    );
  const stride = width * channels;
  const raw = pako.inflate(Buffer.concat(idat));
  if (raw.length !== height * (stride + 1))
    throw new Error(
      `PNG data is ${raw.length} bytes, expected ${height * (stride + 1)}`,
    );
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1,
      dst = y * stride,
      up = dst - stride;
    if (filter === 0) px.set(raw.subarray(src, src + stride), dst);
    else if (filter === 1)
      for (let x = 0; x < stride; x++)
        px[dst + x] =
          raw[src + x] + (x >= channels ? px[dst + x - channels] : 0);
    else if (filter === 2)
      for (let x = 0; x < stride; x++)
        px[dst + x] = raw[src + x] + (y ? px[up + x] : 0);
    else if (filter === 3)
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? px[dst + x - channels] : 0,
          b = y ? px[up + x] : 0;
        px[dst + x] = raw[src + x] + ((a + b) >> 1);
      }
    else if (filter === 4)
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? px[dst + x - channels] : 0,
          b = y ? px[up + x] : 0,
          c = y && x >= channels ? px[up + x - channels] : 0;
        px[dst + x] = raw[src + x] + paeth(a, b, c);
      }
    else throw new Error(`Unknown PNG row filter ${filter}`);
  }
  if (colour === 6) return { width, height, data: px };
  const rgba = new Uint8Array(width * height * 4);
  const key = (i) => transparency?.readUInt16BE(i);
  for (let p = 0, q = 0; p < width * height; p++, q += 4) {
    let r,
      g,
      b,
      a = 255;
    if (colour === 0) {
      r = g = b = px[p];
      if (transparency && key(0) === r) a = 0;
    } else if (colour === 4) {
      r = g = b = px[2 * p];
      a = px[2 * p + 1];
    } else if (colour === 2) {
      r = px[3 * p];
      g = px[3 * p + 1];
      b = px[3 * p + 2];
      if (transparency && key(0) === r && key(2) === g && key(4) === b) a = 0;
    } else {
      const index = px[p];
      r = palette[3 * index];
      g = palette[3 * index + 1];
      b = palette[3 * index + 2];
      if (transparency && index < transparency.length) a = transparency[index];
    }
    rgba[q] = r;
    rgba[q + 1] = g;
    rgba[q + 2] = b;
    rgba[q + 3] = a;
  }
  return { width, height, data: rgba };
}

/** Encode RGBA8 pixels with the canonical recipe described above. */
export function encodePng({ width, height, data }) {
  if (!(width > 0 && height > 0) || data.length !== width * height * 4)
    throw new Error(`RGBA data of ${data.length} bytes for ${width}x${height}`);
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++)
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const stream = pako.deflate(raw, DEFLATE);
  const parts = [SIGNATURE, chunk("IHDR", header)];
  for (let at = 0; at < stream.length; at += IDAT_SIZE)
    parts.push(chunk("IDAT", stream.subarray(at, at + IDAT_SIZE)));
  parts.push(chunk("IEND", new Uint8Array(0)));
  return Buffer.concat(parts);
}

/** The canonical bytes for a PNG file's bytes. */
export function canonicalPng(bytes) {
  return encodePng(decodePng(bytes));
}

async function canonicalizeFile(path) {
  const bytes = await readFile(path);
  const canonical = canonicalPng(bytes);
  if (canonical.equals(bytes)) return false;
  await writeFile(path, canonical);
  return true;
}

/**
 * Rewrite each PNG in `paths` (strings or file URLs) in canonical form, in
 * parallel worker threads. A file already canonical is left untouched. The
 * result never depends on the number of workers or their order: each file is
 * encoded on its own. Returns `{ files, rewritten }`.
 */
export async function canonicalizePngs(
  paths,
  { workers = availableParallelism() } = {},
) {
  const files = await Promise.all(
    [
      ...new Set(paths.map((p) => (p instanceof URL ? fileURLToPath(p) : p))),
    ].map(async (path) => ({ path, size: (await stat(path)).size })),
  );
  if (!files.length) return { files: 0, rewritten: 0 };
  files.sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1));
  const count = Math.max(1, Math.min(workers, files.length));
  const shards = Array.from({ length: count }, (_, k) =>
    files.filter((_, i) => i % count === k).map((file) => file.path),
  );
  const rewritten = await Promise.all(
    shards.map(
      (shard) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { canonicalPngShard: shard },
          });
          worker.once("message", resolve);
          worker.once("error", reject);
          worker.once("exit", (code) => {
            if (code !== 0) reject(new Error(`PNG worker exited with ${code}`));
          });
        }),
    ),
  );
  return {
    files: files.length,
    rewritten: rewritten.reduce((a, b) => a + b, 0),
  };
}

/** Every `.png` directly in `directory` (a file URL), filtered by name. */
export async function pngFiles(directory, keep = () => true) {
  const names = (await readdir(directory)).filter(
    (name) => name.endsWith(".png") && keep(name),
  );
  return names.sort().map((name) => fileURLToPath(new URL(name, directory)));
}

if (!isMainThread && Array.isArray(workerData?.canonicalPngShard)) {
  let rewritten = 0;
  for (const path of workerData.canonicalPngShard)
    if (await canonicalizeFile(path)) rewritten++;
  parentPort.postMessage(rewritten);
}
