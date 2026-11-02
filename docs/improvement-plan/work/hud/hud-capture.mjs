// HUD audit captures. Usage: node hud-capture.mjs <scenario> [<scenario> ...]
// Scenarios run one browser context at a time and always close it.
import { readFile } from "node:fs/promises";
import {
  advance,
  click,
  delay,
  hudState,
  keys,
  launch,
  loadFixture,
  open,
  exportCheckpoint,
  parkAbove,
  probe,
  save,
  shot,
  shotHudOff,
  world,
  indexOf,
} from "./hud-lib.mjs";

const SHOTS_IN =
  "/home/user/Motherload/docs/improvement-plan/shots";
const w02Checkpoint = JSON.parse(await readFile(`${SHOTS_IN}/checkpoint-w02.json`, "utf8"));
const scenarios = {};

// 1. First frame after Deploy on every form factor.
for (const kind of ["desktop", "portrait", "landscape", "small"])
  scenarios["first-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    await advance(page, 500);
    await shot(page, `h-${kind}-first`);
    await shotHudOff(page, `h-${kind}-first-off`);
    await save(`probe-${kind}-first`, { probe: await probe(page), errors });
    await context.close();
  };

// 2. Deep revealed W01 at ~310 m (busy, bright stone) for contrast sampling.
for (const kind of ["desktop", "portrait"])
  scenarios["deep-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    const cp = await exportCheckpoint(page, false);
    const fx = structuredClone(cp);
    const mine = world(fx);
    mine.discovered.fill(1);
    parkAbove(fx, 20, 32, { energy: 6 });
    await loadFixture(page, fx);
    await advance(page, 600);
    await shot(page, `h-${kind}-deep`);
    await shotHudOff(page, `h-${kind}-deep-off`);
    await save(`probe-${kind}-deep`, { probe: await probe(page), errors });
    await context.close();
  };

// 3. Ice comet surface (bright ice) and shaft.
for (const kind of ["desktop", "portrait"])
  scenarios["w02-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    const fx = structuredClone(w02Checkpoint);
    fx.state.vehicle = { x: 14.5, y: -0.36, energy: 6, hull: 10 };
    await loadFixture(page, fx);
    await advance(page, 900);
    await shot(page, `h-${kind}-w02-surface`);
    await shotHudOff(page, `h-${kind}-w02-surface-off`);
    await save(`probe-${kind}-w02-surface`, { probe: await probe(page), errors });
    const fx2 = structuredClone(w02Checkpoint);
    world(fx2).discovered.fill(1);
    parkAbove(fx2, 30, 12, { energy: 6 });
    await loadFixture(page, fx2);
    await advance(page, 900);
    await shot(page, `h-${kind}-w02-shaft`);
    await shotHudOff(page, `h-${kind}-w02-shaft-off`);
    await save(`probe-${kind}-w02-shaft`, { probe: await probe(page), errors });
    await context.close();
  };

// 4. Low energy dive: timeline of danger banner vs explanatory messages.
for (const kind of ["desktop", "portrait", "small"])
  scenarios["lowenergy-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    const cp = await exportCheckpoint(page, false);
    const fx = structuredClone(cp);
    parkAbove(fx, 12, 12, { energy: 2.7 });
    await loadFixture(page, fx);
    const timeline = [];
    let shots = new Set();
    await keys(page, ["ArrowDown"]);
    for (let t = 0; t <= 9500; t += 100) {
      await advance(page, 100);
      const s = await hudState(page);
      timeline.push({ t, ...s });
      const e = parseFloat(s.energy);
      const band = e <= 0 ? "0" : e <= 0.8 ? "08" : e <= 1.5 ? "15" : e <= 2.5 ? "25" : "";
      if (band && !shots.has(band)) {
        shots.add(band);
        await advance(page, 100);
        await shot(page, `h-${kind}-lowenergy-${band}`);
        if (band === "25") await save(`probe-${kind}-lowenergy-25`, { probe: await probe(page) });
      }
      if (s.disabled === "true") break;
    }
    await keys(page, []);
    const texts = new Set(timeline.map((x) => x.message).filter(Boolean));
    const shown = new Set(timeline.filter((x) => x.messageVisible).map((x) => x.message));
    const dangers = new Set(timeline.map((x) => x.danger).filter(Boolean));
    await save(`timeline-${kind}-lowenergy`, {
      errors,
      messagesSet: [...texts],
      messagesVisible: [...shown],
      dangerTexts: [...dangers],
      timeline,
    });
    await context.close();
  };

