/**
 * Audit A13 evidence: the rig's layer stack is the same whatever was drawn
 * before it (the depth fix), and ?debug=no-emissive removes only the
 * headlamp glow. Run from the root of the tree being served (a private copy;
 * "before" = item 2's tip 2a6185a, where engine/energy/bay, cabin/hull and
 * the front layers shared depths 21, 22 and 23):
 *
 *   PREVIEW_URL=… CHROMIUM_PATH=… node <repo>/docs/qa/a13-rig-shading/determinism.mjs OUT
 *
 * Desktop 1440 × 900 @2, frozen scene clock, per renderer (WebGL, Canvas)
 * and per target scene:
 *   a04  W01 row 6, the rig at hardware 0 (the a04 frame);
 *   r1   W01 row 18, rank-1 hardware, feet, rack and collar, hull 10 (wear),
 *        so every W01 layer that overlaps another is drawn.
 * Each target is reached on a fresh page after a different warm-up (each
 * changes how many sprites the scene drew, and in which pooled sprites,
 * before the rig):
 *   A  none           D  the spawn
 *   B  spawn, cave    E  a04, spawn
 *   F  cave           G  r1, spawn, a04
 *   N  none, with ?debug=no-emissive
 * Saves <renderer>-<target>-<seq>.png (the rig sprite's square, device px)
 * and -wide.png (one tile more on every side), and in results.json the
 * dataset counters and the rig frames drawn; and <target>-rig.png, the union
 * of the drawn rig frames' sources (this tree's SVGs, resvg) at the crop's
 * size: the silhouette determinism.py masks with.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const tree = process.cwd();
const S = pathToFileURL(`${tree}/scripts`).href;
const { advance, freeze, ready } = await import(`${S}/campaign-smoke.mjs`);
const { fixture, restore, settledView } = await import(
  `${S}/improvement-smoke.mjs`
);
const { launchBrowser } = await import(`${S}/browser-launch.mjs`);
const { HARDWARE_PRICES, W01_GEAR } = await import(
  pathToFileURL(`${tree}/src/campaign/config.ts`).href
);
const { Resvg } = await import(
  pathToFileURL(`${tree}/node_modules/@resvg/resvg-js/index.js`).href
);

const out = process.argv[2];
const base = process.env.PREVIEW_URL;
if (!out || !base) throw new Error("usage: PREVIEW_URL=… determinism.mjs OUT");
await mkdir(out, { recursive: true });
const fresh = JSON.parse(
  await readFile(
    `${tree}/docs/art-audit/prototype/assets/fresh-w01.json`,
    "utf8",
  ),
);

/** Rank-1 rig with feet, rack, collar and wear: every W01 layer that overlaps. */
function r1() {
  const checkpoint = fixture("W01", 18);
  const s = checkpoint.state;
  for (const definition of W01_GEAR)
    if (
      ["W01-R2", "W01-R3"].includes(definition.id) &&
      !s.ownedGear.includes(definition.id)
    ) {
      s.ownedGear.push(definition.id);
      s.purchases.push({
        id: definition.id,
        paid: definition.price,
        balanceVersion: "0.1",
      });
    }
  for (const key of Object.keys(s.hardware)) {
    for (let rank = s.hardware[key] + 1; rank <= 1; rank++)
      s.purchases.push({
        id: `CORE-${rank}-${key.toUpperCase()}`,
        paid: HARDWARE_PRICES[key][rank],
        balanceVersion: "0.1",
      });
    s.hardware[key] = 1;
  }
  s.equipped = {
    drill: "W01-R1",
    mobility: "W01-R2",
    processor: "W01-R3",
    utilities: [],
  };
  s.vehicle.hull = 10;
  // The brace and the rack need milestones 1 and 2 (model.ts validation).
  s.progress = {
    ...s.progress,
    beacon: true,
    bankedOre: Math.max(3, s.progress.bankedOre ?? 0),
    completed: [1, 2],
  };
  for (const item of s.worlds.W01.missions)
    if (["W01-BEACON", "W01-VALVE", "W01-ANTENNA"].includes(item.id))
      item.status = "banked";
  return checkpoint;
}
const a04 = () => fixture("W01", 6);
const cave = () => fixture("W01", 43);
const spawn = () => structuredClone(fresh);
const TARGETS = { a04, r1 };
const SEQS = {
  A: [],
  B: [spawn, cave],
  D: [spawn],
  E: [a04, spawn],
  F: [cave],
  G: [r1, spawn, a04],
};

