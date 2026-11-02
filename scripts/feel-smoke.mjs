import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  exportCheckpoint,
  freeze,
  idle,
  importCheckpoint,
  menu,
  pauseSection,
} from "./campaign-smoke.mjs";

const forms = [
  ["desktop", { width: 1440, height: 900 }, 2, false],
  ["portrait", { width: 393, height: 851 }, 3, true],
  ["landscape", { width: 844, height: 390 }, 2, true],
  ["small", { width: 568, height: 320 }, 2, true],
];

async function boot(browser, base, renderer, viewport, dpr, touch) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    isMobile: touch,
    hasTouch: touch,
  });
  await context.addInitScript(() => {
    const Original = window.AudioContext;
    window.__measuredAudio = [];
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__measuredAudio.push(this);
      }
    };
  });
  const page = await context.newPage();
  const faults = [];
  page.on("pageerror", (error) => faults.push(error.message));
  const url = new URL(base);
  url.searchParams.set("renderer", renderer);
  await page.goto(url.href);
  await page.waitForFunction(
    () =>
      document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
  );
  await click(page, "#campaign-start");
  await idle(page);
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#campaign-game")?.dataset.viewSnapshot),
  );
  return { context, page, faults };
}

function checkBox(box, viewport, label) {
  assert.ok(box.width > 0 && box.height > 0, label + " is visible");
  assert.ok(
    box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    label + " remains inside the viewport",
  );
}

async function measure(page) {
  return page.evaluate(() => {
    const host = document.querySelector("#campaign-game"),
      canvas = host.querySelector("canvas");
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const visible = (element) => {
      if (!element || element.closest("[hidden],.sr-only")) return false;
      for (let node = element; node; node = node.parentElement) {
        const css = getComputedStyle(node),
          rect = node.getBoundingClientRect();
        if (
          css.display === "none" ||
          css.visibility === "hidden" ||
          Number(css.opacity) === 0
        )
          return false;
        if (rect.width <= 1 && rect.height <= 1 && css.overflow === "hidden")
          return false;
      }
      return element.getBoundingClientRect().width > 0;
    };
    const roots = [
      ...document.querySelectorAll(
        ".campaign-hud,.campaign-objective,.campaign-toolbar,#campaign-coach,#campaign-return,#campaign-message,#campaign-danger",
      ),
    ].filter(visible);
    const sizes = [];
    for (const root of roots)
      for (const element of [root, ...root.querySelectorAll("*")]) {
        if (!visible(element)) continue;
        for (const node of element.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim())
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width && rect.height)
            sizes.push({
              text: node.textContent.trim(),
              size: parseFloat(getComputedStyle(element).fontSize),
            });
        }
      }
    const text = sizes
      .map((entry) => entry.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const values = [
      "campaign-energy",
      "campaign-hull",
      "campaign-cargo",
      "campaign-credits",
      "campaign-depth",
    ].map((id) => {
      const element = document.getElementById(id);
      return {
        id,
        box: box(element),
        visible: visible(element),
        font: parseFloat(getComputedStyle(element).fontSize),
      };
    });
    return {
      view: JSON.parse(host.dataset.viewSnapshot),
      renderer: host.dataset.renderer,
      canvas: { width: canvas.width, height: canvas.height, box: box(canvas) },
      particles: Number(host.dataset.activeParticles || 0),
      textureBytes: Number(host.dataset.residentTextureBytes || 0),
      scrollHeight: document.documentElement.scrollHeight,
      values,
      sizes,
      words: text ? text.split(" ").length : 0,
      visibleText: text,
      coaching: visible(document.querySelector("#campaign-coach")),
      audio: window.__measuredAudio.map((context) => context.state),
      labels: [...document.querySelectorAll(".world-beacon")]
        .filter(visible)
        .map((element) => ({
          id: element.id,
          text: element.textContent,
          box: box(element),
        })),
    };
  });
}

