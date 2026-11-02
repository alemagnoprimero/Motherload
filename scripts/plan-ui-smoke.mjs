import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  command,
  exportCheckpoint,
  freeze,
  idle,
  importCheckpoint,
  keys,
  menu,
  noErrors,
  pauseSection,
  ready,
  tab,
} from "./campaign-smoke.mjs";

async function rewardFinished(page) {
  for (
    let elapsed = 0;
    elapsed < 3000 && (await page.locator("#campaign-reward").isVisible());
    elapsed += 50
  )
    await advance(page, 50);
  assert.equal(await page.locator("#campaign-reward").isVisible(), false);
}

async function menuMetrics(page) {
  return page.locator("#campaign-dock-content").evaluate((root) => {
    const entries = [];
    for (const element of [root, ...root.querySelectorAll("*")]) {
      if (
        element.closest("[hidden],.sr-only") ||
        (element.closest("details:not([open])") &&
          !element.closest("summary")) ||
        !element.getClientRects().length
      )
        continue;
      const css = getComputedStyle(element);
      if (
        css.display === "none" ||
        css.visibility === "hidden" ||
        Number(css.opacity) === 0
      )
        continue;
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim())
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.width && rect.height)
          entries.push({
            text: node.textContent.trim(),
            size: parseFloat(css.fontSize),
          });
      }
    }
    const count = (rows) =>
      rows.reduce((sum, entry) => sum + entry.text.split(/\s+/).length, 0);
    return {
      entries,
      words: count(entries),
      readable:
        count(entries.filter((entry) => entry.size >= 14)) /
        Math.max(1, count(entries)),
    };
  });
}

async function assertTerminalFit(page, label) {
  const fit = await page.locator("#campaign-dock").evaluate((dialog) => {
    const content = dialog.querySelector("#campaign-dock-content");
    return {
      scroll: dialog.scrollHeight,
      client: dialog.clientHeight,
      contentScroll: content.scrollHeight,
      contentClient: content.clientHeight,
      bottom: dialog.getBoundingClientRect().bottom,
      viewport: innerHeight,
    };
  });
  assert.ok(
    fit.scroll <= fit.client + 1 &&
      fit.contentScroll <= fit.contentClient + 1 &&
      fit.bottom <= fit.viewport,
    `${label} fits without clipped or scrolling content: ${JSON.stringify(fit)}`,
  );
}

