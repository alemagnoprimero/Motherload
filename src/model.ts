// Static mineral/equipment tables match the inspected free edition.
// World density, elapsed-time fuel conversion and damage remain remake tuning.
export const WIDTH = 24,
  HEIGHT = 100,
  SURFACE = 3;
export const SAVE_KEY = "motherload.frontier.v1";
// Existing tile identifiers stay stable so old excavated maps can migrate intact.
export const ORES = {
  3: { name: "Ironium", value: 30, mass: 1, color: "#b5c7cf" },
  4: { name: "Goldium", value: 250, mass: 2, color: "#f4c76b" },
  5: { name: "Emerald", value: 5000, mass: 6, color: "#75d6aa" },
  6: { name: "Diamond", value: 100000, mass: 10, color: "#b6c9ff" },
  9: { name: "Bronzium", value: 60, mass: 1, color: "#c88b61" },
  10: { name: "Silverium", value: 100, mass: 1, color: "#e4e9e6" },
  11: { name: "Platinium", value: 750, mass: 3, color: "#b6d5d9" },
  12: { name: "Einsteinium", value: 2000, mass: 4, color: "#b8d56d" },
  13: { name: "Ruby", value: 20000, mass: 8, color: "#ef7884" },
  14: { name: "Amazonite", value: 500000, mass: 12, color: "#67dcda" },
} as const;
export type Ore = keyof typeof ORES;
export const isOre = (tile: unknown): tile is Ore =>
  typeof tile === "number" && Object.hasOwn(ORES, tile);
export type Direction = "left" | "right" | "up" | "down";
export type Controls = Partial<Record<Direction, boolean>>;
export const BODY_HALF = 0.35;
// Approximate continuous equivalents of the reference's 42 fps, 50 px grid.
const MOTION = {
  groundAcceleration: 26,
  airAcceleration: 17.6,
  groundDrag: 2.6,
  airDrag: 0.85,
  maxHorizontal: 12.35,
  gravity: 11.54,
  thrust: 26.7,
  maxAscent: 10.02,
  maxFall: 16.8,
  emptyMass: 198,
  // A deliberate recovery allowance keeps even a completely loaded rig flyable.
  minimumLift: 4,
};
export const depth = (s: State) =>
  Math.max(0, Math.floor((s.y - SURFACE - 0.15 + 1e-4) * 10));
export const UPGRADE_KEYS = [
  "drill",
  "tank",
  "cargo",
  "hull",
  "engine",
] as const;
export type Upgrade = (typeof UPGRADE_KEYS)[number];
export type ServiceAction = "sell" | "refuel" | "repair" | Upgrade;
export const STATIONS = [
  { id: "exchange", name: "Ore exchange", left: 1, width: 3, center: 2 },
  { id: "fuel", name: "Fuel depot", left: 6, width: 3, center: 7 },
  { id: "repair", name: "Repair bay", left: 15, width: 3, center: 16 },
  { id: "upgrades", name: "Upgrade depot", left: 20, width: 3, center: 21 },
] as const;
export type Station = (typeof STATIONS)[number];
export type StationId = Station["id"];
export function stationForAction(action: ServiceAction): StationId | undefined {
  if (action === "sell") return "exchange";
  if (action === "refuel") return "fuel";
  if (action === "repair") return "repair";
  return UPGRADE_KEYS.includes(action) ? "upgrades" : undefined;
}
export function nearbyStation(s: Pick<State, "x" | "y">): Station | undefined {
  const surfaceY = SURFACE + 0.15;
  if (
    !Number.isFinite(s.x) ||
    !Number.isFinite(s.y) ||
    Math.abs(s.y - surfaceY) > 0.2 ||
    s.y > SURFACE + 0.151
  )
    return undefined;
  return STATIONS.find((station) => Math.abs(s.x - station.center) <= 1);
}
export const UPGRADE_LEVELS = {
  drill: [2, 2.8, 4, 5, 7, 9.5, 12],
  tank: [10, 15, 25, 40, 60, 100, 150],
  cargo: [7, 15, 25, 40, 70, 120],
  hull: [10, 17, 30, 50, 80, 120, 180],
  engine: [150, 160, 170, 180, 190, 200, 210],
} as const;
export const UPGRADE_PRICES = [
  0, 750, 2000, 5000, 20000, 100000, 500000,
] as const;
export interface State {
  version: 3;
  seed: number;
  tiles: number[];
  x: number;
  y: number;
  money: number;
  fuel: number;
  hull: number;
  inventory: Ore[];
  upgrades: Record<Upgrade, number>;
  mined: number;
  deepest: number;
}
export const capacity = (s: State) => UPGRADE_LEVELS.cargo[s.upgrades.cargo]!;
export const maxFuel = (s: State) => UPGRADE_LEVELS.tank[s.upgrades.tank]!;
export const maxHull = (s: State) => UPGRADE_LEVELS.hull[s.upgrades.hull]!;
export const cargoValue = (s: State) =>
  s.inventory.reduce((n, ore) => n + ORES[ore].value, 0);
