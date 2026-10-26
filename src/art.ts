import Phaser from "phaser";
import { ORES, isOre } from "./model";

// Newly authored vector sprites, baked once into one texture atlas. The small
// silhouettes remain distinct on phones without downloading a large art pack.
export const ART_TEXTURE = "frontier-art";
export const ART_CELL = 64;
export const ART_COLUMNS = 8;
export const ART_FRAMES = [
  ...Array.from({ length: 14 }, (_, i) => i + 1).flatMap((tile) =>
    [0, 1, 2].map((variant) => ({
      name: `tile-${tile}-${variant}`,
      width: 32,
      height: 32,
    })),
  ),
  ...["idle", "drive", "flight", "side", "down", "damaged"].flatMap((state) =>
    Array.from(
      { length: state === "idle" || state === "damaged" ? 1 : 4 },
      (_, frame) => ({
        name: `rig-${state}-${frame}`,
        width: 48,
        height: 48,
      }),
    ),
  ),
];
type Graphics = Phaser.GameObjects.Graphics;
const polygon = (g: Graphics, points: number[], color: number, alpha = 1) => {
  g.fillStyle(color, alpha);
  g.fillPoints(
    Array.from({ length: points.length / 2 }, (_, i) => ({
      x: points[i * 2],
      y: points[i * 2 + 1],
    })),
    true,
  );
};

function mineral(g: Graphics, tile: number) {
  if (!isOre(tile)) return;
  const color = Phaser.Display.Color.HexStringToColor(ORES[tile].color).color;
  g.fillStyle(color, 0.12);
  g.fillCircle(16, 16, 12);
  g.lineStyle(1, 0x172326, 0.8);
  switch (tile) {
    case 3: // Ironium: a rough three-lobed metallic nugget.
      polygon(
        g,
        [6, 17, 8, 11, 14, 10, 18, 14, 25, 14, 27, 20, 20, 24, 12, 23],
        color,
      );
      polygon(g, [8, 12, 14, 11, 17, 15, 11, 18, 6, 17], 0xf0e4cc, 0.65);
      g.lineBetween(11, 18, 20, 16);
      g.lineBetween(16, 22, 20, 16);
      break;
    case 9: // Bronzium: round nodules rather than another crystal.
      g.fillStyle(color);
      g.fillCircle(12, 16, 7);
      g.fillCircle(21, 20, 6);
      g.fillCircle(20, 10, 4);
      g.lineStyle(2, 0x422d23, 0.7);
      g.strokeCircle(12, 16, 4);
      g.fillStyle(0xffddb0, 0.7);
      g.fillRect(9, 12, 3, 2);
      g.fillRect(19, 17, 3, 2);
      break;
    case 10: // Silverium: narrow fan-shaped blades.
      polygon(g, [13, 26, 5, 11, 10, 7, 17, 24], color);
      polygon(g, [15, 25, 13, 6, 19, 5, 19, 24], 0xe4edec);
      polygon(g, [18, 25, 21, 10, 27, 12, 22, 26], color);
      g.lineBetween(17, 8, 17, 22);
      break;
    case 4: // Goldium: a wide, faceted bar.
      polygon(g, [6, 13, 12, 8, 25, 10, 27, 22, 20, 26, 6, 22], color);
      polygon(g, [6, 13, 12, 8, 25, 10, 19, 15], 0xffe9a0);
      polygon(g, [19, 15, 25, 10, 27, 22, 20, 26], 0xa76b29);
      break;
    case 11: // Platinium: stepped square cubes.
      for (const [x, y, s] of [
        [7, 10, 12],
        [17, 17, 10],
        [18, 6, 7],
      ]) {
        g.fillStyle(0x293344);
        g.fillRect(x - 1, y - 1, s + 2, s + 2);
        g.fillStyle(color);
        g.fillRect(x, y, s, s);
        g.fillStyle(0xf2e8ff, 0.75);
        g.fillRect(x, y, s, 3);
        g.fillStyle(0x494c66, 0.65);
        g.fillRect(x + s - 3, y + 3, 3, s - 3);
      }
      break;
    case 12: // Einsteinium: a central nucleus and orbital nodes.
      g.lineStyle(2, color);
      g.strokeEllipse(16, 16, 24, 10);
      g.strokeEllipse(16, 16, 10, 24);
      g.fillStyle(color);
      g.fillCircle(16, 16, 4);
      g.fillCircle(5, 15, 2);
      g.fillCircle(18, 5, 2);
      g.fillStyle(0xf3fff6);
      g.fillCircle(15, 15, 2);
      break;
    case 5: // Emerald: one long hexagonal crystal.
      polygon(g, [10, 6, 22, 6, 27, 14, 21, 26, 11, 26, 5, 14], color);
      polygon(g, [10, 6, 16, 11, 12, 22, 5, 14], 0xc6ffe2, 0.7);
      polygon(g, [16, 11, 22, 6, 27, 14, 21, 26], 0x155c55, 0.8);
      polygon(g, [16, 11, 21, 15, 18, 22, 12, 22], color);
      break;
    case 13: // Ruby: a dark-centered angular rosette.
      polygon(g, [16, 4, 23, 9, 28, 18, 20, 27, 10, 25, 4, 15, 9, 8], color);
      polygon(g, [16, 4, 16, 13, 9, 18, 4, 15, 9, 8], 0xffc2ba, 0.65);
      polygon(g, [16, 13, 23, 9, 28, 18, 20, 27, 18, 20], 0x77304f);
      break;
    case 6: // Diamond: a broad crown and a single sharp point.
      polygon(g, [5, 12, 11, 6, 22, 6, 28, 12, 16, 28], color);
      polygon(g, [5, 12, 11, 6, 15, 12, 16, 28], 0xe6faff);
      polygon(g, [15, 12, 22, 6, 28, 12, 16, 28], 0x6f91ce);
      g.lineStyle(1, 0xf2fbff);
      g.lineBetween(5, 12, 28, 12);
      break;
    case 14: // Amazonite: three asymmetrical turquoise spires.
      polygon(g, [5, 24, 6, 13, 11, 9, 15, 24], color);
      polygon(g, [12, 26, 12, 7, 19, 3, 23, 25], 0x84fff1);
      polygon(g, [21, 26, 21, 13, 27, 9, 28, 23], color);
      polygon(g, [19, 3, 23, 25, 18, 24, 17, 9], 0x268f90);
      g.fillStyle(0xf0fff6);
      g.fillRect(14, 10, 2, 7);
      break;
  }
}

