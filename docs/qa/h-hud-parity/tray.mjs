/**
 * H4 evidence: the tool tray's state on a 393 × 851 phone and on desktop:
 * on arrival, after 5 s with no touch, after a tap on the Scan button and
 * 4.5 s later: whether it rests, the plate's colour, the icons' opacity and
 * the buttons' size.
 *
 * Usage: node docs/qa/h-hud-parity/tray.mjs URL (CHROMIUM_PATH as usual)
 */
import { launchBrowser } from "../../../scripts/browser-launch.mjs";
import { advance, freeze, ready } from "../../../scripts/campaign-smoke.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const browser = await launchBrowser();
try {
  for (const [width, height, touch] of [
    [393, 851, true],
    [1440, 900, false],
  ]) {
    const { context, page } = await ready(browser, base, {
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      deviceScaleFactor: 2,
    });
    await freeze(page);
    const state = () =>
      page.evaluate(() => {
        const bar = document.querySelector(".campaign-toolbar");
        return {
          rests: document.body.dataset.campaignTrayRest === "true",
          plate: getComputedStyle(bar).backgroundColor,
          icons: getComputedStyle(bar.querySelector(".hud-icon")).opacity,
          buttons: [...bar.querySelectorAll("button")]
            .filter((button) => button.getClientRects().length)
            .map((button) => {
              const box = button.getBoundingClientRect();
              return `${Math.round(box.width)}x${Math.round(box.height)}`;
            }),
        };
      });
    const out = { arrival: await state() };
    await advance(page, 5000);
    out.after5s = await state();
    const scan = await page.locator("#campaign-scan-button").boundingBox();
    if (touch)
      await page.touchscreen.tap(
        scan.x + scan.width / 2,
        scan.y + scan.height / 2,
      );
    else
      await page.mouse.click(scan.x + scan.width / 2, scan.y + scan.height / 2);
    // The plate's fade takes 0.4 s.
    await advance(page, 500);
    out.afterTap = await state();
    await advance(page, 4500);
    out.restsAgain = await state();
    console.log(
      `${width}x${height}${touch ? " touch" : ""}`,
      JSON.stringify(out),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
