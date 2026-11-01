import {
  BALANCE_VERSION,
  GENERATOR_VERSION,
  HARDWARE_KEYS,
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  W01,
  W01_EFFECTS,
  W01_GEAR,
  W01_MILESTONES,
  W01_ORES,
  formatCredits,
} from "./config";
import { createW01, createW02 } from "./world";
import {
  W02,
  W02_GEAR,
  W02_MILESTONES,
  W02_ORES,
  W02_HAZARDS,
  W02_EFFECTS,
} from "./frontier";
import type {
  CampaignControls,
  CampaignPackage,
  CampaignState,
  HardwareKey,
} from "./types";

export const wrapCampaignX = (x: number, width: number = W01.width) =>
  ((x % width) + width) % width;
export const campaignDelta = (
  from: number,
  to: number,
  width: number = W01.width,
) => wrapCampaignX(to - from + width / 2, width) - width / 2;
const EPSILON = 1e-7;
const HALF_X = W01.bodyHalfX;
const HALF_Y = W01.bodyHalfY;
const SURFACE_Y = -HALF_Y;
const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));
const level = (state: CampaignState, key: HardwareKey) =>
  HARDWARE_LEVELS[key][state.hardware[key]]!;

export function createCampaign(seed = 73021): CampaignState {
  seed >>>= 0;
  return {
    schema: 2,
    balanceVersion: BALANCE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    id: `campaign-${seed.toString(16)}-${Date.now().toString(36)}`,
    seed,
    credits: 200,
    hardware: { drill: 0, energy: 0, cargo: 0, hull: 0, engine: 0 },
    purchases: [],
    ownedGear: ["W01-R1"],
    equipped: {
      drill: "W01-R1",
      mobility: null,
      processor: null,
      utilities: [],
    },
    vehicle: { x: W01.spawnX, y: SURFACE_Y, energy: 6, hull: 10 },
    currentWorld: "W01",
    worlds: { W01: createW01(seed) },
    progress: {
      beacon: false,
      bankedOre: 0,
      completed: [],
      unlockedWorlds: ["W01"],
      departed: false,
    },
    elapsed: 0,
    stats: {
      mined: 0,
      ordinarySold: 0,
      ordinaryIncome: 0,
      recoveries: 0,
      largestDepth: 0,
      expeditions: 0,
    },
  };
}

interface Cut {
  x: number;
  y: number;
  startX: number;
  startY: number;
  seconds: number;
  progress: number;
  direction: "left" | "right" | "down";
  spent: number;
  precision: boolean;
}

/** Pure campaign simulation. DOM, rendering, and persistence never drive rules. */
export class Campaign {
  state: CampaignState;
  message =
    "Salvaged auger installed. Mine the marked seam, then bank your haul at the lander.";
  velocityX = 0;
  velocityY = 0;
  facing: "left" | "right" = "right";
  thrusting = false;
  feetDeployed = false;
  precisionActive = false;
  private feetTime = 0;
  private cut: Cut | undefined;
  private visible = new Set<number>();
  private wasDocked = false;

  constructor(state = createCampaign()) {
    this.state = state;
    if (state.currentWorld === "W02")
      this.message =
        "Ice comet expedition ready. Follow the mission signal and preserve volatile crystals.";
    this.refreshVisibility();
    this.wasDocked = this.atDock;
  }

  get world() {
    return this.state.worlds[this.state.currentWorld]!;
  }
  get activeWorldDefinition() {
    return this.state.currentWorld === "W02" ? W02 : W01;
  }
  get completedMilestones() {
    return this.state.currentWorld === "W01"
      ? this.state.progress.completed
      : (this.world.completed ?? []);
  }
  get milestoneDefinitions() {
    return this.state.currentWorld === "W01" ? W01_MILESTONES : W02_MILESTONES;
  }
  get gearDefinitions() {
    return [...W01_GEAR, ...W02_GEAR];
  }
  get hardwareCap() {
    return this.state.worlds.W02 ? 2 : 1;
  }
  get hardwareUnlocked() {
    return (
      this.state.progress.completed.includes(1) ||
      this.state.currentWorld === "W02"
    );
  }
  get bankedSamples() {
    return this.world.missions.filter(
      (item) => item.id.startsWith("W02-SAMPLE-") && item.status === "banked",
    ).length;
  }
  get bankedIntact() {
    return this.world.packages.filter(
      (item) =>
        item.itemId === "W02-O3" &&
        item.tags.includes("cryosample") &&
        item.tags.includes("intact") &&
        (item.status === "banked" || item.status === "sold"),
    ).length;
  }
  get volatileWindow() {
    return this.world.volatile;
  }
  get coldStatus() {
    return this.world.climate;
  }
  private wrap(x: number) {
    return wrapCampaignX(x, this.world.width);
  }
  private delta(from: number, to: number) {
    return campaignDelta(from, to, this.world.width);
  }
  get cargo() {
    return this.world.packages.filter((item) => item.status === "carried");
  }
  get warehouse() {
    return this.world.packages.filter((item) => item.status === "banked");
  }
  get cargoBulk() {
    return this.cargo.reduce((total, item) => total + item.bulk, 0);
  }
  get cargoMass() {
    return this.cargo.reduce((total, item) => total + item.mass, 0);
  }
  get cargoValue() {
    return this.cargo.reduce((total, item) => total + item.value, 0);
  }
  get capacity() {
    return Math.floor(
      level(this.state, "cargo") *
        (this.state.equipped.processor === "W01-R3"
          ? W01_EFFECTS.rack.bulkMultiplier
          : 1),
    );
  }
  get maxEnergy() {
    return level(this.state, "energy");
  }
  get maxHull() {
    return level(this.state, "hull");
  }
  get depth() {
    return clamp(
      Math.round((this.state.vehicle.y + HALF_Y) * 10),
      0,
      this.activeWorldDefinition.depth,
    );
  }
  get atDock() {
    const { x, y } = this.state.vehicle;
    return (
      !this.cut &&
      Math.abs(this.delta(x, this.activeWorldDefinition.dockX)) <= 1.65 &&
      Math.abs(y - SURFACE_Y) <= 0.08 &&
      Math.abs(this.velocityY) < 1
    );
  }
  get grounded() {
    const { x, y } = this.state.vehicle;
    const row = Math.floor(y + HALF_Y + 1e-4);
    return [x - HALF_X + EPSILON, x + HALF_X - EPSILON].some(
      (foot) => this.tile(foot, row) !== 0,
    );
  }
  get renderX() {
    const cut = this.cut;
    return cut
      ? this.wrap(
          cut.startX + this.delta(cut.startX, cut.x + 0.5) * cut.progress,
        )
      : this.state.vehicle.x;
  }
  get renderY() {
    const cut = this.cut;
    return cut
      ? cut.startY +
          ((cut.direction === "down" ? cut.y + 1 - HALF_Y : cut.startY) -
            cut.startY) *
            cut.progress
      : this.state.vehicle.y;
  }
  get drillTarget() {
    return this.cut ? { x: this.cut.x, y: this.cut.y } : undefined;
  }
  get drillProgress() {
    return this.cut?.progress ?? 0;
  }
  get drillDirection() {
    return this.cut?.direction;
  }
  get currentMilestone() {
    return this.milestoneDefinitions.find(
      (milestone) => !this.completedMilestones.includes(milestone.id),
    );
  }
  get missionReady() {
    const milestone = this.currentMilestone;
    if (!milestone) return false;
    if (this.state.currentWorld === "W02") {
      if (milestone.id === 1) return this.bankedSamples >= 5;
      if (milestone.id === 2) return this.bankedIntact >= 3;
    }
    if (milestone.id === 1)
      return this.state.progress.beacon && this.state.progress.bankedOre >= 3;
    return milestone.requiredMissionIds.every((id) =>
      this.world.missions.some(
        (mission) => mission.id === id && mission.status === "banked",
      ),
    );
  }
  tile(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 3;
    if (y < 0) return 0;
    if (y >= this.world.rows) return 3;
    return this.world.tiles[
      Math.floor(y) * this.world.width + Math.floor(this.wrap(x))
    ]!;
  }
  isKnown(x: number, y: number) {
    return (
      y < 0 ||
      (y < this.world.rows &&
        this.world.discovered[
          Math.floor(y) * this.world.width + Math.floor(this.wrap(x))
        ] === 1)
    );
  }
  isVisible(x: number, y: number) {
    return (
      y < 0 ||
      (y < this.world.rows &&
        this.visible.has(
          Math.floor(y) * this.world.width + Math.floor(this.wrap(x)),
        ))
    );
  }
  refreshVisibility() {
    this.visible.clear();
    const { x, y } = this.state.vehicle;
    const visibleFace = (tx: number, ty: number, fx: number, fy: number) => {
      const dx = tx + fx - x,
        dy = ty + fy - y,
        steps = Math.ceil(Math.hypot(dx, dy) * 16);
      let previousX = Math.floor(x),
        previousY = Math.floor(y);
      for (let step = 1; step < steps; step++) {
        const px = x + (dx * step) / steps,
          py = y + (dy * step) / steps,
          column = Math.floor(px),
          row = Math.floor(py);
        // Do not peek through a touching pair of diagonal wall corners.
        if (
          column !== previousX &&
          row !== previousY &&
          (this.tile(column, previousY) || this.tile(previousX, row))
        )
          return false;
        if (column === tx && row === ty) return true;
        if (this.tile(px, py)) return false;
        previousX = column;
        previousY = row;
      }
      return true;
    };
    for (
      let row = Math.max(0, Math.floor(y - 4.5));
      row <= Math.min(this.world.rows - 1, Math.ceil(y + 4.5));
      row++
    )
      for (let column = Math.floor(x - 4.5); column <= x + 4.5; column++) {
        if (Math.hypot(column + 0.5 - x, row + 0.5 - y) > 4.5) continue;
        if (
          [
            [0.5, 0.5],
            [0.5, 0.002],
            [0.5, 0.998],
            [0.002, 0.5],
            [0.998, 0.5],
          ].some(([fx, fy]) => visibleFace(column, row, fx!, fy!))
        ) {
          const index = row * this.world.width + Math.floor(this.wrap(column));
          this.visible.add(index);
          this.world.discovered[index] = 1;
        }
      }
  }

