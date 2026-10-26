// Movement is calibrated in tile units against the inspected free edition.
// Economy, fuel units, hull wear and upgrade balance remain provisional.
export const WIDTH = 24,
  HEIGHT = 100,
  SURFACE = 3;
export const SAVE_KEY = "motherload.frontier.v1";
export const ORES = {
  3: { name: "Iron", value: 25, mass: 1, color: "#b5c7cf" },
  4: { name: "Gold", value: 75, mass: 2, color: "#f4c76b" },
  5: { name: "Emerald", value: 180, mass: 6, color: "#75d6aa" },
  6: { name: "Diamond", value: 400, mass: 10, color: "#b6c9ff" },
} as const;
export type Ore = keyof typeof ORES;
export type Direction = "left" | "right" | "up" | "down";
export type Controls = Partial<Record<Direction, boolean>>;
export const BODY_HALF = 0.35;
// Approximate continuous equivalents of the reference's 42 fps, 50 px grid.
// See docs/MOVEMENT_REFERENCE.md for measurements and remaining differences.
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
  // Existing cargo upgrades predate engine upgrades. Keep every valid load
  // recoverable by flight until that progression is introduced.
  minimumLift: 4,
};
export const depth = (s: State) =>
  Math.max(0, Math.floor((s.y - SURFACE - 0.15 + 1e-4) * 10));
