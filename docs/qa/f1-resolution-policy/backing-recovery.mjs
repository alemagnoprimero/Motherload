/**
 * F1 recovery probe. Starts a campaign at the given form, then 15 s of stress
 * (4x CPU throttle while holding Down, as scripts/render-adaptive.mjs does)
 * and 60 s unthrottled and idle. Samples the backing scale once a second of
 * real time and reports when it is back at the device's top level.
 *
 * Usage: node docs/qa/f1-resolution-policy/backing-recovery.mjs \
 *          <base-url> <desktop|phone> <out.json>
 */
import { writeFile } from "node:fs/promises";
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import { click, idle, keys } from "../../../scripts/campaign-smoke.mjs";

const [base = "http://127.0.0.1:5173/", form = "desktop", out] =
  process.argv.slice(2);
const settings =
  form === "phone"
    ? {
        viewport: { width: 393, height: 851 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const browser = await launchBrowser();
try {
  const context = await browser.newContext(settings);
  await context.addInitScript(() =>
    localStorage.setItem(
      "motherload.campaign.preferences.v1",
      JSON.stringify({ coachSkipped: true, sound: false, renderScale: 2 }),
    ),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "?renderer=webgl");
  await page.waitForFunction(
    () =>
      document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
  );
  await click(page, "#campaign-start");
  await idle(page);
  const client = await context.newCDPSession(page);
  const read = () =>
    page.locator("#campaign-game").evaluate((element) => ({
      // main reports only renderScale; F1 adds backingScale and qualityTier.
      backing: Number(
        element.dataset.backingScale ?? element.dataset.renderScale,
      ),
      tier: element.dataset.qualityTier ?? null,
      p95: element.dataset.frameP95 ? Number(element.dataset.frameP95) : null,
      frameMs: Number(element.dataset.renderFrameMilliseconds),
      canvas: [
        element.querySelector("canvas").width,
        element.querySelector("canvas").height,
      ],
    }));
  const second = () => new Promise((resolve) => setTimeout(resolve, 1000));
  const timeline = [];
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await keys(page, ["ArrowDown"]);
  for (let n = 1; n <= 15; n++) {
    await second();
    timeline.push({ phase: "stress", second: n, ...(await read()) });
  }
  await keys(page, []);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  for (let n = 1; n <= 60; n++) {
    await second();
    timeline.push({ phase: "recovery", second: n, ...(await read()) });
  }
  const stress = timeline.filter((sample) => sample.phase === "stress");
  const recovery = timeline.filter((sample) => sample.phase === "recovery");
  const top = Math.min(2, settings.deviceScaleFactor);
  const back =
    recovery.find((sample) => sample.backing === top)?.second ?? null;
  const result = {
    base,
    form,
    tier: timeline.at(-1).tier,
    stressMinimumBacking: Math.min(...stress.map((sample) => sample.backing)),
    recoveryFirstSecondAtTop: back,
    recoveryFinalBacking: recovery.at(-1).backing,
    recoveryHeldTop:
      back !== null &&
      recovery
        .filter((sample) => sample.second >= back)
        .every((sample) => sample.backing === top),
    errors,
    timeline,
  };
  if (out) await writeFile(out, JSON.stringify(result, null, 2) + "\n");
  const { timeline: _timeline, ...summary } = result;
  console.log(JSON.stringify(summary));
} finally {
  await browser.close();
}
