/**
 * Audit T13b evidence captures, run from the root of the tree being served
 * (a private copy, so Vite never reloads mid-capture):
 *
 *   - a04-dive-60m@2, its 60 m phone twin a04p-dive-60m-phone@3 and the a02
 *     spawn, through scripts/art-captures.mjs at the given backing (the twin
 *     is pushed into CAPTURES when the tree lacks it);
 *   - the W02 ice vent at (8.5, 48.5), band C: the rig rests three cells to
 *     its right on the floor of the vent's cave (row 50), its shaft dug from
 *     the surface, and the cells round the vent are known (the game draws a vent only in a known cell). Desktop
 *     1440 × 900 @2 and phone 393 × 851 @3, frozen scene clock, Render quality
 *     2, with each frame's view and (where the tree has the hook) the sprites
 *     drawn in <name>.json.
 *
 *   PREVIEW_URL=… CHROMIUM_PATH=… node docs/qa/t13b-asset-pipeline/captures.mjs OUT [backing]
 */
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
const VENT = { x: 8.5, y: 48.5 };
/** The rig three cells right of the vent on its cave floor, the cells known. */
function ventCheckpoint() {
  const checkpoint = fixture("W02", 50, VENT.x + 3);
  const mine = checkpoint.state.worlds.W02;
  for (let y = 45; y <= 51; y++)
    for (let x = 5; x <= 13; x++) mine.discovered[y * mine.width + x] = 1;
  return checkpoint;
}
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
try {
  if (!process.env.T13B_VENT_ONLY)
    await runArtCaptures(browser, base, out, {
      only: ["a04-dive-60m@2", "a04p-dive-60m-phone@3", "a02-spawn-1440x900@2"],
      backing,
    });
  for (const [form, name] of [
    ["desktop", "w02-ice-vent@2"],
    ["phone", "w02-ice-vent-phone@3"],
  ]) {
    const context = await browser.newContext(FORMS[form]);
    await context.addInitScript(
      (prefs) =>
        localStorage.setItem(
          "motherload.campaign.preferences.v1",
          JSON.stringify(prefs),
        ),
      { coachSkipped: true, sound: false, renderScale: 2 },
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
    const checkpoint = ventCheckpoint();
    await restore(page, checkpoint);
    await settledView(page, checkpoint);
    await page.screenshot({ path: `${out}/${name}.png` });
    await page.evaluate(() => window.__campaignDebug.overlays(false));
    await advance(page, 50);
    await page.screenshot({ path: `${out}/${name}-hudfree.png` });
    const view = await page.locator("#campaign-game").evaluate((el) => ({
      world: el.dataset.campaignWorld,
      tile: Number(el.dataset.viewTile),
      scrollX: Number(el.dataset.viewCameraX),
      scrollY: Number(el.dataset.viewCameraY),
      width: innerWidth,
      height: innerHeight,
      backing: Number(el.dataset.backingScale ?? el.dataset.renderScale),
      dpr: window.devicePixelRatio,
      pages: el.dataset.atlasPages ?? null,
      // Sprites drawn this frame, where the tree has the hook (T13b on).
      drawn:
        window.__campaignDebug
          .drawnFrames?.()
          .filter(({ frame }) => /^(ice-vent|warning-shelf)$/.test(frame)) ??
        null,
    }));
    await page.evaluate(() => window.__campaignDebug.overlays(true));
    await writeFile(
      `${out}/${name}.json`,
      JSON.stringify({ vent: VENT, ...view }, null, 2) + "\n",
    );
    console.log(name, JSON.stringify(view));
    if (errors.length) throw new Error(errors.join("\n"));
    await context.close();
  }
} finally {
  await browser.close();
}
