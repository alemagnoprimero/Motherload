/**
 * The field renderer's colours: the swatch cards' roles per band (art item
 * A1, docs/art-direction/swatches/w01-swatches.json), which sit on the D6 L*
 * ladder at every depth: unknown about 24, lit wall about 40, lip about 92,
 * crack 18, dug back wall 15, cave air 14. Bands B and D are A and C with
 * the hue turned by 15° at held L* (ΔE 1 to 3 on slate).
 * tests/campaign-render-field.test.ts holds W01 against the JSON.
 *
 * W02 has no card yet: its key is the audit's provisional one (§2, "W02
 * comet"; D13 approves or replaces it): unexplored ice-rock in the 64 to 75
 * luma range once its courses, facets and pebbles are drawn (the base is
 * L* 28, luma 65; the frame reads about 71), lit walls at L* 47.5 (luma
 * 112), so that lit hard rock, which is the lit colour at 0.79, stays 15
 * above unknown; cave air blue-teal at L* 15.5; a cool lip at L* 91.6; each
 * band's hue turned from A's (232°: B 247°, C 217°, D 262°) at held L*.
 * Made with the cards' own LCh conversion (scripts/swatch-cards.py
 * lch_rgb): unknown and crack (L* 21.5) at chroma 9, lit 7, back wall
 * (L* 17) 9, cave air 11, lip 5 at the hue less 20°.
 */
export interface FieldBandPalette {
  unknown: string;
  lit: string;
  lip: string;
  crack: string;
  backWall: string;
  caveAir: string;
  /** Rust seams along ceiling joints; absent where the band has none. */
  rust?: string;
  /** How much of the rust this band's ceilings carry (0 to 1). */
  rustAmount?: number;
  /** The rock's pattern: strata (slabs in courses), blocks or rubble. */
  kind: "strata" | "blocks" | "rubble";
}

export type FieldBandId = "a" | "b" | "c" | "d";

export const FIELD_PALETTES: Readonly<
  Record<"W01" | "W02", Readonly<Record<FieldBandId, FieldBandPalette>>>
> = {
  W01: {
    a: {
      unknown: "#303941",
      lit: "#575e64",
      lip: "#f0e6d2",
      crack: "#242e36",
      backWall: "#1e282e",
      caveAir: "#17242e",
      kind: "strata",
    },
    b: {
      unknown: "#2e3a41",
      lit: "#555e63",
      lip: "#f5e4d2",
      crack: "#222e34",
      backWall: "#1d282c",
      caveAir: "#14252d",
      kind: "strata",
    },
    c: {
      unknown: "#303941",
      lit: "#575e64",
      lip: "#f0e6d2",
      crack: "#242e36",
      backWall: "#1b2933",
      caveAir: "#17242e",
      rust: "#89532b",
      rustAmount: 1,
      kind: "blocks",
    },
    d: {
      unknown: "#323841",
      lit: "#595e65",
      lip: "#ebe8d3",
      crack: "#262d36",
      backWall: "#1f2833",
      caveAir: "#1b232e",
      rust: "#7e5924",
      rustAmount: 0.6,
      kind: "rubble",
    },
  },
  W02: {
    a: {
      unknown: "#31454d",
      lit: "#637379",
      lip: "#dceaec",
      crack: "#23363d",
      backWall: "#192d34",
      caveAir: "#102a33",
      kind: "strata",
    },
    b: {
      unknown: "#34444e",
      lit: "#66737c",
      lip: "#dce9ee",
      crack: "#263640",
      backWall: "#1c2c36",
      caveAir: "#142935",
      kind: "strata",
    },
    c: {
      unknown: "#30464a",
      lit: "#627478",
      lip: "#dceaea",
      crack: "#22373b",
      backWall: "#182d31",
      caveAir: "#0e2b30",
      kind: "blocks",
    },
    d: {
      unknown: "#38434f",
      lit: "#69727d",
      lip: "#dee9f0",
      crack: "#2a3541",
      backWall: "#202b36",
      caveAir: "#192836",
      kind: "rubble",
    },
  },
};

export const FIELD_BANDS: readonly FieldBandId[] = ["a", "b", "c", "d"];
export const FIELD_KINDS = { strata: 0, blocks: 1, rubble: 2 } as const;

export function hexToVec3(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

/** One role of a world's four bands as 12 floats, for a vec3[4] uniform. */
export function roleUniform(
  worldId: string,
  pick: (band: FieldBandPalette) => string,
) {
  const world = FIELD_PALETTES[worldId === "W02" ? "W02" : "W01"];
  return new Float32Array(
    FIELD_BANDS.flatMap((id) => hexToVec3(pick(world[id]))),
  );
}
