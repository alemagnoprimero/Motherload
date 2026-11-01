import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-helpers.mjs";
import { campaignSafeArea, campaignTileSize } from "../src/campaign/layout.ts";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const destination = (base) => {
  const url = new URL(base);
  url.searchParams.set("mode", "campaign");
  return url.href;
};
const held = new WeakMap();
const clocked = new WeakSet();
const errors = new WeakMap();
const legacySentinel = "campaign-browser-qa-preserves-these-legacy-bytes";
async function click(page, selector) {
  const target = page.locator(selector);
  await target.evaluate((element) =>
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    }),
  );
  const hit = await target.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const top = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    return top === element || element.contains(top);
  });
  assert.equal(hit, true, selector + " receives native pointer input");
  await target.click({ force: clocked.has(page) });
}
async function idle(page) {
  for (let n = 0; n < 100; n++) {
    if (
      await page.evaluate(() => document.body.dataset.campaignBusy !== "true")
    )
      return;
    await delay(20);
  }
  throw new Error("Campaign persistence did not settle");
}
async function closeOverlay(page) {
  if (await page.locator("#campaign-confirm").evaluate((d) => d.open))
    throw new Error("Unexpected confirmation must be resolved explicitly");
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open && open !== "welcome")
    await click(page, "#campaign-" + open + ' [data-close="' + open + '"]');
}
async function menu(page) {
  const open = await page.evaluate(() => document.body.dataset.campaignOverlay);
  if (open === "menu") return;
  if (open) await closeOverlay(page);
  await click(page, "#campaign-menu-toggle");
}
async function exportCheckpoint(page, resume = false) {
  await menu(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    click(page, '#campaign-menu [data-command="export"]'),
  ]);
  const checkpoint = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(checkpoint.format, "motherload-campaign");
  if (resume) await closeOverlay(page);
  return checkpoint;
}
async function importCheckpoint(page, checkpoint) {
  await menu(page);
  await page.locator("#campaign-import").setInputFiles({
    name: "qa-campaign.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(checkpoint)),
  });
  await page.locator("#campaign-confirm").waitFor({ state: "visible" });
  await click(page, "#campaign-confirm-accept");
  for (
    let n = 0;
    n < 150 &&
    (await page.locator("#campaign-confirm").evaluate((d) => d.open));
    n++
  ) {
    const failure = await page.locator("#campaign-confirm-error").textContent();
    if (failure) throw new Error(failure);
    await delay(20);
  }
  await idle(page);
  assert.equal(
    await page.locator("#campaign-confirm").evaluate((d) => d.open),
    false,
    await page.locator("#campaign-confirm-error").textContent(),
  );
}
async function keys(page, next) {
  const previous = held.get(page) || [];
  for (const key of previous)
    if (!next.includes(key)) await page.keyboard.up(key);
  for (const key of next)
    if (!previous.includes(key)) await page.keyboard.down(key);
  held.set(page, next);
}
async function advance(page, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50)
    await page.clock.fastForward(Math.min(50, ms - elapsed));
}
async function freeze(page) {
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 300));
  clocked.add(page);
}
async function sample(page) {
  await keys(page, []);
  const checkpoint = await exportCheckpoint(page, true);
  held.set(page, []);
  return checkpoint.state;
}
async function until(page, controls, predicate, options = {}) {
  console.log(
    "Native motion target: " +
      (options.label || controls.join("+"))
        .replace(/^Unable to /i, "")
        .replace(/ failed$/i, ""),
  );
  const max = options.max || 40000,
    step = options.step || 500;
  let last;
  for (let elapsed = 0; elapsed <= max; elapsed += step) {
    last = await sample(page);
    if (predicate(last)) return last;
    await keys(page, controls);
    await advance(page, step);
  }
  throw new Error(
    (options.label || "Native motion condition failed") +
      ": " +
      JSON.stringify({
        vehicle: last.vehicle,
        progress: last.progress,
        cargo: last.worlds.W01.packages.filter((i) => i.status === "carried")
          .length,
      }),
  );
}
function delta(from, to) {
  return ((to - from + 60) % 40) - 20;
}
async function toColumn(page, column) {
  let previous;
  for (let n = 0; n < 180; n++) {
    const state = await sample(page),
      x = state.vehicle.x,
      d = delta(x, column + 0.5);
    const interval = previous ? state.elapsed - previous.elapsed : 0;
    const velocity = interval > 0 ? delta(previous.vehicle.x, x) / interval : 0;
    if (Math.abs(d) < 0.1 && Math.abs(velocity) < 0.45) return state;
    const desired = Math.max(-4, Math.min(4, d * 2.5));
    const correction = desired - velocity;
    await keys(
      page,
      correction < -0.2
        ? ["ArrowLeft"]
        : correction > 0.2
          ? ["ArrowRight"]
          : [],
    );
    previous = state;
    await advance(page, Math.abs(d) > 5 ? 300 : Math.abs(d) > 2 ? 100 : 25);
  }
  throw new Error("Unable to brake and align with starter column " + column);
}
async function dock(page) {
  await until(page, ["ArrowUp"], (s) => s.vehicle.y <= -0.36, {
    step: 250,
    max: 25000,
    label: "Unable to ascend through opened shaft",
  });
  for (let n = 0; n < 100; n++) {
    const state = await sample(page),
      d = delta(state.vehicle.x, 5.5);
    if (Math.abs(d) <= 1.15 && Math.abs(state.vehicle.y + 0.36) < 0.05) {
      await page.keyboard.press("e");
      assert.equal(
        await page.locator("#campaign-dock").evaluate((d) => d.open),
        true,
        "Native E opens the nearby lander",
      );
      await tab(page, "service");
      return state;
    }
    await keys(page, [d < 0 ? "ArrowLeft" : "ArrowRight"]);
    await advance(page, Math.abs(d) > 4 ? 500 : 100);
  }
  throw new Error("Unable to physically return and dock at the lander");
}
async function command(page, name) {
  const overlay = await page.evaluate(
    () => document.body.dataset.campaignOverlay,
  );
  const selector =
    (overlay ? "#campaign-" + overlay + " " : "") +
    '[data-command="' +
    name +
    '"]';
  assert.equal(
    await page.locator(selector).isEnabled(),
    true,
    name + " is an available UI action",
  );
  await click(page, selector);
  await idle(page);
  if (name === "load")
    await page.waitForFunction(() =>
      /loaded/i.test(
        document.querySelector("#campaign-save-status").textContent,
      ),
    );
}
async function tab(page, name) {
  await click(page, '#campaign-dock [data-tab="' + name + '"]');
}
async function ready(browser, base, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...options,
  });
  await context.addInitScript(
    (sentinel) => localStorage.setItem("motherload.frontier.v1", sentinel),
    legacySentinel,
  );
  const page = await context.newPage(),
    faults = [],
    assets = new Map();
  errors.set(page, faults);
  page.on("pageerror", (error) => faults.push(error.message));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (/w01-atlas.*\.(png|json)$/.test(path))
      assets.set(path.endsWith(".png") ? "png" : "json", response);
  });
  await page.goto(destination(base));
  await page.waitForFunction(
    () =>
      document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
  );
  if (await page.locator("#campaign-start").isVisible())
    await click(page, "#campaign-start");
  await idle(page);
  assert.equal(
    await page
      .locator("#campaign-game canvas")
      .getAttribute("data-campaign-art"),
    "ready",
  );
  for (const ext of ["png", "json"])
    assert.ok(
      assets.get(ext)?.ok(),
      "Actual campaign " + ext + " atlas response must load",
    );
  const atlas = await assets.get("json").json();
  for (const frame of [
    "rig-cabin",
    "rig-body-0",
    "ore-o1",
    "dock-stage-0",
    "crack-1",
    "mission-core",
  ])
    assert.ok(atlas.frames[frame], frame + " exists in delivered atlas");
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll(".campaign-hud img, .campaign-toolbar img"),
    ).every((image) => image.complete && image.naturalWidth > 0),
  );
  assert.equal(
    await page
      .locator(".drill-slot img")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
    "The active drill has a loaded game-art icon",
  );
  return { context, page, assets };
}
function noErrors(page) {
  assert.deepEqual(errors.get(page), [], "No uncaught browser errors");
}
function carried(state) {
  return state.worlds.W01.packages.filter((item) => item.status === "carried");
}
async function assertGeometry(page, viewport, touch = true) {
  const canvas = await page.locator("#campaign-game canvas").boundingBox();
  assert.deepEqual(
    { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
    { x: 0, y: 0, ...viewport },
    "The campaign fills the viewport",
  );
  for (const id of [
    "campaign-energy",
    "campaign-hull",
    "campaign-cargo",
    "campaign-credits",
    "campaign-depth",
    "campaign-haul",
    "campaign-drill-name",
  ])
    assert.equal(
      await page.locator("#" + id).isVisible(),
      true,
      id + " remains visible",
    );
  const sizes = await page
    .locator(
      "#campaign-haul, #campaign-drill-name, #campaign-energy, #campaign-hull, #campaign-cargo",
    )
    .evaluateAll((elements) =>
      elements.map((e) => ({
        id: e.id,
        size: parseFloat(getComputedStyle(e).fontSize),
      })),
    );
  for (const item of sizes)
    assert.ok(item.size >= 12, item.id + " retains readable 12px text");
  if (!touch) return;
  const buttons = await page
    .locator(".campaign-touch button")
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return { width: r.width, height: r.height, x: r.x, y: r.y };
      }),
    );
  for (const b of buttons)
    assert.ok(
      b.width >= 44 &&
        b.height >= 44 &&
        b.x >= 0 &&
        b.y >= 0 &&
        b.x + b.width <= viewport.width + 1 &&
        b.y + b.height <= viewport.height + 1,
      "Touch targets remain usable and within the viewport",
    );
}