export async function runPlanUISmoke(browser, base, output) {
  await mkdir(output, { recursive: true });
  const { context, page } = await ready(browser, base, {
    viewport: { width: 1440, height: 900 },
  });
  const checks = [];
  const menus = [];
  try {
    await freeze(page);
    const initial = await exportCheckpoint(page);
    // Hold confirmation is tested with genuine pointer/keyboard events. The
    // checkpoint fixture uses the public import path, never model/debug APIs.
    await page.locator("#campaign-import").setInputFiles({
      name: "same-campaign.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(initial)),
    });
    await page.locator("#campaign-confirm").waitFor({ state: "visible" });
    await page.locator("#campaign-confirm-accept").click({ force: true });
    assert.equal(
      await page.locator("#campaign-confirm").evaluate((dialog) => dialog.open),
      true,
      "A short pointer click cannot replace a campaign",
    );
    await page.locator("#campaign-confirm-accept").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator("#campaign-confirm").evaluate((dialog) => dialog.open),
      true,
      "First keyboard activation only arms the decision",
    );
    await advance(page, 350);
    await page.keyboard.press("Enter");
    await idle(page);
    await page.waitForFunction(
      () => !document.querySelector("#campaign-confirm").open,
    );
    assert.equal(
      await page.evaluate(() => document.body.dataset.campaignPaused),
      "true",
    );
    checks.push(
      "Destructive confirmation rejects short clicks and accepts deliberate keyboard activation",
    );

    const saleFixture = structuredClone(initial);
    const state = saleFixture.state,
      mine = state.worlds[state.currentWorld];
    state.vehicle.x = 5.5;
    state.vehicle.y = -0.36;
    state.vehicle.energy = 6;
    state.vehicle.hull = 7;
    const packages = mine.packages
      .filter((item) => item.tags.includes("ordinary"))
      .slice(0, 7);
    for (const item of packages) item.status = "carried";
    const expectedCredits =
      state.credits + packages.reduce((sum, item) => sum + item.value, 0);
    await importCheckpoint(page, saleFixture);
    await closeOverlay(page);
    await advance(page, 350);
    await page.keyboard.press("e");
    await tab(page, "service");
    await page.locator(".terminal-detail summary").click({ force: true });
    await page
      .locator('#campaign-dock-content [data-command="bank-sell"]')
      .evaluate((button) => {
        window.__tradeNode = button;
      });
    await command(page, "bank-sell");
    await advance(page, 50);
    assert.equal(await page.locator("#campaign-reward").isVisible(), true);
    const values = [];
    for (let elapsed = 0; elapsed < 1200; elapsed += 50) {
      values.push(await page.locator("#campaign-reward-value").textContent());
      assert.equal(
        await page.evaluate(() => document.body.dataset.campaignPaused),
        "true",
        "Reward presentation keeps simulation paused",
      );
      await advance(page, 50);
    }
    assert.ok(
      new Set(values).size >= 10,
      "A7package sale has at least10 intermediate values",
    );
    const finalValue = await page
      .locator("#campaign-reward-value")
      .textContent();
    assert.equal(
      Number(finalValue.replace(/[^0-9.]/g, "")),
      expectedCredits / 10,
    );
    assert.equal(
      await page
        .locator('#campaign-dock-content [data-command="bank-sell"]')
        .evaluate((button) => button === window.__tradeNode),
      true,
      "Keyed transaction preserves its button Element",
    );
    assert.equal(
      await page
        .locator(".terminal-detail")
        .evaluate((details) => details.open),
      true,
      "Transaction preserves the open cargo manifest",
    );
    checks.push(
      "Sale uses real receipt,10+ count-up values, exact final money, paused simulation and retained DOM",
    );
    await page.screenshot({ path: `${output}/trade.png` });
    await page.locator(".terminal-detail summary").click({ force: true });
    for (const name of ["service", "hardware", "lander"]) {
      await tab(page, name);
      const metrics = await menuMetrics(page);
      menus.push({ name, ...metrics });
      await writeFile(`${output}/menus.json`, JSON.stringify(menus, null, 2));
      assert.ok(
        metrics.words <= 60,
        `${name} body has ${metrics.words} words (limit60)`,
      );
      assert.ok(
        metrics.readable >= 0.8,
        `${name}: ${(metrics.readable * 100).toFixed(1)}% of words are at least14px (target80%)`,
      );
      await assertTerminalFit(page, `${name} desktop terminal`);
      await page.screenshot({ path: `${output}/${name}-desktop.png` });
    }

    const comet = JSON.parse(
      await readFile(
        new URL("../tests/fixtures/improvement-w02.json", import.meta.url),
        "utf8",
      ),
    );
    comet.state.vehicle.x = 5.5;
    comet.state.vehicle.y = -0.36;
    comet.state.vehicle.energy = 9;
    await importCheckpoint(page, comet);
    await closeOverlay(page);
    await advance(page, 350);
    await page.keyboard.press("e");
    await tab(page, "hardware");
    const energyButton =
      '#campaign-dock-content [data-command="hardware-energy"]';
    await page.locator(energyButton).evaluate((button) => {
      window.__upgradeNode = button;
    });
    await click(page, energyButton);
    await idle(page);
    await advance(page, 100);
    await page.keyboard.press(" ");
    assert.equal(
      await page.locator("#campaign-reward").isVisible(),
      false,
      "Any input skips an install beat without buying twice",
    );
    assert.equal(
      await page.locator(energyButton).isEnabled(),
      true,
      "The next available tank remains purchasable",
    );
    assert.equal(
      await page
        .locator(energyButton)
        .evaluate((button) => button === window.__upgradeNode),
      true,
      "An available purchase keeps its Element identity",
    );
    assert.equal(
      await page
        .locator(energyButton)
        .evaluate((button) => button === document.activeElement),
      true,
      "An available purchase retains keyboard focus",
    );
    await assertTerminalFit(page, "Desktop workshop");
    await page.screenshot({ path: `${output}/workshop.png` });
    checks.push(
      "Workshop keeps purchasable-node identity and focus and fits the desktop viewport",
    );

    // A new intentional action follows the presentation's 180ms click guard.
    await advance(page, 200);
    await menu(page);
    await pauseSection(page, "systems");
    await page.locator('[data-setting="reducedMotion"]').check({ force: true });
    await importCheckpoint(page, saleFixture);
    await closeOverlay(page);
    await advance(page, 350);
    await page.keyboard.press("e");
    await tab(page, "service");
    await command(page, "bank-sell");
    await advance(page, 50);
    assert.equal(
      await page
        .locator("#campaign-reward")
        .evaluate((panel) => panel.classList.contains("reduced")),
      true,
    );
    assert.equal(
      Number(
        (await page.locator("#campaign-reward-value").textContent()).replace(
          /[^0-9.]/g,
          "",
        ),
      ),
      expectedCredits / 10,
      "Reduced motion presents the exact final receipt without a rolling count",
    );
    assert.equal(
      await page.evaluate(() => document.body.dataset.campaignPaused),
      "true",
    );
    await rewardFinished(page);
    await menu(page);
    await pauseSection(page, "systems");
    await click(page, "#campaign-sound");
    await idle(page);
    await page.clock.resume();
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector("#campaign-game")?.dataset.campaignArt ===
        "ready",
    );
    assert.match(
      await page.locator("#campaign-start").textContent(),
      /Continue/i,
    );
    assert.match(
      await page.locator("#campaign-title-sound").textContent(),
      /off/i,
    );
    await click(page, "#campaign-start");
    await idle(page);
    await menu(page);
    await pauseSection(page, "systems");
    assert.equal(
      await page.locator('[data-setting="reducedMotion"]').isChecked(),
      true,
    );
    checks.push(
      "Returning pilot boots on Continue; mute and reduced motion survive reload",
    );
    await pauseSection(page, "controls");
    await page
      .locator("#campaign-bindings")
      .locator("..")
      .locator("summary")
      .click();
    const leftKeys = '[data-remap="left"]';
    const originalKeys = await page.locator(leftKeys).allTextContents();
    await page
      .locator(leftKeys)
      .evaluateAll((buttons) => (window.__bindingNodes = buttons));
    await click(page, '[data-remap="left"][data-slot="1"]');
    await page.keyboard.press("z");
    await idle(page);
    assert.equal(
      await page.locator(leftKeys).count(),
      2,
      "Both key slots survive a keyed binding update",
    );
    assert.equal(
      await page
        .locator(leftKeys)
        .evaluateAll((buttons) =>
          buttons.every(
            (button, index) => button === window.__bindingNodes[index],
          ),
        ),
      true,
      "Both binding buttons retain Element identity",
    );
    assert.equal(
      await page.locator('[data-remap="left"][data-slot="0"]').textContent(),
      originalKeys[0],
    );
    assert.match(
      await page.locator('[data-remap="left"][data-slot="1"]').textContent(),
      /z/i,
    );
    await command(page, "reset-bindings");
    assert.deepEqual(
      await page.locator(leftKeys).allTextContents(),
      originalKeys,
      "Reset restores both original bindings",
    );
    checks.push(
      "Primary and secondary remapping preserve both controls and reset to defaults",
    );
    noErrors(page);
    await writeFile(
      `${output}/results.json`,
      JSON.stringify({ checks, menus }, null, 2),
    );
    checks.forEach((check) => console.log("PASS " + check));
    return checks;
  } catch (error) {
    await writeFile(
      `${output}/failure.json`,
      JSON.stringify(
        {
          message: error.message,
          checks,
          menus,
          body: await page.locator("body").innerText(),
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: `${output}/failure.png` });
    throw error;
  } finally {
    await context.close();
  }
}

