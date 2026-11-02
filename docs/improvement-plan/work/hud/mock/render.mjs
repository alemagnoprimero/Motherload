// Render the HUD redesign mock over real HUD-off captures (read-only use of repo icons).
import { readFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
const ROOT = "/home/user/Motherload/docs/improvement-plan/work/hud";
const ICONS = "/home/user/Motherload/assets/campaign/generated/icons/";
const jobs = [
  ["desktop", "normal", { width: 1440, height: 900 }, 1, "h-desktop-dive2-off.png"],
  ["desktop", "critical", { width: 1440, height: 900 }, 1, "h-desktop-dive2-off.png"],
  ["portrait", "normal", { width: 393, height: 851 }, 2, "h-portrait-dive2-off.png"],
  ["portrait", "critical", { width: 393, height: 851 }, 2, "h-portrait-dive2-off.png"],
  ["landscape", "normal", { width: 568, height: 320 }, 2, "h-small-dive2-off.png"],
  ["landscape", "critical", { width: 568, height: 320 }, 2, "h-small-dive2-off.png"],
];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const [form, state, viewport, dpr, bg] of jobs) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
    const page = await context.newPage();
    await page.route("http://mock.local/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/mock.html") return route.fulfill({ body: await readFile(ROOT + "/mock/mock.html"), contentType: "text/html" });
      if (path.startsWith("/icons/")) return route.fulfill({ body: await readFile(ICONS + path.slice(7)), contentType: "image/png" });
      if (path.startsWith("/bg/")) return route.fulfill({ body: await readFile(ROOT + "/shots/" + path.slice(4)), contentType: "image/png" });
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto(`http://mock.local/mock.html?form=${form}&state=${state}&bg=/bg/${bg}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${ROOT}/shots/mock-${form}-${state}.png` });
    console.log("mock", form, state);
    await context.close();
  }
} finally {
  await browser.close();
}
