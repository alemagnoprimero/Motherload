// Shared playtest harness for the first-session audit (read-only use of the game).
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

export const WORK =
  "/home/user/Motherload/docs/improvement-plan/work/first-session";
export const SHOTS = WORK + "/shots";
export const BASE = process.env.BASE || "http://127.0.0.1:5173/?mode=campaign";
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export { advance, click, closeOverlay, exportCheckpoint, freeze, importCheckpoint, keys, menu, tab };

export async function launch() {
  await mkdir(SHOTS, { recursive: true });
  return chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/** A playtest session: tracks game time (ms advanced since deploy) and a friction log. */
export class Session {
  constructor(name, browser, viewport, opts = {}) {
    this.name = name;
    this.browser = browser;
    this.viewport = viewport;
    this.opts = opts;
    this.t = 0;
    this.log = [];
    this.last = {};
    this.errors = [];
    this.marks = {};
  }
  async open() {
    this.context = await this.browser.newContext({ viewport: this.viewport, ...this.opts });
    this.page = await this.context.newPage();
    this.page.on("pageerror", (e) => this.errors.push(e.message));
    this.page.on("console", (m) => {
      if (m.type() === "error") this.errors.push("console: " + m.text());
    });
    await this.page.goto(BASE);
    await this.page.waitForFunction(
      () => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
      null,
      { timeout: 30000 },
    );
    await delay(500);
    if (this.opts.hasTouch) this.cdp = await this.context.newCDPSession(this.page);
    return this;
  }
  async deploy() {
    await click(this.page, "#campaign-start");
    await delay(300);
    await freeze(this.page);
    this.t = 0;
    await this.observe("deploy");
  }
  async shot(label) {
    const file = `${this.name}-${String(Math.round(this.t / 100) / 10).padStart(5, "0")}s-${label}.png`;
    await this.page.screenshot({ path: SHOTS + "/" + file });
    this.note("SHOT " + file);
    return file;
  }
  note(text) {
    this.log.push({ t: Math.round(this.t) / 1000, text });
  }
  mark(key) {
    if (!(key in this.marks)) {
      this.marks[key] = Math.round(this.t) / 1000;
      this.note("MARK " + key);
    }
  }
  async hud() {
    return this.page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const txt = (s) => (q(s)?.textContent ?? "").trim();
      const game = q("#campaign-game");
      return {
        energy: txt("#campaign-energy"),
        hull: txt("#campaign-hull"),
        depth: txt("#campaign-depth"),
        cargo: txt("#campaign-cargo"),
        haul: txt("#campaign-haul"),
        credits: txt("#campaign-credits"),
        message: q("#campaign-message")?.classList.contains("visible") ? txt("#campaign-message") : "",
        danger: q("#campaign-danger")?.hidden ? "" : txt("#campaign-danger"),
        disabled: !q("#campaign-disabled")?.hidden,
        objective: txt("#campaign-objective-step") + " " + txt("#campaign-objective-title"),
        tasks: [...document.querySelectorAll("#campaign-objective-progress li")].map((li) => li.textContent.trim()).join(" | "),
        next: txt("#campaign-objective-next"),
        signal: q("#campaign-mission-signal")?.hidden ? "" : txt("#campaign-mission-signal").replace(/\s+/g, " "),
        dockPrompt: !q("#campaign-dock-toggle")?.hidden,
        overlay: document.body.dataset.campaignOverlay || "",
        callout: game?.dataset.inspection || "",
        rigX: Number(game?.dataset.rigWorldX),
        rigY: Number(game?.dataset.rigWorldY),
        rigScreenX: Number(game?.dataset.rigScreenX),
        rigScreenY: Number(game?.dataset.rigScreenY),
        extraction: q("#campaign-extraction")?.hidden ? "" : txt("#campaign-extraction"),
      };
    });
  }
  /** Read the HUD and log any player-visible change. */
  async observe(context = "") {
    const h = await this.hud();
    for (const key of ["message", "danger", "objective", "tasks", "next", "signal", "dockPrompt", "overlay", "callout", "disabled", "extraction"]) {
      if (JSON.stringify(h[key]) !== JSON.stringify(this.last[key])) {
        if (h[key] !== "" && h[key] !== false || this.last[key] !== undefined)
          this.note(`${key}: ${JSON.stringify(h[key])}${context ? " (" + context + ")" : ""}`);
      }
    }
    this.last = h;
    return h;
  }
  /** Hold the given keys for ms (in steps of `step`), observing after each step. */
  async hold(controls, ms, step = 250, stop) {
    await keys(this.page, controls);
    for (let done = 0; done < ms; done += step) {
      const chunk = Math.min(step, ms - done);
      await advance(this.page, chunk);
      this.t += chunk;
      const h = await this.observe(controls.join("+") || "idle");
      if (stop && (await stop(h))) {
        await keys(this.page, []);
        return h;
      }
    }
    await keys(this.page, []);
    return this.last;
  }
  async idle(ms, step = 250) {
    return this.hold([], ms, step);
  }
  vitals() {
    const h = this.last;
    return `E ${h.energy} H ${h.hull} D ${h.depth} C ${h.cargo} haul ${h.haul} CR ${h.credits}`;
  }
  async save() {
    await writeFile(
      `${WORK}/${this.name}-log.json`,
      JSON.stringify({ name: this.name, viewport: this.viewport, marks: this.marks, errors: this.errors, log: this.log }, null, 1),
    );
    const text = this.log.map((l) => `${l.t.toFixed(2).padStart(7)}s  ${l.text}`).join("\n");
    await writeFile(`${WORK}/${this.name}-log.txt`, text + "\n\nMARKS " + JSON.stringify(this.marks) + "\nERRORS " + JSON.stringify(this.errors) + "\n");
  }
  async close() {
    await this.save();
    await this.context.close();
  }
}

export const energyOf = (h) => Number(String(h.energy).split("/")[0]);
export const depthOf = (h) => Number(String(h.depth).replace(/[^0-9.]/g, ""));
export const cargoOf = (h) => Number(String(h.cargo).split("/")[0]);
