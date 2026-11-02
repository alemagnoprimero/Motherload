// Read-only feasibility probe: rasterize a few W02 SVG sources with Chromium into scratch.
import { readFile } from "node:fs/promises";
import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
const OUT = process.argv[2];
const src = "/home/user/Motherload/assets/campaign/w02/";
const manifest = JSON.parse(await readFile(src + "frames.json", "utf8"));
const wanted = new Set(["w02-sky", "w02-ridge-far", "w02-ridge-near", "ice-0", "frozen-rock-0", "ore-o3", "rig-hull-2", "dock-stage-3"]);
const items = [...manifest.frames, ...manifest.backgrounds].filter((f) => wanted.has(f.name));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
for (const f of items) {
  const svg = await readFile(src + f.name + ".svg", "utf8");
  await page.setViewportSize({ width: f.width, height: f.height });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: `${OUT}/${f.name}.png`, omitBackground: true });
  console.log(f.name, f.width, f.height);
}
await browser.close();
