import rigLayers from "./rig-layers.json";

/*
 * Art item A13: the rig's layers, one depth each (rig-layers.json, which
 * scripts/art-review-a13.mjs also reads, so the review sheets composite the
 * rig in the order the game draws it).
 *
 * Every layer shares the rig's position and size; they stack back to front:
 * thrust 18, body 20, engine 21, energy 21.1, bay 21.2, cabin 22, hull 22.1,
 * damage 22.5, feet 23, rack 23.1, the W02 tools 23.2–23.4, drill 23.5,
 * collar 23.6. No two share a depth. Phaser 3.90 sorts the display list with
 * a stable sort on depth, so sprites at one depth keep the previous frame's
 * order, which depends on how many sprites were drawn before (the T13b
 * captures saw the engine and the bay swap between runs); distinct depths
 * make the order the same on every frame. Everything stays inside the rig
 * band, above the light map (17) and T1-lite (17.5), below the effects (24).
 */

export type RigLayer =
  | "thrust"
  | "body"
  | "engine"
  | "energy"
  | "bay"
  | "cabin"
  | "hull"
  | "damage"
  | "feet"
  | "rack"
  | "thermal"
  | "condenser"
  | "preservation"
  | "drill"
  | "collar";

interface LayerRecord {
  layer: RigLayer;
  /** The frames drawn on this layer, as a regular expression. */
  frames: string;
  depth: number;
}

/** The layers, back to front. */
export const RIG_LAYERS: readonly LayerRecord[] = (
  rigLayers.layers as LayerRecord[]
).map((record) => Object.freeze({ ...record }));

/** The depth of each rig layer. */
export const RIG_DEPTH: Readonly<Record<RigLayer, number>> = Object.freeze(
  Object.fromEntries(
    RIG_LAYERS.map(({ layer, depth }) => [layer, depth]),
  ) as Record<RigLayer, number>,
);

/**
 * Where every rig `-emissive` sibling draws (render/emissive.ts): one depth
 * above every rig layer, so all of them make one ADD run and the lit parts
 * add over whatever rig layer lies under them, as the review composites
 * (sheet-emissive) show it.
 */
export const RIG_EMISSIVE_DEPTH: number = rigLayers.emissive;

const PATTERNS = RIG_LAYERS.map(
  ({ layer, frames }) => [layer, new RegExp(frames)] as const,
);

/** The rig layer a frame is drawn on, or undefined for a non-rig frame. */
export function rigLayerOf(frame: string): RigLayer | undefined {
  return PATTERNS.find(([, pattern]) => pattern.test(frame))?.[0];
}
