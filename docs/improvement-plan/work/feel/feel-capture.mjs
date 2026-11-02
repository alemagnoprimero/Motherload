// Feel audit browser capture: renderer, draw calls, feedback frames, pointer latency, audio defaults.
// Run: cd /home/user/Motherload && node <this file>
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
import { advance, click, freeze, keys, menu } from "/home/user/Motherload/scripts/campaign-smoke.mjs";

const OUT = "/home/user/Motherload/docs/improvement-plan/work/feel";
const BASE = process.env.BASE || "http://127.0.0.1:5173/?mode=campaign";
await mkdir(OUT + "/shots", { recursive: true });
const results = {};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

const instrument = () => {
  window.__ctxTypes = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (this.parentElement?.id === "campaign-game" || this.closest?.("#campaign-game"))
      window.__ctxTypes.push(type + ":" + Boolean(ctx));
    return ctx;
  };
  window.__draws = 0;
  window.__clears = 0;
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const name of ["drawElements", "drawArrays"]) {
      const original = proto[name];
      proto[name] = function (...args) { window.__draws++; return original.apply(this, args); };
    }
    const clear = proto.clear;
    proto.clear = function (...args) { window.__clears++; return clear.apply(this, args); };
  }
  window.__audioContexts = 0;
  const AC = window.AudioContext;
  if (AC)
    window.AudioContext = class extends AC {
      constructor(...a) { super(...a); window.__audioContexts++; }
    };
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(instrument);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
  await delay(500);
  results.renderer = await page.evaluate(() => ({
    contextRequests: window.__ctxTypes,
    canvas2dAvailable: Boolean(document.querySelector("#campaign-game canvas")?.getContext("2d")),
  }));
  results.soundButtonText = await page.locator("#campaign-sound").textContent();
  await click(page, "#campaign-start");
  await delay(300);
  await freeze(page);
  await advance(page, 600);
  const ds = async () => page.evaluate(() => ({ ...document.querySelector("#campaign-game").dataset }));
  let d = await ds();
  results.surfaceFraming = { rigScreenX: d.rigScreenX, rigScreenY: d.rigScreenY, rigWorldY: d.rigWorldY, viewport: "1440x900", tile: 65 };
  await page.screenshot({ path: OUT + "/shots/f01-surface-framing.png" });

  // Draw calls per frame at the surface (idle)
  await page.evaluate(() => { window.__draws = 0; window.__clears = 0; });
  await advance(page, 1000);
  results.drawCallsSurface = await page.evaluate(() => ({ draws: window.__draws, frames: window.__clears, perFrame: window.__clears ? window.__draws / window.__clears : null }));

  // Drilling: mid-cut and just after completion
  await keys(page, ["ArrowDown"]);
  await advance(page, 450);
  await page.screenshot({ path: OUT + "/shots/f02-mid-cut.png" });
  d = await ds();
  results.midCut = { rigWorldY: d.rigWorldY };
  // step in 16ms increments until rigWorldY jumps past the first row boundary, then capture
  let prevY = Number(d.rigWorldY);
  for (let i = 0; i < 60; i++) {
    await page.clock.fastForward(16);
    const y = Number((await ds()).rigWorldY);
    if (y >= 0.6399 && prevY < 0.6399) { break; }
    prevY = y;
  }
  await page.clock.fastForward(48);
  await page.screenshot({ path: OUT + "/shots/f03-cut-complete-chips.png" });
  await page.screenshot({ path: OUT + "/shots/f03b-cut-complete-zoom.png", clip: { x: 620, y: 330, width: 200, height: 200 } });
  await advance(page, 2600);
  await page.evaluate(() => { window.__draws = 0; window.__clears = 0; });
  await advance(page, 1000);
  results.drawCallsDrilling = await page.evaluate(() => ({ draws: window.__draws, frames: window.__clears, perFrame: window.__clears ? window.__draws / window.__clears : null }));
  await keys(page, []);
  await advance(page, 300);
  d = await ds();
  results.afterDrilling = { rigWorldY: d.rigWorldY, rigScreenY: d.rigScreenY };
  await page.screenshot({ path: OUT + "/shots/f04-shaft-bottom.png" });

  // Side cut then press opposite direction mid-cut (facing flip check)
  await keys(page, ["ArrowRight"]);
  await advance(page, 250);
  await keys(page, ["ArrowLeft"]);
  await advance(page, 100);
  await page.screenshot({ path: OUT + "/shots/f05-sidecut-opposite-input.png" });
  await page.screenshot({ path: OUT + "/shots/f05b-sidecut-zoom.png", clip: { x: 620, y: 330, width: 200, height: 200 } });
  await keys(page, []);
  await advance(page, 1500);

  // Mouse hold latency: press 160 px below the rig without moving
  d = await ds();
  const mx = Number(d.rigScreenX), my = Number(d.rigScreenY) + 160;
  await page.mouse.move(mx, my);
  await page.mouse.down();
  const timeline = [];
  for (let t = 0; t <= 300; t += 20) {
    const s = await ds();
    timeline.push({ t, active: s.pointerActive, dirs: s.pointerDirections });
    await page.clock.fastForward(20);
  }
  await page.mouse.up();
  results.mouseHoldLatency = timeline;
  await advance(page, 1500);

  // Thrust frame
  await keys(page, ["ArrowUp"]);
  await advance(page, 350);
  await page.screenshot({ path: OUT + "/shots/f06-thrust.png" });
  await page.screenshot({ path: OUT + "/shots/f06b-thrust-zoom.png", clip: { x: 620, y: 330, width: 200, height: 200 } });
  await keys(page, []);
  await advance(page, 2500);
  // landing frame (no input) after falling back down the shaft
  await page.screenshot({ path: OUT + "/shots/f07-after-landing.png" });

  results.audioContextsBeforeEnable = await page.evaluate(() => window.__audioContexts);
  await menu(page);
  await click(page, "#campaign-sound");
  await delay(200);
  results.audioContextsAfterEnable = await page.evaluate(() => window.__audioContexts);
  results.soundButtonAfter = await page.locator("#campaign-sound").textContent();
  results.preferencesStored = await page.evaluate(() => localStorage.getItem("motherload.campaign.preferences.v1"));
} finally {
  results.errors = errors;
  await context.close();
}

