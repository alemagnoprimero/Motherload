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

/** `?fieldmax=N`: a debug cap on the field texture's size, to exercise the ring. */
export function fieldTextureLimit(search: string) {
  const value = Number(new URLSearchParams(search).get("fieldmax"));
  return Number.isFinite(value) && value >= 256 ? Math.floor(value) : undefined;
}

/** The build-time default (Vite env), read once. */
export const FIELD_ENV: string | undefined =
  typeof import.meta.env !== "undefined"
    ? (import.meta.env.VITE_T2_FIELD as string | undefined)
    : undefined;
