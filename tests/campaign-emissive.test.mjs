import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sceneSource from "../src/campaign/scene.ts?raw";
import { decodePng } from "../scripts/png-canonical.mjs";
import { ZONE_MANIFESTS, WORLD_IDS } from "../src/campaign/render/zones";
import {
  EmissivePass,
  RIG_EMISSIVE_OFFSET,
  SCENERY_EMISSIVE_DEPTH,
  cellsUnder,
  emissiveDepth,
  emissiveSibling,
  spriteBounds,
} from "../src/campaign/render/emissive";

// Audit T13b (a): `-emissive` siblings, packed beside their base and drawn
// by the runtime with ADD above the darkness (src/campaign/render/emissive.ts,
// assets/campaign/kit/README.md "Emissive siblings at runtime").
const read = (path) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SOURCES = {
  W01: read("assets/campaign/source/frames.json").frames,
  W02: read("assets/campaign/w02/frames.json").frames,
};
const LIGHT_MAP_DEPTH = 17; // render/lighting.ts
const T1_LITE_DEPTH = 17.5; // render/t1-lite-headlamp.ts

describe("emissive siblings: frames and pages", () => {
  const pairs = WORLD_IDS.flatMap((world) =>
    Object.keys(ZONE_MANIFESTS[world].frames)
      .filter((name) => name.endsWith("-emissive"))
      .map((name) => ({
        world,
        name,
        base: name.slice(0, -"-emissive".length),
      })),
  );
  it("has the beacon's lamp as the first sibling, and only in W01", () => {
    expect(pairs.map(({ world, name }) => `${world}:${name}`)).toContain(
      "W01:mission-beacon-emissive",
    );
    expect(emissiveSibling("W01", "mission-beacon")).toBe(
      "mission-beacon-emissive",
    );
    expect(emissiveSibling("W02", "mission-beacon")).toBeUndefined();
    expect(emissiveSibling("W01", "mission-valve")).toBeUndefined();
    expect(emissiveSibling("W01", "mission-beacon-emissive")).toBeUndefined();
  });
  it("pairs every sibling with a same-size base on the same page", () => {
    for (const { world, name, base } of pairs) {
      const manifest = ZONE_MANIFESTS[world];
      const source = SOURCES[world];
      const own = source.find((frame) => frame.name === name);
      const owner = source.find((frame) => frame.name === base);
      expect(owner, `${world} ${name} has a base`).toBeDefined();
      expect([own.width, own.height, own.logicalWidth]).toEqual([
        owner.width,
        owner.height,
        owner.logicalWidth,
      ]);
      expect(manifest.frames[name]).toBe(manifest.frames[base]);
      const pages = manifest.pages.filter((page) => page.frames.includes(name));
      expect(pages.length).toBeGreaterThan(0);
      expect(
        manifest.pages.filter((page) => page.frames.includes(base)),
      ).toEqual(pages);
      for (const page of pages) {
        const atlas = read(`assets/campaign/generated/${page.data}`);
        const glow = atlas.frames[name],
          lit = atlas.frames[base];
        // Same source size and pivot: the same scale and origin register
        // the trimmed sibling exactly on its base.
        expect(glow.sourceSize, `${page.key} ${name}`).toEqual(lit.sourceSize);
        expect(glow.pivot).toEqual(lit.pivot);
        // Its lit pixels are on the page.
        const png = decodePng(
          readFileSync(
            new URL(
              `../assets/campaign/generated/${page.image}`,
              import.meta.url,
            ),
          ),
        );
        let litPixels = 0;
        for (let y = 0; y < glow.frame.h; y++)
          for (let x = 0; x < glow.frame.w; x++)
            if (
              png.data[
                ((glow.frame.y + y) * png.width + glow.frame.x + x) * 4 + 3
              ] > 0
            )
              litPixels++;
        expect(litPixels, `${page.key} ${name}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("emissive siblings: depth", () => {
  it("draws scenery siblings in one band above the darkness and T1-lite", () => {
    for (const depth of [10, 13, 14, 15, 16, 17])
      expect(emissiveDepth(depth)).toBe(SCENERY_EMISSIVE_DEPTH);
    expect(SCENERY_EMISSIVE_DEPTH).toBeGreaterThan(LIGHT_MAP_DEPTH);
    expect(SCENERY_EMISSIVE_DEPTH).toBeGreaterThan(T1_LITE_DEPTH);
    expect(SCENERY_EMISSIVE_DEPTH).toBeLessThan(18);
  });
  it("draws rig siblings just above their own layer, below the effects", () => {
    for (const depth of [18, 20, 21, 22, 23]) {
      expect(emissiveDepth(depth)).toBe(depth + RIG_EMISSIVE_OFFSET);
      expect(emissiveDepth(depth)).toBeLessThan(Math.floor(depth) + 1);
    }
    expect(emissiveDepth(23)).toBeLessThan(24);
  });
});

/** A stand-in for a Phaser Image: the fields and setters the pass uses. */
class FakeImage {
  x = 0;
  y = 0;
  originX = 0.5;
  originY = 0.5;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  flipX = false;
  alpha = 1;
  depth = 0;
  blendMode = 0;
  visible = true;
  mask = null;
  frame = { name: "__BASE" };
  constructor(key = "__DEFAULT", frames = []) {
    this.texture = { key, has: (frame) => frames.includes(frame) };
  }
  setTexture(key, frame) {
    this.texture = { key, has: () => true };
    this.frame = { name: frame };
    return this;
  }
  setOrigin(x, y) {
    this.originX = x;
    this.originY = y;
    return this;
  }
  setScale(x, y) {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setPosition(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  setRotation(value) {
    this.rotation = value;
    return this;
  }
  setFlipX(value) {
    this.flipX = value;
    return this;
  }
  setAlpha(value) {
    this.alpha = value;
    return this;
  }
  setDepth(value) {
    this.depth = value;
    return this;
  }
  setBlendMode(value) {
    this.blendMode = value;
    return this;
  }
  setVisible(value) {
    this.visible = value;
    return this;
  }
  setMask(mask) {
    this.mask = mask;
    return this;
  }
  clearMask() {
    this.mask = null;
    return this;
  }
}
const page = "campaign-w01-core-hero-3x-0";
/** A drawn beacon base, as image() leaves it after the pixel snap. */
function beacon() {
  const base = new FakeImage(page, [
    "mission-beacon",
    "mission-beacon-emissive",
  ])
    .setPosition(101.5, 64.25)
    .setOrigin(0.5, 0.5)
    .setScale(0.81, 1.08)
    .setRotation(0.03)
    .setFlipX(true)
    .setAlpha(0.42)
    .setDepth(15);
  base.frame = { name: "mission-beacon" };
  return base;
}

describe("emissive siblings: the ADD pass", () => {
  it("draws a sibling only for a base drawn this frame", () => {
    const pool = [];
    const pass = new EmissivePass(() => {
      const fake = new FakeImage();
      pool.push(fake);
      return fake;
    });
    pass.begin();
    expect(pass.draw()).toBe(0);
    expect(pool).toHaveLength(0);
    // A frame with no sibling, or a page without it, queues nothing.
    const valve = new FakeImage(page, ["mission-valve"]);
    expect(pass.queue(valve, "W01", "mission-valve", 15)).toBeUndefined();
    const elsewhere = new FakeImage("campaign-w01-core-3x-0", [
      "mission-beacon",
    ]);
    expect(pass.queue(elsewhere, "W01", "mission-beacon", 15)).toBeUndefined();
    expect(pass.draw()).toBe(0);
    // The beacon's base was drawn: its sibling follows.
    const base = beacon();
    expect(pass.queue(base, "W01", "mission-beacon", 15)).toBe(
      "mission-beacon-emissive",
    );
    expect(pass.draw()).toBe(1);
    expect(pass.count).toBe(1);
    // Next frame, the base is not drawn again: the sibling goes.
    pass.begin();
    expect(pass.count).toBe(0);
    expect(pool.every((sprite) => !sprite.visible)).toBe(true);
    expect(pass.draw()).toBe(0);
    expect(pass.drawn()).toEqual([]);
  });
  it("copies the base's final state and draws ADD at the emissive depth", () => {
    const pass = new EmissivePass(() => new FakeImage());
    const base = beacon();
    pass.queue(base, "W01", "mission-beacon", 15);
    // A caller changes the base after image() returned (the wreck mask, a
    // later nudge): the sibling copies the state the frame is drawn with.
    const mask = { kind: "wreck" };
    base.setMask(mask).setPosition(102, 65);
    pass.draw(() => true);
    const [{ sprite: glow, base: copied }] = pass.drawn();
    expect(copied).toBe(base);
    expect(glow).not.toBe(base);
    expect(glow.texture.key).toBe(page);
    expect(glow.frame.name).toBe("mission-beacon-emissive");
    expect([glow.x, glow.y]).toEqual([102, 65]);
    expect([glow.originX, glow.originY]).toEqual([0.5, 0.5]);
    expect([glow.scaleX, glow.scaleY]).toEqual([0.81, 1.08]);
    expect([glow.rotation, glow.flipX, glow.alpha]).toEqual([0.03, true, 0.42]);
    expect(glow.depth).toBe(SCENERY_EMISSIVE_DEPTH);
    expect(glow.blendMode).toBe("ADD");
    expect(glow.visible).toBe(true);
    expect(glow.mask).toBe(mask);
    // The base keeps its own blend mode and depth.
    expect(base.blendMode).toBe(0);
    expect(base.depth).toBe(15);
  });
  it("drops a mask only where it would pass every pixel", () => {
    const pass = new EmissivePass(() => new FakeImage());
    const masked = beacon().setMask({ kind: "wreck" });
    const plain = beacon();
    pass.queue(masked, "W01", "mission-beacon", 15);
    pass.queue(plain, "W01", "mission-beacon", 15);
    const asked = [];
    pass.draw((sprite) => {
      asked.push(sprite);
      return false;
    });
    const [first, second] = pass.drawn().map(({ sprite }) => sprite);
    expect(first.mask).toBeNull();
    expect(second.mask).toBeNull();
    // Only the masked base's sibling asks.
    expect(asked).toEqual([first]);
    pass.begin();
    pass.queue(masked, "W01", "mission-beacon", 15);
    pass.draw(() => true);
    expect(pass.drawn()[0].sprite.mask).toEqual({ kind: "wreck" });
  });
  it("never shares a sprite with the base pool", () => {
    const bases = [];
    const created = [];
    const pass = new EmissivePass(() => {
      const fake = new FakeImage();
      created.push(fake);
      return fake;
    });
    for (let frame = 0; frame < 4; frame++) {
      pass.begin();
      for (let n = 0; n < 3 + frame; n++) {
        const base = beacon();
        bases.push(base);
        pass.queue(base, "W01", "mission-beacon", 15);
      }
      pass.draw();
      for (const { sprite, base } of pass.drawn()) {
        expect(bases).toContain(base);
        expect(bases).not.toContain(sprite);
        expect(created).toContain(sprite);
      }
    }
    // Pooled: the largest frame's count, reused frame after frame.
    expect(created).toHaveLength(6);
    expect(created.some((sprite) => bases.includes(sprite))).toBe(false);
    expect(bases.every((base) => base.blendMode === 0)).toBe(true);
  });
  it("skips a base hidden before the pass, and everything when disabled", () => {
    const pass = new EmissivePass(() => new FakeImage());
    const base = beacon();
    pass.queue(base, "W01", "mission-beacon", 15);
    base.setVisible(false);
    expect(pass.draw()).toBe(0);
    const off = new EmissivePass(() => new FakeImage(), false);
    expect(off.queue(beacon(), "W01", "mission-beacon", 15)).toBeUndefined();
    expect(off.draw()).toBe(0);
  });
  it("is wired into the scene after every sprite of the frame", () => {
    const begin = sceneSource.indexOf("this.emissive.begin()");
    const reset = sceneSource.indexOf("this.imageIndex = 0;");
    expect(begin).toBeGreaterThan(reset);
    expect(begin - reset).toBeLessThan(200);
    // image(): queued after the device-pixel snap, never on a miss.
    const queue = sceneSource.indexOf("this.emissive.queue(");
    const snap = sceneSource.indexOf("image.y =\n");
    const miss = sceneSource.indexOf("this.frameMisses.set(frame");
    expect(snap).toBeGreaterThan(miss);
    expect(queue).toBeGreaterThan(snap);
    // draw(): after the rig, the last sprites of the frame.
    expect(sceneSource.indexOf("this.emissive.draw(")).toBeGreaterThan(
      sceneSource.indexOf("renderRig({"),
    );
    // Its pool makes its own Images; base sprites never get a blend mode.
    expect(sceneSource).toMatch(
      /new EmissivePass\(\s*\(\) => this\.add\.image\(/,
    );
    expect(sceneSource).not.toMatch(/image\s*\.setBlendMode/);
  });
});

describe("emissive siblings: the box a sibling covers", () => {
  const frame = {
    x: 32,
    y: 16,
    cutWidth: 26,
    cutHeight: 26,
    realWidth: 144,
    realHeight: 144,
  };
  const sprite = {
    x: 100,
    y: 200,
    originX: 0.5,
    originY: 0.5,
    scaleX: 0.5,
    scaleY: 0.5,
    rotation: 0,
    flipX: false,
    frame,
  };
  it("places the trimmed rect about the origin, mirrored for flipX", () => {
    expect(spriteBounds(sprite)).toEqual([
      100 + (32 - 72) * 0.5,
      200 + (16 - 72) * 0.5,
      100 + (58 - 72) * 0.5,
      200 + (42 - 72) * 0.5,
    ]);
    expect(spriteBounds({ ...sprite, flipX: true })).toEqual([
      100 - (58 - 72) * 0.5,
      200 + (16 - 72) * 0.5,
      100 - (32 - 72) * 0.5,
      200 + (42 - 72) * 0.5,
    ]);
    const turned = spriteBounds({ ...sprite, rotation: Math.PI / 2 });
    expect(turned[0]).toBeCloseTo(100 - (42 - 72) * 0.5, 9);
    expect(turned[1]).toBeCloseTo(200 + (32 - 72) * 0.5, 9);
  });
  it("lists the cells under a box, edges exclusive on the right and bottom", () => {
    expect(cellsUnder([0, 0, 48, 48], 0, 0, 48)).toEqual([[0, 0]]);
    expect(cellsUnder([47, 10, 49, 20], 0, 0, 48)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(cellsUnder([10, 10, 20, 20], 96, 48, 48)).toEqual([[2, 1]]);
    expect(cellsUnder([-1, -1, 1, 1], 0, 0, 48)).toEqual([
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ]);
  });
});