  tick(seconds: number, controls: CampaignControls = {}) {
    let remaining = clamp(seconds, 0, 0.25);
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, 1 / 120);
      this.step(dt, controls);
      remaining -= dt;
    }
    this.refreshVisibility();
  }
  private step(dt: number, controls: CampaignControls) {
    const state = this.state,
      vehicle = state.vehicle;
    state.elapsed += dt;
    if (vehicle.energy <= 0 || vehicle.hull <= 0) {
      this.stop();
      this.message =
        "Rig disabled. Request surface recovery from the pause menu.";
      return;
    }
    const horizontal =
      Number(Boolean(controls.right)) - Number(Boolean(controls.left));
    this.precisionActive = Boolean(
      this.state.equipped.processor === "W02-R3" &&
      (controls.primary || controls.secondary),
    );
    this.updateClimate(dt);
    if (vehicle.hull <= 0) {
      this.stop();
      return;
    }
    if (this.world.volatile) {
      if (controls.up || (!controls.down && !horizontal))
        this.releaseVolatile();
      else {
        this.world.volatile.remaining = Math.max(
          0,
          this.world.volatile.remaining - dt,
        );
        vehicle.energy = Math.max(0, vehicle.energy - 0.063 * dt);
        if (this.world.volatile.remaining <= 1e-8) this.finishVolatile(false);
        this.updateObjects(dt);
        return;
      }
    }
    if (horizontal) this.facing = horizontal < 0 ? "left" : "right";
    const supported = this.grounded;
    if (controls.mobility && supported && state.equipped.mobility === "W01-R2")
      this.feetTime += dt;
    else this.feetTime = 0;
    this.feetDeployed = this.feetTime >= W01_EFFECTS.feet.deploySeconds;
    this.thrusting = Boolean(controls.up && !this.cut);
    const power = level(state, "engine") / 150,
      movementFactor = 1 + 0.12 * (power - 1),
      reserve = this.feetDeployed ? W01_EFFECTS.feet.thrustEnergyMultiplier : 1;
    const drillingFuel = this.cut
      ? 0.252 *
        (state.equipped.drill === "W02-R1"
          ? W02_EFFECTS.thermal.drillingEnergyMultiplier
          : 1)
      : 0;
    const fuel =
      (vehicle.y > SURFACE_Y + 0.01 ? 0.063 : 0) +
      (this.cut
        ? drillingFuel
        : Number(Boolean(horizontal)) * 0.126 * movementFactor +
          Number(Boolean(controls.up)) * 0.126 * movementFactor * reserve);
    const spent = Math.min(vehicle.energy, fuel * dt);
    if (this.cut && fuel > 0) this.cut.spent += (spent * drillingFuel) / fuel;
    vehicle.energy = Math.max(0, vehicle.energy - spent);
    if (vehicle.energy === 0) {
      this.stop();
      this.message = "Energy depleted. Request surface recovery.";
      return;
    }
    if (this.cut) {
      this.thrusting = false;
      this.advanceCut(dt);
      this.updateObjects(dt);
      return;
    }
    if (!controls.up && (controls.down || horizontal) && supported) {
      const direction = controls.down ? 0 : horizontal;
      let tx = Math.floor(vehicle.x + direction * (HALF_X + 0.15));
      const ty = Math.floor(vehicle.y + (controls.down ? HALF_Y + 0.05 : 0));
      if (controls.down && this.tile(tx, ty) === 0) {
        const support = [
          Math.floor(vehicle.x - HALF_X + EPSILON),
          Math.floor(vehicle.x + HALF_X - EPSILON),
        ]
          .sort(
            (a, b) =>
              Math.abs(a + 0.5 - vehicle.x) - Math.abs(b + 0.5 - vehicle.x),
          )
          .find((column) => this.tile(column, ty) !== 0);
        if (support !== undefined) tx = support;
      }
      const material = this.tile(tx, ty);
      if (material === 3) this.message = "The claim's bedrock ends here.";
      else if (material) {
        const isVolatile = this.world.packages.some(
          (item) =>
            item.status === "deposit" &&
            Math.floor(item.x) === this.wrap(tx) &&
            Math.floor(item.y) === ty &&
            item.tags.includes("volatile"),
        );
        const auger =
          material === 1 &&
          state.currentWorld === "W02" &&
          state.equipped.drill === "W02-R1"
            ? W02_EFFECTS.thermal.iceCutMultiplier
            : material === 1 &&
                state.currentWorld === "W01" &&
                state.equipped.drill === "W01-R1"
              ? W01_EFFECTS.auger.soilCutMultiplier
              : 1;
        this.cut = {
          x: Math.floor(this.wrap(tx)),
          y: ty,
          startX: vehicle.x,
          startY: vehicle.y,
          progress: 0,
          spent: 0,
          precision: isVolatile && this.precisionActive,
          direction: controls.down ? "down" : horizontal < 0 ? "left" : "right",
          seconds: Math.max(
            0.25,
            ((controls.down ? 1 : 0.75) *
              (material === 2 ? 1.85 : 1) *
              Math.min(5, 1 + Math.max(0, ty) / 80) *
              auger *
              (isVolatile && this.precisionActive
                ? W02_EFFECTS.preservation.cutMultiplier
                : 1)) /
              (level(state, "drill") / 2),
          ),
        };
        this.velocityX = this.velocityY = 0;
        this.advanceCut(dt);
        this.updateObjects(dt);
        return;
      }
    }
    const surfaceWalkway =
      Math.abs(vehicle.y - SURFACE_Y) < 0.001 && !controls.up && !controls.down;
    const onGround = supported || surfaceWalkway,
      massFactor = 1 + this.cargoMass / 198,
      drag = onGround ? 3.2 : 0.85,
      rack =
        this.cargo.length && state.equipped.processor === "W01-R3"
          ? W01_EFFECTS.rack.loadedAccelerationMultiplier
          : 1,
      acceleration =
        (horizontal *
          (onGround ? 26 : 17.6) *
          power *
          rack *
          ((this.coldStatus?.coldRemaining ?? 0) > 0
            ? W02_EFFECTS.cold.accelerationMultiplier
            : 1)) /
        massFactor,
      decay = Math.exp(-drag * dt),
      maxHorizontal = Math.min(10, 5 * Math.sqrt(power));
    this.velocityX = clamp(
      this.velocityX * decay + (acceleration / drag) * (1 - decay),
      -maxHorizontal,
      maxHorizontal,
    );
    if (this.feetDeployed)
      this.velocityX *= Math.pow(
        W01_EFFECTS.feet.horizontalDriftMultiplier,
        dt * 5,
      );
    const gravity = 11.54 * this.activeWorldDefinition.gravity,
      thrust = Math.max(
        (26.7 *
          power *
          ((this.coldStatus?.coldRemaining ?? 0) > 0
            ? W02_EFFECTS.cold.accelerationMultiplier
            : 1)) /
          massFactor,
        gravity + 3.6,
      ),
      maxVertical = Math.min(12, 6 * Math.sqrt(power));
    this.velocityY = clamp(
      (this.velocityY - (controls.up ? thrust : 0) * dt) *
        Math.exp(-0.85 * dt) +
        gravity * dt,
      -maxVertical,
      maxVertical,
    );
    const beforeY = vehicle.y;
    this.moveAxis("x", this.velocityX * dt);
    this.moveAxis("y", this.velocityY * dt);
    if (
      !controls.down &&
      !controls.up &&
      beforeY <= SURFACE_Y + 1e-4 &&
      vehicle.y > SURFACE_Y
    ) {
      vehicle.y = SURFACE_Y;
      this.velocityY = 0;
    }
    if (controls.up && this.blocked(vehicle.x, vehicle.y - 0.04))
      this.message =
        "Upward rock cannot be drilled. Return through an open shaft.";
    this.updateObjects(dt);
  }
  private blocked(x: number, y: number) {
    return [x - HALF_X + EPSILON, x + HALF_X - EPSILON].some((cx) =>
      [y - HALF_Y + EPSILON, y + HALF_Y - EPSILON].some(
        (cy) => this.tile(cx, cy) !== 0,
      ),
    );
  }
  private moveAxis(axis: "x" | "y", amount: number) {
    if (!amount) return;
    const vehicle = this.state.vehicle,
      start = vehicle[axis],
      candidate =
        axis === "x" ? start + amount : Math.max(-5.5, start + amount),
      collides = (value: number) =>
        this.blocked(
          axis === "x" ? value : vehicle.x,
          axis === "y" ? value : vehicle.y,
        );
    let end = candidate;
    if (collides(end)) {
      let free = start,
        solid = end;
      for (let iteration = 0; iteration < 18; iteration++) {
        const mid = (free + solid) / 2;
        if (collides(mid)) solid = mid;
        else free = mid;
      }
      end = free;
      if (axis === "y" && this.velocityY > 7)
        this.damage(
          Math.max(1, Math.round((this.velocityY - 7) * 0.6)),
          "Hard landing",
        );
      if (axis === "x") this.velocityX = 0;
      else this.velocityY = 0;
    }
    vehicle[axis] = axis === "x" ? this.wrap(end) : end;
    if (axis === "y" && candidate !== start + amount) this.velocityY = 0;
  }
  private advanceCut(dt: number) {
    const cut = this.cut!;
    cut.progress = Math.min(1, cut.progress + dt / cut.seconds);
    if (cut.progress < 1) return;
    const ice =
      this.state.currentWorld === "W02" && this.tile(cut.x, cut.y) === 1;
    this.world.tiles[cut.y * this.world.width + cut.x] = 0;
    this.state.vehicle.x = cut.x + 0.5;
    if (cut.direction === "down") this.state.vehicle.y = cut.y + 1 - HALF_Y;
    this.state.stats.mined++;
    const volatileIds: string[] = [];
    for (const item of this.world.packages)
      if (
        item.status === "deposit" &&
        Math.floor(item.x) === cut.x &&
        Math.floor(item.y) === cut.y
      ) {
        item.status = "exposed";
        if (this.state.currentWorld === "W02" && item.tags.includes("volatile"))
          volatileIds.push(item.id);
        this.message = `${item.name} exposed.`;
      }
    if (volatileIds.length) {
      this.world.volatile = {
        packageIds: volatileIds,
        remaining: W02_EFFECTS.volatile.releaseSeconds,
        spent: ice ? cut.spent : 0,
        precision: cut.precision,
      };
      this.message =
        "Volatile seam complete! Release drilling now to preserve it (0.75 s).";
    } else if (ice) this.refundIceEnergy(cut.spent);
    this.cut = undefined;
  }
  private refundIceEnergy(spent: number) {
    if (!this.state.equipped.utilities.includes("W02-R2")) return;
    const refund = Math.min(
      spent,
      Math.max(0, spent * W02_EFFECTS.condenser.refundFraction),
    );
    this.state.vehicle.energy = Math.min(
      this.maxEnergy,
      this.state.vehicle.energy + refund,
    );
  }
  private finishVolatile(intact: boolean) {
    const pending = this.world.volatile;
    if (!pending) return false;
    delete this.world.volatile;
    for (const id of pending.packageIds) {
      const item = this.world.packages.find((entry) => entry.id === id);
      if (!item || item.status !== "exposed") continue;
      if (!intact) {
        item.status = "lost";
        if (!item.tags.includes("ruptured")) item.tags.push("ruptured");
      } else {
        if (!item.tags.includes("intact")) item.tags.push("intact");
        if (
          pending.precision &&
          item.tags.includes("ordinary") &&
          !item.tags.includes("relic") &&
          !item.processedBy.includes("W02-R3")
        ) {
          item.value = Math.round(
            item.value * W02_EFFECTS.preservation.valueMultiplier,
          );
          item.processedBy.push("W02-R3");
        }
      }
    }
    this.refundIceEnergy(pending.spent);
    this.message = intact
      ? "Intact volatile package preserved. Approach to collect and bank it."
      : "Volatile package ruptured. Release drilling on the next completion cue.";
    return true;
  }
  releaseVolatile() {
    if (!this.world.volatile || this.world.volatile.remaining <= 0)
      return false;
    this.finishVolatile(true);
    this.stop();
    this.updateObjects(0);
    return true;
  }
  private updateClimate(dt: number) {
    if (this.state.currentWorld !== "W02") return;
    const climate = (this.world.climate ??= {
      coldRemaining: 0,
      ventCooldown: 0,
      warning: null,
    });
    climate.coldRemaining = Math.max(0, climate.coldRemaining - dt);
    climate.ventCooldown = Math.max(0, climate.ventCooldown - dt);
    const { x, y } = this.state.vehicle;
    if (this.atDock) {
      climate.coldRemaining = 0;
      climate.warning = null;
      return;
    }
    const cold = W02_HAZARDS.coldPockets.some(
      (pocket) => Math.hypot(this.delta(x, pocket.x), y - pocket.y) <= 1.65,
    );
    if (!cold) climate.warning = null;
    else if (climate.coldRemaining <= 0) {
      if (climate.warning === null) {
        climate.warning = W02_EFFECTS.cold.warningSeconds;
        this.message =
          "Cold mist forming. Leave the pocket before it freezes the rig.";
      } else {
        climate.warning = Math.max(0, climate.warning - dt);
        if (climate.warning <= 1e-8) {
          climate.warning = null;
          climate.coldRemaining = W02_EFFECTS.cold.slowSeconds;
          this.message = "Cold pocket: acceleration reduced for four seconds.";
        }
      }
    }
    if (
      climate.ventCooldown <= 0 &&
      W02_HAZARDS.vents.some(
        (vent) => Math.hypot(this.delta(x, vent.x), y - vent.y) <= 0.95,
      )
    ) {
      climate.ventCooldown = W02_EFFECTS.vent.contactCooldown;
      this.damage(W02_EFFECTS.vent.damage, "Ice vent");
    }
  }
  private updateObjects(dt: number) {
    const state = this.state,
      vehicle = state.vehicle;
    state.stats.largestDepth = Math.max(state.stats.largestDepth, this.depth);
    if (
      state.currentWorld === "W01" &&
      !state.progress.beacon &&
      Math.hypot(
        this.delta(vehicle.x, W01.spawnX),
        vehicle.y - (W01.beaconRow + 0.5),
      ) < 1.15
    ) {
      state.progress.beacon = true;
      this.message =
        "Wreck beacon surveyed. Bank three ore packages at the lander.";
    }
    for (const item of this.world.packages) {
      if (
        item.status !== "exposed" ||
        this.world.volatile?.packageIds.includes(item.id) ||
        this.tile(item.x, item.y) !== 0 ||
        Math.hypot(this.delta(vehicle.x, item.x), vehicle.y - item.y) > 0.78
      )
        continue;
      if (this.cargoBulk + item.bulk <= this.capacity) {
        item.status = "carried";
        this.message =
          this.cargoBulk === this.capacity
            ? `Hold full: ${this.cargoBulk}/${this.capacity} bulk. Return to the lander to bank your haul.`
            : `${item.name} secured. ${this.cargoBulk}/${this.capacity} bulk.`;
      } else {
        this.message = `Hold full: ${item.name} remains here (${item.bulk} bulk). Return or eject a package.`;
      }
    }
    for (const mission of this.world.missions)
      if (
        mission.status === "source" &&
        this.tile(mission.x, mission.y) === 0 &&
        Math.hypot(this.delta(vehicle.x, mission.x), vehicle.y - mission.y) <
          0.9
      ) {
        mission.status = "carried";
        this.message = `${mission.name} recovered. Bank it safely at the lander.`;
      }
    for (const shelf of this.world.shelves) {
      if (shelf.collapsed) continue;
      if (this.tile(shelf.x, shelf.y) === 0) {
        shelf.collapsed = true;
        continue;
      }
      const nearby =
        Math.abs(this.delta(vehicle.x, shelf.x)) < 1.4 &&
        vehicle.y > shelf.y &&
        vehicle.y < shelf.y + 2.5;
      if (shelf.warning === null && nearby) {
        shelf.warning = W01_EFFECTS.shelf.warningSeconds;
        this.message = "Brittle shelf cracking! Move clear before it falls.";
      }
      if (shelf.warning !== null) {
        shelf.warning = Math.max(0, shelf.warning - dt);
        if (shelf.warning === 0) {
          shelf.collapsed = true;
          this.world.tiles[
            Math.floor(shelf.y) * this.world.width + Math.floor(shelf.x)
          ] = 0;
          if (nearby) this.damage(W01_EFFECTS.shelf.damage, "Falling shelf");
        }
      }
    }
    const docked = this.atDock;
    if (docked && !this.wasDocked) state.stats.expeditions++;
    this.wasDocked = docked;
  }
  private damage(amount: number, cause: string) {
    this.state.vehicle.hull = Math.max(0, this.state.vehicle.hull - amount);
    this.message = `${cause}: −${amount} hull. Return for service.`;
  }
  private stop() {
    this.velocityX = this.velocityY = 0;
    this.cut = undefined;
    this.thrusting = false;
    this.feetTime = 0;
    this.feetDeployed = false;
    this.precisionActive = false;
  }
  private requireDock() {
    if (this.atDock) return true;
    this.message = "Park at the lander's illuminated bay to use this service.";
    return false;
  }
  bank() {
    if (!this.requireDock()) return false;
    let packages = 0,
      missions = 0;
    for (const item of this.cargo) {
      item.status = "banked";
      if (item.tags.includes("ordinary") && this.state.currentWorld === "W01")
        this.state.progress.bankedOre++;
      packages++;
    }
    for (const mission of this.world.missions)
      if (mission.status === "carried") {
        mission.status = "banked";
        missions++;
      }
    this.message =
      packages || missions
        ? `Banked ${packages} cargo packages and ${missions} mission objects. Stored cargo can now be sold.`
        : "No carried cargo or mission objects to bank.";
    return Boolean(packages || missions);
  }
  sell() {
    if (!this.requireDock()) return false;
    const banked = this.warehouse;
    if (!banked.length) {
      this.message = "Bank your carried packages before selling them.";
      return false;
    }
    const value = banked.reduce((total, item) => total + item.value, 0);
    for (const item of banked) {
      item.status = "sold";
      if (item.tags.includes("ordinary")) {
        this.state.stats.ordinarySold++;
        this.state.stats.ordinaryIncome += item.value;
      }
    }
    this.state.credits += value;
    this.message = `Sold stored cargo for ${(value / 10).toLocaleString("en-US")} CR.`;
    return true;
  }
  /** Costs are integer tenths of CR, exactly as charged by surface services. */
  servicePreview(action: "refuel" | "repair") {
    const resource: "energy" | "hull" = action === "refuel" ? "energy" : "hull";
    const current = this.state.vehicle[resource],
      maximum = resource === "energy" ? this.maxEnergy : this.maxHull,
      rate = resource === "energy" ? 10 : 150,
      needed = Math.max(0, maximum - current),
      fullCost = Math.max(0, Math.ceil(needed * rate - 1e-8)),
      cost = Math.min(this.state.credits, fullCost),
      result = Math.min(maximum, current + cost / rate);
    return {
      resource,
      current,
      maximum,
      amount: result - current,
      cost,
      fullCost,
      result,
      remaining: this.state.credits - cost,
      partial: result < maximum - 1e-8,
    };
  }
  refuel() {
    if (!this.requireDock()) return false;
    const preview = this.servicePreview("refuel");
    if (preview.cost <= 0) {
      this.message =
        preview.current >= preview.maximum - 1e-8
          ? "Energy reservoir is full."
          : "No credits available for energy.";
      return false;
    }
    this.state.credits = preview.remaining;
    this.state.vehicle.energy = preview.result;
    this.message = `Energy replenished for ${(preview.cost / 10).toFixed(1)} CR.`;
    return true;
  }
  repair() {
    if (!this.requireDock()) return false;
    const preview = this.servicePreview("repair");
    if (preview.cost <= 0) {
      this.message =
        preview.current >= preview.maximum - 1e-8
          ? "Hull is fully repaired."
          : "No credits available for repairs.";
      return false;
    }
    this.state.credits = preview.remaining;
    this.state.vehicle.hull = preview.result;
    this.message = `Hull repaired for ${(preview.cost / 10).toFixed(1)} CR.`;
    return true;
  }
  buyHardware(key: HardwareKey) {
    if (!this.requireDock()) return false;
    if (!HARDWARE_KEYS.includes(key)) return false;
    if (!this.hardwareUnlocked) {
      this.message = "Complete W01 M1 to unlock salvaged hardware blueprints.";
      return false;
    }
    if (this.state.hardware[key] >= this.hardwareCap) {
      this.message = "Higher hardware ranks unlock at later destinations.";
      return false;
    }
    const rank = this.state.hardware[key] + 1;
    const price = HARDWARE_PRICES[key][rank]!;
    if (this.state.credits < price) {
      this.message = `Need ${formatCredits(price - this.state.credits)} CR more for this component (${formatCredits(price)} CR total).`;
      return false;
    }
    this.state.credits -= price;
    this.state.hardware[key] = rank;
    this.state.purchases.push({
      id: `CORE-${rank}-${key.toUpperCase()}`,
      paid: price,
      balanceVersion: BALANCE_VERSION,
    });
    if (key === "energy") this.state.vehicle.energy = this.maxEnergy;
    if (key === "hull") this.state.vehicle.hull = this.maxHull;
    this.message = `Salvaged ${key} installed. Its improvement is active now.`;
    return true;
  }
  buyGear(id: string) {
    if (!this.requireDock()) return false;
    const gear = this.gearDefinitions.find(
      (entry) =>
        entry.id === id && entry.id.startsWith(this.state.currentWorld + "-"),
    );
    if (!gear) return false;
    if (this.state.ownedGear.includes(id)) {
      this.message =
        "Already owned. Equip or stow this module without another purchase.";
      return false;
    }
    if (
      (gear.requires && !this.state.ownedGear.includes(gear.requires)) ||
      (gear.milestone && !this.completedMilestones.includes(gear.milestone))
    ) {
      this.message = `Complete ${this.state.currentWorld} M${gear.milestone} and own its preceding module first.`;
      return false;
    }
    if (this.state.credits < gear.price) {
      this.message = `Need ${formatCredits(gear.price - this.state.credits)} CR more for ${gear.name} (${formatCredits(gear.price)} CR total).`;
      return false;
    }
    if (
      gear.slot === "processor" &&
      this.cargoBulk >
        Math.floor(
          level(this.state, "cargo") *
            (gear.id === "W01-R3" ? W01_EFFECTS.rack.bulkMultiplier : 1),
        )
    ) {
      this.message =
        "Bank enough cargo before replacing the installed cargo rack.";
      return false;
    }
    this.state.credits -= gear.price;
    this.state.ownedGear.push(id);
    this.state.purchases.push({
      id,
      paid: gear.price,
      balanceVersion: BALANCE_VERSION,
    });
    if (
      gear.slot === "drill" ||
      gear.slot === "mobility" ||
      gear.slot === "processor"
    )
      this.state.equipped[gear.slot] = id;
    if (gear.slot === "utility" && this.state.equipped.utilities.length < 2)
      this.state.equipped.utilities.push(id);
    this.message = `${gear.name} purchased and installed.`;
    return true;
  }
  toggleGear(id: string) {
    if (!this.requireDock()) return false;
    const gear = this.gearDefinitions.find((entry) => entry.id === id);
    if (!gear || !this.state.ownedGear.includes(id)) return false;
    if (gear.slot === "utility") {
      const current = this.state.equipped.utilities;
      if (current.includes(id))
        this.state.equipped.utilities = current.filter((entry) => entry !== id);
      else if (current.length < 2) current.push(id);
      else {
        this.message = "Stow a utility before installing another module.";
        return false;
      }
      this.message = `${gear.name} ${this.state.equipped.utilities.includes(id) ? "equipped" : "stowed"}.`;
      return true;
    }
    if (
      gear.slot !== "drill" &&
      gear.slot !== "mobility" &&
      gear.slot !== "processor"
    )
      return false;
    const slot = gear.slot,
      current = this.state.equipped[slot];
    this.state.equipped[slot] = current === id ? null : id;
    if (this.cargoBulk > this.capacity) {
      this.state.equipped[slot] = current;
      this.message = "Bank enough cargo before stowing the rack.";
      return false;
    }
    this.feetDeployed = false;
    this.feetTime = 0;
    this.message = `${gear.name} ${current === id ? "stowed" : "equipped"}.`;
    return true;
  }
  payMilestone() {
    if (!this.requireDock()) return false;
    const milestone = this.currentMilestone;
    if (!milestone) {
      this.message = "The lander is restored. Prepare to depart.";
      return false;
    }
    if (!this.missionReady) {
      this.message = `Finish and bank the objectives for M${milestone.id} before construction.`;
      return false;
    }
    if (this.state.credits < milestone.fee) {
      this.message = `Construction requires ${(milestone.fee / 10).toLocaleString("en-US")} CR.`;
      return false;
    }
    this.state.credits -= milestone.fee;
    this.completedMilestones.push(milestone.id);
    if (milestone.id === 3) {
      if (this.state.currentWorld === "W01")
        this.state.progress.unlockedWorlds = ["W01", "W02", "W03"];
      else if (!this.state.progress.unlockedWorlds.includes("W04"))
        this.state.progress.unlockedWorlds.push("W04");
    }
    this.message =
      milestone.id === 3
        ? this.state.currentWorld === "W01"
          ? "Lander restored. Frontier certificate granted. Ice comet and Fractured moon charted."
          : "Comet fuel stabilized. Planetary certificate granted; Iron planet charted."
        : `M${milestone.id} complete. Construction installed and new blueprints unlocked.`;
    return true;
  }
  eject(id: string) {
    const item = this.cargo.find((candidate) => candidate.id === id);
    if (!item) return false;
    const { x, y } = this.state.vehicle;
    const candidates = [
      { x: x + (this.facing === "right" ? 1.15 : -1.15), y },
      { x, y: y - 1.15 },
      { x: x - (this.facing === "right" ? 1.15 : -1.15), y },
    ];
    const destination = candidates.find(
      (point) => this.tile(point.x, point.y) === 0,
    );
    if (!destination) {
      this.message = "Move into an open tunnel before ejecting a package.";
      return false;
    }
    item.status = "exposed";
    item.x = this.wrap(destination.x);
    item.y = destination.y;
    this.message = `${item.name} ejected intact. Return to collect it later.`;
    return true;
  }
  get recoveryPreview() {
    const spend = this.state.purchases.reduce(
        (total, purchase) => total + purchase.paid,
        0,
      ),
      cost = Math.min(
        this.state.credits,
        250000,
        (100 + Math.floor(spend / 1000)) * 10,
      );
    return {
      cost,
      remaining: this.state.credits - cost,
      energy: clamp(
        this.state.vehicle.energy,
        this.maxEnergy * 0.5,
        this.maxEnergy,
      ),
      hull: clamp(this.state.vehicle.hull, this.maxHull * 0.5, this.maxHull),
    };
  }
  recover() {
    const state = this.state,
      preview = this.recoveryPreview;
    if (this.world.volatile) this.finishVolatile(false);
    for (const item of this.cargo) item.status = "lost";
    for (const mission of this.world.missions)
      if (mission.status === "carried") mission.status = "source";
    state.credits = preview.remaining;
    state.vehicle = {
      x: this.activeWorldDefinition.dockX,
      y: SURFACE_Y,
      energy: preview.energy,
      hull: preview.hull,
    };
    state.stats.recoveries++;
    this.stop();
    this.wasDocked = true;
    const safeIncome = this.world.packages.some(
      (item) =>
        item.tags.includes("ordinary") &&
        (item.status === "deposit" || item.status === "exposed") &&
        item.y < 6 &&
        Math.abs(this.delta(this.activeWorldDefinition.dockX, item.x)) < 4,
    );
    if (!safeIncome) {
      let serial = state.stats.recoveries;
      while (
        this.world.packages.some(
          (item) => item.id === `${state.currentWorld}-emergency-${serial}`,
        )
      )
        serial++;
      const ore = (state.currentWorld === "W01" ? W01_ORES : W02_ORES)[0]!;
      this.world.packages.push({
        id: `${state.currentWorld}-emergency-${serial}`,
        itemId: ore.id,
        name: `Emergency ${ore.name} salvage`,
        origin: state.currentWorld,
        balanceVersion: BALANCE_VERSION,
        value: ore.value,
        bulk: ore.bulk,
        mass: ore.mass,
        tags: [...ore.tags, "emergency"],
        x: this.activeWorldDefinition.dockX + 2,
        y: -0.5,
        status: "exposed",
        processedBy: [],
      });
    }
    this.message = `Recovered for ${formatCredits(preview.cost)} CR. Carried cargo lost; unbanked mission objects returned to their sources. Energy and hull replenished to at least 50%.`;
    this.refreshVisibility();
    return true;
  }
  depart() {
    if (!this.requireDock()) return false;
    if (this.state.currentWorld !== "W01") {
      this.message =
        "Use navigation to return to your asteroid claim. Iron planet is charted for a future chapter.";
      return false;
    }
    if (!this.state.progress.completed.includes(3)) {
      this.message =
        "Restore the lander through all three milestones before departure.";
      return false;
    }
    if (this.state.progress.departed) {
      this.message =
        "Frontier departure already recorded. You can continue mining this claim.";
      return false;
    }
    this.bank();
    this.state.progress.departed = true;
    this.stop();
    this.message =
      "Frontier departure complete. Ice comet is ready in navigation. Your rig, claim and progress are preserved.";
    return true;
  }
  travelPreview(destination: string) {
    let reason = "";
    if (!["W01", "W02"].includes(destination))
      reason = "This destination is charted but is not playable yet.";
    else if (destination === this.state.currentWorld)
      reason = "You are already at this destination.";
    else if (!this.atDock)
      reason = "Park in the lander's illuminated bay before travel.";
    else if (
      !this.state.progress.departed ||
      !this.state.progress.completed.includes(3)
    )
      reason = "Restore the W01 lander and record Frontier departure first.";
    else if (this.world.volatile)
      reason = "Resolve the volatile release window before travel.";
    return {
      allowed: !reason,
      reason,
      cargoCount: this.cargo.length,
      missionCount: this.world.missions.filter(
        (item) => item.status === "carried",
      ).length,
    };
  }
  travel(destination: string) {
    const preview = this.travelPreview(destination);
    if (!preview.allowed) {
      this.message = preview.reason;
      return false;
    }
    this.bank();
    if (destination === "W02" && !this.state.worlds.W02)
      this.state.worlds.W02 = createW02((this.state.seed ^ 0x02c0ffee) >>> 0);
    this.state.currentWorld = destination as "W01" | "W02";
    this.state.schema = 2;
    this.state.vehicle.x = this.activeWorldDefinition.dockX;
    this.state.vehicle.y = SURFACE_Y;
    this.stop();
    this.wasDocked = true;
    this.refreshVisibility();
    this.message =
      destination === "W02"
        ? "Ice comet arrival. Rank-2 blueprints available. Follow the marked thermal sample seam at 150 m."
        : "Returned to your asteroid claim. Excavation, stored cargo and construction are preserved.";
    return true;
  }
}

