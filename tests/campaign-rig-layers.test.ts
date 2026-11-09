import { describe, expect, it } from "vitest";
import type { Campaign } from "../src/campaign/model";
import {
  RIG_EMISSIVE_DEPTH,
  emissiveDepth,
} from "../src/campaign/render/emissive";
import { renderRig, type RigFrame } from "../src/campaign/render/rig";
import {
  RIG_DEPTH,
  RIG_LAYERS,
  rigLayerOf,
} from "../src/campaign/render/rig-layers";
import { ZONE_MANIFESTS, WORLD_IDS } from "../src/campaign/render/zones";

// Art item A13: one depth per rig layer (render/rig-layers.json). Phaser
// sorts the display list with a stable sort, so layers that share a depth
// keep the previous frame's order (the T13b captures saw the engine and the
// bay swap between runs); distinct depths draw the same stack every frame.

/** A Graphics stand-in: every drawing call is a no-op. */
const graphics = () =>
  new Proxy(
    {},
    { get: () => () => undefined },
  ) as unknown as RigFrame["screen"];

interface Drawn {
  frame: string;
  depth: number;
  flip: boolean;
}

/** Calls renderRig with a stand-in campaign; returns what image() was asked for. */
function draw(options: {
  world?: "W01" | "W02";
  hardware?: number;
  processor?: string;
  drill?: string;
  utilities?: string[];
  drillDirection?: "" | "right" | "down" | "left";
  facing?: "left" | "right";
  hull?: number;
}) {
  const level = options.hardware ?? 0;
  const campaign = {
    world: { id: options.world ?? "W01" },
    state: {
      vehicle: { hull: options.hull ?? 100, energy: 100 },
      hardware: {
        engine: level,
        energy: level,
        cargo: level,
        hull: level,
        drill: level,
      },
      equipped: {
        mobility: "W01-R2",
        processor: options.processor ?? "W01-R3",
        drill: options.drill ?? "",
        utilities: options.utilities ?? [],
      },
    },
    velocityX: 0,
    facing: options.facing ?? "right",
    grounded: true,
    thrusting: true,
    feetDeployed: true,
    drillDirection: options.drillDirection ?? "",
    precisionActive: false,
    volatileWindow: undefined,
    drillTarget: undefined,
    drillProgress: 0,
    maxHull: 100,
    maxEnergy: 100,
  } as unknown as Campaign;
  const drawn: Drawn[] = [];
  renderRig({
    campaign,
    image: (frame, _x, _y, _w, _h, depth = 0, _alpha, flip = false) => {
      drawn.push({ frame, depth, flip });
      return true;
    },
    screen: graphics(),
    edges: graphics(),
    effects: graphics(),
    tile: 48,
    px: 100,
    py: 100,
    elapsed: 0.3,
    paused: false,
    reducedMotion: false,
    highContrast: false,
    width: 800,
    height: 600,
    damageLife: 0,
    overlays: true,
  });
  return drawn;
}

describe("rig layers: one depth each", () => {
  it("keeps every layer in the rig band, in order, with distinct depths", () => {
    const depths = RIG_LAYERS.map(({ depth }) => depth);
    expect(new Set(depths).size).toBe(depths.length);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    // Above the light map (17) and T1-lite (17.5), below the effects (24).
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...depths)).toBeLessThan(RIG_EMISSIVE_DEPTH);
    expect(RIG_EMISSIVE_DEPTH).toBeLessThan(24);
    expect(RIG_LAYERS.map(({ layer }) => layer)).toEqual([
      "thrust",
      "body",
      "engine",
      "energy",
      "bay",
      "cabin",
      "hull",
      "damage",
      "feet",
      "rack",
      "thermal",
      "condenser",
      "preservation",
      "drill",
      "collar",
    ]);
  });

  it("gives every rig, tool and thrust frame in both worlds a layer", () => {
    for (const world of WORLD_IDS)
      for (const name of Object.keys(ZONE_MANIFESTS[world].frames)) {
        if (!/^(rig-|tool-|thrust-)/.test(name) || name.endsWith("-emissive"))
          continue;
        expect(rigLayerOf(name), `${world} ${name}`).toBeDefined();
      }
    expect(rigLayerOf("rig-drill-collar-down-2")).toBe("collar");
    expect(rigLayerOf("rig-drill-down-3")).toBe("drill");
    expect(rigLayerOf("rig-drill-idle")).toBe("drill");
    expect(rigLayerOf("rig-cabin-emissive")).toBeUndefined();
    expect(rigLayerOf("ore-o1")).toBeUndefined();
  });

  it("draws each layer at its own depth, whatever is equipped", () => {
    const configurations = [
      { hardware: 0 },
      { hardware: 1, drillDirection: "down" as const, hull: 10 },
      { hardware: 1, facing: "left" as const, hull: 50 },
      {
        world: "W02" as const,
        hardware: 2,
        processor: "W02-R3",
        drill: "W02-R1",
        utilities: ["W02-R2"],
        drillDirection: "left" as const,
        hull: 30,
      },
      {
        world: "W02" as const,
        hardware: 2,
        drill: "W02-R1",
        utilities: ["W02-R2"],
      },
    ];
    const layersSeen = new Set<string>();
    for (const configuration of configurations) {
      const drawn = draw(configuration);
      for (const { frame, depth } of drawn) {
        const layer = rigLayerOf(frame);
        expect(layer, frame).toBeDefined();
        expect(depth, frame).toBe(RIG_DEPTH[layer!]);
        layersSeen.add(layer!);
      }
      const depths = drawn.map(({ depth }) => depth);
      expect(new Set(depths).size, JSON.stringify(drawn)).toBe(depths.length);
    }
    // Every layer of the table was drawn by some configuration.
    expect([...layersSeen].sort()).toEqual(
      RIG_LAYERS.map(({ layer }) => layer).sort(),
    );
  });

  it("draws the rig's siblings above every layer, in one ADD band", () => {
    for (const { depth } of RIG_LAYERS)
      expect(emissiveDepth(depth)).toBe(RIG_EMISSIVE_DEPTH);
  });
});
