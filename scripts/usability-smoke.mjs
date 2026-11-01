import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clocked = new WeakSet();
const retiredKey = "motherload.frontier.v1";
const retiredBytes = "retired-expedition-must-stay-byte-for-byte-untouched";
const viewports = [
  ["desktop", { width: 1440, height: 900 }],
  ["portrait", { width: 393, height: 851 }],
  ["landscape", { width: 568, height: 320 }],
];
async function click(page, selector) {
  const element = page.locator(selector);
  await element.evaluate((target) =>
    target.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  assert.equal(
    await element.evaluate((target) => {
      const box = target.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return top === target || target.contains(top);
    }),
    true,
    selector +
      " receives native pointer input after ordinary centered scrolling",
  );
  await element.click({ force: clocked.has(page) });
}
async function idle(page) {
  for (let n = 0; n < 200; n++) {
    if (
      await page.evaluate(() => document.body.dataset.campaignBusy !== "true")
    )
      return;
    await delay(20);
  }
  throw new Error("Persistence did not settle");
}
async function freeze(page) {
  if (!clocked.has(page)) {
    await page.clock.install();
    clocked.add(page);
  }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}
async function advance(page, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50)
    await page.clock.fastForward(Math.min(50, ms - elapsed));
}
const paused = (page) =>
  page.evaluate(() => document.body.dataset.campaignPaused === "true");
