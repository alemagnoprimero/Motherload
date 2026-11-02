// Focused reproductions for first-session rough edges.
import { Session, launch, delay, click, tab, depthOf, advance, exportCheckpoint, importCheckpoint } from "./lib.mjs";

const browser = await launch();
const which = process.argv[2] || "all";
async function fresh(name, viewport = { width: 1440, height: 900 }) {
  const s = new Session(name, browser, viewport);
  await s.open();
  await s.deploy();
  await s.idle(300);
  return s;
}
// R1: Unload & sell after a mission-only trip reports "Bank your carried packages before selling them."
if (which === "all" || which === "r1") {
  const s = await fresh("R1-unload-mission-only");
  try {
    const cp = await exportCheckpoint(s.page, false);
    const fx = structuredClone(cp);
    fx.state.vehicle.x = 5.5; fx.state.vehicle.y = -0.36;
    fx.state.progress.beacon = true; fx.state.progress.bankedOre = 3; fx.state.progress.completed = [1];
    fx.state.credits = 1923;
    const valve = fx.state.worlds.W01.missions.find((m) => m.id === "W01-VALVE");
    valve.status = "carried";
    await importCheckpoint(s.page, fx);
    await click(s.page, "#campaign-resume");
    await delay(200);
    await s.idle(500);
    await s.page.keyboard.press("e");
    await delay(300);
    await tab(s.page, "service");
    await delay(200);
    s.note("Service before: " + (await s.page.locator("#campaign-dock-content").innerText()).replace(/\s+/g, " ").slice(0, 300));
    await click(s.page, '#campaign-dock [data-command="bank-sell"]');
    await delay(400);
    const msg = await s.page.locator("#campaign-dock-message").innerText();
    s.note("R1 dock message after Unload & sell with only the valve aboard: " + JSON.stringify(msg));
    await s.shot("unload-mission-only");
    await click(s.page, '#campaign-dock [data-close="dock"]');
    await delay(200);
    await s.idle(300);
    s.note("R1 tracker after: " + s.last.tasks);
  } catch (e) { s.note("ERROR " + e.stack); } finally { await s.close(); }
}
// R2: side input while airborne (or hovering with Up) in a shaft gives no feedback.
if (which === "all" || which === "r2") {
  const s = await fresh("R2-ledge");
  try {
    await s.hold(["ArrowDown"], 8200, 250); // ~8 rows down column 20
    await s.idle(1200);
    s.note("after drilling: " + s.vitals() + " rigX=" + s.last.rigX + " rigY=" + s.last.rigY);
    // Hover against the right wall: Up+Right together (a natural "fly to the ore" input).
    await s.hold(["ArrowUp"], 300, 150);
    const before = s.last.rigX;
    await s.hold(["ArrowUp", "ArrowRight"], 600, 150);
    s.note(`hover Up+Right in shaft: rigX ${before} -> ${s.last.rigX}, rigY ${s.last.rigY}, depth ${s.last.depth}, message="${s.last.message}"`);
    await s.shot("hover-right");
    // Release Up, keep Right while falling: no cut until the rig lands.
    await s.hold(["ArrowRight"], 250, 50);
    s.note(`falling Right: rigX ${s.last.rigX}, rigY ${s.last.rigY}, message="${s.last.message}"`);
    await s.hold(["ArrowRight"], 1500, 250);
    s.note(`after landing Right: rigX ${s.last.rigX}, depth ${s.last.depth}, message="${s.last.message}"`);
    await s.shot("landed-right");
  } catch (e) { s.note("ERROR " + e.stack); } finally { await s.close(); }
}
// R8: re-entering an existing shaft while 0.25 tile off-centre drills a new neighbouring column.
if (which === "all" || which === "r8") {
  const s = await fresh("R8-shaft-reentry");
  try {
    await s.hold(["ArrowDown"], 3000, 250); // open column 20 three rows
    await s.idle(600);
    const cp = await exportCheckpoint(s.page, false);
    const fx = structuredClone(cp);
    fx.state.vehicle.x = 20.75; fx.state.vehicle.y = -0.36;
    await importCheckpoint(s.page, fx);
    await click(s.page, "#campaign-resume");
    await delay(200);
    await s.idle(500);
    const x0 = s.last.rigX;
    s.note("parked 0.25 tile off-centre at rigX=" + x0 + " (shaft centre 20.5)");
    await s.shot("offcentre-before-down");
    await s.hold(["ArrowDown"], 1500, 250);
    s.note(`Down while off-centre: rigX ${x0} -> ${s.last.rigX}, depth ${s.last.depth}`);
    const cp2 = await exportCheckpoint(s.page, true);
    const w = cp2.state.worlds.W01;
    s.note("row 0 tiles (0=open) " + [18, 19, 20, 21, 22].map((c) => `${c}:${w.tiles[c]}`).join(" ") + " · row 1 " + [19, 20, 21, 22].map((c) => `${c}:${w.tiles[w.width + c]}`).join(" "));
    await s.idle(300);
    await s.shot("offcentre-after-down");
  } catch (e) { s.note("ERROR " + e.stack); } finally { await s.close(); }
}
await browser.close();
console.log("done");
