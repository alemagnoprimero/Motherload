/**
 * Audit A13 evidence captures, run from the root of the tree being served
 * (a private copy, so Vite never reloads mid-capture; "before" is item 2's
 * tip 2a6185a, "after" this item):
 *
 *   PREVIEW_URL=… CHROMIUM_PATH=… node <repo>/docs/qa/a13-rig-shading/capture.mjs OUT [backing]
 *
 * 1. OUT/art: scripts/art-captures.mjs at the backing (frozen scene clock,
 *    HUD-free twins): a04-dive-60m@2, its 60 m phone twin
 *    a04p-dive-60m-phone@3, a02-spawn-1440x900@2 and p-portrait-02-spawn@3,
 *    the same spawn checkpoint on the phone (the a02 frame at phone scale).
 * 2. OUT/art-no-emissive: a04 and a04p again with ?debug=no-emissive, which
 *    draws every base and no -emissive sibling.
 * 3. OUT/probes: the a04 scene (W01 row 6) in five forms, with and without
 *    ?debug=no-emissive, each on a fresh page: the HUD-free frame
 *    (<form>[-no-emissive].png), the exported checkpoint
 *    (<form>[-no-emissive]-state.json: the known cells), and in
 *    <form>[-no-emissive].json the rig
 *    frames drawn with the page each came from
 *    (__campaignDebug.drawnFrames()), the emissive sprites with their bases
 *    (emissives()), the core hero pages resident (textures()), the dataset's
 *    atlas pages, density and guard, draw calls, resident bytes, the view
 *    and the rig box in device px; and <form>-rig.png, the union of the
 *    drawn rig frames' sources (this tree's SVGs, resvg) at the rig box's
 *    size: the rig's silhouette, for the masks in evidence.py.
 *
 *    desktop        1440 × 900 @2   (CI form)
 *    phone          393 × 851 @3    (CI form)
 *    desktop-1728   1728 × 1117 @2  (hero pages @4x by D1)
 *    desktop-tile82 1440 × 900 @2, ?tile=82 (hero pages @4x)
 *    phone-tile56   393 × 851 @3, ?tile=56 (zone pages @3x)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const tree = process.cwd();
const S = pathToFileURL(`${tree}/scripts`).href;
const { launchBrowser } = await import(`${S}/browser-launch.mjs`);
const { FORMS, runArtCaptures } = await import(`${S}/art-captures.mjs`);
const { fixture, restore, settledView } = await import(
  `${S}/improvement-smoke.mjs`
);
const { advance, exportCheckpoint, freeze, noErrors, ready } = await import(
  `${S}/campaign-smoke.mjs`
);
const { Resvg } = await import(
  pathToFileURL(`${tree}/node_modules/@resvg/resvg-js/index.js`).href
);

const out = process.argv[2];
const backing = Number(process.argv[3] || 2);
const base = process.env.PREVIEW_URL;
if (!out || !base)
  throw new Error("usage: PREVIEW_URL=… capture.mjs OUT [backing]");

const PROBES = {
  desktop: { form: FORMS.desktop },
  phone: { form: FORMS.phone },
  "desktop-1728": {
    form: { viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 },
  },
  "desktop-tile82": { form: FORMS.desktop, search: { tile: "82" } },
  "phone-tile56": { form: FORMS.phone, search: { tile: "56" } },
};

/** A frame's drawing without its document (as scripts/art-review-a13.mjs). */
const bodyOf = (text) =>
  text
    .replace(/^.*?<\/title>/s, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/^<g stroke-linecap="round" stroke-linejoin="round">/, "")
    .replace(/<\/g>$/, "");

