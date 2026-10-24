// All numeric balance values are provisional, not verified against the original SWF.
export const WIDTH = 24,
  HEIGHT = 100,
  SURFACE = 3;
export const SAVE_KEY = "motherload.frontier.v1";
export const ORES = {
  3: { name: "Iron", value: 25, color: "#b5c7cf" },
  4: { name: "Gold", value: 75, color: "#f4c76b" },
  5: { name: "Emerald", value: 180, color: "#75d6aa" },
  6: { name: "Diamond", value: 400, color: "#b6c9ff" },
} as const;
export type Ore = keyof typeof ORES;
export type Direction = "left" | "right" | "up" | "down";
export type Upgrade = "drill" | "tank" | "cargo" | "hull";
export interface State {
  version: 1;
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
    version: 1,
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
  private target = "";
  private travel = 0;
  private fall = 0;
  private fallDistance = 0;
  constructor(state = createState()) {
    this.state = state;
  }
  get docked() {
    return this.state.y <= SURFACE;
  }
  tile(x: number, y: number) {
    return x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT
      ? 8
      : this.state.tiles[y * WIDTH + x];
  }
  tick(seconds: number, direction?: Direction) {
    const dt = Math.min(Math.max(seconds, 0), 0.05),
      s = this.state;
    if (s.hull <= 0 || s.fuel <= 0) {
      this.message = "Rig disabled. Call recovery to return to the surface.";
      this.progress = 0;
      return;
    }
    if (!this.docked) s.fuel = Math.max(0, s.fuel - dt * 0.08);
    // Gravity only acts over an excavated cell; upward thrust cancels it.
    if (direction !== "up" && s.y > SURFACE && this.tile(s.x, s.y + 1) === 0) {
      this.fall += dt;
      if (this.fall >= 0.16) {
        s.y++;
        this.fall = 0;
        this.fallDistance++;
      }
    } else {
      if (this.fallDistance > 3) {
        const damage = (this.fallDistance - 3) * 5;
        s.hull = Math.max(0, s.hull - damage);
        this.message = `Hard landing: −${damage} hull.`;
      }
      this.fall = 0;
      this.fallDistance = 0;
    }
    s.deepest = Math.max(s.deepest, Math.max(0, s.y - SURFACE) * 10);
    if (!direction) {
      this.progress = 0;
      this.target = "";
      this.travel = 0.15;
      return;
    }
    const dx = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    const dy = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const x = s.x + dx,
      y = s.y + dy,
      tile = this.tile(x, y);
    if (y < SURFACE || tile === 8) {
      this.progress = 0;
      return;
    }
    if (tile === 0) {
      this.progress = 0;
      this.target = "";
      this.travel += dt;
      if (this.travel >= 0.15) {
        this.travel = 0;
        s.x = x;
        s.y = y;
        s.fuel = Math.max(0, s.fuel - (dy < 0 ? 0.4 : 0.15));
      }
      return;
    }
    this.travel = 0;
    if (direction === "up") {
      this.progress = 0;
      this.message = "The drill cannot cut upward. Follow your tunnel home.";
      return;
    }
    if (tile >= 3 && tile <= 6 && s.inventory.length >= capacity(s)) {
      this.progress = 0;
      this.message = "Cargo full. Return to the surface to sell.";
      return;
    }
    if (s.fuel < 1.5) {
      s.fuel = 0;
      this.message = "Fuel exhausted. Call recovery.";
      return;
    }
    const target = `${x},${y}`;
    if (this.target !== target) {
      this.progress = 0;
      this.target = target;
    }
    const duration = (tile === 2 ? 1.2 : 0.65) / (1 + s.upgrades.drill * 0.55);
    this.progress += dt / duration;
    if (this.progress >= 1) {
      s.tiles[y * WIDTH + x] = 0;
      s.x = x;
      s.y = y;
      s.fuel = Math.max(0, s.fuel - 1.5);
      s.mined++;
      s.hull = Math.max(0, s.hull - (tile === 7 ? 30 : 0.6));
      if (tile >= 3 && tile <= 6) {
        s.inventory.push(tile as Ore);
        this.message = `${ORES[tile as Ore].name} collected. Cargo worth $${cargoValue(s)}.`;
      }
      if (tile === 7)
        this.message = "Magma pocket! Hull damaged. Return for repairs.";
      this.progress = 0;
      this.target = "";
      s.deepest = Math.max(s.deepest, (s.y - SURFACE) * 10);
    }
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
    this.target = "";
    this.travel = 0;
    this.fall = 0;
    this.fallDistance = 0;
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
    s.version !== 1 ||
    !num(s.seed, 4294967295, true) ||
    !Array.isArray(s.tiles) ||
    s.tiles.length !== WIDTH * HEIGHT ||
    s.tiles.some((t) => !num(t, 8, true)) ||
    !num(s.x, WIDTH - 1, true) ||
    !num(s.y, HEIGHT - 2, true) ||
    s.y < SURFACE ||
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
    s.tiles[s.y * WIDTH + s.x] !== 0 ||
    s.tiles.slice(0, WIDTH * (SURFACE + 1)).some((t) => t !== 0) ||
    s.tiles.slice(-WIDTH).some((t) => t !== 8)
  )
    throw new Error(
      "Unsupported or damaged save. Existing save has been kept.",
    );
  return s;
}
