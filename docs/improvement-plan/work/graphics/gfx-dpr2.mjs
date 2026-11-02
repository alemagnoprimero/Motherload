import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const out = {};
for (const [label, vp, dsf] of [["macbook-1440x900@2", { width: 1440, height: 900 }, 2], ["laptop-1536x864@1.25", { width: 1536, height: 864 }, 1.25]]) {
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: dsf });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173/?mode=campaign");
  await page.waitForFunction(() => document.querySelector("#campaign-game")?.dataset.campaignArt === "ready", null, { timeout: 30000 });
  out[label] = await page.evaluate(() => { const c = document.querySelector("#campaign-game canvas"); return { dpr: devicePixelRatio, backing: [c.width, c.height], css: [c.clientWidth, c.clientHeight], devicePixels: [Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio)] }; });
  await context.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
