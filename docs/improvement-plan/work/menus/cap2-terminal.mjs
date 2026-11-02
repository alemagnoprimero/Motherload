// Lander terminal: sell flow, purchase feedback, focus/scroll after purchase, tab metrics,
// recovery confirmation, navigation archive, larger text, rank naming in W02.
import { readFile } from "node:fs/promises";
import {
  DESKTOP, PHONE, PHONE_OPTS, launch, withFixture, shot, measure, activeLabel, save, delay,
  click, advance, tab, closeOverlay, menu, world, dockAt, m1Complete, importCheckpoint, resume,
} from "./menus-lib.mjs";

const results = {};
const browser = await launch();
const snap = (page) =>
  page.evaluate(() => ({
    credits: document.querySelector("#campaign-dock-credits")?.textContent,
    message: document.querySelector("#campaign-dock-message")?.textContent,
    haul: document.querySelector(".haul-summary strong")?.textContent,
    animations: document.getAnimations().length,
    active: document.activeElement?.tagName + (document.activeElement?.id ? "#" + document.activeElement.id : "") + " '" + (document.activeElement?.textContent || "").trim().slice(0, 30) + "'",
    scrollTop: document.querySelector("#campaign-dock-content")?.scrollTop,
  }));

try {
  // A. Sell flow with a mixed hold + a carried mission object, then purchases.
  {
    const { context, page, errors } = await withFixture(browser, DESKTOP, (fx) => {
      dockAt(fx);
      m1Complete(fx);
      fx.state.credits = 6000; // 600 CR
      fx.state.vehicle.energy = 4.2;
      fx.state.vehicle.hull = 7;
      const w = world(fx);
      const want = { "W01-O1": 3, "W01-O2": 2, "W01-O3": 1, "W01-O4": 1 };
      for (const p of w.packages) {
        if (p.status === "deposit" && want[p.itemId] > 0) {
          p.status = "carried";
          want[p.itemId]--;
        }
      }
      for (const m of w.missions) if (/VALVE/.test(m.id)) m.status = "carried";
    });
    await page.keyboard.press("e");
    await advance(page, 400);
    await tab(page, "service");
    results.dockInitialFocus = await activeLabel(page);
    results.serviceBefore = await snap(page);
    results.serviceMetrics = await measure(page, "#campaign-dock");
    await shot(page, "m05a-service-with-cargo");
    await tab(page, "cargo");
    await shot(page, "m05a2-cargo-tab-with-cargo");
    results.cargoTabWithCargo = await measure(page, "#campaign-dock");
    await tab(page, "service");
    await click(page, '#campaign-dock [data-command="bank-sell"]');
    const t0 = await snap(page);
    await advance(page, 120);
    await shot(page, "m05b-after-unload-sell");
    results.afterSell = { immediate: t0, after120ms: await snap(page) };
    // Tab metrics for each tab after sale
    results.tabs = {};
    for (const t of ["service", "hardware", "tools", "lander", "cargo"]) {
      await tab(page, t);
      await advance(page, 100);
      results.tabs[t] = await measure(page, "#campaign-dock");
    }
    // Purchase with mouse: hardware energy
    await tab(page, "hardware");
    await page.locator("#campaign-dock-content").evaluate((el) => (el.scrollTop = el.scrollHeight));
    const beforeBuy = await snap(page);
    await shot(page, "m05c-hardware-before-buy");
    await click(page, '#campaign-dock [data-command="hardware-energy"]');
    const rightAfter = await snap(page);
    await advance(page, 300);
    await shot(page, "m05d-hardware-after-buy");
    results.mousePurchase = { beforeBuy, rightAfter, after300: await snap(page) };
    results.hardwareCardAfterBuy = await page.evaluate(() =>
      [...document.querySelectorAll("#campaign-dock-content article")].map((a) => a.innerText.replace(/\s+/g, " ").slice(0, 160)),
    );
    // Purchase with keyboard: focus hull purchase, press Enter, inspect focus afterwards
    await page.locator('#campaign-dock [data-command="hardware-hull"]').focus();
    const focusBefore = await activeLabel(page);
    await page.keyboard.press("Enter");
    await advance(page, 300);
    const focusAfter = await activeLabel(page);
    await page.keyboard.press("Tab");
    const nextTab = await activeLabel(page);
    results.keyboardPurchase = { focusBefore, focusAfter, firstTabAfterPurchase: nextTab, state: await snap(page) };
    // How many Tab presses from dock open to the 5th hardware purchase button?
    await closeOverlay(page);
    await advance(page, 300);
    await page.keyboard.press("e");
    await advance(page, 300);
    const seq = [];
    for (let n = 0; n < 16; n++) {
      await page.keyboard.press("Tab");
      seq.push(await activeLabel(page));
    }
    results.dockTabSequence = seq;
    results.tablistSemantics = await page.evaluate(() => {
      const nav = document.querySelector("#campaign-dock nav");
      const b = nav.querySelector("button");
      return { navRole: nav.getAttribute("role"), buttonRole: b.getAttribute("role"), ariaSelected: b.getAttribute("aria-selected"), ariaControls: b.getAttribute("aria-controls"), panelRole: document.querySelector("#campaign-dock-content").getAttribute("role") };
    });
    // Arrow keys between tabs?
    await page.locator('#campaign-dock [data-tab="service"]').focus();
    await page.keyboard.press("ArrowRight");
    results.arrowOnTab = { focus: await activeLabel(page), selected: await page.evaluate(() => document.querySelector('#campaign-dock [aria-selected="true"]').dataset.tab) };
    // Focus ring on a tab (screenshot crop)
    await page.locator('#campaign-dock [data-tab="lander"]').focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const navBox = await page.locator("#campaign-dock nav").boundingBox();
    await shot(page, "m05e-tab-focus-ring", { x: navBox.x, y: navBox.y - 8, width: navBox.width, height: navBox.height + 16 });
    // Lander tab: construction funding state
    await tab(page, "lander");
    await shot(page, "m05f-lander-tab");
    results.errorsA = errors;
    await context.close();
  }

  // B. Enter-to-dock with key repeat: does a repeated Enter press Undock?
  {
    const { context, page } = await withFixture(browser, DESKTOP, (fx) => dockAt(fx));
    await page.locator("#campaign-game").focus();
    await page.keyboard.down("Enter");
    await advance(page, 100);
    const opened = await page.locator("#campaign-dock").evaluate((d) => d.open);
    const focusAfterOpen = await activeLabel(page);
    await page.keyboard.down("Enter"); // auto-repeat keydown (repeat: true)
    await advance(page, 100);
    await page.keyboard.up("Enter");
    await advance(page, 100);
    results.enterRepeat = { opened, focusAfterOpen, stillOpenAfterRepeat: await page.locator("#campaign-dock").evaluate((d) => d.open) };
    await context.close();
  }

  // C. Disabled rig: recovery overlay and confirmation
  {
    const { context, page } = await withFixture(browser, DESKTOP, (fx) => {
      fx.state.vehicle.x = 20.5;
      fx.state.vehicle.y = 6.64;
      const w = world(fx);
      for (let y = 0; y <= 7; y++) w.tiles[y * w.width + 20] = 0;
      fx.state.vehicle.energy = 0;
      fx.state.credits = 3400;
      for (const p of w.packages.filter((p) => p.status === "deposit").slice(0, 4)) p.status = "carried";
    });
    await advance(page, 400);
    await shot(page, "m06a-disabled-overlay");
    results.disabledOverlay = await page.evaluate(() => ({
      title: document.querySelector("#campaign-disabled-title").textContent,
      copy: document.querySelector("#campaign-disabled-copy").textContent,
      buttons: [...document.querySelectorAll("#campaign-disabled button")].filter((b) => !b.hidden).map((b) => b.textContent),
    }));
    await click(page, "#campaign-disabled-recover");
    await advance(page, 200);
    results.recoveryConfirm = await page.evaluate(() => ({
      title: document.querySelector("#campaign-confirm-title").textContent,
      copy: document.querySelector("#campaign-confirm-copy").textContent,
      words: document.querySelector("#campaign-confirm-copy").textContent.split(/\s+/).length,
      accept: document.querySelector("#campaign-confirm-accept").textContent,
    }));
    await shot(page, "m06b-recovery-confirm");
    await click(page, "#campaign-confirm-accept");
    await advance(page, 500);
    results.afterRecovery = await page.evaluate(() => ({
      overlay: document.body.dataset.campaignOverlay,
      menuTitle: document.querySelector("#campaign-menu-title").textContent,
    }));
    await shot(page, "m06c-after-recovery");
    await context.close();
  }

  // D. Navigation archive after departure (desktop + phone): travel button geometry
  for (const [name, vp, opts] of [["desktop", DESKTOP, {}], ["phone", PHONE, PHONE_OPTS]]) {
    const { context, page } = await withFixture(browser, vp, (fx) => {
      dockAt(fx);
      fx.state.credits = 100000;
      fx.state.progress = { beacon: true, bankedOre: 3, completed: [1, 2, 3], unlockedWorlds: ["W01", "W02", "W03"], departed: true };
      for (const m of world(fx).missions) m.status = "banked";
    }, opts);
    await page.keyboard.press("e");
    await advance(page, 400);
    await click(page, "#campaign-dock-navigation");
    await advance(page, 400);
    results["nav_" + name] = {
      metrics: await measure(page, "#campaign-map"),
      travelButton: await page.locator('#campaign-map [data-command="travel-W02"]').boundingBox(),
      travelLines: await page.locator('#campaign-map [data-command="travel-W02"]').evaluate((b) => Math.round(b.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight || "15"))),
      symbols: await page.evaluate(() => [...document.querySelectorAll("#campaign-map .planet-symbol")].map((s) => { const cs = getComputedStyle(s); return s.closest("article").dataset.world + ":" + cs.clipPath.slice(0, 30) + "|" + cs.backgroundImage.slice(0, 40); })),
    };
    await shot(page, "m07-navigation-" + name);
    await context.close();
  }

  // E. Larger text: how much of the terminal actually scales?
  {
    const { context, page } = await withFixture(browser, DESKTOP, (fx) => { dockAt(fx); m1Complete(fx); fx.state.credits = 25000; });
    await menu(page);
    await page.locator('[data-setting="largeText"]').check({ force: true });
    await closeOverlay(page);
    await advance(page, 300);
    await page.keyboard.press("e");
    await advance(page, 300);
    await tab(page, "hardware");
    results.largeTextHardware = await measure(page, "#campaign-dock");
    await shot(page, "m08-largetext-hardware");
    await context.close();
  }

  // F. W02 rank naming: buy drill rank 1 and rank 2 on the comet
  {
    const raw = JSON.parse(await readFile("/home/user/Motherload/docs/improvement-plan/shots/checkpoint-w02.json", "utf8"));
    const { context, page } = await withFixture(browser, DESKTOP, (fx) => {
      Object.assign(fx, structuredClone(raw));
      fx.state.vehicle.x = 5.5;
      fx.state.vehicle.y = -0.36;
      fx.state.vehicle.energy = 10;
    });
    const ov = await page.evaluate(() => document.body.dataset.campaignOverlay);
    if (ov !== "dock") { await page.keyboard.press("e"); await advance(page, 300); }
    await tab(page, "hardware");
    const card = () => page.evaluate(() => document.querySelector("#campaign-dock-content article").innerText.replace(/\s+/g, " ").slice(0, 200));
    const r = { rank0: await card() };
    await click(page, '#campaign-dock [data-command="hardware-drill"]');
    await advance(page, 200);
    r.msg1 = await page.locator("#campaign-dock-message").textContent();
    r.rank1 = await card();
    await click(page, '#campaign-dock [data-command="hardware-drill"]');
    await advance(page, 200);
    r.msg2 = await page.locator("#campaign-dock-message").textContent();
    r.rank2 = await card();
    await shot(page, "m09-w02-rank2-drill");
    results.rankNaming = r;
    await context.close();
  }
} finally {
  await browser.close();
  await save("cap2-results.json", results);
}