/** The union of the drawn rig frames' sources, rendered `size` px wide. */
async function rigSilhouette(frames, flip, size, file) {
  let body = "";
  for (const frame of frames) {
    // W01's sources, then W02's (rank-2 modules and tools).
    let text;
    try {
      text = await readFile(
        `${tree}/assets/campaign/source/${frame}.svg`,
        "utf8",
      );
    } catch {
      text = await readFile(`${tree}/assets/campaign/w02/${frame}.svg`, "utf8");
    }
    body += bodyOf(text);
  }
  if (flip) body = `<g transform="translate(128 0) scale(-1 1)">${body}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  await writeFile(file, png);
}

async function probe(browser, name, { form, search = {} }, noEmissive) {
  const url = new URL(base);
  url.searchParams.set("backing", String(backing));
  for (const [key, value] of Object.entries(search))
    url.searchParams.set(key, value);
  if (noEmissive) url.searchParams.set("debug", "no-emissive");
  const { context, page } = await ready(browser, url.href, form, {
    freezeSceneClock: true,
  });
  try {
    await freeze(page);
    const checkpoint = fixture("W01", 6);
    await restore(page, checkpoint);
    await settledView(page, checkpoint);
    await page.evaluate(() => window.__campaignDebug.overlays(false));
    await advance(page, 50);
    const file = `${name}${noEmissive ? "-no-emissive" : ""}`;
    await page.screenshot({ path: `${out}/probes/${file}.png` });
    const data = await page.evaluate(() => {
      const element = document.querySelector("#campaign-game");
      const d = element.dataset;
      const debug = window.__campaignDebug;
      const tile = Number(d.viewTile);
      return {
        url: location.href,
        renderer: d.renderer,
        devicePixelRatio: window.devicePixelRatio,
        backingScale: Number(d.backingScale ?? d.renderScale),
        view: {
          width: Number(d.viewWidth),
          height: Number(d.viewHeight),
          tile,
          scrollX: Number(d.viewCameraX),
          scrollY: Number(d.viewCameraY),
          rigScreenX: Number(d.rigScreenX),
          rigScreenY: Number(d.rigScreenY),
        },
        rig: [Number(d.rigWorldX), Number(d.rigWorldY)],
        drawCalls: Number(d.drawCalls) || null,
        emissiveSprites: Number(d.emissiveSprites ?? NaN),
        atlasPages: d.atlasPages ?? null,
        atlasDensity: d.atlasDensity ?? null,
        atlasGuard: d.atlasGuard ?? null,
        residentTextureBytes: Number(d.residentTextureBytes),
        residentTextureZone: d.residentTextureZone ?? null,
        drawn: debug
          .drawnFrames()
          .filter(({ frame }) => /^(rig-|thrust-|tool-)/.test(frame)),
        emissives: debug.emissives?.() ?? null,
        coreHeroPages: debug
          .textures()
          .filter(({ key }) => /core-hero/.test(key))
          .map(({ key, width, height, density, bytes }) => ({
            key,
            width,
            height,
            density,
            bytes,
          })),
        frameMisses: debug.frameMisses(),
      };
    });
    const size = (data.view.tile * 64) / 48,
      centreY = data.view.rigScreenY - data.view.tile * 0.015,
      dpr = data.devicePixelRatio;
    // The rig sprite's square in device px, as art-captures.mjs rigBox().
    data.rigBox = {
      x: Math.round((data.view.rigScreenX - size / 2) * dpr),
      y: Math.round((centreY - size / 2) * dpr),
      width: Math.round(size * dpr),
      height: Math.round(size * dpr),
      exact: {
        x: (data.view.rigScreenX - size / 2) * dpr,
        y: (centreY - size / 2) * dpr,
        size: size * dpr,
      },
    };
    const cabin = data.emissives?.find(
      ({ base }) => base.frame === "rig-cabin",
    );
    data.flip = cabin ? cabin.base.flipX : false;
    if (!noEmissive)
      await rigSilhouette(
        data.drawn.map(({ frame }) => frame),
        data.flip,
        data.rigBox.width,
        `${out}/probes/${name}-rig.png`,
      );
    // The known cells as the game holds them (evidence.py's unknown rock).
    await page.evaluate(() => window.__campaignDebug.overlays(true));
    await writeFile(
      `${out}/probes/${file}-state.json`,
      JSON.stringify(await exportCheckpoint(page)) + "\n",
    );
    await writeFile(
      `${out}/probes/${file}.json`,
      JSON.stringify(data, null, 2) + "\n",
    );
    console.log(
      `${file}: ${data.renderer} density ${data.atlasDensity} guard ${data.atlasGuard} draws ${data.drawCalls} emissive ${data.emissiveSprites} cabin from ${data.drawn.find(({ frame }) => frame === "rig-cabin")?.texture}`,
    );
    noErrors(page);
  } finally {
    await context.close();
  }
}

await mkdir(`${out}/probes`, { recursive: true });
const browser = await launchBrowser();
try {
  if (!process.env.A13_PROBES_ONLY) {
    await runArtCaptures(browser, base, `${out}/art`, {
      only: [
        "a04-dive-60m@2",
        "a04p-dive-60m-phone@3",
        "a02-spawn",
        "p-portrait-02-spawn",
      ],
      backing,
    });
    const noEmissive = new URL(base);
    noEmissive.searchParams.set("debug", "no-emissive");
    await runArtCaptures(browser, noEmissive.href, `${out}/art-no-emissive`, {
      only: ["a04-dive-60m@2", "a04p-dive-60m-phone@3"],
      backing,
    });
  }
  for (const [name, settings] of Object.entries(PROBES))
    for (const noEmissive of [false, true])
      await probe(browser, name, settings, noEmissive);
} finally {
  await browser.close();
}
