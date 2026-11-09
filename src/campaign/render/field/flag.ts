/**
 * T2 spike flag: the WebGL field renderer replaces RetainedTerrain only when
 * asked. `?field=1` turns it on (the phone test uses this), `?field=0` turns
 * it off; without the parameter the build-time `VITE_T2_FIELD=1` decides,
 * so a dev server started with it runs every browser suite with the field
 * on. Off by default: main's renderer path is untouched.
 */
export function fieldRequested(search: string, env?: string) {
  const value = new URLSearchParams(search).get("field");
  if (value === "1") return true;
  if (value === "0") return false;
  return env === "1";
}

/** The build-time default (Vite env), read once. */
export const FIELD_ENV: string | undefined =
  typeof import.meta.env !== "undefined"
    ? (import.meta.env.VITE_T2_FIELD as string | undefined)
    : undefined;