async function rigBox(page, pad = 0) {
  const view = await page.locator("#campaign-game").evaluate((element) => ({
    x: Number(element.dataset.rigScreenX),
    y: Number(element.dataset.rigScreenY),
    tile: Number(element.dataset.viewTile),
  }));
  const size = (view.tile * 64) / 48 + 2 * pad * view.tile,
    centreY = view.y - view.tile * 0.015;
  return {
    x: view.x - size / 2,
    y: centreY - size / 2,
    width: size,
    height: size,
    tile: view.tile,
  };
}
async function shot(page, name) {
  await page.evaluate(() => window.__campaignDebug.overlays(false));
  await advance(page, 50);
  const hidden = await page.addStyleTag({
    content:
      "body *{visibility:hidden!important}#campaign-game canvas{visibility:visible!important}",
  });
  const box = await rigBox(page);
  await page.screenshot({ path: `${out}/${name}.png`, clip: box });
  const wide = await rigBox(page, 1);
  await page.screenshot({ path: `${out}/${name}-wide.png`, clip: wide });
  await hidden.evaluate((node) => node.remove());
  await page.evaluate(() => window.__campaignDebug.overlays(true));
  const data = await page.evaluate(() => {
    const d = document.querySelector("#campaign-game").dataset;
    return {
      renderer: d.renderer,
      drawCalls: Number(d.drawCalls) || null,
      emissiveSprites: Number(d.emissiveSprites),
      atlasDensity: d.atlasDensity,
      drawn: window.__campaignDebug
        .drawnFrames()
        .filter(({ frame }) => /^(rig-|tool-|thrust-)/.test(frame)),
      emissives: window.__campaignDebug.emissives?.() ?? null,
    };
  });
  return { name, box, ...data };
}

/** A frame's drawing without its document (as scripts/art-review-a13.mjs). */
const bodyOf = (text) =>
  text
    .replace(/^.*?<\/title>/s, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/^<g stroke-linecap="round" stroke-linejoin="round">/, "")
    .replace(/<\/g>$/, "");
async function silhouette(frames, width, file) {
  let body = "";
  for (const frame of frames)
    body += bodyOf(
      await readFile(`${tree}/assets/campaign/source/${frame}.svg`, "utf8"),
    );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  await writeFile(
    file,
    new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng(),
  );
}

const browser = await launchBrowser();
const results = [];
try {
  for (const renderer of ["webgl", "canvas"]) {
    const open = async (debug) => {
      const url = new URL(base);
      url.searchParams.set("renderer", renderer);
      if (debug) url.searchParams.set("debug", debug);
      const { context, page } = await ready(
        browser,
        url.href,
        { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
        { freezeSceneClock: true },
      );
      await freeze(page);
      return { context, page };
    };
    const go = async (page, checkpoint) => {
      await restore(page, checkpoint);
      await settledView(page, checkpoint);
    };
    for (const [target, make] of Object.entries(TARGETS)) {
      for (const [seq, warmups] of [...Object.entries(SEQS), ["N", []]]) {
        const { context, page } = await open(
          seq === "N" ? "no-emissive" : undefined,
        );
        for (const warm of warmups) await go(page, warm());
        await go(page, make());
        const record = await shot(page, `${renderer}-${target}-${seq}`);
        results.push({ target, seq, ...record });
        console.log(
          `${record.name}: draws ${record.drawCalls} emissive ${record.emissiveSprites} density ${record.atlasDensity}`,
        );
        await context.close();
      }
      if (renderer === "webgl") {
        const record = results.find(
          (item) => item.target === target && item.seq === "A",
        );
        const png = await readFile(`${out}/${record.name}.png`);
        await silhouette(
          record.drawn.map(({ frame }) => frame),
          png.readUInt32BE(16),
          `${out}/${target}-rig.png`,
        );
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2) + "\n");
