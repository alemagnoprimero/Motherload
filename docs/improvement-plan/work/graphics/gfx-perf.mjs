// Graphics audit: renderer facts + per-frame cost instrumentation (read-only; no repo writes).
// Usage: cd /home/user/Motherload && node <this> <outdir> [part]
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
import {
  click,
  exportCheckpoint,
  importCheckpoint,
  keys,
} from "/home/user/Motherload/scripts/campaign-smoke.mjs";

const OUT = process.argv[2];
const PART = process.argv[3] || "all";
const BASE = process.env.BASE || "http://127.0.0.1:5173/?mode=campaign";
await mkdir(OUT, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

const instrument = () => {
  const realNow = performance.now.bind(performance);
  const frames = [];
  window.__frames = frames;
  window.__glInfo = { contexts: [], twoD: 0 };
  const zero = () => ({ draws: 0, verts: 0, tex: 0, texBytes: 0, sub: 0, programs: 0, binds: 0, fb: 0, blend: 0, area: 0, tris: 0, clipped: 0 });
  let cur = zero();
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = orig.call(this, type, attrs);
    if (ctx && !ctx.__wrapped && /webgl/.test(type)) {
      ctx.__wrapped = true;
      window.__glInfo.contexts.push({ type, w: this.width, h: this.height, attrs: JSON.stringify(attrs || {}) });
      const wrap = (name, fn) => {
        const o = ctx[name].bind(ctx);
        ctx[name] = function (...a) { fn(a); return o(...a); };
      };
      wrap("drawArrays", (a) => { cur.draws++; cur.verts += a[2]; });
      wrap("drawElements", (a) => { cur.draws++; cur.verts += a[1]; });
      wrap("texImage2D", (a) => {
        cur.tex++;
        const src = a[a.length - 1];
        if (src && src.width) cur.texBytes += src.width * src.height * 4;
        else if (a.length >= 9) cur.texBytes += (a[3] || 0) * (a[4] || 0) * 4;
      });
      wrap("texSubImage2D", () => { cur.sub++; });
      wrap("useProgram", () => { cur.programs++; });
      wrap("bindTexture", () => { cur.binds++; });
      wrap("bindFramebuffer", () => { cur.fb++; });
      wrap("blendFuncSeparate", () => { cur.blend++; });
      // Sum screen-space triangle area submitted per frame (Phaser vertex stride 28 bytes; x,y floats first).
      wrap("bufferSubData", (a) => {
        const data = a[2];
        if (!data || !data.buffer || data.byteLength % 28 !== 0) return;
        const f = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
        const n = data.byteLength / 28;
        for (let v = 0; v + 2 < n; v += 3) {
          const ax = f[v * 7], ay = f[v * 7 + 1], bx = f[(v + 1) * 7], by = f[(v + 1) * 7 + 1], cx = f[(v + 2) * 7], cy = f[(v + 2) * 7 + 1];
          cur.area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
          cur.tris++;
          // Sutherland-Hodgman clip against the drawing buffer
          const W = ctx.drawingBufferWidth, H = ctx.drawingBufferHeight;
          let poly = [[ax, ay], [bx, by], [cx, cy]];
          for (const [axis, lim, keepGreater] of [[0, 0, true], [0, W, false], [1, 0, true], [1, H, false]]) {
            const out = [];
            for (let i = 0; i < poly.length; i++) {
              const P = poly[i], Q = poly[(i + 1) % poly.length];
              const pin = keepGreater ? P[axis] >= lim : P[axis] <= lim;
              const qin = keepGreater ? Q[axis] >= lim : Q[axis] <= lim;
              if (pin) out.push(P);
              if (pin !== qin) {
                const t = (lim - P[axis]) / (Q[axis] - P[axis]);
                out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
              }
            }
            poly = out;
            if (!poly.length) break;
          }
          let A = 0;
          for (let i = 0; i < poly.length; i++) { const P = poly[i], Q = poly[(i + 1) % poly.length]; A += P[0] * Q[1] - Q[0] * P[1]; }
          cur.clipped += Math.abs(A) / 2;
        }
      });
    } else if (ctx && type === "2d") window.__glInfo.twoD++;
    return ctx;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf(function (t) {
      const s = realNow();
      cb(t);
      const e = realNow();
      frames.push({ ms: +(e - s).toFixed(3), ...cur });
      if (frames.length > 4000) frames.shift();
      cur = zero();
    });
  };
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function open(viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
  await delay(500);
  return { context, page, errs };
}
async function start(page) {
  if (await page.locator("#campaign-start").isVisible()) await click(page, "#campaign-start");
  await delay(400);
}
async function resume(page) {
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open === "menu") await click(page, "#campaign-resume");
  await delay(300);
}
async function facts(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#campaign-game canvas");
    return {
      dpr: devicePixelRatio,
      canvasBacking: [c.width, c.height],
      canvasCss: [c.clientWidth, c.clientHeight],
      glContexts: window.__glInfo.contexts,
      twoDContexts: window.__glInfo.twoD,
      dataset: {
        rigScreenX: document.querySelector("#campaign-game").dataset.rigScreenX,
        worldTexture: document.querySelector("#campaign-game").dataset.worldTexture,
      },
    };
  });
}
function summarize(frames) {
  const pick = (k) => frames.map((f) => f[k]).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const out = { frames: frames.length };
  for (const k of ["ms", "draws", "verts", "tex", "texBytes", "sub", "programs", "binds", "blend", "area", "tris", "clipped"]) {
    const a = pick(k);
    out[k] = { median: q(a, 0.5), p95: q(a, 0.95), max: a[a.length - 1], mean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) };
  }
  return out;
}
async function record(page, ms, action) {
  await page.evaluate(() => { window.__frames.length = 0; });
  if (action) await action();
  await delay(ms);
  const frames = await page.evaluate(() => window.__frames.slice());
  return summarize(frames.slice(5));
}

