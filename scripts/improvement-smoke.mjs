import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  click,
  closeOverlay,
  command,
  exportCheckpoint,
  freeze,
  idle,
  importCheckpoint,
  keys,
  menu,
  noErrors,
  pauseSection,
  ready,
  tab,
} from "./campaign-smoke.mjs";

// Public checkpoint fixtures shorten late scenarios; they do not establish
// human earning pace. All application actions use native keyboard/pointer input.
const fixtures = Object.fromEntries(
  await Promise.all(
    ["native", "w02"].map(async (name) => [
      name,
      JSON.parse(
        await readFile(
          new URL(
            `../tests/fixtures/improvement-${name === "native" ? "w01" : "w02"}.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ]),
  ),
);
const world = (checkpoint) =>
  checkpoint.state.worlds[checkpoint.state.currentWorld];
const viewportTypes = [
  ["desktop", { width: 1440, height: 900 }, {}],
  ["portrait", { width: 393, height: 851 }, { isMobile: true, hasTouch: true }],
  [
    "landscape",
    { width: 568, height: 320 },
    { isMobile: true, hasTouch: true },
  ],
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function clear(checkpoint, x, y) {
  const mine = world(checkpoint);
  if (y < 0 || y >= mine.rows) return;
  const index =
    Math.floor(y) * mine.width +
    (((Math.floor(x) % mine.width) + mine.width) % mine.width);
  mine.tiles[index] = 0;
  for (const item of mine.packages)
    if (
      item.status === "deposit" &&
      Math.floor(item.y) * mine.width + Math.floor(item.x) === index
    )
      item.status = "exposed";
}
/**
 * A shaft fixture: the column at `x` is open from the surface to `row`, the
 * rig rests on that row's floor and nothing is discovered yet. `source` is
 * another checkpoint of that world to dig into (art-captures uses the audit's
 * fresh world); by default it is the improvement fixture.
 */
export function fixture(
  worldId = "W01",
  row = 6,
  x = worldId === "W01" ? 31.5 : 12.5,
  source = fixtures[worldId === "W01" ? "native" : "w02"],
) {
  const checkpoint = structuredClone(source);
  const mine = world(checkpoint);
  checkpoint.state.vehicle = { x, y: row - 0.36, energy: 9, hull: 10 };
  for (let y = 0; y < row; y++) clear(checkpoint, x, y);
  mine.discovered.fill(0);
  return checkpoint;
}
async function play(page, ms = 50) {
  for (let count = 0; count < 3; count++) {
    if (!(await page.evaluate(() => document.body.dataset.campaignOverlay)))
      break;
    const overlay = await page.evaluate(
      () => document.body.dataset.campaignOverlay,
    );
    const closed = page
      .locator("#campaign-" + overlay)
      .evaluate(
        (element) =>
          new Promise((resolve) =>
            element.addEventListener("close", resolve, { once: true }),
          ),
      );
    await closeOverlay(page);
    await closed;
  }
  if (ms) await advance(page, ms);
}
export async function restore(page, checkpoint, resume = true) {
  await keys(page, []);
  await importCheckpoint(page, checkpoint);
  assert.equal(
    await page.evaluate(() => document.body.dataset.campaignPaused),
    "true",
  );
  if (resume) await play(page);
}
// Pixel-exact comparisons need one camera transform. After an import the
// destination art may still be loading (the previous view stays published),
// the camera fades in, contextZoom eases from the previous framing (the camera
// follows it) and band pages stream in. Like settle() in render-acceptance.mjs,
// wait for four unchanged frames of the restored rig, then let the fade end.
export async function settledView(page, checkpoint) {
  const { currentWorld, vehicle } = checkpoint.state;
  const read = () =>
    page.locator("#campaign-game").evaluate((el) => ({
      world: el.dataset.campaignWorld,
      x: Number(el.dataset.rigWorldX),
      y: Number(el.dataset.rigWorldY),
      tile: Number(el.dataset.viewTile),
      cx: Number(el.dataset.viewCameraX),
      cy: Number(el.dataset.viewCameraY),
      textureBytes: Number(el.dataset.residentTextureBytes),
    }));
  let previous = "",
    same = 0;
  for (let frame = 0; frame < 60 && same < 4; frame++) {
    await advance(page, 50);
    await wait(30);
    const state = await read();
    const restored =
      state.world === currentWorld &&
      Math.abs(state.x - vehicle.x) < 0.5 &&
      Math.abs(state.y - vehicle.y) < 0.5;
    const signature = restored ? JSON.stringify(state) : "";
    same = restored && signature === previous ? same + 1 : 0;
    previous = signature;
    // Not restored yet: destination art is still arriving, in real time.
    // Wait for it rather than step. HUD notices expire on the game clock,
    // so extra steps during a slow load would change what is captured.
    if (!restored) await wait(250);
  }
  assert.equal(same, 4, "Restored checkpoint settles on screen");
  await advance(page, 250);
  const settled = JSON.stringify(await read());
  assert.equal(settled, previous, "Camera framing holds once settled");
  const { tile, cx, cy } = JSON.parse(settled);
  return { tile, cx, cy };
}
async function confirm(page) {
  const closed = page
    .locator("#campaign-confirm")
    .evaluate(
      (element) =>
        new Promise((resolve) =>
          element.addEventListener("close", resolve, { once: true }),
        ),
    );
  await click(page, "#campaign-confirm-accept");
  await closed;
  await idle(page);
}
async function hudTexts(page, extraRoots = "") {
  return page.evaluate((extra) => {
    const roots = document.querySelectorAll(
      ".campaign-hud,.campaign-objective,.campaign-toolbar,#campaign-menu-toggle,#campaign-message,#campaign-danger,#campaign-extraction,#campaign-dock-toggle" +
        (extra ? "," + extra : ""),
    );
    const seen = new Set();
    const results = [];
    for (const root of roots)
      for (const el of [root, ...root.querySelectorAll("*")]) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.closest("[hidden],.sr-only")) continue;
        // Unpainted text has no contrast. As the controller-navigation filter
        // does, skip closed disclosures outside their summary; treat a box
        // clipped to 1 px (.sr-only without the class) as hidden too.
        const closed = el.closest("details:not([open])");
        if (closed && !closed.querySelector(":scope > summary")?.contains(el))
          continue;
        let opacity = 1,
          visible = true;
        for (let node = el; node; node = node.parentElement) {
          const css = getComputedStyle(node);
          opacity *= Number(css.opacity);
          if (css.display === "none" || css.visibility === "hidden")
            visible = false;
          if (node === document.body || node === document.documentElement)
            continue;
          const box = node.getBoundingClientRect();
          if (
            (css.overflowX !== "visible" && box.width <= 1) ||
            (css.overflowY !== "visible" && box.height <= 1)
          )
            visible = false;
        }
        if (!visible || opacity === 0) continue;
        for (const child of el.childNodes) {
          if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim())
            continue;
          const range = document.createRange();
          range.selectNodeContents(child);
          const rect = range.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const css = getComputedStyle(el),
            values = css.color.match(/[\d.]+/g).map(Number);
          el.dataset.measureText = "true";
          results.push({
            text: child.textContent.trim(),
            selector: el.id
              ? "#" + el.id
              : el.tagName.toLowerCase() + "." + el.className,
            rgb: values.slice(0, 3),
            alpha: opacity * (values[3] ?? 1),
            fontSize: parseFloat(css.fontSize),
            box: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }
    return results;
  }, extraRoots);
}
async function capture(page, path, name, entries, extraRoots = "") {
  const image = `${path}/${name}.png`;
  await page.screenshot({ path: image });
  const texts = await hudTexts(page, extraRoots);
  const style = await page.addStyleTag({
    content:
      '[data-measure-text="true"]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}',
  });
  const textBackground = `${path}/${name}-text-background.png`;
  await page.screenshot({ path: textBackground });
  await style.evaluate((el) => el.remove());
  await page.evaluate(() =>
    document
      .querySelectorAll("[data-measure-text]")
      .forEach((el) => delete el.dataset.measureText),
  );
  entries[name] = {
    image,
    textBackground,
    texts,
    viewport: page.viewportSize(),
  };
}

export async function runImprovementSmoke(browser, base, path) {
  await mkdir(path, { recursive: true });
  const selected = new Set(
    (process.env.IMPROVEMENT_CHECKS || "behavior,visual,fog").split(","),
  );
  const baseline = process.env.IMPROVEMENT_BASELINE === "1";
  const results = { baseline, base, checks: [], measurements: {} };
  const pass = (message) => {
    results.checks.push(message);
    console.log("PASS " + message);
  };
  const scenarios = new Set(
    (
      process.env.IMPROVEMENT_SCENARIOS ||
      "warnings,tow,shaft,archive,gamepad,conflict"
    ).split(","),
  );
  if (selected.has("behavior")) {
    for (const scenario of scenarios) {
      const { context, page } = await ready(browser, base);
      try {
        await freeze(page);
        if (scenario === "warnings") {
          for (const [energy, copy] of [
            [2.49, /Low energy.*25%/i],
            [1.49, /Energy critical/i],
            [0.79, /Emergency reserve/i],
          ]) {
            const value = fixture("W01", 6);
            value.state.vehicle.energy = energy;
            await restore(page, value);
            assert.equal(
              await page.locator("#campaign-danger").isVisible(),
              true,
            );
            assert.match(
              await page.locator("#campaign-danger").innerText(),
              copy,
            );
            await advance(page, 1000);
            assert.match(
              await page.locator("#campaign-danger").innerText(),
              copy,
              "Warning stays visible while condition holds",
            );
          }
          const value = fixture("W01", 0);
          value.state.vehicle = { x: 5.5, y: -0.36, energy: 3, hull: 10 };
          value.state.credits = 2000;
          // Banked mission proof is unrelated to ordinary sale value.
          for (const item of world(value).packages)
            if (item.status === "carried") item.status = "sold";
          world(value).missions.find((item) => item.id === "W01-VALVE").status =
            "carried";
          await restore(page, value);
          await advance(page, 350);
          await page.keyboard.press("e");
          assert.match(
            await page.locator("#campaign-dock-refuel").innerText(),
            /below half.*refuel/i,
          );
          await tab(page, "service");
          // Sell stored ore first so Unload & sell only has mission cargo.
          await command(page, "bank-sell");
          assert.match(
            await page.locator("#campaign-dock-message").innerText(),
            /banked.*valve/i,
          );
          await click(page, '#campaign-dock [data-close="dock"]');
          assert.equal(
            await page.locator("#campaign-undock-check").isVisible(),
            true,
          );
          await command(page, "refuel-undock");
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            undefined,
          );
          const after = await exportCheckpoint(page);
          assert.ok(
            after.state.vehicle.energy > 9.9,
            "Affordable refuel confirms full result before departure",
          );
          assert.equal(
            world(after).missions.find((item) => item.id === "W01-VALVE")
              .status,
            "banked",
          );
          pass(
            "25/15/8% warnings persist, dock/undock previews refuel, mission cargo banking is reported truthfully",
          );
        }
        if (scenario === "tow") {
          const initial = await exportCheckpoint(page);
          assert.ok(
            initial.state.vehicle.energy > 9.9,
            "A fresh campaign starts with the full 10 L tank",
          );
          await play(page);
          await keys(page, ["ArrowDown"]);
          for (let count = 0; count < 100; count++) {
            await advance(page, 250);
            if (
              /7\s*\/\s*7/.test(
                await page.locator("#campaign-cargo").innerText(),
              )
            )
              break;
          }
          assert.match(
            await page.locator("#campaign-cargo").innerText(),
            /7\s*\/\s*7/,
            "Naive descent fills the hold before depletion",
          );
          assert.match(
            await page.locator("#campaign-message").innerText(),
            /Hold full.*7\/7/i,
          );
          await advance(page, 2000);
          assert.match(
            await page.locator("#campaign-message").innerText(),
            /Hold full.*7\/7/i,
            "Full-hold message survives subsequent mining feedback",
          );
          for (let chunk = 0; chunk < 90; chunk++) {
            if (await page.locator("#campaign-disabled").isVisible()) break;
            await advance(page, 1000);
          }
          await keys(page, []);
          assert.equal(
            await page.locator("#campaign-disabled").isVisible(),
            true,
            "Naive descent becomes disabled; " +
              (await page.locator("#campaign-energy").innerText()) +
              " at " +
              (await page.locator("#campaign-depth").innerText()),
          );
          const before = await exportCheckpoint(page);
          assert.ok(
            before.state.stats.largestDepth >= 290,
            "Holding Down does not disable before 290 m",
          );
          assert.equal(
            world(before).packages.filter((item) => item.status === "carried")
              .length,
            7,
          );
          await click(page, "#campaign-menu-recover");
          assert.match(
            await page.locator("#campaign-confirm-copy").innerText(),
            /free.*cargo|cargo.*free/i,
          );
          await confirm(page);
          const recovered = await exportCheckpoint(page);
          results.measurements.firstTow = {
            depth: before.state.stats.largestDepth,
            carriedBefore: world(before).packages.filter(
              (item) => item.status === "carried",
            ).length,
            carriedAfter: world(recovered).packages.filter(
              (item) => item.status === "carried",
            ).length,
            creditsAfter: recovered.state.credits,
          };
          assert.equal(recovered.state.credits, 200);
          assert.equal(
            world(recovered).packages.filter(
              (item) => item.status === "carried",
            ).length,
            7,
          );
          assert.deepEqual(recovered.state.progress.towsUsed, ["W01"]);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignPaused),
            "true",
          );
          await page.screenshot({ path: `${path}/first-tow-preserved.png` });
          pass(
            "Native hold-Down dive reaches ≥290 m; first emergency tow keeps 7 packages and 20 CR and returns paused",
          );
        }
        if (scenario === "shaft") {
          for (const offset of [-0.45, -0.25, 0.25, 0.45]) {
            const value = fixture("W01", 0),
              mine = world(value),
              column = 20;
            for (let y = 0; y < 5; y++) clear(value, column, y);
            value.state.vehicle = {
              x: column + 0.5 + offset,
              y: -0.36,
              energy: 9,
              hull: 10,
            };
            const neighbours = [mine.tiles[column - 1], mine.tiles[column + 1]];
            await restore(page, value);
            await keys(page, ["ArrowDown"]);
            await advance(page, 1000);
            await keys(page, []);
            const after = await exportCheckpoint(page);
            assert.ok(
              after.state.vehicle.y > 1,
              `Offset${offset} re-enters existing shaft`,
            );
            assert.ok(
              Math.abs(after.state.vehicle.x - (column + 0.5)) < 0.12,
              `Offset${offset} aligns without digging neighboring column`,
            );
            assert.deepEqual(
              [world(after).tiles[column - 1], world(after).tiles[column + 1]],
              neighbours,
            );
          }
          pass(
            "Native Down re-enters the existing shaft at ±.25 and ±.45 tile offsets without excavating either neighbor",
          );
        }
        if (scenario === "archive") {
          const original = await exportCheckpoint(page);
          await command(page, "save");
          await command(page, "new");
          assert.match(
            await page.locator("#campaign-confirm-copy").innerText(),
            /archiv/i,
          );
          await confirm(page);
          const replacement = await exportCheckpoint(page);
          assert.notEqual(replacement.state.id, original.state.id);
          // Archive durability tests persistence, not desktop render throughput.
          // Keep the game visible at a supported small viewport during the full
          // simulated minute, then restore desktop geometry for archive actions.
          await page.setViewportSize({ width: 568, height: 320 });
          let played = replacement;
          for (
            let step = 0;
            step < 12 &&
            (played.state.elapsed - replacement.state.elapsed < 62 ||
              played.revision - replacement.revision < 12);
            step++
          ) {
            await play(page);
            await advance(page, 15000);
            await idle(page);
            played = await exportCheckpoint(page);
            console.log(
              "Archive durability probe " +
                JSON.stringify({
                  elapsed: played.state.elapsed - replacement.state.elapsed,
                  autosaves: played.revision - replacement.revision,
                }),
            );
          }
          assert.ok(
            played.state.elapsed - replacement.state.elapsed >= 60,
            "At least 60 actual simulation seconds passed after replacement",
          );
          assert.ok(
            played.revision - replacement.revision >= 12,
            "At least 12 real autosaves rotated backup without deleting archives",
          );
          results.measurements.archiveDurability = {
            elapsedSeconds: played.state.elapsed - replacement.state.elapsed,
            autosaves: played.revision - replacement.revision,
            originalSeed: original.state.seed,
          };
          await page.setViewportSize({ width: 1440, height: 900 });
          await advance(page, 50);
          await command(page, "save");
          await page
            .locator('#campaign-archives [data-command^="archive:"]')
            .first()
            .waitFor();
          await click(
            page,
            '#campaign-archives [data-command^="archive:"]:first-of-type',
          );
          await confirm(page);
          const restored = await exportCheckpoint(page);
          assert.equal(restored.state.id, original.state.id);
          assert.equal(restored.state.seed, original.state.seed);
          assert.deepEqual(world(restored).tiles, world(original).tiles);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignPaused),
            "true",
          );
          await page.screenshot({ path: `${path}/archive-restored.png` });
          pass(
            "A replaced campaign survives ≥60 simulation seconds and ≥12 autosaves, then restores its original seed and terrain paused",
          );
        }
        if (scenario === "conflict") {
          await menu(page);
          await command(page, "save");
          await command(page, "new");
          await confirm(page);
          const active = await exportCheckpoint(page);
          await page
            .locator('#campaign-archives [data-command^="archive:"]')
            .first()
            .waitFor();
          const newer = await context.newPage();
          const faults = [];
          newer.on("pageerror", (error) => faults.push(error.message));
          await newer.goto(base);
          await newer.waitForFunction(
            () =>
              document.querySelector("#campaign-game")?.dataset.campaignArt ===
              "ready",
          );
          await idle(newer);
          await click(newer, "#campaign-start");
          await idle(newer);
          await menu(newer);
          // Continue now saves by design. Acknowledge that earlier write before
          // opening the archive confirmation whose race this scenario tests.
          await command(page, "load");
          await freeze(newer);
          const archiveCommand = await page
            .locator('#campaign-archives [data-command^="archive:"]')
            .first()
            .getAttribute("data-command");
          await command(page, archiveCommand);
          assert.equal(
            await page.locator("#campaign-confirm").isVisible(),
            true,
          );
          await command(newer, "save");
          for (let tries = 0; tries < 100; tries++) {
            if (!(await page.locator("#campaign-confirm").isVisible())) break;
            await wait(20);
          }
          assert.equal(
            await page.locator("#campaign-confirm").isVisible(),
            false,
            "Broadcast conflict closes stale archive confirmation",
          );
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            "menu",
          );
          assert.equal(
            await page.locator("#campaign-resume").isDisabled(),
            true,
          );
          assert.match(
            await page.locator("#campaign-storage-notice").innerText(),
            /another tab|newer|changed/i,
          );
          await page.screenshot({
            path: `${path}/archive-broadcast-conflict.png`,
          });
          await command(page, "load");
          assert.equal(
            (await exportCheckpoint(page)).state.id,
            active.state.id,
            "A stale archive dialog never replaced newer campaign",
          );
          assert.equal(
            await page.locator("#campaign-resume").isEnabled(),
            true,
          );
          await play(page);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignPaused),
            "false",
            "Load then Resume clears every stale confirmation flag",
          );
          assert.deepEqual(faults, []);
          pass(
            "A second tab save closes an open archive confirmation, protects newer state and leaves Load→Resume usable",
          );
        }
        if (scenario === "gamepad") {
          const value = fixture("W01", 0);
          value.state.vehicle = { x: 5.5, y: -0.36, energy: 9, hull: 10 };
          value.state.credits = 20000;
          value.state.progress.beacon = true;
          value.state.progress.bankedOre = 3;
          value.state.progress.completed = [1];
          await restore(page, value);
          await page.evaluate(() => {
            window.__improvementPad = {
              connected: true,
              index: 0,
              id: "QA standard controller",
              mapping: "standard",
              axes: [0, 0, 0, 0],
              buttons: Array.from({ length: 17 }, () => ({
                pressed: false,
                touched: false,
                value: 0,
              })),
            };
            Object.defineProperty(navigator, "getGamepads", {
              configurable: true,
              value: () => [window.__improvementPad],
            });
          });
          const pad = async (index) => {
            await page.evaluate((i) => {
              window.__improvementPad.buttons[i] = {
                pressed: true,
                touched: true,
                value: 1,
              };
            }, index);
            await advance(page, 60);
            await page.evaluate((i) => {
              window.__improvementPad.buttons[i] = {
                pressed: false,
                touched: false,
                value: 0,
              };
            }, index);
            await advance(page, 350);
            await idle(page);
          };
          const focus = async (selector) => {
            // Compute a short spatial D-pad path from the visible terminal. We
            // never call focus(): every edge is exercised by native pad polling.
            for (let attempt = 0; attempt < 8; attempt++) {
              const route = await page.evaluate((selector) => {
                const confirmation =
                  document.getElementById("campaign-confirm");
                const host = confirmation?.open
                  ? confirmation
                  : document.getElementById(
                      "campaign-" + document.body.dataset.campaignOverlay,
                    );
                if (!host) throw new Error("No controller menu is open");
                const controls = [
                  ...host.querySelectorAll(
                    "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]",
                  ),
                ].filter(
                  (el) =>
                    !el.closest("[hidden], [inert]") &&
                    (!el.closest("details:not([open])") ||
                      el
                        .closest("details:not([open])")
                        .querySelector(":scope > summary")
                        ?.contains(el)) &&
                    el.checkVisibility?.() !== false &&
                    el.getClientRects().length,
                );
                const target = controls.findIndex((el) => el.matches(selector));
                if (target < 0)
                  throw new Error("No enabled controller target: " + selector);
                const start = controls.indexOf(document.activeElement);
                if (start === target) return [];
                if (start < 0) return [13];
                const queue = [[start, []]],
                  visited = new Set([start]);
                for (let head = 0; head < queue.length; head++) {
                  const [current, path] = queue[head],
                    rect = controls[current].getBoundingClientRect();
                  for (const [key, dx, dy] of [
                    [12, 0, -1],
                    [13, 0, 1],
                    [14, -1, 0],
                    [15, 1, 0],
                  ]) {
                    let next = -1,
                      score = Infinity;
                    controls.forEach((el, index) => {
                      if (index === current) return;
                      const r = el.getBoundingClientRect(),
                        x = r.x + r.width / 2 - rect.x - rect.width / 2,
                        y = r.y + r.height / 2 - rect.y - rect.height / 2;
                      const forward = x * dx + y * dy,
                        value =
                          forward > 2
                            ? forward + Math.abs(x * dy - y * dx) * 3
                            : Infinity;
                      if (value < score) {
                        score = value;
                        next = index;
                      }
                    });
                    if (next < 0)
                      next =
                        (current +
                          (key === 12 || key === 14 ? -1 : 1) +
                          controls.length) %
                        controls.length;
                    if (next === target) return [...path, key];
                    if (!visited.has(next)) {
                      visited.add(next);
                      queue.push([next, [...path, key]]);
                    }
                  }
                }
                throw new Error(
                  "Controller target is unreachable: " + selector,
                );
              }, selector);
              if (!route.length) return;
              for (const direction of route) await pad(direction);
            }
            await page.screenshot({
              path: `${path}/gamepad-focus-failure.png`,
            });
            console.log(
              await page.evaluate(() => ({
                focus: document.activeElement?.outerHTML,
                clock: performance.now(),
                overlays: [...document.querySelectorAll("dialog[open]")].map(
                  (d) => d.id,
                ),
              })),
            );
            throw new Error("Gamepad could not focus " + selector);
          };
          await advance(page, 350);
          await pad(4);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            "dock",
          );
          await focus('[data-tab="service"]');
          await pad(0);
          await focus('[data-command="bank-sell"]');
          const gamepadFocus = await page.evaluate(() => {
            const el = document.activeElement,
              css = getComputedStyle(el);
            return {
              tag: el.tagName,
              command: el.dataset.command,
              style: css.outlineStyle,
              width: parseFloat(css.outlineWidth),
              focusVisible: el.matches(":focus-visible"),
            };
          });
          results.measurements.gamepadFocus = gamepadFocus;
          console.log("Gamepad focus cue " + JSON.stringify(gamepadFocus));
          assert.ok(
            gamepadFocus.style !== "none" && gamepadFocus.width >= 2,
            "Gamepad selection has a visible outline after pointer-based menu use",
          );
          await pad(0);
          assert.match(
            await page.locator("#campaign-dock-message").innerText(),
            /sold|banked/i,
          );
          await focus('[data-tab="hardware"]');
          await pad(0);
          await focus('[data-command="hardware-energy"]');
          await pad(0);
          assert.match(
            await page.locator("#campaign-dock-message").innerText(),
            /rank 1|installed|upgraded/i,
          );
          if (await page.locator("#campaign-reward").isVisible()) {
            await pad(1);
            assert.equal(
              await page.evaluate(() => document.body.dataset.campaignOverlay),
              "dock",
              "First Back skips the install presentation without closing the terminal",
            );
          }
          await pad(1);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            undefined,
          );
          await page.keyboard.down("Enter");
          await advance(page, 400);
          for (let repeat = 0; repeat < 8; repeat++) {
            await page.keyboard.down("Enter");
            await advance(page, 75);
          }
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            "dock",
            "Held Enter cannot dismiss the newly opened terminal",
          );
          await page.keyboard.up("Enter");
          await page.screenshot({ path: `${path}/gamepad-terminal.png` });
          const comet = fixture("W02", 0);
          comet.state.vehicle = { x: 5.5, y: -0.36, energy: 9, hull: 10 };
          await restore(page, comet);
          await advance(page, 350);
          await pad(5);
          assert.equal(
            await page.evaluate(() => document.body.dataset.campaignOverlay),
            "map",
          );
          await focus('[data-command="travel-W01"]');
          await pad(0);
          assert.equal(
            await page
              .locator("#campaign-confirm")
              .evaluate((dialog) => dialog.open),
            true,
          );
          await focus("#campaign-confirm-accept");
          await pad(0);
          if (await page.locator("#campaign-reward").isVisible()) await pad(1);
          const traveled = await exportCheckpoint(page);
          assert.equal(traveled.state.currentWorld, "W01");
          await page.screenshot({ path: `${path}/gamepad-traveled.png` });
          pass(
            "Gamepad D-pad/A/B docks, sells, buys energy, skips presentation, undocks and confirms interworld travel; held Enter leaves the terminal open",
          );
        }
        noErrors(page);
      } finally {
        await context.close();
      }
    }
  }
  if (selected.has("fog")) {
    for (const worldId of ["W01", "W02"]) {
      // A frozen scene clock keeps glints and rig frames identical between
      // the captures each check compares. A baseline build predates the hook.
      const { context, page } = await ready(
        browser,
        base,
        {},
        { freezeSceneClock: !baseline },
      );
      try {
        await freeze(page);
        const solid = fixture(worldId, 18),
          mine = world(solid),
          column = Math.floor(solid.state.vehicle.x) + 6;
        const hidden = [];
        for (let y = 16; y <= 20; y++)
          for (let x = column; x <= column + 1; x++) {
            const canonical = x % mine.width;
            hidden.push([canonical, y]);
            mine.tiles[y * mine.width + canonical] = 2;
            mine.discovered[y * mine.width + canonical] = 0;
          }
        await restore(page, solid);
        const view = await settledView(page, solid);
        const clip = {
          x: column * view.tile - view.cx + 3,
          y: 17 * view.tile - view.cy + 3,
          width: view.tile * 2 - 6,
          height: view.tile * 3 - 6,
        };
        assert.ok(clip.x > 0 && clip.x + clip.width < 1440);
        const solidFile = `${path}/${worldId}-hidden-solid.png`;
        await page.screenshot({ path: solidFile, clip });
        const air = structuredClone(solid);
        for (const [x, y] of hidden) clear(air, x, y);
        await restore(page, air);
        // Hidden cells must not move the camera, and the clip only covers the
        // same world window under the same transform.
        assert.deepEqual(
          await settledView(page, air),
          view,
          "Unknown cave changes the camera framing",
        );
        const airFile = `${path}/${worldId}-hidden-air.png`;
        await page.screenshot({ path: airFile, clip });
        execFileSync("python3", [
          "-c",
          "from PIL import Image,ImageChops;import sys;assert ImageChops.difference(Image.open(sys.argv[1]).convert('RGB'),Image.open(sys.argv[2]).convert('RGB')).getbbox() is None, 'Unknown cave differs from unknown solid rock'",
          solidFile,
          airFile,
        ]);
        await restore(page, solid);
        // One frame after an import is the first frame of its 180 ms fade:
        // compare settled views, not the fade colour with a part-faded frame.
        await settledView(page, solid);
        const ordinary = `${path}/${worldId}-normal-edges.png`;
        await page.screenshot({ path: ordinary });
        await menu(page);
        await pauseSection(page, "systems");
        await click(page, '[data-setting="highContrast"]');
        await play(page, 50);
        assert.equal(
          await page
            .locator("#campaign-game")
            .getAttribute("data-high-contrast"),
          "true",
        );
        const enhanced = `${path}/${worldId}-high-contrast-edges.png`;
        await page
          .locator("#campaign-game canvas")
          .screenshot({ path: enhanced });
        // Compare a known shaftedge rectangle away from HUD, depth fixtures are static.
        execFileSync("python3", [
          "-c",
          "from PIL import Image,ImageChops;import sys;a=Image.open(sys.argv[1]).convert('RGB').crop((600,250,840,600));b=Image.open(sys.argv[2]).convert('RGB').crop((600,250,840,600));assert ImageChops.difference(a,b).getbbox() is not None, 'High contrast does not affect the canvas'",
          ordinary,
          enhanced,
        ]);
        noErrors(page);
      } finally {
        await context.close();
      }
    }
    pass(
      "Both worlds hide caves identically to solid rock; high contrast changes actual canvas edges",
    );
  }
  if (selected.has("sky")) {
    const titleContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    try {
      const titlePage = await titleContext.newPage();
      await titlePage.goto(base);
      await titlePage.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      await freeze(titlePage);
      await advance(titlePage, 100);
      assert.equal(
        await titlePage
          .locator("#campaign-game")
          .getAttribute("data-world-labels"),
        "0",
        "Title has no live world labels",
      );
      await titlePage.screenshot({ path: `${path}/title-no-world-labels.png` });
    } finally {
      await titleContext.close();
    }
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3440, height: 1440 },
    ]) {
      const { context, page } = await ready(browser, base, { viewport });
      try {
        await freeze(page);
        for (const worldId of ["W01", "W02"])
          for (const height of ["spawn", "ceiling"]) {
            const value = fixture(worldId, 0);
            value.state.vehicle.y = height === "spawn" ? -0.36 : -4.5;
            await restore(page, value);
            await advance(page, 50);
            const view = await page
              .locator("#campaign-game")
              .evaluate((el) => ({
                visible: el.dataset.skyBodyVisible,
                bounds: el.dataset.skyBodyBounds,
              }));
            assert.equal(view.visible, "true");
            const body = JSON.parse(view.bounds);
            assert.ok(body.width > 0 && body.height > 0);
            assert.ok(
              body.x >= 0 &&
                body.x + body.width <= viewport.width &&
                body.y >= 0 &&
                body.y + body.height <= viewport.height,
              `${worldId}/${height}/${viewport.width}: sky body clipped`,
            );
            await page.screenshot({
              path: `${path}/${worldId}-sky-${viewport.width}-${height}.png`,
            });
          }
        noErrors(page);
      } finally {
        await context.close();
      }
    }
    pass(
      "At five desktop resolutions both worlds render one sky body within the viewport at spawn and ceiling (20 captures); source seams covered by asset checks",
    );
  }
  if (selected.has("visual")) {
    const entries = {},
      disabledEntries = {};
    for (const [kind, viewport, options] of viewportTypes) {
      // The alarm border's alpha and the rig frames follow the scene clock;
      // freezing it before Start fixes their phase in every run. A baseline
      // build predates the hook.
      const { context, page } = await ready(
        browser,
        base,
        { viewport, ...options },
        { freezeSceneClock: !baseline },
      );
      try {
        await freeze(page);
        for (const worldId of ["W01", "W02"]) {
          // Measure the restored view, not a frame of the import. The first
          // W02 restore in each context loads that world's atlas on demand;
          // the 180 ms fade-in starts only once it arrives, so a fixed advance
          // could capture the previous view, a partial fade or the fade colour.
          // The W02 fixture's column is already open through row 6, so rest
          // that rig on its floor (row 7) rather than restore it mid-air.
          const value = fixture(worldId, worldId === "W01" ? 6 : 7);
          await restore(page, value);
          await settledView(page, value);
          await capture(page, path, `${worldId}-${kind}-shaft`, entries);
          // W02's arrival notice expires on the game clock at about the time
          // the danger view settles, and how long the shaft view takes to
          // settle depends on the atlas load. Let it expire first, so the
          // danger capture never shows it.
          for (
            let step = 0;
            step < 100 && (await page.locator("#campaign-message").isVisible());
            step++
          )
            await advance(page, 50);
          value.state.vehicle.energy = 2.2;
          value.state.vehicle.hull = 1.5;
          await restore(page, value);
          await settledView(page, value);
          await capture(page, path, `${worldId}-${kind}-danger`, entries);
          if (!baseline) {
            value.state.vehicle.energy = 0;
            await restore(page, value);
            // A disabled rig pauses the game, but the import's fade still
            // runs: settle before the screenshot, as the other captures do.
            await settledView(page, value);
            assert.equal(
              await page.evaluate(() => window.__campaignDebug.fade().running),
              false,
              kind + ": disabled capture is past the import fade",
            );
            const target = page.locator("#campaign-disabled-recover"),
              box = await target.boundingBox();
            assert.ok(
              box && box.height >= 44 && box.width >= 44,
              kind + ": comfortable recovery target",
            );
            assert.ok(
              box.y >= 0 &&
                box.y + box.height <= viewport.height &&
                box.x >= 0 &&
                box.x + box.width <= viewport.width,
              kind + ": recovery button stays in viewport",
            );
            // Measured like the others (dark share, text contrast including
            // the recovery card), but outside the 12-capture thresholds.
            await capture(
              page,
              path,
              `${worldId}-${kind}-disabled`,
              disabledEntries,
              "#campaign-disabled",
            );
          }
        }
        noErrors(page);
      } finally {
        await context.close();
      }
    }
    await writeFile(
      `${path}/capture-manifest.json`,
      JSON.stringify(entries, null, 2),
    );
    execFileSync("python3", [
      "scripts/improvement-pixels.py",
      `${path}/capture-manifest.json`,
      `${path}/pixels.json`,
    ]);
    const pixels = JSON.parse(await readFile(`${path}/pixels.json`, "utf8"));
    results.measurements.pixels = pixels;
    if (Object.keys(disabledEntries).length) {
      await writeFile(
        `${path}/disabled-manifest.json`,
        JSON.stringify(disabledEntries, null, 2),
      );
      execFileSync("python3", [
        "scripts/improvement-pixels.py",
        `${path}/disabled-manifest.json`,
        `${path}/disabled-pixels.json`,
      ]);
      results.measurements.disabledPixels = JSON.parse(
        await readFile(`${path}/disabled-pixels.json`, "utf8"),
      );
    }
    const worst = Math.min(
      ...Object.values(pixels).map((item) => item.minimumHudContrast),
    );
    console.log(
      `HUD minimum contrast ${worst}; dark shares ` +
        Object.entries(pixels)
          .filter(([name]) => name.includes("shaft"))
          .map(
            ([name, value]) =>
              `${name}=${(100 * value.darkShareBelow40).toFixed(1)}%`,
          )
          .join(", "),
    );
    if (!baseline) {
      for (const [name, value] of Object.entries(pixels)) {
        assert.ok(
          value.minimumHudContrast >= 4.5,
          `${name}: HUD contrast ${value.minimumHudContrast}, ${JSON.stringify(value.lowContrast)}`,
        );
        if (name.includes("shaft") && name.includes("desktop"))
          assert.ok(
            value.darkShareBelow40 <= 0.6,
            `${name}: dark-pixel share ${value.darkShareBelow40}`,
          );
      }
      pass(
        "12 frozen world/viewport/state captures retain HUD contrast ≥4.5:1; desktop shafts ≤60% dark pixels",
      );
    }
  }
  if (selected.has("harness")) {
    // Audit F3, per pull request: the §9 fixtures at backing 1 through F1's
    // pin, each with its HUD-free twin, light map and exported state, scored
    // by the measures ported from metrics.py. The @2 sheets and the §9.2 table
    // run nightly in their own job (checks.yml, visual-sheets). Nothing here
    // asserts a §9 target: those are gates for later phases.
    const { runArtCaptures, SHEET_CAPTURES, TEST_RASTER_CAPTURE } =
      await import("./art-captures.mjs");
    const harness = `${path}/harness`;
    const hudFree = new URL(base);
    hudFree.searchParams.set("overlays", "0");
    {
      const { context, page } = await ready(browser, hudFree.href);
      try {
        assert.equal(
          await page
            .evaluate(() => [
              document.body.dataset.annotations,
              window.__campaignDebug.overlays(),
              getComputedStyle(document.querySelector(".campaign-hud")).opacity,
            ])
            .then(JSON.stringify),
          JSON.stringify(["off", false, "0"]),
          "?overlays=0 starts with every annotation hidden",
        );
        noErrors(page);
      } finally {
        await context.close();
      }
    }
    // F6 (D3): the depth rail shows only while paused or while the HUD's
    // depth readout is hovered.
    {
      const { context, page } = await ready(browser, base);
      try {
        await freeze(page);
        const rail = () =>
          page.evaluate(
            () =>
              getComputedStyle(document.querySelector("#campaign-depth-rail"))
                .opacity,
          );
        assert.equal(await rail(), "0", "The depth rail is hidden in play");
        await page.hover("#campaign-depth");
        assert.equal(await rail(), "1", "Hovering the depth readout shows it");
        await page.mouse.move(720, 450);
        assert.equal(await rail(), "0", "Leaving the readout hides it again");
        await click(page, "#campaign-menu-toggle");
        await advance(page, 100);
        assert.equal(await rail(), "1", "The pause menu shows the depth rail");
        noErrors(page);
      } finally {
        await context.close();
      }
    }
    const manifest = await runArtCaptures(
      browser,
      base,
      `${harness}/captures`,
      // T13a: also the 60 m fixture with the placeholder raster frame.
      { only: [...SHEET_CAPTURES, TEST_RASTER_CAPTURE], backing: 1 },
    );
    assert.equal(
      manifest.captures[TEST_RASTER_CAPTURE]?.testRaster,
      "true",
      "The raster-source placeholder (T13a) is drawn in the 60 m fixture",
    );
    for (const name of SHEET_CAPTURES) {
      const capture = manifest.captures[name];
      assert.ok(capture, `${name} was captured`);
      assert.equal(capture.backingScale, 1, `${name}: backing pinned at 1`);
      assert.equal(
        capture.devicePixelRatio,
        capture.deviceScaleFactor,
        `${name}: device pixel ratio pinned`,
      );
      assert.deepEqual(
        capture.sceneClock,
        { elapsed: 0, frozen: true },
        `${name}: scene clock frozen before Start`,
      );
      assert.ok(
        capture.light.width > 0 && capture.light.height > 0,
        `${name}: light map captured`,
      );
    }
    console.log(
      execFileSync("python3", [
        "scripts/art-metrics-check.py",
        manifest.captures["a04-dive-60m@2"].hudFree,
      ])
        .toString()
        .trim(),
    );
    console.log(
      execFileSync("python3", [
        "scripts/art-sheets.py",
        "--captures",
        `${harness}/captures`,
        "--out",
        harness,
        "--table-only",
      ]).toString(),
    );
    const table = JSON.parse(await readFile(`${harness}/table.json`, "utf8"));
    results.measurements.harness = table;
    // F6 (D3): no lander nameplate and no " · mission part" suffix in any
    // frame's playfield text.
    const nameplates = [
      "SALVAGE LANDER",
      "LANDER RESTORED",
      "COMET REFUGE",
      "CONDENSER STABILIZED",
    ];
    for (const name of SHEET_CAPTURES)
      for (const item of manifest.captures[name].playfieldText) {
        assert.ok(
          !nameplates.includes(item.text),
          `${name}: the lander nameplate is gone (F6)`,
        );
        assert.ok(
          !item.text.includes("· mission part"),
          `${name}: no " · mission part" suffix (F6)`,
        );
      }
    console.log(
      `Playfield text items (HUD left out): ${SHEET_CAPTURES.map((name) => `${name} ${manifest.captures[name].playfieldText.length}`).join(", ")}`,
    );
    for (const [name, frame] of Object.entries(table.frames)) {
      assert.ok(
        frame.overlay.edges_full > frame.overlay.edges_hudfree,
        `${name}: the HUD-free frame drops the overlays' edges`,
      );
      for (const value of [
        frame.frame.L_mean,
        frame.frame.edge_density,
        frame.tiles_across,
      ])
        assert.ok(Number.isFinite(value), `${name}: measures are numbers`);
    }
    pass(
      `${SHEET_CAPTURES.length} §9 fixtures at backing 1 with HUD-free frames, light maps and the measures ported from metrics.py; the T13a raster placeholder drawn at 60 m`,
    );
  }
  if (selected.has("perf")) {
    const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3,
    });
    await context.addInitScript(() => {
      const now = performance.now.bind(performance),
        raf = requestAnimationFrame.bind(window);
      window.__improvementFrames = [];
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          const start = now();
          callback(time);
          window.__improvementFrames.push(now() - start);
        });
    });
    const page = await context.newPage();
    try {
      await page.goto(base);
      await page.waitForFunction(
        () =>
          document.querySelector("#campaign-game")?.dataset.campaignArt ===
          "ready",
      );
      await click(page, "#campaign-start");
      await idle(page);
      await importCheckpoint(page, fixture("W01", 18));
      await closeOverlay(page);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await wait(700);
      const samples = [];
      for (let run = 0; run < 3; run++) {
        await page.evaluate(() => (window.__improvementFrames.length = 0));
        await wait(2500);
        const ms = await page.evaluate(() =>
          window.__improvementFrames.slice(5).sort((a, b) => a - b),
        );
        samples.push({
          frames: ms.length,
          median: ms[Math.floor(ms.length * 0.5)],
          p95: ms[Math.floor(ms.length * 0.95)],
          p99: ms[Math.floor(ms.length * 0.99)],
        });
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      results.measurements.phone4xCpu = samples;
      console.log("Advisory 4× CPU frame JS " + JSON.stringify(samples));
    } finally {
      await context.close();
    }
  }
  await writeFile(`${path}/results.json`, JSON.stringify(results, null, 2));
  return results;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Not a top-level await: the harness section imports art-captures.mjs,
  // which imports this module, and that import cannot finish while this
  // module is still evaluating.
  (async () => {
    const browser = await launchBrowser();
    try {
      await runImprovementSmoke(
        browser,
        process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
        process.env.IMPROVEMENT_ARTIFACTS || "artifacts/improvement",
      );
    } finally {
      await browser.close();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
