/**
 * Art-audit captures, named as docs/ART_QUALITY_AUDIT.md names them (§2, §9.1):
 *
 *   a02-spawn-1440x900@2.png        fresh world at spawn, surface    1440×900 @2
 *   a04-dive-60m@2.png              60 m shaft, band A               1440×900 @2
 *   b-550m-band-D@2.png             550 m shaft, band D              1440×900 @2
 *   c-site-W01-SITE-4-wreck@2.png   SITE-4 wreck cavern, band C      1440×900 @2
 *   p-portrait-03-dive-70m@3.png    70 m shaft                        393×851 @3
 *
 * Built on fixture(), restore() and settledView() from improvement-smoke.mjs
 * (settledView applies settle()'s rule from render-acceptance.mjs to a restored
 * checkpoint) and the campaign-smoke.mjs drive helpers. The shafts are the
 * improvement fixtures. The spawn and SITE-4 frames need a world with sites, so
 * they use fresh-w01.json, the W01 world the audit's captures used
 * (docs/art-audit/prototype/assets/).
 *
 * Each frame is captured on Playwright's clock after the view settles. With
 * ART_PLAY_SECONDS the game first runs on the real clock at the fixture, so the
 * adaptive backing scale acts as shipped.
 *
 * Environment: PREVIEW_URL; ART_CAPTURES_DIR (artifacts/art-captures);
 * ART_CAPTURES, a comma list of names or name prefixes; ART_PLAY_SECONDS (0);
 * ART_BACKING, a backing-scale pin of 1, 1.5 or 2.
 *
 * manifest.json records, per capture, the backing scale and quality tier the
 * game reported, the rig's box in device pixels and its keep@2, and after
 * real-clock play the readout's p95 frame cost.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";
import { freeze, noErrors, ready } from "./campaign-smoke.mjs";
import { fixture, restore, settledView } from "./improvement-smoke.mjs";
import { keepAt2 } from "./render-probe.mjs";

const freshW01 = JSON.parse(
  await readFile(
    new URL(
      "../docs/art-audit/prototype/assets/fresh-w01.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

export const FORMS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: {
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

/**
 * The audit's cavern fixture (docs/art-audit/06-prototype.md, "Cavern"): the
 * rig teleports to (site.x − 2, site.y + 1), everything within 6 tiles is
 * revealed, and the rig drops to the floor. In fresh-w01 that floor is row 46,
 * so the rig rests at y 45.64. The audit also dug a shaft down that column;
 * here the column is open from row 37 and the rows above are out of frame, so
 * nothing is dug (digging would also orphan a buried package, which the
 * import rejects).
 */
function siteCheckpoint(saved, id) {
  const checkpoint = structuredClone(saved);
  const { state } = checkpoint;
  const mine = state.worlds[state.currentWorld];
  const site = (mine.sites ?? []).find((item) => item.id === id);
  if (!site) throw new Error(`${id} is not in ${state.currentWorld}`);
  // Found earlier: no transient discovery notice in the frame.
  site.discovered = true;
  const x = site.x - 2,
    y = site.y + 1,
    column = Math.floor(x);
  const index = (c, row) =>
    row * mine.width + (((c % mine.width) + mine.width) % mine.width);
  for (let row = Math.max(0, Math.floor(y - 6)); row < mine.rows; row++)
    for (let c = Math.floor(x - 6); c <= Math.ceil(x + 6); c++)
      if (Math.hypot(c + 0.5 - x, row + 0.5 - y) <= 6)
        mine.discovered[index(c, row)] = 1;
  let floor = Math.floor(y);
  while (floor < mine.rows - 1 && mine.tiles[index(column, floor)] === 0)
    floor++;
  state.vehicle = { ...state.vehicle, x, y: floor - 0.36 };
  return checkpoint;
}

export const CAPTURES = [
  {
    name: "a02-spawn-1440x900@2",
    form: "desktop",
    checkpoint: () => structuredClone(freshW01),
  },
  {
    name: "a04-dive-60m@2",
    form: "desktop",
    checkpoint: () => fixture("W01", 6),
  },
  {
    // Column 31 opens into a cave at 550 m in this fixture; column 34 has a floor.
    name: "b-550m-band-D@2",
    form: "desktop",
    checkpoint: () => fixture("W01", 55, 34.5),
  },
  {
    name: "c-site-W01-SITE-4-wreck@2",
    form: "desktop",
    checkpoint: () => siteCheckpoint(freshW01, "W01-SITE-4"),
  },
  {
    name: "p-portrait-03-dive-70m@3",
    form: "phone",
    checkpoint: () => fixture("W01", 7),
  },
];

