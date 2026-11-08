/**
 * Seeded random source for the art generators (art kit, item A4).
 *
 * The same seed gives the same numbers on every machine: the generator is
 * mulberry32 on 32-bit integer arithmetic, and the seed is a string hashed with
 * FNV-1a. Use `fork(label)` for each independent decision (peak spacing,
 * heights, facets...): a fork depends only on the seed and its label, so adding
 * a draw to one stream never shifts the numbers of another.
 *
 * Authoring only: the game never imports this module.
 */

/** FNV-1a, 32 bits, over the UTF-16 code units of `text`. */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A random stream for `seed` (a string or a 32-bit number). */
export function random(seed) {
  const label = String(seed);
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(label);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: label,
    /** A number in [0, 1). */
    next,
    /** A number in [low, high). */
    range: (low, high) => low + (high - low) * next(),
    /** An integer in [low, high], both included. */
    int: (low, high) => low + Math.floor((high - low + 1) * next()),
    /** `value` moved by up to `amount` either way. */
    jitter: (value, amount) => value + (next() * 2 - 1) * amount,
    chance: (probability) => next() < probability,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** A copy of `list` in a seeded order. */
    shuffle: (list) => {
      const copy = [...list];
      for (let index = copy.length - 1; index > 0; index--) {
        const other = Math.floor(next() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
      }
      return copy;
    },
    /** An independent stream named `name`, stable however this one is used. */
    fork: (name) => random(`${label}/${name}`),
  };
}