async function rigPoint(page) {
  const point = await page.locator("#campaign-game").evaluate((element) => ({
    x: Number(element.dataset.rigScreenX),
    y: Number(element.dataset.rigScreenY),
  }));
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  return point;
}
async function pointerState(page) {
  return page.locator("#campaign-game").evaluate((element) => ({
    active: element.dataset.pointerActive === "true",
    directions: (element.dataset.pointerDirections || "")
      .split(",")
      .filter(Boolean),
  }));
}
async function assertMissionGeometry(page, viewport) {
  assert.equal(await page.locator(".campaign-objective").isVisible(), true);
  const layout = await page.evaluate(() => {
    const mission = document.querySelector(".campaign-objective");
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      mission: box(mission),
      controls: Array.from(
        document.querySelectorAll(
          ".campaign-hud, #campaign-menu-toggle, .campaign-toolbar, .campaign-touch button",
        ),
      )
        .filter((element) => element.checkVisibility())
        .map(box),
      tasks: Array.from(mission.querySelectorAll("[data-task]")).map(
        (element) => ({
          box: box(element),
          size: parseFloat(getComputedStyle(element).fontSize),
        }),
      ),
    };
  });
  const m = layout.mission;
  assert.ok(
    m.x >= 0 &&
      m.y >= 0 &&
      m.x + m.width <= viewport.width + 1 &&
      m.y + m.height <= viewport.height + 1,
    "Persistent mission stays inside viewport",
  );
  for (const control of layout.controls)
    assert.ok(
      m.x + m.width <= control.x + 1 ||
        control.x + control.width <= m.x + 1 ||
        m.y + m.height <= control.y + 1 ||
        control.y + control.height <= m.y + 1,
      "Mission checklist does not cover gauges or input controls",
    );
  for (const task of layout.tasks) {
    assert.ok(task.size >= 12, "Mission tasks retain readable 12px text");
    assert.ok(
      task.box.y + task.box.height <= m.y + m.height + 1,
      "Every task stays within the mission tracker",
    );
  }
}
async function missionStatus(page, task, status) {
  const row = page.locator(
    '#campaign-objective-progress [data-task="' + task + '"]',
  );
  assert.equal(
    await row.getAttribute("data-status"),
    status,
    task + " mission status",
  );
  return row.innerText();
}

