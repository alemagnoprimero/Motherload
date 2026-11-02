// Abstract pacing simulator. It runs on the REAL Campaign state (generated
// terrain, packages, missions, wall-occluded discovery via refreshVisibility,
// and the real bank/sell/refuel/repair/buy/payMilestone/recover/travel methods).
// Only motion is abstracted: the rig moves cell by cell and is charged time and
// energy from the shared motion/cut formulas. Native calibration and opening
// tests exercise those primitives independently. Discrete routing and declared
// hesitation/volatile policies remain approximations, not human measurements.
import { Campaign, createCampaign } from "../../src/campaign/model";
import { MOTION, motionProfile, cutDuration } from "../../src/campaign/motion";
import {
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  W01,
  W01_GEAR,
} from "../../src/campaign/config";
import { W02, W02_GEAR } from "../../src/campaign/frontier";
import type { CampaignPackage, HardwareKey } from "../../src/campaign/types";

export interface Policy {
  name: string;
  /** Named guide-following variants only; historical policies leave these off. */
  serviceFirst?: boolean;
  contracts?: boolean;
  recoveryOnStall?: boolean;
  directMissionShaft?: boolean;
  reserveFraction: number;
  reserveMin: number;
  volatileSuccess: number;
  missionMode: "balanced" | "completionist" | "fixed";
  plan: { W01: string[]; W02: string[] };
  dockOverhead: number;
  precision: boolean;
  /** seconds of "thinking/steering" overhead added per executed move (human factor) */
  moveOverhead: number;
}

export interface Event {
  t: number;
  world: string;
  what: string;
  credits: number;
}

const GEAR = [...W01_GEAR, ...W02_GEAR];
const SURF = -1;

// tiny deterministic RNG for volatile success
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

class Heap {
  k: number[] = [];
  v: number[] = [];
  push(key: number, val: number) {
    const k = this.k,
      v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= k[i]!) break;
      [k[p], k[i]] = [k[i]!, k[p]!];
      [v[p], v[i]] = [v[i]!, v[p]!];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const k = this.k,
      v = this.v;
    if (!k.length) return undefined;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!,
      lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < k.length && k[l]! < k[m]!) m = l;
        if (r < k.length && k[r]! < k[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [v[m], v[i]] = [v[i]!, v[m]!];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.k.length;
  }
}

