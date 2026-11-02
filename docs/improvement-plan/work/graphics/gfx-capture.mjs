// Graphics audit: deterministic visual evidence captures (read-only; no repo writes).
// Usage: cd /home/user/Motherload && node <this> <outdir> [part]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
import {
  advance,
  click,
  exportCheckpoint,
  freeze,
  importCheckpoint,
  keys,
} from "/home/user/Motherload/scripts/campaign-smoke.mjs";

const OUT = process.argv[2];
const PART = process.argv[3] || "all";
const BASE = "http://127.0.0.1:5173/?mode=campaign";
const SHOTS = "/home/user/Motherload/docs/improvement-plan/shots/";
await mkdir(OUT, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = {};
const W01BASE = JSON.parse(await readFile(SHOTS + "checkpoint-native.json", "utf8"));
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function open(viewport, opts = {}, prefs = null) {
  const context = await browser.newContext({ viewport, ...opts });
  if (prefs)
    await context.addInitScript((p) => {
      localStorage.setItem("motherload.campaign.preferences.v1", JSON.stringify(p));
    }, prefs);
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
  await delay(400);
  if (await page.locator("#campaign-start").isVisible()) await click(page, "#campaign-start");
  await delay(300);
  await freeze(page);
  return { context, page };
}
async function resume(page) {
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open === "menu") await click(page, "#campaign-resume");
  await advance(page, 700);
}
async function shot(page, name, clip) {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  meta[name] = await page.evaluate(() => {
    const d = document.querySelector("#campaign-game").dataset;
    return { rigScreenX: d.rigScreenX, rigScreenY: d.rigScreenY, rigWorldX: d.rigWorldX, rigWorldY: d.rigWorldY, world: d.campaignWorld };
  });
  console.log("shot", name, JSON.stringify(meta[name]));
}
const W = (fx) => fx.state.worlds[fx.state.currentWorld];
function reveal(w, x0, x1, y0, y1) {
  for (let y = Math.max(0, y0); y <= Math.min(w.rows - 1, y1); y++)
    for (let x = x0; x <= x1; x++) w.discovered[y * w.width + ((x % w.width) + w.width) % w.width] = 1;
}
function missionCells(w) {
  return new Set(w.missions.map((m) => Math.floor(m.y) * w.width + Math.floor(m.x)));
}
function setTiles(w, cells, type) {
  const protectedCells = missionCells(w);
  const changed = new Set();
  for (const [x, y] of cells) {
    const i = y * w.width + x;
    if (protectedCells.has(i)) continue;
    w.tiles[i] = type;
    changed.add(i);
  }
  if (type === 0)
    w.packages = w.packages.filter((p) => !(p.status === "deposit" && changed.has(Math.floor(p.y) * w.width + Math.floor(p.x))));
}
function clearDeposits(w, x0, x1, y0, y1) {
  w.packages = w.packages.filter((p) => !(p.status === "deposit" && p.x >= x0 && p.x < x1 + 1 && p.y >= y0 && p.y < y1 + 1));
}
function rect(x0, x1, y0, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}
async function withFixture(viewport, base, mutate, after, opts = {}, prefs = null) {
  const { context, page } = await open(viewport, opts, prefs);
  const cp = base ? structuredClone(base) : await exportCheckpoint(page, false);
  mutate(cp);
  await importCheckpoint(page, cp);
  await resume(page);
  await after(page, cp);
  await context.close();
}
const deepFixture = (rigX) => (fx) => {
  const w = W(fx);
  w.discovered.fill(1);
  setTiles(w, rect(2, 37, 29, 30), 0);
  fx.state.vehicle.x = rigX;
  fx.state.vehicle.y = 31 - 0.36;
  fx.state.vehicle.energy = 10;
};

// G1: exposed stone vs exposed soil in W01
if (PART === "all" || PART === "stone") {
  await withFixture({ width: 1440, height: 900 }, W01BASE, (fx) => {
    const w = W(fx);
    clearDeposits(w, 4, 16, 12, 26);
    setTiles(w, rect(4, 16, 12, 26), 1);
    setTiles(w, rect(12, 13, 14, 24), 2); // stone: x=12 exposed to the pocket, x=13 interior
    setTiles(w, rect(9, 11, 15, 20), 0); // pocket
    reveal(w, 3, 17, 11, 27);
    fx.state.vehicle.x = 10.5;
    fx.state.vehicle.y = 21 - 0.36;
    fx.state.vehicle.energy = 10;
  }, async (page) => {
    await shot(page, "g01-w01-stone-exposure");
  });
}

