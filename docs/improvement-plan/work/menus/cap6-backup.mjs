// Does "Start a new campaign" really keep the previous campaign as a restorable backup?
import { DESKTOP, launch, open, start, save, click, advance, freeze, menu, exportCheckpoint, delay } from "./menus-lib.mjs";

const results = {};
const browser = await launch();
const idle = async (page) => {
  for (let n = 0; n < 100; n++) {
    if (await page.evaluate(() => document.body.dataset.campaignBusy !== "true")) return;
    await delay(20);
  }
};
try {
  for (const playSeconds of [0, 6]) {
    const { context, page } = await open(browser, DESKTOP);
    await start(page);
    await freeze(page);
    await advance(page, 500);
    const original = (await exportCheckpoint(page, true)).state.seed;
    await menu(page);
    await click(page, '#campaign-menu [data-command="new"]');
    await click(page, "#campaign-confirm-accept");
    await delay(400);
    await idle(page);
    const fresh = (await exportCheckpoint(page, false)).state.seed;
    // resume and play for a few seconds so the 5 s autosave runs
    await click(page, "#campaign-resume");
    await advance(page, playSeconds * 1000);
    await idle(page);
    await menu(page);
    const restoreEnabled = await page.locator('#campaign-menu [data-command="restore"]').isEnabled();
    let restored = null;
    if (restoreEnabled) {
      await click(page, '#campaign-menu [data-command="restore"]');
      await click(page, "#campaign-confirm-accept");
      await delay(400);
      await idle(page);
      restored = (await exportCheckpoint(page, false)).state.seed;
    }
    results["play_" + playSeconds + "s"] = {
      original, fresh, restoreEnabled, restored,
      restoredOriginal: restored === original,
    };
    await context.close();
  }
} catch (e) {
  results.error = e.message.slice(0, 300);
} finally {
  await browser.close();
  await save("cap6-results.json", results);
}
