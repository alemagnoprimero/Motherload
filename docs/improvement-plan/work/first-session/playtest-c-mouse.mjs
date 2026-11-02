// Playtest (c): mouse hold-to-steer for about a minute (desktop 1440x900), plus
// the "side drilling needs a ledge" discoverability check with the mouse.
import { Session, launch, delay, cargoOf, depthOf, advance } from "./lib.mjs";

const browser = await launch();
const s = new Session("C-mouse", browser, { width: 1440, height: 900 });
async function mouseHold(dx, dy, ms, label, stop) {
  const h0 = await s.hud();
  const x = h0.rigScreenX + dx, y = h0.rigScreenY + dy;
  await s.page.mouse.move(x, y);
  await s.page.mouse.down();
  let drift = [];
  for (let done = 0; done < ms; done += 250) {
    await advance(s.page, 250);
    s.t += 250;
    const h = await s.observe("mouse " + label);
    drift.push(Math.round(h.rigScreenY - h0.rigScreenY));
    if (stop && (await stop(h))) break;
  }
  await s.page.mouse.up();
  await advance(s.page, 50);
  s.t += 50;
  await s.observe("mouse up");
  s.note(`mouse ${label} at offset (${dx},${dy}) · rig screen drift samples ${JSON.stringify(drift.slice(0, 12))}`);
}
async function click(x, y, label) {
  await s.page.mouse.click(x, y);
  await advance(s.page, 300);
  s.t += 300;
  const h = await s.observe("click " + label);
  s.note(`short click ${label} at (${Math.round(x)},${Math.round(y)}) -> overlay=${h.overlay} callout="${h.callout}"`);
  return h;
}
try {
  await s.open();
  await s.deploy();
  await s.idle(500);
  let h = s.last;
  s.note(`rig at screen (${h.rigScreenX},${h.rigScreenY})`);
  // 1) Short click on the visible ore below the rig (inspection).
  await click(h.rigScreenX, h.rigScreenY + 60, "ore-below-rig");
  await s.shot("inspect-ore");
  // 2) Short click directly on the rig: nothing?
  await click(h.rigScreenX, h.rigScreenY, "on-rig");
  // 3) Hold below the rig to drill (offset 40px: inside the 20px minimum threshold?)
  await mouseHold(0, 15, 1000, "hold-15px-below");
  s.note("after hold 15px below: " + s.vitals());
  await mouseHold(0, 160, 12000, "hold-below", async (h) => /Beacon surveyed/.test(h.tasks));
  s.mark("beacon-mouse");
  await s.shot("mouse-drilled");
  // 4) Hold above the rig to fly up the shaft.
  await mouseHold(0, -160, 8000, "hold-above", async (h) => depthOf(h) === 0 && h.rigY < -0.9);
  await s.shot("mouse-out-of-shaft");
  // 5) Hold up-left (diagonal flight) toward the lander.
  await mouseHold(-200, -120, 2500, "hold-up-left");
  await s.shot("mouse-flying-left");
  // 6) Hold left to drive until the lander bay is reached.
  await mouseHold(-220, 0, 6000, "hold-left", async (h) => h.dockPrompt);
  await s.idle(500);
  let tries = 0;
  for (; tries < 6 && !s.last.dockPrompt; tries++) {
    const dx = ((5.5 - s.last.rigX + 60) % 40) - 20;
    await mouseHold(dx < 0 ? -220 : 220, 0, 250, "nudge");
    await s.idle(300);
  }
  s.note("dock prompt visible=" + s.last.dockPrompt + " after nudges=" + tries + " · " + s.vitals());
  await s.shot("mouse-at-lander");
  // 7) Short click on the lander to dock.
  h = await s.hud();
  await click(h.rigScreenX, h.rigScreenY - 60, "on-lander");
  await s.shot("mouse-click-lander");
  if (s.last.overlay === "dock") {
    s.mark("docked-by-click");
    await s.page.keyboard.press("Escape");
    await delay(300);
    await s.observe("escape");
  }
  // 8) Ledge test: return to the shaft, drop in, fly up halfway, then hold toward a wall.
  const toShaft = async () => {
    for (let n = 0; n < 40; n++) {
      const dx = ((20.5 - s.last.rigX + 60) % 40) - 20;
      if (Math.abs(dx) < 0.15) break;
      await mouseHold(dx < 0 ? -220 : 220, 0, Math.abs(dx) > 3 ? 500 : 250, "to-shaft");
      await s.idle(250);
    }
  };
  await toShaft();
  s.note("at shaft? rigX=" + s.last.rigX);
  await mouseHold(0, 160, 3000, "drop-into-shaft");
  s.note("after drop: " + s.vitals());
  await mouseHold(0, -160, 600, "rise-in-shaft");
  // Airborne in the shaft now: hold to the right of the rig (side wall).
  const before = (await s.hud()).message;
  await mouseHold(220, 0, 1500, "airborne-right-wall");
  s.note(`airborne side hold: message="${s.last.message}" (before "${before}") depth=${s.last.depth}`);
  await s.shot("airborne-side-hold");
  // Land at the bottom and hold right: side cut should start.
  await s.idle(1500);
  await mouseHold(220, 0, 1500, "grounded-right-wall");
  s.note(`grounded side hold: ${s.vitals()} rigX=${s.last.rigX}`);
  await s.shot("grounded-side-cut");
} catch (e) {
  s.note("ERROR " + e.stack);
  try { await s.shot("error"); } catch {}
} finally {
  await s.close();
  await browser.close();
}
console.log("done", JSON.stringify(s.marks));