/** The rig sprite's square in device pixels (scene.ts draws it centred). */
async function rigBox(page, dpr) {
  const view = await page.locator("#campaign-game").evaluate((element) => ({
    x: Number(element.dataset.rigScreenX),
    y: Number(element.dataset.rigScreenY),
    tile: Number(element.dataset.viewTile),
  }));
  const size = (view.tile * 64) / 48,
    centreY = view.y - view.tile * 0.015;
  return {
    x: Math.round((view.x - size / 2) * dpr),
    y: Math.round((centreY - size / 2) * dpr),
    width: Math.round(size * dpr),
    height: Math.round(size * dpr),
  };
}

export async function runArtCaptures(browser, base, path, options = {}) {
  const { only, playSeconds = 0, backing } = options;
  await mkdir(path, { recursive: true });
  const url = new URL(base);
  if (backing !== undefined) url.searchParams.set("backing", String(backing));
  const selected = CAPTURES.filter(
    (capture) =>
      !only?.length || only.some((name) => capture.name.startsWith(name)),
  );
  const manifest = {
    base: url.href,
    playSeconds,
    backingPin: backing ?? null,
    captures: {},
  };
  for (const [form, settings] of Object.entries(FORMS)) {
    const captures = selected.filter((capture) => capture.form === form);
    if (!captures.length) continue;
    const { context, page } = await ready(browser, url.href, settings);
    try {
      await freeze(page);
      for (const capture of captures) {
        const checkpoint = capture.checkpoint();
        await restore(page, checkpoint);
        await settledView(page, checkpoint);
        if (playSeconds > 0) {
          await page.clock.resume();
          await new Promise((resolve) =>
            setTimeout(resolve, playSeconds * 1000),
          );
          // pauseAt cannot go back in time: leave room for a long frame.
          await page.clock.pauseAt(
            await page.evaluate(() => Date.now() + 1000),
          );
          await settledView(page, checkpoint);
        }
        const file = `${path}/${capture.name}.png`;
        await page.screenshot({ path: file });
        const reported = await page
          .locator("#campaign-game")
          .evaluate((element) => ({
            world: element.dataset.campaignWorld,
            rig: [
              Number(element.dataset.rigWorldX),
              Number(element.dataset.rigWorldY),
            ],
            tile: Number(element.dataset.viewTile),
            backingScale: Number(
              element.dataset.backingScale ?? element.dataset.renderScale,
            ),
            qualityTier: element.dataset.qualityTier ?? null,
            backingPinned: element.dataset.backingPinned ?? null,
            frameP95: Number(element.dataset.frameP95) || null,
            renderer: element.dataset.renderer,
          }));
        // Playwright's frozen clock makes every frame cost 0 ms: a p95 only
        // means something after real-clock play.
        if (!(playSeconds > 0)) reported.frameP95 = null;
        const box = await rigBox(page, settings.deviceScaleFactor);
        const image =
          "data:image/png;base64," + (await readFile(file)).toString("base64");
        const keep2 = await page.evaluate(keepAt2, { image, crop: box });
        manifest.captures[capture.name] = {
          file,
          viewport: settings.viewport,
          deviceScaleFactor: settings.deviceScaleFactor,
          ...reported,
          rigBox: box,
          rigKeep2: keep2 === null ? null : Number(keep2.toFixed(3)),
        };
        console.log(
          `${capture.name}: backing ${reported.backingScale} (${reported.qualityTier ?? "no tier"}), rig keep@2 ${keep2?.toFixed(3)}`,
        );
      }
      noErrors(page);
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${path}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    await runArtCaptures(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.ART_CAPTURES_DIR || "artifacts/art-captures",
      {
        only: process.env.ART_CAPTURES?.split(",").filter(Boolean),
        playSeconds: Number(process.env.ART_PLAY_SECONDS || 0),
        backing: process.env.ART_BACKING
          ? Number(process.env.ART_BACKING)
          : undefined,
      },
    );
  } finally {
    await browser.close();
  }
}
