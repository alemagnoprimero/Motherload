// Diagnostic: why did the mouse-steered rig stop short of the lander?
import { Session, launch, delay, depthOf, advance } from "./lib.mjs";
const browser = await launch();
const s = new Session("C2-mouse-diag", browser, { width: 1440, height: 900 });
async function ptr() {
  return s.page.evaluate(() => {
    const g = document.querySelector("#campaign-game").dataset;
    return { active: g.pointerActive, dirs: g.pointerDirections, rx: Number(g.rigWorldX).toFixed(2), ry: Number(g.rigWorldY).toFixed(2), sx: Math.round(g.rigScreenX), sy: Math.round(g.rigScreenY) };
  });
}
async function mouseHold(dx, dy, ms, label, stop, fixed = true) {
  const h0 = await s.hud();
  let x = h0.rigScreenX + dx, y = h0.rigScreenY + dy;
  await s.page.mouse.move(x, y);
  await s.page.mouse.down();
  for (let done = 0; done < ms; done += 250) {
    await advance(s.page, 250);
    s.t += 250;
    const h = await s.observe(label);
    const p = await ptr();
    s.note(`${label} mouse=(${Math.round(x)},${Math.round(y)}) ${JSON.stringify(p)} E=${h.energy}`);
    if (stop && (await stop(h))) break;
  }
  await s.page.mouse.up();
  await advance(s.page, 50);
  s.t += 50;
}
try {
  await s.open();
  await s.deploy();
  await s.idle(500);
  await mouseHold(0, 160, 12000, "below", async (h) => /Beacon surveyed/.test(h.tasks));
  await mouseHold(0, -160, 8000, "above", async (h) => depthOf(h) === 0 && h.rigY < -0.9);
  await mouseHold(-200, -120, 2500, "upleft");
  await s.shot("upleft-end");
  await mouseHold(-220, 0, 6000, "left", async (h) => h.dockPrompt);
  await s.shot("left-end");
} catch (e) {
  s.note("ERROR " + e.stack);
} finally {
  await s.close();
  await browser.close();
}
