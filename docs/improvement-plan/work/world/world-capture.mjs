// World-design audit captures: hidden cave beside the mission shaft (fog vs
// revealed), shelf before/after its warning, relic exposure message, W02 vent
// and cold pocket in context. Usage:
//   cd /home/user/Motherload && node <this file> <outDir> <baseUrl>
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
const BASE = (process.argv[3] || "http://127.0.0.1:5197") + "/?mode=campaign";
const SHOTS =
  "/home/user/Motherload/docs/improvement-plan/shots";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const log = (...a) => console.log(...a);

async function open(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForFunction(
    () => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
    null,
    { timeout: 45000 },
  );
  if (await page.locator("#campaign-start").isVisible()) await click(page, "#campaign-start");
  await delay(300);
  await freeze(page);
  return { context, page };
}
async function shot(page, name) {
  await advance(page, 600);
  await page.screenshot({ path: OUT + "/" + name + ".png" });
  log("shot", name);
}
async function resume(page) {
  const overlay = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (overlay === "menu") await click(page, "#campaign-resume");
  await advance(page, 700);
}
const W = (fx) => fx.state.worlds[fx.state.currentWorld];
const idx = (w, c, r) => r * w.width + (((c % w.width) + w.width) % w.width);
/** Excavate a cell and retire any deposit inside it so the save stays valid. */
function dig(w, c, r) {
  const k = idx(w, c, r);
  w.tiles[k] = 0;
  for (const p of w.packages)
    if (
      p.status === "deposit" &&
      Math.floor(p.x) === (((c % w.width) + w.width) % w.width) &&
      Math.floor(p.y) === r
    )
      p.status = "sold";
}
function reveal(w, c0, c1, r0, r1) {
  for (let r = Math.max(0, r0); r <= Math.min(w.rows - 1, r1); r++)
    for (let c = c0; c <= c1; c++) w.discovered[idx(w, c, r)] = 1;
}
async function fixture(viewport, base, mutate, after) {
  const { context, page } = await open(viewport);
  const cp = base ? structuredClone(base) : await exportCheckpoint(page, false);
  const fx = structuredClone(cp);
  const info = mutate(fx);
  await importCheckpoint(page, fx);
  await resume(page);
  await after(page, fx, info);
  await context.close();
}
const VIEW = { width: 1440, height: 900 };

// (a) Mission shaft beside a hidden cave: fog view, then the same spot revealed.
let shaftInfo;
for (const revealed of [false, true]) {
  await fixture(
    VIEW,
    null,
    (fx) => {
      const w = W(fx);
      // choose the shallowest row >= 12 with air within 3-4 columns of column 20
      let row = 14;
      for (let r = 12; r < 40; r++)
        if ([16, 17, 24, 25].some((c) => w.tiles[idx(w, c, r)] === 0)) {
          row = r;
          break;
        }
      for (let r = 0; r <= row; r++) dig(w, 20, r);
      for (let r = 0; r <= row; r++) reveal(w, 19, 21, r, r);
      if (revealed) reveal(w, 8, 32, row - 6, row + 6);
      fx.state.vehicle.x = 20.5;
      fx.state.vehicle.y = row + 1 - 0.36;
      fx.state.vehicle.energy = 6;
      shaftInfo = { row, depth: (row + 1) * 10 };
      return shaftInfo;
    },
    async (page, fx, info) => {
      await shot(page, revealed ? "w01-shaft-same-spot-revealed" : "w01-shaft-hidden-cave-fog");
      results.shaft = info;
    },
  );
}

