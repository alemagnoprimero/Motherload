/** Worst-case texture residency at the requested DPR, independent of adaptive fallback. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import {
  click,
  idle,
  importCheckpoint,
  closeOverlay,
  freeze,
  advance,
} from "./campaign-smoke.mjs";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const output = process.env.RENDER_ARTIFACTS || "artifacts/render-memory";
await mkdir(output, { recursive: true });
const browser = await launchBrowser(),
  results = {
    base,
    notes: [
      "Deterministic clock installed before boot to measure maximum requested DPR2 without adaptive fallback. Native adaptive behavior is checked separately.",
      "Waits for texture residency to settle after loading each world's middle band and neighbours; W01 shared pages stay resident after travel.",
    ],
    samples: [],
  };
try {
  for (const [form, viewport, touch] of [
    ["desktop", { width: 1440, height: 900 }, false],
    ["phone", { width: 393, height: 851 }, true],
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: touch ? 3 : 2,
      isMobile: touch,
      hasTouch: touch,
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        "motherload.campaign.preferences.v1",
        JSON.stringify({
          reducedMotion: true,
          coachSkipped: true,
          sound: false,
          renderScale: 2,
        }),
      ),
    );
    const page = await context.newPage();
    await freeze(page);
    await page.goto(base + "?renderer=webgl");
    for (let n = 0; n < 100; n++) {
      await advance(page, 50);
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (
        await page.evaluate(
          () =>
            document.querySelector("#campaign-game")?.dataset.campaignArt ===
            "ready",
        )
      )
        break;
    }
    await click(page, "#campaign-start");
    await idle(page);
    const settle = async () => {
      await page.waitForLoadState("networkidle");
      let previous = 0,
        same = 0;
      for (let n = 0; n < 25; n++) {
        await advance(page, 50);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const bytes = await page
          .locator("#campaign-game")
          .evaluate((element) => Number(element.dataset.residentTextureBytes));
        same = bytes === previous ? same + 1 : 0;
        previous = bytes;
        if (same >= 5) break;
      }
      return page.locator("#campaign-game").evaluate((element) => ({
        bytes: Number(element.dataset.residentTextureBytes),
        dpr: Number(element.dataset.viewDpr),
        world: element.dataset.campaignWorld,
      }));
    };
    for (const stage of ["boot", "W01", "W02"]) {
      if (stage !== "boot") {
        const checkpoint = JSON.parse(
          await readFile(
            new URL(
              `../tests/fixtures/improvement-${stage.toLowerCase()}.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const world = checkpoint.state.worlds[stage],
          row = stage === "W01" ? 18 : 26,
          x = checkpoint.state.vehicle.x;
        checkpoint.state.vehicle = { x, y: row - 0.36, energy: 9, hull: 10 };
        for (let y = 0; y < row; y++) {
          world.tiles[y * world.width + Math.floor(x)] = 0;
          for (const item of world.packages)
            if (
              item.status === "deposit" &&
              Math.floor(item.x) === Math.floor(x) &&
              Math.floor(item.y) === y
            )
              item.status = "exposed";
        }
        await importCheckpoint(page, checkpoint);
        await closeOverlay(page);
      }
      const sample = { form, stage, ...(await settle()) };
      results.samples.push(sample);
      console.log(JSON.stringify(sample));
      assert.equal(
        sample.dpr,
        2,
        "Worst-case memory remains at requested DPR2",
      );
      sample.limitMiB = touch ? (stage === "boot" ? 20 : 40) : 64;
      sample.gate =
        sample.bytes <= sample.limitMiB * 2 ** 20 ? "pass" : "unmet";
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    output + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
}
assert.ok(
  results.samples.every((sample) => sample.gate === "pass"),
  "Every maximum-quality texture budget passes",
);