export const cargoMass = (s: State) =>
  s.inventory.reduce((n, ore) => n + ORES[ore].mass, 0);
export const upgradeCost = (s: State, key: Upgrade) =>
  UPGRADE_KEYS.includes(key) && s.upgrades[key] + 1 < UPGRADE_LEVELS[key].length
    ? UPGRADE_PRICES[s.upgrades[key] + 1]!
    : Infinity;

// The original's depth ordering is compressed into this bounded prototype mine.
// The exact probabilities and assisted starter deposits are original remake design.
const DEPOSITS: ReadonlyArray<{ ore: Ore; row: number; weight: number }> = [
  { ore: 3, row: 4, weight: 12 },
  { ore: 9, row: 5, weight: 10 },
  { ore: 10, row: 8, weight: 8 },
  { ore: 4, row: 14, weight: 6 },
  { ore: 11, row: 24, weight: 5 },
  { ore: 12, row: 36, weight: 4 },
  { ore: 5, row: 48, weight: 3 },
  { ore: 13, row: 62, weight: 2 },
  { ore: 6, row: 76, weight: 1.5 },
  { ore: 14, row: 88, weight: 1 },
];
export function createState(seed = 73021): State {
  seed = seed >>> 0;
  let r = seed;
  const random = () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 4294967296;
  };
  const tiles = Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const y = Math.floor(i / WIDTH),
      p = random();
    if (y <= SURFACE) return 0;
    if (y === HEIGHT - 1) return 8;
    if (y >= 52 && p < 0.025) return 7;
    if (p > 0.88) return 2;
    if (p < 0.36) {
      const available = DEPOSITS.filter((deposit) => y >= deposit.row);
      let choice =
        random() *
        available.reduce((total, deposit) => total + deposit.weight, 0);
      for (const deposit of available) {
        choice -= deposit.weight;
        if (choice <= 0) return deposit.ore;
      }
    }
    return 1;
  });
  // Elliptical chambers leave irregular floors and intermediate ledges instead
  // of isolated one-cell holes. Most pockets still require a drilled entrance.
  for (let row = 9; row < HEIGHT - 3; row += 5) {
    for (let pocket = 0; pocket < 2; pocket++) {
      const cx = 2 + random() * (WIDTH - 4),
        cy = row + random() * 2;
      const rx = 2 + random() * 2.2,
        ry = 1.2 + random() * 1.4;
      for (
        let y = Math.max(5, Math.floor(cy - ry));
        y <= Math.min(HEIGHT - 2, Math.ceil(cy + ry));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(cx - rx));
          x <= Math.min(WIDTH - 1, Math.ceil(cx + rx));
          x++
        )
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1)
            tiles[y * WIDTH + x] = 0;
    }
  }
  // This compact mine has fewer deep cells than the original's 600 rows.
  // Keep every mineral discoverable even when a rare deposit was carved away.
  for (const deposit of DEPOSITS) {
    if (tiles.includes(deposit.ore)) continue;
    const candidates: number[] = [];
    for (let index = deposit.row * WIDTH; index < (HEIGHT - 1) * WIDTH; index++)
      if (tiles[index] === 1 || tiles[index] === 2) candidates.push(index);
    // Existing deposits are never replaced while ensuring a missing rarity.
    if (candidates.length)
      tiles[candidates[Math.floor(random() * candidates.length)]!] =
        deposit.ore;
  }
  // Two modest starter veins let ordinary early expeditions fund the first
  // $750 upgrade without replacing the reference prices with a cheap preset.
  const starter: Ore[][] = [
    [3, 3, 3, 3, 9, 10, 10],
    [3, 9, 3, 9, 10, 10, 10],
  ];
  for (let column = 0; column < starter.length; column++)
    starter[column].forEach((ore, index) => {
      tiles[(index + 4) * WIDTH + 12 + column] = ore;
    });
  return {
    version: 3,
    seed,
    tiles,
    x: 12,
    y: SURFACE,
    money: 20,
    fuel: 6,
    hull: 10,
    inventory: [],
    upgrades: { drill: 0, tank: 0, cargo: 0, hull: 0, engine: 0 },
    mined: 0,
    deepest: 0,
  };
}
export class Mine {
  state: State;
  message =
    "Welcome, pilot. Mine Ironium below the rig, then return to sell and refuel.";
  progress = 0;
  velocityX = 0;
  velocityY = 0;
  facing: "left" | "right" = "right";
  thrusting = false;
  drillDirection: Direction | undefined;
  private drilling:
    | { x: number; y: number; startX: number; startY: number; duration: number }
    | undefined;
  constructor(state = createState()) {
    this.state = state;
  }
  get docked() {
    return this.state.y <= SURFACE + 0.151;
  }
  get renderX() {
    const d = this.drilling;
    return d ? d.startX + (d.x - d.startX) * this.progress : this.state.x;
  }
  get drillTarget() {
    return this.drilling
      ? { x: this.drilling.x, y: this.drilling.y }
      : undefined;
  }
  get renderY() {
    const d = this.drilling;
    return d
      ? d.startY +
          ((this.drillDirection === "down" ? d.y + 0.5 - BODY_HALF : d.startY) -
            d.startY) *
            this.progress
      : this.state.y;
  }
  tile(x: number, y: number) {
    return x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT
      ? 8
      : this.state.tiles[Math.floor(y) * WIDTH + Math.floor(x)];
  }
  private blocked(x: number, y: number) {
    for (const cx of [x - BODY_HALF + 1e-7, x + BODY_HALF - 1e-7])
      for (const cy of [y - BODY_HALF + 1e-7, y + BODY_HALF - 1e-7])
        if (this.tile(Math.floor(cx + 0.5), Math.floor(cy + 0.5)) !== 0)
          return true;
    return false;
  }
  get grounded() {
    // Only actual tread contact counts. A generous probe could start a cut
    // before landing and erase the incoming velocity (and impact damage).
    const { x, y } = this.state;
    const row = Math.floor(y + BODY_HALF + 0.5 + 1e-4);
    return [x - BODY_HALF + 1e-7, x + BODY_HALF - 1e-7].some(
      (foot) => this.tile(Math.floor(foot + 0.5), row) !== 0,
    );
  }
  private cancelDrill() {
    this.drilling = undefined;
    this.progress = 0;
    this.drillDirection = undefined;
  }
  tick(seconds: number, input?: Direction | Controls) {
    const controls: Controls =
      typeof input === "string" ? { [input]: true } : (input ?? {});
    let remaining = Math.min(Math.max(seconds, 0), 0.25);
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, 1 / 120);
      this.step(dt, controls);
      remaining -= dt;
    }
  }
  private step(dt: number, input: Controls) {
    const s = this.state;
    this.thrusting = Boolean(input.up && s.fuel > 0 && s.hull > 0);
    if (s.hull <= 0 || s.fuel <= 0) {
      this.message = "Rig disabled. Call recovery to return to the surface.";
      this.velocityX = this.velocityY = 0;
      this.cancelDrill();
      return;
    }
    const dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
    if (dx) this.facing = dx < 0 ? "left" : "right";
    const engineFactor = UPGRADE_LEVELS.engine[s.upgrades.engine]! / 150;
    // Original per-frame values normalized at 42 fps; emulated wall-clock fuel
    // timing still needs calibration. Docked idle is free as a usability aid.
    const activeAxes = Number(Boolean(dx)) + Number(Boolean(input.up));
    const fuelRate =
      (this.docked ? 0 : 0.063) + (this.drilling ? 0.252 : activeAxes * 0.126);
    s.fuel = Math.max(0, s.fuel - dt * fuelRate * engineFactor);
    if (s.fuel === 0) {
      this.message = "Fuel exhausted. Call recovery to return to the surface.";
      this.velocityX = this.velocityY = 0;
      this.cancelDrill();
      return;
    }
    // The reference commits to a selected cut. Finish it before responding to
    // thrust, so the displayed rig never jumps back out of a half-cut tile.
    if (this.drilling) {
      this.thrusting = false;
      if (input.up)
        this.message = "Finishing the cut. Hold Up to lift off afterward.";
      this.advanceDrill(dt);
      return;
    }
    const supported =
      this.grounded || (this.docked && s.y >= SURFACE && !input.up);
    if (!input.up) {
      // Down selects the floor even while the pilot counter-steers onto a
      // shelf. Horizontal input still steers normally until the rig lands.
      const drillX = input.down ? 0 : dx;
      let tx = Math.floor(
        s.x + (drillX ? drillX * (BODY_HALF + 0.21) : 0) + 0.5,
      );
      const ty = Math.floor(s.y + (input.down ? BODY_HALF + 0.21 : 0) + 0.5);
      // At a ledge's edge the center can be over air while one tread is still
      // supported. Drill that support instead of silently ignoring Down.
      if (input.down && supported && this.tile(tx, ty) === 0) {
        const support = [
          Math.floor(s.x - BODY_HALF + 0.5 + 1e-7),
          Math.floor(s.x + BODY_HALF + 0.5 - 1e-7),
        ]
          .sort((a, b) => Math.abs(a - s.x) - Math.abs(b - s.x))
          .find((x) => this.tile(x, ty) !== 0);
        if (support !== undefined) tx = support;
      }
      if (
        (drillX || input.down) &&
        (tx !== Math.round(s.x) || ty !== Math.round(s.y))
      ) {
        const tile = this.tile(tx, ty);
        if (tile === 8) {
          this.message = "Bedrock blocks the drill. Find another route.";
        } else if (tile > 0) {
          if (!supported || this.velocityY !== 0) {
            this.message = drillX
              ? "Side drilling needs a ledge. Hold Up + Left/Right to steer, then land before cutting."
              : "Land on the terrain before drilling down.";
          } else {
            this.drilling = {
              x: tx,
              y: ty,
              startX: s.x,
              startY: s.y,
              duration:
                ((drillX ? 0.75 : 1) *
                  (tile === 2 ? 1.85 : 1) *
                  (1 + Math.max(0, s.y - SURFACE) * 0.0125)) /
                (UPGRADE_LEVELS.drill[s.upgrades.drill]! / 2),
            };
            this.drillDirection =
              drillX < 0 ? "left" : drillX > 0 ? "right" : "down";
            this.velocityX = this.velocityY = 0;
            this.advanceDrill(dt);
            return;
          }
        }
      }
    }
    // Continuous acceleration and damping, in tile units per second.
    const massFactor = 1 + cargoMass(s) / MOTION.emptyMass;
    const drag = supported ? MOTION.groundDrag : MOTION.airDrag;
    const acceleration =
      (dx *
        engineFactor *
        (supported ? MOTION.groundAcceleration : MOTION.airAcceleration)) /
      massFactor;
    const decay = Math.exp(-drag * dt);
    // Identical drag with and without input preserves reference-style coasting.
    this.velocityX =
      this.velocityX * decay + (acceleration / drag) * (1 - decay);
    this.velocityX = Math.max(
      -MOTION.maxHorizontal * engineFactor,
      Math.min(MOTION.maxHorizontal * engineFactor, this.velocityX),
    );
    const thrust = Math.max(
      (MOTION.thrust * engineFactor) / massFactor,
      MOTION.gravity + MOTION.minimumLift,
    );
    this.velocityY =
      (this.velocityY - (input.up ? thrust : 0) * dt) *
        Math.exp(-MOTION.airDrag * dt) +
      MOTION.gravity * dt;
    this.velocityY = Math.max(
      -MOTION.maxAscent * engineFactor,
      Math.min(MOTION.maxFall, this.velocityY),
    );
    const oldY = s.y;
    this.moveAxis("x", this.velocityX * dt);
    this.moveAxis("y", this.velocityY * dt);
    // Surface docking is retained as a deliberate usability aid.
    if (
      !input.down &&
      !input.up &&
      oldY <= SURFACE + 0.151 &&
      s.y > SURFACE + 0.15
    ) {
      s.y = SURFACE + 0.15;
      this.velocityY = 0;
    }
    if (input.up && this.blocked(s.x, s.y - 0.04))
      this.message =
        "The drill cannot cut upward. Steer into your open tunnel.";
    s.deepest = Math.max(s.deepest, depth(s));
  }
  private moveAxis(axis: "x" | "y", amount: number) {
    if (!amount) return;
    const s = this.state,
      start = s[axis];
    const candidate = Math.max(
      0,
      Math.min(
        axis === "x" ? WIDTH - 1 : HEIGHT - 1.5 - BODY_HALF,
        start + amount,
      ),
    );
    const collides = (value: number) =>
      this.blocked(axis === "x" ? value : s.x, axis === "y" ? value : s.y);
    let end = candidate;
    if (collides(end)) {
      let free = start,
        blocked = end;
      for (let i = 0; i < 14; i++) {
        const mid = (free + blocked) / 2;
        if (collides(mid)) blocked = mid;
        else free = mid;
      }
      end = free;
      if (axis === "y" && this.velocityY > 7) {
        const damage = Math.max(1, Math.round((this.velocityY - 7) * 0.6));
        s.hull = Math.max(0, s.hull - damage);
        this.message = `Hard landing: −${damage} hull. Use upward thrust to brake.`;
      }
      if (axis === "x") this.velocityX = 0;
      else this.velocityY = 0;
    }
    s[axis] = end;
    if (end === start && candidate !== start + amount) {
      if (axis === "x") this.velocityX = 0;
      else this.velocityY = 0;
    }
  }
  private advanceDrill(dt: number) {
    const d = this.drilling!,
      s = this.state;
    this.progress = Math.min(1, this.progress + dt / d.duration);
    if (this.progress < 1) return;
    const tile = this.tile(d.x, d.y);
    s.tiles[d.y * WIDTH + d.x] = 0;
    s.x = d.x;
    // End at the bottom of the cleared cell. Solid ground below can accept
    // the next cut immediately; an open pocket still starts a natural fall.
    s.y = this.drillDirection === "down" ? d.y + 0.5 - BODY_HALF : d.startY;
    s.mined++;
    if (tile === 7) s.hull = Math.max(0, s.hull - 3);
    if (isOre(tile)) {
      // Like the reference's doneDigging/addToBay sequence, a full bay limits
      // collection, not excavation. Excess ore is discarded rather than
      // making a mineral shelf impassable after returning from a deeper run.
      if (s.inventory.length < capacity(s)) {
        s.inventory.push(tile);
        this.message = `${ORES[tile].name} collected. Cargo worth $${cargoValue(s)}.`;
      } else {
        this.message = `Cargo full: ${ORES[tile].name} discarded. Return to the exchange to sell.`;
      }
    }
    if (tile === 7)
      this.message = "Magma pocket! Hull damaged. Return for repairs.";
    s.deepest = Math.max(s.deepest, depth(s));
    this.cancelDrill();
  }
  service(action: ServiceAction) {
    const s = this.state;
    const requiredStation = stationForAction(action);
    if (!requiredStation) {
      this.message = "Unknown surface service.";
      return false;
    }
    if (nearbyStation(s)?.id !== requiredStation) {
      const station = STATIONS.find((entry) => entry.id === requiredStation)!;
      this.message = `Park at the ${station.name.toLowerCase()} on the surface to use this service.`;
      return false;
    }
    if (action === "sell") {
      const value = cargoValue(s);
      s.money += value;
      s.inventory = [];
      this.message = value
        ? `Sold cargo for $${value}. Good haul, pilot.`
        : "Your cargo hold is empty.";
      return value > 0;
    }
    if (action === "refuel" || action === "repair") {
      const key = action === "refuel" ? "fuel" : "hull",
        max = key === "fuel" ? maxFuel(s) : maxHull(s),
        rate = key === "fuel" ? 1 : 15;
      const amount = Math.min(max - s[key], s.money / rate);
      if (amount <= 0) {
        this.message =
          s[key] >= max
            ? "Already topped up."
            : "Not enough credits. Sell minerals first.";
        return false;
      }
      // Fractional migrated condition and small balances can buy a partial
      // repair. Avoid a floating-point cent beyond the available whole credits.
      const cost = Math.min(s.money, Math.ceil(amount * rate - 1e-9));
      s[key] = Math.min(max, s[key] + amount);
      s.money -= cost;
      this.message = `${action === "refuel" ? "Fuel" : "Hull"} restored for $${cost}.`;
      return true;
    }
    if (!UPGRADE_KEYS.includes(action)) return false;
    const cost = upgradeCost(s, action);
    if (s.money < cost) {
      this.message =
        cost === Infinity
          ? "This system is fully upgraded."
          : `You need $${cost} for this upgrade.`;
      return false;
    }
    s.money -= cost;
    s.upgrades[action]++;
    this.message = `${action[0].toUpperCase() + action.slice(1)} upgraded to level ${s.upgrades[action] + 1}.`;
    return true;
  }
  recover() {
    const s = this.state;
    s.money = Math.floor(s.money * 0.8);
    s.inventory = [];
    s.x = 12;
    s.y = SURFACE;
    s.fuel = maxFuel(s) * 0.5;
    s.hull = maxHull(s) * 0.5;
    this.progress = 0;
    this.velocityX = this.velocityY = 0;
    this.cancelDrill();
    this.message =
      "Recovered at the surface. Lost cargo and 20% of credits; fuel and hull restored to 50%.";
  }
}
export function decodeSave(raw: string): State {
  const invalid = () =>
    new Error("Unsupported or damaged save. Existing save has been kept.");
  if (raw.length > 150_000) throw invalid();
  const source: unknown = JSON.parse(raw);
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const num = (value: unknown, max: number, integer = false): value is number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max &&
    (!integer || Number.isInteger(value));
  if (
    !record(source) ||
    ![1, 2, 3].includes(source.version as number) ||
    !record(source.upgrades)
  )
    throw invalid();
  const legacy = source.version !== 3;
  const required = legacy
    ? UPGRADE_KEYS.filter((key) => key !== "engine")
    : UPGRADE_KEYS;
  for (const key of required)
    if (
      !Object.hasOwn(source.upgrades, key) ||
      !num(
        source.upgrades[key],
        legacy ? 3 : UPGRADE_LEVELS[key].length - 1,
        true,
      )
    )
      throw invalid();
  const old = source.upgrades as Record<Upgrade, number>;
  const oldFuel = legacy ? 100 + old.tank * 50 : UPGRADE_LEVELS.tank[old.tank]!;
  const oldHull = legacy ? 100 + old.hull * 40 : UPGRADE_LEVELS.hull[old.hull]!;
  const oldCargo = legacy
    ? 8 + old.cargo * 6
    : UPGRADE_LEVELS.cargo[old.cargo]!;
  if (
    !num(source.seed, 4294967295, true) ||
    !Array.isArray(source.tiles) ||
    source.tiles.length !== WIDTH * HEIGHT ||
    source.tiles.some((tile) => !num(tile, legacy ? 8 : 14, true)) ||
    !num(source.x, WIDTH - 1) ||
    !num(source.y, HEIGHT - 1.5 - BODY_HALF + 1e-6) ||
    !num(source.money, 1e12, true) ||
    !num(source.fuel, oldFuel) ||
    !num(source.hull, oldHull) ||
    !Array.isArray(source.inventory) ||
    source.inventory.length > oldCargo ||
    source.inventory.some((ore) =>
      legacy ? ![3, 4, 5, 6].includes(ore) : !isOre(ore),
    ) ||
    !num(source.mined, WIDTH * HEIGHT, true) ||
    !num(source.deepest, (HEIGHT - SURFACE) * 10, true) ||
    source.tiles.slice(0, WIDTH * (SURFACE + 1)).some((tile) => tile !== 0) ||
    source.tiles.slice(-WIDTH).some((tile) => tile !== 8)
  )
    throw invalid();
  const tierAtLeast = (key: Upgrade, value: number) => {
    const found = UPGRADE_LEVELS[key].findIndex((stat) => stat >= value - 1e-8);
    return found < 0 ? UPGRADE_LEVELS[key].length - 1 : found;
  };
  // Preserve equipment capability rather than reusing tier numbers from the
  // shorter prototype tables. Fuel and hull retain their condition fractions.
  const upgrades: Record<Upgrade, number> = legacy
    ? {
        drill: tierAtLeast("drill", 2 * (1 + old.drill * 0.55)),
        tank: tierAtLeast("tank", oldFuel / 10),
        cargo: tierAtLeast("cargo", oldCargo),
        hull: tierAtLeast("hull", oldHull / 10),
        engine: 0,
      }
    : {
        drill: old.drill,
        tank: old.tank,
        cargo: old.cargo,
        hull: old.hull,
        engine: old.engine,
      };
  const s: State = {
    version: 3,
    seed: source.seed,
    tiles: [...source.tiles],
    x: source.x,
    y: source.y,
    money: source.money,
    fuel: source.fuel,
    hull: source.hull,
    inventory: [...source.inventory],
    upgrades,
    mined: source.mined,
    deepest: source.deepest,
  };
  if (legacy) {
    s.fuel = (s.fuel / oldFuel) * maxFuel(s);
    s.hull = (s.hull / oldHull) * maxHull(s);
  }
  for (const x of [s.x - BODY_HALF + 1e-6, s.x + BODY_HALF - 1e-6])
    for (const y of [s.y - BODY_HALF + 1e-6, s.y + BODY_HALF - 1e-6])
      if (s.tiles[Math.floor(y + 0.5) * WIDTH + Math.floor(x + 0.5)] !== 0)
        throw new Error(
          "Saved vehicle overlaps solid terrain. Existing save has been kept.",
        );
  return s;
}