// 5. Damage: an ice vent hit (W02) and the double-warning stack.
scenarios["damage-desktop"] = async (browser) => {
  const { context, page, errors } = await open(browser, "desktop");
  const vent = { x: 8.5, y: 48.5 };
  const fx = structuredClone(w02Checkpoint);
  parkAbove(fx, vent.x, vent.y + 1, { energy: 6, hull: 10 });
  world(fx).tiles[indexOf(world(fx), vent.x, Math.floor(vent.y) + 1)] = 1;
  await loadFixture(page, fx);
  const before = await hudState(page);
  await advance(page, 150);
  await shot(page, "h-desktop-vent-hit");
  const after = await hudState(page);
  await advance(page, 900);
  await shot(page, "h-desktop-vent-after");
  const later = await hudState(page);
  // Both warnings at once: low hull + low energy.
  const fx2 = structuredClone(w02Checkpoint);
  world(fx2).discovered.fill(1);
  parkAbove(fx2, 30, 40, { energy: 1.4, hull: 2 });
  await loadFixture(page, fx2);
  await advance(page, 600);
  await shot(page, "h-desktop-double-warning");
  await save("damage-desktop", { errors, before, after, later, double: await hudState(page), probe: await probe(page) });
  await context.close();
};

// 6. Cargo full on the starter seam (native, deterministic).
scenarios["cargo-desktop"] = async (browser) => {
  const { context, page, errors } = await open(browser, "desktop");
  await keys(page, ["ArrowDown"]);
  const timeline = [];
  for (let t = 0; t < 14000; t += 100) {
    await advance(page, 100);
    const s = await hudState(page);
    timeline.push({ t, ...s });
    if (s.cargo.startsWith("7 /")) {
      await keys(page, []);
      await advance(page, 150);
      await shot(page, "h-desktop-cargo-full");
      await save("probe-desktop-cargo-full", { probe: await probe(page) });
      break;
    }
  }
  await keys(page, []);
  await save("timeline-desktop-cargo", { errors, timeline });
  await context.close();
};

// 7. Volatile extraction (W02 tutorial crystal at 24,24).
for (const kind of ["desktop", "portrait", "small"])
  scenarios["volatile-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    const fx = structuredClone(w02Checkpoint);
    parkAbove(fx, 24, 24, { energy: 10, hull: 10 });
    await loadFixture(page, fx);
    await keys(page, ["ArrowDown"]);
    let got = { cutting: false, release: false };
    for (let t = 0; t < 12000; t += 50) {
      await advance(page, 50);
      const mode = await page.evaluate(() => document.body.dataset.campaignVolatile);
      if (mode === "cutting" && !got.cutting) {
        got.cutting = true;
        await advance(page, 300);
        await shot(page, `h-${kind}-volatile-cutting`);
        await save(`probe-${kind}-volatile-cutting`, { probe: await probe(page) });
      }
      if (mode === "release") {
        got.release = true;
        await advance(page, 100);
        await shot(page, `h-${kind}-volatile-release`);
        await save(`probe-${kind}-volatile-release`, { probe: await probe(page) });
        break;
      }
    }
    await keys(page, []);
    await advance(page, 400);
    await shot(page, `h-${kind}-volatile-after`);
    await save(`volatile-${kind}`, { errors, got, after: await hudState(page) });
    await context.close();
  };

// 8. Cold pocket warning (W02).
for (const kind of ["desktop", "portrait"])
  scenarios["cold-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    const pocket = { x: 10.5, y: 28.5 };
    const fx = structuredClone(w02Checkpoint);
    parkAbove(fx, pocket.x, pocket.y + 1, { energy: 8, hull: 10 });
    world(fx).tiles[indexOf(world(fx), pocket.x, Math.floor(pocket.y) + 1)] = 1;
    await loadFixture(page, fx);
    await advance(page, 300);
    await shot(page, `h-${kind}-cold-warning`);
    const warn = await hudState(page);
    // Same pocket with low energy: does the card survive the danger banner?
    const fx2 = structuredClone(fx);
    fx2.state.vehicle.energy = 2.2;
    await loadFixture(page, fx2);
    await advance(page, 300);
    await shot(page, `h-${kind}-cold-warning-lowenergy`);
    const warnLow = await hudState(page);
    const game = await page.evaluate(() => document.querySelector("#campaign-game").dataset.coldWarning);
    await save(`cold-${kind}`, { errors, warn, warnLow, coldWarningFlag: game });
    await context.close();
  };

