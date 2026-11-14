/**
 * Which terrain renderer a page asks for (T2). The field renderer is the
 * default wherever it can run; tier.ts decides that by WebGL, fragment highp
 * and measured frames, never by pointer type:
 *
 *   ?field=1   the field shader, pinned (no measured step down), for
 *              readings and for checks that must run on the field
 *   ?field=0   main's RetainedTerrain (the Low tier and Canvas path)
 *
 * Without the parameter the build-time `VITE_T2_FIELD` ("0" or "1") decides
 * the same way, and without that the field renderer runs with its tier
 * policy on ("auto").
 */
export type FieldRequest = "auto" | "full" | "off";

export function fieldRequest(search: string, env?: string): FieldRequest {
  const value = new URLSearchParams(search).get("field") ?? env;
  if (value === "1") return "full";
  if (value === "0") return "off";
  return "auto";
}

/** `?fieldmax=N`: a debug cap on the field texture's height, to exercise the ring. */
export function fieldTextureLimit(search: string) {
  const value = Number(new URLSearchParams(search).get("fieldmax"));
  return Number.isFinite(value) && value >= 256 ? Math.floor(value) : undefined;
}

/**
 * `?fielddebug=a,b`: switches for readings (docs/qa/t2/README.md, condition
 * 2). They change what a dig costs, never what play is by default:
 *
 *   noupload       patches are built but not sent to the GPU
 *   notransitions  cells change at once, as under the frozen clock
 *   single         one field texture, patched in place (the spike's way)
 *   twotex         two copies; a patch goes to the one the last frame did
 *                  not draw, and to the other a frame later
 *   copy           a patch goes to a small staging texture and is copied
 *                  into the field texture on the GPU
 */
export const FIELD_DEBUG = [
  "noupload",
  "notransitions",
  "single",
  "twotex",
  "copy",
] as const;
export type FieldDebug = (typeof FIELD_DEBUG)[number];

export function fieldDebug(search: string): ReadonlySet<FieldDebug> {
  const asked = (new URLSearchParams(search).get("fielddebug") ?? "").split(
    ",",
  );
  return new Set(FIELD_DEBUG.filter((name) => asked.includes(name)));
}

/** The build-time default (Vite env), read once. */
export const FIELD_ENV: string | undefined =
  typeof import.meta.env !== "undefined"
    ? (import.meta.env.VITE_T2_FIELD as string | undefined)
    : undefined;
