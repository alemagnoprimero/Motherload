/**
 * H3 evidence: the ENERGY and HULL labels per viewport: shown or not, their
 * size, whether a label meets its value, and whether the value stays inside
 * its row.
 *
 * Usage: node docs/qa/h-hud-parity/labels.mjs URL (CHROMIUM_PATH as usual)
 */
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import { freeze, ready } from "../../../scripts/campaign-smoke.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const browser = await launchBrowser();
try {
  for (const [width, height, touch] of [
    [899, 700, false],
    [900, 700, false],
    [1024, 768, true],
    [1280, 720, false],
    [1440, 900, false],
    [915, 412, true],
    [393, 851, true],
  ]) {
    const { context, page } = await ready(browser, base, {
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      deviceScaleFactor: 2,
    });
    await freeze(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".instrument-row")].map((row) => {
        const label = row.querySelector("span"),
          value = row.querySelector("strong");
        const shown = getComputedStyle(label).display !== "none";
        const a = label.getBoundingClientRect(),
          b = value.getBoundingClientRect(),
          r = row.getBoundingClientRect();
        return {
          label: label.textContent,
          shown,
          fontSize: parseFloat(getComputedStyle(label).fontSize),
          meetsValue: shown && a.right > b.left,
          valueInside: b.right <= r.right + 0.5,
        };
      }),
    );
    console.log(
      `${width}x${height}${touch ? " touch" : ""}`,
      JSON.stringify(rows),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