// G2/G3: parallax bleed-through + seams (camera shifted by 4 tiles), G8 high contrast
if (PART === "all" || PART === "bleed") {
  await withFixture({ width: 1440, height: 900 }, W01BASE, deepFixture(8.5), async (page) => shot(page, "g02a-deep-x8"));
  await withFixture({ width: 1440, height: 900 }, W01BASE, deepFixture(12.5), async (page) => shot(page, "g02b-deep-x12"));
  const prefs = { highContrast: true, reducedMotion: false, largeText: false, drillToggle: false, braceToggle: false, showDirectionButtons: false, effects: 0.5, ambience: 0.3, music: 0.15 };
  await withFixture({ width: 1440, height: 900 }, W01BASE, deepFixture(8.5), async (page) => {
    meta.highContrastClass = await page.evaluate(() => [...document.querySelectorAll("[class*=high-contrast]")].map((e) => e.tagName + "." + e.className).slice(0, 3));
    await shot(page, "g08-deep-x8-high-contrast");
  }, {}, prefs);
}

// G4: depth triptych W01 (rows 4, 30, 56)
if (PART === "all" || PART === "depth") {
  for (const row of [4, 30, 56]) {
    await withFixture({ width: 1440, height: 900 }, W01BASE, (fx) => {
      const w = W(fx);
      reveal(w, 0, 39, row - 9, row + 9);
      setTiles(w, rect(9, 11, row - 1, row), 0);
      fx.state.vehicle.x = 10.5;
      fx.state.vehicle.y = row + 1 - 0.36;
      fx.state.vehicle.energy = 10;
    }, async (page) => shot(page, `g04-w01-depth-row${row}`));
  }
}

// G4b + G7: W02 depth + ore readability
if (PART === "all" || PART === "w02") {
  const w02 = JSON.parse(await readFile(SHOTS + "checkpoint-w02.json", "utf8"));
  for (const row of [6, 50, 94]) {
    await withFixture({ width: 1440, height: 900 }, w02, (fx) => {
      const w = W(fx);
      reveal(w, 0, 47, row - 9, row + 9);
      setTiles(w, rect(9, 11, row - 1, row), 0);
      fx.state.vehicle.x = 10.5;
      fx.state.vehicle.y = row + 1 - 0.36;
      fx.state.vehicle.energy = 10;
    }, async (page) => shot(page, `g04-w02-depth-row${row}`));
  }
  // ore readability: one of each ore beside the rig in a lit pocket
  for (const [label, base, ids, cols] of [
    ["w02", w02, ["W02-O1", "W02-O2", "W02-O3", "W02-O4"], 48],
    ["w01", W01BASE, ["W01-O1", "W01-O2", "W01-O3", "W01-O4"], 40],
  ]) {
    await withFixture({ width: 1440, height: 900 }, base, (fx) => {
      const w = W(fx);
      const row = 40;
      clearDeposits(w, 6, 16, row - 4, row + 4);
      setTiles(w, rect(6, 16, row - 4, row + 4), 1);
      setTiles(w, rect(8, 14, row - 1, row), 0);
      reveal(w, 3, 19, row - 6, row + 6);
      const spots = [[7, row], [15, row], [9, row + 1], [13, row + 1], [7, row - 1], [15, row - 1], [11, row - 2], [11, row + 1]];
      ids.forEach((id, k) => {
        const candidates = w.packages.filter((p) => p.itemId === id && p.status === "deposit" && (p.y < row - 6 || p.y > row + 6));
        for (const p of candidates.slice(0, 2)) {
          const [x, y] = spots.shift();
          p.x = x + 0.5; p.y = y + 0.5;
        }
      });
      fx.state.vehicle.x = 11.5;
      fx.state.vehicle.y = row + 1 - 0.36;
      fx.state.vehicle.energy = 10;
    }, async (page) => shot(page, `g07-${label}-ores-lit`));
  }
}

// G5: tall/wide desktop viewports at the surface; G6 phone DPR3; G9 damage
if (PART === "all" || PART === "viewports") {
  for (const vp of [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1280, height: 1024 }]) {
    const { context, page } = await open(vp);
    await advance(page, 600);
    await shot(page, `g05-surface-${vp.width}x${vp.height}`);
    await context.close();
  }
  {
    const { context, page } = await open({ width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await keys(page, ["ArrowDown"]);
    await advance(page, 4000);
    await keys(page, []);
    await advance(page, 600);
    await shot(page, "g06-phone-dpr3");
    await context.close();
  }
  await withFixture({ width: 1440, height: 900 }, W01BASE, (fx) => {
    const w = W(fx);
    reveal(w, 3, 17, 11, 27);
    setTiles(w, rect(9, 11, 19, 20), 0);
    fx.state.vehicle.x = 10.5;
    fx.state.vehicle.y = 21 - 0.36;
    fx.state.vehicle.hull = 1.2;
    fx.state.vehicle.energy = 10;
  }, async (page) => shot(page, "g09-damage-stage3"));
}
await browser.close();
await writeFile(`${OUT}/capture-meta-${PART}.json`, JSON.stringify(meta, null, 1));
console.log("done");
