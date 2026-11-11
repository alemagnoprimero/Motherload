/**
 * H1 to H4 evidence (audit §5.3 "H1–H4 HUD parity", §9.2 "Objective size;
 * HAUL; bar labels"): the HUD as shipped at desktop 1440 × 900 @2 and phone
 * 393 × 851 @3 (art-captures' forms), in the scenes art-captures uses
 * (spawn, 60 m, SITE-4).
 *
 * Per case: the objective's box and text, its details on hover and on tap,
 * and whatever the later H items add (HAUL, the bar labels, the phone tray).
 * Frames are saved beside OUT/cases.json.
 *
 * Usage: node docs/qa/h-hud-parity/measure.mjs URL OUTDIR
 * (CHROMIUM_PATH as for the other scripts)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import {
  advance,
  click,
  freeze,
  ready,
} from "../../../scripts/campaign-smoke.mjs";
import {
  fixture,
  restore,
  settledView,
} from "../../../scripts/improvement-smoke.mjs";
import { FORMS } from "../../../scripts/art-captures.mjs";

const [base = "http://127.0.0.1:5173/", out = "artifacts/hud"] =
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

const box = (rect) => ({
  x: Math.round(rect.x * 10) / 10,
  y: Math.round(rect.y * 10) / 10,
  width: Math.round(rect.width * 10) / 10,
  height: Math.round(rect.height * 10) / 10,
});

async function hud(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node || !node.getClientRects().length) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const shown = (selector) => {
      const node = document.querySelector(selector);
      if (!node || node.hidden || !node.getClientRects().length) return false;
      for (let el = node; el; el = el.parentElement) {
        const css = getComputedStyle(el);
        if (
          css.display === "none" ||
          css.visibility === "hidden" ||
          Number(css.opacity) === 0 ||
          (css.clipPath && css.clipPath.startsWith("inset(50%"))
        )
          return false;
      }
      return true;
    };
    return {
      objective: rect(".campaign-objective"),
      objectiveText: [
        ...document.querySelectorAll(
          '#campaign-objective-progress [data-primary="true"], #campaign-objective-distance:not([hidden])',
        ),
      ]
        .map((node) => node.textContent.trim())
        .join(" "),
      detailsShown: shown(".objective-more"),
      // H2: the HAUL readout, and the cargo pips it replaces on phones.
      haul: {
        shown: shown(".haul-readout"),
        text: [...document.querySelector(".haul-readout").children]
          .map((node) => node.textContent.trim())
          .join(" "),
        box: rect(".haul-readout"),
        cut: (() => {
          const value = document.getElementById("campaign-haul");
          return value.scrollWidth > value.clientWidth + 1;
        })(),
      },
      pips: shown("#campaign-cargo-pips"),
      rowOverflow: (() => {
        const row = document.querySelector(".instrument-right");
        return row.scrollWidth - row.clientWidth;
      })(),
    };
  });
}

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
        for (const [scene, checkpoint] of Object.entries(SCENES)) {
          const value = checkpoint();
          await restore(page, value);
          await settledView(page, value);
          await advance(page, 150);
          const name = `${form}-coach-${coach}-${scene}`;
          await page.mouse.move(720, 600);
          const shipped = await hud(page);
          await page.screenshot({ path: `${out}/${name}.png` });
          const entry = { name, form, coach, scene, ...shipped };
          // The details: on hover (desktop) or a tap on the pill (phone).
          const pill = page.locator(".campaign-objective");
          const target = await pill.boundingBox();
          if (form === "desktop") {
            await page.mouse.move(target.x + 30, target.y + target.height / 2);
            await advance(page, 50);
            entry.detailsOnHover = (await hud(page)).detailsShown;
            await page.screenshot({ path: `${out}/${name}-details.png` });
            await page.mouse.move(720, 600);
          } else {
            await page.touchscreen.tap(
              target.x + 30,
              target.y + target.height / 2,
            );
            await advance(page, 50);
            entry.detailsOnTap = (await hud(page)).detailsShown;
            await page.screenshot({ path: `${out}/${name}-details.png` });
            await page.touchscreen.tap(
              target.x + 30,
              target.y + target.height / 2,
            );
            await advance(page, 50);
            entry.detailsAfterSecondTap = (await hud(page)).detailsShown;
          }
          entry.objective = entry.objective && box(entry.objective);
          cases.push(entry);
          console.log(
            `${name}: objective ${entry.objective?.width}×${entry.objective?.height} "${entry.objectiveText}"; details ${entry.detailsShown}→${entry.detailsOnHover ?? entry.detailsOnTap}; haul ${entry.haul.shown ? entry.haul.text : "hidden"}${entry.haul.cut ? " (cut)" : ""}, pips ${entry.pips}, row overflow ${entry.rowOverflow}`,
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
