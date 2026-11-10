/**
 * H2 evidence: does the HUD's right row (depth, cargo, HAUL, credits) fit?
 * Per viewport, with the readouts' text set directly under the frozen clock
 * (0 CR / 20 CR, then 12,480 CR / 123,456 CR): the row's overflow in px, the
 * readouts drawn, and which values the row shortens (980 / 2,140, 3,000 /
 * 20,000, 12,480 / 123,456 CR).
 *
 * Usage: node docs/qa/h-hud-parity/fit.mjs URL (CHROMIUM_PATH as usual)
 */
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import { freeze, ready } from "../../../scripts/campaign-smoke.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const browser = await launchBrowser();
try {
  for (const [width, height, touch] of [
    [320, 640, true],
    [360, 740, true],
    [393, 851, true],
    [568, 320, true],
    [844, 390, true],
    [1024, 768, false],
    [1280, 720, false],
    [1440, 900, false],
  ]) {
    const { context, page } = await ready(browser, base, {
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      deviceScaleFactor: 2,
    });
    await freeze(page);
    const result = await page.evaluate(() => {
      const set = (haul, credits) => {
        document.getElementById("campaign-haul").textContent = haul;
        document.getElementById("campaign-credits").textContent = credits;
      };
      const row = document.querySelector(".instrument-right");
      const out = {};
      for (const [haul, credits] of [
        ["0 CR", "20 CR"],
        ["12,480 CR", "123,456 CR"],
      ]) {
        set(haul, credits);
        out[`${haul} / ${credits}`] = {
          overflow: row.scrollWidth - row.clientWidth,
          readouts: [...row.children]
            .filter((node) => node.getClientRects().length)
            .map((node) => node.className),
        };
      }
      out.shortened = {};
      for (const [haul, credits] of [
        ["980 CR", "2,140 CR"],
        ["3,000 CR", "20,000 CR"],
        ["12,480 CR", "123,456 CR"],
      ]) {
        set(haul, credits);
        out.shortened[`${haul} / ${credits}`] = [
          ...row.querySelectorAll("strong"),
        ]
          .filter((value) => value.scrollWidth > value.clientWidth + 1)
          .map((value) => value.id);
      }
      return out;
    });
    console.log(
      `${width}x${height}${touch ? " touch" : ""}`,
      JSON.stringify(result),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
