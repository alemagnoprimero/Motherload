// Shared helpers for the menus/UI audit captures (read-only; writes only to this folder).
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
export {
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
import {
  advance,
  click,
  exportCheckpoint,
  freeze,
  importCheckpoint,
} from "/home/user/Motherload/scripts/campaign-smoke.mjs";

export const WORK =
  "/home/user/Motherload/docs/improvement-plan/work/menus";
export const SHOTS = WORK + "/shots";
export const BASE = "http://127.0.0.1:5186/?mode=campaign";
export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 393, height: 851 };
export const LANDSCAPE = { width: 844, height: 390 };
export const PHONE_OPTS = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(SHOTS, { recursive: true });

export async function launch() {
  return chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function open(browser, viewport, opts = {}, init) {
  const context = await browser.newContext({ viewport, ...opts });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/.test(m.text()))
      errors.push("console: " + m.text());
  });
  await page.goto(BASE);
  await page.waitForFunction(
    () => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
    null,
    { timeout: 30000 },
  );
  await delay(500);
  return { context, page, errors };
}

export async function shot(page, name, clip) {
  await page.screenshot({ path: SHOTS + "/" + name + ".png", ...(clip ? { clip } : {}) });
  console.log("shot", name);
  return SHOTS + "/" + name + ".png";
}

export async function start(page) {
  if (await page.locator("#campaign-start").isVisible())
    await click(page, "#campaign-start");
  await delay(400);
}

export async function resume(page) {
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open === "menu") await click(page, "#campaign-resume");
  await advance(page, 600);
}

/** Start, freeze, import a mutated checkpoint, resume. */
export async function withFixture(browser, viewport, mutate, opts = {}, init) {
  const session = await open(browser, viewport, opts, init);
  await start(session.page);
  await freeze(session.page);
  const cp = await exportCheckpoint(session.page, false);
  const fx = structuredClone(cp);
  mutate(fx);
  try {
    await importCheckpoint(session.page, fx);
  } catch (error) {
    const status = await session.page
      .locator("#campaign-save-status")
      .textContent()
      .catch(() => "?");
    await session.context.close();
    throw new Error("import failed; save status: " + status + " / " + error.message.slice(0, 120));
  }
  await resume(session.page);
  return { ...session, fx };
}

export const world = (fx) => fx.state.worlds[fx.state.currentWorld];
export function dockAt(fx) {
  fx.state.vehicle.x = 5.5;
  fx.state.vehicle.y = -0.36;
}
export function m1Complete(fx) {
  fx.state.progress.completed = [1];
  fx.state.progress.beacon = true;
  fx.state.progress.bankedOre = 3;
}

/** In-page: text, size and focus statistics for an open dialog. */
export async function measure(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { missing: sel };
    const shown = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (e.tagName === "DETAILS" && !e.open && e !== el) {
          // content inside a closed details (except its summary) is not rendered
          const summary = e.querySelector(":scope > summary");
          if (!summary || !summary.contains(el)) return false;
        }
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const opacity = (el) => {
      let o = 1;
      for (let e = el; e && e !== document.documentElement; e = e.parentElement)
        o *= Number(getComputedStyle(e).opacity);
      return Math.round(o * 100) / 100;
    };
    const leaves = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || !shown(el)) continue;
      const cs = getComputedStyle(el);
      leaves.push({
        text: text.slice(0, 70),
        words: text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
        size: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
        color: cs.color,
        family: cs.fontFamily,
        opacity: opacity(el),
        tag: el.tagName.toLowerCase(),
        cls: el.className && typeof el.className === "string" ? el.className : "",
      });
    }
    const sizeHist = {};
    const wordsBySize = {};
    for (const l of leaves) {
      sizeHist[l.size] = (sizeHist[l.size] || 0) + 1;
      wordsBySize[l.size] = (wordsBySize[l.size] || 0) + l.words;
    }
    const focusables = [
      ...root.querySelectorAll(
        'button, input, summary, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => shown(el) && !el.disabled);
    const disabledButtons = [...root.querySelectorAll("button")].filter(
      (el) => shown(el) && el.disabled,
    ).length;
    const scroller = [root, ...root.querySelectorAll("*")].find((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    const r = root.getBoundingClientRect();
    return {
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      scroller: scroller
        ? {
            id: scroller.id || scroller.tagName,
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
            screens: Math.round((scroller.scrollHeight / scroller.clientHeight) * 100) / 100,
          }
        : null,
      words: leaves.reduce((s, l) => s + l.words, 0),
      leaves: leaves.length,
      sizeHist,
      wordsBySize,
      wordsAtOrBelow12: leaves.filter((l) => l.size <= 12).reduce((s, l) => s + l.words, 0),
      families: [...new Set(leaves.map((l) => l.family))],
      colours: [...new Set(leaves.map((l) => l.color))].length,
      focusables: focusables.length,
      focusOrder: focusables.map(
        (el) =>
          (el.tagName === "INPUT" ? "[" + el.type + "] " : "") +
          (el.getAttribute("aria-label") || el.textContent || el.dataset.volume || el.dataset.setting || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 40),
      ),
      disabledButtons,
      lowOpacityLeaves: leaves.filter((l) => l.opacity < 0.6).map((l) => l.text + " @" + l.opacity),
    };
  }, selector);
}

export async function activeLabel(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (label ? " '" + label + "'" : "");
  });
}

export async function save(name, data) {
  await writeFile(WORK + "/" + name, JSON.stringify(data, null, 1));
  console.log("wrote", name);
}
