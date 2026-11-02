// The departure moment: launch confirmation -> "Course charted" splash -> navigation archive.
import { DESKTOP, launch, withFixture, shot, save, click, advance, tab, world, dockAt } from "./menus-lib.mjs";

const results = {};
const browser = await launch();
try {
  const { context, page } = await withFixture(browser, DESKTOP, (fx) => {
    dockAt(fx);
    fx.state.credits = 20000;
    fx.state.progress = { beacon: true, bankedOre: 3, completed: [1, 2, 3], unlockedWorlds: ["W01", "W02", "W03"], departed: false };
    for (const m of world(fx).missions) m.status = "banked";
  });
  await page.keyboard.press("e");
  await advance(page, 300);
  await tab(page, "lander");
  await click(page, '#campaign-dock [data-command="depart"]');
  await advance(page, 200);
  await click(page, "#campaign-confirm-accept");
  await advance(page, 700);
  results.splash = await page.evaluate(() => {
    const el = document.querySelector("#campaign-launch");
    return { visible: !el.hidden, text: el.innerText.replace(/\s+/g, " "), animations: document.getAnimations().length };
  });
  await shot(page, "m12-launch-splash");
  await advance(page, 2200);
  results.afterSplash = await page.evaluate(() => ({ overlay: document.body.dataset.campaignOverlay, copy: document.querySelector("#campaign-map-copy").textContent }));
  await shot(page, "m12b-after-splash");
  await context.close();
} catch (e) {
  results.error = e.message.slice(0, 300);
} finally {
  await browser.close();
  await save("cap5-results.json", results);
}