const finite = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const integer = (value: unknown, min: number, max: number) =>
  finite(value, min, max) && Number.isInteger(value);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const shortString = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 160;
const unique = (values: readonly unknown[]) =>
  new Set(values).size === values.length;

/** Strict import boundary; malformed or future data never replaces a campaign. */
export function decodeCampaign(raw: string): CampaignState {
  try {
    if (raw.length > 2 * 1024 * 1024)
      throw new Error("Campaign snapshot is too large.");
    const source: unknown = JSON.parse(raw);
    if (!record(source)) throw new Error("Campaign must be an object.");
    if (
      (source.schema !== 1 && source.schema !== 2) ||
      source.balanceVersion !== BALANCE_VERSION ||
      source.generatorVersion !== GENERATOR_VERSION
    )
      throw new Error(
        "This campaign version is unsupported. Its saved data has been kept.",
      );
    const legacy = source.schema === 1;
    const state = source as unknown as CampaignState;
    const sequential = (value: unknown): value is number[] =>
      Array.isArray(value) &&
      value.length <= 3 &&
      value.every((id, index) => id === index + 1);
    if (
      !shortString(state.id) ||
      !integer(state.seed, 0, 0xffffffff) ||
      !integer(state.credits, 0, 1e13) ||
      !finite(state.elapsed, 0, 1e10) ||
      !["W01", "W02"].includes(state.currentWorld) ||
      !record(state.worlds) ||
      !record(state.worlds.W01) ||
      Object.keys(state.worlds).some((id) => !["W01", "W02"].includes(id)) ||
      (legacy &&
        (state.currentWorld !== "W01" ||
          Object.keys(state.worlds).length !== 1)) ||
      !state.worlds[state.currentWorld] ||
      !record(state.progress) ||
      typeof state.progress.beacon !== "boolean" ||
      typeof state.progress.departed !== "boolean" ||
      !integer(state.progress.bankedOre, 0, 1e7) ||
      !sequential(state.progress.completed) ||
      !Array.isArray(state.progress.unlockedWorlds) ||
      !unique(state.progress.unlockedWorlds) ||
      state.progress.unlockedWorlds.some(
        (id) => !["W01", "W02", "W03", "W04"].includes(id),
      ) ||
      !state.progress.unlockedWorlds.includes("W01")
    )
      throw new Error("Campaign progression is invalid.");
    const frontier = state.worlds.W02;
    const hardwareCap = frontier && !legacy ? 2 : 1;
    if (
      !record(state.hardware) ||
      !HARDWARE_KEYS.every((key) =>
        integer(state.hardware[key], 0, hardwareCap),
      ) ||
      Object.keys(state.hardware).length !== HARDWARE_KEYS.length
    )
      throw new Error("Campaign hardware ranks are invalid.");
    const allGear = legacy ? [...W01_GEAR] : [...W01_GEAR, ...W02_GEAR];
    if (
      !Array.isArray(state.ownedGear) ||
      !unique(state.ownedGear) ||
      !state.ownedGear.includes("W01-R1") ||
      state.ownedGear.some((id) => !allGear.some((gear) => gear.id === id)) ||
      !record(state.equipped) ||
      !Array.isArray(state.equipped.utilities) ||
      state.equipped.utilities.length > 2 ||
      !unique(state.equipped.utilities) ||
      state.equipped.utilities.some(
        (id) =>
          !state.ownedGear.includes(id) ||
          !allGear.some((gear) => gear.id === id && gear.slot === "utility"),
      )
    )
      throw new Error("Campaign loadout is invalid.");
    for (const slot of ["drill", "mobility", "processor"] as const) {
      const id = state.equipped[slot];
      if (
        id !== null &&
        (!state.ownedGear.includes(id) ||
          !allGear.some((gear) => gear.id === id && gear.slot === slot))
      )
        throw new Error("Equipped gear is not owned or uses the wrong slot.");
    }
    for (const gear of allGear) {
      const completed = gear.id.startsWith("W02-")
        ? frontier?.completed
        : state.progress.completed;
      if (
        state.ownedGear.includes(gear.id) &&
        ((gear.id.startsWith("W02-") && !frontier) ||
          (gear.requires && !state.ownedGear.includes(gear.requires)) ||
          (gear.milestone && !completed?.includes(gear.milestone)))
      )
        throw new Error("Owned equipment has unmet prerequisites.");
    }
    if (
      !Array.isArray(state.purchases) ||
      state.purchases.length > 20 ||
      !unique(state.purchases.map((purchase) => purchase?.id)) ||
      state.purchases.some(
        (purchase) =>
          !record(purchase) ||
          !shortString(purchase.id) ||
          !integer(purchase.paid, 0, 1e10) ||
          purchase.balanceVersion !== BALANCE_VERSION,
      )
    )
      throw new Error("Campaign purchase ledger is invalid.");
    const packageIdentities = new Set<string>();
    for (const [id, world] of Object.entries(state.worlds)) {
      const definition = id === "W01" ? W01 : W02;
      const ores = id === "W01" ? W01_ORES : W02_ORES;
      if (
        !record(world) ||
        world.id !== id ||
        world.width !== definition.width ||
        world.rows !== definition.rows ||
        !integer(world.seed, 0, 0xffffffff)
      )
        throw new Error("Campaign world dimensions are invalid.");
      const cells = definition.width * definition.rows;
      if (
        !Array.isArray(world.tiles) ||
        world.tiles.length !== cells ||
        world.tiles.some((tile) => !integer(tile, 0, 3)) ||
        !Array.isArray(world.discovered) ||
        world.discovered.length !== cells ||
        world.discovered.some((known) => known !== 0 && known !== 1) ||
        !Array.isArray(world.packages) ||
        world.packages.length > cells + 1000 ||
        !unique(world.packages.map((item) => item?.id))
      )
        throw new Error("Campaign terrain or package identities are invalid.");
      for (const item of world.packages) {
        if (
          !record(item) ||
          !shortString(item.id) ||
          packageIdentities.has(item.id) ||
          !shortString(item.name) ||
          item.origin !== id ||
          item.balanceVersion !== BALANCE_VERSION ||
          ![...ores.map((ore) => ore.id), id + "-J"].includes(item.itemId) ||
          !integer(item.value, 0, 100000) ||
          !integer(item.bulk, 1, 32) ||
          !finite(item.mass, 0.1, 1000) ||
          !finite(item.x, 0, definition.width - EPSILON) ||
          !finite(item.y, -6, definition.rows - EPSILON) ||
          !Array.isArray(item.tags) ||
          item.tags.some((tag) => !shortString(tag)) ||
          !unique(item.tags) ||
          !Array.isArray(item.processedBy) ||
          item.processedBy.some((processor) => !shortString(processor)) ||
          !unique(item.processedBy) ||
          !["deposit", "exposed", "carried", "banked", "sold", "lost"].includes(
            item.status,
          )
        )
          throw new Error("Campaign cargo package is invalid.");
        packageIdentities.add(item.id);
        if (
          item.status === "deposit" &&
          (item.y < 0 ||
            world.tiles[
              Math.floor(item.y) * world.width + Math.floor(item.x)
            ] === 0)
        )
          throw new Error("An unextracted package is missing its terrain.");
        if (id !== state.currentWorld && item.status === "carried")
          throw new Error(
            "Carried cargo cannot be left on an inactive destination.",
          );
      }
      const missionIds =
        id === "W01"
          ? ["W01-VALVE", "W01-ANTENNA", "W01-Q"]
          : [...W02_MILESTONES[0].requiredMissionIds, "W02-Q"];
      if (
        !Array.isArray(world.missions) ||
        world.missions.length !== missionIds.length ||
        !unique(world.missions.map((mission) => mission?.id))
      )
        throw new Error("Mission records are invalid.");
      for (const mission of world.missions) {
        if (
          !record(mission) ||
          !missionIds.includes(mission.id) ||
          !shortString(mission.name) ||
          !finite(mission.x, 0, definition.width - EPSILON) ||
          !finite(mission.y, 0, definition.rows - EPSILON) ||
          !["source", "carried", "banked"].includes(mission.status)
        )
          throw new Error("A mission object is invalid.");
        if (id !== state.currentWorld && mission.status === "carried")
          throw new Error(
            "Carried mission cargo cannot be left on an inactive destination.",
          );
      }
      if (
        !Array.isArray(world.shelves) ||
        world.shelves.length > cells ||
        !unique(world.shelves.map((shelf) => shelf?.id))
      )
        throw new Error("Shelf records are invalid.");
      for (const shelf of world.shelves)
        if (
          !record(shelf) ||
          !shortString(shelf.id) ||
          !finite(shelf.x, 0, definition.width - EPSILON) ||
          !finite(shelf.y, 0, definition.rows - EPSILON) ||
          typeof shelf.collapsed !== "boolean" ||
          (shelf.warning !== null &&
            !finite(shelf.warning, 0, W01_EFFECTS.shelf.warningSeconds))
        )
          throw new Error("A shelf state is invalid.");
      if (id === "W02") {
        if (!sequential(world.completed))
          throw new Error("Comet construction is invalid.");
        if (
          world.climate !== undefined &&
          (!record(world.climate) ||
            !finite(
              world.climate.coldRemaining,
              0,
              W02_EFFECTS.cold.slowSeconds,
            ) ||
            !finite(
              world.climate.ventCooldown,
              0,
              W02_EFFECTS.vent.contactCooldown,
            ) ||
            (world.climate.warning !== null &&
              !finite(
                world.climate.warning,
                0,
                W02_EFFECTS.cold.warningSeconds,
              )))
        )
          throw new Error("Comet hazard timers are invalid.");
        if (world.volatile !== undefined) {
          const pending = world.volatile;
          if (
            !record(pending) ||
            !Array.isArray(pending.packageIds) ||
            !pending.packageIds.length ||
            pending.packageIds.length > 4 ||
            !unique(pending.packageIds) ||
            !finite(
              pending.remaining,
              Number.EPSILON,
              W02_EFFECTS.volatile.releaseSeconds,
            ) ||
            !finite(pending.spent, 0, 100) ||
            typeof pending.precision !== "boolean" ||
            pending.packageIds.some(
              (packageId) =>
                !world.packages.some(
                  (item) =>
                    item.id === packageId &&
                    item.status === "exposed" &&
                    item.tags.includes("volatile") &&
                    !item.tags.includes("intact") &&
                    !item.tags.includes("ruptured"),
                ),
            )
          )
            throw new Error("Volatile release state is invalid.");
        }
        if (
          world.completed.includes(1) &&
          world.missions.filter(
            (mission) =>
              mission.id.startsWith("W02-SAMPLE-") &&
              mission.status === "banked",
          ).length < 5
        )
          throw new Error("Comet construction lacks its banked sample proof.");
        if (
          world.completed.includes(2) &&
          world.packages.filter(
            (item) =>
              item.itemId === "W02-O3" &&
              item.tags.includes("cryosample") &&
              item.tags.includes("intact") &&
              (item.status === "banked" || item.status === "sold"),
          ).length < 3
        )
          throw new Error(
            "Comet construction lacks intact cryosilicate proof.",
          );
        if (
          world.completed.includes(3) &&
          !world.missions.some(
            (mission) => mission.id === "W02-Q" && mission.status === "banked",
          )
        )
          throw new Error("Comet construction lacks its cryogenic catalyst.");
      } else if (
        world.volatile !== undefined ||
        world.climate !== undefined ||
        world.completed !== undefined
      )
        throw new Error("W01 contains unsupported destination state.");
    }
    const world = state.worlds[state.currentWorld]!;
    if (
      !record(state.vehicle) ||
      !finite(state.vehicle.x, 0, world.width - EPSILON) ||
      !finite(state.vehicle.y, -5.5, world.rows - HALF_Y + 1e-6) ||
      !finite(state.vehicle.energy, 0, level(state, "energy")) ||
      !finite(state.vehicle.hull, 0, level(state, "hull"))
    )
      throw new Error("Vehicle condition is invalid.");
    const bodyFree = [
      state.vehicle.x - HALF_X + EPSILON,
      state.vehicle.x + HALF_X - EPSILON,
    ].every((x) =>
      [
        state.vehicle.y - HALF_Y + EPSILON,
        state.vehicle.y + HALF_Y - EPSILON,
      ].every(
        (y) =>
          y < 0 ||
          (y < world.rows &&
            world.tiles[
              Math.floor(y) * world.width +
                Math.floor(wrapCampaignX(x, world.width))
            ] === 0),
      ),
    );
    if (!bodyFree) throw new Error("Saved vehicle overlaps solid terrain.");
    const cargoBulk = world.packages
      .filter((item) => item.status === "carried")
      .reduce((total, item) => total + item.bulk, 0);
    const capacity = Math.floor(
      level(state, "cargo") *
        (state.equipped.processor === "W01-R3"
          ? W01_EFFECTS.rack.bulkMultiplier
          : 1),
    );
    if (cargoBulk > capacity)
      throw new Error("Saved cargo exceeds the installed capacity.");
    if (
      !record(state.stats) ||
      ![
        "mined",
        "ordinarySold",
        "ordinaryIncome",
        "recoveries",
        "largestDepth",
        "expeditions",
      ].every((key) =>
        integer(state.stats[key as keyof typeof state.stats], 0, 1e13),
      )
    )
      throw new Error("Campaign statistics are invalid.");
    if (
      (state.progress.departed || state.progress.unlockedWorlds.length > 1) &&
      !state.progress.completed.includes(3)
    )
      throw new Error("Destination unlocks lack their completion certificate.");
    if (
      frontier &&
      (!state.progress.departed || !state.progress.completed.includes(3))
    )
      throw new Error(
        "Comet arrival lacks the Frontier departure certificate.",
      );
    if (
      state.progress.unlockedWorlds.includes("W04") &&
      !frontier?.completed?.includes(3)
    )
      throw new Error("The Planetary certificate lacks comet completion.");
    if (
      state.progress.completed.includes(1) &&
      (!state.progress.beacon || state.progress.bankedOre < 3)
    )
      throw new Error("The first milestone lacks its banked proof.");
    for (const milestone of W01_MILESTONES)
      if (
        state.progress.completed.includes(milestone.id) &&
        !milestone.requiredMissionIds.every((id) =>
          state.worlds.W01!.missions.some(
            (mission) => mission.id === id && mission.status === "banked",
          ),
        )
      )
        throw new Error(
          "A completed milestone lacks its banked mission objects.",
        );
    state.schema = 2;
    return state;
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error(
        "This file is not valid campaign JSON. Your saved campaign has been kept.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Campaign data is incomplete. Your saved campaign has been kept.",
      );
    throw error;
  }
}
