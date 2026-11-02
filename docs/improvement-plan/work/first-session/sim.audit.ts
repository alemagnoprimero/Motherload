// First-session headless measurements (read-only use of the game model).
// Run: cd /home/user/Motherload && npx vitest run --dir <this folder>
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  Campaign,
  campaignDelta,
  createCampaign,
  decodeCampaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";
import { campaignSignal } from "/home/user/Motherload/src/campaign/poi.ts";
import { campaignMission } from "/home/user/Motherload/src/campaign/missions.ts";
import type { CampaignControls } from "/home/user/Motherload/src/campaign/types.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/first-session/sim-results.json";
const dt = 1 / 60;
const SURFACE = -0.36;
const r2 = (x: number) => Math.round(x * 100) / 100;

function clone(game: Campaign) {
  return new Campaign(decodeCampaign(JSON.stringify(game.state)));
}

/** Return autopilot: fly straight up the shaft, then either drive or fly to the dock. */
function returnTrip(start: Campaign, mode: "drive" | "fly", energy?: number) {
  const g = clone(start);
  if (energy !== undefined) g.state.vehicle.energy = energy;
  const e0 = g.state.vehicle.energy;
  let t = 0;
  // ascend
  while (g.state.vehicle.y > SURFACE + 1e-3 && t < 40) {
    g.tick(dt, { up: true });
    t += dt;
    if (g.state.vehicle.energy <= 0) return { ok: false, t: r2(t), spent: r2(e0), phase: "ascent", hull: g.state.vehicle.hull };
  }
  // travel
  for (let n = 0; n < 60 * 40; n++) {
    const delta = campaignDelta(g.state.vehicle.x, W01.dockX);
    if (g.atDock && Math.abs(g.velocityX) < 0.6)
      return { ok: true, t: r2(t), spent: r2(e0 - g.state.vehicle.energy), hull: g.state.vehicle.hull };
    const desired = Math.max(-4.5, Math.min(4.5, delta * 3));
    const dir = desired - g.velocityX;
    const controls: CampaignControls = {
      left: dir < -0.15,
      right: dir > 0.15,
      up: mode === "fly" && Math.abs(delta) > 1.2 && g.state.vehicle.y > -1.6,
    };
    g.tick(dt, controls);
    t += dt;
    if (g.state.vehicle.energy <= 0) return { ok: false, t: r2(t), spent: r2(e0), phase: "travel", hull: g.state.vehicle.hull };
  }
  return { ok: false, t: r2(t), spent: r2(e0 - g.state.vehicle.energy), phase: "timeout" };
}

/** Hold Down from the spawn until the rig is disabled. */
function naiveDive(seed: number, energy?: number) {
  const state = createCampaign(seed);
  if (energy !== undefined) state.vehicle.energy = energy;
  const g = new Campaign(state);
  let t = 0,
    lastMsg = "",
    lastDepth = -1;
  const events: any[] = [];
  const rows: any[] = [];
  const crossings: Record<string, any> = {};
  const bands = [
    ["warn25", 0.25],
    ["warn15", 0.15],
    ["warn08", 0.08],
  ] as const;
  let firstOre: number | null = null,
    holdFull: any = null,
    beacon: any = null;
  while (t < 180) {
    g.tick(dt, { down: true });
    t += dt;
    const v = g.state.vehicle;
    if (g.message !== lastMsg) {
      lastMsg = g.message;
      events.push({ t: r2(t), depth: g.depth, energy: r2(v.energy), msg: g.message });
    }
    if (firstOre === null && g.cargo.length) firstOre = r2(t);
    if (!holdFull && g.cargoBulk >= g.capacity) holdFull = { t: r2(t), depth: g.depth, energy: r2(v.energy) };
    if (!beacon && g.state.progress.beacon) beacon = { t: r2(t), depth: g.depth, energy: r2(v.energy) };
    for (const [k, f] of bands)
      if (!crossings[k] && v.energy <= g.maxEnergy * f)
        crossings[k] = { t: r2(t), depth: g.depth, energy: r2(v.energy) };
    if (g.depth > lastDepth && !g.drillTarget) {
      lastDepth = g.depth;
      const back = returnTrip(g, "drive", 10);
      const backFly = returnTrip(g, "fly", 10);
      rows.push({
        t: r2(t),
        depth: g.depth,
        energy: r2(v.energy),
        cargo: g.cargoBulk,
        returnDriveCost: back.spent,
        returnDriveTime: back.t,
        returnFlyCost: backFly.spent,
        returnFlyTime: backFly.t,
        marginDrive: r2(v.energy - back.spent),
        signal: (() => {
          const s = campaignSignal(g);
          return s ? `${s.arrow} ${s.name} ${s.distanceMeters} m ${s.band}` : "";
        })(),
        next: campaignMission(g).next,
      });
    }
    if (v.energy <= 0 || v.hull <= 0) break;
  }
  const ponr = rows.filter((r) => r.marginDrive >= 0).at(-1);
  return {
    seed,
    startEnergy: energy ?? 6,
    disabledAt: { t: r2(t), depth: g.depth, energy: r2(g.state.vehicle.energy) },
    firstOre,
    holdFull,
    beacon,
    crossings,
    lastSafeTurnaround: ponr ? { depth: ponr.depth, t: ponr.t, energy: ponr.energy, returnCost: ponr.returnDriveCost } : null,
    cargoAtFailure: g.cargoBulk,
    haulAtFailure: g.cargoValue / 10,
    rows,
    events,
    recovery: (() => {
      const p = g.recoveryPreview;
      const before = g.state.credits;
      g.recover();
      const emergency = g.world.packages.filter((i) => i.tags.includes("emergency"));
      const lost = g.world.packages.filter((i) => i.status === "lost");
      return {
        preview: p,
        creditsBefore: before / 10,
        creditsAfter: g.state.credits / 10,
        energyAfter: g.state.vehicle.energy,
        hullAfter: g.state.vehicle.hull,
        lostPackages: lost.length,
        lostValue: lost.reduce((s, i) => s + i.value, 0) / 10,
        emergencySalvage: emergency.map((i) => ({ x: i.x, y: i.y, value: i.value / 10 })),
        message: g.message,
      };
    })(),
  };
}