export async function runWrappedLabelSmoke(browser, base, output) {
  await mkdir(output, { recursive: true });
  const { context, page } = await ready(browser, base);
  try {
    await freeze(page);
    const snapshot = await exportCheckpoint(page);
    snapshot.state.vehicle = { x: 39.5, y: -0.36, energy: 10, hull: 10 };
    await importCheckpoint(page, snapshot);
    await closeOverlay(page);
    await advance(page, 350);
    await keys(page, ["ArrowRight"]);
    await advance(page, 650);
    await keys(page, []);
    await advance(page, 600);
    const values = await page.evaluate(() => {
      const d = document.getElementById("campaign-game").dataset;
      const home = document.getElementById("campaign-home-beacon");
      const canonical = Number(d.rigWorldX),
        tile = Number(d.viewTile),
        rig = Number(d.rigScreenX);
      const dx = ((((5.5 - canonical + 20) % 40) + 40) % 40) - 20;
      return {
        canonical,
        rig,
        expectedHomeX: rig + dx * tile,
        actualHomeX: parseFloat(home.style.left),
        hidden: home.hidden,
        clamped: home.dataset.clamped,
        text: home.textContent,
      };
    });
    await writeFile(
      `${output}/wrapped-labels.json`,
      JSON.stringify({ source: base, ...values }, null, 2),
    );
    await page.screenshot({ path: `${output}/wrapped-labels.png` });
    assert.ok(
      values.canonical < 10,
      "Native movement crosses the horizontal seam",
    );
    assert.equal(
      values.hidden,
      false,
      "HOME remains visible outside the docking radius",
    );
    assert.ok(
      Math.abs(values.expectedHomeX - values.actualHomeX) < 2,
      "HOME is attached to the nearest wrapped world copy",
    );
    noErrors(page);
    console.log(
      "PASS Native seam traversal keeps HOME label attached to its world position",
    );
    return values;
  } finally {
    await context.close();
  }
}

