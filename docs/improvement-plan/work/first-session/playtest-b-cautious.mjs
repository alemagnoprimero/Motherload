// Playtest (b)+(e): a cautious first-timer who follows the on-screen guidance:
// mine the visible starter ore, survey the beacon, return, dock, sell, fund M1,
// service, then follow the tracker on trip 2 and try to buy a first upgrade.
import { writeFile } from "node:fs/promises";
import { Session, launch, delay, click, tab, cargoOf, energyOf, depthOf, exportCheckpoint, WORK } from "./lib.mjs";

const browser = await launch();
const s = new Session("B-cautious", browser, { width: 1440, height: 900 });
const failed = [];
async function ascend(label) {
  // Hold Up until clear of the shaft (depth 0 and airborne above the surface).
  const h = await s.hold(["ArrowUp"], 20000, 250, async (h) => depthOf(h) === 0 && h.rigY < -0.9);
  s.note(`${label}: out of the shaft · ${s.vitals()}`);
  return h;
}
async function goToLander(label) {
  let corrections = 0;
  for (let n = 0; n < 80; n++) {
    const h = s.last;
    if (h.dockPrompt) {
      await s.idle(250);
      if (s.last.dockPrompt) break;
    }
    const dx = ((5.5 - h.rigX + 60) % 40) - 20; // wrapped delta toward dock
    const key = dx < 0 ? "ArrowLeft" : "ArrowRight";
    if (n > 0 && Math.abs(dx) < 2.5) corrections++;
    await s.hold([key], Math.abs(dx) > 4 ? 500 : 150, Math.abs(dx) > 4 ? 250 : 150);
  }
  s.note(`${label}: at lander, dock prompt=${s.last.dockPrompt}, small corrections=${corrections} · ${s.vitals()}`);
  return corrections;
}
async function dock(label) {
  await s.page.keyboard.press("e");
  await delay(300);
  await s.observe("E");
  if (s.last.overlay !== "dock") { failed.push(label + ": E did not open dock"); s.note("E did not open the dock"); return false; }
  s.mark(label + "-docked");
  return true;
}
async function dockText() {
  return (await s.page.locator("#campaign-dock").innerText()).replace(/\s+/g, " ");
}
async function alignToColumn(col, label) {
  let taps = 0;
  for (let n = 0; n < 60; n++) {
    const h = s.last;
    const dx = ((col + 0.5 - h.rigX + 60) % 40) - 20;
    if (Math.abs(dx) < 0.12) break;
    const key = dx < 0 ? "ArrowLeft" : "ArrowRight";
    const ms = Math.abs(dx) > 4 ? 500 : Math.abs(dx) > 1 ? 150 : 50;
    if (Math.abs(dx) <= 1) taps++;
    await s.hold([key], ms, ms);
    await s.idle(250);
  }
  s.note(`${label}: aligned to column ${col} after ${taps} fine taps (rigX ${s.last.rigX})`);
  return taps;
}

