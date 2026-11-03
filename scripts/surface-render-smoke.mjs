/** Production atlas upload/transparency regression, including Firefox's actual renderer. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { launchBrowser } from "./browser-launch.mjs";
import {
  click,
  closeOverlay,
  importCheckpoint,
  idle,
} from "./campaign-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const engine = process.env.BROWSER || "chromium";
const output = process.env.SURFACE_ARTIFACTS || `artifacts/surface-${engine}`;
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const results = {
  engine,
  base,
  cases: [],
  notes: [
    "Desktop Firefox with phone viewport/touch/DPR emulation is not physical Firefox Android validation.",
    "The isolated board uses production-loaded atlas frames and Phaser Images; its CPU reference verifies colour and transparent silhouettes, not artistic quality.",
    "Auto records the renderer actually selected; a Canvas result does not certify Firefox WebGL.",
  ],
};
try {
  for (const layout of ["desktop", "phone"]) {
    for (const requested of ["auto", "canvas"]) {
      for (const worldId of ["W01", "W02"]) {
        const name = `${layout}-${requested}-${worldId}`;
        const viewport =
          layout === "phone"
            ? { width: 393, height: 851 }
            : { width: 1440, height: 900 };
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: layout === "phone" ? 3 : 2,
          hasTouch: layout === "phone",
        });
        await context.addInitScript(() => {
          localStorage.setItem(
            "motherload.campaign.preferences.v1",
            JSON.stringify({
              reducedMotion: true,
              coachSkipped: true,
              sound: false,
              renderScale: 2,
            }),
          );
          Object.defineProperty(window, "Phaser", {
            configurable: true,
            set(phaser) {
              const Game = phaser.Game;
              phaser.Game = new Proxy(Game, {
                construct(Target, args) {
                  const game = Reflect.construct(Target, args);
                  window.__surfaceGame = game;
                  return game;
                },
              });
              Object.defineProperty(window, "Phaser", {
                value: phaser,
                writable: true,
                configurable: true,
              });
            },
          });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        console.log(`START ${name}`);
        const faults = [],
          failedAssets = [];
        page.on("pageerror", (error) => faults.push(error.message));
        page.on("response", (response) => {
          if (response.status() >= 400)
            failedAssets.push({
              url: response.url(),
              status: response.status(),
            });
        });
        try {
          const url = new URL(base);
          if (requested === "canvas")
            url.searchParams.set("renderer", "canvas");
          await page.goto(url.href);
          await page.waitForFunction(
            () =>
              document.querySelector("#campaign-game")?.dataset.campaignArt ===
              "ready",
          );
          await click(page, "#campaign-start");
          await idle(page);
          const value = JSON.parse(
            await readFile(
              new URL(
                `../tests/fixtures/improvement-${worldId.toLowerCase()}.json`,
                import.meta.url,
              ),
              "utf8",
            ),
          );
          value.state.vehicle = { x: 5.5, y: -0.36, energy: 10, hull: 10 };
          await importCheckpoint(page, value);
          await closeOverlay(page);
          await idle(page);
          await page.waitForFunction((worldId) => {
            const game = window.__surfaceGame;
            const scene = game?.scene.scenes[0];
            return scene?.children.list.some(
              (child) =>
                child.visible &&
                /^dock-stage-/.test(child.frame?.name) &&
                child.texture.key.startsWith(
                  worldId === "W02" ? "campaign-w02" : "campaign-w01",
                ),
            );
          }, worldId);
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${output}/${name}-world.png` });
          await page.addStyleTag({
            content:
              "body *{visibility:hidden!important}#campaign-game canvas{visibility:visible!important}",
          });
          const report = await page.evaluate(
            ({ worldId }) => {
              const game = window.__surfaceGame;
              const scene = game.scene.scenes[0];
              const gl = game.renderer.gl;
              const info = gl
                ? {
                    version: gl.getParameter(gl.VERSION),
                    renderer: gl.getParameter(gl.RENDERER),
                    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                    maxTextureUnits: gl.getParameter(
                      gl.MAX_TEXTURE_IMAGE_UNITS,
                    ),
                  }
                : null;
              const frames = [
                "dock-stage-0",
                "dock-stage-1",
                "dock-stage-2",
                "dock-stage-3",
                "surface-salvage",
                "refuge-stage-2",
                "relay-stage-2",
              ];
              const canvas = document.createElement("canvas");
              const dpr = devicePixelRatio;
              canvas.width = 360 * dpr;
              canvas.height = 640 * dpr;
              const ctx = canvas.getContext("2d");
              ctx.scale(dpr, dpr);
              const images = [];
              const atlas = worldId === "W02" ? "campaign-w02" : "campaign-w01";
              const entries = [];
              for (const [index, name] of frames.entries()) {
                const key =
                  scene.art.textureFor(name, worldId, scene.artQuality) ??
                  (scene.textures.get(atlas).has(name)
                    ? atlas
                    : "campaign-w01");
                const frame = scene.textures.getFrame(key, name);
                if (!frame || frame.name !== name)
                  throw new Error("Missing production frame: " + name);
                const left = (index % 2) * 180 + 8,
                  top = Math.floor(index / 2) * 160 + 8;
                const image = scene.add
                  .image(left + 8, top + 8, key, name)
                  .setOrigin(0)
                  .setDisplaySize(160, 120)
                  .setDepth(10000);
                images.push(image);
                const sx = image.scaleX,
                  sy = image.scaleY;
                ctx.drawImage(
                  frame.source.image,
                  frame.cutX,
                  frame.cutY,
                  frame.cutWidth,
                  frame.cutHeight,
                  left + frame.x * sx,
                  top + frame.y * sy,
                  frame.cutWidth * sx,
                  frame.cutHeight * sy,
                );
                entries.push({
                  name,
                  key,
                  cutWidth: frame.cutWidth,
                  cutHeight: frame.cutHeight,
                });
              }
              scene.cameras.main.setBackgroundColor("#17232b");
              scene.events.on("postupdate", () => {
                for (const child of scene.children.list)
                  child.setVisible(images.includes(child));
                window.__surfaceBoardFrames =
                  (window.__surfaceBoardFrames || 0) + 1;
              });
              return {
                renderer: gl ? "webgl" : "canvas",
                gl: info,
                dpr,
                coarsePointer: matchMedia("(pointer: coarse)").matches,
                frames: entries,
                expected: canvas.toDataURL("image/png"),
              };
            },
            { worldId },
          );
          await page.waitForFunction(() => window.__surfaceBoardFrames >= 3);
          await page.screenshot({
            path: `${output}/${name}-actual.png`,
            clip: { x: 8, y: 8, width: 360, height: 640 },
          });
          await writeFile(
            `${output}/${name}-expected.png`,
            Buffer.from(report.expected.split(",")[1], "base64"),
          );
          delete report.expected;
          const pixels = JSON.parse(
            execFileSync(
              "python3",
              [
                "scripts/surface-render-pixels.py",
                `${output}/${name}-actual.png`,
                `${output}/${name}-expected.png`,
              ],
              { encoding: "utf8" },
            ),
          );
          results.cases.push({ name, ...report, pixels, faults, failedAssets });
          await writeFile(
            `${output}/results.json`,
            JSON.stringify(results, null, 2) + "\n",
          );
          assert.equal(faults.length, 0, `${name}: no browser exceptions`);
          assert.equal(failedAssets.length, 0, `${name}: no failed assets`);
          assert.ok(
            pixels.opaquePixels > 1000 && pixels.transparentPixels > 1000,
            `${name}: patterned silhouettes are measured`,
          );
          assert.ok(
            pixels.meanChannelError < 8 &&
              pixels.opaqueMismatchFraction < 0.08 &&
              pixels.transparentMismatchFraction < 0.02,
            `${name}: surface atlas colors and transparency match: ${JSON.stringify(pixels)}`,
          );
          if (requested === "canvas") assert.equal(report.renderer, "canvas");
          console.log(
            `PASS ${name}: ${report.renderer}, ${report.frames.length} surface frames, mean error ${pixels.meanChannelError.toFixed(3)}`,
          );
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
