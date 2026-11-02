// Overlay back-navigation (dock -> navigation -> back; pause -> star map -> back) and phone terminal density.
import {
  DESKTOP, PHONE, PHONE_OPTS, launch, withFixture, shot, save, click, advance, tab, menu, world, dockAt, m1Complete,
} from "./menus-lib.mjs";

const results = {};
const browser = await launch();
const overlay = (page) => page.evaluate(() => document.body.dataset.campaignOverlay || null);
const departed = (fx) => {
  dockAt(fx);
  fx.state.credits = 100000;
  fx.state.progress = { beacon: true, bankedOre: 3, completed: [1, 2, 3], unlockedWorlds: ["W01", "W02", "W03"], departed: true };
  for (const m of world(fx).missions) m.status = "banked";
};
try {
  try {
    const { context, page } = await withFixture(browser, DESKTOP, departed);
    const r = {};
    await page.keyboard.press("e");
    await advance(page, 300);
    r.start = await overlay(page);
    await click(page, "#campaign-dock-navigation");
    await advance(page, 300);
    r.afterNavigationTab = await overlay(page);
    r.mapCloseLabel = await page.locator('#campaign-map [data-close="map"]').textContent();
    await click(page, '#campaign-map [data-close="map"]');
    await advance(page, 300);
    r.afterReturnFromMap = await overlay(page);
    await menu(page);
    await click(page, '#campaign-menu [data-command="map"]');
    await advance(page, 300);
    r.pauseThenMap = await overlay(page);
    await page.keyboard.press("Escape");
    await advance(page, 300);
    r.afterEscapeFromMap = await overlay(page);
    results.backstack = r;
    await context.close();
  } catch (e) { results.errorBack = e.message.slice(0, 300); }

  try {
    const { context, page } = await withFixture(browser, PHONE, (fx) => { dockAt(fx); m1Complete(fx); fx.state.credits = 25000; }, PHONE_OPTS);
    await page.keyboard.press("e");
    await advance(page, 400);
    const r = {};
    for (const t of ["service", "hardware", "tools", "lander", "cargo"]) {
      await tab(page, t);
      await advance(page, 150);
      r[t] = await page.evaluate(() => {
        const sheet = document.querySelector("#campaign-dock").getBoundingClientRect();
        const content = document.querySelector("#campaign-dock-content");
        const cards = [...content.querySelectorAll("article")].map((a) => Math.round(a.getBoundingClientRect().height));
        const visible = [...content.querySelectorAll("article")].filter((a) => {
          const b = a.getBoundingClientRect(), c = content.getBoundingClientRect();
          return b.top >= c.top - 1 && b.bottom <= c.bottom + 1;
        }).length;
        const nav = document.querySelector("#campaign-dock nav");
        return {
          sheetHeight: Math.round(sheet.height),
          viewport: innerHeight,
          contentHeight: content.clientHeight,
          scrollHeight: content.scrollHeight,
          cardHeights: cards,
          fullyVisibleCards: visible,
          navOverflow: nav.scrollWidth > nav.clientWidth,
          navScroll: [nav.scrollWidth, nav.clientWidth],
        };
      });
    }
    results.phoneDock = r;
    await tab(page, "hardware");
    await shot(page, "m10-phone-hardware");
    await context.close();
  } catch (e) { results.errorPhone = e.message.slice(0, 300); }

  // Phone W02 terminal: does the six-tab bar overflow?
  try {
    const { context, page } = await withFixture(browser, PHONE, departed, PHONE_OPTS);
    await page.keyboard.press("e");
    await advance(page, 400);
    results.phoneNavTabs = await page.evaluate(() => {
      const nav = document.querySelector("#campaign-dock nav");
      const tabs = [...nav.querySelectorAll("button")].filter((b) => !b.hidden);
      return {
        tabs: tabs.map((b) => b.textContent),
        scrollWidth: nav.scrollWidth,
        clientWidth: nav.clientWidth,
        hiddenTabs: tabs.filter((b) => b.getBoundingClientRect().right > nav.getBoundingClientRect().right + 1).map((b) => b.textContent),
      };
    });
    await shot(page, "m11-phone-six-tabs");
    await context.close();
  } catch (e) { results.errorTabs = e.message.slice(0, 300); }
} finally {
  await browser.close();
  await save("cap4-results.json", results);
}
