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
import { createW01 } from "./world";
import type {
  CampaignControls,
  CampaignPackage,
  CampaignState,
  HardwareKey,
} from "./types";

export const wrapCampaignX = (x: number) =>
  ((x % W01.width) + W01.width) % W01.width;
export const campaignDelta = (from: number, to: number) =>
  wrapCampaignX(to - from + W01.width / 2) - W01.width / 2;
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
    schema: 1,
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
  private feetTime = 0;
  private cut: Cut | undefined;
  private visible = new Set<number>();
  private wasDocked = false;

  constructor(state = createCampaign()) {
    this.state = state;
    this.refreshVisibility();
    this.wasDocked = this.atDock;
  }

  get world() {
    return this.state.worlds[this.state.currentWorld]!;
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
      W01.depth,
    );
  }
  get atDock() {
    const { x, y } = this.state.vehicle;
    return (
      !this.cut &&
      Math.abs(campaignDelta(x, W01.dockX)) <= 1.65 &&
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
      ? wrapCampaignX(
          cut.startX + campaignDelta(cut.startX, cut.x + 0.5) * cut.progress,
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
    return W01_MILESTONES.find(
      (milestone) => !this.state.progress.completed.includes(milestone.id),
    );
  }
  get missionReady() {
    const milestone = this.currentMilestone;
    if (!milestone) return false;
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
      Math.floor(y) * this.world.width + Math.floor(wrapCampaignX(x))
    ]!;
  }
  isKnown(x: number, y: number) {
    return (
      y < 0 ||
      (y < this.world.rows &&
        this.world.discovered[
          Math.floor(y) * this.world.width + Math.floor(wrapCampaignX(x))
        ] === 1)
    );
  }
  isVisible(x: number, y: number) {
    return (
      y < 0 ||
      (y < this.world.rows &&
        this.visible.has(
          Math.floor(y) * this.world.width + Math.floor(wrapCampaignX(x)),
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
          const index =
            row * this.world.width + Math.floor(wrapCampaignX(column));
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
    const fuel =
      (vehicle.y > SURFACE_Y + 0.01 ? 0.063 : 0) +
      (this.cut
        ? 0.252
        : Number(Boolean(horizontal)) * 0.126 * movementFactor +
          Number(Boolean(controls.up)) * 0.126 * movementFactor * reserve);
    vehicle.energy = Math.max(0, vehicle.energy - fuel * dt);
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
      if (material === 3) this.message = "The asteroid's bedrock ends here.";
      else if (material) {
        const auger =
          material === 1 && state.equipped.drill === "W01-R1"
            ? W01_EFFECTS.auger.soilCutMultiplier
            : 1;
        this.cut = {
          x: Math.floor(wrapCampaignX(tx)),
          y: ty,
          startX: vehicle.x,
          startY: vehicle.y,
          progress: 0,
          direction: controls.down ? "down" : horizontal < 0 ? "left" : "right",
          seconds: Math.max(
            0.25,
            ((controls.down ? 1 : 0.75) *
              (material === 2 ? 1.85 : 1) *
              Math.min(5, 1 + Math.max(0, ty) / 80) *
              auger) /
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
        (horizontal * (onGround ? 26 : 17.6) * power * rack) / massFactor,
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
    const gravity = 11.54 * W01.gravity,
      thrust = Math.max((26.7 * power) / massFactor, gravity + 3.6),
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
    vehicle[axis] = axis === "x" ? wrapCampaignX(end) : end;
    if (axis === "y" && candidate !== start + amount) this.velocityY = 0;
  }
  private advanceCut(dt: number) {
    const cut = this.cut!;
    cut.progress = Math.min(1, cut.progress + dt / cut.seconds);
    if (cut.progress < 1) return;
    this.world.tiles[cut.y * this.world.width + cut.x] = 0;
    this.state.vehicle.x = cut.x + 0.5;
    if (cut.direction === "down") this.state.vehicle.y = cut.y + 1 - HALF_Y;
    this.state.stats.mined++;
    for (const item of this.world.packages)
      if (
        item.status === "deposit" &&
        Math.floor(item.x) === cut.x &&
        Math.floor(item.y) === cut.y
      ) {
        item.status = "exposed";
        this.message = `${item.name} exposed.`;
      }
    this.cut = undefined;
  }
  private updateObjects(dt: number) {
    const state = this.state,
      vehicle = state.vehicle;
    state.stats.largestDepth = Math.max(state.stats.largestDepth, this.depth);
    if (
      !state.progress.beacon &&
      Math.hypot(
        campaignDelta(vehicle.x, W01.spawnX),
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
        this.tile(item.x, item.y) !== 0 ||
        Math.hypot(campaignDelta(vehicle.x, item.x), vehicle.y - item.y) > 0.78
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
        Math.hypot(campaignDelta(vehicle.x, mission.x), vehicle.y - mission.y) <
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
        Math.abs(campaignDelta(vehicle.x, shelf.x)) < 1.4 &&
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
      if (item.tags.includes("ordinary")) this.state.progress.bankedOre++;
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
    if (!this.state.progress.completed.includes(1)) {
      this.message = "Complete W01 M1 to unlock salvaged hardware blueprints.";
      return false;
    }
    if (this.state.hardware[key] >= 1) {
      this.message = "Higher hardware ranks unlock at later destinations.";
      return false;
    }
    const price = HARDWARE_PRICES[key][1]!;
    if (this.state.credits < price) {
      this.message = `Need ${formatCredits(price - this.state.credits)} CR more for this component (${formatCredits(price)} CR total).`;
      return false;
    }
    this.state.credits -= price;
    this.state.hardware[key] = 1;
    this.state.purchases.push({
      id: `CORE-1-${key.toUpperCase()}`,
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
    const gear = W01_GEAR.find((entry) => entry.id === id);
    if (!gear) return false;
    if (this.state.ownedGear.includes(id)) {
      this.message =
        "Already owned. Equip or stow this module without another purchase.";
      return false;
    }
    if (
      (gear.requires && !this.state.ownedGear.includes(gear.requires)) ||
      (gear.milestone &&
        !this.state.progress.completed.includes(gear.milestone))
    ) {
      this.message = `Complete W01 M${gear.milestone} and own its preceding module first.`;
      return false;
    }
    if (this.state.credits < gear.price) {
      this.message = `Need ${formatCredits(gear.price - this.state.credits)} CR more for ${gear.name} (${formatCredits(gear.price)} CR total).`;
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
    this.message = `${gear.name} purchased and installed.`;
    return true;
  }
  toggleGear(id: string) {
    if (!this.requireDock()) return false;
    const gear = W01_GEAR.find((entry) => entry.id === id);
    if (!gear || !this.state.ownedGear.includes(id)) return false;
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
    this.state.progress.completed.push(milestone.id);
    if (milestone.id === 3)
      this.state.progress.unlockedWorlds = ["W01", "W02", "W03"];
    this.message =
      milestone.id === 3
        ? "Lander restored. Frontier certificate granted. Ice comet and Fractured moon charted."
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
    item.x = wrapCampaignX(destination.x);
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
    for (const item of this.cargo) item.status = "lost";
    for (const mission of this.world.missions)
      if (mission.status === "carried") mission.status = "source";
    state.credits = preview.remaining;
    state.vehicle = {
      x: W01.dockX,
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
        Math.abs(campaignDelta(W01.dockX, item.x)) < 4,
    );
    if (!safeIncome) {
      let serial = state.stats.recoveries;
      while (
        this.world.packages.some(
          (item) => item.id === `W01-emergency-${serial}`,
        )
      )
        serial++;
      const ore = W01_ORES[0]!;
      this.world.packages.push({
        id: `W01-emergency-${serial}`,
        itemId: ore.id,
        name: "Emergency Ironium salvage",
        origin: "W01",
        balanceVersion: BALANCE_VERSION,
        value: ore.value,
        bulk: ore.bulk,
        mass: ore.mass,
        tags: [...ore.tags, "emergency"],
        x: W01.dockX + 2,
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
      "Frontier departure complete. The comet and moon are charted for the next campaign slice. Your rig, claim and progress are preserved.";
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
      source.schema !== 1 ||
      source.balanceVersion !== BALANCE_VERSION ||
      source.generatorVersion !== GENERATOR_VERSION
    )
      throw new Error(
        "This campaign version is unsupported. Its saved data has been kept.",
      );
    const state = source as unknown as CampaignState;
    if (
      !shortString(state.id) ||
      !integer(state.seed, 0, 0xffffffff) ||
      !integer(state.credits, 0, 1e13) ||
      !finite(state.elapsed, 0, 1e10) ||
      state.currentWorld !== "W01" ||
      !record(state.hardware) ||
      !HARDWARE_KEYS.every((key) => integer(state.hardware[key], 0, 1)) ||
      Object.keys(state.hardware).length !== HARDWARE_KEYS.length ||
      !record(state.worlds) ||
      Object.keys(state.worlds).length !== 1 ||
      !record(state.progress) ||
      typeof state.progress.beacon !== "boolean" ||
      typeof state.progress.departed !== "boolean" ||
      !integer(state.progress.bankedOre, 0, 1e7) ||
      !Array.isArray(state.progress.completed) ||
      state.progress.completed.length > 3 ||
      !state.progress.completed.every((id, index) => id === index + 1) ||
      !Array.isArray(state.progress.unlockedWorlds) ||
      !unique(state.progress.unlockedWorlds) ||
      state.progress.unlockedWorlds.some(
        (id) => !["W01", "W02", "W03"].includes(id),
      ) ||
      !state.progress.unlockedWorlds.includes("W01")
    )
      throw new Error("Campaign progression is invalid.");
    if (
      !Array.isArray(state.ownedGear) ||
      !unique(state.ownedGear) ||
      !state.ownedGear.includes("W01-R1") ||
      state.ownedGear.some((id) => !W01_GEAR.some((gear) => gear.id === id)) ||
      !record(state.equipped) ||
      !Array.isArray(state.equipped.utilities) ||
      state.equipped.utilities.length !== 0
    )
      throw new Error("Campaign loadout is invalid.");
    for (const slot of ["drill", "mobility", "processor"] as const) {
      const id = state.equipped[slot];
      if (
        id !== null &&
        (!state.ownedGear.includes(id) ||
          !W01_GEAR.some((gear) => gear.id === id && gear.slot === slot))
      )
        throw new Error("Equipped gear is not owned or uses the wrong slot.");
    }
    for (const gear of W01_GEAR)
      if (
        state.ownedGear.includes(gear.id) &&
        ((gear.requires && !state.ownedGear.includes(gear.requires)) ||
          (gear.milestone &&
            !state.progress.completed.includes(gear.milestone)))
      )
        throw new Error("Owned equipment has unmet prerequisites.");
    if (
      !Array.isArray(state.purchases) ||
      state.purchases.length > 8 ||
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
    const world = state.worlds.W01;
    if (
      !record(world) ||
      world.id !== "W01" ||
      world.width !== W01.width ||
      world.rows !== W01.rows ||
      !integer(world.seed, 0, 0xffffffff)
    )
      throw new Error("Campaign world dimensions are invalid.");
    const cells = W01.width * W01.rows;
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
    const statuses = [
      "deposit",
      "exposed",
      "carried",
      "banked",
      "sold",
      "lost",
    ];
    for (const item of world.packages) {
      if (
        !record(item) ||
        !shortString(item.id) ||
        !shortString(item.name) ||
        item.origin !== "W01" ||
        item.balanceVersion !== BALANCE_VERSION ||
        ![...W01_ORES.map((ore) => ore.id), "W01-J"].includes(item.itemId) ||
        !integer(item.value, 0, 100000) ||
        !integer(item.bulk, 1, 32) ||
        !finite(item.mass, 0.1, 1000) ||
        !finite(item.x, 0, W01.width - EPSILON) ||
        !finite(item.y, -6, W01.rows - EPSILON) ||
        !Array.isArray(item.tags) ||
        item.tags.some((tag) => !shortString(tag)) ||
        !Array.isArray(item.processedBy) ||
        item.processedBy.some((id) => !shortString(id)) ||
        !statuses.includes(item.status)
      )
        throw new Error("Campaign cargo package is invalid.");
      if (
        item.status === "deposit" &&
        (item.y < 0 ||
          world.tiles[Math.floor(item.y) * W01.width + Math.floor(item.x)] ===
            0)
      )
        throw new Error("An unextracted package is missing its terrain.");
    }
    const missionIds = ["W01-VALVE", "W01-ANTENNA", "W01-Q"];
    if (
      !Array.isArray(world.missions) ||
      world.missions.length !== 3 ||
      !unique(world.missions.map((mission) => mission?.id))
    )
      throw new Error("Mission records are invalid.");
    for (const mission of world.missions)
      if (
        !record(mission) ||
        !missionIds.includes(mission.id) ||
        !shortString(mission.name) ||
        !finite(mission.x, 0, W01.width - EPSILON) ||
        !finite(mission.y, 0, W01.rows - EPSILON) ||
        !["source", "carried", "banked"].includes(mission.status)
      )
        throw new Error("A mission object is invalid.");
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
        !finite(shelf.x, 0, W01.width - EPSILON) ||
        !finite(shelf.y, 0, W01.rows - EPSILON) ||
        typeof shelf.collapsed !== "boolean" ||
        (shelf.warning !== null &&
          !finite(shelf.warning, 0, W01_EFFECTS.shelf.warningSeconds))
      )
        throw new Error("A shelf state is invalid.");
    if (
      !record(state.vehicle) ||
      !finite(state.vehicle.x, 0, W01.width - EPSILON) ||
      !finite(state.vehicle.y, -5.5, W01.rows - HALF_Y + 1e-6) ||
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
          (y < W01.rows &&
            world.tiles[
              Math.floor(y) * W01.width + Math.floor(wrapCampaignX(x))
            ] === 0),
      ),
    );
    if (!bodyFree) throw new Error("Saved vehicle overlaps solid terrain.");
    const cargoBulk = world.packages
        .filter((item) => item.status === "carried")
        .reduce((total, item) => total + item.bulk, 0),
      capacity = Math.floor(
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
      state.progress.completed.includes(1) &&
      (!state.progress.beacon || state.progress.bankedOre < 3)
    )
      throw new Error("The first milestone lacks its banked proof.");
    for (const milestone of W01_MILESTONES)
      if (
        state.progress.completed.includes(milestone.id) &&
        !milestone.requiredMissionIds.every((id) =>
          world.missions.some(
            (mission) => mission.id === id && mission.status === "banked",
          ),
        )
      )
        throw new Error(
          "A completed milestone lacks its banked mission objects.",
        );
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