async function menu(page) {
  if (!(await page.locator("#campaign-menu").evaluate((dialog) => dialog.open)))
    await click(page, "#campaign-menu-toggle");
  if (clocked.has(page)) await advance(page, 50);
  assert.equal(await paused(page), true);
}
async function resume(page) {
  if (await page.locator("#campaign-menu").evaluate((dialog) => dialog.open)) {
    const closed = page
      .locator("#campaign-menu")
      .evaluate(
        (dialog) =>
          new Promise((resolve) =>
            dialog.addEventListener("close", () => resolve(), { once: true }),
          ),
      );
    await click(page, "#campaign-resume");
    await closed;
  }
  await advance(page, 50);
  const disabled = await page.evaluate(
    () => document.body.dataset.campaignDisabled === "true",
  );
  assert.equal(
    await paused(page),
    disabled,
    "Explicit Resume starts play unless the rig is disabled",
  );
}
async function exported(page) {
  await menu(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    click(page, '#campaign-menu [data-command="export"]'),
  ]);
  return JSON.parse(await readFile(await download.path(), "utf8"));
}
async function confirmClick(page, selector) {
  const closed = page
    .locator("#campaign-confirm")
    .evaluate(
      (dialog) =>
        new Promise((resolve) =>
          dialog.addEventListener("close", () => resolve(), { once: true }),
        ),
    );
  await click(page, selector);
  await closed;
  await idle(page);
}
async function imported(page, state, envelope) {
  await menu(page);
  await page.locator("#campaign-import").setInputFiles({
    name: "usability-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...envelope, state })),
  });
  await page.locator("#campaign-confirm").waitFor({ state: "visible" });
  await confirmClick(page, "#campaign-confirm-accept");
  assert.equal(await paused(page), true, "Restored expeditions stay paused");
}
async function ready(page, base) {
  await page.goto(base);
  await page.waitForFunction(
    () =>
      document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
  );
  await idle(page);
  assert.equal(
    await page.locator("#game").count(),
    0,
    "Only the current game is mounted",
  );
}
function withConditions(
  state,
  { energy = 2, hull = 1.5, airborne = false, cash = 200 } = {},
) {
  const result = structuredClone(state);
  result.vehicle = { x: 20.5, y: airborne ? 8 : -0.36, energy, hull };
  result.credits = cash * 10;
  if (airborne)
    for (let y = 0; y < 14; y++)
      for (let x = 17; x <= 23; x++) result.worlds.W01.tiles[y * 40 + x] = 0;
  if (airborne)
    for (const item of result.worlds.W01.packages)
      if (
        item.status === "deposit" &&
        result.worlds.W01.tiles[
          Math.floor(item.y) * 40 + Math.floor(item.x)
        ] === 0
      )
        item.status = "exposed";
  return result;
}
async function inViewport(page, selector, viewport, minimum = 0) {
  const element = page.locator(selector);
  assert.equal(await element.isVisible(), true, selector + " is visible");
  const box = await element.boundingBox();
  assert.ok(
    box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    selector + " stays in the viewport: " + JSON.stringify(box),
  );
  if (minimum)
    assert.ok(
      box.width >= minimum && box.height >= minimum,
      selector + " has a 44px target",
    );
  return box;
}
async function assertLayout(page, viewport) {
  assert.deepEqual(await page.locator("#campaign-game canvas").boundingBox(), {
    x: 0,
    y: 0,
    ...viewport,
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        !scrollX &&
        !scrollY,
    ),
    true,
    "Gameplay never needs page scrolling",
  );
  for (const selector of [
    "#campaign-energy",
    "#campaign-hull",
    "#campaign-cargo",
  ]) {
    await inViewport(page, selector, viewport);
    assert.ok(
      await page
        .locator(selector)
        .evaluate(
          (element) => parseFloat(getComputedStyle(element).fontSize) >= 12,
        ),
    );
    assert.equal(
      await page
        .locator(selector)
        .evaluate((element) => Boolean(element.closest("dialog"))),
      false,
    );
  }
  await inViewport(page, "#campaign-menu-toggle", viewport, 44);
  const boxes = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { hud: box(".campaign-hud"), menu: box("#campaign-menu-toggle") };
  });
  assert.ok(
    boxes.hud.x + boxes.hud.width <= boxes.menu.x ||
      boxes.menu.x + boxes.menu.width <= boxes.hud.x ||
      boxes.hud.y + boxes.hud.height <= boxes.menu.y ||
      boxes.menu.y + boxes.menu.height <= boxes.hud.y,
    "Pause target never overlaps live gauges",
  );
  await inViewport(page, "#campaign-danger", viewport);
  assert.ok(
    await page
      .locator("#campaign-danger")
      .evaluate(
        (element) => parseFloat(getComputedStyle(element).fontSize) >= 12,
      ),
  );
  assert.equal(
    await page.locator(".campaign-touch").isVisible(),
    false,
    "The floating joystick is the default touch control",
  );
}
async function unchangedStatus(page) {
  await page.evaluate(() => {
    globalThis.usabilityMutationCount = 0;
    globalThis.usabilityObserver = new MutationObserver((records) => {
      globalThis.usabilityMutationCount += records.length;
    });
    globalThis.usabilityObserver.observe(
      document.querySelector("#campaign-message"),
      { childList: true, characterData: true, subtree: true },
    );
  });
  await advance(page, 1100);
  const count = await page.evaluate(() => {
    globalThis.usabilityObserver.disconnect();
    return globalThis.usabilityMutationCount;
  });
  assert.ok(count <= 2, "Unchanged status is not rewritten every frame");
}
async function inspectLegend(page) {
  await menu(page);
  const summary = page.locator("#campaign-legend summary");
  if (!(await summary.evaluate((element) => element.closest("details").open)))
    await click(page, "#campaign-legend summary");
  const text = await page.locator("#campaign-legend").innerText();
  assert.match(text, /Ironium/i);
  assert.match(text, /unstable.{0,12}shelf/i);
  assert.doesNotMatch(
    text,
    /magma/i,
    "The legend lists only implemented hazards",
  );
}