/** Real-clock DOM regression: pointerup/cancel runs before a due timer task. */
export async function runConfirmationTimerSmoke(browser, moduleBase, output) {
  await mkdir(output, { recursive: true });
  const { context, page } = await ready(browser, moduleBase);
  try {
    await page.evaluate(async () => {
      const { setupConfirmationControls } =
        await import("/src/campaign/ui/confirmation.ts");
      const dialog = document.createElement("dialog");
      dialog.id = "timer-race-dialog";
      dialog.setAttribute("aria-label", "Confirmation timer regression");
      const button = document.createElement("button");
      button.id = "timer-race-button";
      button.textContent = "Replace checkpoint";
      dialog.append(button);
      document.body.append(dialog);
      dialog.showModal();
      window.__confirmationTimerProbe = { count: 0 };
      window.__confirmationTimerProbe.controls = setupConfirmationControls({
        button,
        requiresHold: () => true,
        onConfirm: () => {
          window.__confirmationTimerProbe.count++;
        },
      });
      window.__confirmationTimerProbe.controls.reset("Replace checkpoint");
    });
    const runEvent = async (type) => {
      const box = await page.locator("#timer-race-button").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.evaluate((eventType) => {
        const end = performance.now() + 720;
        while (performance.now() < end) {
          /* deliberately occupy the event loop */
        }
        document.getElementById("timer-race-button").dispatchEvent(
          new PointerEvent(eventType, {
            bubbles: true,
            pointerId: 1,
            button: 0,
          }),
        );
      }, type);
      await page.mouse.up();
      await page.waitForTimeout(30);
      return await page.evaluate(() => window.__confirmationTimerProbe.count);
    };
    assert.equal(
      await runEvent("pointercancel"),
      0,
      "Cancellation after700ms never confirms even with a due timer",
    );
    await page.evaluate(() =>
      window.__confirmationTimerProbe.controls.reset("Replace checkpoint"),
    );
    assert.equal(
      await runEvent("pointerup"),
      1,
      "An uninterrupted elapsed hold confirms once before its delayed timer task",
    );
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.__confirmationTimerProbe.count),
      1,
      "Delayed tasks cannot confirm a second time",
    );
    const results = {
      source: moduleBase,
      blockedMilliseconds: 720,
      cancelConfirmations: 0,
      releaseConfirmations: 1,
    };
    await writeFile(
      `${output}/confirmation-timer.json`,
      JSON.stringify(results, null, 2),
    );
    noErrors(page);
    console.log(
      "PASS Real-clock delayed-timer hold commits once; cancellation commits zero times",
    );
    return results;
  } finally {
    await context.close();
  }
}

