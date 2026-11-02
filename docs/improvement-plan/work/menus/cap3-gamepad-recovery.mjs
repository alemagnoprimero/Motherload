// Controller navigation inside menus (fake standard gamepad) and the disabled-rig recovery flow.
import {
  DESKTOP, PHONE, PHONE_OPTS, launch, open, withFixture, shot, activeLabel, save, delay, click,
  advance, freeze, start, world, dockAt,
} from "./menus-lib.mjs";

const results = {};
const browser = await launch();
const fakePad = () => {
  const pad = {
    id: "QA standard gamepad",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  window.__pad = pad;
  Object.defineProperty(Navigator.prototype, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
};
async function press(page, index, ms = 150) {
  await page.evaluate((i) => { window.__pad.buttons[i].pressed = true; window.__pad.buttons[i].value = 1; }, index);
  await advance(page, ms);
  await page.evaluate((i) => { window.__pad.buttons[i].pressed = false; window.__pad.buttons[i].value = 0; }, index);
  await advance(page, ms);
}
async function stick(page, axis, value, ms = 300) {
  await page.evaluate(([a, v]) => { window.__pad.axes[a] = v; }, [axis, value]);
  await advance(page, ms);
  await page.evaluate((a) => { window.__pad.axes[a] = 0; }, axis);
  await advance(page, 150);
}
const state = (page) =>
  page.evaluate(() => ({
    overlay: document.body.dataset.campaignOverlay || null,
    active: (document.activeElement?.tagName || "") + " '" + (document.activeElement?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28) + "'",
    dockTab: document.querySelector('#campaign-dock [aria-selected="true"]')?.dataset.tab || null,
    credits: document.querySelector("#campaign-dock-credits")?.textContent,
  }));

try {
  // G1. Pause menu with a controller only
  try {
    const { context, page } = await open(browser, DESKTOP, {}, fakePad);
    await start(page);
    await freeze(page);
    await advance(page, 300);
    const log = [];
    await press(page, 9); // Start
    log.push(["Start", await state(page)]);
    await press(page, 13); // D-pad down
    log.push(["D-pad down", await state(page)]);
    await stick(page, 1, 0.9); // left stick down
    log.push(["Stick down", await state(page)]);
    await press(page, 0); // A
    log.push(["A", await state(page)]);
    await press(page, 1); // B (back?)
    log.push(["B", await state(page)]);
    await press(page, 9); // Start again
    log.push(["Start", await state(page)]);
    results.pauseWithPad = log;
    await context.close();
  } catch (e) { results.errorG1 = e.message.slice(0, 300); }

  // G2. Terminal with a controller only (rig parked at the lander, M1 done, credits available)
  try {
    const { context, page } = await withFixture(browser, DESKTOP, (fx) => {
      dockAt(fx);
      fx.state.progress.completed = [1];
      fx.state.progress.beacon = true;
      fx.state.progress.bankedOre = 3;
      fx.state.credits = 25000;
    }, {}, fakePad);
    const log = [];
    await press(page, 4); // LB interact
    log.push(["LB", await state(page)]);
    await press(page, 5); // RB (map)
    log.push(["RB", await state(page)]);
    await press(page, 15); // D-pad right
    log.push(["D-pad right", await state(page)]);
    await press(page, 13); // D-pad down
    log.push(["D-pad down", await state(page)]);
    await press(page, 0); // A
    log.push(["A", await state(page)]);
    await press(page, 1); // B
    log.push(["B", await state(page)]);
    await press(page, 9); // Start
    log.push(["Start", await state(page)]);
    results.dockWithPad = log;
    results.dockPrompt = await page.evaluate(() => document.querySelector("#campaign-dock-toggle")?.textContent);
    await context.close();
  } catch (e) { results.errorG2 = e.message.slice(0, 300); }

  // C. Disabled rig on the surface, away from the lander: overlay, confirmation, result.
  for (const [name, vp, opts] of [["desktop", DESKTOP, {}], ["phone", PHONE, PHONE_OPTS]]) {
    try {
      const { context, page } = await withFixture(browser, vp, (fx) => {
        fx.state.vehicle.x = 14.5;
        fx.state.vehicle.y = -0.36;
        fx.state.vehicle.energy = 0;
        fx.state.credits = 3400;
        const w = world(fx);
        for (const p of w.packages.filter((p) => p.status === "deposit" && p.y > 30).slice(0, 4)) p.status = "carried";
      }, opts);
      await advance(page, 400);
      await shot(page, "m06a-disabled-overlay-" + name);
      results["disabled_" + name] = await page.evaluate(() => {
        const card = document.querySelector("#campaign-disabled");
        const r = card.getBoundingClientRect();
        return {
          visible: !card.hidden,
          box: { w: Math.round(r.width), h: Math.round(r.height) },
          title: document.querySelector("#campaign-disabled-title").textContent,
          copy: document.querySelector("#campaign-disabled-copy").textContent,
          buttons: [...card.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.textContent),
          dangerText: document.querySelector("#campaign-danger").textContent,
        };
      });
      await click(page, "#campaign-disabled-recover");
      await advance(page, 200);
      results["recoveryConfirm_" + name] = await page.evaluate(() => ({
        eyebrow: document.querySelector("#campaign-confirm .eyebrow").textContent,
        title: document.querySelector("#campaign-confirm-title").textContent,
        copy: document.querySelector("#campaign-confirm-copy").textContent,
        words: document.querySelector("#campaign-confirm-copy").textContent.trim().split(/\s+/).length,
        accept: document.querySelector("#campaign-confirm-accept").textContent,
        cancel: document.querySelector("#campaign-confirm-cancel").textContent,
      }));
      await shot(page, "m06b-recovery-confirm-" + name);
      await click(page, "#campaign-confirm-accept");
      await advance(page, 600);
      results["afterRecovery_" + name] = await page.evaluate(() => ({
        overlay: document.body.dataset.campaignOverlay,
        menuTitle: document.querySelector("#campaign-menu-title").textContent,
        message: document.querySelector("#campaign-message").textContent,
      }));
      await shot(page, "m06c-after-recovery-" + name);
      await context.close();
    } catch (e) { results["errorC_" + name] = e.message.slice(0, 300); }
  }
} finally {
  await browser.close();
  await save("cap3-results.json", results);
}
