// Baseline screenshot capture for the improvement-plan analysis.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
import {
  advance,
  click,
  closeOverlay,
  exportCheckpoint,
  freeze,
  importCheckpoint,
  keys,
  menu,
  tab,
} from "/home/user/Motherload/scripts/campaign-smoke.mjs";

const OUT = process.argv[2];
const BASE = "http://127.0.0.1:5173/?mode=campaign";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const log = (...a) => console.log(...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts });
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await page.goto(BASE);
  await page.waitForFunction(
    () => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
    null, { timeout: 30000 },
  );
  await delay(600);
  return { context, page, errs };
}
async function shot(page, name) {
  await delay(250);
  await page.screenshot({ path: OUT + "/" + name + ".png" });
  log("shot", name);
}
async function start(page) {
  if (await page.locator("#campaign-start").isVisible()) await click(page, "#campaign-start");
  await delay(500);
}
async function hold(page, k, ms) {
  await keys(page, k);
  await advance(page, ms);
  await keys(page, []);
}

const world = (c) => c.state.worlds[c.state.currentWorld];

// ---------- DESKTOP NATIVE RUN ----------
{
  const { context, page, errs } = await open({ width: 1440, height: 900 });
  await shot(page, "d01-title");
  await start(page);
  await shot(page, "d02-surface-start");
  await freeze(page);
  // move right toward starter vein columns 20/21 from lander ~5.5
  await hold(page, ["ArrowRight"], 1800);
  await advance(page, 800);
  await shot(page, "d03-surface-moving");
  await hold(page, ["ArrowDown"], 6000);
  await shot(page, "d04-drilling-shallow");
  await hold(page, ["ArrowDown"], 8000);
  await hold(page, ["ArrowRight"], 1200);
  await hold(page, ["ArrowDown"], 6000);
  await shot(page, "d05-underground");
  // pause menu
  await menu(page);
  await shot(page, "d06-pause-menu");
  await page.locator("#campaign-menu").evaluate((d) => { d.scrollTop = d.scrollHeight; });
  await shot(page, "d07-pause-menu-scrolled");
  // open legend
  try {
    await page.locator("#campaign-legend summary").click();
    await page.locator("#campaign-legend").scrollIntoViewIfNeeded();
    await shot(page, "d08-pause-legend");
  } catch (e) { log("legend fail", e.message); }
  // star map from pause
  try {
    await click(page, '#campaign-menu [data-command="map"]');
    await shot(page, "d09-star-map-early");
    await closeOverlay(page);
  } catch (e) { log("map fail", e.message); }
  const cp = await exportCheckpoint(page, true);
  await writeFile(OUT + "/checkpoint-native.json", JSON.stringify(cp));
  log("errors", JSON.stringify(errs));
  await context.close();
}

// ---------- DESKTOP FIXTURE RUNS ----------
async function fixtureRun(name, viewport, mutate, after, opts = {}) {
  const { context, page, errs } = await open(viewport, opts);
  await start(page);
  await freeze(page);
  const cp = await exportCheckpoint(page, false);
  const fixture = structuredClone(cp);
  mutate(fixture);
  await importCheckpoint(page, fixture);
  await after(page);
  log(name, "errors", JSON.stringify(errs));
  await context.close();
}
function dockAt(fx) {
  fx.state.vehicle.x = 5.5;
  fx.state.vehicle.y = -0.36;
}
async function resume(page) {
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open === "menu") await click(page, "#campaign-resume");
  await delay(300);
}

// Dock tabs with some credits
await fixtureRun("dock", { width: 1440, height: 900 }, (fx) => {
  dockAt(fx);
  fx.state.credits = 25000; // 2500 CR in tenths
  fx.state.vehicle.energy = 4;
  fx.state.vehicle.hull = 6;
}, async (page) => {
  await resume(page);
  await page.keyboard.press("e");
  await delay(600);
  for (const t of ["service", "hardware", "tools", "lander", "cargo"]) {
    try { await tab(page, t); await shot(page, "d10-dock-" + t); } catch (e) { log("tab fail", t, e.message); }
  }
});

