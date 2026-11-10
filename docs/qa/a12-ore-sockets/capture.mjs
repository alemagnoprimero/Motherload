// A12 evidence captures, run from the root of the tree being served (cwd;
// a private copy, so Vite never reloads mid-capture): a04-dive-60m@2, the
// 60 m phone twin a04p-dive-60m-phone@3 (pushed into CAPTURES when the tree
// lacks it, as on main) and a02 spawn, through scripts/art-captures.mjs at
// the given backing; then a04 on both forms with the high-contrast preference
// on (the F4 driver's preference init script), with each frame's view in
// <name>-hc.json. A12_HC_ONLY=1 takes the high-contrast frames alone.
// Usage: PREVIEW_URL=... CHROMIUM_PATH=... node capture.mjs OUT [backing]
import { mkdir, writeFile } from "node:fs/promises";
const S = `${process.cwd()}/scripts`;
const { launchBrowser } = await import(`${S}/browser-launch.mjs`);
const { CAPTURES, FORMS, runArtCaptures } = await import(
  `${S}/art-captures.mjs`
);
const { fixture, restore, settledView } = await import(
  `${S}/improvement-smoke.mjs`
);
const { advance, click, freeze, idle } = await import(
  `${S}/campaign-smoke.mjs`
);
const out = process.argv[2];
const backing = Number(process.argv[3] || 2);
const base = process.env.PREVIEW_URL;
if (!CAPTURES.some((c) => c.name === "a04p-dive-60m-phone@3"))
  CAPTURES.push({
    name: "a04p-dive-60m-phone@3",
    form: "phone",
    scene: "60 m",
    panel: "shaft-tall",
    checkpoint: () => fixture("W01", 6),
  });
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
try {
  if (!process.env.A12_HC_ONLY)
    await runArtCaptures(browser, base, out, {
      only: ["a04-dive-60m@2", "a04p-dive-60m-phone@3", "a02-spawn-1440x900@2"],
      backing,
    });
  for (const [form, name] of [
    ["desktop", "a04-dive-60m@2-hc"],
    ["phone", "a04p-dive-60m-phone@3-hc"],
  ]) {
    const context = await browser.newContext(FORMS[form]);
    await context.addInitScript(
      (prefs) =>
        localStorage.setItem(
          "motherload.campaign.preferences.v1",
          JSON.stringify(prefs),
        ),
      { coachSkipped: true, sound: false, renderScale: 2, highContrast: true },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const url = new URL(base);
    url.searchParams.set("mode", "campaign");
    url.searchParams.set("backing", String(backing));
    await page.goto(url.href);
    await page.waitForFunction(
      () =>
        document.querySelector("#campaign-game")?.dataset.campaignArt ===
        "ready",
    );
    await page.evaluate(() => window.__campaignDebug?.sceneClock.freeze(0));
    if (await page.locator("#campaign-start").isVisible())
      await click(page, "#campaign-start");
    await idle(page);
    await freeze(page);
    const checkpoint = fixture("W01", 6);
    await restore(page, checkpoint);
    await settledView(page, checkpoint);
    const hc = await page
      .locator("#campaign-game")
      .getAttribute("data-high-contrast");
    if (hc !== "true") throw new Error(`${name}: high contrast is ${hc}`);
    await page.screenshot({ path: `${out}/${name}.png` });
    await page.evaluate(() => window.__campaignDebug.overlays(false));
    await advance(page, 50);
    await page.screenshot({ path: `${out}/${name}-hudfree.png` });
    const view = await page.locator("#campaign-game").evaluate((el) => ({
      tile: Number(el.dataset.viewTile),
      scrollX: Number(el.dataset.viewCameraX),
      scrollY: Number(el.dataset.viewCameraY),
      backing: Number(el.dataset.backingScale ?? el.dataset.renderScale),
      dpr: window.devicePixelRatio,
    }));
    await writeFile(`${out}/${name}.json`, JSON.stringify(view) + "\n");
    console.log(name, JSON.stringify(view));
    if (errors.length) throw new Error(errors.join("\n"));
    await context.close();
  }
} finally {
  await browser.close();
}