// Fresh page: does the sound choice persist across a reload?
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await ctx2.newPage();
try {
  await p2.goto(BASE);
  await p2.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
  results.soundButtonFreshSession = await p2.locator("#campaign-sound").textContent();

  // Offline render of the synth (real CampaignAudio code via the Vite dev server)
  results.audioRender = await p2.evaluate(async () => {
    const { CampaignAudio } = await import("/src/campaign/audio.ts");
    const SR = 44100, SECONDS = 4;
    const scenarios = {};
    const render = async (label, drive) => {
      const Real = window.AudioContext;
      class Fake extends OfflineAudioContext {
        constructor() { super(1, SR * SECONDS, SR); }
        resume() { return Promise.resolve(); }
      }
      window.AudioContext = Fake;
      const prefs = { effects: 0.5, ambience: 0.3, music: 0.15 };
      const audio = new CampaignAudio(prefs);
      audio.muted = false;
      await audio.unlock();
      window.AudioContext = Real;
      const ctx = audio.context;
      drive(audio);
      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);
      let peak = 0, sum = 0;
      for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      // band energy via naive DFT on 1 s window (step 1 Hz resolution, 20..4000 Hz)
      const N = SR; const start = SR; const bands = { below150: 0, from150to300: 0, above300: 0 };
      for (let f = 20; f <= 4000; f += 1) {
        let re = 0, im = 0;
        const w = (2 * Math.PI * f) / SR;
        for (let n = 0; n < N; n += 2) { const s = data[start + n]; re += s * Math.cos(w * n); im -= s * Math.sin(w * n); }
        const p = re * re + im * im;
        if (f < 150) bands.below150 += p; else if (f < 300) bands.from150to300 += p; else bands.above300 += p;
      }
      const total = bands.below150 + bands.from150to300 + bands.above300 || 1;
      scenarios[label] = {
        peakDbfs: Math.round(20 * Math.log10(peak || 1e-9) * 10) / 10,
        rmsDbfs: Math.round(20 * Math.log10(rms || 1e-9) * 10) / 10,
        energyBelow150Hz: Math.round((bands.below150 / total) * 1000) / 10 + "%",
        energy150to300Hz: Math.round((bands.from150to300 / total) * 1000) / 10 + "%",
        energyAbove300Hz: Math.round((bands.above300 / total) * 1000) / 10 + "%",
      };
    };
    await render("drilling-hum+ambience", (a) => a.update(0.016, false, true, false));
    await render("idle-underground", (a) => a.update(0.016, false, false, false));
    await render("music-note-only-trigger", (a) => a.update(12.5, false, false, false));
    return scenarios;
  });
} catch (error) {
  results.audioRenderError = String(error);
} finally {
  await ctx2.close();
  await browser.close();
}
await writeFile(OUT + "/feel-capture-results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
