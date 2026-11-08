/**
 * `-emissive` siblings (art kit; style guide §4; audit §6.2 and T13b).
 *
 * Glow is never baked. A prop that has lit parts (lamp heads, screens,
 * windows, a beacon's diamond) is described once, with each lit part given
 * twice: unlit, as it looks with the power off, and lit. emissivePair() turns
 * that into two frames of the same size:
 *
 *   <name>            every layer, the lit parts drawn unlit
 *   <name>-emissive   only the lit parts, lit, on transparent, for the game to
 *                     draw ADD above the darkness (T13b sets how it loads them)
 *
 * Authoring only.
 */
import { layer } from "./svg.mjs";

/**
 * `layers` is a list, back to front, of { name, body } for plain layers and
 * { name, unlit, lit } for lit parts. Returns the two frame records
 * { name, width, height, body }, the emissive one only if a part is lit.
 */
export function emissivePair({ name, width, height, layers }) {
  const base = layers
    .map((part) => layer(part.name, part.body ?? part.unlit))
    .join("");
  const lit = layers
    .filter((part) => part.lit)
    .map((part) => layer(`${part.name}-emissive`, part.lit))
    .join("");
  const frames = [{ name, width, height, body: base }];
  if (lit) frames.push({ name: `${name}-emissive`, width, height, body: lit });
  return frames;
}

/** Whether a frame name is an emissive sibling, and of which frame. */
export function emissiveOf(frameName) {
  return frameName.endsWith("-emissive")
    ? frameName.slice(0, -"-emissive".length)
    : null;
}
