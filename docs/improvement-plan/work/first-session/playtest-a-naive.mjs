// Playtest (a)+(f): a naive first-time player who dives straight down, then recovers.
import { Session, launch, delay, click, cargoOf, energyOf, depthOf, advance } from "./lib.mjs";

const browser = await launch();
const s = new Session("A-naive", browser, { width: 1440, height: 900 });
try {
  await s.open();
  await s.page.screenshot({ path: "/home/user/Motherload/docs/improvement-plan/work/first-session/shots/A-naive-title.png" });
  s.note("Title screen: " + (await s.page.locator("#campaign-welcome").innerText()).replace(/\s+/g, " "));
  await s.deploy();
  await s.idle(500);
  await s.shot("first-frame");
  // The title says "Down drills": hold Down and keep holding.
  let flags = {};
  const stop = async (h) => {
    if (!flags.ore && cargoOf(h) > 0) { flags.ore = 1; s.mark("first-ore"); await s.shot("first-ore"); }
    if (!flags.full && /^7 \/ 7/.test(h.cargo)) { flags.full = 1; s.mark("hold-full"); await s.shot("hold-full"); }
    if (!flags.beacon && /Beacon surveyed/.test(h.tasks)) { flags.beacon = 1; s.mark("beacon-surveyed"); await s.shot("beacon-surveyed"); }
    if (!flags.w25 && /Reserve at 25%/.test(h.message)) { flags.w25 = 1; s.mark("warn25-message"); await s.shot("warn25"); }
    if (!flags.d25 && /Low energy/.test(h.danger)) { flags.d25 = 1; s.mark("danger-low"); }
    if (!flags.w15 && /Energy low/.test(h.message)) { flags.w15 = 1; s.mark("warn15-message"); await s.shot("warn15"); }
    if (!flags.w08 && /Emergency reserve/.test(h.message)) { flags.w08 = 1; s.mark("warn08-message"); await s.shot("warn08"); }
    if (h.disabled) { s.mark("disabled"); return true; }
    return false;
  };
  await s.hold(["ArrowDown"], 40000, 250, stop);
  s.note("At failure: " + s.vitals());
  await s.idle(500);
  await s.shot("disabled");
  // Recovery flow
  const disabledCopy = await s.page.locator("#campaign-disabled").innerText();
  s.note("Disabled overlay: " + disabledCopy.replace(/\s+/g, " "));
  await click(s.page, "#campaign-disabled-recover");
  await delay(300);
  await s.shot("recovery-confirm");
  s.note("Confirm dialog: " + (await s.page.locator("#campaign-confirm").innerText()).replace(/\s+/g, " "));
  await click(s.page, "#campaign-confirm-accept");
  await delay(800);
  await s.observe("after recovery confirm");
  await s.shot("after-recovery-menu");
  s.note("Menu header: " + (await s.page.locator("#campaign-menu > header").innerText()).replace(/\s+/g, " "));
  await click(s.page, "#campaign-resume");
  await delay(300);
  await s.idle(1000);
  await s.shot("after-recovery-world");
  s.note("After recovery: " + s.vitals());
  s.note("Guidance after recovery: next=" + s.last.next + " | signal=" + s.last.signal + " | tasks=" + s.last.tasks);
  // What does a naive player do now? Press Down at the lander.
  await s.hold(["ArrowDown"], 3000, 500);
  await s.shot("drill-at-lander");
  s.note("Drilling at the lander: " + s.vitals());
} catch (e) {
  s.note("ERROR " + e.message);
  try { await s.shot("error"); } catch {}
} finally {
  await s.close();
  await browser.close();
}
console.log("done", JSON.stringify(s.marks), s.errors.length, "errors");
