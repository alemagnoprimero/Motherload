// True-engine "mission rusher": completes W01 through the protected soil corridor
// with a progressive shaft (re-using its own shaft each trip). Optional purchases
// follow a plan. Measures active seconds; a fixed per-dock overhead models time
// a human spends in the terminal.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  Campaign,
  campaignDelta,
  createCampaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import { W01, HARDWARE_PRICES } from "/home/user/Motherload/src/campaign/config.ts";
import type { CampaignControls, HardwareKey } from "/home/user/Motherload/src/campaign/types.ts";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/critique-facts/rusher";
const dt = 1 / 60;
const SURFACE_Y = -0.36;
const DOCK_OVERHEAD = 20;

class Runner {
  t = 0;
  docks = 0;
  events: { t: number; what: string; credits: number }[] = [];
  constructor(public game: Campaign) {}
  tick(c: CampaignControls) {
    this.game.tick(dt, c);
    this.t += dt;
  }
  until(c: CampaignControls, p: () => boolean, limit = 200) {
    const start = this.t;
    while (this.t - start < limit && !p()) this.tick(c);
    return p();
  }
  drive(x: number) {
    const g = this.game;
    for (let k = 0; k < 60 * 30; k++) {
      const delta = campaignDelta(g.state.vehicle.x, x, g.world.width);
      if (Math.abs(delta) < 0.08 && Math.abs(g.velocityX) < 0.4 && Math.abs(g.state.vehicle.y - SURFACE_Y) < 0.001) return true;
      const desired = Math.max(-5, Math.min(5, delta * 3));
      const d = desired - g.velocityX;
      this.tick({ left: d < -0.15, right: d > 0.15 });
    }
    return false;
  }
  log(what: string) {
    this.events.push({ t: +this.t.toFixed(1), what, credits: this.game.state.credits / 10 });
  }
}

const mission = (g: Campaign, id: string) => g.world.missions.find((m) => m.id === id)!;
function returnNeed(g: Campaign) {
  const rows = Math.max(0, g.state.vehicle.y + 0.36);
  return rows * 0.034 + 0.35 + 0.6; // flight + surface drive + committed-cut margin
}

function service(r: Runner, plan: string[], reserve: number) {
  const g = r.game;
  g.bank();
  g.sell();
  while (g.payMilestone()) r.log("M" + g.state.progress.completed.at(-1));
  for (const item of plan) {
    if (!g.state.progress.completed.includes(1)) break;
    if (item.startsWith("W01-")) {
      if (g.state.ownedGear.includes(item)) continue;
      const price = item === "W01-R2" ? 4000 : 9000;
      if (g.state.credits - price < reserve * 10) break;
      if (g.buyGear(item)) r.log("buy " + item);
      else break;
    } else {
      const key = item as HardwareKey;
      if (g.state.hardware[key] >= 1) continue;
      const price = HARDWARE_PRICES[key][1]!;
      // keep money for the next construction fee only if missions are ready
      const unpaid = [2000, 3000, 5000].filter((_, i) => !g.state.progress.completed.includes(i + 1)).reduce((a, b) => a + b, 0);
      if (g.state.credits - price < reserve * 10 + unpaid) break;
      if (g.buyHardware(key)) r.log("buy " + key);
      else break;
    }
  }
  g.refuel();
  g.repair();
}

function rush(seed: number, plan: string[], reserve: number) {
  const g = new Campaign(createCampaign(seed));
  const r = new Runner(g);
  const tripLog: unknown[] = [];
  const endTrip = (label: string) => {
    // finish committed cut, fly, drive, dock
    r.until({ up: true }, () => g.state.vehicle.y <= SURFACE_Y + 1e-6, 60);
    r.drive(W01.dockX);
    r.docks++;
    r.t += DOCK_OVERHEAD;
    const haul = g.cargoValue / 10;
    const energyLeft = g.state.vehicle.energy;
    service(r, plan, reserve);
    tripLog.push({ label, t: +r.t.toFixed(1), haul, energyLeft: +energyLeft.toFixed(2), depth: g.state.stats.largestDepth, credits: g.state.credits / 10 });
  };
  // trip 1: column 20 seam + beacon
  r.until({ down: true }, () => g.state.progress.beacon && g.depth >= 100, 60);
  endTrip("beacon");
  // trip 2: column 21 seam
  r.drive(21.5);
  r.until({ down: true }, () => g.cargoBulk >= g.capacity || g.depth >= 70, 60);
  endTrip("seam21");
  let trips = 2;
  while (trips < 40 && !g.state.progress.completed.includes(3)) {
    trips++;
    r.drive(20.5);
    r.until({}, () => Math.abs(g.velocityX) < 0.01, 3);
    let reason = "";
    for (let k = 0; k < 60 * 300; k++) {
      if (g.state.vehicle.energy <= returnNeed(g)) { reason = "energy"; break; }
      if (mission(g, "W01-Q").status === "carried") { reason = "core"; break; }
      const atAntennaRow = g.depth >= 400 && mission(g, "W01-ANTENNA").status === "source";
      if (atAntennaRow && !g.drillTarget && Math.abs(g.velocityY) < 1e-6) {
        r.until({ right: true }, () => mission(g, "W01-ANTENNA").status !== "source", 10);
        // come back without triggering a left cut
        r.until({ left: true }, () => g.state.vehicle.x < 21.0, 5);
        r.until({}, () => Math.abs(g.velocityX) < 0.02, 5);
        continue;
      }
      const antennaPending = mission(g, "W01-ANTENNA").status === "source";
      if (antennaPending && g.drillTarget && g.drillTarget.y >= 39) {
        r.tick({}); // let the committed cut into row 39 finish without starting another
        continue;
      }
      if (antennaPending && g.depth >= 400 && (g.drillTarget || Math.abs(g.velocityY) > 1e-6)) {
        r.tick({});
        continue;
      }
      // banking a carried mission object early is required for construction
      if (mission(g, "W01-VALVE").status === "carried" && mission(g, "W01-ANTENNA").status !== "source" && !g.state.progress.completed.includes(2)) {
        reason = "bank parts";
        break;
      }
      r.tick({ down: true });
      if (g.state.vehicle.energy <= 0) break;
    }
    if (g.state.vehicle.energy <= 0) {
      g.recover();
      r.log("RECOVERY");
      r.docks++;
      r.t += DOCK_OVERHEAD;
      service(r, plan, reserve);
      continue;
    }
    endTrip(reason);
  }
  if (g.state.progress.completed.includes(3) && g.depart()) r.log("departed");
  return {
    seed,
    plan: plan.join(",") || "(none)",
    activeSeconds: +(r.t - r.docks * DOCK_OVERHEAD).toFixed(1),
    withDockOverheadSeconds: +r.t.toFixed(1),
    trips,
    docks: r.docks,
    credits: g.state.credits / 10,
    income: g.state.stats.ordinaryIncome / 10,
    hardware: { ...g.state.hardware },
    recoveries: g.state.stats.recoveries,
    events: r.events,
    tripLog,
  };
}

it("rush W01 with no purchases and with useful purchases", () => {
  const out: unknown[] = [];
  for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    out.push(rush(seed, [], 30));
    out.push(rush(seed, ["energy", "drill"], 30));
  }
  writeFileSync(OUT + "/rusher.json", JSON.stringify(out, null, 1));
});
