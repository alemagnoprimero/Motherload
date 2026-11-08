import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import { advance, freeze, keys, noErrors, ready } from "./campaign-smoke.mjs";
import { restore, settledView } from "./improvement-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:8080/";
const output = process.env.CAMERA_ARTIFACTS || "artifacts/camera";
const forms = process.env.CAMERA_FORMS?.split(",");
/**
 * Audit F5's limits, on the scene clock, where one advance() is one 50 ms
 * frame: the rig moves at most 40 CSS px on screen per frame, and the zoom
 * changes at most 3 % per 100 ms (two frames). CAMERA_REPORT_ONLY=1 records
 * the descents without asserting them, to measure a build from before F5.
 */
const LIMITS = { move: 40, zoom: 0.03 };
const reportOnly = process.env.CAMERA_REPORT_ONLY === "1";
/** A descent ends past 140 m, beyond the deep zoom blend around 120 m. */
const DESCENT_END = 14.6;
const freshW01 = JSON.parse(
  await readFile(
    new URL(
      "../docs/art-audit/prototype/assets/fresh-w01.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const results = [];
const frame = (page) =>
  page.locator("#campaign-game").evaluate((host) => ({
    y: Number(host.dataset.rigWorldY),
    cameraY: Number(host.dataset.viewCameraY),
    rigX: Number(host.dataset.rigScreenX),
    rigY: Number(host.dataset.rigScreenY),
    tile: Number(host.dataset.viewTile),
    view: JSON.parse(host.dataset.viewSnapshot),
  }));
/**
 * The audit's W01 world (fresh-w01.json) at spawn, (20.5, −0.36), over the
 * starter seam. The seam's ore down to row 16 is marked sold, so a full hold
 * never stops the drill; for the drop, the column is also open to row 16,
 * so the rig falls from the surface through 120 m.
 */
function spawnDescent(drop) {
  const checkpoint = structuredClone(freshW01);
  const mine = checkpoint.state.worlds[checkpoint.state.currentWorld];
  const column = Math.floor(checkpoint.state.vehicle.x);
  for (const item of mine.packages)
    if (Math.floor(item.x) === column && item.y < 16) item.status = "sold";
  if (drop)
    for (let y = 0; y < 16; y++) mine.tiles[y * mine.width + column] = 0;
  return checkpoint;
}
/**
 * Audit F5: holds Down from spawn and records every 50 ms frame of the
 * scene clock until the rig passes DESCENT_END: its screen position, the
 * tile size, its movement since the previous frame and the zoom change over
 * the last 100 ms.
 */
async function descend(page, drop) {
  const checkpoint = spawnDescent(drop);
  await restore(page, checkpoint);
  await settledView(page, checkpoint);
  await page.locator("#campaign-game").focus();
  const frames = [await frame(page)];
  await keys(page, ["ArrowDown"]);
  for (let n = 0; n < 1200 && frames.at(-1).y < DESCENT_END; n++) {
    await advance(page, 50);
    frames.push(await frame(page));
  }
  await keys(page, []);
  assert.ok(frames.at(-1).y >= DESCENT_END, "The descent passes 140 m");
  return frames.map((current, n) => ({
    t: Number((n * 0.05).toFixed(2)),
    y: current.y,
    rigX: current.rigX,
    rigY: current.rigY,
    tile: current.tile,
    move:
      n > 0
        ? Math.hypot(
            current.rigX - frames[n - 1].rigX,
            current.rigY - frames[n - 1].rigY,
          )
        : 0,
    zoom100:
      n > 1
        ? Math.abs(current.tile - frames[n - 2].tile) / frames[n - 2].tile
        : 0,
  }));
}

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
      const descents = {};
      for (const kind of ["drill", "drop"]) {
        const samples = await descend(page, kind === "drop");
        const worst = {
          move: Math.max(...samples.map((sample) => sample.move)),
          zoom100: Math.max(...samples.map((sample) => sample.zoom100)),
        };
        descents[kind] = { worst, samples };
        console.log(
          `${name} ${kind}: ${samples.length} frames to row ${samples.at(-1).y.toFixed(2)}; worst rig move ${worst.move.toFixed(1)} CSS px per 50 ms, zoom ${(100 * worst.zoom100).toFixed(2)} % per 100 ms`,
        );
        if (reportOnly) continue;
        assert.ok(
          worst.move <= LIMITS.move,
          `${name} ${kind}: the rig moves ${worst.move.toFixed(1)} CSS px on screen in one 50 ms frame`,
        );
        assert.ok(
          worst.zoom100 <= LIMITS.zoom,
          `${name} ${kind}: the zoom changes ${(100 * worst.zoom100).toFixed(2)} % in 100 ms`,
        );
      }
      results.at(-1).descents = descents;
      noErrors(page);
      if (!reportOnly)
        console.log(
          `PASS ${name}: drilled and dropped descents from spawn through 120 m move the rig ≤${LIMITS.move} CSS px per 50 ms and the zoom ≤3 % per 100 ms`,
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
