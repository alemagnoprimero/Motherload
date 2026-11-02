import { chromium } from "/home/user/Motherload/node_modules/playwright-core/index.mjs";
import { readFile, writeFile } from "node:fs/promises";
const [shots, out] = process.argv.slice(2);
const items = [
  ["d01-title", "Title screen: plain system-font logo; live HUD visible behind it"],
  ["d02-surface-start", "First frame: base is off-screen (150 m); half the view is unlit fog"],
  ["d05-underground", "About 24 s of simulated play into a first dive: energy depleted at 180 m"],
  ["d21-deep-revealed", "310 m, map revealed: one repeated slab tile, no strata or back-wall"],
  ["e00-lander-stage-0", "Base at stage 0: dashed outline, little surface dressing"],
  ["e03-lander-stage-3", "Base restored: the most detailed art on screen"],
  ["d06-pause-menu", "Pause menu: settings, saves, records and instructions in one page"],
  ["d10-dock-hardware", "Lander terminal: text rows, locked items look like disabled forms"],
  ["d13c-after-confirm", "Navigation: plain list, cramped travel button"],
  ["d20-w02-drilling", "Ice comet: palette swap of the same tile treatment"],
  ["p03-drilling", "Phone portrait: mission tracker covers the top third"],
  ["l02-drilling", "Phone landscape: text-heavy HUD over the playfield"],
];
const cells = [];
for (const [name, cap] of items) {
  const b64 = (await readFile(`${shots}/${name}.png`)).toString("base64");
  cells.push(`<figure><div class="img"><img src="data:image/png;base64,${b64}"></div><figcaption><b>${name}</b> ${cap}</figcaption></figure>`);
}
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0d1314;font:15px/1.35 system-ui,sans-serif;color:#d8e2df;padding:24px}
h1{font-size:22px;margin:0 0 4px;color:#f2d9a0} p.sub{margin:0 0 18px;color:#93a6a2}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
figure{margin:0;background:#16201f;border:1px solid #2a3a38;border-radius:8px;overflow:hidden}
.img{height:250px;display:flex;align-items:center;justify-content:center;background:#0a0f10}
.img img{max-width:100%;max-height:250px;display:block}
figcaption{padding:8px 10px;color:#b9c7c3} figcaption b{color:#f2d9a0;display:block;font-size:13px;font-weight:600}
</style><h1>Baseline captures — current state (2026-11-02)</h1><p class="sub">Desktop 1440×900 unless noted. Dev build, Chromium headless.</p><div class="grid">${cells.join("")}</div>`;
await writeFile(`${out}.html`, html);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.setContent(html);
await page.screenshot({ path: `${out}.png`, fullPage: true });
await browser.close();
console.log("ok");