function drive(g: Campaign, x: number, log: any[], tRef: { t: number }) {
  for (let n = 0; n < 60 * 20; n++) {
    const delta = campaignDelta(g.state.vehicle.x, x);
    if (Math.abs(delta) < 0.08 && Math.abs(g.velocityX) < 0.4 && Math.abs(g.state.vehicle.y - SURFACE) < 0.001) return true;
    const desired = Math.max(-4, Math.min(4, delta * 3));
    const d = desired - g.velocityX;
    g.tick(dt, { left: d < -0.15, right: d > 0.15 });
    tRef.t += dt;
  }
  log.push("drive failed");
  return false;
}
function until(g: Campaign, c: CampaignControls, p: () => boolean, tRef: { t: number }, max = 60) {
  const start = tRef.t;
  while (!p() && tRef.t - start < max) {
    g.tick(dt, c);
    tRef.t += dt;
    if (g.state.vehicle.energy <= 0) return false;
  }
  return p();
}

/** The cautious opening: starter vein + beacon, return, sell, M1, refuel; second trip column 21. */
function cautiousOpening(seed: number) {
  const g = new Campaign(createCampaign(seed));
  const tRef = { t: 0 };
  const log: any[] = [];
  const snap = (label: string) =>
    log.push({
      label,
      t: r2(tRef.t),
      depth: g.depth,
      energy: r2(g.state.vehicle.energy),
      hull: g.state.vehicle.hull,
      cargo: g.cargoBulk,
      credits: g.state.credits / 10,
      msg: g.message,
    });
  snap("deploy");
  until(g, { down: true }, () => g.state.progress.beacon, tRef);
  snap("beacon surveyed (Down held)");
  until(g, {}, () => !g.drillTarget, tRef, 3);
  until(g, { up: true }, () => g.state.vehicle.y <= SURFACE + 1e-3, tRef, 20);
  snap("back at surface");
  drive(g, W01.dockX, log, tRef);
  snap("parked at lander");
  const atDock = g.atDock;
  g.bank();
  g.sell();
  snap("sold trip 1");
  const m1 = g.payMilestone();
  snap("M1 paid=" + m1);
  const refuel = g.servicePreview("refuel");
  g.refuel();
  snap("refuelled cost=" + refuel.cost / 10);
  const trip1 = tRef.t;
  drive(g, 21.5, log, tRef);
  snap("at column 21");
  until(g, { down: true }, () => g.depth >= 70 || g.cargoBulk >= g.capacity, tRef);
  snap("trip 2 hold");
  until(g, {}, () => !g.drillTarget, tRef, 3);
  until(g, { up: true }, () => g.state.vehicle.y <= SURFACE + 1e-3, tRef, 20);
  drive(g, W01.dockX, log, tRef);
  snap("parked trip 2");
  g.bank();
  g.sell();
  snap("sold trip 2");
  const affordable = (["hull", "engine", "energy", "cargo", "drill"] as const).map((k) => ({ k }));
  return { seed, atDock, trip1Seconds: r2(trip1), totalSeconds: r2(tRef.t), log, affordableAfterTrip2: g.state.credits / 10 };
}

it("first-session measurements", { timeout: 240000 }, () => {
  const results: any = { generated: new Date().toISOString() };
  results.naive = [10, 4, 73021, 999].map((s) => naiveDive(s));
  results.naiveFullTank = [10, 4].map((s) => naiveDive(s, 10));
  results.cautious = [10, 4, 73021].map((s) => cautiousOpening(s));
  // Spawn-to-dock distance and drive cost from spawn
  const g = new Campaign(createCampaign(10));
  results.spawn = {
    spawnX: W01.spawnX,
    dockX: W01.dockX,
    distanceMeters: Math.abs(campaignDelta(W01.spawnX, W01.dockX)) * 10,
    driveToDockFromSpawn: returnTrip(g, "drive"),
    flyToDockFromSpawn: returnTrip(g, "fly"),
  };
  writeFileSync(OUT, JSON.stringify(results, null, 1));
});