// (b) Brittle shelf: the same cell before its trigger and during the warning.
for (const trigger of [false, true]) {
  await fixture(
    VIEW,
    null,
    (fx) => {
      const w = W(fx);
      const shelf = w.shelves[0];
      const sc = Math.floor(shelf.x),
        sr = Math.floor(shelf.y);
      reveal(w, sc - 7, sc + 9, sr - 4, sr + 4);
      if (trigger) {
        fx.state.vehicle.x = sc + 0.5;
        fx.state.vehicle.y = sr + 2 - 0.36;
      } else {
        // stand in a dug pocket four cells to the right, on solid floor
        dig(w, sc + 4, sr + 1);
        if (w.tiles[idx(w, sc + 4, sr + 2)] === 0) w.tiles[idx(w, sc + 4, sr + 2)] = 1;
        fx.state.vehicle.x = sc + 4.5;
        fx.state.vehicle.y = sr + 2 - 0.36;
      }
      return { shelf: [sc, sr] };
    },
    async (page, fx, info) => {
      if (trigger) await advance(page, 400);
      await shot(page, trigger ? "w01-shelf-warning" : "w01-shelf-before-trigger");
      results["shelf" + (trigger ? "Warning" : "Before")] = {
        ...info,
        message: await page.evaluate(() => document.querySelector("#campaign-message")?.textContent ?? ""),
      };
    },
  );
}

// (c) Relic: a relic deposit directly below the rig, then cut into it.
await fixture(
  VIEW,
  null,
  (fx) => {
    const w = W(fx);
    // shaft to row 20, relic at row 21 under the rig
    for (let r = 0; r <= 20; r++) dig(w, 20, r);
    reveal(w, 15, 25, 14, 24);
    const k = idx(w, 20, 21);
    w.tiles[k] = 1;
    for (const p of w.packages) if (p.status === "deposit" && Math.floor(p.x) === 20 && Math.floor(p.y) === 21) p.status = "sold";
    let relic = w.packages.find((p) => p.tags.includes("relic") && p.status === "deposit");
    if (!relic) {
      relic = {
        id: "W01:relic:1",
        itemId: "W01-J",
        name: "Broken asteroid relic",
        origin: "W01",
        balanceVersion: "0.1",
        value: 7500,
        bulk: 2,
        mass: 2.5,
        tags: ["relic"],
        x: 20.5,
        y: 21.5,
        status: "deposit",
        processedBy: [],
      };
      w.packages.push(relic);
    } else {
      relic.x = 20.5;
      relic.y = 21.5;
    }
    fx.state.vehicle.x = 20.5;
    fx.state.vehicle.y = 21 - 0.36;
    fx.state.vehicle.energy = 6;
    return {};
  },
  async (page) => {
    await shot(page, "w01-relic-in-wall");
    await keys(page, ["ArrowDown"]);
    let message = "";
    for (let i = 0; i < 12; i++) {
      await advance(page, 250);
      message = await page.evaluate(() => {
        const el = document.querySelector("#campaign-game");
        return (
          document.querySelector("#campaign-message")?.textContent ||
          el?.dataset.campaignMessage ||
          ""
        );
      });
      if (/relic/i.test(message)) break;
    }
    await keys(page, []);
    await page.screenshot({ path: OUT + "/w01-relic-exposed.png" });
    results.relicMessage = message;
    // Collect it and check the pickup cue
    await advance(page, 900);
    await page.screenshot({ path: OUT + "/w01-relic-collected.png" });
    results.relicPickup = await page.evaluate(
      () => document.querySelector("#campaign-message")?.textContent ?? "",
    );
  },
);

// (d) W02 vent and cold pocket in context (fixture from the baseline W02 checkpoint).
const w02 = JSON.parse(await readFile(SHOTS + "/checkpoint-w02.json", "utf8"));
for (const [name, hx, hy] of [
  ["w02-vent-pocket", 8.5, 48.5],
  ["w02-cold-pocket", 10.5, 28.5],
]) {
  await fixture(
    VIEW,
    w02,
    (fx) => {
      const w = W(fx);
      const c = Math.floor(hx),
        r = Math.floor(hy);
      reveal(w, c - 9, c + 9, r - 6, r + 6);
      // rig stands in a dug cell 3 columns right of the pocket, on solid floor
      dig(w, c + 3, r + 1);
      if (w.tiles[idx(w, c + 3, r + 2)] === 0) w.tiles[idx(w, c + 3, r + 2)] = 1;
      fx.state.vehicle.x = c + 3.5;
      fx.state.vehicle.y = r + 2 - 0.36;
      return { hazard: [hx, hy] };
    },
    async (page) => {
      await shot(page, name);
    },
  );
}

await writeFile(OUT + "/world-capture-results.json", JSON.stringify(results, null, 1));
await browser.close();
log("done", JSON.stringify(results));