// ---------- Desktop facts + surface/drilling perf ----------
if (PART === "all" || PART === "desktop") {
  const { context, page, errs } = await open({ width: 1440, height: 900 });
  await start(page);
  results.desktopFacts = await facts(page);
  results.desktopSurfaceIdle = await record(page, 2500);
  results.desktopDrilling = await record(page, 4000, () => keys(page, ["ArrowDown"]));
  await keys(page, []);
  results.desktopErrors = errs;
  await context.close();
}

// ---------- Deep revealed fixture perf + CPU profile ----------
if (PART === "all" || PART === "deep") {
  const { context, page, errs } = await open({ width: 1440, height: 900 });
  await start(page);
  const cp = await exportCheckpoint(page, false);
  const fx = structuredClone(cp);
  const w = fx.state.worlds[fx.state.currentWorld];
  w.discovered.fill(1);
  const row = 30;
  const missionCells = new Set(w.missions.map((m) => Math.floor(m.y) * w.width + Math.floor(m.x)));
  const carved = new Set();
  for (let x = 2; x <= 37; x++) for (const y of [row - 1, row]) {
    const i = y * w.width + x;
    if (missionCells.has(i)) continue;
    w.tiles[i] = 0; carved.add(i);
  }
  w.packages = w.packages.filter((p) => !(p.status === "deposit" && carved.has(Math.floor(p.y) * w.width + Math.floor(p.x))));
  fx.state.vehicle.x = 8.5;
  fx.state.vehicle.y = row + 1 - 0.36;
  fx.state.vehicle.energy = 10;
  await importCheckpoint(page, fx);
  await resume(page);
  await delay(500);
  results.deepFacts = await facts(page);
  results.deepIdle = await record(page, 2500);
  const client = await context.newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 250 });
  await client.send("Profiler.start");
  results.deepMovingRight = await record(page, 4000, () => keys(page, ["ArrowRight"]));
  await keys(page, []);
  const { profile } = await client.send("Profiler.stop");
  // Aggregate self time by function
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    const dt = profile.timeDeltas[i] || 0;
    total += dt;
    const cf = node.callFrame;
    const file = (cf.url || "").split("/").pop().split("?")[0];
    const key = `${cf.functionName || "(anon)"} @ ${file}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + dt);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45)
    .map(([k, v]) => ({ fn: k, selfMs: +(v / 1000).toFixed(1), pct: +((100 * v) / total).toFixed(2) }));
  results.deepProfileTop = { totalMs: +(total / 1000).toFixed(1), top };
  await writeFile(OUT + "/deep-profile.cpuprofile", JSON.stringify(profile));
  results.deepErrors = errs;
  await context.close();
}

// ---------- Phone facts + perf ----------
if (PART === "all" || PART === "phone") {
  const { context, page, errs } = await open({ width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await start(page);
  results.phoneFacts = await facts(page);
  results.phoneDrilling = await record(page, 3000, () => keys(page, ["ArrowDown"]));
  await keys(page, []);
  results.phoneErrors = errs;
  await context.close();
}

// ---------- 4x CPU throttle (Lighthouse-style mobile CPU estimate) ----------
if (PART === "throttle") {
  for (const [label, vp, opts, fixture] of [
    ["phoneThrottled", { width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, false],
    ["deepThrottled", { width: 1440, height: 900 }, {}, true],
  ]) {
    const { context, page } = await open(vp, opts);
    await start(page);
    if (fixture) {
      const cp = await exportCheckpoint(page, false);
      const fx = structuredClone(cp);
      const w = fx.state.worlds[fx.state.currentWorld];
      w.discovered.fill(1);
      const row = 30;
      const missionCells = new Set(w.missions.map((m) => Math.floor(m.y) * w.width + Math.floor(m.x)));
      const carved = new Set();
      for (let x = 2; x <= 37; x++) for (const y of [row - 1, row]) { const i = y * w.width + x; if (missionCells.has(i)) continue; w.tiles[i] = 0; carved.add(i); }
      w.packages = w.packages.filter((p) => !(p.status === "deposit" && carved.has(Math.floor(p.y) * w.width + Math.floor(p.x))));
      fx.state.vehicle.x = 8.5; fx.state.vehicle.y = row + 1 - 0.36; fx.state.vehicle.energy = 10;
      await importCheckpoint(page, fx);
      await resume(page);
      await delay(500);
    }
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    results[label] = await record(page, 5000, () => keys(page, fixture ? ["ArrowRight"] : ["ArrowDown"]));
    await keys(page, []);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await context.close();
  }
}
await browser.close();
await writeFile(OUT + "/perf-" + PART + ".json", JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
