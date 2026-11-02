// Title, returning-player boot, pause menu IA metrics, keyboard order, remapping, locked star map.
import {
  DESKTOP, PHONE, LANDSCAPE, PHONE_OPTS, launch, open, shot, start, measure, activeLabel,
  save, delay, click, freeze, advance, menu, closeOverlay,
} from "./menus-lib.mjs";

const results = {};
const browser = await launch();
try {
  // 1. Fresh title and returning-player boot (desktop)
  {
    const { context, page, errors } = await open(browser, DESKTOP);
    results.titleFresh = {
      overlay: await page.evaluate(() => document.body.dataset.campaignOverlay),
      welcomeOpen: await page.locator("#campaign-welcome").evaluate((d) => d.open),
      titleActions: await page.locator("#campaign-welcome button").count(),
      h1Font: await page.locator("#campaign-welcome-title").evaluate((e) => getComputedStyle(e).fontFamily + " " + getComputedStyle(e).fontWeight + " " + getComputedStyle(e).fontSize),
      hudOpacity: await page.locator(".campaign-hud").evaluate((e) => getComputedStyle(e).opacity),
      focus: await activeLabel(page),
      fontsLoaded: await page.evaluate(() => [...document.fonts].map((f) => f.family + ":" + f.status)),
    };
    await start(page);
    await delay(800);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
    await delay(1200);
    results.returningBoot = {
      overlay: await page.evaluate(() => document.body.dataset.campaignOverlay),
      welcomeOpen: await page.locator("#campaign-welcome").evaluate((d) => d.open),
      menuOpen: await page.locator("#campaign-menu").evaluate((d) => d.open),
      menuTitle: await page.locator("#campaign-menu-title").textContent(),
      focus: await activeLabel(page),
      errors,
    };
    await shot(page, "m01-returning-boot-desktop");
    await context.close();
  }

  // 2. Returning boot on a phone
  {
    const { context, page } = await open(browser, PHONE, PHONE_OPTS);
    await start(page);
    await delay(800);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
    await delay(1200);
    results.returningBootPhone = {
      overlay: await page.evaluate(() => document.body.dataset.campaignOverlay),
      menuTitle: await page.locator("#campaign-menu-title").textContent(),
      resumeBox: await page.locator("#campaign-resume").boundingBox(),
    };
    await shot(page, "m01b-returning-boot-phone");
    results.pausePhone = await measure(page, "#campaign-menu");
    await context.close();
  }

  // 3. Pause menu metrics, keyboard order, locked star map, remapping, new campaign (desktop)
  {
    const { context, page, errors } = await open(browser, DESKTOP);
    await start(page);
    await freeze(page);
    await advance(page, 300);
    await page.keyboard.press("Escape");
    await advance(page, 300);
    results.pauseDesktop = await measure(page, "#campaign-menu");
    results.pauseDesktop.initialFocus = await activeLabel(page);
    // Real Tab traversal: how many presses to reach common targets
    const seq = [];
    for (let n = 0; n < 45; n++) {
      await page.keyboard.press("Tab");
      seq.push(await activeLabel(page));
    }
    results.pauseDesktop.tabSequence = seq;
    const find = (re) => seq.findIndex((s) => re.test(s || "")) + 1;
    results.pauseDesktop.tabsTo = {
      save: find(/Save checkpoint/),
      enableSound: find(/Enable sound/),
      reducedMotion: find(/reducedMotion|Reduced motion/),
      keyboardBindings: find(/Keyboard bindings/),
      startNewCampaign: find(/Start a new campaign/),
      legend: find(/legend/i),
    };
    // Locked star map feedback (before M2)
    await page.keyboard.press("Shift+Tab");
    await click(page, '#campaign-menu [data-command="map"]');
    await advance(page, 300);
    results.lockedStarMap = await page.evaluate(() => {
      const m = document.querySelector("#campaign-message");
      const cs = getComputedStyle(m);
      return {
        overlay: document.body.dataset.campaignOverlay,
        mapOpen: document.querySelector("#campaign-map").open,
        messageText: m.textContent,
        messageVisibility: cs.visibility,
        messageOpacity: cs.opacity,
        buttonDisabled: document.querySelector('#campaign-menu [data-command="map"]').disabled,
      };
    });
    // Remapping
    await page.locator("#campaign-menu details:has(#campaign-bindings) > summary").click({ force: true });
    await advance(page, 200);
    await page.locator("#campaign-bindings").scrollIntoViewIfNeeded();
    await shot(page, "m02-remap-list");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("motherload.campaign.preferences.v1") || "{}").keys || null);
    await page.locator('[data-remap="left"]').click({ force: true });
    const prompt = await page.locator("#campaign-remap-status").textContent();
    await page.keyboard.press("j");
    await advance(page, 100);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("motherload.campaign.preferences.v1") || "{}").keys?.left || null);
    const doneMsg = await page.locator("#campaign-remap-status").textContent();
    await page.locator('[data-remap="right"]').click({ force: true });
    await page.keyboard.press("j");
    const conflictMsg = await page.locator("#campaign-remap-status").textContent();
    await page.keyboard.press("Escape");
    await advance(page, 100);
    const menuStillOpen = await page.locator("#campaign-menu").evaluate((d) => d.open);
    await shot(page, "m02b-remap-after");
    results.remap = {
      defaultLeft: before?.left ?? "(defaults not yet saved; DEFAULT_KEYS left = ArrowLeft + a)",
      prompt, after, doneMsg, conflictMsg, menuStillOpenAfterEscape: menuStillOpen,
      resetButtons: await page.locator('#campaign-menu button:text-matches("reset|default", "i")').count(),
      gamepadRemap: await page.locator("#campaign-menu").evaluate((d) => /gamepad|controller remap/i.test(d.innerHTML)),
    };
    // Settings controls that persist: sound?
    results.soundPersisted = await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("motherload.campaign.preferences.v1") || "{}");
      return { keys: Object.keys(p), hasSound: "sound" in p || "muted" in p };
    });
    // New campaign confirmation (destructive)
    await click(page, '#campaign-menu [data-command="new"]');
    await advance(page, 200);
    results.newCampaignConfirm = await page.evaluate(() => ({
      eyebrow: document.querySelector("#campaign-confirm .eyebrow").textContent,
      title: document.querySelector("#campaign-confirm-title").textContent,
      copy: document.querySelector("#campaign-confirm-copy").textContent,
      accept: document.querySelector("#campaign-confirm-accept").textContent,
      acceptClass: document.querySelector("#campaign-confirm-accept").className,
      focus: document.activeElement?.textContent,
    }));
    await shot(page, "m03-new-campaign-confirm");
    await click(page, "#campaign-confirm-cancel");
    // New campaign button neighbourhood
    results.newCampaignNeighbour = await page.evaluate(() => {
      const b = document.querySelector('#campaign-menu [data-command="new"]');
      const sec = b.closest("section");
      return { section: sec.querySelector("h2").textContent, siblings: [...sec.querySelectorAll("button")].map((x) => x.textContent), className: b.className };
    });
    results.errorsDesktop = errors;
    await context.close();
  }

  // 4. Landscape pause metrics
  {
    const { context, page } = await open(browser, LANDSCAPE, PHONE_OPTS);
    await start(page);
    await freeze(page);
    await advance(page, 300);
    await menu(page);
    await advance(page, 300);
    results.pauseLandscape = await measure(page, "#campaign-menu");
    await shot(page, "m04-pause-landscape");
    await closeOverlay(page);
    await context.close();
  }
} finally {
  await browser.close();
  await save("cap1-results.json", results);
}