export type Upgrade = "drill" | "tank" | "cargo" | "hull";
export interface State {
  version: 2;
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
export const capacity = (s: State) => 8 + s.upgrades.cargo * 6;
export const maxFuel = (s: State) => 100 + s.upgrades.tank * 50;
export const maxHull = (s: State) => 100 + s.upgrades.hull * 40;
export const cargoValue = (s: State) =>
  s.inventory.reduce((n, ore) => n + ORES[ore].value, 0);
export const cargoMass = (s: State) =>
  s.inventory.reduce((n, ore) => n + ORES[ore].mass, 0);
export const upgradeCost = (s: State, key: Upgrade) =>
  [100, 250, 600][s.upgrades[key]] ?? Infinity;
export function createState(seed = 73021): State {
  let r = seed >>> 0;
  const random = () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 4294967296;
  };
  const tiles = Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const y = Math.floor(i / WIDTH),
      p = random();
    if (y <= SURFACE) return 0;
    if (y === HEIGHT - 1) return 8;
    if (y > 45 && p < 0.035) return 7;
    if (y > 65 && p < 0.08) return 6;
    if (y > 28 && p < 0.12) return 5;
    if (y > 10 && p < 0.18) return 4;
    if (p < 0.24) return 3;
    return p > 0.86 ? 2 : 1;
  });
  for (let y = 4; y <= 7; y++) tiles[y * WIDTH + 12] = 3;
  return {
    version: 2,
    seed,
    tiles,
    x: 12,
    y: SURFACE,
    money: 60,
    fuel: 100,
    hull: 100,
    inventory: [],
    upgrades: { drill: 0, tank: 0, cargo: 0, hull: 0 },
    mined: 0,
    deepest: 0,
  };
}
export class Mine {
  state: State;
  message = "Welcome, pilot. Drill below the rig to find your first iron.";
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
    if (!this.docked) s.fuel = Math.max(0, s.fuel - dt * 0.08);
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
      let tx = Math.floor(s.x + (dx ? dx * (BODY_HALF + 0.21) : 0) + 0.5);
      const ty = Math.floor(
        s.y + (!dx && input.down ? BODY_HALF + 0.21 : 0) + 0.5,
      );
      // At a ledge's edge the center can be over air while one tread is still
      // supported. Drill that support instead of silently ignoring Down.
      if (!dx && input.down && supported && this.tile(tx, ty) === 0) {
        const support = [
          Math.floor(s.x - BODY_HALF + 0.5 + 1e-7),
          Math.floor(s.x + BODY_HALF + 0.5 - 1e-7),
        ]
          .sort((a, b) => Math.abs(a - s.x) - Math.abs(b - s.x))
          .find((x) => this.tile(x, ty) !== 0);
        if (support !== undefined) tx = support;
      }
      if (
        (dx || input.down) &&
        (tx !== Math.round(s.x) || ty !== Math.round(s.y))
      ) {
        const tile = this.tile(tx, ty);
        if (tile === 8) {
          this.message = "Bedrock blocks the drill. Find another route.";
        } else if (tile > 0) {
          if (!supported || this.velocityY !== 0) {
            this.message = dx
              ? "Side drilling needs a ledge. Hold Up + Left/Right to steer, then land before cutting."
              : "Land on the terrain before drilling down.";
          } else if (
            tile >= 3 &&
            tile <= 6 &&
            s.inventory.length >= capacity(s)
          ) {
            this.message = "Cargo full. Return to the surface to sell.";
          } else if (s.fuel < 1.5) {
            s.fuel = 0;
            this.message = "Fuel exhausted. Call recovery.";
          } else {
            this.drilling = {
              x: tx,
              y: ty,
              startX: s.x,
              startY: s.y,
              duration:
                ((dx ? 0.75 : 1) *
                  (tile === 2 ? 1.85 : 1) *
                  (1 + Math.max(0, s.y - SURFACE) * 0.0125)) /
                (1 + s.upgrades.drill * 0.55),
            };
            this.drillDirection = dx < 0 ? "left" : dx > 0 ? "right" : "down";
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
      (dx * (supported ? MOTION.groundAcceleration : MOTION.airAcceleration)) /
      massFactor;
    const decay = Math.exp(-drag * dt);
    // Identical drag with and without input preserves reference-style coasting.
    this.velocityX =
      this.velocityX * decay + (acceleration / drag) * (1 - decay);
    this.velocityX = Math.max(
      -MOTION.maxHorizontal,
      Math.min(MOTION.maxHorizontal, this.velocityX),
    );
    const thrust = Math.max(
      MOTION.thrust / massFactor,
      MOTION.gravity + MOTION.minimumLift,
    );
    this.velocityY =
      (this.velocityY - (input.up ? thrust : 0) * dt) *
        Math.exp(-MOTION.airDrag * dt) +
      MOTION.gravity * dt;
    this.velocityY = Math.max(
      -MOTION.maxAscent,
      Math.min(MOTION.maxFall, this.velocityY),
    );
    const oldX = s.x,
      oldY = s.y;
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
    s.fuel = Math.max(
      0,
      s.fuel -
        Math.abs(s.x - oldX) * 0.15 -
        Math.max(0, oldY - s.y) * 0.4 -
        (input.up ? dt * 0.12 : 0),
    );
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
        const damage = Math.round((this.velocityY - 7) * 4);
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
    s.fuel = Math.max(0, s.fuel - 1.5);
    s.mined++;
    s.hull = Math.max(0, s.hull - (tile === 7 ? 30 : 0.6));
    if (tile >= 3 && tile <= 6) {
      s.inventory.push(tile as Ore);
      this.message = `${ORES[tile as Ore].name} collected. Cargo worth $${cargoValue(s)}.`;
    }
    if (tile === 7)
      this.message = "Magma pocket! Hull damaged. Return for repairs.";
    s.deepest = Math.max(s.deepest, depth(s));
    this.cancelDrill();
  }
  service(action: "sell" | "refuel" | "repair" | Upgrade) {
    const s = this.state;
    if (!this.docked) {
      this.message = "Surface services are available at depth 0 m.";
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
        rate = key === "fuel" ? 1 : 0.7;
      const amount = Math.min(max - s[key], Math.floor(s.money / rate));
      if (amount <= 0) {
        this.message =
          s[key] >= max
            ? "Already topped up."
            : "Not enough credits. Sell minerals first.";
        return false;
      }
      const cost = Math.ceil(amount * rate);
      s[key] = Math.min(max, s[key] + amount);
      s.money -= cost;
      this.message = `${action === "refuel" ? "Fuel" : "Hull"} restored for $${cost}.`;
      return true;
    }
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
  const s = JSON.parse(raw) as State;
  const num = (x: unknown, max: number, integer = false): boolean =>
    typeof x === "number" &&
    Number.isFinite(x) &&
    x >= 0 &&
    x <= max &&
    (!integer || Number.isInteger(x));
  if (
    !s ||
    !([1, 2] as readonly unknown[]).includes(s.version) ||
    !num(s.seed, 4294967295, true) ||
    !Array.isArray(s.tiles) ||
    s.tiles.length !== WIDTH * HEIGHT ||
    s.tiles.some((t) => !num(t, 8, true)) ||
    !num(s.x, WIDTH - 1) ||
    !num(s.y, HEIGHT - 1.5 - BODY_HALF + 1e-6) ||
    !s.upgrades ||
    ["drill", "tank", "cargo", "hull"].some(
      (k) => !num(s.upgrades[k as Upgrade], 3, true),
    ) ||
    !num(s.money, 1e12, true) ||
    !num(s.fuel, maxFuel(s)) ||
    !num(s.hull, maxHull(s)) ||
    !Array.isArray(s.inventory) ||
    s.inventory.length > capacity(s) ||
    s.inventory.some((o) => ![3, 4, 5, 6].includes(o)) ||
    !num(s.mined, WIDTH * HEIGHT, true) ||
    !num(s.deepest, (HEIGHT - SURFACE) * 10, true) ||
    s.tiles[Math.round(s.y) * WIDTH + Math.round(s.x)] !== 0 ||
    s.tiles.slice(0, WIDTH * (SURFACE + 1)).some((t) => t !== 0) ||
    s.tiles.slice(-WIDTH).some((t) => t !== 8)
  )
    throw new Error(
      "Unsupported or damaged save. Existing save has been kept.",
    );
  for (const x of [s.x - BODY_HALF + 1e-6, s.x + BODY_HALF - 1e-6])
    for (const y of [s.y - BODY_HALF + 1e-6, s.y + BODY_HALF - 1e-6])
      if (s.tiles[Math.floor(y + 0.5) * WIDTH + Math.floor(x + 0.5)] !== 0)
        throw new Error(
          "Saved vehicle overlaps solid terrain. Existing save has been kept.",
        );
  return { ...s, version: 2 };
}
