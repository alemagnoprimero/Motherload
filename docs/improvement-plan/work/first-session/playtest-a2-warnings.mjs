// Capture what the naive diver actually sees at each energy threshold (desktop and portrait).
import { Session, launch, energyOf } from "./lib.mjs";
const browser = await launch();
for (const [name, viewport, opts] of [
  ["A2-warn-desktop", { width: 1440, height: 900 }, {}],
  ["A2-warn-portrait", { width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const s = new Session(name, browser, viewport, opts);
  try {
    await s.open();
    await s.deploy();
    const shotAt = { low: false, critical: false, last: false };
    await s.hold(["ArrowDown"], 30000, 250, async (h) => {
      const e = energyOf(h);
      if (!shotAt.low && e <= 2.5) { shotAt.low = true; await s.shot("energy-25pct"); s.note("25%: danger=" + h.danger + " message=" + h.message + " depth=" + h.depth); }
      if (!shotAt.critical && e <= 1.5) { shotAt.critical = true; await s.shot("energy-15pct"); s.note("15%: danger=" + h.danger + " message=" + h.message + " depth=" + h.depth); }
      if (!shotAt.last && e <= 0.8) { shotAt.last = true; await s.shot("energy-8pct"); s.note("8%: danger=" + h.danger + " message=" + h.message + " depth=" + h.depth); }
      return h.disabled;
    });
    const css = await s.page.evaluate(() => {
      const d = document.querySelector("#campaign-danger");
      const r = d.getBoundingClientRect();
      const st = getComputedStyle(d);
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], fontSize: st.fontSize, color: st.color, bg: st.backgroundColor };
    });
    s.note("danger element geometry " + JSON.stringify(css));
  } catch (e) {
    s.note("ERROR " + e.stack);
  } finally {
    await s.close();
  }
}
await browser.close();
console.log("done");