function terrain(g: Graphics, tile: number, variant: number) {
  const base =
    tile === 2
      ? 0x475452
      : tile === 8
        ? 0x263b40
        : tile === 7
          ? 0x4b2e2d
          : 0x73533b;
  g.fillStyle(base);
  g.fillRect(0, 0, 32, 32);
  polygon(
    g,
    [0, 21 + variant * 2, 10, 18, 23, 25, 32, 17, 32, 32, 0, 32],
    0x152422,
    0.27,
  );
  polygon(g, [0, 0, 32, 0, 32, 6, 18, 3, 6, 8, 0, 5], 0xf2c086, 0.09);
  g.lineStyle(1, 0x172b2a, 0.35);
  g.lineBetween(2, 19 - variant * 3, 10 + variant * 3, 10);
  g.lineBetween(10 + variant * 3, 10, 24, 12 + variant * 3);
  g.fillStyle(0xedc291, 0.2);
  for (let n = 0; n < 4; n++)
    g.fillRect(
      ((n * 11 + variant * 7) % 27) + 2,
      ((n * 17 + variant * 3) % 27) + 2,
      2,
      1,
    );
  if (tile === 2) {
    polygon(g, [4, 17, 7, 7, 22, 5, 28, 17, 22, 28, 10, 27], 0x65716a);
    polygon(g, [7, 7, 22, 5, 19, 11, 5, 17], 0x94a293, 0.5);
    g.lineStyle(2, 0x35443f);
    g.lineBetween(19, 11, 16, 22);
    g.lineBetween(16, 22, 22, 28);
  } else if (tile === 8) {
    g.lineStyle(3, 0x405456);
    g.lineBetween(0, 8 + variant * 3, 32, 3 + variant * 3);
    g.lineBetween(0, 25 - variant, 32, 19 - variant);
    g.lineStyle(1, 0x71847c, 0.6);
    g.lineBetween(0, 10 + variant * 3, 32, 5 + variant * 3);
    g.fillStyle(0x112729);
    g.fillRect(8 + variant * 7, 12, 4, 3);
  } else if (tile === 7) {
    polygon(
      g,
      [
        0, 24, 7, 18, 12, 22, 18, 9, 25, 16, 32, 7, 32, 16, 26, 23, 18, 17, 13,
        29, 7, 25, 0, 31,
      ],
      0xe67b42,
    );
    g.lineStyle(2, 0xffd77d);
    g.lineBetween(7, 22, 12, 26);
    g.lineBetween(18, 13, 25, 20);
    g.lineBetween(25, 20, 30, 13);
    g.fillStyle(0xffd77d, 0.7);
    g.fillCircle(21, 27, 2);
  } else mineral(g, tile);
}

