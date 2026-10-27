import Phaser from "phaser";
import { ORES, isOre } from "./model";

export const MODELS_TEXTURE = "frontier-models";
export const ART_TEXTURE = "frontier-terrain";
export const ART_CELL = 96;
export const ART_COLUMNS = 8;
export const SKY_TEXTURE = "frontier-sky";
export const CAVE_TEXTURE = "frontier-cave";
export const LIGHT_TEXTURE = "frontier-light";
export const VIGNETTE_TEXTURE = "frontier-vignette";
export const ART_FRAMES = Array.from({ length: 14 }, (_, i) => i + 1).flatMap(
  (tile) =>
    [0, 1, 2].map((variant) => ({
      name: `tile-${tile}-${variant}`,
      tile,
      variant,
    })),
);
export const tileSizeForViewport = (width: number, height: number) =>
  height < 280 ? 32 : width < 600 ? 40 : width < 1050 ? 48 : 56;

export function preloadArt(scene: Phaser.Scene) {
  scene.load.atlas(
    MODELS_TEXTURE,
    new URL("../assets/generated/frontier-atlas.png", import.meta.url).href,
    new URL("../assets/generated/frontier-atlas.json", import.meta.url).href,
  );
}

const hash = (x: number, y: number, seed: number) => {
  let n =
    Math.imul(x + seed * 71, 374761393) ^ Math.imul(y + seed * 19, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const noise = (x: number, y: number, seed: number) => {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let tx = x - ix,
    ty = y - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed),
    b = hash(ix + 1, iy, seed),
    c = hash(ix, iy + 1, seed),
    d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
};

/** The substrate is shaded once. Baked Blender ore geometry is embedded in it. */
function terrain(
  scene: Phaser.Scene,
  context: CanvasRenderingContext2D,
  tile: number,
  variant: number,
) {
  const size = ART_CELL;
  const image = context.createImageData(size, size);
  const rock = tile === 2,
    bedrock = tile === 8,
    magma = tile === 7;
  const base = rock
    ? [91, 104, 115]
    : bedrock
      ? [39, 49, 65]
      : magma
        ? [67, 40, 37]
        : [133, 83, 57];
  const seed = variant * 97 + (rock ? 31 : bedrock ? 71 : 11);
  const relief = (x: number, y: number) =>
    noise(x / 22, y / 12, seed) * 0.6 +
    noise(x / 7, y / 5, seed + 4) * 0.24 +
    noise(x / 2, y / 2, seed + 8) * 0.16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = relief(x, y);
      const normal = (relief(x - 1, y - 1) - relief(x + 1, y + 1)) * 1.6;
      const grain = hash(x, y, seed) - 0.5;
      const strata = Math.sin(
        y * (bedrock ? 0.21 : 0.12) +
          x * 0.035 +
          noise(x / 30, y / 28, seed) * 4,
      );
      const luminance =
        0.68 +
        value * 0.6 +
        normal +
        grain * 0.12 +
        strata * (rock ? 0.04 : 0.08);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        image.data[i + c] = Math.max(0, Math.min(255, base[c] * luminance));
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  context.lineCap = "round";
  for (let crack = 0; crack < (rock ? 4 : bedrock ? 6 : 3); crack++) {
    let x = hash(crack, 1, seed) * size,
      y = hash(crack, 2, seed) * size;
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < 4; step++) {
      x += (hash(step, crack, seed + 3) - 0.4) * 28;
      y += (hash(step, crack, seed + 7) - 0.4) * 19;
      context.lineTo(x, y);
    }
    context.strokeStyle = magma ? "#ff582d" : "rgba(14,16,24,.42)";
    context.lineWidth = magma ? 7 : rock ? 2.6 : 1.5;
    context.stroke();
    if (magma) {
      context.strokeStyle = "#ffd17a";
      context.lineWidth = 2;
      context.stroke();
    }
  }
  if (isOre(tile)) {
    const glow = context.createRadialGradient(48, 50, 12, 48, 50, 46);
    glow.addColorStop(0, "rgba(4,8,15,.8)");
    glow.addColorStop(1, "rgba(4,8,15,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
    const atlas = scene.textures.get(MODELS_TEXTURE);
    if (atlas.has(`ore-${tile}`)) {
      const frame = atlas.get(`ore-${tile}`);
      context.drawImage(
        frame.source.image as HTMLImageElement,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        4,
        4,
        88,
        88,
      );
    } else {
      context.fillStyle = ORES[tile].color;
      context.beginPath();
      context.moveTo(48, 20);
      context.lineTo(72, 37);
      context.lineTo(63, 72);
      context.lineTo(32, 76);
      context.lineTo(22, 40);
      context.closePath();
      context.fill();
    }
  }
}

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height)!;
  draw(texture.context);
  texture.refresh();
}