// 9. Inspection: desktop click and portrait tap on the ore below the rig.
for (const kind of ["desktop", "portrait"])
  scenarios["inspect-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    const rig = await page.locator("#campaign-game").evaluate((el) => ({
      x: Number(el.dataset.rigScreenX),
      y: Number(el.dataset.rigScreenY),
    }));
    const tile = kind === "desktop" ? 65 : 48;
    const target = { x: rig.x, y: rig.y + tile * 0.86 };
    if (kind === "desktop") await page.mouse.click(target.x, target.y);
    else await page.touchscreen.tap(target.x, target.y);
    await advance(page, 300);
    await shot(page, `h-${kind}-inspect`);
    const p = await probe(page);
    await save(`inspect-${kind}`, { errors, rig, target, inspection: p.game.inspection, worldCallout: p.game.worldCallout });
    await context.close();
  };

// 10. Portrait joystick held in the thumb zone while low energy.
scenarios["joystick-portrait"] = async (browser) => {
  const { context, page, errors } = await open(browser, "portrait");
  const cp = await exportCheckpoint(page, false);
  const fx = structuredClone(cp);
  parkAbove(fx, 12, 12, { energy: 2.2 });
  await loadFixture(page, fx);
  const session = await context.newCDPSession(page);
  const center = { x: 300, y: 690 };
  const touch = (type, points) => session.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ id: 1, ...center }]);
  await advance(page, 100);
  await touch("touchMove", [{ id: 1, x: center.x, y: center.y + 40 }]);
  await advance(page, 700);
  await shot(page, "h-portrait-joystick-danger");
  const p = await probe(page);
  await touch("touchEnd", []);
  await save("joystick-portrait", { errors, center, probe: p });
  await context.close();
};

// 11. Native shallow dive on short screens (POI edge label, tracker overlap).
for (const kind of ["landscape", "small", "portrait"])
  scenarios["dive-" + kind] = async (browser) => {
    const { context, page, errors } = await open(browser, kind);
    await keys(page, ["ArrowRight"]);
    await advance(page, 1500);
    await keys(page, ["ArrowDown"]);
    await advance(page, 9000);
    await keys(page, []);
    await advance(page, 600);
    await shot(page, `h-${kind}-dive`);
    await save(`probe-${kind}-dive`, { probe: await probe(page), errors, state: await hudState(page) });
    await context.close();
  };

// 12. Accessibility preferences: larger text + high contrast.
for (const kind of ["desktop", "portrait"])
  scenarios["prefs-" + kind] = async (browser) => {
    const prefs = {
      largeText: true,
      highContrast: true,
      reducedMotion: false,
      drillToggle: false,
      braceToggle: false,
      showDirectionButtons: false,
      effects: 0.5,
      ambience: 0.3,
      music: 0.15,
    };
    const { context, page, errors } = await open(browser, kind, { prefs });
    await advance(page, 400);
    await shot(page, `h-${kind}-largetext-contrast`);
    await save(`probe-${kind}-largetext`, { probe: await probe(page), errors });
    await context.close();
  };

// 13. Deep M2 run: no lander bearing while the mission signal points to a part.
scenarios["noreturn-desktop"] = async (browser) => {
  const { context, page, errors } = await open(browser, "desktop");
  const cp = await exportCheckpoint(page, false);
  const fx = structuredClone(cp);
  fx.state.progress.beacon = true;
  fx.state.progress.bankedOre = 3;
  fx.state.progress.completed = [1];
  parkAbove(fx, 30, 20, { energy: 3.2 });
  await loadFixture(page, fx);
  await advance(page, 600);
  await shot(page, "h-desktop-noreturn");
  await save("noreturn-desktop", { errors, state: await hudState(page), probe: await probe(page) });
  await context.close();
};

const names = process.argv.slice(2);
const browser = await launch();
try {
  for (const name of names) {
    const run = scenarios[name];
    if (!run) {
      console.log("unknown scenario", name, Object.keys(scenarios).join(" "));
      continue;
    }
    const started = Date.now();
    try {
      await run(browser);
    } catch (error) {
      console.log("FAILED", name, error.stack || error.message);
    }
    console.log("done", name, ((Date.now() - started) / 1000).toFixed(1) + "s");
  }
} finally {
  await browser.close();
}
