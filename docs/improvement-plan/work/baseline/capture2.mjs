// Second capture pass: lander construction stages, wreck POI, inspection.
import { mkdir } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
import {
  advance,
  click,
  exportCheckpoint,
  freeze,
  importCheckpoint,
  keys,
  tab,
} from "/home/user/Motherload/scripts/campaign-smoke.mjs";

const OUT = process.argv[2];
const BASE = "http://127.0.0.1:5173/?mode=campaign";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function open(viewport, opts = {}) {
  const context = await browser.newContext({ viewport, ...opts });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForFunction(
    () => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
    null, { timeout: 30000 },
  );
  if (await page.locator("#campaign-start").isVisible()) await click(page, "#campaign-start");
  await delay(400);
  await freeze(page);
  return { context, page };
}
async function shot(page, name) {
  await page.screenshot({ path: OUT + "/" + name + ".png" });
  log("shot", name);
}
async function resume(page) {
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open === "menu") await click(page, "#campaign-resume");
  await advance(page, 800);
}
async function withFixture(viewport, mutate, after, opts) {
  const { context, page } = await open(viewport, opts);
  const cp = await exportCheckpoint(page, false);
  const fx = structuredClone(cp);
  mutate(fx);
  await importCheckpoint(page, fx);
  await resume(page);
  await after(page, fx);
  await context.close();
}
const W = (fx) => fx.state.worlds[fx.state.currentWorld];

// Lander stages 0..3 at the dock
for (const stage of [0, 1, 2, 3]) {
  await withFixture({ width: 1440, height: 900 }, (fx) => {
    fx.state.vehicle.x = 5.5; fx.state.vehicle.y = -0.36;
    fx.state.credits = 25000;
    const done = [1, 2, 3].slice(0, stage);
    fx.state.progress.completed = done;
    if (stage >= 1) { fx.state.progress.beacon = true; fx.state.progress.bankedOre = 3; }
    if (stage >= 2) for (const m of W(fx).missions) if (/valve|antenna/i.test(m.id)) m.status = "banked";
    if (stage >= 3) { for (const m of W(fx).missions) m.status = "banked"; fx.state.progress.unlockedWorlds = ["W01", "W02", "W03"]; }
  }, async (page) => {
    await shot(page, "e0" + stage + "-lander-stage-" + stage);
    if (stage === 1) {
      await page.keyboard.press("e");
      await delay(400);
      await tab(page, "hardware");
      await shot(page, "e05-dock-hardware-unlocked");
      await tab(page, "tools");
      await shot(page, "e06-dock-tools-unlocked");
      await tab(page, "lander");
      await shot(page, "e07-dock-lander-stage1");
    }
  });
}

// Wreck POI: place rig near beacon, reveal surroundings
await withFixture({ width: 1440, height: 900 }, (fx) => {
  const w = W(fx);
  const beacon = w.missions.find((m) => /beacon|survey/i.test(m.id)) || w.missions[0];
  log("mission ids", w.missions.map((m) => m.id + "@" + m.x + "," + m.y + ":" + m.status).join(" | "));
  const bx = Math.floor(beacon.x), by = Math.floor(beacon.y);
  for (let y = by - 4; y <= by + 1; y++) for (let x = bx - 3; x <= bx + 3; x++) {
    if (y < 0 || y >= w.rows) continue;
    const i = y * w.width + ((x % w.width) + w.width) % w.width;
    w.discovered[i] = 1;
  }
  for (let y = by - 3; y <= by - 1; y++) for (let x = bx - 2; x <= bx - 1; x++) {
    const i = y * w.width + ((x % w.width) + w.width) % w.width; w.tiles[i] = 0;
  }
  fx.state.vehicle.x = bx - 1.5; fx.state.vehicle.y = by - 1 - 0.36;
}, async (page) => { await shot(page, "e08-wreck-poi"); });

// Inspection tap on a mineral near start (touch portrait)
{
  const { context, page } = await open({ width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await advance(page, 500);
  const pt = await page.locator("#campaign-game").evaluate((el) => ({ x: Number(el.dataset.rigScreenX), y: Number(el.dataset.rigScreenY) }));
  await page.touchscreen.tap(pt.x + 40, pt.y + 60);
  await advance(page, 300);
  await shot(page, "e09-portrait-tap-inspect");
  await context.close();
}
await browser.close();
log("done");