export async function runUsabilitySmoke(
  browser,
  base,
  path = "artifacts/usability",
) {
  await mkdir("artifacts", { recursive: true });
  const checks = [];
  const selected = (process.env.USABILITY_CHECKS || "all").split(",");
  const chosen = (name) => selected.includes("all") || selected.includes(name);
  const sizes = (
    process.env.USABILITY_VIEWPORTS || "desktop,portrait,landscape"
  ).split(",");
  const check = (name) => {
    checks.push(name);
    console.log("Passed: " + name);
  };
  for (const [label, viewport] of viewports.filter(([name]) =>
    sizes.includes(name),
  )) {
    const context = await browser.newContext({
      viewport,
      isMobile: label !== "desktop",
      hasTouch: label !== "desktop",
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      ({ key, value }) => {
        if (!sessionStorage.getItem("usability-retired-seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("usability-retired-seeded", "true");
        }
      },
      { key: retiredKey, value: retiredBytes },
    );
    const page = await context.newPage(),
      faults = [];
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => faults.push(error.message));
    try {
      await ready(page, base);
      if (await page.locator("#campaign-start").isVisible())
        await click(page, "#campaign-start");
      await freeze(page);
      const envelope = await exported(page),
        initial = envelope.state;
      if (chosen("viewport")) {
        await imported(
          page,
          withConditions(initial, { airborne: true }),
          envelope,
        );
        const before = (await exported(page)).state;
        await page.clock.resume();
        await ready(page, base);
        await freeze(page);
        assert.equal(await paused(page), true, "Saved boot is paused");
        await inViewport(page, "#campaign-pause-conditions", viewport);
        assert.ok(
          await page
            .locator("#campaign-pause-conditions")
            .evaluate(
              (element) => parseFloat(getComputedStyle(element).fontSize) >= 12,
            ),
        );
        if (label === "landscape") {
          // Deliberately no alignment shim: ordinary browser scrolling must
          // account for the measured sticky header before native activation.
          await page
            .locator('#campaign-menu [data-command="export"]')
            .evaluate((target) =>
              target.scrollIntoView({ block: "center", behavior: "instant" }),
            );
          await click(page, '#campaign-menu [data-command="save"]');
          await idle(page);
        }
        await page.keyboard.press("Escape");
        await advance(page, 2500);
        assert.equal(
          await paused(page),
          true,
          "Escape cannot bypass explicit restoration Resume",
        );
        assert.deepEqual(
          (await exported(page)).state,
          before,
          "Restored airborne saves do not fall, consume energy or lose hull before Resume",
        );
        await inViewport(page, "#campaign-resume", viewport, 44);
        await imported(page, withConditions(initial), envelope);
        await resume(page);
        await assertLayout(page, viewport);
        const warning = await page.locator("#campaign-danger").innerText();
        assert.equal(
          await page
            .locator("#campaign-danger")
            .evaluate((element) => getComputedStyle(element).opacity),
          "1",
          "Live resource warnings stay visually present",
        );
        assert.match(warning, /energy|fuel/i);
        assert.match(warning, /low|return|critical/i);
        assert.match(warning, /critical.{0,25}hull|hull.{0,25}critical/i);
        await unchangedStatus(page);
        assert.equal(await page.locator("#campaign-danger").isVisible(), true);
        await page.screenshot({ path: `${path}-${label}-warnings.png` });
        await imported(
          page,
          withConditions(initial, { energy: 0, hull: 9 }),
          envelope,
        );
        await resume(page);
        await inViewport(page, "#campaign-disabled", viewport);
        await inViewport(page, "#campaign-disabled-recover", viewport, 44);
        assert.equal(
          await page
            .locator("#campaign-danger")
            .evaluate((element) => getComputedStyle(element).opacity),
          "0",
          "The disabled card replaces the duplicate visual warning",
        );
        assert.equal(
          await page.locator("#campaign-danger").getAttribute("role"),
          "alert",
          "The warning remains an accessible alert",
        );
        await page.screenshot({ path: `${path}-${label}-disabled.png` });
        const disabledBefore = (await exported(page)).state;
        await resume(page);
        await click(page, "#campaign-disabled-recover");
        assert.equal(
          await page.getByRole("dialog", { name: /recover/i }).isVisible(),
          true,
        );
        await inViewport(page, "#campaign-confirm-accept", viewport, 44);
        await inViewport(page, "#campaign-confirm-cancel", viewport, 44);
        const copy = await page.locator("#campaign-confirm").innerText();
        assert.match(copy, /cargo/i);
        assert.match(copy, /cost|CR/i);
        assert.match(copy, /9/);
        await confirmClick(page, "#campaign-confirm-cancel");
        assert.deepEqual((await exported(page)).state, disabledBefore);
        await resume(page);
        await click(page, "#campaign-disabled-recover");
        await confirmClick(page, "#campaign-confirm-accept");
        assert.equal(
          await paused(page),
          true,
          "Confirmed recovery waits for Resume",
        );
        const recovered = (await exported(page)).state;
        assert.equal(
          recovered.vehicle.hull,
          9,
          "Recovery preserves healthy resources above half capacity",
        );
        assert.equal(recovered.vehicle.energy, 5);
        assert.equal(recovered.credits, 1000);
        check(
          `${label}: one-viewport live HUD, persistent warnings, safe restoration and accessible recovery`,
        );
      }
      if (label === "desktop" && chosen("input")) {
        await imported(
          page,
          withConditions(initial, { energy: 6, hull: 10 }),
          envelope,
        );
        await resume(page);
        const baseline = (await exported(page)).state;
        await resume(page);
        for (const shortcut of ["Control+s", "Control+p", "Alt+s", "Meta+p"]) {
          await page.keyboard.press(shortcut);
          await advance(page, 250);
        }
        assert.equal(await paused(page), false);
        let after = (await exported(page)).state;
        assert.equal(
          after.stats.mined,
          baseline.stats.mined,
          "Browser shortcuts do not drill",
        );
        await resume(page);
        await page.locator("#campaign-menu-toggle").focus();
        await page.keyboard.down("s");
        await advance(page, 1300);
        await page.keyboard.up("s");
        after = (await exported(page)).state;
        assert.equal(
          after.stats.mined,
          baseline.stats.mined,
          "Toolbar focus does not capture movement",
        );
        await resume(page);
        await page.mouse.click(viewport.width / 2, viewport.height / 2);
        await page.keyboard.down("ArrowDown");
        await advance(page, 2200);
        await page.keyboard.up("ArrowDown");
        after = (await exported(page)).state;
        assert.ok(
          after.stats.mined > baseline.stats.mined,
          "World focus restores keyboard mining",
        );
        await resume(page);
        await advance(page, 5200);
        await idle(page);
        await menu(page);
        assert.match(
          await page.locator("#campaign-autosave-status").innerText(),
          /autosaved.*browser only/i,
        );
        assert.match(
          await page
            .locator('#campaign-menu [data-command="load"]')
            .innerText(),
          /latest|autosave/i,
        );
        check(
          "desktop: modifier/focus-safe keyboard input and accurate autosave guidance",
        );
      }
      if (label === "desktop" && chosen("services")) {
        const state = withConditions(initial, { energy: 6, hull: 10, cash: 2 });
        state.vehicle.x = 5.5;
        await imported(page, state, envelope);
        await resume(page);
        await page.locator("#campaign-game").focus();
        await page.keyboard.press("e");
        await advance(page, 100);
        const preview = await page
          .locator('[data-service-preview="refuel"]')
          .innerText();
        assert.match(preview, /6\s*→\s*8/);
        assert.match(preview, /2 CR/);
        assert.match(preview, /0 CR.*remains/);
        await click(page, '#campaign-dock [data-command="refuel"]');
        await idle(page);
        await click(page, '#campaign-dock [data-close="dock"]');
        const bought = (await exported(page)).state;
        assert.ok(Math.abs(bought.vehicle.energy - 8) < 0.02);
        assert.equal(bought.credits, 0);
        const upgrade = withConditions(initial, {
          energy: 6,
          hull: 10,
          cash: 710,
        });
        upgrade.vehicle.x = 5.5;
        upgrade.progress.beacon = true;
        upgrade.progress.bankedOre = 3;
        upgrade.progress.completed = [1];
        await imported(page, upgrade, envelope);
        await resume(page);
        await page.locator("#campaign-game").focus();
        await page.keyboard.press("e");
        await advance(page, 100);
        await click(page, '#campaign-dock [data-tab="hardware"]');
        const offer = await page
          .locator('[data-command="hardware-drill"]')
          .evaluate((button) => button.closest("article").innerText);
        assert.match(offer, /2 speed\s*→\s*2\.8 speed/);
        assert.match(offer, /Need 40 CR more/);
        await click(page, '#campaign-dock [data-close="dock"]');
        check(
          "desktop: exact service totals/results and current→next upgrade shortfalls",
        );
      }
      if (label === "desktop" && chosen("service-rescue")) {
        const state = withConditions(initial, {
          energy: 9,
          hull: 0,
          cash: 1000,
        });
        state.vehicle.x = 5.5;
        const packages = state.worlds.W01.packages
          .filter((item) => item.tags.includes("ordinary"))
          .slice(0, 2);
        for (const item of packages) item.status = "carried";
        await imported(page, state, envelope);
        await inViewport(page, "#campaign-menu-dock", viewport, 44);
        await click(page, "#campaign-menu-dock");
        await click(page, '#campaign-dock [data-tab="service"]');
        await click(page, '#campaign-dock [data-command="repair"]');
        await idle(page);
        await click(page, '#campaign-dock [data-close="dock"]');
        assert.equal(await paused(page), true);
        assert.equal(
          await page
            .locator("body")
            .getAttribute("data-campaign-resume-required"),
          "true",
        );
        const repaired = (await exported(page)).state;
        assert.equal(repaired.vehicle.hull, 10);
        assert.equal(repaired.vehicle.energy, 9);
        assert.equal(repaired.credits, 8500);
        assert.equal(repaired.stats.recoveries, state.stats.recoveries);
        assert.deepEqual(
          repaired.worlds.W01.packages
            .filter((item) => item.status === "carried")
            .map((item) => item.id),
          packages.map((item) => item.id),
        );
        check(
          "desktop: disabled-at-lander repair preserves cargo and awaits Resume without recovery fee",
        );
      }
      if (label === "desktop" && chosen("legend")) {
        await inspectLegend(page);
        check("desktop: ore and hazard legend lists only implemented hazards");
      }
      if (label === "desktop" && chosen("entry")) {
        await page.clock.resume();
        const oldAddress = new URL(base);
        oldAddress.searchParams.set("mode", "legacy");
        await ready(page, oldAddress.href);
        assert.equal(
          await page
            .locator('#campaign-legacy-link, a[href="?mode=legacy"]')
            .count(),
          0,
        );
        assert.equal(
          await page.evaluate((key) => localStorage.getItem(key), retiredKey),
          retiredBytes,
        );
        check(
          "desktop: default and retired-mode bookmarks open the current game without changing retired save bytes",
        );
      }
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), retiredKey),
        retiredBytes,
      );
      assert.deepEqual(faults, [], "No uncaught browser errors");
    } catch (error) {
      console.error(
        "Failure context:",
        label,
        await page
          .evaluate(() => ({
            data: { ...document.body.dataset },
            dialogs: [...document.querySelectorAll("dialog[open]")].map(
              (dialog) => dialog.id,
            ),
          }))
          .catch(() => ({})),
      );
      await page
        .screenshot({ path: `${path}-${label}-failure.png`, timeout: 5000 })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  return checks;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    const checks = await runUsabilitySmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
    );
    console.log("Usability browser checks passed: " + checks.length);
  } finally {
    await browser.close();
  }
}
