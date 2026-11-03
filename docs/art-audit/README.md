# Art quality audit: supporting material

This folder holds the evidence behind the [art quality audit](../ART_QUALITY_AUDIT.md): five dimension audits, a technique prototype that renders the game's real W01 world in the concept board's style, a review of the audit's draft, the figures the audit embeds, and the data behind its colour and memory figures. Everything was produced against commit `644e222` on 2026-11-03 and compared with the concept board [`d0-target-board.png`](../art-direction/d0-target-board.png).

Where a report and the audit disagree, the audit wins: its figures were re-checked after the reports were written. For example, `01-terrain.md` gives the rig as 1.28 tiles wide, and the audit's value is 0.96 tiles (Appendix A, issue 19). The board's cavern panels are 381 px tall, not the 358 px that `07-critique.md` gives for all rows (audit §4.3). `07-critique.md` reviews the draft, so its section numbers refer to the draft (see below).

Nothing here is part of the game. The build, `npm test`, `npm run format:check`, `tsc`, the Docker image and the Pages deploy all ignore this folder.

## Contents

| Path | Contents |
| --- | --- |
| [`01-terrain.md`](01-terrain.md) | Rock, unexplored rock, tunnels, caves and back walls: value order, boundary shape, material pages |
| [`02-lighting.md`](02-lighting.md) | Palette, value structure, headlamp, darkness and fog, sky, colour grading |
| [`03-assets.md`](03-assets.md) | Every object on the board against the shipped atlases, SVG sources, generators and placement code |
| [`04-overlays.md`](04-overlays.md) | World text, chips, badges and markers, and the motion and effects layer |
| [`05-tech.md`](05-tech.md) | Rendering architecture, effective resolution, uploads, texture memory and frame time |
| [`06-prototype.md`](06-prototype.md) | The technique prototype: what was built, parameters, results, frame time, engineering effort |
| [`07-critique.md`](07-critique.md) | Review of the audit's draft: 31 issues, each resolved in the audit's Appendix A |
| `images/` | The 16 figures the audit embeds: comparison sheets, annotated crops, contact sheets of the captures |
| `prototype/index.html`, `prototype/proto.js` | The prototype renderer (Canvas 2D). It reads game data and imports no game code |
| `prototype/render.mjs` | Serves the prototype on a local port and renders every scene with headless Chromium into `prototype/out/` |
| `prototype/metrics.py`, `prototype/compare.py` | Measurements against the board and the captures, and the side-by-side sheet (`images/compare.jpg` is a reduced copy) |
| `prototype/assets/` | `fresh-w01.json` (the W01 world the captures used) and the placeholder props `proto-wreck.svg` and `proto-beacon.svg` (not game art) |
| `prototype/proto-*.jpg` | The three renders the audit embeds: the surface, and the shaft and cavern at the board's tile scale |
| `prototype/out/` | Recorded results: `metrics.txt`, `metrics.json`, `hidden-info-test.txt` |
| `prototype/.gitignore` | Keeps the regenerated renders and reports in `out/` out of git |
| `data/palette.json` | Colours sampled from the board, with sampling rectangles (audit §6.1) |
| `data/measure.json` | The critique's measurements: panel sizes, unexplored-rock luma, frame sizes, cavern luma |
| `data/budget.py`, `data/budget.txt` | The texture-memory projection behind the audit's §5.6 size note and §7 |

## Section numbers in the critique

`07-critique.md` was written against the draft of the audit, which is not committed.

| Draft | Audit |
| --- | --- |
| §1–§3 | §1–§3 |
| — | §4, where the board and the game disagree (new) |
| §4.1–§4.7, the plan | §5.1–§5.7 |
| §5.1–§5.4, art pipeline | §6.1–§6.4 |
| §6, budgets | §7 |
| §7, owner decisions | §8 |
| §8, acceptance protocol | §9 |

## Running the prototype

From the repository root, after `npm ci`:

```bash
node docs/art-audit/prototype/render.mjs            # every scene, debug layer and the scramble test
node docs/art-audit/prototype/render.mjs perf=40    # the same, plus the 40-frame timing probe
node docs/art-audit/prototype/render.mjs jobs=proto-shaft-1440x900@2
python3 docs/art-audit/data/budget.py
```

- `render.mjs` imports `playwright-core` from the repository's `node_modules` and launches Chromium from `CHROMIUM_PATH` (default `/opt/pw-browsers/chromium`) with SwiftShader. It serves the game's atlas from `assets/campaign/generated/`, so nothing needs copying. A full run takes several minutes and writes about 95 MB of PNG files and `render-report.json` into `prototype/out/`; `prototype/.gitignore` keeps them out of git.
- To look at one scene in a browser, copy `assets/campaign/generated/w01-atlas-3x-0.json` and `.png` into `docs/art-audit/prototype/assets/` (git ignores the copies), serve `docs/art-audit/prototype/` with any static file server and open `index.html?scene=cavern&vw=1440&vh=900&dpr=2`. `06-prototype.md` §1 lists the URL parameters.
- `metrics.py` and `compare.py` read the renders in `prototype/out/` and the session captures, which are not committed. Set `CAPTURES` to a folder that holds the `shots/` and `shots2/` capture folders. `compare.py` also expects the portrait cavern capture at `prototype/game/p-portrait-cavern-site4@3.png`. Both read the board from `docs/art-direction/` by a relative path. They need Python 3 with Pillow and NumPy.

## Not included

- **The captures** the reports name, such as `a04-dive-60m@2.png` and `p-portrait-03-dive-70m@3.png`: 1440×900 @2x desktop and 393×851 @3x phone frames of fresh W01 and W02 worlds at `644e222`, about 31 MB. `images/contact-desktop.jpg`, `images/contact-portrait.jpg` and `images/w02-sheet.jpg` show them.
- **The capture script** that drove those fixtures (`capture-v2.mjs`, cited in `03-assets.md`, `04-overlays.md` and `06-prototype.md`), and each audit's probes.
- **Working files** that the reports cite by name under `work/`, `synth/`, `critique/` and `prototype/out/`: full-resolution comparison sheets, region masks, probe output, and the metric scripts `stats.py`, `boundary.py`, `gridlock.py`, `edge-share.py`, `palette.py` and `measure.py`. `prototype/metrics.py` carries the same frame, boundary and gradient definitions as the first three. A file name in a report that is not in the table above refers to one of these. The committed copies are `images/compare.jpg` (`out/compare.png`), `images/cmp-shaft-lighting.jpg` (`cmp-shaft.png`), `images/cmp-boundary-orientation.jpg`, `images/value-ladder.png`, `images/annot-a04-60m.jpg`, `images/tech-exploded-60m.jpg`, `images/concept-asset-inventory.jpg`, `images/game-spawn-lamp-dots.png`, the critique's crops in `images/` (`a04-rig-crop.png`, `concept-surface-props.jpg`, `portrait-aspect-cavern.jpg`, `b330-plate-crop.jpg`, `w02-sheet.jpg`), `data/measure.json`, and the three `prototype/proto-*.jpg` renders.
- **The draft** of the audit that `07-critique.md` reviews.
