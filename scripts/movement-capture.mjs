import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

// Development-only scenarios: use valid saves and ordinary browser controls.
// Run before and after a change: node scripts/movement-capture.mjs before|after
const label = process.argv[2] || "current";
if (!/^[a-z0-9_-]+$/i.test(label))
  throw new Error("Use a simple capture label.");
const directory = `artifacts/movement-${label}`;
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const report = {
  label,
  base,
  clock:
    "Browser frame clock advances only during explicit input holds; this is a qualitative comparison, not native SWF timing.",
  scenarios: {},
  errors: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(base);
  await page.locator("canvas").waitFor();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  async function setRunning(target, running) {
    await target.locator("#pause").evaluate((button, running) => {
      if ((button.getAttribute("aria-pressed") === "false") !== running)
        button.click();
    }, running);
  }
  async function fixture(target, kind) {
    await setRunning(target, false);
    await target.evaluate(async (kind) => {
      const { createState, decodeSave, SAVE_KEY, WIDTH } =
        await import("/src/model.ts");
      const state = createState(73021);
      if (kind === "down" || kind === "committed-cut") {
        state.x = 12.1;
        state.y = 3.15;
        for (let y = 4; y <= 10; y++) state.tiles[y * WIDTH + 12] = 3;
      } else {
        for (let y = 4; y <= (kind === "ledge" ? 24 : 50); y++)
          for (let x = 1; x <= 22; x++) state.tiles[y * WIDTH + x] = 0;
        state.x = kind === "ledge" ? 13.1 : 7;
        state.y = kind === "ledge" ? 5.4 : 30;
        state.deepest = kind === "ledge" ? 120 : 270;
        if (kind === "ledge") {
          state.tiles[8 * WIDTH + 13] = 1;
          state.tiles[7 * WIDTH + 14] = 3;
          state.tiles[8 * WIDTH + 14] = 1;
          state.tiles[7 * WIDTH + 15] = 8;
        }
      }
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify(decodeSave(JSON.stringify(state))),
      );
    }, kind);
    // Reload fires pagehide autosave, so load through the real game UI instead.
    await target.locator("#load").evaluate((button) => button.click());
  }
  async function capture(target, name) {
    // The browser clock is already stopped outside explicit runFor calls.
    // Pausing the game here would clear held keys/pointers and change the trace.
    await target.evaluate(async () => {
      document.querySelector("#save").click();
      if (document.body.dataset.saving === "true") {
        await new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            if (document.body.dataset.saving === "false") {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["data-saving"],
          });
        });
      }
    });
    const state = await target.evaluate(() =>
      JSON.parse(localStorage.getItem("motherload.frontier.v1")),
    );
    await target
      .locator("canvas")
      .screenshot({ path: `${directory}/${name}.png` });
    const result = {
      x: state.x,
      y: state.y,
      fuel: state.fuel,
      hull: state.hull,
      mined: state.mined,
      inventory: state.inventory,
      target: state.tiles[7 * 24 + 14],
      downTiles: state.tiles.filter((_, i) => i % 24 === 12).slice(4, 11),
    };
    report.scenarios[name] = result;
    return result;
  }
  await fixture(page, "ledge");
  await capture(page, "ledge-airborne");
  await setRunning(page, true);
  await page.clock.runFor(650);
  await capture(page, "ledge-landed");
  await page.keyboard.down("ArrowRight");
  await page.clock.runFor(300);
  await capture(page, "ledge-cutting");
  await page.clock.runFor(1500);
  await page.keyboard.up("ArrowRight");
  await capture(page, "ledge-complete");

  await fixture(page, "down");
  await capture(page, "down-start");
  await setRunning(page, true);
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(4200);
  await page.keyboard.up("ArrowDown");
  await page.clock.runFor(1500);
  await capture(page, "down-complete");

  await fixture(page, "committed-cut");
  await setRunning(page, true);
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(300);
  await capture(page, "committed-cut-start");
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowUp");
  await page.clock.runFor(1800);
  await page.keyboard.up("ArrowUp");
  await capture(page, "committed-cut-up");

  await fixture(page, "flight");
  await capture(page, "flight-start");
  await setRunning(page, true);
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowRight");
  await page.clock.runFor(700);
  await capture(page, "flight-powered");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowUp");
  await page.clock.runFor(250);
  await capture(page, "flight-coasting");
  await page.clock.runFor(550);
  await capture(page, "flight-falling");

  const mobile = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => report.errors.push(e.message));
  await phone.goto(base);
  await phone.locator("canvas").waitFor();
  await phone.clock.install();
  await phone.clock.pauseAt(new Date(Date.now() + 100));
  await fixture(phone, "flight");
  await phone.locator(".touch").scrollIntoViewIfNeeded();
  const cdp = await mobile.newCDPSession(phone);
  const points = await Promise.all(
    ["up", "right"].map(async (direction, id) => {
      const box = await phone
        .locator(`[data-dir="${direction}"]`)
        .boundingBox();
      return {
        id: id + 1,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
    }),
  );
  await setRunning(phone, true);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await phone.clock.runFor(500);
  await capture(phone, "touch-both");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [points[1]],
  });
  await phone.clock.runFor(350);
  await capture(phone, "touch-up-only");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await phone.clock.runFor(1000);
  await capture(phone, "touch-cancelled");
} finally {
  await writeFile(
    `${directory}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
if (report.errors.length) throw new Error(report.errors.join("\n"));
console.log(
  `Movement captures and ordinary-save observations written to ${directory}`,
);