function rig(g: Graphics, state: string, frame: number) {
  const flying = state === "flight";
  const damaged = state === "damaged";
  const drilling = state === "side" || state === "down";
  const armor = damaged ? 0x927759 : 0xe6b65b;
  // The visible body fits the 0.7-tile collision width; rotor and drill are tools.
  g.fillStyle(0x07191b, 0.75);
  g.fillEllipse(24, 36, 28, 6);
  g.fillStyle(0x13272a);
  g.fillRoundedRect(12, 27, 24, flying ? 5 : 9, 3);
  if (!flying) {
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0x708b82);
      g.fillRect(13 + ((i * 5 + frame * 2) % 22), 29, 3, 5);
    }
    g.fillStyle(0x263b3b);
    g.fillRect(14, 30, 20, 2);
  }
  g.fillStyle(0x142b2e);
  g.fillRoundedRect(12, 13, 24, 19, 4);
  g.fillStyle(armor);
  g.fillRoundedRect(13, 14, 22, 16, 3);
  g.fillStyle(0xffdf8d);
  g.fillRect(16, 14, 16, 2);
  g.fillStyle(0xa57639);
  g.fillRect(14, 26, 20, 4);
  g.fillStyle(0x24575b);
  g.fillRoundedRect(19, 17, 13, 8, 2);
  polygon(g, [20, 18, 30, 18, 26, 23, 20, 23], 0x91d4ca);
  g.fillStyle(0xe6fff1);
  g.fillRect(21, 18, 4, 2);
  g.fillStyle(0x445956);
  g.fillRect(13, 19, 4, 7);
  g.lineStyle(1, 0x203735);
  for (let i = 0; i < 3; i++) g.lineBetween(13, 20 + i * 2, 17, 20 + i * 2);
  g.fillStyle(damaged ? 0xeb7c61 : 0xffefb8);
  g.fillRect(34, 20, 3, 4);
  g.fillStyle(0x5e4f32);
  g.fillRect(16, 27, 2, 2);
  g.fillRect(29, 27, 2, 2);
  if (flying) {
    g.fillStyle(0x9ebbb0);
    g.fillRect(23, 7, 2, 7);
    g.fillStyle(0x1b3539);
    g.fillRect(20, 7, 8, 3);
    const reach = [15, 7, 3, 11][frame];
    g.fillStyle(0xa9c2af);
    g.fillRect(24 - reach, 6, reach * 2, 2);
    g.fillStyle(0xf1d286);
    g.fillRect(22, 5, 4, 4);
  }
  if (state === "side") {
    g.fillStyle(0x536b69);
    g.fillRect(34, 23, 5, 4);
    polygon(g, [38, 19, 45, 25, 38, 31], 0xc1d5c4);
    g.lineStyle(1, 0x385353);
    g.lineBetween(39, 21 + (frame % 2), 42, 25);
    g.lineBetween(39, 26 + (frame % 2), 41, 28);
  } else if (state === "down") {
    g.fillStyle(0x536b69);
    g.fillRect(21, 31, 6, 4);
    polygon(g, [17, 35, 31, 35, 24, 45], 0xc1d5c4);
    g.lineStyle(1, 0x385353);
    g.lineBetween(20, 36 + (frame % 2), 27, 39);
    g.lineBetween(22, 40, 25, 41 + (frame % 2));
  } else if (!flying) {
    g.fillStyle(0x829b8f);
    g.fillRect(35, 24, 4, 3);
  }
  if (drilling) {
    g.fillStyle(frame % 2 ? 0xffe4a4 : 0xd28e42);
    g.fillRect(14, 17, 2, 2);
  }
  if (damaged) {
    g.lineStyle(1, 0x4e3031);
    g.lineBetween(17, 15, 19, 19);
    g.lineBetween(19, 19, 16, 23);
    g.fillStyle(0x322e2a, 0.8);
    g.fillCircle(29, 26, 3);
  }
}

export function createArt(scene: Phaser.Scene) {
  if (scene.textures.exists(ART_TEXTURE)) return;
  const g = scene.add.graphics();
  const width = ART_COLUMNS * ART_CELL;
  const height = Math.ceil(ART_FRAMES.length / ART_COLUMNS) * ART_CELL;
  ART_FRAMES.forEach((frame, index) => {
    g.save();
    g.translateCanvas(
      (index % ART_COLUMNS) * ART_CELL,
      Math.floor(index / ART_COLUMNS) * ART_CELL,
    );
    const [kind, item, variant] = frame.name.split("-");
    if (kind === "tile") terrain(g, Number(item), Number(variant));
    else rig(g, item, Number(variant));
    g.restore();
  });
  g.generateTexture(ART_TEXTURE, width, height);
  const atlas = scene.textures.get(ART_TEXTURE);
  ART_FRAMES.forEach((frame, index) =>
    atlas.add(
      frame.name,
      0,
      (index % ART_COLUMNS) * ART_CELL,
      Math.floor(index / ART_COLUMNS) * ART_CELL,
      frame.width,
      frame.height,
    ),
  );
  g.destroy();
}
