import type Phaser from "phaser";
import type { Campaign } from "../model";
export type RenderImage = (
  frame: string,
  x: number,
  y: number,
  width: number,
  height: number,
  depth?: number,
  alpha?: number,
  flip?: boolean,
  originY?: number,
) => boolean;
export interface RigFrame {
  campaign: Campaign;
  image: RenderImage;
  screen: Phaser.GameObjects.Graphics;
  edges: Phaser.GameObjects.Graphics;
  effects: Phaser.GameObjects.Graphics;
  tile: number;
  px: number;
  py: number;
  elapsed: number;
  paused: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  width: number;
  height: number;
  damageLife: number;
  /** False with ?overlays=0: the hit outline is feedback, not art (F3). */
  overlays: boolean;
}
/** All modular rig layers share their source pivot, squash and load offset. */
export function renderRig(frame: RigFrame) {
  const {
    campaign,
    image,
    screen,
    edges,
    effects: fx,
    tile,
    px,
    py,
    elapsed,
    paused,
    reducedMotion,
    highContrast,
    width,
    height,
    damageLife,
  } = frame;
  const vehicle = campaign.state.vehicle,
    icy = campaign.world.id === "W02";
  const rigSize = (tile * 64) / 48;
  const rigY = py - tile * 0.015;
  const moving = Math.abs(campaign.velocityX) > 0.3;
  const bodyFrame = moving && !paused ? Math.floor(elapsed * 12) % 8 : 0;
  const flip = campaign.facing === "left";
  if (campaign.grounded) {
    edges.fillStyle(0x070f15, 0.45);
    edges.fillEllipse(px, py + tile * 0.36, tile * 0.9, tile * 0.12);
  }
  if (campaign.thrusting)
    image(
      `thrust-${Math.floor(elapsed * 12) % 6}`,
      px,
      rigY,
      rigSize,
      rigSize,
      18,
      1,
      flip,
    );
  image(`rig-body-${bodyFrame}`, px, rigY, rigSize, rigSize, 20, 1, flip);
  image(
    `rig-engine-${Math.min(2, campaign.state.hardware.engine)}`,
    px,
    rigY,
    rigSize,
    rigSize,
    21,
    1,
    flip,
  );
  image(
    `rig-energy-${Math.min(2, campaign.state.hardware.energy)}`,
    px,
    rigY,
    rigSize,
    rigSize,
    21,
    1,
    flip,
  );
  image(
    `rig-bay-${Math.min(2, campaign.state.hardware.cargo)}`,
    px,
    rigY,
    rigSize,
    rigSize,
    21,
    1,
    flip,
  );
  image("rig-cabin", px, rigY, rigSize, rigSize, 22, 1, flip);
  image(
    `rig-hull-${Math.min(2, campaign.state.hardware.hull)}`,
    px,
    rigY,
    rigSize,
    rigSize,
    22,
    1,
    flip,
  );
  if (campaign.state.equipped.mobility === "W01-R2")
    image(
      `rig-feet-${campaign.feetDeployed ? "deployed" : "stowed"}`,
      px,
      rigY,
      rigSize,
      rigSize,
      23,
      1,
      flip,
    );
  if (campaign.state.equipped.processor === "W01-R3")
    image("rig-rack", px, rigY, rigSize, rigSize, 23, 1, flip);
  if (campaign.state.equipped.drill === "W02-R1")
    image("tool-thermal", px, rigY, rigSize, rigSize, 23, 1, flip);
  if (campaign.state.equipped.utilities.includes("W02-R2"))
    image("tool-condenser", px, rigY, rigSize, rigSize, 23, 1, flip);
  if (campaign.state.equipped.processor === "W02-R3")
    image("tool-preservation", px, rigY, rigSize, rigSize, 23, 1, flip);
  const drillFrame = campaign.drillDirection
    ? `rig-drill-${campaign.drillDirection}-${Math.floor(elapsed * 16) % 8}`
    : "rig-drill-idle";
  image(
    drillFrame,
    px,
    rigY,
    rigSize,
    rigSize,
    23,
    1,
    campaign.drillDirection ? false : flip,
  );
  if (campaign.state.hardware.drill >= 1)
    image(
      `rig-drill-collar-${campaign.drillDirection || "right"}-${Math.min(2, campaign.state.hardware.drill)}`,
      px,
      rigY,
      rigSize,
      rigSize,
      23,
      1,
      campaign.drillDirection ? false : flip,
    );
  if (icy && campaign.precisionActive) {
    screen.lineStyle(1.5, 0x84e9dc, 0.8);
    screen.strokeCircle(px, py, tile * 0.66);
  }
  const volatile = campaign.volatileWindow;
  if (icy && volatile) {
    screen.lineStyle(4, 0x142c3a, 0.95);
    screen.strokeCircle(px, py, tile * 0.72);
    screen.lineStyle(3, 0xf7c673, 1);
    screen.beginPath();
    screen.arc(
      px,
      py,
      tile * 0.72,
      -Math.PI / 2,
      -Math.PI / 2 +
        Math.PI *
          2 *
          Math.max(
            0,
            Math.min(1, volatile.remaining / (volatile.duration ?? 0.75)),
          ),
    );
    screen.strokePath();
  }
  if (
    icy &&
    campaign.state.equipped.drill === "W02-R1" &&
    campaign.drillTarget
  ) {
    const contactX =
      px +
      (campaign.drillDirection === "left"
        ? -0.48
        : campaign.drillDirection === "right"
          ? 0.48
          : 0) *
        tile;
    const contactY =
      py + (campaign.drillDirection === "down" ? 0.48 : 0.12) * tile;
    fx.fillStyle(0xf7c673, 0.16);
    fx.fillCircle(contactX, contactY, tile * 0.28);
    if (!reducedMotion)
      for (let plume = 0; plume < 3; plume++) {
        const phase = (elapsed * 1.3 + plume / 3) % 1;
        fx.fillStyle(0xc0e5e6, (1 - phase) * 0.18);
        fx.fillCircle(
          contactX + Math.sin(plume * 1.8) * tile * phase * 0.2,
          contactY - phase * tile * 0.75,
          tile * (0.08 + phase * 0.14),
        );
      }
  }
  const hullFraction = vehicle.hull / campaign.maxHull;
  const damageStage =
    hullFraction <= 0.15
      ? 3
      : hullFraction <= 0.4
        ? 2
        : hullFraction <= 0.75
          ? 1
          : 0;
  if (damageStage)
    image(
      `rig-damage-${damageStage}`,
      px,
      rigY,
      rigSize,
      rigSize,
      22.5,
      1,
      flip,
    );
  const critical =
    vehicle.energy / campaign.maxEnergy <= 0.15 ||
    vehicle.hull / campaign.maxHull <= 0.15;
  if (critical && !paused) {
    const alarmAlpha = reducedMotion
      ? 0.7
      : 0.45 + Math.sin(elapsed * 4) * 0.18;
    screen.lineStyle(
      highContrast ? 5 : 3,
      vehicle.hull / campaign.maxHull <= 0.15 ? 0xffaa93 : 0xf2ca71,
      alarmAlpha,
    );
    screen.strokeRect(2, 2, width - 4, height - 4);
  }
  if (damageLife > 0 && frame.overlays) {
    fx.lineStyle(2, 0xff8e7f, damageLife / 0.3);
    fx.strokeRoundedRect(
      px - tile * 0.48,
      py - tile * 0.45,
      tile * 0.96,
      tile * 0.9,
      5,
    );
  }
  if (campaign.drillTarget) {
    screen.fillStyle(0x101920, 0.95);
    screen.fillRoundedRect(
      px - tile * 0.38,
      py - tile * 0.61,
      tile * 0.76,
      5,
      2,
    );
    screen.fillStyle(0xf0a43c);
    screen.fillRoundedRect(
      px - tile * 0.38 + 1,
      py - tile * 0.61 + 1,
      Math.max(1, (tile * 0.76 - 2) * campaign.drillProgress),
      3,
      1,
    );
  }
}
