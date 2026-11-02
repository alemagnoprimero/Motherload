/** Native-clock CPU proxy. Run alone; these are cloud measurements, never physical-device FPS. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser-launch.mjs";
import {
  click,
  idle,
  menu,
  pauseSection,
  closeOverlay,
  keys,
} from "./campaign-smoke.mjs";
import { installRenderProbe } from "./render-probe.mjs";
const output = process.env.RENDER_ARTIFACTS || "artifacts/render-budget";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173/";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (numbers, fraction) =>
  [...numbers].sort((a, b) => a - b)[
    Math.min(numbers.length - 1, Math.floor(numbers.length * fraction))
  ];
await mkdir(output, { recursive: true });
const results = {
  base,
  cpuThrottle: 4,
  frames: {},
  limits: { p95JsMs: 12, draws: 12 },
  notes: [
    "Native performance.now around actual rAF callbacks; geometry/fog instrumentation disabled during timing.",
    "SwiftShader and a shared cloud host are a relative CPU proxy, not physical Android or GPU frame-time evidence.",
  ],
};
const browser = await launchBrowser();
try {
  for (const [name, viewport, touch] of [
    ["phone", { width: 393, height: 851 }, true],
    ["deep", { width: 1440, height: 900 }, false],
  ]) {
    if (
      process.env.RENDER_FORMS &&
      !process.env.RENDER_FORMS.split(",").includes(name)
    )
      continue;
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: touch ? 3 : 1,
      isMobile: touch,
      hasTouch: touch,
    });
    await context.addInitScript(installRenderProbe, {
      geometry: false,
      fog: false,
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        "motherload.campaign.preferences.v1",
        JSON.stringify({ coachSkipped: true, sound: false, renderScale: 2 }),
      ),
    );
    const page = await context.newPage(),
      faults = [];
    page.on("pageerror", (error) => faults.push(error.message));
    await page.goto(base + "?renderer=webgl");
    await page.waitForFunction(
      () =>
        document.querySelector("#campaign-game")?.dataset.campaignArt ===
        "ready",
    );
    await click(page, "#campaign-start");
    await idle(page);
    if (name === "deep") {
      const checkpoint = JSON.parse(
        await readFile(
          new URL("../tests/fixtures/improvement-w01.json", import.meta.url),
          "utf8",
        ),
      );
      const world = checkpoint.state.worlds.W01;
      world.discovered.fill(1);
      const missionCells = new Set(
        world.missions.map(
          (item) => Math.floor(item.y) * world.width + Math.floor(item.x),
        ),
      );
      for (let row = 28; row <= 30; row++)
        for (let x = 2; x < world.width - 2; x++) {
          const index = row * world.width + x;
          if (missionCells.has(index)) continue;
          world.tiles[index] = 0;
          for (const item of world.packages)
            if (
              item.status === "deposit" &&
              Math.floor(item.x) === x &&
              Math.floor(item.y) === row
            )
              item.status = "exposed";
        }
      checkpoint.state.vehicle = { x: 8.5, y: 30.64, energy: 10, hull: 10 };
      await menu(page);
      await pauseSection(page, "save");
      await page.locator("#campaign-import").setInputFiles({
        name: "render-budget.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(checkpoint)),
      });
      await page.locator("#campaign-confirm").waitFor({ state: "visible" });
      // Native keyboard hold is independent of the animated pointer-button bounds.
      await page.locator("#campaign-confirm-accept").focus();
      await page.keyboard.down("Enter");
      await wait(1000);
      await page.keyboard.up("Enter");
      await page.waitForFunction(
        () => !document.querySelector("#campaign-confirm").open,
        null,
        { timeout: 10000 },
      );
      await idle(page);
      await closeOverlay(page);
    }
    await wait(1000);
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    for (const phase of process.env.RENDER_PROFILE_ONLY === "1"
      ? []
      : ["idle", "moving"]) {
      await page.evaluate(() => {
        window.__renderProbe.frames.length = 0;
      });
      if (phase === "moving")
        await keys(page, [name === "phone" ? "ArrowDown" : "ArrowRight"]);
      await wait(phase === "idle" ? 2000 : 5000);
      await keys(page, []);
      const measured = await page.evaluate(() => ({
        frames: window.__renderProbe.frames.slice(3),
        dpr: Number(document.querySelector("#campaign-game").dataset.viewDpr),
        textureBytes: Number(
          document.querySelector("#campaign-game").dataset.residentTextureBytes,
        ),
      }));
      assert.ok(
        measured.frames.length >= 5,
        "native render frames are sampled",
      );
      const metric = {
        count: measured.frames.length,
        dpr: measured.dpr,
        textureBytes: measured.textureBytes,
      };
      for (const field of ["ms", "draws", "uploads", "subUploads"])
        metric[field] = {
          median: percentile(
            measured.frames.map((frame) => frame[field]),
            0.5,
          ),
          p95: percentile(
            measured.frames.map((frame) => frame[field]),
            0.95,
          ),
          max: Math.max(...measured.frames.map((frame) => frame[field])),
        };
      metric.gates = {
        p95Js: metric.ms.p95 <= 12 ? "pass" : "unmet",
        drawCalls: metric.draws.max <= 12 ? "pass" : "unmet",
        ...(phase === "idle"
          ? {
              stationaryUploads:
                metric.uploads.max + metric.subUploads.max === 0
                  ? "pass"
                  : "unmet",
            }
          : {}),
      };
      results.frames[name + "-" + phase] = metric;
      console.log(name, phase, JSON.stringify(metric));
    }
    if (process.env.RENDER_PROFILE === "1") {
      await client.send("Profiler.enable");
      await client.send("Profiler.setSamplingInterval", { interval: 250 });
      await client.send("Profiler.start");
      await keys(page, [name === "phone" ? "ArrowDown" : "ArrowRight"]);
      await wait(5000);
      await keys(page, []);
      const { profile } = await client.send("Profiler.stop");
      await writeFile(`${output}/${name}.cpuprofile`, JSON.stringify(profile));
      const nodes = new Map(profile.nodes.map((node) => [node.id, node])),
        totals = new Map();
      for (let i = 0; i < profile.samples.length; i++) {
        const frame = nodes.get(profile.samples[i]).callFrame;
        const key = `${frame.functionName || "(anonymous)"} @ ${frame.url.split("/").at(-1)}:${frame.lineNumber + 1}`;
        totals.set(key, (totals.get(key) || 0) + profile.timeDeltas[i]);
      }
      results.profiles ??= {};
      results.profiles[name] = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 35)
        .map(([functionName, microseconds]) => ({
          functionName,
          selfMs: microseconds / 1000,
        }));
      console.log(name, "profile", JSON.stringify(results.profiles[name]));
    }
    await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    assert.deepEqual(faults, []);
    await context.close();
  }
} catch (error) {
  results.failure = String(error);
  throw error;
} finally {
  await browser.close();
  await writeFile(
    output + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
}
if (process.env.RENDER_BUDGET_STRICT === "1")
  assert.ok(
    Object.values(results.frames).every((frame) =>
      Object.values(frame.gates).every((gate) => gate === "pass"),
    ),
    "Every strict render budget must pass",
  );
