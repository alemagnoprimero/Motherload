/** Observe the production full-frame adaptive quality policy with native clocks. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import { click, idle, keys } from "./campaign-smoke.mjs";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const output = process.env.RENDER_ARTIFACTS || "artifacts/render-adaptive";
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "motherload.campaign.preferences.v1",
      JSON.stringify({ coachSkipped: true, sound: false, renderScale: 2 }),
    ),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "?renderer=webgl");
  await page.waitForFunction(
    () =>
      document.querySelector("#campaign-game")?.dataset.campaignArt === "ready",
  );
  await click(page, "#campaign-start");
  await idle(page);
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const timeline = [];
  await keys(page, ["ArrowDown"]);
  for (let second = 0; second < 15; second++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    timeline.push(
      await page.locator("#campaign-game").evaluate((element) => ({
        requested: Number(element.dataset.renderDprRequested),
        actual: Number(element.dataset.viewDpr),
        frameMs: Number(element.dataset.renderFrameMilliseconds),
        textureBytes: Number(element.dataset.residentTextureBytes),
        renderer: element.dataset.renderer,
        backingWidth: element.querySelector("canvas").width,
        backingHeight: element.querySelector("canvas").height,
      })),
    );
  }
  await keys(page, []);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  assert.deepEqual(errors, []);
  const result = {
    base,
    cpuThrottle: 4,
    timeline,
    actualLevels: [...new Set(timeline.map((sample) => sample.actual))],
    notes: [
      "Production PRE_STEP→POST_RENDER duration includes simulation, DOM update and renderer submission. Device DPR3; requested cap2. Shared cloud stress is not physical-device frame-time evidence.",
    ],
  };
  await writeFile(
    output + "/results.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
  assert.ok(
    timeline.every(
      (sample) =>
        sample.requested === 2 &&
        [1, 1.5, 2].includes(sample.actual) &&
        sample.backingWidth === Math.round(393 * sample.actual) &&
        sample.backingHeight === Math.round(851 * sample.actual),
    ),
  );
  assert.ok(
    timeline.some((sample) => sample.actual < sample.requested),
    "Sustained full-frame load lowers render scale",
  );
} finally {
  await browser.close();
}
