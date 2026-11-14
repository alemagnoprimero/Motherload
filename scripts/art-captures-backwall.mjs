/** A8's actual game fixtures. Two explicit full-size strips are reviewed
 * inside the original SITE-4's known air. T4 owns automatic clipped slots,
 * parallax and paired upright repeats; no cave, discovery or collision is edited.
 *
 * PREVIEW_URL=… node scripts/art-captures-backwall.mjs OUT
 * ART_SEARCH=field=0 selects fallback; field=1 is the default.
 * BACKWALL_ONLY=prefix,prefix limits both phases for a focused rerun.
 * Screenshots use runArtCaptures' two-identical-frames settled rule.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CAPTURES, runArtCaptures } from "./art-captures.mjs";
import { launchBrowser } from "./browser-launch.mjs";
import { advance } from "./campaign-smoke.mjs";
import { installRenderProbe } from "./render-probe.mjs";
import { backwallFrames } from "../assets/campaign/source/w01-backwall.mjs";
import { reviewFrameKnown } from "../src/campaign/render/dressing-review.ts";

export function backwallCaptures() {
  const captures = CAPTURES.filter((capture) =>
    [
      "a04-dive-60m@2",
      "a04p-dive-60m-phone@3",
      "a05-dive-150m@2",
      "b-330m-plate-band-C@2",
      "c-site-W01-SITE-4-wreck@2",
      "p-portrait-cavern-site4@3",
    ].includes(capture.name),
  );
  for (const [source, name, panel] of [
    ["a05-dive-150m@2", "a05p-dive-150m-phone@3", "shaft-tall"],
    ["b-330m-plate-band-C@2", "b-330mp-plate-band-C-phone@3", "cavern-tall"],
  ])
    captures.push({
      ...CAPTURES.find((capture) => capture.name === source),
      name,
      panel,
      form: "phone",
      twin: true,
    });
  return captures;
}

export function backwallReviewPoses() {
  return backwallFrames().map((frame) => ({
    frame: frame.name,
    world: "W01",
    x: 13.5,
    y: 43.5,
    width: frame.width / 96,
    height: frame.height / 96,
  }));
}

function assertKnownAir(checkpoint, poses, gutter, name) {
  const world = checkpoint.state.worlds.W01;
  const index = (x, y) => y * world.width + x;
  const view = {
    id: world.id,
    width: world.width,
    rows: world.rows,
    known: (x, y) =>
      y >= 0 && y < world.rows && world.discovered[index(x, y)] === 1,
    deposit: () => false,
  };
  for (const pose of poses) {
    assert.ok(
      reviewFrameKnown(pose, view, gutter),
      `${name}: full ${pose.frame} bounds are known`,
    );
    const left = Math.floor(pose.x - pose.width / 2 - gutter);
    const right = Math.ceil(pose.x + pose.width / 2 + gutter) - 1;
    const top = Math.floor(pose.y - pose.height / 2 - gutter);
    const bottom = Math.ceil(pose.y + pose.height / 2 + gutter) - 1;
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++)
        assert.equal(
          world.tiles[index(x, y)],
          0,
          `${name}: ${pose.frame} crosses solid cell ${x},${y}`,
        );
  }
}

export async function runBackwallCaptures(browser, base, out, options = {}) {
  await mkdir(out, { recursive: true });
  const records = {
    convention:
      "Same build before/after two explicit A8 back-wall review poses in original known SITE-4 air. Transit frames have no poses. T4 owns automatic clipping, parallax and paired upright repeat.",
    captures: {},
  };
  for (const phase of ["before", "after"]) {
    await runArtCaptures(browser, base, `${out}/${phase}`, {
      backing: options.backing ?? 2,
      search: options.search ?? "field=1",
      captures: backwallCaptures(),
      only: options.only,
      beforeNavigate: async ({ context }) => {
        // Native startup can contend with the local verify browsers. This
        // changes only the harness timeout, never the settled-frame rule.
        context.setDefaultTimeout(120000);
        context.setDefaultNavigationTimeout(120000);
        await context.addInitScript(installRenderProbe, {
          geometry: false,
          fog: false,
        });
      },
      beforeCapture: async ({ page, capture, checkpoint }) => {
        const poses =
          phase === "after" && capture.scene === "SITE-4"
            ? backwallReviewPoses()
            : [];
        const tileDpr = await page
          .locator("#campaign-game")
          .evaluate(
            (element) =>
              Number(element.dataset.viewTile) *
              Number(element.dataset.backingScale),
          );
        assertKnownAir(checkpoint, poses, 2 / tileDpr, capture.name);
        await page.evaluate(
          (items) => window.__campaignDebug.dressingReview(items),
          poses,
        );
        await advance(page, 350);
        await page.evaluate(() => {
          window.__renderProbe.frames.length = 0;
        });
        await advance(page, 350);
        const report = await page.evaluate(() => ({
          ...window.__campaignDebug.dressingReview(),
          drawn: window.__campaignDebug
            .drawnFrames()
            .filter(({ frame }) => frame.startsWith("cave-backwall-")),
          highContrast:
            document.querySelector("#campaign-game").dataset.highContrast,
          renderer: document.querySelector("#campaign-game").dataset.renderer,
          field: Boolean(window.__campaignField),
          residentTextureBytes: Number(
            document.querySelector("#campaign-game").dataset
              .residentTextureBytes,
          ),
          textures: window.__campaignDebug.textures(),
          parkedFrames: window.__renderProbe.frames.slice(-5),
        }));
        const drawLimit = capture.form === "phone" ? 10 : 12;
        const textureLimit = (capture.form === "phone" ? 40 : 64) * 1024 ** 2;
        const maxDraws = Math.max(...report.parkedFrames.map((f) => f.draws));
        const maxUploads = Math.max(
          ...report.parkedFrames.map((f) => f.uploads + f.subUploads),
        );
        report.gates = { maxDraws, drawLimit, maxUploads, textureLimit };
        records.captures[`${phase}/${capture.name}`] = {
          poses,
          reviewFamilies: ["backwall"],
          report,
        };
        await writeFile(
          `${out}/review-poses.json`,
          JSON.stringify(records, null, 2) + "\n",
        );
        assert.equal(
          report.drawn.length,
          poses.length,
          `${capture.name}: every strip draws`,
        );
        assert.equal(report.renderer, "webgl");
        assert.equal(report.parkedFrames.length, 5);
        assert.ok(
          maxDraws > 0 && maxDraws <= drawLimit,
          `${capture.name}: ${maxDraws} draws exceed ${drawLimit}`,
        );
        assert.equal(maxUploads, 0, `${capture.name}: parked texture uploads`);
        assert.ok(
          report.residentTextureBytes > 0 &&
            report.residentTextureBytes <= textureLimit,
          `${capture.name}: ${report.residentTextureBytes} resident bytes exceed ${textureLimit}`,
        );
        console.log(
          `${phase}/${capture.name}: ${poses.length} strips, ${maxDraws} draws, 0 parked uploads, ${(report.residentTextureBytes / 2 ** 20).toFixed(2)} MiB`,
        );
      },
    });
  }
  return records;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const out = resolve(process.argv[2] || "artifacts/art-backwall");
  const browser = await launchBrowser();
  try {
    await runBackwallCaptures(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      out,
      {
        backing: Number(process.env.ART_BACKING || 2),
        search: process.env.ART_SEARCH ?? "field=1",
        only: process.env.BACKWALL_ONLY?.split(",").filter(Boolean),
      },
    );
  } finally {
    await browser.close();
  }
}