export class Sim {
  game: Campaign;
  t = 0;
  activeT = 0;
  c: number;
  r = SURF;
  events: Event[] = [];
  pickups: { t: number; world: string; id: string }[] = [];
  private collected = new Set<string>();
  trips: {
    world: string;
    t: number;
    haul: number;
    bulk: number;
    cap: number;
    maxDepth: number;
    energyLeft: number;
    kind: string;
  }[] = [];
  random: () => number;
  ruptured = 0;
  preserved = 0;
  hullDamage = 0;
  tripMaxRow = -1;
  stuckGuard = 0;
  constructor(
    public policy: Policy,
    seed: number,
    state = createCampaign(seed),
  ) {
    this.game = new Campaign(state);
    this.c = Math.floor(this.def.dockX);
    this.random = rng(seed * 7919 + 17);
    this.syncVehicle();
  }
  get def() {
    return this.game.activeWorldDefinition;
  }
  get W() {
    return this.game.world.width;
  }
  get R() {
    return this.game.world.rows;
  }
  get s() {
    return this.game.state;
  }
  log(what: string) {
    this.events.push({
      t: +this.t.toFixed(1),
      world: this.s.currentWorld,
      what,
      credits: this.s.credits / 10,
    });
  }
  lvl(key: HardwareKey) {
    return HARDWARE_LEVELS[key][this.s.hardware[key]]!;
  }
  // ---- motion constants -------------------------------------------------
  get power() {
    return this.lvl("engine") / 150;
  }
  get profile() {
    return motionProfile(this.lvl("engine"), this.game.cargoMass);
  }
  get mf() {
    return this.profile.massFactor;
  }
  get vmax() {
    return this.profile.verticalSpeed;
  }
  get gravity() {
    return 11.54 * this.def.gravity;
  }
  get fallSpeed() {
    return Math.min(this.vmax, this.gravity / 0.85);
  }
  flyRow() {
    const t = 1 / this.vmax;
    return { t, e: t * (MOTION.idleEnergy + this.profile.movementEnergy) };
  }
  fallRow() {
    const t = 1 / this.fallSpeed;
    return { t, e: t * MOTION.idleEnergy };
  }
  tunnel(hover: boolean) {
    return hover ? { t: 0.8, e: 0.15 } : { t: 0.55, e: 0.065 };
  }
  surfaceTile() {
    const t = 1 / this.profile.groundSpeed;
    return { t, e: t * this.profile.movementEnergy };
  }
  // ---- terrain helpers ----------------------------------------------------
  wrap(c: number) {
    const W = this.W;
    return ((c % W) + W) % W;
  }
  idx(c: number, r: number) {
    return r * this.W + this.wrap(c);
  }
  tile(c: number, r: number) {
    if (r < 0) return 0;
    if (r >= this.R) return 3;
    return this.game.world.tiles[this.idx(c, r)]!;
  }
  known(c: number, r: number) {
    return (
      r < 0 || (r < this.R && this.game.world.discovered[this.idx(c, r)] === 1)
    );
  }
  plannedTile(c: number, r: number) {
    if (r < 0) return 0;
    if (r >= this.R) return 3;
    return this.known(c, r) ? this.tile(c, r) : 1;
  }
  /** Equipped anchoring feet support a deployed shaft brace. */
  grounded(c: number, r: number, planned = false) {
    if (r === SURF) return true;
    const below = planned ? this.plannedTile(c, r + 1) : this.tile(c, r + 1);
    if (below !== 0) return true;
    if (this.s.equipped.mobility === "W01-R2") {
      const t = (cc: number) =>
        planned ? this.plannedTile(cc, r) : this.tile(cc, r);
      return t(c - 1) !== 0 || t(c + 1) !== 0;
    }
    return false;
  }
  cutCost(
    c: number,
    r: number,
    dir: "down" | "side",
    material: number,
    fromSurface: boolean,
    volatile = false,
  ) {
    const s = this.s;
    const w = s.currentWorld;
    if (material === 4 && s.hardware.drill < 1)
      return { t: Infinity, e: Infinity, refund: 0 };
    const precision =
      volatile && this.policy.precision && s.equipped.processor === "W02-R3"
        ? 1.35
        : 1;
    const t = cutDuration({
      material,
      row: r,
      down: dir === "down",
      drill: this.lvl("drill"),
      worldId: w,
      augerId: s.equipped.drill,
      precision: precision > 1,
    });
    const thermal = s.equipped.drill === "W02-R1" ? 1.2 : 1;
    const drillRate = MOTION.drillingEnergy * thermal;
    const e = t * ((fromSurface ? 0 : MOTION.idleEnergy) + drillRate);
    let refund = 0;
    if (
      w === "W02" &&
      material === 1 &&
      s.equipped.utilities.includes("W02-R2")
    )
      refund = 0.2 * t * drillRate;
    return { t, e, refund };
  }
  syncVehicle() {
    const v = this.s.vehicle;
    v.x = this.c + 0.5;
    v.y = this.r === SURF ? -0.36 : this.r + 1 - 0.36;
    this.game.velocityX = this.game.velocityY = 0;
    this.game.refreshVisibility();
    // reuse model pickup/beacon/mission logic with zero elapsed time
    (this.game as unknown as { updateObjects(dt: number): void }).updateObjects(
      0,
    );
    for (const item of this.game.cargo)
      if (!this.collected.has(item.id)) {
        this.collected.add(item.id);
        this.pickups.push({
          t: this.t,
          world: this.s.currentWorld,
          id: item.id,
        });
      }
  }
  spend(t: number, e: number) {
    this.t += t + this.policy.moveOverhead;
    this.activeT += t + this.policy.moveOverhead;
    const v = this.s.vehicle;
    v.energy = Math.max(
      0,
      v.energy -
        e -
        (this.r >= 0 ? MOTION.idleEnergy * this.policy.moveOverhead : 0),
    );
    this.s.elapsed += t + this.policy.moveOverhead;
    const native = this.game as unknown as {
      updateObjects(dt: number): void;
      updateClimate(dt: number): void;
    };
    const hull = v.hull;
    // Timers and damage use the production implementations at the planner's
    // current position. Spatial motion between cell centres stays abstract.
    native.updateClimate(t + this.policy.moveOverhead);
    native.updateObjects(t + this.policy.moveOverhead);
    this.hullDamage += Math.max(0, hull - v.hull);
    if (v.energy <= 0) this.game.useReserve();
  }
  // ---- execution ---------------------------------------------------------
  settle() {
    // fall until grounded
    let rows = 0;
    while (this.r !== SURF && this.tile(this.c, this.r + 1) === 0) {
      this.r += 1;
      rows++;
      const f = this.fallRow();
      this.spend(f.t, f.e);
      this.syncVehicle();
    }
    if (rows >= 6 && this.fallSpeed > Math.max(7, this.vmax + 0.3)) {
      const dmg = Math.max(1, Math.round((this.fallSpeed - 7) * 0.6));
      this.s.vehicle.hull = Math.max(0, this.s.vehicle.hull - dmg);
      this.hullDamage += dmg;
    }
  }
  drillCell(c: number, r: number, dir: "down" | "side") {
    const w = this.game.world;
    const material = this.tile(c, r);
    const pk = w.packages.filter(
      (p) =>
        p.status === "deposit" &&
        Math.floor(p.x) === this.wrap(c) &&
        Math.floor(p.y) === r,
    );
    const volatile =
      this.s.currentWorld === "W02" &&
      pk.some((p) => p.tags.includes("volatile"));
    const cost = this.cutCost(c, r, dir, material, this.r === SURF, volatile);
    if (!Number.isFinite(cost.e)) return false;
    this.spend(cost.t, cost.e + (volatile ? 0 : 0));
    w.tiles[this.idx(c, r)] = 0;
    this.s.stats.mined++;
    const seam = w.pressureSeams?.find(
      (entry) =>
        !entry.spent &&
        entry.warning === null &&
        Math.floor(entry.x) === this.wrap(c) &&
        Math.floor(entry.y) === r,
    );
    if (seam) seam.warning = 1.2;
    if (cost.refund)
      this.s.vehicle.reserve = Math.min(
        5,
        (this.s.vehicle.reserve ?? 0) + cost.refund,
      );
    for (const p of pk) {
      p.status = "exposed";
      if (this.s.currentWorld === "W02" && p.tags.includes("volatile")) {
        // Keep the archived policy's declared failure model, but exercise the
        // three generous training windows in newly generated comet worlds.
        const training =
          (w.generatorVersion ?? 1) >= 2 &&
          (this.s.progress.volatileTraining ?? 0) < 3;
        this.s.progress.volatileTraining =
          (this.s.progress.volatileTraining ?? 0) + 1;
        this.spend(0.25, 0.016);
        if (training || this.random() < this.policy.volatileSuccess) {
          if (!p.tags.includes("intact")) p.tags.push("intact");
          if (
            volatile &&
            this.policy.precision &&
            this.s.equipped.processor === "W02-R3" &&
            p.tags.includes("ordinary") &&
            !p.processedBy.includes("W02-R3")
          ) {
            p.value = Math.round(p.value * 1.3);
            p.processedBy.push("W02-R3");
          }
          this.preserved++;
        } else {
          p.status = "lost";
          if (!p.tags.includes("ruptured")) p.tags.push("ruptured");
          this.ruptured++;
        }
      }
    }
    return true;
  }
  /** execute one move toward neighbour (nc,nr); returns false if impossible */
  step(nc: number, nr: number) {
    nc = this.wrap(nc);
    const dc = ((nc - this.c + this.W + this.W / 2) % this.W) - this.W / 2;
    const dr = nr - this.r;
    const target = this.tile(nc, nr);
    let hover = false;
    if (dr === 1) {
      if (target === 3) return false;
      if (target !== 0) {
        if (this.drillCell(nc, nr, "down") === false) return false;
      } else {
        const f = this.fallRow();
        this.spend(f.t, f.e);
      }
    } else if (dr === -1) {
      if (target !== 0) return false;
      const f = this.flyRow();
      this.spend(f.t, f.e);
      hover = true;
    } else if (Math.abs(dc) === 1 && dr === 0) {
      if (this.r === SURF) {
        const m = this.surfaceTile();
        this.spend(m.t, m.e);
      } else if (target !== 0) {
        if (target === 3 || !this.grounded(this.c, this.r)) return false;
        const braced =
          this.tile(this.c, this.r + 1) === 0 &&
          this.s.equipped.mobility === "W01-R2";
        if (braced) this.spend(0.35, MOTION.idleEnergy * 0.35);
        if (this.drillCell(nc, nr, "side") === false) return false;
        // Native mobility input keeps gripping the wall throughout a side cut.
        // Treating a successful brace cut as a free fall made old traces loop
        // below the same branch instead of reaching the chosen neighbour.
        hover = braced;
      } else {
        // Brace ownership does not provide a floor while crossing an open cell.
        const floating = this.tile(this.c, this.r + 1) === 0;
        const m = this.tunnel(floating);
        this.spend(m.t, m.e);
        hover = floating;
      }
    } else return false;
    this.c = nc;
    this.r = nr;
    this.tripMaxRow = Math.max(this.tripMaxRow, nr);
    this.syncVehicle();
    if (this.r !== SURF && !hover) this.settle();
    return true;
  }
  // ---- planning ----------------------------------------------------------
  node(c: number, r: number) {
    return (r + 1) * this.W + this.wrap(c);
  }
  cr(n: number): [number, number] {
    return [n % this.W, Math.floor(n / this.W) - 1];
  }
  /** Dijkstra from the rig over planned terrain. Cost = energy; also tracks time. */
  plan() {
    const N = (this.R + 1) * this.W;
    const dist = new Float64Array(N).fill(Infinity);
    const time = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const start = this.node(this.c, this.r);
    dist[start] = 0;
    time[start] = 0;
    const heap = new Heap();
    heap.push(0, start);
    const fly = this.flyRow(),
      fall = this.fallRow(),
      surf = this.surfaceTile();
    while (heap.size) {
      const [d, n] = heap.pop()!;
      if (d > dist[n]!) continue;
      const [c, r] = this.cr(n);
      const relax = (m: number, e: number, t: number) => {
        const nd = d + e;
        if (nd < dist[m]! - 1e-12) {
          dist[m] = nd;
          time[m] = time[n]! + t;
          prev[m] = n;
          heap.push(nd, m);
        }
      };
      // down
      if (r + 1 < this.R) {
        const tl = this.plannedTile(c, r + 1);
        if (tl === 0) relax(this.node(c, r + 1), fall.e, fall.t);
        else if (tl !== 3) {
          const k = this.cutCost(c, r + 1, "down", tl, r === SURF);
          relax(this.node(c, r + 1), k.e, k.t);
        }
      }
      // up
      if (r >= 0) {
        const tl = r - 1 < 0 ? 0 : this.plannedTile(c, r - 1);
        if (tl === 0) relax(this.node(c, r - 1), fly.e, fly.t);
      }
      // sides
      for (const dc of [-1, 1]) {
        const nc = this.wrap(c + dc);
        if (r === SURF) {
          relax(this.node(nc, r), surf.e, surf.t);
          continue;
        }
        const tl = this.plannedTile(nc, r);
        const ground = this.grounded(c, r, true);
        if (tl === 0) {
          const m = this.tunnel(!ground);
          relax(this.node(nc, r), m.e, m.t);
        } else if (tl !== 3 && ground) {
          const k = this.cutCost(nc, r, "side", tl, false);
          relax(this.node(nc, r), k.e, k.t);
        }
      }
    }
    return { dist, time, prev };
  }
  /** cost to get from any currently-open cell back to the dock (reverse Dijkstra over open cells). */
  returnMap() {
    const N = (this.R + 1) * this.W;
    const dist = new Float64Array(N).fill(Infinity);
    const dock = this.node(Math.floor(this.def.dockX), SURF);
    dist[dock] = 0;
    const heap = new Heap();
    heap.push(0, dock);
    const fly = this.flyRow(),
      fall = this.fallRow(),
      surf = this.surfaceTile();
    while (heap.size) {
      const [d, n] = heap.pop()!;
      if (d > dist[n]!) continue;
      const [c, r] = this.cr(n);
      const relax = (m: number, e: number) => {
        if (d + e < dist[m]! - 1e-12) {
          dist[m] = d + e;
          heap.push(d + e, m);
        }
      };
      // forward move X->n reversed: X below n (fly up from X to n)
      if (r + 1 < this.R && this.tile(c, r + 1) === 0)
        relax(this.node(c, r + 1), fly.e);
      // X above n (fall from X to n)
      if (r >= 0 && (r - 1 < 0 || this.tile(c, r - 1) === 0))
        relax(this.node(c, r - 1), fall.e);
      for (const dc of [-1, 1]) {
        const nc = this.wrap(c + dc);
        if (r === SURF) relax(this.node(nc, r), surf.e);
        else if (this.tile(nc, r) === 0)
          relax(this.node(nc, r), this.tunnel(!this.grounded(nc, r)).e);
      }
    }
    return dist;
  }
  /** return-energy estimate for a planned target: reverse the newly dug segment then use returnMap. */
  returnCost(target: number, prev: Int32Array, ret: Float64Array) {
    let n = target,
      seg = 0;
    const fly = this.flyRow();
    while (n !== -1) {
      const [c, r] = this.cr(n);
      const open = r === SURF || this.tile(c, r) === 0;
      if (open && Number.isFinite(ret[n]!)) return seg + ret[n]!;
      const p = prev[n]!;
      if (p === -1) break;
      const [pc, pr] = this.cr(p);
      if (r > pr) seg += fly.e;
      else if (r < pr) seg += this.fallRow().e;
      else seg += this.tunnel(false).e;
      void pc;
      n = p;
    }
    return seg + 5; // unknown, pessimistic
  }
  firstStep(target: number, prev: Int32Array) {
    let n = target;
    const start = this.node(this.c, this.r);
    if (n === start) return -1;
    while (prev[n] !== start && prev[n] !== -1) n = prev[n]!;
    return prev[n] === start ? n : -1;
  }
  reserve() {
    return Math.max(
      this.policy.reserveMin,
      this.policy.reserveFraction * this.game.maxEnergy,
    );
  }
  // ---- objectives ----------------------------------------------------------
  missionTargets(): { node: number; id: string; bulk?: number }[] {
    const g = this.game;
    const out: { node: number; id: string; bulk?: number }[] = [];
    const m = g.currentMilestone;
    if (!m) return out;
    if (this.s.currentWorld === "W01") {
      if (m.id === 1 && !this.s.progress.beacon)
        out.push({ node: this.node(20, 9), id: "beacon" });
      if (m.id >= 2)
        for (const id of m.requiredMissionIds) {
          const mis = g.world.missions.find((x) => x.id === id)!;
          if (mis.status === "source")
            out.push({
              node: this.node(Math.floor(mis.x), Math.floor(mis.y)),
              id,
            });
        }
    } else {
      if (m.id === 1)
        for (const mis of g.world.missions)
          if (mis.id.startsWith("W02-SAMPLE") && mis.status === "source")
            out.push({
              node: this.node(Math.floor(mis.x), Math.floor(mis.y)),
              id: mis.id,
            });
      if (m.id === 2 && this.needIntact() > 0) {
        const crystals = g.world.packages.filter(
          (p) =>
            p.itemId === "W02-O3" &&
            p.tags.includes("cryosample") &&
            (p.status === "deposit" || p.status === "exposed"),
        );
        const marked = crystals.filter(
          (p) =>
            [W02.cryoRow, W02.cryoRow + 1].includes(Math.floor(p.y)) &&
            p.x >= 22 &&
            p.x < 26,
        );
        const pool = marked.length ? marked : crystals.slice(0, 3);
        for (const p of pool)
          out.push({
            node: this.node(Math.floor(p.x), Math.floor(p.y)),
            id: "cryo:" + p.id,
            bulk: p.bulk,
          });
      }
      if (m.id === 3) {
        const mis = g.world.missions.find((x) => x.id === "W02-Q")!;
        if (mis.status === "source")
          out.push({
            node: this.node(Math.floor(mis.x), Math.floor(mis.y)),
            id: "W02-Q",
          });
      }
    }
    return out;
  }
  needIntact() {
    const g = this.game;
    if (this.s.currentWorld !== "W02" || g.currentMilestone?.id !== 2) return 0;
    const carried = g.cargo.filter(
      (p) =>
        p.itemId === "W02-O3" &&
        p.tags.includes("cryosample") &&
        p.tags.includes("intact"),
    ).length;
    return Math.max(0, 3 - g.bankedIntact - carried);
  }
  missionCarried() {
    return this.game.world.missions.some((m) => m.status === "carried");
  }
  // ---- trip ------------------------------------------------------------------
  /** one expedition from the dock and back; kind = "mine" or "mission" */
  trip(kind: "mine" | "mission") {
    const g = this.game;
    this.tripMaxRow = -1;
    let steps = 0;
    let lastTargetKind = "";
    while (steps++ < 3000) {
      if (this.s.vehicle.energy <= 0 || this.s.vehicle.hull <= 0) break;
      const { dist, prev } = this.plan();
      const ret = this.returnMap();
      const energy = this.s.vehicle.energy;
      const reserve = this.reserve();
      const free = g.capacity - g.cargoBulk;
      let best = -1,
        bestScore = -Infinity;
      const consider = (
        n: number,
        value: number,
        kindLabel: string,
        bulk: number,
      ) => {
        if (!Number.isFinite(dist[n]!)) return;
        if (bulk > free) return;
        const rc = this.returnCost(n, prev, ret);
        if (energy - dist[n]! - rc < reserve) return;
        const score = value / (dist[n]! + 0.35);
        if (score > bestScore) {
          bestScore = score;
          best = n;
          lastTargetKind = kindLabel;
        }
      };
      // mission objects first when on a mission trip
      const missions =
        kind === "mission" || this.policy.missionMode === "balanced"
          ? this.missionTargets()
          : [];
      for (const m of missions)
        consider(m.node, 1e6, "mission:" + m.id, m.bulk ?? 0);
      const intactNeeded = this.needIntact();
      for (const p of g.world.packages) {
        if (p.status !== "deposit" && p.status !== "exposed") continue;
        const c = Math.floor(p.x),
          r = Math.floor(p.y);
        if (!this.known(c, r)) continue;
        if (p.status === "exposed" && this.tile(c, r) !== 0) continue;
        let value = p.value;
        if (intactNeeded && p.tags.includes("cryosample")) value += 5e5;
        consider(this.node(c, r), value, "ore", p.bulk);
      }
      if (best === -1 && kind === "mission" && missions.length) {
        // progressive shaft: advance toward the first mission object while return stays feasible
        const m = missions[0]!;
        if (Number.isFinite(dist[m.node]!)) {
          const n = this.firstStep(m.node, prev);
          if (n !== -1) {
            const [nc, nr] = this.cr(n);
            const after = energy - dist[n]!;
            const back = this.returnCost(n, prev, ret);
            if (after - back >= reserve) {
              if (!this.step(nc, nr)) break;
              continue;
            }
          }
        }
      }
      if (best === -1 && g.cargoBulk < g.capacity) {
        // explore: cheapest undiscovered frontier cell with a feasible return
        let bestE = -1,
          bestCost = Infinity;
        const frontier: number[] = [];
        for (let n = 0; n < dist.length; n++) {
          if (!Number.isFinite(dist[n]!)) continue;
          const [c, r] = this.cr(n);
          if (r < 0 || this.known(c, r)) continue;
          if (
            this.known(c - 1, r) ||
            this.known(c + 1, r) ||
            this.known(c, r - 1) ||
            this.known(c, r + 1)
          )
            frontier.push(n);
        }
        frontier.sort((a, b) => dist[a]! - dist[b]!);
        for (const n of frontier.slice(0, 40)) {
          const d = dist[n]!;
          const rc = this.returnCost(n, prev, ret);
          if (energy - d - rc < reserve) continue;
          const cost = d + rc * 0.5;
          if (cost < bestCost) {
            bestCost = cost;
            bestE = n;
          }
        }
        if (bestE !== -1) {
          best = bestE;
          lastTargetKind = "explore";
        }
      }
      if (best === -1) break;
      const n = this.firstStep(best, prev);
      if (n === -1) break;
      const [nc, nr] = this.cr(n);
      if (!this.step(nc, nr)) break;
    }
    void lastTargetKind;
    return this.goHome(kind);
  }
  /** Visible POI-following policy: start over the marked column, extend a
   * straight shaft while the native return warning is safe, then surface/refuel.
   * Unlike the historical Dijkstra policy this deliberately builds a direct
   * home path. It does not peek at ore or omit the real cut/return costs. */
  guidedMissionTrip() {
    const target = this.missionTargets()[0];
    if (!target) return this.trip("mine");
    const [column, row] = this.cr(target.node);
    // The discovered plate's upgrade instruction takes priority over repeatedly
    // attempting an impossible cut; ordinary mining funds the required drill.
    if (
      this.s.currentWorld === "W01" &&
      this.s.hardware.drill === 0 &&
      row >= 30 &&
      this.known(column, 30)
    )
      return this.trip("mine");
    this.tripMaxRow = -1;
    while (this.c !== column && this.r === SURF) {
      const delta =
        ((column - this.c + this.W + this.W / 2) % this.W) - this.W / 2;
      if (!this.step(this.c + Math.sign(delta), SURF)) break;
    }
    for (let guard = 0; guard < this.R + 1 && this.r < row; guard++) {
      // Use the same visible B3 state as a player; reserve factors are still
      // retained for ordinary mining in this named policy.
      if (["turn", "stranded"].includes(this.game.returnReserve.state)) break;
      if (!this.step(this.c, this.r + 1)) break;
      if (this.s.vehicle.energy <= 0 || this.s.vehicle.hull <= 0) break;
    }
    return this.goHome("mission-guided");
  }
  horizontalBack(c: number) {
    const W = this.W;
    const dx = Math.abs(
      ((c - Math.floor(this.def.dockX) + W + W / 2) % W) - W / 2,
    );
    return dx * this.surfaceTile().e;
  }
  goHome(kind: string) {
    const g = this.game;
    // follow returnMap gradient
    let guard = 0;
    while (
      !(this.r === SURF && this.c === Math.floor(this.def.dockX)) &&
      guard++ < 2000
    ) {
      if (this.s.vehicle.energy <= 0) break;
      const ret = this.returnMap();
      const here = this.node(this.c, this.r);
      if (!Number.isFinite(ret[here]!)) break;
      let bestN = -1,
        bestV = ret[here]!;
      const cand: [number, number][] = [
        [this.c, this.r - 1],
        [this.c, this.r + 1],
        [this.c - 1, this.r],
        [this.c + 1, this.r],
      ];
      for (const [cc, rr] of cand) {
        if (rr < SURF || rr >= this.R) continue;
        if (rr >= 0 && this.tile(cc, rr) !== 0) continue;
        const m = this.node(cc, rr);
        if (ret[m]! < bestV - 1e-12) {
          bestV = ret[m]!;
          bestN = m;
        }
      }
      if (bestN === -1) break;
      const [nc, nr] = this.cr(bestN);
      const dr = nr - this.r;
      const m =
        dr === -1
          ? this.flyRow()
          : dr === 1
            ? this.fallRow()
            : this.r === SURF
              ? this.surfaceTile()
              : this.tunnel(!this.grounded(this.c, this.r));
      this.spend(m.t, m.e);
      this.c = this.wrap(nc);
      this.r = nr;
      this.syncVehicle();
    }
    let disabled = false;
    if (
      this.s.vehicle.energy <= 0 ||
      this.s.vehicle.hull <= 0 ||
      !(this.r === SURF && this.c === Math.floor(this.def.dockX))
    ) {
      disabled = true;
      g.recover();
      this.log("RECOVERY");
      this.c = Math.floor(this.def.dockX);
      this.r = SURF;
      this.syncVehicle();
    }
    // dock
    this.s.vehicle.x = this.def.dockX;
    this.s.vehicle.y = -0.36;
    this.game.velocityX = this.game.velocityY = 0;
    const haul = g.cargoValue;
    const bulk = g.cargoBulk;
    this.trips.push({
      world: this.s.currentWorld,
      t: +this.t.toFixed(1),
      haul: haul / 10,
      bulk,
      cap: g.capacity,
      maxDepth: (this.tripMaxRow + 1) * 10,
      energyLeft: +this.s.vehicle.energy.toFixed(2),
      kind: disabled ? kind + ":recovered" : kind,
    });
    this.t += this.policy.dockOverhead;
    return !disabled;
  }
  // ---- dock services & purchases -----------------------------------------
  firstUseful?: number;
  service() {
    const g = this.game;
    if (this.policy.contracts)
      for (const contract of g.contractViews)
        if (!contract.accepted) g.acceptContract(contract.id);
    g.bank();
    g.sell();
    if (this.policy.contracts)
      for (const contract of g.contractViews)
        if (
          contract.completed &&
          !contract.claimed &&
          g.claimContract(contract.id)
        )
          this.log("contract " + contract.id);
    // The current HUD explicitly advises servicing before construction. Keep
    // this separate from the archived spend-first comparator.
    if (this.policy.serviceFirst) {
      g.refuel();
      g.repair();
    }
    while (g.payMilestone()) this.log("M" + g.completedMilestones.at(-1));
    this.purchases();
    g.refuel();
    g.repair();
  }
  unpaidFee() {
    const m = this.game.currentMilestone;
    return m && this.game.missionReady ? m.fee : 0;
  }
  purchases() {
    const g = this.game;
    const plan = this.policy.plan[this.s.currentWorld as "W01" | "W02"];
    for (const item of plan) {
      const keep = this.unpaidFee() + 300; // 30 CR service reserve
      if (item.startsWith("W0")) {
        if (this.s.ownedGear.includes(item)) continue;
        const gear = GEAR.find((x) => x.id === item)!;
        if (!gear.id.startsWith(this.s.currentWorld)) continue;
        if (gear.milestone && !g.completedMilestones.includes(gear.milestone))
          continue;
        if (gear.requires && !this.s.ownedGear.includes(gear.requires))
          continue;
        if (this.s.credits - gear.price < keep) return; // save up for it (ordered plan)
        if (g.buyGear(item)) this.log("buy " + item);
      } else {
        const [key, rankS] = item.split(":") as [HardwareKey, string];
        const rank = Number(rankS || 1);
        if (this.s.hardware[key] >= rank) continue;
        if (!g.hardwareUnlocked) return;
        if (this.s.hardware[key] >= g.hardwareCap) continue;
        const price = HARDWARE_PRICES[key][this.s.hardware[key] + 1]!;
        if (this.s.credits - price < keep) return;
        if (g.buyHardware(key)) {
          this.log(`buy ${key}${this.s.hardware[key]}`);
          if (
            this.firstUseful === undefined &&
            ["drill", "energy", "cargo"].includes(key)
          )
            this.firstUseful = this.t;
        }
      }
    }
  }
  planComplete() {
    const plan = this.policy.plan[this.s.currentWorld as "W01" | "W02"];
    return plan.every((item) => {
      if (item.startsWith("W0"))
        return (
          !item.startsWith(this.s.currentWorld) ||
          this.s.ownedGear.includes(item)
        );
      const [key, rankS] = item.split(":") as [HardwareKey, string];
      return (
        this.s.hardware[key] >=
        Math.min(Number(rankS || 1), this.game.hardwareCap)
      );
    });
  }
  /** true when the next unbought plan item is locked behind a milestone or rank cap */
  planBlocked() {
    const g = this.game;
    for (const item of this.policy.plan[this.s.currentWorld as "W01" | "W02"]) {
      if (item.startsWith("W0")) {
        if (
          !item.startsWith(this.s.currentWorld) ||
          this.s.ownedGear.includes(item)
        )
          continue;
        const gear = GEAR.find((x) => x.id === item)!;
        return Boolean(
          gear.milestone && !g.completedMilestones.includes(gear.milestone),
        );
      }
      const [key, rankS] = item.split(":") as [HardwareKey, string];
      const rank = Math.min(Number(rankS || 1), g.hardwareCap);
      if (this.s.hardware[key] >= rank) continue;
      return !g.hardwareUnlocked;
    }
    return false;
  }
  // ---- world loop -------------------------------------------------------------
  runWorld(maxSeconds: number) {
    const g = this.game;
    const startT = this.t;
    let guard = 0;
    this.service();
    let stagnantTrips = 0;
    while (
      g.currentMilestone &&
      this.t - startT < maxSeconds &&
      guard++ < 600
    ) {
      const m = g.currentMilestone;
      let kind: "mine" | "mission" = "mine";
      const objectivesOpen = !g.missionReady;
      const wantMission =
        objectivesOpen &&
        (this.policy.missionMode !== "completionist" ||
          this.planComplete() ||
          this.planBlocked());
      if (wantMission) kind = "mission";
      if (!objectivesOpen && this.s.credits < m.fee) kind = "mine";
      // W02 M2 is satisfied by ordinary mining that preserves cryosamples
      const before = `${this.s.stats.mined}:${this.s.stats.ordinaryIncome}:${g.completedMilestones.length}:${JSON.stringify(this.s.hardware)}`;
      if (this.policy.directMissionShaft && kind === "mission")
        this.guidedMissionTrip();
      else this.trip(kind);
      this.service();
      const after = `${this.s.stats.mined}:${this.s.stats.ordinaryIncome}:${g.completedMilestones.length}:${JSON.stringify(this.s.hardware)}`;
      stagnantTrips = before === after ? stagnantTrips + 1 : 0;
      if (stagnantTrips >= 3) {
        if (
          this.policy.recoveryOnStall &&
          this.s.vehicle.energy < this.reserve()
        ) {
          const beforeEnergy = this.s.vehicle.energy;
          g.recover();
          this.log("RECOVERY guided low-fuel stall");
          this.c = Math.floor(this.def.dockX);
          this.r = SURF;
          this.syncVehicle();
          this.service();
          if (this.s.vehicle.energy > beforeEnergy) {
            stagnantTrips = 0;
            continue;
          }
        }
        break;
      }
    }
    if (this.s.currentWorld === "W01" && g.completedMilestones.includes(3)) {
      g.depart();
      this.log("departed");
    }
    return !g.currentMilestone;
  }
  travelToComet() {
    const g = this.game;
    this.s.vehicle.x = this.def.dockX;
    this.s.vehicle.y = -0.36;
    const ok = g.travel("W02");
    this.c = Math.floor(this.def.dockX);
    this.r = SURF;
    this.syncVehicle();
    this.t += this.policy.dockOverhead;
    this.log(ok ? "arrive W02" : "travel failed");
    return ok;
  }
}

export const PLANS = {
  cheap: {
    W01: ["energy", "engine", "hull", "cargo", "drill", "W01-R2", "W01-R3"],
    W02: [
      "W02-R1",
      "hull:2",
      "engine:2",
      "energy:2",
      "cargo:2",
      "drill:2",
      "W02-R2",
      "W02-R3",
    ],
  },
  smart: {
    W01: ["energy", "drill", "cargo", "engine", "hull", "W01-R2", "W01-R3"],
    W02: [
      "W02-R1",
      "cargo:2",
      "energy:2",
      "drill:2",
      "engine:2",
      "hull:2",
      "W02-R2",
      "W02-R3",
    ],
  },
  none: { W01: [], W02: [] },
  gateAware: {
    W01: ["drill", "cargo", "energy", "engine", "hull", "W01-R2", "W01-R3"],
    W02: [
      "W02-R1",
      "cargo:2",
      "energy:2",
      "drill:2",
      "engine:2",
      "hull:2",
      "W02-R2",
      "W02-R3",
    ],
  },
};