export async function runCampaignInspectionSmoke(
  browser,
  base,
  path = "artifacts/campaign-inspection",
) {
  await mkdir("artifacts", { recursive: true });
  const checks = [];
  for (const [label, viewport] of [
    ["portrait", { width: 393, height: 851 }],
    ["landscape", { width: 568, height: 320 }],
  ]) {
    const { context, page } = await ready(browser, base, {
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    try {
      const fixture = await exportCheckpoint(page);
      fixture.state.vehicle = { ...fixture.state.vehicle, x: 20.5, y: -0.36 };
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await freeze(page);
      await advance(page, 100);
      const session = await context.newCDPSession(page);
      const { top, bottom } = campaignSafeArea(
        viewport.width,
        viewport.height,
        true,
      );
      const tile = campaignTileSize(viewport.width, viewport.height);
      const rigY = top + Math.max(100, viewport.height - top - bottom) * 0.46;
      const tap = async (x, y) => {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ id: 8, x, y }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await advance(page, 50);
      };
      // The cell behind the first wall must not become a mineral detector.
      await tap(viewport.width / 2 - 3 * tile, rigY + (1.5 + 0.36) * tile);
      assert.equal(
        await page.locator("#campaign-game").getAttribute("data-inspection"),
        "",
      );
      await tap(viewport.width / 2 + tile, rigY + (0.5 + 0.36) * tile);
      assert.match(
        await page.locator("#campaign-game").getAttribute("data-inspection"),
        /Ironium.*30.*1 bulk/,
      );
      assert.equal(
        await page.locator("#campaign-game").getAttribute("data-world-callout"),
        "true",
      );
      // Let the actual 160ms CSS toast fade settle before its static inspection check.
      await advance(page, 250);
      await delay(200);
      assert.equal(
        await page
          .locator("#campaign-message")
          .evaluate((e) => getComputedStyle(e).opacity),
        "0",
        "Inspection suppresses the overlapping toast",
      );
      const toolbar = await page.locator(".campaign-toolbar").boundingBox();
      const labelBottom =
        Math.max(top + 12, viewport.height - bottom - 44) + 28;
      assert.ok(
        labelBottom < toolbar.y,
        "The native mineral label stays above attachment controls",
      );
      await page.screenshot({ path: path + "-" + label + ".png" });
      noErrors(page);
      const name =
        "native " +
        label +
        " inspection reveals only visible minerals and stays clear of touch UI";
      checks.push(name);
      console.log("Passed: " + name);
    } finally {
      await context.close();
    }
  }
  return checks;
}

export async function runCampaignSmoke(
  browser,
  base,
  path = "artifacts/campaign-smoke",
  selection = process.env.CAMPAIGN_CHECKS || "all",
) {
  await mkdir("artifacts", { recursive: true });
  const checks = [];
  const check = (name) => {
    checks.push(name);
    console.log("Passed: " + name);
  };
  const chosen = (name) =>
    selection === "all" || selection.split(",").includes(name);
  let baseline;
  if (chosen("pointer")) {
    for (const [label, viewport, touch] of [
      ["desktop", { width: 1440, height: 900 }, false],
      ["portrait", { width: 393, height: 851 }, true],
      ["landscape", { width: 568, height: 320 }, true],
    ]) {
      const { context, page } = await ready(browser, base, {
        viewport,
        isMobile: touch,
        hasTouch: touch,
        deviceScaleFactor: 1,
      });
      try {
        await freeze(page);
        const initial = await exportCheckpoint(page, true);
        await advance(page, 200);
        const session = touch ? await context.newCDPSession(page) : undefined;
        const start = async (point, button = "left") => {
          if (touch)
            await session.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [{ id: 1, ...point }],
            });
          else {
            await page.mouse.move(point.x, point.y);
            await page.mouse.down({ button });
          }
        };
        const end = async (button = "left") => {
          if (touch)
            await session.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
          else await page.mouse.up({ button });
          await advance(page, 50);
        };
        const target = async (dx, dy) => {
          const rig = await rigPoint(page);
          return {
            x: Math.max(20, Math.min(viewport.width - 20, rig.x + dx)),
            y: Math.max(140, Math.min(viewport.height - 80, rig.y + dy)),
          };
        };
        await assertGeometry(page, viewport, touch);
        await assertMissionGeometry(page, viewport);
        const down = await target(0, touch && viewport.height < 420 ? 55 : 110);
        await start(down);
        await advance(page, 100);
        assert.equal(
          (await pointerState(page)).active,
          false,
          "Short press remains a tap",
        );
        await advance(page, 200);
        assert.equal((await pointerState(page)).active, true);
        assert.ok((await pointerState(page)).directions.includes("down"));
        await advance(page, 2400);
        await page.screenshot({ path: path + "-pointer-" + label + ".png" });
        await end();
        assert.equal((await pointerState(page)).active, false);
        assert.deepEqual((await pointerState(page)).directions, []);
        const mined = await sample(page);
        assert.ok(
          mined.stats.mined > initial.state.stats.mined,
          "Holding the world drills actual terrain without keyboard input",
        );
        assert.ok(
          carried(mined).length > 0,
          "World pointer drilling collects cargo",
        );
        const up = await target(110, -100);
        await start(up);
        await advance(page, 350);
        const diagonal = await pointerState(page);
        assert.ok(
          diagonal.directions.includes("up") &&
            diagonal.directions.includes("right"),
          "World pointer supports simultaneous thrust and steering",
        );
        await advance(page, 1800);
        await end();
        const flown = await sample(page);
        assert.ok(
          flown.vehicle.y < mined.vehicle.y,
          "Pointer thrust lifts the rig through the mined shaft",
        );
        assert.ok(
          delta(mined.vehicle.x, flown.vehicle.x) > 0.03,
          "Diagonal pointer thrust also steers the rig",
        );

        if (touch) {
          const worldPoint = { id: 1, ...(await target(0, 80)) };
          const left = await page
            .locator('.campaign-touch [data-dir="left"]')
            .boundingBox();
          const padPoint = {
            id: 2,
            x: left.x + left.width / 2,
            y: left.y + left.height / 2,
          };
          await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [worldPoint],
          });
          await advance(page, 300);
          await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [worldPoint, padPoint],
          });
          await advance(page, 100);
          assert.equal((await pointerState(page)).active, true);
          assert.equal(
            await page
              .locator('.campaign-touch [data-dir="left"]')
              .evaluate((e) => e.classList.contains("held")),
            true,
            "A pad finger remains independent from the world gesture",
          );
          await session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [padPoint],
          });
          await advance(page, 50);
          assert.equal(
            await page
              .locator('.campaign-touch [data-dir="left"]')
              .evaluate((e) => e.classList.contains("held")),
            false,
          );
          assert.equal(
            (await pointerState(page)).active,
            true,
            "Releasing the pad finger keeps world steering active",
          );
          await session.send("Input.dispatchTouchEvent", {
            type: "touchCancel",
            touchPoints: [],
          });
          await advance(page, 100);
          assert.deepEqual(await pointerState(page), {
            active: false,
            directions: [],
          });
          assert.equal(await page.locator(".campaign-touch .held").count(), 0);
        } else {
          for (const button of ["right", "middle"]) {
            await start(await target(0, -90), button);
            await advance(page, 300);
            assert.deepEqual(
              await pointerState(page),
              { active: false, directions: [] },
              button + " mouse button cannot move the rig",
            );
            await end(button);
          }
          await page.keyboard.press("Escape");
          if (await page.locator("#campaign-menu").evaluate((e) => e.open))
            await closeOverlay(page);
          await start(await target(0, -100));
          await advance(page, 300);
          assert.equal((await pointerState(page)).active, true);
          await page.keyboard.press("Escape");
          await advance(page, 100);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignPaused),
            "true",
          );
          assert.deepEqual(await pointerState(page), {
            active: false,
            directions: [],
          });
          await page.keyboard.press("Escape");
          await advance(page, 400);
          assert.deepEqual(
            await pointerState(page),
            { active: false, directions: [] },
            "Resuming while the mouse is still down cannot restart a cleared gesture",
          );
          await end();
          await start(await target(0, -100));
          await advance(page, 300);
          // Headless Chromium keeps all tabs focused/visible when switching.
          // Deliver the browser lifecycle event explicitly to test this handler.
          await page.evaluate(() => window.dispatchEvent(new Event("blur")));
          await advance(page, 100);
          assert.deepEqual(
            await pointerState(page),
            { active: false, directions: [] },
            "Window blur clears pointer motion",
          );
          await end();
        }

        // Tap inspection still reads only the visible surface deposit; no hold time elapses.
        await importCheckpoint(page, initial);
        await closeOverlay(page);
        await advance(page, 200);
        const rig = await rigPoint(page);
        const tile = campaignTileSize(viewport.width, viewport.height);
        const orePoint = { x: rig.x + tile, y: rig.y + 0.86 * tile };
        await start(orePoint);
        await end();
        assert.match(
          await page.locator("#campaign-game").getAttribute("data-inspection"),
          /Ironium.*30.*1 bulk/,
          "A short world tap still inspects a visible mineral",
        );

        if (!touch) {
          await menu(page);
          await page
            .locator('[data-setting="showDirectionButtons"]')
            .check({ force: true });
          await closeOverlay(page);
          const pad = page.locator('.campaign-touch [data-dir="down"]');
          assert.equal(
            await pad.isVisible(),
            true,
            "Mouse players can show direction buttons from the pilot console",
          );
          await assertGeometry(page, viewport, true);
          await assertMissionGeometry(page, viewport);
          const button = await pad.boundingBox();
          await page.mouse.move(
            button.x + button.width / 2,
            button.y + button.height / 2,
          );
          for (const nonprimary of ["right", "middle"]) {
            await page.mouse.down({ button: nonprimary });
            await advance(page, 350);
            assert.equal(
              await pad.evaluate((e) => e.classList.contains("held")),
              false,
              nonprimary + " mouse button cannot press the direction pad",
            );
            assert.equal((await pointerState(page)).active, false);
            await page.mouse.up({ button: nonprimary });
          }
          await page.keyboard.press("Escape");
          if (await page.locator("#campaign-menu").evaluate((e) => e.open))
            await closeOverlay(page);
          await page.mouse.move(
            button.x + button.width / 2,
            button.y + button.height / 2,
          );
          await page.mouse.down();
          await advance(page, 1600);
          assert.equal(
            await pad.evaluate((e) => e.classList.contains("held")),
            true,
          );
          await page.mouse.up();
          await advance(page, 100);
          assert.equal(
            await pad.evaluate((e) => e.classList.contains("held")),
            false,
          );
          const padDrilled = await sample(page);
          assert.ok(
            padDrilled.stats.mined > initial.state.stats.mined,
            "Holding a desktop direction button drills without keyboard input",
          );
          await keys(page, ["ArrowUp"]);
          await advance(page, 1800);
          await keys(page, []);
          const keyboardFlight = await sample(page);
          assert.ok(
            keyboardFlight.vehicle.y < padDrilled.vehicle.y,
            "Native keyboard thrust remains usable alongside pointer controls",
          );
          await menu(page);
          await page
            .locator('[data-setting="showDirectionButtons"]')
            .uncheck({ force: true });
          await page
            .locator('[data-setting="drillToggle"]')
            .check({ force: true });
          await closeOverlay(page);
          await importCheckpoint(page, initial);
          await closeOverlay(page);
          await advance(page, 200);
          await start(await target(0, 110));
          await advance(page, 1600);
          await end();
          await advance(page, 1400);
          const released = await sample(page);
          await advance(page, 1500);
          const settled = await sample(page);
          assert.equal(
            settled.stats.mined,
            released.stats.mined,
            "World hold releases even when keyboard drilling uses toggle mode",
          );
          await menu(page);
          await page
            .locator('[data-setting="drillToggle"]')
            .uncheck({ force: true });
          await closeOverlay(page);
        }

        const stageTwo = structuredClone(initial);
        stageTwo.state.progress.beacon = true;
        stageTwo.state.progress.bankedOre = 3;
        stageTwo.state.progress.completed = [1];
        stageTwo.state.credits = 2000;
        await importCheckpoint(page, stageTwo);
        await closeOverlay(page);
        await advance(page, 500);
        await assertMissionGeometry(page, viewport);
        await missionStatus(page, "W01-VALVE", "pending");
        await missionStatus(page, "W01-ANTENNA", "pending");
        await page.screenshot({ path: path + "-missions-" + label + ".png" });
        for (const mission of stageTwo.state.worlds.W01.missions)
          if (["W01-VALVE", "W01-ANTENNA"].includes(mission.id))
            mission.status = "carried";
        await importCheckpoint(page, stageTwo);
        await closeOverlay(page);
        await advance(page, 250);
        await assertMissionGeometry(page, viewport);
        await missionStatus(page, "W01-VALVE", "carried");
        await missionStatus(page, "W01-ANTENNA", "carried");
        await page.screenshot({
          path: path + "-missions-carried-" + label + ".png",
        });
        stageTwo.state.vehicle.x = 5.5;
        await importCheckpoint(page, stageTwo);
        await closeOverlay(page);
        await advance(page, 250);
        const lander = await rigPoint(page);
        await start({ x: lander.x, y: lander.y - 20 });
        await end();
        assert.equal(
          await page
            .locator("#campaign-dock")
            .evaluate((element) => element.open),
          true,
          "A short tap on the nearby lander still opens its console",
        );
        noErrors(page);
        check(
          "native " +
            label +
            " world pointer mining, diagonal flight, cancellation and persistent mission layout",
        );
      } finally {
        await context.close();
      }
    }
  }
  if (chosen("missions")) {
    const { context, page } = await ready(browser, base);
    try {
      await freeze(page);
      await missionStatus(page, "beacon", "pending");
      await missionStatus(page, "ore", "pending");
      assert.match(
        await page.locator("#campaign-objective-next").innerText(),
        /100\s*m|beacon/i,
      );
      const fixture = await exportCheckpoint(page);
      fixture.state.vehicle = { ...fixture.state.vehicle, x: 5.5, y: -0.36 };
      fixture.state.progress.beacon = true;
      fixture.state.credits = 4000;
      const ore = fixture.state.worlds.W01.packages
        .filter((item) => item.tags.includes("ordinary"))
        .slice(0, 3);
      assert.equal(ore.length, 3);
      for (const item of ore) {
        item.status = "carried";
        fixture.state.worlds.W01.tiles[
          Math.floor(item.y) * 40 + Math.floor(item.x)
        ] = 0;
      }
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "beacon", "complete");
      await missionStatus(page, "ore", "carried");
      assert.match(
        await page.locator("#campaign-objective-next").innerText(),
        /bank|lander/i,
      );
      await click(page, "#campaign-dock-toggle");
      await command(page, "bank");
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "ore", "complete");
      await missionStatus(page, "construction", "ready");
      assert.match(
        await page.locator("#campaign-objective-next").innerText(),
        /fund|construction|200/i,
      );
      await click(page, "#campaign-dock-toggle");
      await tab(page, "lander");
      await command(page, "milestone");
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "W01-VALVE", "pending");
      await missionStatus(page, "W01-ANTENNA", "pending");
      assert.match(
        await page.locator("#campaign-objective-step").innerText(),
        /02/,
      );
      assert.match(
        await page
          .locator('#campaign-objective-progress [data-task="construction"]')
          .innerText(),
        /300/,
      );

      const stageTwo = await exportCheckpoint(page);
      stageTwo.state.credits = 5000;
      for (const mission of stageTwo.state.worlds.W01.missions)
        if (["W01-VALVE", "W01-ANTENNA"].includes(mission.id))
          mission.status = "carried";
      await importCheckpoint(page, stageTwo);
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "W01-VALVE", "carried");
      await missionStatus(page, "W01-ANTENNA", "carried");
      assert.match(
        await page.locator("#campaign-objective-next").innerText(),
        /bank|lander/i,
      );
      await click(page, "#campaign-dock-toggle");
      await tab(page, "service");
      await command(page, "bank");
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "W01-VALVE", "complete");
      await missionStatus(page, "W01-ANTENNA", "complete");
      await missionStatus(page, "construction", "ready");
      await click(page, "#campaign-dock-toggle");
      await tab(page, "lander");
      await command(page, "milestone");
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "W01-Q", "pending");
      assert.match(
        await page.locator("#campaign-objective-step").innerText(),
        /03/,
      );
      assert.match(
        await page
          .locator('#campaign-objective-progress [data-task="W01-Q"]')
          .innerText(),
        /600/,
      );
      assert.match(
        await page
          .locator('#campaign-objective-progress [data-task="construction"]')
          .innerText(),
        /500/,
      );
      const stageThree = await exportCheckpoint(page);
      stageThree.state.credits = 6000;
      stageThree.state.worlds.W01.missions.find(
        (mission) => mission.id === "W01-Q",
      ).status = "carried";
      await importCheckpoint(page, stageThree);
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "W01-Q", "carried");
      await click(page, "#campaign-dock-toggle");
      await tab(page, "service");
      await command(page, "bank");
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "W01-Q", "complete");
      await missionStatus(page, "construction", "ready");
      await click(page, "#campaign-dock-toggle");
      await tab(page, "lander");
      await command(page, "milestone");
      await closeOverlay(page);
      await advance(page, 150);
      await missionStatus(page, "launch", "ready");
      assert.match(
        await page.locator("#campaign-objective-next").innerText(),
        /launch|lander/i,
      );
      await advance(page, 6500);
      assert.equal(
        await page.locator(".campaign-objective").isVisible(),
        true,
        "Mission guidance persists instead of timing out like a toast",
      );
      await menu(page);
      await command(page, "save");
      const saved = await exportCheckpoint(page);
      await page.clock.resume();
      clocked.delete(page);
      await page.reload();
      await page.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      await menu(page);
      await command(page, "load");
      assert.deepEqual((await exportCheckpoint(page)).state, saved.state);
      await closeOverlay(page);
      await missionStatus(page, "launch", "ready");
      noErrors(page);
      check(
        "persistent missions follow carried/banked cargo, actual M1–M3 payments, launch readiness and reload",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("hud")) {
    const viewport = { width: 1440, height: 900 };
    const { context, page } = await ready(browser, base, { viewport });
    try {
      await assertGeometry(page, viewport, false);
      const readouts = () =>
        page.evaluate(() => ({
          energy: parseFloat(
            document.querySelector("#campaign-energy").textContent,
          ),
          depth: parseFloat(
            document.querySelector("#campaign-depth").textContent,
          ),
          cargo: parseFloat(
            document.querySelector("#campaign-cargo").textContent,
          ),
          paused: document.body.dataset.campaignPaused,
          overlay: document.body.dataset.campaignOverlay,
        }));
      assert.equal((await readouts()).paused, "false");
      // Read-only instruments must let input reach the playfield beneath them.
      const passthrough = await page
        .locator(
          "#campaign-energy, #campaign-hull, #campaign-cargo, #campaign-haul",
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return {
              id: element.id,
              reachesWorld: Boolean(hit?.closest("#campaign-game")),
            };
          }),
        );
      for (const item of passthrough)
        assert.equal(
          item.reachesWorld,
          true,
          item.id + " does not block world input",
        );
      await page.screenshot({ path: path + "-hud-desktop.png" });
      await freeze(page);
      const before = await readouts();
      await keys(page, ["ArrowDown"]);
      await advance(page, 2200);
      await keys(page, []);
      const mining = await readouts();
      assert.equal(mining.paused, "false");
      assert.equal(mining.overlay, undefined);
      assert.ok(
        mining.energy < before.energy,
        "Energy updates during active play",
      );
      assert.ok(mining.depth >= 10, "Depth updates during active play");
      assert.ok(mining.cargo >= 1, "Cargo updates during active play");
      await keys(page, ["ArrowDown"]);
      await advance(page, 6500);
      await keys(page, []);
      await page.screenshot({ path: path + "-hud-underground.png" });

      const fixture = await exportCheckpoint(page);
      fixture.state.vehicle = { x: 5.5, y: -0.36, energy: 6, hull: 7 };
      fixture.state.credits = 10000;
      fixture.state.progress.beacon = true;
      fixture.state.progress.bankedOre = Math.max(
        3,
        fixture.state.progress.bankedOre,
      );
      fixture.state.progress.completed = [1];
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await page.keyboard.press("e");
      await tab(page, "hardware");
      await advance(page, 350);
      const dockBounds = await page.locator("#campaign-dock").boundingBox();
      assert.ok(
        dockBounds.x >= viewport.width * 0.3 &&
          dockBounds.width <= viewport.width * 0.65,
        "Desktop terminal leaves the mining world visible beside it",
      );
      assert.equal(
        await page.evaluate(() => document.body.dataset.campaignPaused),
        "true",
        "Dock interaction freezes the expedition while the world remains visible",
      );
      await page.screenshot({ path: path + "-hud-dock.png" });
      await click(page, '#campaign-dock [data-close="dock"]');
      assert.equal((await readouts()).paused, "false");
      noErrors(page);
      check(
        "transparent HUD passes world input and updates during active mining; side terminal keeps the world visible",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("opening")) {
    const { context, page } = await ready(browser, base);
    try {
      await page.screenshot({ path: path + "-desktop.png" });
      await freeze(page);
      await page.keyboard.press("e");
      assert.equal(
        await page.locator("#campaign-dock").evaluate((d) => d.open),
        false,
        "Remote E cannot enter a dock",
      );
      const first = await until(page, ["ArrowDown"], (s) => s.progress.beacon, {
        step: 1000,
        max: 25000,
        label: "Opening beacon was not reached",
      });
      assert.equal(carried(first).length, 7);
      assert.equal(
        carried(first).reduce((v, p) => v + p.value, 0),
        3800,
      );
      await dock(page);
      await command(page, "bank-sell");
      await tab(page, "lander");
      await command(page, "milestone");
      await tab(page, "service");
      await command(page, "refuel");
      await closeOverlay(page);
      await toColumn(page, 21);
      const second = await until(
        page,
        ["ArrowDown"],
        (s) => s.stats.largestDepth >= 70 && carried(s).length === 7,
        {
          step: 1000,
          max: 20000,
          label: "Second starter vein did not fill the bay",
        },
      );
      assert.equal(
        carried(second).reduce((v, p) => v + p.value, 0),
        4800,
      );
      await dock(page);
      await command(page, "bank-sell");
      await tab(page, "hardware");
      await command(page, "hardware-hull");
      await page.screenshot({ path: path + "-hardware.png" });
      baseline = await exportCheckpoint(page);
      await writeFile(
        path + "-opening.json",
        JSON.stringify(baseline, null, 2),
      );
      assert.equal(baseline.state.stats.ordinaryIncome, 8600);
      assert.deepEqual(baseline.state.progress.completed, [1]);
      assert.equal(baseline.state.hardware.hull, 1);
      assert.equal(baseline.state.vehicle.hull, 18);
      assert.ok(
        baseline.state.credits > 500,
        "Useful opening purchase retains a service reserve",
      );
      assert.equal(baseline.state.stats.recoveries, 0);
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("motherload.frontier.v1"),
        ),
        legacySentinel,
      );
      check(
        "two native starter trips survey, physically return, trade, build M1 and purchase an upgrade with reserve",
      );

      noErrors(page);
    } finally {
      await context.close();
    }
  }
  if (chosen("progression")) {
    const { context, page } = await ready(browser, base);
    try {
      const fixture = baseline
        ? structuredClone(baseline)
        : await exportCheckpoint(page);
      const s = fixture.state,
        w = s.worlds.W01;
      s.credits = 80000;
      s.vehicle = { x: 5.5, y: -0.36, energy: 10, hull: 10 };
      s.hardware.hull = 0;
      s.progress.beacon = true;
      s.progress.bankedOre = Math.max(3, s.progress.bankedOre);
      s.progress.completed = [1];
      s.purchases = s.purchases.filter((p) => p.id !== "CORE-1-HULL");
      // This fixture isolates later geometry, tools and objective transactions.
      // It does not establish normal earnings or campaign duration.
      for (let row = 0; row < 60; row++)
        for (const col of [20, 21]) w.tiles[row * 40 + col] = 0;
      for (const item of w.packages)
        if (item.status === "deposit" && [20, 21].includes(Math.floor(item.x)))
          item.status = "exposed";
      w.discovered.fill(1);
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await page.keyboard.press("e");
      await tab(page, "hardware");
      for (const key of ["drill", "energy", "cargo", "hull", "engine"])
        await command(page, "hardware-" + key);
      await tab(page, "tools");
      await command(page, "gear-buy-W01-R2");
      await closeOverlay(page);
      await freeze(page);
      await toColumn(page, 20);
      await until(
        page,
        ["ArrowDown"],
        (s) =>
          s.worlds.W01.missions.some(
            (m) => m.id === "W01-VALVE" && m.status === "carried",
          ),
        {
          step: 1000,
          max: 25000,
          label: "Valve pickup in opened shaft failed",
        },
      );
      await dock(page);
      await command(page, "bank");
      await tab(page, "service");
      await command(page, "refuel");
      await closeOverlay(page);
      await toColumn(page, 21);
      await until(
        page,
        ["ArrowDown"],
        (s) =>
          s.worlds.W01.missions.some(
            (m) => m.id === "W01-ANTENNA" && m.status === "carried",
          ),
        { step: 1000, max: 25000, label: "Antenna pickup failed" },
      );
      await dock(page);
      await command(page, "bank");
      await tab(page, "lander");
      await command(page, "milestone");
      await tab(page, "tools");
      await command(page, "gear-buy-W01-R3");
      await tab(page, "service");
      await command(page, "refuel");
      await closeOverlay(page);
      await toColumn(page, 20);
      await until(
        page,
        ["ArrowDown"],
        (s) =>
          s.worlds.W01.missions.some(
            (m) => m.id === "W01-Q" && m.status === "carried",
          ),
        { step: 1000, max: 25000, label: "Navigation core pickup failed" },
      );
      await dock(page);
      await command(page, "bank");
      await tab(page, "lander");
      await command(page, "milestone");
      await command(page, "depart");
      await click(page, "#campaign-confirm-accept");
      await idle(page);
      await advance(page, 2600);
      const completed = await exportCheckpoint(page);
      assert.deepEqual(completed.state.progress.completed, [1, 2, 3]);
      assert.equal(completed.state.progress.departed, true);
      assert.deepEqual(completed.state.progress.unlockedWorlds, [
        "W01",
        "W02",
        "W03",
      ]);
      assert.ok(completed.state.ownedGear.includes("W01-R3"));
      assert.equal(completed.state.equipped.processor, "W01-R3");
      assert.ok(
        completed.state.worlds.W01.missions.every((m) => m.status === "banked"),
      );
      const ids = completed.state.worlds.W01.packages.map((p) => p.id);
      assert.equal(new Set(ids).size, ids.length);
      await command(page, "save");
      await page.clock.resume();
      clocked.delete(page);
      await page.reload();
      await page.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      await menu(page);
      await command(page, "load");
      const reloaded = await exportCheckpoint(page);
      assert.deepEqual(reloaded.state, completed.state);
      await page.screenshot({ path: path + "-completed.png" });
      noErrors(page);
      check(
        "imported opened-shaft fixture supports actual mission pickups, banked M2/M3, local tools, departure and exact reload",
      );
    } catch (error) {
      try {
        await writeFile(
          path + "-progression-failure.json",
          JSON.stringify(await exportCheckpoint(page), null, 2),
        );
      } catch {}
      throw error;
    } finally {
      await context.close();
    }
  }
  if (chosen("cargo")) {
    const { context, page } = await ready(browser, base);
    try {
      const fixture = await exportCheckpoint(page);
      const s = fixture.state,
        w = s.worlds.W01;
      const seam = w.packages
        .filter((item) => Math.floor(item.x) === 20 && item.y < 7)
        .sort((a, b) => a.y - b.y);
      assert.equal(seam.length, 7);
      for (let row = 0; row < 10; row++) w.tiles[row * 40 + 20] = 0;
      for (const item of w.packages)
        if (
          item.status === "deposit" &&
          Math.floor(item.x) === 20 &&
          item.y < 10
        )
          item.status = "exposed";
      for (const item of seam) item.status = "carried";
      const overflow =
        w.packages.find(
          (item) =>
            item.status === "deposit" &&
            Math.floor(item.x) === 20 &&
            Math.floor(item.y) === 10,
        ) ||
        w.packages.find(
          (item) => item.status === "deposit" && item.tags.includes("ordinary"),
        );
      overflow.x = 20.5;
      overflow.y = 10.5;
      w.tiles[10 * 40 + 20] = 1;
      s.vehicle = { x: 20.5, y: 9.64, energy: 10, hull: 10 };
      w.discovered.fill(1);
      const total = w.packages.reduce((n, p) => n + p.value, 0),
        count = w.packages.length;
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await freeze(page);
      const exposed = await until(
        page,
        ["ArrowDown"],
        (state) =>
          state.worlds.W01.packages.find((p) => p.id === overflow.id).status ===
          "exposed",
        {
          step: 200,
          max: 5000,
          label: "Full bay should leave overflow package exposed",
        },
      );
      assert.equal(carried(exposed).length, 7);
      await menu(page);
      await command(page, "eject:" + seam[0].id);
      assert.equal(
        await page.locator("#campaign-menu-cargo .cargo-row").count(),
        6,
        "Pause cargo list updates immediately after ejection",
      );
      const ejected = (await exportCheckpoint(page)).state;
      assert.equal(
        ejected.worlds.W01.packages.find((p) => p.id === seam[0].id).status,
        "exposed",
      );
      await closeOverlay(page);
      await advance(page, 100);
      const picked = await sample(page);
      assert.equal(
        picked.worlds.W01.packages.find((p) => p.id === overflow.id).status,
        "carried",
      );
      assert.equal(carried(picked).length, 7);
      assert.equal(picked.worlds.W01.packages.length, count);
      assert.equal(
        new Set(picked.worlds.W01.packages.map((p) => p.id)).size,
        count,
      );
      assert.equal(
        picked.worlds.W01.packages.reduce((n, p) => n + p.value, 0),
        total,
      );
      await menu(page);
      await command(page, "save");
      const saved = await exportCheckpoint(page);
      await page.clock.resume();
      clocked.delete(page);
      await page.reload();
      await page.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      await menu(page);
      await command(page, "load");
      assert.deepEqual((await exportCheckpoint(page)).state, saved.state);
      noErrors(page);
      check(
        "full bay leaves a saved exposed package; menu ejection permits one pickup without duplicated identity or value",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("economy")) {
    const { context, page } = await ready(browser, base);
    try {
      const fixture = await exportCheckpoint(page),
        s = fixture.state;
      s.vehicle = { x: 5.5, y: -0.36, energy: 6, hull: 7 };
      s.credits = 10000;
      s.progress.beacon = true;
      s.progress.bankedOre = 3;
      s.progress.completed = [1];
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await page.keyboard.press("e");
      await tab(page, "hardware");
      const cards = page.locator(
        "#campaign-dock-content .equipment-cards article",
      );
      assert.match(
        await cards.nth(1).innerText(),
        /305 CR/,
        "Energy purchase still reserves repair cost",
      );
      assert.match(
        await cards.nth(3).innerText(),
        /546 CR/,
        "Hull purchase still reserves refuel cost",
      );
      await command(page, "hardware-energy");
      const bought = (await exportCheckpoint(page)).state;
      assert.equal(bought.hardware.energy, 1);
      assert.equal(bought.vehicle.energy, 16);
      assert.equal(bought.vehicle.hull, 7);
      assert.equal(bought.credits, 3500);
      noErrors(page);
      check(
        "hardware preview reserves the unfilled condition and capacity purchase fills only its own condition",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("storage")) {
    const { context, page } = await ready(browser, base);
    try {
      const first = await exportCheckpoint(page);
      const rawCurrent = () =>
        page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open("motherload.campaign.v1", 1);
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction("checkpoints", "readonly"),
                  read = tx.objectStore("checkpoints").get("current");
                tx.oncomplete = () => {
                  db.close();
                  resolve(read.result);
                };
                tx.onerror = () => reject(tx.error);
              };
            }),
        );
      const original = await rawCurrent();
      await page.locator("#campaign-import").setInputFiles({
        name: "damaged.json",
        mimeType: "application/json",
        buffer: Buffer.from("{damaged"),
      });
      await page.waitForFunction(() =>
        /not valid/i.test(
          document.querySelector("#campaign-save-status").textContent,
        ),
      );
      assert.equal(
        await page.locator("#campaign-confirm").evaluate((d) => d.open),
        false,
      );
      assert.equal(await rawCurrent(), original);
      const candidate = structuredClone(first);
      candidate.state.credits += 999;
      await page.locator("#campaign-import").setInputFiles({
        name: "cancelled.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(candidate)),
      });
      await page.locator("#campaign-confirm").waitFor({ state: "visible" });
      await click(page, "#campaign-confirm-cancel");
      assert.equal(await rawCurrent(), original);
      assert.deepEqual((await exportCheckpoint(page)).state, first.state);
      await page.locator("#campaign-import").setInputFiles({
        name: "escape-cancel.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(candidate)),
      });
      await page.locator("#campaign-confirm").waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator("#campaign-confirm").evaluate((d) => d.open),
        false,
        "Escape cancels import confirmation",
      );
      assert.equal(await rawCurrent(), original);
      await command(page, "recover");
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator("#campaign-confirm").evaluate((d) => d.open),
        false,
        "Escape cancels recovery confirmation",
      );
      assert.equal(await rawCurrent(), original);
      assert.deepEqual((await exportCheckpoint(page)).state, first.state);
      check(
        "invalid and cancelled campaign imports preserve the exact stored checkpoint and current run",
      );
      const second = await context.newPage(),
        faults = [];
      errors.set(second, faults);
      second.on("pageerror", (e) => faults.push(e.message));
      await second.goto(destination(base));
      await second.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      await second.bringToFront();
      const newer = await exportCheckpoint(second);
      newer.state.credits += 3210;
      await importCheckpoint(second, newer);
      await page.waitForFunction(
        () =>
          document.body.dataset.campaignOverlay === "menu" &&
          document.body.dataset.campaignPaused === "true",
      );
      await page.bringToFront();
      await click(page, '#campaign-menu [data-close="menu"]');
      assert.equal(
        await page.locator("#campaign-menu").evaluate((d) => d.open),
        true,
        "Return cannot bypass an unresolved cross-tab conflict",
      );
      assert.equal(
        await page.evaluate(() => document.body.dataset.campaignPaused),
        "true",
      );
      noErrors(second);
      await second.close();
      await delay(120);
      await command(page, "load");
      assert.equal(
        (await exportCheckpoint(page)).state.credits,
        newer.state.credits,
      );
      await closeOverlay(page);
      assert.equal(
        await page.evaluate(() => document.body.dataset.campaignPaused),
        "false",
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("motherload.frontier.v1"),
        ),
        legacySentinel,
      );
      noErrors(page);
      check(
        "another tab pauses stale campaign play; UI load resolves the conflict and resumes without touching Legacy",
      );
    } finally {
      await context.close();
    }
  }
  if (chosen("mobile")) {
    for (const [label, viewport] of [
      ["portrait", { width: 393, height: 851 }],
      ["landscape", { width: 568, height: 320 }],
    ]) {
      const { context, page } = await ready(browser, base, {
        viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      });
      try {
        await assertGeometry(page, viewport);
        await page.screenshot({ path: path + "-" + label + ".png" });
        const session = await context.newCDPSession(page);
        const down = await page
          .locator('.campaign-touch [data-dir="down"]')
          .boundingBox();
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { id: 1, x: down.x + down.width / 2, y: down.y + down.height / 2 },
          ],
        });
        await page.waitForFunction(
          () =>
            Number(
              document
                .querySelector("#campaign-cargo")
                .textContent.match(/\d+/)[0],
            ) >= 1,
        );
        await session.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
        assert.equal(
          await page.evaluate(() => document.body.dataset.campaignPaused),
          "false",
          "Phone HUD changes during active mining without opening a menu",
        );
        await page.screenshot({ path: path + "-" + label + "-mining.png" });
        await menu(page);
        const paused = await exportCheckpoint(page);
        await page.waitForTimeout(350);
        const still = await exportCheckpoint(page);
        assert.deepEqual(
          still.state,
          paused.state,
          "Menu pauses simulation and clears touch input",
        );
        await page.screenshot({ path: path + "-" + label + "-menu.png" });
        await closeOverlay(page);
        await freeze(page);
        const left = await page
          .locator('.campaign-touch [data-dir="left"]')
          .boundingBox();
        const up = await page
          .locator('.campaign-touch [data-dir="up"]')
          .boundingBox();
        const upPoint = {
          id: 2,
          x: up.x + up.width / 2,
          y: up.y + up.height / 2,
        };
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { id: 1, x: left.x + left.width / 2, y: left.y + left.height / 2 },
            upPoint,
          ],
        });
        await advance(page, 1500);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          // CDP names the changed point to end; the other finger stays down.
          touchPoints: [
            { id: 1, x: left.x + left.width / 2, y: left.y + left.height / 2 },
          ],
        });
        assert.equal(
          await page
            .locator('.campaign-touch [data-dir="left"]')
            .evaluate((e) => e.classList.contains("held")),
          false,
        );
        assert.equal(
          await page
            .locator('.campaign-touch [data-dir="up"]')
            .evaluate((e) => e.classList.contains("held")),
          true,
          "Releasing steering retains independent thrust finger",
        );
        await advance(page, 200);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
        assert.equal(
          await page
            .locator('.campaign-touch [data-dir="up"]')
            .evaluate((e) => e.classList.contains("held")),
          false,
        );
        const flown = await exportCheckpoint(page);
        assert.ok(
          flown.state.vehicle.y < paused.state.vehicle.y,
          "Two-finger native thrust moves the rig upward",
        );
        const docked = structuredClone(flown);
        docked.state.vehicle = { ...docked.state.vehicle, x: 5.5, y: -0.36 };
        docked.state.credits = 10000;
        docked.state.progress.beacon = true;
        docked.state.progress.bankedOre = Math.max(
          3,
          docked.state.progress.bankedOre,
        );
        docked.state.progress.completed = [1];
        await importCheckpoint(page, docked);
        await closeOverlay(page);
        await advance(page, 100);
        await page.locator("#campaign-dock-toggle").tap({ force: true });
        assert.equal(
          await page.locator("#campaign-dock").evaluate((d) => d.open),
          true,
        );
        // The paused world still gets presentation frames for dock framing.
        await advance(page, 400);
        await tab(page, "hardware");
        const bounds = await page.locator("#campaign-dock").boundingBox();
        assert.ok(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= viewport.width + 1 &&
            bounds.y + bounds.height <= viewport.height + 1,
          "Phone dock stays inside viewport",
        );
        await page.screenshot({ path: path + "-" + label + "-dock.png" });
        await command(page, "hardware-hull");
        const purchased = await exportCheckpoint(page);
        assert.equal(purchased.state.hardware.hull, 1);
        assert.equal(purchased.state.vehicle.hull, 18);
        assert.equal(
          purchased.state.credits,
          5500,
          "Native phone purchase charges exactly 450 CR",
        );
        await closeOverlay(page);
        noErrors(page);
        check(
          "native " +
            label +
            " touch mining, cancellation, pause, HUD and dock purchase",
        );
      } finally {
        await context.close();
      }
    }
  }
  if (chosen("inspection"))
    checks.push(
      ...(await runCampaignInspectionSmoke(
        browser,
        base,
        path + "-inspection",
      )),
    );
  return checks;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    const checks = await runCampaignSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
    );
    console.log("Campaign browser checks passed: " + checks.length);
  } finally {
    await browser.close();
  }
}
