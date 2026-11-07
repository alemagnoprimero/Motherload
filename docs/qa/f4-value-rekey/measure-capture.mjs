// F4 measurement captures. Reuses the capture definitions in
// scripts/art-captures.mjs (CAPTURES, FORMS) and its flow: restore() the
// fixture, settledView(), screenshot. It adds W02 shafts in all four bands and
// frames with hard rock beside the shaft in every band of both worlds (W02 B and
// D shafts already have it). After each screenshot it records the
// camera and DOM overlay rectangles and exports the live campaign state, so
// the analysis can classify every cell (unknown, known solid, known air, sky).
// Usage: node docs/qa/f4-value-rekey/measure-capture.mjs <base-url> <out-dir> [highContrast=0|1] [names]
// Needs scripts/art-captures.mjs and improvement-smoke.mjs's restore() and
// settledView() exports, and fixture()'s column (PR #5).
import { mkdir, writeFile } from "node:fs/promises";
const W2 = new URL("../../../scripts", import.meta.url).href;
const { launchBrowser } = await import(`${W2}/browser-launch.mjs`);
const { CAPTURES, FORMS } = await import(`${W2}/art-captures.mjs`);
const { restore, settledView, fixture } = await import(
  `${W2}/improvement-smoke.mjs`
);
const { click, idle, freeze, exportCheckpoint } = await import(
  `${W2}/campaign-smoke.mjs`
);

