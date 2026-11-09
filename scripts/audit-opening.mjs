import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  closeOverlay,
  command,
  exportCheckpoint,
  freeze,
  keys,
  noErrors,
  ready,
  tab,
} from "./campaign-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:8080/";
const output = process.env.OPENING_ARTIFACTS || "artifacts/audit-opening";
const portrait = process.env.AUDIT_VIEWPORT === "portrait";
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const steps = [];
try {
  const { context, page } = await ready(browser, base, {
    viewport: portrait
      ? { width: 393, height: 851 }
      : { width: 1440, height: 900 },
    hasTouch: portrait,
    isMobile: portrait,
  });
  await freeze(page);
  const live = () =>
    page.evaluate(() => {
      const host = document.querySelector("#campaign-game");
      const visible = (id) => {
        const element = document.getElementById(id);
        return Boolean(element && element.checkVisibility());
      };
      return {
        x: Number(host.dataset.rigWorldX),
        y: Number(host.dataset.rigWorldY),
        energy: document.querySelector("#campaign-energy").textContent,
        hull: document.querySelector("#campaign-hull").textContent,
        cargo: document.querySelector("#campaign-cargo").textContent,
        coach: document.querySelector("#campaign-coach")?.textContent,
        coachVisible: visible("campaign-coach"),
        signal: document.querySelector("#campaign-mission-signal")?.textContent,
        message: document.querySelector("#campaign-message")?.textContent,
        messageVisible: visible("campaign-message"),
        overlay: document.body.dataset.campaignOverlay,
        paused: document.body.dataset.campaignPaused,
      };
    });
  const record = async (name) => {
    const state = await live();
    steps.push({ name, ...state });
    console.log(name + ": " + JSON.stringify(state));
    await page.screenshot({ path: `${output}/${name}.png` });
    await writeFile(
      `${output}/steps.json`,
      JSON.stringify({ base, steps }, null, 2),
    );
  };
  const holdUntil = async (controls, predicate, label, limit = 30000) => {
    await keys(page, controls);
    for (let elapsed = 0; elapsed <= limit; elapsed += 50) {
      const state = await live();
      if (predicate(state)) {
        await keys(page, []);
        return state;
      }
      if (state.overlay || state.paused === "true")
        throw new Error(`${label} interrupted: ${JSON.stringify(state)}`);
      await advance(page, 50);
    }
    throw new Error(
      `${label} did not complete: ${JSON.stringify(await live())}`,
    );
  };
  const settle = async (ms = 500) => {
    await keys(page, []);
    await advance(page, ms);
  };
  const align = async (target, label) => {
    let previous;
    for (let n = 0; n < 250; n++) {
      const state = await live();
      const dx = ((target - state.x + 60) % 40) - 20;
      const vx = previous ? (((state.x - previous + 60) % 40) - 20) / 0.05 : 0;
      if (Math.abs(dx) < 0.09 && Math.abs(vx) < 0.5) {
        await keys(page, []);
        return;
      }
      const desired = Math.max(-4, Math.min(4, dx * 2.5));
      const correction = desired - vx;
      await keys(
        page,
        correction > 0.2
          ? ["ArrowRight"]
          : correction < -0.2
            ? ["ArrowLeft"]
            : [],
      );
      previous = state.x;
      await advance(page, 50);
    }
    throw new Error(
      `${label} alignment failed: ${JSON.stringify(await live())}`,
    );
  };
  const dock = async (name) => {
    await holdUntil(["ArrowUp"], (s) => s.y <= -0.36, "native ascent");
    await settle(600);
    await record(`${name}-surface`);
    await align(5.5, "home");
    await settle(400);
    await record(`${name}-home`);
    await page.keyboard.press("e");
    await advance(page, 200);
    assert.equal(
      await page.locator("#campaign-dock").evaluate((d) => d.open),
      true,
    );
    await tab(page, "service");
  };
  const finishPresentation = async () => {
    await advance(page, 2500);
  };

  await record("00-start");
  await holdUntil(["ArrowDown"], (s) => s.y >= 9.3, "first shaft");
  await settle(150);
  await record("01-beacon");
  await dock("02-first-return");
  await command(page, "bank-sell");
  await finishPresentation();
  await record("03-first-sale");
  await tab(page, "lander");
  await command(page, "milestone");
  await finishPresentation();
  await tab(page, "service");
  await command(page, "refuel");
  if (await page.locator('[data-command="repair"]').isEnabled())
    await command(page, "repair");
  await record("04-funded-serviced");
  await closeOverlay(page);
  await advance(page, 350);
  await align(21.5, "second seam");
  await settle(200);
  await record("05-second-seam");
  await holdUntil(
    ["ArrowDown"],
    (s) => /^7\s*\/\s*7/.test(s.cargo),
    "second haul",
  );
  await record("06-second-hold-full");
  await dock("07-second-return");
  await command(page, "bank-sell");
  await finishPresentation();
  await command(page, "refuel");
  await tab(page, "hardware");
  await command(page, "hardware-energy");
  await finishPresentation();
  await record("08-tank-installed");
  await closeOverlay(page);
  await advance(page, 350);
  const checkpoint = await exportCheckpoint(page, true);
  assert.equal(checkpoint.state.hardware.energy, 1);
  assert.equal(checkpoint.state.stats.recoveries, 0);
  // D14: the 95 m route cell has no beacon; M1 is the banked seam-A haul and
  // the wreck survey waits for M2 at the SITE-4 gallery.
  assert.equal(checkpoint.state.progress.beacon, false);
  assert.ok(checkpoint.state.progress.completed.includes(1));
  assert.ok(checkpoint.state.credits >= 250);
  noErrors(page);
  await writeFile(
    `${output}/checkpoint.json`,
    JSON.stringify(checkpoint, null, 2),
  );
  await record("09-loop-complete");
  console.log(
    "PASS native opening two-haul loop, construction, service and tank upgrade without state injection",
  );
  await context.close();
} finally {
  await browser.close();
}
