/**
 * T8 evidence: what the playfield shows with Scan off and on.
 *
 * Per case (form × coach × scene × Scan): the text items (art-captures.mjs
 * playfieldText, HUD left out, as F6 counts them), the items within 1.2
 * tiles of the rig (a text box crossing the square of the rig's centre ±
 * 1.2 tiles), overlapping annotations (labels and markers, from
 * __campaignDebug.annotations()) and any text box crossing another, and the
 * frame with and without annotations for the overlay edge share
 * (measure.py, art_metrics.overlay_edge_share).
 *
 * Forms: desktop 1440×900 @2 and phone 393×851 @3 (art-captures FORMS).
 * Coach: active, as the fixtures load, and skipped (steady play). Scenes:
 * spawn (fresh-w01), 60 m (the improvement fixture, a04) and SITE-4.
 *
 * Usage: node docs/qa/t8-scan-annotations/measure.mjs URL OUTDIR
 * (CHROMIUM_PATH as for the other scripts), then
 * python3 docs/qa/t8-scan-annotations/measure.py OUTDIR
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  freeze,
  menu,
  pauseSection,
  ready,
} from "../../../scripts/campaign-smoke.mjs";
import {
  fixture,
  restore,
  settledView,
} from "../../../scripts/improvement-smoke.mjs";
import {
  FORMS,
  HUD_SELECTORS,
  playfieldText,
} from "../../../scripts/art-captures.mjs";

const [base = "http://127.0.0.1:5173/", out = "artifacts/t8"] =
  process.argv.slice(2);
await mkdir(out, { recursive: true });
const freshW01 = JSON.parse(
  await readFile(
    new URL("../../art-audit/prototype/assets/fresh-w01.json", import.meta.url),
    "utf8",
  ),
);

/** The audit's SITE-4 fixture, as art-captures.mjs builds it. */
function site4() {
  const checkpoint = structuredClone(freshW01);
  const { state } = checkpoint;
  const mine = state.worlds[state.currentWorld];
  const site = mine.sites.find((item) => item.id === "W01-SITE-4");
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

const SCENES = {
  spawn: () => structuredClone(freshW01),
  "60m": () => fixture("W01", 6),
  site4,
};

const intersects = (a, b) =>
  a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

const browser = await launchBrowser();
const cases = [];
try {
  for (const form of ["desktop", "phone"])
    for (const coach of ["active", "skipped"]) {
      const { context, page } = await ready(browser, base, FORMS[form], {
        freezeSceneClock: true,
      });
      try {
        await freeze(page);
        if (coach === "skipped")
          await click(page, '[data-command="skip-coach"]');
        for (const [scene, checkpoint] of Object.entries(SCENES))
          for (const scan of [false, true]) {
            const value = checkpoint();
            await restore(page, value);
            await settledView(page, value);
            // main has no Scan: its "on" cases repeat "off" (the baseline).
            await page.evaluate(
              (on) => window.__campaignDebug.scan?.(on),
              scan,
            );
            // The HUD's Scan state (reserve chip, rail) follows within 0.1 s.
            await advance(page, 150);
            const name = `${form}-coach-${coach}-${scene}-scan-${scan ? "on" : "off"}`;
            const items = await playfieldText(page);
            const state = await page.evaluate((hud) => {
              const host = document.getElementById("campaign-game").dataset;
              return {
                rig: [Number(host.rigScreenX), Number(host.rigScreenY)],
                tile: Number(host.viewTile),
                view: [Number(host.viewWidth), Number(host.viewHeight)],
                scan: host.scan,
                annotations: window.__campaignDebug.annotations?.() ?? [],
                // As art-captures.mjs: a box-shadow plate is HUD too.
                hud: hud.flatMap((selector) =>
                  [...document.querySelectorAll(selector)].flatMap((node) => {
                    const box = node.getBoundingClientRect();
                    if (!(box.width > 0 && box.height > 0)) return [];
                    const spread = Math.max(
                      0,
                      ...[
                        ...getComputedStyle(node).boxShadow.matchAll(
                          /(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g,
                        ),
                      ].map(
                        ([, x, y, , grow]) =>
                          Number(grow) + Math.max(Math.abs(x), Math.abs(y)),
                      ),
                    );
                    return [
                      [
                        box.left - spread,
                        box.top - spread,
                        box.right + spread,
                        box.bottom + spread,
                      ],
                    ];
                  }),
                ),
              };
            }, HUD_SELECTORS);
            const clearance = [
              state.rig[0] - 1.2 * state.tile,
              state.rig[1] - 1.2 * state.tile,
              state.rig[0] + 1.2 * state.tile,
              state.rig[1] + 1.2 * state.tile,
            ];
            const nearRig = items.filter((item) =>
              intersects(item.box, clearance),
            );
            const textOverlaps = [];
            for (let i = 0; i < items.length; i++)
              for (let j = i + 1; j < items.length; j++)
                if (intersects(items[i].box, items[j].box))
                  textOverlaps.push([items[i].text, items[j].text]);
            const boxes = state.annotations.flatMap((entry) => [
              [
                entry.id,
                [
                  entry.box.left,
                  entry.box.top,
                  entry.box.right,
                  entry.box.bottom,
                ],
              ],
              ...(entry.marker
                ? [
                    [
                      `${entry.id}:${entry.marker.kind}`,
                      [
                        entry.marker.x - entry.marker.radius,
                        entry.marker.y - entry.marker.radius,
                        entry.marker.x + entry.marker.radius,
                        entry.marker.y + entry.marker.radius,
                      ],
                    ],
                  ]
                : []),
            ]);
            const annotationOverlaps = [];
            for (let i = 0; i < boxes.length; i++)
              for (let j = i + 1; j < boxes.length; j++)
                if (intersects(boxes[i][1], boxes[j][1]))
                  annotationOverlaps.push([boxes[i][0], boxes[j][0]]);
            const file = `${out}/${name}.png`;
            await page.screenshot({ path: file });
            await page.evaluate(() => window.__campaignDebug.overlays(false));
            await advance(page, 50);
            const hudFree = `${out}/${name}-hudfree.png`;
            await page.screenshot({ path: hudFree });
            await page.evaluate(() => window.__campaignDebug.overlays(true));
            await page.evaluate(() => window.__campaignDebug.scan?.(null));
            const entry = {
              name,
              form,
              coach,
              scene,
              scan,
              scanReported: state.scan,
              file,
              hudFree,
              view: state.view,
              hud: state.hud,
              rig: state.rig,
              tile: state.tile,
              text: items.map((item) => item.text),
              items,
              nearRig: nearRig.map((item) => item.text),
              textOverlaps,
              annotationOverlaps,
              annotations: state.annotations,
            };
            cases.push(entry);
            console.log(
              `${name}: ${items.length} text (${entry.text.join(" | ")}); near rig ${nearRig.length}; overlaps ${textOverlaps.length + annotationOverlaps.length}`,
            );
          }
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
await writeFile(`${out}/cases.json`, JSON.stringify(cases, null, 2) + "\n");

/**
 * Motion and high contrast (desktop, coach skipped, Scan on): the target's
 * pulse ring in view (the rig two rows down seam A's column), read from the
 * ring's transform 0.3 s apart on the running scene clock, with reduced
 * motion off and on; then a high-contrast frame at SITE-4.
 */
const motion = { checks: [] };
const browser2 = await launchBrowser();
try {
  const { context, page } = await ready(browser2, base, FORMS.desktop, {
    freezeSceneClock: true,
  });
  try {
    await freeze(page);
    await click(page, '[data-command="skip-coach"]');
    const seam = structuredClone(freshW01);
    const mine = seam.state.worlds[seam.state.currentWorld];
    const x = 20;
    for (let row = 0; row < 2; row++) {
      mine.tiles[row * mine.width + x] = 0;
      mine.discovered[row * mine.width + x] = 1;
    }
    // Ore in the cleared cells lies exposed, as the improvement fixtures do.
    for (const item of mine.packages)
      if (
        item.status === "deposit" &&
        Math.floor(item.x) === x &&
        Math.floor(item.y) < 2
      )
        item.status = "exposed";
    seam.state.vehicle = { ...seam.state.vehicle, x: x + 0.5, y: 1.64 };
    const ring = () =>
      page.evaluate(() => {
        const entry = window.__campaignDebug
          .annotations?.()
          .find((item) => item.id === "target");
        const image = document.querySelector(
          '#campaign-world-labels .annotation-marker[data-kind="ring"]:not([hidden])',
        );
        return {
          marker: entry?.marker?.kind ?? null,
          transform: image?.style.transform ?? null,
        };
      });
    const pulse = async (reduced) => {
      await restore(page, seam);
      await settledView(page, seam);
      await page.evaluate(() => window.__campaignDebug.scan?.(true));
      await page.evaluate(() => window.__campaignDebug.sceneClock.resume());
      await advance(page, 100);
      const first = await ring();
      await advance(page, 300);
      const second = await ring();
      await page.evaluate(() => window.__campaignDebug.sceneClock.freeze());
      await page.screenshot({
        path: `${out}/motion-ring-${reduced ? "reduced" : "default"}.png`,
      });
      return {
        reduced,
        marker: first.marker,
        first: first.transform,
        second: second.transform,
        moved: first.transform !== second.transform,
      };
    };
    motion.checks.push(await pulse(false));
    for (const setting of ["reducedMotion"]) {
      await menu(page);
      await pauseSection(page, "systems");
      await page.locator(`[data-setting="${setting}"]`).check({ force: true });
      await closeOverlay(page);
    }
    motion.checks.push(await pulse(true));
    await menu(page);
    await pauseSection(page, "systems");
    await page.locator('[data-setting="highContrast"]').check({ force: true });
    await closeOverlay(page);
    const cave = site4();
    await restore(page, cave);
    await settledView(page, cave);
    await page.evaluate(() => window.__campaignDebug.scan?.(true));
    await advance(page, 150);
    await page.screenshot({ path: `${out}/high-contrast-site4-scan-on.png` });
    motion.highContrast = await page.evaluate(() => {
      const label = document.querySelector(
        "#campaign-world-labels .annotation-label:not([hidden])",
      );
      const css = label ? getComputedStyle(label) : null;
      return css
        ? {
            background: css.backgroundColor,
            border: css.borderTopWidth,
            color: css.color,
          }
        : null;
    });
  } finally {
    await context.close();
  }
} finally {
  await browser2.close();
}
await writeFile(`${out}/motion.json`, JSON.stringify(motion, null, 2) + "\n");
console.log(JSON.stringify(motion));