const [base, out, hc = "0", names = ""] = process.argv.slice(2);
const highContrast = hc === "1";
const only = names.split(",").filter(Boolean);
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const summary = {};
try {
  for (const [form, settings] of Object.entries(FORMS)) {
    // W02 shafts as the visual check frames them (rig on its floor at row 7).
    const extra = [
      {
        name: "w02-shaft-70m@2",
        form: "desktop",
        checkpoint: () => fixture("W02", 7),
      },
      {
        name: "w02-shaft-70m@3",
        form: "phone",
        checkpoint: () => fixture("W02", 7),
      },
      {
        name: "w01-hard-rock-C-380m@2",
        form: "desktop",
        checkpoint: () => fixture("W01", 38, 9.5),
      },
      {
        name: "w01-hard-rock-D-530m@2",
        form: "desktop",
        checkpoint: () => fixture("W01", 53, 2.5),
      },
      {
        name: "w02-band-B-300m@2",
        form: "desktop",
        checkpoint: () => fixture("W02", 30),
      },
      {
        name: "w02-band-C-600m@2",
        form: "desktop",
        checkpoint: () => fixture("W02", 60),
      },
      {
        name: "w02-band-D-850m@2",
        form: "desktop",
        checkpoint: () => fixture("W02", 85),
      },
      {
        name: "w01-hard-rock-A-76m@2",
        form: "desktop",
        checkpoint: () => fixture("W01", 8, 6.5),
      },
      {
        name: "w01-hard-rock-B-176m@2",
        form: "desktop",
        checkpoint: () => fixture("W01", 18, 3.5),
      },
      {
        name: "w01-hard-rock-B-266m@2",
        form: "desktop",
        checkpoint: () => fixture("W01", 27, 1.5),
      },
      {
        name: "w02-hard-rock-A-106m@2",
        form: "desktop",
        checkpoint: () => fixture("W02", 11, 36.5),
      },
      {
        name: "w02-hard-rock-C-526m@2",
        form: "desktop",
        checkpoint: () => fixture("W02", 53, 20.5),
      },
    ];
    const captures = [...CAPTURES, ...extra].filter(
      (c) =>
        c.form === form &&
        (!only.length || only.some((n) => c.name.startsWith(n))),
    );
    if (!captures.length) continue;
    const context = await browser.newContext(settings);
    await context.addInitScript(
      (prefs) =>
        localStorage.setItem(
          "motherload.campaign.preferences.v1",
          JSON.stringify(prefs),
        ),
      { coachSkipped: true, sound: false, renderScale: 2, highContrast },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(
      () =>
        document.querySelector("#campaign-game")?.dataset.campaignArt ===
        "ready",
    );
    if (await page.locator("#campaign-start").isVisible())
      await click(page, "#campaign-start");
    await idle(page);
    await freeze(page);
    for (const capture of captures) {
      const checkpoint = capture.checkpoint();
      await restore(page, checkpoint);
      await settledView(page, checkpoint);
      const file = `${out}/${capture.name}.png`;
      await page.screenshot({ path: file });
      const view = await page.evaluate(() => {
        const el = document.querySelector("#campaign-game");
        const d = el.dataset;
        // Rectangles of everything drawn over the canvas (HUD, labels, chips).
        const overlays = [];
        const clear = (c) =>
          !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
        for (const node of document.body.querySelectorAll("*")) {
          if (
            node.closest("#campaign-game canvas") ||
            node.tagName === "CANVAS"
          )
            continue;
          const r = node.getBoundingClientRect();
          if (
            r.width <= 0 ||
            r.height <= 0 ||
            r.width * r.height > innerWidth * innerHeight * 0.5
          )
            continue;
          const s = getComputedStyle(node);
          if (
            s.visibility === "hidden" ||
            s.display === "none" ||
            Number(s.opacity) === 0
          )
            continue;
          const border = ["Top", "Right", "Bottom", "Left"].some(
            (side) =>
              parseFloat(s[`border${side}Width`]) > 0 &&
              !clear(s[`border${side}Color`]),
          );
          const outline =
            s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
          const painted =
            !clear(s.backgroundColor) ||
            s.backgroundImage !== "none" ||
            border ||
            outline ||
            s.boxShadow !== "none" ||
            [...node.childNodes].some(
              (c) => c.nodeType === 3 && c.textContent.trim(),
            ) ||
            node.tagName === "IMG" ||
            node.tagName === "svg";
          if (!painted) continue;
          // Outlines (and their offset) and shadows paint outside the box.
          const grow =
            (outline
              ? parseFloat(s.outlineWidth) +
                Math.max(0, parseFloat(s.outlineOffset) || 0)
              : 0) + (s.boxShadow !== "none" ? 12 : 0);
          overlays.push([
            r.left - grow,
            r.top - grow,
            r.right + grow,
            r.bottom + grow,
          ]);
        }
        return {
          world: d.campaignWorld,
          tile: Number(d.viewTile),
          scrollX: Number(d.viewCameraX),
          scrollY: Number(d.viewCameraY),
          rigX: Number(d.rigWorldX),
          rigY: Number(d.rigWorldY),
          rigScreenX: Number(d.rigScreenX),
          rigScreenY: Number(d.rigScreenY),
          viewWidth: Number(d.viewWidth),
          viewHeight: Number(d.viewHeight),
          dpr: Number(d.viewDpr),
          renderScale: Number(d.renderScale),
          highContrast: d.highContrast,
          overlays,
        };
      });
      const state = (await exportCheckpoint(page, true)).state;
      const mine = state.worlds[state.currentWorld];
      await writeFile(
        `${out}/${capture.name}.json`,
        JSON.stringify({
          name: capture.name,
          form,
          deviceScaleFactor: settings.deviceScaleFactor,
          viewport: settings.viewport,
          view,
          world: {
            id: mine.id,
            width: mine.width,
            rows: mine.rows,
            tiles: mine.tiles,
            discovered: mine.discovered,
            packages: mine.packages.map((p) => ({
              x: p.x,
              y: p.y,
              status: p.status,
            })),
          },
        }),
      );
      summary[capture.name] = {
        backing: view.dpr,
        tile: view.tile,
        rig: [view.rigX, view.rigY],
        highContrast: view.highContrast,
      };
      console.log(capture.name, JSON.stringify(summary[capture.name]));
    }

    if (errors.length) throw new Error(errors.join("; "));
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
