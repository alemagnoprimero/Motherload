// Full W02 loadout toolbar on every form factor (fixture supplies ownership only).
import { readFile } from "node:fs/promises";
import { HARDWARE_PRICES, W01_GEAR } from "/home/user/Motherload/src/campaign/config.ts";
import { W02_GEAR } from "/home/user/Motherload/src/campaign/frontier.ts";
import { advance, launch, loadFixture, open, parkAbove, probe, save, shot, world } from "./hud-lib.mjs";
const SHOTS_IN = "/home/user/Motherload/docs/improvement-plan/shots";
const cp = JSON.parse(await readFile(`${SHOTS_IN}/checkpoint-w02.json`, "utf8"));
function fullTools(checkpoint) {
  const fx = structuredClone(checkpoint);
  const mine = world(fx);
  mine.completed = [1, 2];
  for (const item of mine.missions) if (item.id.startsWith("W02-SAMPLE-")) item.status = "banked";
  const cryo = mine.packages.filter((p) => p.itemId === "W02-O3" && p.tags.includes("cryosample")).slice(0, 3);
  for (const item of cryo) { item.status = "banked"; if (!item.tags.includes("intact")) item.tags.push("intact"); }
  for (const def of [...W01_GEAR, ...W02_GEAR]) {
    if (!["W01-R2", "W02-R1", "W02-R2", "W02-R3"].includes(def.id)) continue;
    if (!fx.state.ownedGear.includes(def.id)) {
      fx.state.ownedGear.push(def.id);
      fx.state.purchases.push({ id: def.id, paid: def.price, balanceVersion: "0.1" });
    }
  }
  fx.state.equipped = { drill: "W02-R1", mobility: "W01-R2", processor: "W02-R3", utilities: ["W02-R2"] };
  for (const key of Object.keys(fx.state.hardware)) {
    for (let rank = fx.state.hardware[key] + 1; rank <= 2; rank++)
      fx.state.purchases.push({ id: `CORE-${rank}-${key.toUpperCase()}`, paid: HARDWARE_PRICES[key][rank], balanceVersion: "0.1" });
    fx.state.hardware[key] = 2;
  }
  return fx;
}
const browser = await launch();
try {
  for (const kind of process.argv.slice(2)) {
    const { context, page, errors } = await open(browser, kind);
    const fx = fullTools(cp);
    parkAbove(fx, 30, 12, { energy: 20, hull: 20 });
    await loadFixture(page, fx);
    await advance(page, 700);
    await shot(page, `h-${kind}-tools`);
    await save(`probe-${kind}-tools`, { probe: await probe(page), errors });
    await context.close();
  }
} finally {
  await browser.close();
}