// Completed asteroid → navigation & comet
await fixtureRun("nav", { width: 1440, height: 900 }, (fx) => {
  dockAt(fx);
  fx.state.credits = 1000000;
  fx.state.progress = { beacon: true, bankedOre: 3, completed: [1, 2, 3], unlockedWorlds: ["W01", "W02", "W03"], departed: false };
  for (const item of fx.state.worlds.W01.missions) item.status = "banked";
}, async (page) => {
  await resume(page);
  await shot(page, "d11-asteroid-complete-surface");
  await page.keyboard.press("e");
  await delay(600);
  try { await tab(page, "lander"); await shot(page, "d12-dock-lander-complete"); } catch (e) { log(e.message); }
  // try launch/departure
  const cmds = await page.evaluate(() => Array.from(document.querySelectorAll("#campaign-dock [data-command]")).map((b) => b.dataset.command + "|" + b.textContent.trim() + "|" + (b.disabled ? "dis" : "en")));
  log("dock commands", cmds.join(" ;; "));
  for (const c of cmds) {
    const [cmd] = c.split("|");
    if (/launch|depart|frontier/i.test(cmd)) {
      try { await click(page, '#campaign-dock [data-command="' + cmd + '"]'); await delay(800); await shot(page, "d13-after-" + cmd); } catch (e) { log("launch fail", e.message); }
      break;
    }
  }
  const confirmOpen = await page.locator("#campaign-confirm").evaluate((d) => d.open);
  if (confirmOpen) { await shot(page, "d13b-confirm"); await click(page, "#campaign-confirm-accept"); await delay(1500); await advance(page, 3000); await shot(page, "d13c-after-confirm"); }
  const overlay = await page.evaluate(() => document.body.dataset.campaignOverlay);
  log("overlay now", overlay);
  // open navigation
  try {
    if (overlay !== "dock") { await page.keyboard.press("e"); await delay(500); }
    const navBtn = page.locator("#campaign-dock-navigation");
    if (await navBtn.isVisible()) { await click(page, "#campaign-dock-navigation"); await delay(500); await shot(page, "d14-navigation"); }
    const travel = await page.evaluate(() => Array.from(document.querySelectorAll("#campaign-map [data-command], #campaign-map button")).map((b) => (b.dataset.command || "") + "|" + (b.dataset.world || "") + "|" + b.textContent.trim().slice(0, 40) + "|" + (b.disabled ? "dis" : "en")));
    log("map buttons", travel.join(" ;; "));
  } catch (e) { log("nav fail", e.message); }
  // travel to W02
  try {
    const btn = page.locator('#campaign-map button:has-text("Ice comet")').first();
    const travelBtn = page.locator('#campaign-map [data-command="travel"]').first();
    if (await travelBtn.count()) { await travelBtn.click(); } else if (await btn.count()) { await btn.click(); }
    await delay(600);
    if (await page.locator("#campaign-confirm").evaluate((d) => d.open)) { await shot(page, "d15-travel-confirm"); await click(page, "#campaign-confirm-accept"); }
    await delay(2000);
    await advance(page, 2000);
    await shot(page, "d16-w02-arrival");
    const ov = await page.evaluate(() => document.body.dataset.campaignOverlay);
    log("after travel overlay", ov);
    if (ov === "dock") { try { await tab(page, "hardware"); await shot(page, "d17-w02-dock-hardware"); await tab(page, "tools"); await shot(page, "d18-w02-dock-tools"); } catch (e) { log(e.message); } await closeOverlay(page); }
    await delay(500);
    await shot(page, "d19-w02-surface");
    await hold(page, ["ArrowRight"], 1500);
    await hold(page, ["ArrowDown"], 9000);
    await shot(page, "d20-w02-drilling");
    const cp2 = await exportCheckpoint(page, true);
    await writeFile(OUT + "/checkpoint-w02.json", JSON.stringify(cp2));
  } catch (e) { log("travel fail", e.message); }
});

// Deep reveal fixture: reveal map around depth to see ore variety & caves
await fixtureRun("deep", { width: 1440, height: 900 }, (fx) => {
  const w = fx.state.worlds[fx.state.currentWorld];
  w.discovered.fill(1);
  fx.state.vehicle.x = 20.5;
  // find an open cell deep
  let target = 30;
  for (let y = 25; y < w.rows - 2; y++) { const idx = y * w.width + 20; if (w.tiles[idx] === 0) { target = y; break; } }
  fx.state.vehicle.y = target - 0.36 + 1;
  for (let y = target - 1; y <= target; y++) for (let x = 19; x <= 21; x++) { if (y >= 0) w.tiles[y * w.width + x] = 0; }
}, async (page) => {
  await resume(page);
  await advance(page, 500);
  await shot(page, "d21-deep-revealed");
});

// ---------- PORTRAIT PHONE ----------
{
  const { context, page, errs } = await open({ width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await shot(page, "p01-title");
  await start(page);
  await shot(page, "p02-surface");
  await freeze(page);
  await hold(page, ["ArrowRight"], 1500);
  await hold(page, ["ArrowDown"], 9000);
  await shot(page, "p03-drilling");
  await menu(page);
  await shot(page, "p04-pause");
  await closeOverlay(page);
  log("portrait errors", JSON.stringify(errs));
  await context.close();
}
await fixtureRun("pdock", { width: 393, height: 851 }, (fx) => { dockAt(fx); fx.state.credits = 25000; }, async (page) => {
  await resume(page);
  await page.keyboard.press("e");
  await delay(600);
  for (const t of ["service", "hardware"]) { try { await tab(page, t); await shot(page, "p05-dock-" + t); } catch (e) { log(e.message); } }
}, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

// ---------- LANDSCAPE PHONE ----------
{
  const { context, page, errs } = await open({ width: 844, height: 390 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await shot(page, "l01-title");
  await start(page);
  await freeze(page);
  await hold(page, ["ArrowRight"], 1500);
  await hold(page, ["ArrowDown"], 9000);
  await shot(page, "l02-drilling");
  log("landscape errors", JSON.stringify(errs));
  await context.close();
}
await browser.close();
log("done");
