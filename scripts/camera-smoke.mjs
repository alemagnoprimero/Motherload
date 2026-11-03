import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import { advance, freeze, keys, noErrors, ready } from "./campaign-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:8080/";
const output = process.env.CAMERA_ARTIFACTS || "artifacts/camera";
const forms = process.env.CAMERA_FORMS?.split(",");
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const results = [];
const frame = (page) =>
  page.locator("#campaign-game").evaluate((host) => ({
    y: Number(host.dataset.rigWorldY),
    cameraY: Number(host.dataset.viewCameraY),
    rigY: Number(host.dataset.rigScreenY),
    tile: Number(host.dataset.viewTile),
    view: JSON.parse(host.dataset.viewSnapshot),
  }));

try {
  for (const [name, viewport, touch] of [
    ["desktop", { width: 1440, height: 900 }, false],
    ["phone", { width: 393, height: 851 }, true],
    ["landscape", { width: 568, height: 320 }, true],
  ]) {
    if (forms && !forms.includes(name)) continue;
    const { context, page } = await ready(browser, base, {
      viewport,
      hasTouch: touch,
      isMobile: touch,
    });
    try {
      await freeze(page);
      await page.locator("#campaign-game").focus();
      await keys(page, ["ArrowDown"]);
      await advance(page, 12000);
      await keys(page, []);
      const initial = await frame(page);
      assert.ok(initial.y > 4, "The native drill opens a real return shaft");
      const frames = [initial];
      await keys(page, ["ArrowUp"]);
      for (let elapsed = 0; elapsed < 12000; elapsed += 50) {
        await advance(page, 50);
        frames.push(await frame(page));
        if (frames.at(-1).y <= -0.3) break;
      }
      await keys(page, []);
      assert.ok(frames.at(-1).y < 0.2, "Native ascent crosses the surface");
      const crossing = frames.findIndex(
        (current, i) => i > 0 && frames[i - 1].y >= 0.2 && current.y < 0.2,
      );
      assert.ok(crossing > 0, "The previous surface cutoff was traversed");
      const movement = frames.flatMap((current, i) => {
        if (i === 0) return [];
        const previous = frames[i - 1];
        if (previous.y > 4 || current.y < 0) return [];
        return [
          {
            y: current.y,
            cameraDelta: Math.abs(current.cameraY - previous.cameraY),
            allowed:
              Math.abs(current.y - previous.y) *
                Math.max(current.tile, previous.tile) *
                4 +
              4,
          },
        ];
      });
      for (const sample of movement)
        assert.ok(
          sample.cameraDelta <= sample.allowed,
          `${name}: surface camera motion follows the rig rather than snapping: ${JSON.stringify(sample)}`,
        );
      await advance(page, 600);
      const surface = await frame(page);
      assert.ok(
        -surface.cameraY + surface.tile * 0.5 <
          viewport.height - surface.view.safe.bottom,
        "The surface remains clear of the lower control band",
      );
      noErrors(page);
      await page.screenshot({ path: `${output}/${name}-return.png` });
      results.push({ name, crossing, movement, frames });
      console.log(
        `PASS ${name}: native drill/ascent, continuous surface framing, clear bottom controls`,
      );
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
