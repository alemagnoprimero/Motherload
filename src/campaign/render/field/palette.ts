/**
 * The slate material of the T2 spike: band A's roles on the W01 swatch cards
 * (docs/art-direction/swatches/w01-swatches.json, art item A1), which sit on
 * the D6 L* ladder: unknown 23.5, lit wall 39.5, lip 91.6, crack 18.3, dug
 * back wall ("interior") 15.4, cave air 13.5; rust from band C. Bands B and
 * D turn the hue by 15° at held L* (ΔE 1 to 3 on slate), which the spike
 * leaves out. tests/campaign-render-field.test.ts checks these against the
 * JSON.
 */
export const FIELD_PALETTE = {
  unknown: "#303941",
  lit: "#575e64",
  lip: "#f0e6d2",
  crack: "#242e36",
  interior: "#1e282e",
  caveAir: "#17242e",
  rust: "#89532b",
} as const;

export function hexToVec3(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}
