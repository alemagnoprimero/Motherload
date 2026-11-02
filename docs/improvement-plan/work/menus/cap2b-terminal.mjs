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
  try {
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
  } catch (e) { results["error_B"] = String(e.message).slice(0,400); console.log("ERR", e.message.slice(0,300)); }
  try {
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
  } catch (e) { results["error_C"] = String(e.message).slice(0,400); console.log("ERR", e.message.slice(0,300)); }
  try {
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
  } catch (e) { results["error_D"] = String(e.message).slice(0,400); console.log("ERR", e.message.slice(0,300)); }
  try {
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
  } catch (e) { results["error_E"] = String(e.message).slice(0,400); console.log("ERR", e.message.slice(0,300)); }
  try {
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
  } catch (e) { results["error_F"] = String(e.message).slice(0,400); console.log("ERR", e.message.slice(0,300)); }
} finally {
  await browser.close();
  await save("cap2b-results.json", results);
}
