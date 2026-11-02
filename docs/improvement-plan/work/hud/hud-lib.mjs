// Shared helpers for the HUD audit captures (read-only; never touches the repo).
import { writeFile } from "node:fs/promises";
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
} from "/home/user/Motherload/scripts/campaign-smoke.mjs";

export const ROOT =
  "/home/user/Motherload/docs/improvement-plan/work/hud";
export const SHOTS = ROOT + "/shots";
export const DATA = ROOT + "/data";
export const BASE = process.env.HUD_URL || "http://127.0.0.1:5173/?mode=campaign";
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export { advance, click, closeOverlay, exportCheckpoint, freeze, importCheckpoint, keys, menu };

export const VIEWPORTS = {
  desktop: [{ width: 1440, height: 900 }, {}],
  portrait: [{ width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  landscape: [{ width: 844, height: 390 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  small: [{ width: 568, height: 320 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
};

export async function launch() {
  return chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function open(browser, kind, { start = true, prefs } = {}) {
  const [viewport, opts] = VIEWPORTS[kind];
  const context = await browser.newContext({ viewport, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (prefs)
    await page.addInitScript((value) => {
      localStorage.setItem("motherload.campaign.preferences.v1", JSON.stringify(value));
    }, prefs);
  await page.goto(BASE);
  await page.waitForFunction(
    () => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
    null,
    { timeout: 30000 },
  );
  await delay(500);
  if (start && (await page.locator("#campaign-start").isVisible()))
    await click(page, "#campaign-start");
  await delay(300);
  await freeze(page);
  await advance(page, 600);
  return { context, page, errors, viewport };
}

export async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log("shot", name);
  return `${SHOTS}/${name}.png`;
}

const HUD_SELECTORS = [
  ".campaign-hud",
  ".campaign-objective",
  ".campaign-toolbar",
  "#campaign-menu-toggle",
  "#campaign-message",
  "#campaign-danger",
  "#campaign-extraction",
  "#campaign-dock-toggle",
  "#campaign-disabled",
  ".campaign-touch",
];

/** Screenshot the same frozen frame without DOM HUD (canvas does not re-render). */
export async function shotHudOff(page, name) {
  await page.evaluate((selectors) => {
    let style = document.getElementById("hud-off-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "hud-off-style";
      document.head.append(style);
    }
    style.textContent = selectors.join(",") + "{visibility:hidden !important;opacity:0 !important}";
  }, HUD_SELECTORS);
  const path = await shot(page, name);
  await page.evaluate(() => document.getElementById("hud-off-style")?.remove());
  return path;
}

/** Boxes, fonts and colours of every visible HUD element and text leaf. */
export async function probe(page) {
  return page.evaluate(() => {
    const named = {
      hud: ".campaign-hud",
      energyVital: ".energy-vital",
      hullVital: ".hull-vital",
      energyValue: "#campaign-energy",
      hullValue: "#campaign-hull",
      energyMeter: ".energy-meter",
      hullMeter: ".hull-meter",
      rightCluster: ".instrument-right",
      depth: "#campaign-depth",
      cargo: "#campaign-cargo",
      haul: "#campaign-haul",
      credits: "#campaign-credits",
      objective: ".campaign-objective",
      objectiveTitle: "#campaign-objective-title",
      tasks: "#campaign-objective-progress",
      signal: "#campaign-mission-signal",
      next: "#campaign-objective-next",
      reward: "#campaign-objective-reward",
      toolbar: ".campaign-toolbar",
      drillSlot: ".drill-slot",
      feet: "#campaign-feet-button",
      precision: "#campaign-precision-button",
      map: "#campaign-map-toggle",
      menuButton: "#campaign-menu-toggle",
      message: "#campaign-message",
      danger: "#campaign-danger",
      extraction: "#campaign-extraction",
      release: "#campaign-release-drill",
      dockPrompt: "#campaign-dock-toggle",
      disabled: "#campaign-disabled",
    };
    const visible = (el) => {
      if (!el) return false;
      if (el.closest("[hidden]")) return false;
      let node = el;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
        node = node.parentElement;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const out = { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, named: {}, leaves: [] };
    for (const [key, selector] of Object.entries(named)) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out.named[key] = {
        visible: visible(el),
        box: box(el),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        background: cs.backgroundColor,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
      };
    }
    const roots = document.querySelectorAll(
      ".campaign-hud, .campaign-objective, .campaign-toolbar, #campaign-message, #campaign-danger, #campaign-extraction, #campaign-dock-toggle",
    );
    for (const root of roots)
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(" ")
          .trim();
        if (!own || !visible(el) || el.classList.contains("sr-only")) continue;
        const cs = getComputedStyle(el);
        // Tight text box via a Range over the text nodes.
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        const r = rects.length
          ? rects.reduce(
              (a, b) => ({
                left: Math.min(a.left, b.left),
                top: Math.min(a.top, b.top),
                right: Math.max(a.right, b.right),
                bottom: Math.max(a.bottom, b.bottom),
              }),
              { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 },
            )
          : el.getBoundingClientRect();
        out.leaves.push({
          id: el.id || el.className || el.tagName,
          root: root.id || root.className,
          text: own.slice(0, 80),
          fontSize: parseFloat(cs.fontSize),
          fontWeight: cs.fontWeight,
          color: cs.color,
          box: { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top },
        });
      }
    const host = document.querySelector("#campaign-game");
    out.game = { ...host.dataset };
    const canvas = host.querySelector("canvas");
    out.canvas = canvas
      ? { width: canvas.width, height: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight }
      : null;
    out.body = { ...document.body.dataset, classes: document.body.className };
    return out;
  });
}

export async function save(name, value) {
  await writeFile(`${DATA}/${name}.json`, JSON.stringify(value, null, 1));
  console.log("data", name);
}

export const world = (fx) => fx.state.worlds[fx.state.currentWorld];
export const indexOf = (mine, x, y) =>
  Math.floor(y) * mine.width + (((Math.floor(x) % mine.width) + mine.width) % mine.width);
export function clearCell(fx, x, y) {
  const mine = world(fx);
  if (y < 0 || y >= mine.rows) return;
  const index = indexOf(mine, x, y);
  mine.tiles[index] = 0;
  for (const item of mine.packages)
    if (item.status === "deposit" && indexOf(mine, item.x, item.y) === index) item.status = "exposed";
}
/** Park the rig on top of cell (x, y) inside a small cleared pocket. */
export function parkAbove(fx, x, y, { energy, hull, reveal = 3 } = {}) {
  const mine = world(fx);
  fx.state.vehicle.x = Math.floor(x) + 0.5;
  fx.state.vehicle.y = Math.floor(y) - 0.36;
  if (energy !== undefined) fx.state.vehicle.energy = energy;
  if (hull !== undefined) fx.state.vehicle.hull = hull;
  delete mine.volatile;
  for (let cx = Math.floor(x) - 1; cx <= Math.floor(x) + 1; cx++)
    for (let cy = Math.floor(y) - 2; cy < Math.floor(y); cy++) clearCell(fx, cx, cy);
  for (let cy = Math.floor(y) - reveal; cy <= Math.floor(y) + reveal; cy++)
    for (let cx = Math.floor(x) - reveal; cx <= Math.floor(x) + reveal; cx++)
      if (cy >= 0 && cy < mine.rows) mine.discovered[indexOf(mine, cx, cy)] = 1;
}

export async function loadFixture(page, fixture) {
  await keys(page, []);
  await importCheckpoint(page, fixture);
  const overlay = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (overlay === "menu") await click(page, "#campaign-resume");
  await delay(150);
  await advance(page, 200);
}

/** Sample HUD state text quickly (for message/danger timelines). */
export async function hudState(page) {
  return page.evaluate(() => ({
    energy: document.querySelector("#campaign-energy").textContent,
    hull: document.querySelector("#campaign-hull").textContent,
    cargo: document.querySelector("#campaign-cargo").textContent,
    depth: document.querySelector("#campaign-depth").textContent,
    danger: document.querySelector("#campaign-danger").hidden ? "" : document.querySelector("#campaign-danger").textContent,
    message: document.querySelector("#campaign-message").textContent,
    messageVisible:
      document.querySelector("#campaign-message").classList.contains("visible") &&
      getComputedStyle(document.querySelector("#campaign-message")).visibility !== "hidden",
    energyCritical: document.querySelector(".instrument-left").classList.contains("critical"),
    extraction: document.querySelector("#campaign-extraction").hidden
      ? ""
      : document.querySelector("#campaign-extraction-title").textContent,
    disabled: document.body.dataset.campaignDisabled,
    next: document.querySelector("#campaign-objective-next").textContent,
    signal: document.querySelector("#campaign-mission-signal").hidden
      ? ""
      : document.querySelector("#campaign-mission-signal").textContent,
  }));
}
