// Playtest (d): portrait phone 393x851 with the floating touch joystick (CDP touch events).
import { Session, launch, delay, click, tab, cargoOf, depthOf, advance } from "./lib.mjs";

const browser = await launch();
const s = new Session("D-touch", browser, { width: 393, height: 851 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
let touching = false;
async function touch(type, x, y) {
  await s.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ id: 1, x, y }] });
}
async function joy() {
  return s.page.evaluate(() => {
    const g = document.querySelector("#campaign-game").dataset;
    return { vis: g.joystickVisible, cx: g.joystickCenterX, cy: g.joystickCenterY, kx: g.joystickKnobX, ky: g.joystickKnobY, dirs: g.pointerDirections };
  });
}
/** Hold the joystick displaced by (dx,dy) from the centre (cx,cy). */
async function stick(cx, cy, dx, dy, ms, label, stop) {
  if (!touching) { await touch("touchStart", cx, cy); touching = true; }
  await touch("touchMove", cx + dx, cy + dy);
  for (let done = 0; done < ms; done += 250) {
    await advance(s.page, 250);
    s.t += 250;
    const h = await s.observe("stick " + label);
    if (stop && (await stop(h))) break;
  }
  const j = await joy();
  s.note(`stick ${label} (${dx},${dy}) joystick=${JSON.stringify(j)}`);
}
async function lift() {
  await touch("touchEnd");
  touching = false;
  await advance(s.page, 50);
  s.t += 50;
  await s.observe("lift");
}
async function tap(x, y, label) {
  await touch("touchStart", x, y);
  await touch("touchEnd");
  await advance(s.page, 300);
  s.t += 300;
  const h = await s.observe("tap " + label);
  s.note(`tap ${label} at (${Math.round(x)},${Math.round(y)}) -> overlay=${h.overlay} callout="${h.callout}"`);
}
try {
  await s.open();
  await s.page.screenshot({ path: "/home/user/Motherload/docs/improvement-plan/work/first-session/shots/D-touch-title.png" });
  await s.deploy();
  await s.idle(500);
  await s.shot("first-frame");
  const h0 = s.last;
  s.note(`rig screen (${h0.rigScreenX},${h0.rigScreenY})`);
  // Tap the ore just below the rig.
  await tap(h0.rigScreenX, h0.rigScreenY + 35, "ore-below");
  await s.shot("tap-ore");
  // Place the joystick in the lower half (thumb zone) and drag down.
  const cx = 196, cy = 680;
  await stick(cx, cy, 0, 45, 14000, "down", async (h) => /Beacon surveyed/.test(h.tasks));
  s.mark("beacon-touch");
  await s.shot("touch-drilling");
  // Drag up without lifting (same gesture): fly out.
  await stick(cx, cy, 0, -45, 8000, "up", async (h) => depthOf(h) === 0 && h.rigY < -0.9);
  await s.shot("touch-out-of-shaft");
  // Diagonal up-left, then left on the surface.
  await stick(cx, cy, -40, -25, 1500, "up-left");
  await s.shot("touch-flying");
  await stick(cx, cy, -45, 0, 8000, "left", async (h) => Math.abs((((5.5 - h.rigX + 60) % 40) - 20)) < 2.2);
  // Return to centre (neutral) to coast, then lift.
  await stick(cx, cy, 0, 0, 750, "neutral");
  await lift();
  await s.idle(500);
  for (let n = 0; n < 8 && !s.last.dockPrompt; n++) {
    const dx = ((5.5 - s.last.rigX + 60) % 40) - 20;
    await stick(cx, cy, dx < 0 ? -40 : 40, 0, 250, "nudge");
    await stick(cx, cy, 0, 0, 250, "neutral");
    await lift();
    await s.idle(300);
  }
  s.note("dock prompt=" + s.last.dockPrompt + " · " + s.vitals());
  await s.shot("touch-at-lander");
  // Tap the lander/ship to dock.
  const h1 = await s.hud();
  await tap(h1.rigScreenX, h1.rigScreenY - 40, "lander");
  if (s.last.overlay === "dock") {
    s.mark("touch-docked");
    await s.shot("touch-dock-service");
    await click(s.page, '#campaign-dock [data-command="bank-sell"]');
    await delay(300);
    await s.shot("touch-dock-sold");
    s.note("Dock message: " + (await s.page.locator("#campaign-dock-message").innerText()));
    await tab(s.page, "lander");
    await delay(200);
    await s.shot("touch-dock-lander");
  } else {
    // Fall back to the on-screen Dock button.
    const visible = await s.page.locator("#campaign-dock-toggle").isVisible();
    s.note("Dock button visible: " + visible);
    if (visible) { await click(s.page, "#campaign-dock-toggle"); await delay(300); await s.observe("dock button"); await s.shot("touch-dock-button"); }
  }
} catch (e) {
  s.note("ERROR " + e.stack);
  try { await s.shot("error"); } catch {}
} finally {
  await s.close();
  await browser.close();
}
console.log("done", JSON.stringify(s.marks));
