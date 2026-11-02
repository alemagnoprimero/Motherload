import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
const DIR = "/home/user/Motherload/docs/improvement-plan/work/menus";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("file://" + DIR + "/mock/index.html");
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
const fonts = await page.evaluate(() => [...document.fonts].map((f) => f.family + ":" + f.status));
console.log("fonts", fonts.join(", "));
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
console.log("broken images", broken.length, broken.slice(0, 5));
for (const id of ["f-title", "f-workshop", "f-sale", "f-pause", "f-map"]) {
  const el = page.locator("#" + id);
  await el.screenshot({ path: DIR + "/shots/mock-" + id.slice(2) + ".png" });
  console.log("mock", id);
}
await browser.close();
