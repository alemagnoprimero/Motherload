/** Frozen compiled-world comparisons; physics and material sampling remain production code. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { launchBrowser } from "./browser-launch.mjs";
import { installRenderProbe, readRenderProbe } from "./render-probe.mjs";
import {
  click,
  idle,
  freeze,
  advance,
  importCheckpoint,
  closeOverlay,
} from "./campaign-smoke.mjs";
const output = process.env.RENDER_ARTIFACTS || "artifacts/render-acceptance";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const results = {
  base,
  worlds: {},
  limits: { parity: 3, drawCalls: 12, clippedOverdrawScreens: 3, fogEdge: 6 },
  notes: [
    "Parity reports every screenshot pixel, including sprite antialiasing; an outlier is recorded as an unmet target, not silently excluded.",
    "Clipped triangle area counts submitted Phaser triangles inside the viewport before stencil/alpha rejection; this is geometric overdraw, not physical GPU timing.",
    "Fog edge measures adjacent alpha levels in the actual blurred fog and completed light map, enlarged to CSS pixels; it does not measure terrain contrast.",
    "Retained camera-shift comparison excludes the rig footprint because modular vehicle presentation can change while a checkpoint restores; all remaining terrain/world pixels must match byte for byte.",
  ],
};
const checkpoint = async (id) => {
  const value = JSON.parse(
    await readFile(
      new URL(
        `../tests/fixtures/improvement-${id.toLowerCase()}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const world = value.state.worlds[value.state.currentWorld],
    x = id === "W01" ? 31.5 : 12.5,
    row = 18;
  value.state.vehicle = { x, y: row - 0.36, energy: 9, hull: 10 };
  world.discovered.fill(0);
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
  const hidden = [];
  for (let y = 16; y <= 20; y++)
    for (let xx = Math.floor(x) + 6; xx <= Math.floor(x) + 7; xx++) {
      const col = xx % world.width;
      hidden.push([col, y]);
      world.tiles[y * world.width + col] = 2;
      world.discovered[y * world.width + col] = 0;
    }
  return { value, hidden, column: Math.floor(x) + 6 };
};
try {
  for (const renderer of ["canvas", "webgl"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(installRenderProbe);
    await context.addInitScript(() =>
      localStorage.setItem(
        "motherload.campaign.preferences.v1",
        JSON.stringify({
          reducedMotion: true,
          coachSkipped: true,
          sound: false,
          renderScale: 1,
        }),
      ),
    );
    const page = await context.newPage(),
      faults = [];
    page.on("pageerror", (e) => faults.push(e.message));
    await page.goto(base + "?renderer=" + renderer);
    await page.waitForFunction(
      () =>
        document.querySelector("#campaign-game")?.dataset.campaignArt ===
        "ready",
    );
    await click(page, "#campaign-start");
    await idle(page);
    await freeze(page);
    const settle = async () => {
      let previous = "",
        same = 0;
      for (let n = 0; n < 30; n++) {
        await advance(page, 50);
        await new Promise((r) => setTimeout(r, 30));
        const signature = await page
          .locator("#campaign-game")
          .evaluate((el) =>
            [
              el.dataset.residentTextureBytes,
              el.dataset.viewCameraX,
              el.dataset.viewCameraY,
            ].join(":"),
          );
        same = signature === previous ? same + 1 : 0;
        previous = signature;
        if (same >= 4) break;
      }
      await advance(page, 250);
    };
    const capture = async (name, clip) => {
      const hidden = await page.addStyleTag({
        content:
          "body *{visibility:hidden!important}#campaign-game canvas{visibility:visible!important}",
      });
      await page.screenshot({
        path: `${output}/${name}.png`,
        ...(clip ? { clip } : {}),
      });
      await hidden.evaluate((el) => el.remove());
    };
    try {
      for (const id of ["W01", "W02"]) {
        const { value, hidden, column } = await checkpoint(id);
        await importCheckpoint(page, value);
        await closeOverlay(page);
        await settle();
        const info = await page.locator("#campaign-game").evaluate((el) => ({
          view: JSON.parse(el.dataset.viewSnapshot),
          renderer: el.dataset.renderer,
          drawCalls: Number(el.dataset.drawCalls) || null,
          textureBytes: Number(el.dataset.residentTextureBytes),
          dirtyCells: Number(el.dataset.terrainDirtyCells),
          particles: Number(el.dataset.activeParticles),
        }));
        const probe = await page.evaluate(readRenderProbe);
        info.probe = probe;
        assert.equal(info.renderer, renderer);
        if (renderer === "webgl") {
          assert.ok(
            info.drawCalls > 0 && info.drawCalls <= results.limits.drawCalls,
          );
          assert.ok(
            probe.geometryFrames > 0,
            "GL triangle uploads are measured",
          );
          assert.equal(
            probe.unsupportedDraws,
            0,
            "All screen draw geometry is accounted for",
          );
        }
        assert.notEqual(
          probe.fogBlurMaximumAlphaStep,
          null,
          "The real fog texture was sampled",
        );
        const view = info.view;
        const clip = {
          x: column * view.tile - view.scrollX + 5,
          y: 17 * view.tile - view.scrollY + 5,
          width: view.tile * 2 - 10,
          height: view.tile * 3 - 10,
        };
        assert.ok(clip.x > 0 && clip.x + clip.width < 1440);
        await capture(`${renderer}-${id}-solid`, clip);
        await capture(`${renderer}-${id}-world`);
        if (id === "W01") {
          for (const [offset, row] of [
            [6, 18],
            [-6, 18],
            [0, 50],
            [0, 0],
            [0, 18],
          ]) {
            const shifted = structuredClone(value);
            const mine = shifted.state.worlds[shifted.state.currentWorld];
            const x =
              (value.state.vehicle.x + offset + mine.width) % mine.width;
            shifted.state.vehicle.x = x;
            shifted.state.vehicle.y = row - 0.36;
            if (row === 0) mine.tiles[Math.floor(x)] = 1;
            if (offset || row !== 18)
              for (let y = 0; y < row; y++) {
                mine.tiles[y * mine.width + Math.floor(x)] = 0;
                for (const item of mine.packages)
                  if (
                    item.status === "deposit" &&
                    Math.floor(item.x) === Math.floor(x) &&
                    Math.floor(item.y) === y
                  )
                    item.status = "exposed";
              }
            await importCheckpoint(page, shifted);
            await closeOverlay(page);
            await settle();
            if (row === 0) await capture(`${renderer}-${id}-surface-return`);
          }
          await capture(`${renderer}-${id}-returned`);
          execFileSync("python3", [
            "-c",
            "from PIL import Image,ImageChops,ImageDraw;import sys; a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB');box=tuple(float(v) for v in sys.argv[3].split(','));ImageDraw.Draw(a).rectangle(box,fill=0);ImageDraw.Draw(b).rectangle(box,fill=0);assert ImageChops.difference(a,b).getbbox() is None,'Retained terrain did not restore the same pixels after camera shifts'",
            `${output}/${renderer}-${id}-world.png`,
            `${output}/${renderer}-${id}-returned.png`,
            [
              value.state.vehicle.x * view.tile - view.scrollX - view.tile,
              value.state.vehicle.y * view.tile - view.scrollY - view.tile,
              value.state.vehicle.x * view.tile - view.scrollX + view.tile,
              value.state.vehicle.y * view.tile - view.scrollY + view.tile,
            ].join(","),
          ]);
        }
        const air = structuredClone(value),
          mine = air.state.worlds[air.state.currentWorld];
        for (const [x, y] of hidden) {
          mine.tiles[y * mine.width + x] = 0;
          for (const item of mine.packages)
            if (
              item.status === "deposit" &&
              Math.floor(item.x) === x &&
              Math.floor(item.y) === y
            )
              item.status = "exposed";
        }
        await importCheckpoint(page, air);
        await closeOverlay(page);
        await settle();
        await capture(`${renderer}-${id}-air`, clip);
        execFileSync("python3", [
          "-c",
          "from PIL import Image,ImageChops;import sys;assert ImageChops.difference(Image.open(sys.argv[1]).convert('RGB'),Image.open(sys.argv[2]).convert('RGB')).getbbox() is None,'Hidden-air/solid pixels differ'",
          `${output}/${renderer}-${id}-solid.png`,
          `${output}/${renderer}-${id}-air.png`,
        ]);
        results.worlds[renderer + "-" + id] = {
          ...info,
          hiddenGeologyIdentical: true,
          retainedShiftRoundTrip: id === "W01" ? "pass" : "not-sampled",
          gates: {
            drawCalls: renderer === "canvas" ? "not-applicable" : "pass",
            clippedOverdraw:
              probe.clippedOverdrawScreens === null
                ? "unmeasured"
                : probe.clippedOverdrawScreens <=
                    results.limits.clippedOverdrawScreens
                  ? "pass"
                  : "unmet",
            fogEdge:
              probe.fogBlurMaximumAlphaStep <= results.limits.fogEdge
                ? "pass"
                : "unmet",
          },
        };
        await writeFile(
          `${output}/results.json`,
          JSON.stringify(results, null, 2),
        );
        console.log(
          `PASS hidden geology ${renderer}/${id}: air/solid identical; draws=${info.drawCalls}; textures=${(info.textureBytes / 2 ** 20).toFixed(2)} MiB; stationary dirty cells=${info.dirtyCells}; probe=${JSON.stringify(probe)}`,
        );
      }
      assert.deepEqual(faults, []);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
execFileSync("python3", ["scripts/render-pixels.py", output], {
  stdio: "inherit",
});