// Network failure should not strand an otherwise valid local expedition.
function fallbackModels(scene: Phaser.Scene) {
  if (scene.textures.exists(MODELS_TEXTURE)) return;
  const frames = ["idle", "drive", "flight", "side", "down", "damaged"].flatMap(
    (state) =>
      Array.from(
        { length: state === "idle" || state === "damaged" ? 1 : 4 },
        (_, frame) => `rig-${state}-${frame}`,
      ),
  );
  const texture = scene.textures.createCanvas(
    MODELS_TEXTURE,
    160 * 6,
    160 * 3,
  )!;
  const context = texture.context;
  for (let index = 0; index < frames.length; index++) {
    const x = (index % 6) * 160,
      y = Math.floor(index / 6) * 160;
    context.fillStyle = "#17212d";
    context.fillRect(x + 39, y + 93, 82, 23);
    const armor = context.createLinearGradient(0, y + 52, 0, y + 100);
    armor.addColorStop(0, "#ffd080");
    armor.addColorStop(1, "#b96c30");
    context.fillStyle = armor;
    context.beginPath();
    context.roundRect(x + 42, y + 50, 76, 53, 12);
    context.fill();
    context.fillStyle = "#6edfee";
    context.beginPath();
    context.roundRect(x + 64, y + 58, 41, 26, 6);
    context.fill();
    texture.add(frames[index], 0, x, y, 160, 160);
  }
  texture.refresh();
}

export function createArt(scene: Phaser.Scene) {
  fallbackModels(scene);
  if (!scene.textures.exists(ART_TEXTURE)) {
    const atlas = scene.textures.createCanvas(
      ART_TEXTURE,
      ART_COLUMNS * ART_CELL,
      Math.ceil(ART_FRAMES.length / ART_COLUMNS) * ART_CELL,
    )!;
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileCanvas.height = ART_CELL;
    const context = tileCanvas.getContext("2d")!;
    for (let index = 0; index < ART_FRAMES.length; index++) {
      const frame = ART_FRAMES[index],
        x = (index % ART_COLUMNS) * ART_CELL,
        y = Math.floor(index / ART_COLUMNS) * ART_CELL;
      context.clearRect(0, 0, ART_CELL, ART_CELL);
      terrain(scene, context, frame.tile, frame.variant);
      atlas.context.drawImage(tileCanvas, x, y);
      atlas.add(frame.name, 0, x, y, ART_CELL, ART_CELL);
    }
    atlas.refresh();
  }
  canvasTexture(scene, SKY_TEXTURE, 1024, 512, (context) => {
    const sky = context.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#101c32");
    sky.addColorStop(0.35, "#493545");
    sky.addColorStop(0.75, "#b46d53");
    sky.addColorStop(1, "#efb67c");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 150; i++) {
      const x = hash(i, 1, 3) * 1024,
        y = hash(i, 2, 3) * 200;
      context.fillStyle = `rgba(222,231,247,${hash(i, 3, 3) * 0.55})`;
      context.fillRect(x, y, i % 9 === 0 ? 2 : 1, 1);
    }
  });
  canvasTexture(scene, CAVE_TEXTURE, 256, 256, (context) => {
    const image = context.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const n =
          noise(x / 55, y / 23, 113) * 0.55 +
          noise(x / 13, y / 9, 51) * 0.25 +
          noise(x / 3, y / 3, 19) * 0.2;
        const i = (y * 256 + x) * 4;
        image.data[i] = 13 + n * 15;
        image.data[i + 1] = 20 + n * 17;
        image.data[i + 2] = 29 + n * 19;
        image.data[i + 3] = 255;
      }
    context.putImageData(image, 0, 0);
  });
  canvasTexture(scene, LIGHT_TEXTURE, 256, 256, (context) => {
    const glow = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    glow.addColorStop(0, "rgba(255,217,159,.2)");
    glow.addColorStop(0.35, "rgba(255,187,110,.08)");
    glow.addColorStop(1, "rgba(255,187,110,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 256, 256);
  });
  canvasTexture(scene, VIGNETTE_TEXTURE, 512, 512, (context) => {
    const shade = context.createRadialGradient(256, 256, 80, 256, 256, 355);
    shade.addColorStop(0, "rgba(2,6,13,0)");
    shade.addColorStop(0.65, "rgba(2,6,13,.05)");
    shade.addColorStop(1, "rgba(2,6,13,.55)");
    context.fillStyle = shade;
    context.fillRect(0, 0, 512, 512);
  });
}
