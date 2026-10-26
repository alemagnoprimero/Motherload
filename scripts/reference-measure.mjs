// Local research only: original assets and telemetry output stay in ignored artifacts/.
// Requires the verified SWF and JPEXS installed by scripts/setup-reference.sh.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const output = "artifacts/reference-measure";
const canonicalHash =
  "4d480aec3dde7de7e3da54a594398388fd3a03f71eefd63668a94ff015ed928d";
const hash = (data) => createHash("sha256").update(data).digest("hex");
await mkdir(`${output}/import/frame_1`, { recursive: true });
const original = await readFile("reference/motherload_2017.swf");
assert.equal(hash(original), canonicalHash, "Unexpected reference SWF");
const u16 = (value) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
};
const u32 = (value) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value);
  return b;
};
const swf = (body, compressed = false) =>
  Buffer.concat([
    Buffer.from(compressed ? "CWS\x08" : "FWS\x08", "binary"),
    u32(body.length + 8),
    compressed ? deflateSync(body) : body,
  ]);
function parseSwf(data) {
  const body =
    data.subarray(0, 3).toString() === "CWS"
      ? inflateSync(data.subarray(8))
      : data.subarray(8);
  let offset = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4;
  const header = body.subarray(0, offset),
    tags = [];
  while (offset < body.length) {
    const start = offset,
      word = body.readUInt16LE(offset);
    offset += 2;
    let length = word & 63;
    if (length === 63) {
      length = body.readUInt32LE(offset);
      offset += 4;
    }
    offset += length;
    tags.push({ code: word >> 6, bytes: body.subarray(start, offset) });
  }
  return { header, tags };
}
// Compile only this newly authored read-only callback in a tiny blank SWF.
// No original script is recompiled, replaced, or copied into tracked files.
const probeSource = `var labProbe = new Object();
labProbe.read = function() {
  var s = new Object();
  s.x = _root.atvMC._x - _root.earthMC._x;
  s.y = _root.atvMC._y - _root.earthMC._y;
  s.vx = _root.atv.xVel;
  s.vy = _root.atv.yVel;
  s.mode = _root.atv.mod;
  s.facing = _root.atv.facing;
  s.fuel = _root.atv.fuel;
  s.hp = _root.atv.hp;
  s.mass = _root.atv.mass;
  s.space = _root.atv.baySize[_root.atv.bay];
  for (var mineralIndex = 0; mineralIndex < 10; mineralIndex++) {
    s.mass += _root.atv.bayContents[mineralIndex] * _root.minerals[mineralIndex].mass;
    s.space -= _root.atv.bayContents[mineralIndex];
  }
  s.contents = _root.atv.bayContents.join(",");
  s.drillX = _root.atv.digX;
  s.drillY = _root.atv.digY;
  s.depth = _root.depth;
  s.gameMode = _root.gameMode;
  s.paused = _root.paused;
  s.timer = getTimer();
  s.rootFrame = _root._currentframe;
  s.drillDownFrame = _root.atvMC.digDownMC._currentframe;
  s.drillSideFrame = _root.atvMC.digAcrossMC._currentframe;
  var tx = Math.floor(s.x / 50 + 0.5);
  var ty = Math.floor(s.y / 50 + 0.5);
  s.leftTile = _root.earth[tx - 1][ty][0];
  s.rightTile = _root.earth[tx + 1][ty][0];
  s.belowTile = _root.earth[tx][ty + 1][0];
  return s;
};
flash.external.ExternalInterface.addCallback("referenceState", labProbe, labProbe.read);`;
await writeFile(`${output}/import/frame_1/DoAction.as`, probeSource);
await writeFile(
  `${output}/blank.swf`,
  swf(
    Buffer.concat([
      Buffer.from([8, 0]),
      u16(42 * 256),
      u16(1),
      u16((12 << 6) | 1),
      Buffer.from([0]),
      u16(1 << 6),
      u16(0),
    ]),
  ),
);
const compile = spawnSync(
  "java",
  [
    "-Djava.awt.headless=true",
    "-jar",
    ".cache/reference-tools/jpexs/ffdec.jar",
    "-importScript",
    `${output}/blank.swf`,
    `${output}/probe.swf`,
    `${output}/import`,
  ],
  { encoding: "utf8" },
);
assert.equal(compile.status, 0, compile.stderr || compile.stdout);
const probeTags = parseSwf(await readFile(`${output}/probe.swf`)).tags.filter(
  (t) => t.code === 12,
);
assert.ok(probeTags.some((t) => t.bytes.length > 100));
const parsed = parseSwf(original),
  tags = [];
