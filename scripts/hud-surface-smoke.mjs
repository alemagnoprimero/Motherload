import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import {
  advance,
  closeOverlay,
  exportCheckpoint,
  freeze,
  importCheckpoint,
  keys,
  noErrors,
  ready,
} from "./campaign-smoke.mjs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const output = process.env.HUD_ARTIFACTS || "artifacts/hud-surface";
const measureOnly = process.env.HUD_MEASURE_ONLY === "1";
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const results = [];
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["portrait", { width: 393, height: 851 }],
    ["landscape", { width: 844, height: 390 }],
    ["small", { width: 568, height: 320 }],
  ]) {
    const { context, page } = await ready(browser, base, {
      viewport,
      hasTouch: name !== "desktop",
      isMobile: name !== "desktop",
    });
    try {
      await freeze(page);
      const fixture = await exportCheckpoint(page);
      const world = fixture.state.worlds.W01;
      for (let row = 0; row < 5; row++) world.tiles[row * world.width + 20] = 0;
      for (const item of world.packages)
        if (Math.floor(item.x) === 20) item.status = "lost";
      Object.assign(fixture.state.vehicle, {
        x: 20.5,
        y: 2.5,
        energy: 2.4,
        hull: 2.4,
      });
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await keys(page, ["ArrowUp"]);
      let crossed = false;
      for (let elapsed = 0; elapsed < 5000; elapsed += 100) {
        await advance(page, 100);
        const y = Number(
          await page.locator("#campaign-game").getAttribute("data-rig-world-y"),
        );
        if (y < -0.1) {
          crossed = true;
          break;
        }
      }
      assert.ok(
        crossed,
        name + " natively crosses the surface while ascending",
      );
      await keys(page, []);
      await advance(page, 100);
      const metrics = await page.evaluate(() => {
        const ids = [
          "campaign-coach",
          "campaign-return",
          "campaign-message",
          "campaign-extraction",
          "campaign-danger",
        ];
        const cards = ids.flatMap((id) => {
          const node = document.getElementById(id);
          const style = getComputedStyle(node);
          if (
            node.hidden ||
            !node.getClientRects().length ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          )
            return [];
          const rect = node.getBoundingClientRect();
          return [
            {
              id,
              text: node.textContent,
              x: rect.x,
              y: rect.y,
              right: rect.right,
              bottom: rect.bottom,
            },
          ];
        });
        const host = document.getElementById("campaign-game");
        return {
          cards,
          rigY: Number(host.dataset.rigScreenY),
          surfaceY: -Number(host.dataset.viewCameraY),
          height: innerHeight,
          width: innerWidth,
        };
      });
      assert.equal(await page.locator("#campaign-danger").isVisible(), true);
      assert.match(
        await page.locator("#campaign-danger").innerText(),
        /Low energy|Energy critical|Emergency reserve/,
      );
      assert.match(
        await page.locator("#campaign-danger").innerText(),
        /Critical hull/,
      );
      if (!measureOnly) {
        assert.equal(
          await page.locator("#campaign-coach").isVisible(),
          false,
          "Danger takes priority over coaching",
        );
        for (const card of metrics.cards) {
          assert.ok(
            card.x >= 0 &&
              card.right <= viewport.width &&
              card.y >= 0 &&
              card.bottom <= viewport.height,
            name + " advisory fits: " + card.id,
          );
          assert.ok(
            card.bottom < metrics.surfaceY - 20,
            name +
              " advisory leaves the surface clear: " +
              JSON.stringify({ card, metrics }),
          );
        }
        for (let i = 0; i < metrics.cards.length; i++)
          for (let j = i + 1; j < metrics.cards.length; j++) {
            const a = metrics.cards[i],
              b = metrics.cards[j];
            assert.ok(
              a.right <= b.x ||
                b.right <= a.x ||
                a.bottom <= b.y ||
                b.bottom <= a.y,
              name + " advisory cards do not overlap",
            );
          }
      }
      noErrors(page);
      await page.screenshot({ path: `${output}/${name}.png` });
      results.push({ name, ...metrics });
      Object.assign(fixture.state.vehicle, {
        x: 19.5,
        y: -0.36,
        energy: 10,
        hull: 10,
      });
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      for (let elapsed = 0; elapsed < 12000; elapsed += 500) {
        await advance(page, 500);
        if (
          (await page.locator("#campaign-coach").isVisible()) &&
          !(await page.locator("#campaign-message").isVisible())
        )
          break;
      }
      if (!measureOnly) {
        assert.equal(await page.locator("#campaign-danger").isVisible(), false);
        assert.equal(
          await page.locator("#campaign-message").isVisible(),
          false,
        );
        assert.equal(
          await page.locator("#campaign-coach").isVisible(),
          true,
          "The persistent guide returns after safety clears and transient notices expire",
        );
        const guide = await page.locator("#campaign-coach").boundingBox();
        const surface = -Number(
          await page
            .locator("#campaign-game")
            .getAttribute("data-view-camera-y"),
        );
        assert.ok(
          guide.y + guide.height < surface - 20,
          name + " coaching leaves the surface clear",
        );
      }
      noErrors(page);
      await page.screenshot({ path: `${output}/${name}-guide.png` });
      Object.assign(fixture.state.vehicle, {
        x: 5.5,
        y: -0.36,
        energy: 2.4,
        hull: 2.4,
      });
      await importCheckpoint(page, fixture);
      await closeOverlay(page);
      await advance(page, 1500);
      const dock = await page.evaluate(() => {
        const host = document.getElementById("campaign-game");
        const tile = Number(host.dataset.viewTile);
        const center = Number(host.dataset.rigScreenX);
        const floor = -Number(host.dataset.viewCameraY);
        const art = {
          x: center - 2 * tile,
          right: center + 2 * tile,
          y: floor - 3 * tile,
          bottom: floor,
        };
        const obstacles = [
          ".campaign-objective",
          "#campaign-danger",
          "#campaign-message",
          "#campaign-coach",
          "#campaign-dock-toggle",
          ".campaign-toolbar",
        ].flatMap((selector) => {
          const node = document.querySelector(selector);
          const style = getComputedStyle(node);
          if (
            node.hidden ||
            !node.getClientRects().length ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          )
            return [];
          const rect = node.getBoundingClientRect();
          return [
            {
              selector,
              x: rect.x,
              right: rect.right,
              y: rect.y,
              bottom: rect.bottom,
            },
          ];
        });
        return { art, obstacles };
      });
      await page.screenshot({ path: `${output}/${name}-dock.png` });
      results.at(-1).dock = dock;
      if (!measureOnly)
        for (const card of dock.obstacles) {
          const art = dock.art;
          assert.ok(
            art.right <= card.x ||
              card.right <= art.x ||
              art.bottom <= card.y ||
              card.bottom <= art.y,
            name +
              " lander art is not covered: " +
              JSON.stringify({ card, art }),
          );
        }
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    `Surface HUD ${measureOnly ? "measurements" : "checks"} completed: ${results.length}`,
  );
} finally {
  await browser.close();
}
