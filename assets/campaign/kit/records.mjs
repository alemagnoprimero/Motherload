/**
 * frames.json and provenance writers (art kit; audit §6.2, decision D5).
 *
 * create-w01-sources.mjs writes the W01 frames.json for everything it draws.
 * An asset authored elsewhere (a hand-written layered SVG, a new generator)
 * adds its frames with upsertFrames(), which replaces entries by name and
 * keeps every other entry and its order. Each asset also gets a provenance
 * record at assets/campaign/source/provenance/<asset>.json: how it was made,
 * the reference used, who reviewed it, the redrawn share, any underlay, and
 * that no board pixels were copied. Records carry the dates they are given,
 * never the clock, so they rebuild byte-identically.
 *
 * Authoring only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
export const PROVENANCE_DIR = new URL(
  "assets/campaign/source/provenance/",
  root,
);

function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * Put `frames` and `backgrounds` records into a frames.json (a path or URL),
 * replacing any with the same name; new names go at the end, in order.
 */
export async function upsertFrames(file, { frames = [], backgrounds = [] }) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  for (const [key, records] of [
    ["frames", frames],
    ["backgrounds", backgrounds],
  ]) {
    const list = manifest[key] ?? [];
    for (const record of records) {
      const index = list.findIndex((entry) => entry.name === record.name);
      if (index >= 0) list[index] = record;
      else list.push(record);
    }
    manifest[key] = list;
  }
  await writeFile(file, json(manifest));
  return manifest;
}

const REQUIRED = [
  "asset",
  "item",
  "method",
  "source",
  "reference",
  "reviewer",
  "redrawnShare",
  "underlays",
  "boardPixelsCopied",
];

/**
 * A provenance record with its keys in a fixed order, checked: every
 * required field present, a redrawn share between 0 and 1, and each underlay
 * with its tool, prompt, date and SHA-256 (D5). Board pixels are never
 * copied, so `boardPixelsCopied` must be false.
 */
export function provenanceRecord(fields) {
  for (const key of REQUIRED)
    if (!(key in fields)) throw new Error(`Provenance needs "${key}"`);
  if (fields.boardPixelsCopied !== false)
    throw new Error("Provenance: board pixels are never copied into assets");
  if (!(fields.redrawnShare >= 0 && fields.redrawnShare <= 1))
    throw new Error("Provenance: redrawnShare is a share from 0 to 1");
  for (const underlay of fields.underlays)
    for (const key of ["tool", "prompt", "date", "sha256"])
      if (!underlay[key]) throw new Error(`Provenance underlay needs "${key}"`);
  const ordered = {};
  for (const key of REQUIRED) ordered[key] = fields[key];
  for (const [key, value] of Object.entries(fields))
    if (!(key in ordered)) ordered[key] = value;
  return ordered;
}

/** Write assets/campaign/source/provenance/<asset>.json; returns its URL. */
export async function writeProvenance(asset, fields) {
  await mkdir(PROVENANCE_DIR, { recursive: true });
  const file = new URL(`${asset}.json`, PROVENANCE_DIR);
  await writeFile(file, json(provenanceRecord(fields)));
  return file;
}