export async function runFeelSmoke(browser, base, output) {
  await mkdir(output, { recursive: true });
  const results = [];
  const renderers = (process.env.FEEL_RENDERERS || "webgl,canvas").split(",");
  const selectedForms = (
    process.env.FEEL_FORMS || "desktop,portrait,landscape,small"
  ).split(",");
  for (const renderer of renderers)
    for (const [name, viewport, dpr, touch] of forms.filter(([name]) =>
      selectedForms.includes(name),
    )) {
      const { context, page, faults } = await boot(
        browser,
        base,
        renderer,
        viewport,
        dpr,
        touch,
      );
      try {
        const first = await measure(page);
        await writeFile(
          `${output}/${renderer}-${name}-first.json`,
          JSON.stringify(first, null, 2),
        );
        await page.screenshot({
          path: `${output}/${renderer}-${name}-first.png`,
        });
        assert.equal(
          first.renderer,
          renderer,
          "The requested renderer is actually active",
        );
        assert.equal(
          first.canvas.width,
          Math.round(viewport.width * first.view.dpr),
        );
        assert.equal(
          first.canvas.height,
          Math.round(viewport.height * first.view.dpr),
        );
        assert.ok(first.view.dpr >= 1 && first.view.dpr <= Math.min(dpr, 2));
        if (touch)
          assert.ok(
            first.textureBytes > 0 && first.textureBytes <= 20 * 1024 * 1024,
            `Touch boot textures use ${(first.textureBytes / 1024 / 1024).toFixed(2)} MiB (limit20)`,
          );
        assert.ok(
          first.scrollHeight <= viewport.height + 1,
          "Gameplay needs no page scrolling",
        );
        for (const value of first.values) {
          assert.ok(value.visible, value.id + " is visible");
          checkBox(value.box, viewport, value.id);
          assert.ok(value.font >= 18, value.id + " has at least 18px values");
        }
        for (const text of first.sizes)
          assert.ok(
            text.size >= 12,
            `${text.text}: ${text.size}px is below 12px`,
          );
        assert.ok(
          first.words <= (first.coaching ? 40 : 25),
          `First-frame word count ${first.words} exceeds the HUD budget`,
        );
        assert.ok(
          first.audio.includes("running"),
          "Audio unlocks on the first native Deploy click",
        );
        await page.screenshot({
          path: `${output}/${renderer}-${name}-first.png`,
        });
        await freeze(page);
        const checkpoint = await exportCheckpoint(page);
        const mine = checkpoint.state.worlds[checkpoint.state.currentWorld];
        checkpoint.state.vehicle.x = 20.5;
        checkpoint.state.vehicle.y = 19.64;
        checkpoint.state.vehicle.energy = 9;
        for (let row = 0; row < 20; row++)
          mine.tiles[row * mine.width + 20] = 0;
        for (const item of mine.packages)
          if (
            item.status === "deposit" &&
            Math.floor(item.x) === 20 &&
            item.y < 20
          )
            item.status = "exposed";
        await importCheckpoint(page, checkpoint);
        await closeOverlay(page);
        await advance(page, 100);
        const deep = await measure(page);
        if (touch)
          assert.ok(
            deep.textureBytes > 0 && deep.textureBytes <= 40 * 1024 * 1024,
            `Touch world textures use ${(deep.textureBytes / 1024 / 1024).toFixed(2)} MiB (limit40)`,
          );
        const home = deep.labels.find(
          (label) => label.id === "campaign-home-beacon",
        );
        assert.ok(home, "The home beacon remains visible at 200m");
        const meters = Number(home.text.match(/(\d+)\s*m/)?.[1]);
        const expected = Math.round(Math.hypot(15, 20.64) * 10);
        assert.ok(
          Math.abs(meters - expected) <= 10,
          "Home range stays within10m",
        );
        for (const label of deep.labels)
          checkBox(label.box, viewport, label.id);
        const clearRows =
          (viewport.height - deep.view.safe.top - deep.view.safe.bottom) /
          deep.view.tile;
        if (name !== "desktop")
          assert.ok(
            clearRows >=
              (name === "portrait" ? 6 : name === "landscape" ? 3.5 : 3),
            `${name} provides ${clearRows.toFixed(2)} clear rows`,
          );
        if (name === "portrait")
          assert.ok(
            deep.view.safe.top <= 150,
            "Portrait top band stays within150px",
          );
        await page.screenshot({
          path: `${output}/${renderer}-${name}-deep.png`,
        });
        await menu(page);
        await pauseSection(page, "systems");
        if (!(await page.locator('[data-setting="reducedMotion"]').isVisible()))
          await pauseSection(page, "settings");
        await page
          .locator('[data-setting="reducedMotion"]')
          .check({ force: true });
        await closeOverlay(page);
        await advance(page, 100);
        const reduced = await measure(page);
        assert.equal(
          reduced.particles,
          0,
          "Reduced motion has no debris particles",
        );
        assert.deepEqual(faults, [], "No uncaught runtime errors");
        results.push({ renderer, form: name, first, deep, reduced, clearRows });
        await writeFile(
          `${output}/results.json`,
          JSON.stringify(results, null, 2),
        );
        console.log(
          `PASS ${renderer}/${name}: DPR, HUD,200mbeacon, reduced motion, native audio`,
        );
      } finally {
        await context.close();
      }
    }
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    await runFeelSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.FEEL_ARTIFACTS || "artifacts/feel",
    );
  } finally {
    await browser.close();
  }
}