let inserted = false;
for (const tag of parsed.tags) {
  if (tag.code === 1 && !inserted) {
    tags.push(...probeTags);
    inserted = true;
  }
  tags.push(tag);
}
assert.equal(tags.length, parsed.tags.length + probeTags.length);
const instrumented = swf(
  Buffer.concat([parsed.header, ...tags.map((t) => t.bytes)]),
  true,
);
await writeFile(`${output}/instrumented.swf`, instrumented);
assert.equal(
  hash(await readFile("reference/motherload_2017.swf")),
  canonicalHash,
);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = {
  canonicalHash,
  instrumentedHash: hash(instrumented),
  runs: [],
};
if (process.env.REFERENCE_SCENARIO) {
  try {
    const previous = JSON.parse(
      await readFile(`${output}/measurements.json`, "utf8"),
    );
    if (previous.instrumentedHash === results.instrumentedHash)
      results.runs = previous.runs.filter(
        (run) => run.name !== process.env.REFERENCE_SCENARIO,
      );
  } catch {
    // A selected first run has no earlier measurements to retain.
  }
}
try {
  const scenarios = [
    {
      name: "ground",
      phases: [
        ["right-pulse", ["ArrowRight"], 200],
        ["coast", [], 900],
      ],
    },
    {
      name: "flight",
      phases: [
        ["diagonal-ascent", ["ArrowUp", "ArrowRight"], 650],
        ["air-coast", [], 450],
      ],
    },
    {
      name: "mining",
      phases: [
        ["consecutive-down", ["ArrowDown"], 6000],
        ["settle", [], 1200],
        ["supported-left", ["ArrowLeft"], 2800],
        ["settle-left", [], 1200],
        ["loaded-ascent", ["ArrowUp", "ArrowRight"], 650],
        ["loaded-coast", [], 450],
      ],
    },
    {
      name: "committed-cut",
      phases: [
        ["begin-cut", ["ArrowDown"], 300],
        ["up-during-cut", ["ArrowUp"], 1600],
        ["coast-after-cut", [], 400],
      ],
    },
  ];
  for (const scenario of scenarios) {
    if (
      process.env.REFERENCE_SCENARIO &&
      process.env.REFERENCE_SCENARIO !== scenario.name
    )
      continue;
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1100 },
    });
    const page = await context.newPage();
    // Keep an unrelated Vite hot reload from replacing a timed reference session.
    await page.route("**/@vite/client", (route) => route.abort());
    const diagnostics = new Set();
    const run = { name: scenario.name, phases: [], errors: [] };
    page.on("pageerror", (e) => run.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.text().includes("ERROR"))
        diagnostics.add(m.text().slice(0, 300));
    });
    await page.goto(
      (process.env.PREVIEW_URL || "http://127.0.0.1:5173") + "/reference/",
    );
    await page.evaluate(async (data) => {
      const p = RufflePlayer.newest().createPlayer();
      document.querySelector("#player").replaceChildren(p);
      await p.ruffle().load({
        data: new Uint8Array(data),
        allowScriptAccess: true,
        autoplay: "on",
      });
      document.querySelector("#status").textContent =
        "Research telemetry: verified original tags plus an added read-only callback. This instrumented copy is separate from the canonical SWF.";
    }, Array.from(instrumented));
    await page.waitForFunction(
      () =>
        document.querySelector("ruffle-player").referenceState?.().rootFrame ===
        3,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1200);
    const rect = await page.locator("ruffle-player").boundingBox();
    const click = (x, y) =>
      page.mouse.click(rect.x + rect.width * x, rect.y + rect.height * y, {
        delay: 100,
      });
    await click(0.25, 0.7);
    await page.waitForTimeout(400);
    await click(0.89, 0.1);
    await page.waitForTimeout(400);
    await click(0.25, 0.575);
    await page.waitForTimeout(3000);
    await click(0.64, 0.263);
    await page.waitForTimeout(800);
    const readState = () =>
      page.evaluate(() =>
        document.querySelector("ruffle-player").referenceState(),
      );
    run.start = await readState();
    assert.equal(
      run.start.gameMode,
      0,
      `${scenario.name} did not enter gameplay`,
    );
    assert.equal(run.start.mode, "ground");
    await page.screenshot({ path: `${output}/${scenario.name}-start.png` });
    await page.evaluate(() => {
      window.referenceSamples = [];
      window.referenceKeys = [];
      window.referencePhase = "initial";
      for (const type of ["keydown", "keyup"]) {
        window.addEventListener(
          type,
          (event) =>
            window.referenceKeys.push({
              wall: performance.now(),
              phase: window.referencePhase,
              type,
              key: event.key,
            }),
          true,
        );
      }
      window.referenceInterval = setInterval(
        () =>
          window.referenceSamples.push({
            wall: performance.now(),
            phase: window.referencePhase,
            ...document.querySelector("ruffle-player").referenceState(),
          }),
        15,
      );
    });
    for (const [name, keys, duration] of scenario.phases) {
      const before = await readState();
      await page.evaluate((name) => {
        window.referencePhase = name;
      }, name);
      for (const key of keys) await page.keyboard.down(key);
      const began = await page.evaluate(() => performance.now());
      await page.waitForTimeout(duration);
      for (const key of keys) await page.keyboard.up(key);
      const ended = await page.evaluate(() => performance.now());
      const after = await readState();
      run.phases.push({
        name,
        keys,
        requestedMs: duration,
        began,
        ended,
        before,
        after,
      });
      // Keep visual checkpoints out of the next interval's measurements.
      await page.evaluate(() => {
        window.referencePhase = "screenshot-gap";
      });
      await page.screenshot({ path: `${output}/${scenario.name}-${name}.png` });
      console.log(
        `${scenario.name}/${name}:`,
        JSON.stringify({ elapsedMs: ended - began, before, after }),
      );
    }
    run.samples = await page.evaluate(() => {
      clearInterval(window.referenceInterval);
      return window.referenceSamples;
    });
    run.keyEvents = await page.evaluate(() => window.referenceKeys);
    run.diagnostics = [...diagnostics];
    results.runs.push(run);
    await writeFile(
      `${output}/measurements.json`,
      JSON.stringify(results, null, 2),
    );
    assert.deepEqual(run.errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(
  `Wrote ${output}/measurements.json and visual checkpoints. Inspect actual outcomes; attempted input alone is not evidence of a successful scenario.`,
);