try {
  await s.open();
  s.page.on("response", (r) => { if (r.status() >= 400) s.note("HTTP " + r.status() + " " + r.url()); });
  await s.deploy();
  await s.idle(500);
  await s.shot("first-frame");
  // Trip 1: drill the visible ore below the rig until the beacon is surveyed.
  let flags = {};
  await s.hold(["ArrowDown"], 20000, 250, async (h) => {
    if (!flags.ore && cargoOf(h) > 0) { flags.ore = 1; s.mark("first-ore"); }
    if (!flags.full && /^7 \/ 7/.test(h.cargo)) { flags.full = 1; s.mark("hold-full"); }
    if (/Beacon surveyed/.test(h.tasks)) { s.mark("beacon"); return true; }
    return false;
  });
  await s.idle(500);
  await s.shot("beacon-surveyed");
  await ascend("trip1");
  await s.shot("trip1-out-of-shaft");
  await goToLander("trip1");
  await s.shot("trip1-at-lander");
  if (await dock("trip1")) {
    await s.shot("trip1-dock-service");
    s.note("Dock service tab: " + (await dockText()).slice(0, 900));
    await click(s.page, '#campaign-dock [data-command="bank-sell"]');
    await delay(400);
    await s.observe("unload & sell");
    s.mark("first-sale");
    await s.shot("trip1-after-sell");
    s.note("After sell: " + (await s.page.locator("#campaign-dock-message").innerText()) + " · credits " + (await s.page.locator("#campaign-dock-credits").innerText()));
    await tab(s.page, "hardware");
    await delay(200);
    await s.shot("trip1-hardware-before-m1");
    s.note("Hardware tab before M1: " + (await dockText()).slice(0, 700));
    await tab(s.page, "lander");
    await delay(200);
    await s.shot("trip1-lander-tab");
    s.note("Lander tab: " + (await dockText()).slice(0, 900));
    const fund = s.page.locator('#campaign-dock [data-command="milestone"]');
    if (await fund.count()) {
      await click(s.page, '#campaign-dock [data-command="milestone"]');
      await delay(500);
      s.mark("M1-funded");
      await s.shot("trip1-after-m1");
      s.note("After M1: " + (await s.page.locator("#campaign-dock-message").innerText()));
    } else s.note("No fund-construction button found");
    await tab(s.page, "service");
    await delay(200);
    await click(s.page, '#campaign-dock [data-command="refuel"]');
    await delay(400);
    s.note("After refuel: " + (await s.page.locator("#campaign-dock-message").innerText()) + " · credits " + (await s.page.locator("#campaign-dock-credits").innerText()));
    await tab(s.page, "hardware");
    await delay(200);
    await s.shot("trip1-hardware-after-m1");
    const hw = await s.page.evaluate(() => [...document.querySelectorAll('#campaign-dock [data-command^="hardware-"], #campaign-dock [data-command^="gear-buy-"]')].map((b) => b.dataset.command + ":" + (b.disabled ? "disabled" : "ENABLED") + ":" + b.textContent.trim()));
    s.note("Purchasable after trip 1: " + hw.join(" ; "));
    await tab(s.page, "tools");
    await delay(200);
    const tools = await s.page.evaluate(() => [...document.querySelectorAll('#campaign-dock [data-command^="gear-"]')].map((b) => b.dataset.command + ":" + (b.disabled ? "disabled" : "ENABLED") + ":" + b.textContent.trim()));
    s.note("Attachments after trip 1: " + tools.join(" ; "));
    await click(s.page, '#campaign-dock [data-close="dock"]');
    await delay(300);
    await s.observe("undock");
  }
  await s.idle(500);
  await s.shot("trip2-start");
  s.note("Trip 2 guidance: next=" + s.last.next + " | signal=" + s.last.signal + " | tasks=" + s.last.tasks);
  // Trip 2: follow the tracker. Drive back to the shaft (column 20) and descend.
  await alignToColumn(20, "trip2");
  await s.shot("trip2-aligned");
  flags = {};
  await s.hold(["ArrowDown"], 45000, 250, async (h) => {
    if (/onboard, bank/.test(h.tasks)) { s.mark("valve-onboard"); return true; }
    if (!flags.low && h.danger) { flags.low = 1; s.mark("trip2-danger"); s.note("danger while diving for valve: " + h.danger + " at " + h.depth); }
    if (h.disabled) { s.mark("trip2-disabled"); return true; }
    return false;
  });
  await s.idle(500);
  await s.shot("trip2-valve");
  if (!s.last.disabled) {
    await ascend("trip2");
    await goToLander("trip2");
    if (await dock("trip2")) {
      const opened = await s.page.evaluate(() => document.querySelector('#campaign-dock [aria-selected="true"]')?.textContent);
      s.note("Trip 2 dock opened on tab: " + opened);
      await s.shot("trip2-dock-opened");
      await tab(s.page, "service");
      await delay(200);
      await click(s.page, '#campaign-dock [data-command="bank-sell"]');
      await delay(400);
      s.mark("second-sale");
      s.note("Trip 2 sale: " + (await s.page.locator("#campaign-dock-message").innerText()) + " · credits " + (await s.page.locator("#campaign-dock-credits").innerText()));
      await click(s.page, '#campaign-dock [data-command="refuel"]');
      await delay(300);
      s.note("Trip 2 refuel: " + (await s.page.locator("#campaign-dock-message").innerText()) + " · credits " + (await s.page.locator("#campaign-dock-credits").innerText()));
      await tab(s.page, "hardware");
      await delay(200);
      await s.shot("trip2-hardware");
      const hw = await s.page.evaluate(() => [...document.querySelectorAll('#campaign-dock [data-command^="hardware-"]')].map((b) => b.dataset.command + ":" + (b.disabled ? "disabled" : "ENABLED") + ":" + b.textContent.trim()));
      s.note("Purchasable after trip 2: " + hw.join(" ; "));
      const tools = await (async () => { await tab(s.page, "tools"); await delay(200); return s.page.evaluate(() => [...document.querySelectorAll('#campaign-dock [data-command^="gear-"]')].map((b) => b.dataset.command + ":" + (b.disabled ? "disabled" : "ENABLED") + ":" + b.textContent.trim())); })();
      s.note("Attachments after trip 2: " + tools.join(" ; "));
      await click(s.page, '#campaign-dock [data-close="dock"]');
      await delay(300);
      await s.observe("undock");
    }
  }
  // Trip 3: a first-timer short of money mines the second visible seam (column 21).
  await s.idle(500);
  s.note("Trip 3 guidance: next=" + s.last.next + " | signal=" + s.last.signal + " | tasks=" + s.last.tasks);
  await alignToColumn(21, "trip3");
  await s.hold(["ArrowDown"], 20000, 250, async (h) => /^7 \/ 7/.test(h.cargo) || h.disabled || depthOf(h) >= 80);
  await s.idle(500);
  await s.shot("trip3-hold");
  await ascend("trip3");
  await goToLander("trip3");
  if (await dock("trip3")) {
    await tab(s.page, "service");
    await delay(200);
    await click(s.page, '#campaign-dock [data-command="bank-sell"]');
    await delay(400);
    s.mark("third-sale");
    s.note("Trip 3 sale: " + (await s.page.locator("#campaign-dock-message").innerText()) + " · credits " + (await s.page.locator("#campaign-dock-credits").innerText()));
    await tab(s.page, "hardware");
    await delay(200);
    await s.shot("trip3-hardware");
    const hw = await s.page.evaluate(() => [...document.querySelectorAll('#campaign-dock [data-command^="hardware-"]')].map((b) => b.dataset.command + ":" + (b.disabled ? "disabled" : "ENABLED") + ":" + b.textContent.trim()));
    s.note("Purchasable after trip 3: " + hw.join(" ; "));
    const buy = hw.find((x) => x.startsWith("hardware-energy:ENABLED")) ? "hardware-energy" : hw.find((x) => x.includes("ENABLED"))?.split(":")[0];
    if (buy) {
      await click(s.page, '#campaign-dock [data-command="' + buy + '"]');
      await delay(400);
      s.mark("first-upgrade");
      await s.shot("trip3-first-upgrade");
      s.note("First upgrade: " + buy + " -> " + (await s.page.locator("#campaign-dock-message").innerText()) + " · credits " + (await s.page.locator("#campaign-dock-credits").innerText()));
    }
    await click(s.page, '#campaign-dock [data-close="dock"]');
    await delay(300);
    await s.idle(800);
    await s.shot("after-first-upgrade-world");
  }
  const cp = await exportCheckpoint(s.page, true);
  await writeFile(WORK + "/B-after-trip2.json", JSON.stringify(cp));
  s.note("Checkpoint credits " + cp.state.credits / 10 + " hardware " + JSON.stringify(cp.state.hardware) + " completed " + JSON.stringify(cp.state.progress.completed));
} catch (e) {
  s.note("ERROR " + e.stack);
  try { await s.shot("error"); } catch {}
} finally {
  s.note("FAILED STEPS " + JSON.stringify(failed));
  await s.close();
  await browser.close();
}
console.log("done", JSON.stringify(s.marks));
