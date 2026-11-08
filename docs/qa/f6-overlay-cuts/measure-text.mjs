/**
 * F6 evidence: the playfield's text items (art-captures.mjs's playfieldText,
 * HUD left out) at spawn and at 60 m, on desktop and phone, with the first-
 * expedition coach active (as the fixtures load) and after Skip (steady
 * play), plus whether the depth rail shows in play, on hovering the depth
 * readout and in the pause menu.
 *
 * Usage: node docs/qa/f6-overlay-cuts/measure-text.mjs URL OUT.json
 * (PREVIEW_URL style base URL; CHROMIUM_PATH as for the other scripts).
 * Each case's frame is saved beside OUT.json as <form>-<coach>-<scene>.png.
 */
import { readFile, writeFile } from "node:fs/promises";
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
import { FORMS, playfieldText } from "../../../scripts/art-captures.mjs";

const [base, out] = process.argv.slice(2);
const freshW01 = JSON.parse(
  await readFile(
    new URL("../../art-audit/prototype/assets/fresh-w01.json", import.meta.url),
    "utf8",
  ),
);
const scenes = {
  spawn: () => structuredClone(freshW01),
  "60 m": () => fixture("W01", 6),
};
const railOpacity = (page) =>
  page.evaluate(() =>
    Number(
      getComputedStyle(document.querySelector("#campaign-depth-rail")).opacity,
    ),
  );
const browser = await launchBrowser();
const results = [];
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
        for (const [scene, checkpoint] of Object.entries(scenes)) {
          const value = checkpoint();
          await restore(page, value);
          await settledView(page, value);
          const items = await playfieldText(page);
          await page.screenshot({
            path: new URL(
              `${form}-coach-${coach}-${scene.replace(" ", "")}.png`,
              new URL(out, `file://${process.cwd()}/`),
            ).pathname,
          });
          const entry = { form, coach, scene, count: items.length, items };
          if (scene === "60 m" && form === "desktop") {
            entry.rail = { play: await railOpacity(page) };
            // On main the HUD takes no pointer events: nothing to hover.
            try {
              await page.hover("#campaign-depth", { timeout: 2000 });
              entry.rail.hoverReadout = await railOpacity(page);
            } catch {
              entry.rail.hoverReadout = "not hoverable";
            }
            await page.mouse.move(720, 450);
            await click(page, "#campaign-menu-toggle");
            // The UI publishes data-campaign-paused on its next frame.
            await advance(page, 100);
            entry.rail.pauseMenu = await railOpacity(page);
            entry.rail.pauseMenuDisplay = await page.evaluate(
              () =>
                getComputedStyle(document.querySelector("#campaign-depth-rail"))
                  .display,
            );
            await page.keyboard.press("Escape");
          }
          results.push(entry);
          console.log(
            `${form} · coach ${coach} · ${scene}: ${items.length} — ${items.map((item) => item.text).join(" | ")}${entry.rail ? ` · rail ${JSON.stringify(entry.rail)}` : ""}`,
          );
        }
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
await writeFile(out, JSON.stringify(results, null, 2) + "\n");