export async function runResponsiveTerminalSmoke(browser, base, output) {
  const fixture = JSON.parse(
    await readFile(
      new URL("../tests/fixtures/improvement-w02.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.state.vehicle = { x: 5.5, y: -0.36, energy: 9, hull: 7 };
  const results = [];
  for (const viewport of [
    { width: 393, height: 851 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
  ]) {
    const { context, page } = await ready(browser, base, {
      viewport,
      isMobile: true,
      hasTouch: true,
    });
    try {
      await freeze(page);
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await advance(page, 350);
      await page.keyboard.press("e");
      for (const section of ["service", "hardware", "lander"]) {
        await tab(page, section);
        const metrics = await menuMetrics(page);
        const fit = await page.locator("#campaign-dock").evaluate((dialog) => {
          const rect = dialog.getBoundingClientRect();
          const contentRect = dialog
            .querySelector("#campaign-dock-content")
            .getBoundingClientRect();
          const visibleActions = [
            ...dialog.querySelectorAll(
              "#campaign-dock-content button[data-command]",
            ),
          ].filter((button) => {
            const r = button.getBoundingClientRect();
            return (
              r.height > 0 &&
              r.top >= contentRect.top &&
              r.bottom <= contentRect.bottom
            );
          }).length;
          const visible = [...dialog.querySelectorAll("button")].filter(
            (el) => !el.closest("[hidden]") && el.getClientRects().length,
          );
          return {
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            scroll: dialog.scrollHeight,
            client: dialog.clientHeight,
            bodyScroll: document.documentElement.scrollHeight,
            contentHeight: contentRect.height,
            visibleActions,
            minButtonHeight: Math.min(
              ...visible.map((el) => el.getBoundingClientRect().height),
            ),
          };
        });
        const id = `${viewport.width}x${viewport.height}-${section}`;
        results.push({ id, ...metrics, fit });
        await writeFile(
          `${output}/responsive-panels.json`,
          JSON.stringify(results, null, 2),
        );
        await page.screenshot({ path: `${output}/${id}.png` });
        assert.ok(
          fit.x >= 0 &&
            fit.y >= 0 &&
            fit.right <= fit.viewportWidth + 1 &&
            fit.bottom <= fit.viewportHeight + 1,
          `${id} terminal stays within viewport`,
        );
        assert.ok(
          fit.scroll <= fit.client + 1 &&
            fit.bodyScroll <= fit.viewportHeight + 1,
          `${id} outer interface never page-scrolls`,
        );
        assert.ok(
          fit.contentHeight >= 150,
          `${id} leaves a useful content region`,
        );
        if (section !== "lander")
          assert.ok(
            fit.visibleActions >= 1,
            `${id} opens with a transaction action visible`,
          );
        assert.ok(
          fit.minButtonHeight >= 44,
          `${id} all action targets are at least44px high`,
        );
        assert.ok(
          metrics.readable >= 0.8,
          `${id} at least80% of body words are14px`,
        );
        assert.ok(metrics.words <= 60, `${id} body stays within60 words`);
      }
      noErrors(page);
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${output}/responsive-panels.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(
    "PASS Responsive terminal boundaries, 44px targets, readable body text and phone captures",
  );
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    await runPlanUISmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.PLAN_UI_ARTIFACTS || "artifacts/plan-ui",
    );
    await runResponsiveTerminalSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.PLAN_UI_ARTIFACTS || "artifacts/plan-ui",
    );
    await runWrappedLabelSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.PLAN_UI_ARTIFACTS || "artifacts/plan-ui",
    );
    if (process.env.PLAN_UI_MODULE_BASE)
      await runConfirmationTimerSmoke(
        browser,
        process.env.PLAN_UI_MODULE_BASE,
        process.env.PLAN_UI_ARTIFACTS || "artifacts/plan-ui",
      );
  } finally {
    await browser.close();
  }
}
