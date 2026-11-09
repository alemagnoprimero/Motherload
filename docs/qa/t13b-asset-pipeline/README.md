# T13b: asset pipeline

Evidence for audit item T13b (`docs/ART_QUALITY_AUDIT.md` §5.3 row T13b, acceptance "Byte-identical rebuilds"; `docs/art-direction/decisions.md` D1 and D5). The item lands in stages; this folder grows with each. This first stage, part (d) of the item, makes the asset build reproducible. It changes no source and no art.

## Reproducible rasterizer

### What changed

- **Rasterizer.** `scripts/rasterize-campaign-svgs.mjs` renders every SVG frame with resvg (`@resvg/resvg-js`, pinned exactly at 2.6.2) instead of a Chromium screenshot. Each drawing is fitted to round(width × scale) px wide, with system fonts off (the sources draw no text), and the build stops if it does not come out round(height × scale) px tall. `rasterizeCampaignSources(source, output, manifest, scale)` keeps its signature, so both world builds, the band build, `assets/campaign/kit/review.mjs` and the A4 and A12 review drivers call it unchanged. The raster-source branch (T13a, Pillow Lanczos for `"source": "raster"` frames) stays, now saving its intermediate with fast compression. No browser is needed to build assets any more.
- **Canonical PNGs.** New `scripts/png-canonical.mjs` decodes any 8-bit PNG and writes it again in one fixed form: RGBA8, filter type 0 on every row, pako 2.1.0 (pinned exactly) deflate at level 9, windowBits 15, memLevel 8, default strategy, then IHDR, IDAT chunks of 65536 bytes and IEND, with no ancillary chunks. Each build ends by passing every PNG it wrote through it (`canonicalizePngs`, in worker threads; a file already canonical is not rewritten). The bytes therefore depend only on the pixels and on pako. They no longer depend on the machine's zlib (Pillow's bundled zlib-ng, Node 22's or Node 24's zlib), on Pillow's `optimize` pass, or on CPU-dependent SIMD paths. Pillow intermediates are saved with `compress_level=1`. All 263 generated PNGs are canonical: IHDR/IDAT/IEND only, RGBA8, filter 0 on every row, zlib header `78 da`.
- **Every writer of `assets/campaign`.** These scripts write the folder. `scripts/build-campaign-assets.mjs` writes W01's pages, icons, backgrounds, `w01-assets.json` and `provenance.json`. `scripts/build-frontier-assets.mjs` writes W02's pages, icons, backgrounds and `w02-assets.json`. `scripts/pack-campaign-atlas.py` writes the full and runtime pages at @2x and @3x, the page indexes and the runtime skies. `scripts/build-band-assets.mjs` writes the band SVGs and `bands/frames.json` (through `createBandSources()`), the 48 band pages and their manifest. `assets/campaign/source/create-w01-sources.mjs` writes W01's SVGs, `frames.json` and provenance records, and `assets/campaign/w02/create-sources.mjs` writes W02's SVGs, `frames.json` and `asset-map.json`. `assets/campaign/source/create-test-raster.py` is left out: its output is a committed source PNG, not a build product.
- **Dead writes removed.** The inline packers in both world builds wrote `w01-atlas.png/json` (2048 × 1664) and `w02-atlas.png/json`, which `pack-campaign-atlas.py` then overwrote at @2x. Nothing read them, so they are gone, along with the band build's Pillow RGBA re-save (the canonical encoder writes RGBA).
- **Provenance.** `provenance.json` and `w02-assets.json` now say `"renderer": "resvg 2.6.2 (@resvg/resvg-js)"`, and their packing strings name the canonical encoder. Both strings come from the installed packages' versions (`RASTERIZER`, `CANONICAL_PNG`).
- **`npm run assets:rebuild`** regenerates both worlds' sources, then runs the W01, W02 and band builds.
- **CI.** A new step in `checks.yml` job `verify` runs after the pinned `pip install Pillow==12.0.0 numpy==2.5.3`. It runs `npm run assets:rebuild` with `PYTHON=python3`, then fails when `git status --porcelain --untracked-files=all -- assets/campaign` is not empty. On failure it prints the changes and a diff stat and copies the changed files into `artifacts/asset-rebuild/`. The next step uploads them as the `rebuilt-campaign-assets` artifact. No browser is involved.
- **Test.** `tests/png-canonical.test.mjs` checks several things. It pins the golden SHA-256 of a fixed 3 × 2 RGBA image and of 256 × 256 seeded noise (so a pako bump fails it), and asserts that the installed pako is 2.1.0. It checks the chunk layout, and that decode(encode(px)) equals px. It checks that pixels written another way (Sub and Paeth rows, Node's zlib at level 1, split IDATs, gAMA and tEXt chunks, grey + alpha) canonicalize to the same bytes. Finally, it checks that `canonicalizePngs` rewrites only non-canonical files.
- **Packages.** `package.json` adds the devDependencies `@resvg/resvg-js` 2.6.2 and `pako` 2.1.0, both exact. `package-lock.json` adds `@resvg/resvg-js` with its 12 platform packages (each optional, with `os` and `cpu`) and `pako`. On linux x64, `npm ci` installs both the `-gnu` and `-musl` binaries, because the lock records no `libc`. The loader picks `resvgjs.linux-x64-gnu.node` on glibc (checked in `/proc/self/maps` after a fresh `npm ci`), which is the binary the local builds used (same SHA-256). The Dockerfile's `node:24-alpine` `npm ci` installs the musl binary and never runs it: the image build validates committed assets only.

### What the switch changes in the committed files

Nothing in the sources changes: every SVG, `frames.json`, `asset-map.json` and provenance record regenerates byte for byte. These outputs change:

- Every generated PNG changes in pixels (resvg anti-aliases edges one level differently) and in encoding. The exception is the raster-source frame `test-raster`, whose pixels stay identical because Pillow resamples it.
- 47 of the 856 trim rectangles on the eight atlas pages move by one pixel on one or two edges, because the packer trims on alpha > 0 and so follows the faintest anti-aliased pixel. The frames are `dock-stage-0..3` (both worlds, @2x), `ore-o1..o4`, `ui-warning`, `ui-cargo` and `ui-shop` (W01 @2x), the eight `site-*` frames (W01 @3x) and `ice-vent` (W02 @3x). No rig, thrust or tool frame moves, and every source size and pivot is unchanged.
- Page sizes do not change (2048 × 960, 2048 × 704, 2048 × 2048 and 2048 × 1472 for W01; 1024 × 1088, 1024 × 576, 2048 × 1280 and 2048 × 704 for W02), so the decoded MiB and the resident texture bytes do not change either. The two @2x page indexes list frames in a new order, because the packer sorts by trimmed size. `provenance.json` and `w02-assets.json` change only in the two provenance strings.

This commit holds only that switch, so later commits show only real art changes.

### Proofs

| # | What ran | What it covered | Result |
|---|---|---|---|
| 1 | `npm run assets:rebuild` twice in a row in the working checkout (Node 22.23.4, Pillow 12.3.0, `.cache/` deleted before each run) | SHA-256 of every file under `assets/campaign`: 610 files (generated pages, icons, band pages and manifests, provenance, every source SVG and JSON, the kit) | identical |
| 2a | The CI condition: a private copy of the tree, a fresh `npm ci` under Node 24.22.2 (npm 10.9.9), then `assets:rebuild` with `PYTHON` set to a venv holding exactly Pillow 12.0.0 (CI's pin), run through the exact CI step script extracted from `checks.yml` | that the committed bytes come back with CI's Node major, a fresh install and CI's Pillow | step exit 0; `git status --porcelain --untracked-files=all -- assets/campaign` empty |
| 2b | The same copy, the exact CI step with `PYTHON=python3` (Pillow 12.3.0) | that a newer local Pillow gives the same bytes | exit 0, empty status |
| 2c | The same copy after committing an encoding-only drift (`w01-atlas.png` re-saved by Pillow with `optimize=True`) | the step's failure branch | exit 1; prints ` M assets/campaign/generated/w01-atlas.png` and the diff stat; copies the file to `artifacts/asset-rebuild/`; `::error::` names the fix |
| 3 | Two `assets:rebuild` runs at the same time in two private copies, plus two busy-loop processes (load average 2.5 on 4 vCPU) | the T13a race: renders under load | both copies' 610 SHA-256 identical to each other and to proof 1 |
| 4 | Proof 2 again from `git archive` of the commit's tree, with a fresh `npm ci`, Node 24.22.2 and Pillow 12.0.0, then the exact CI step | that CI's rebuild equals the committed tree | exit 0 in 13.0 s; empty status |

These proofs cover one machine type (linux x64, glibc, 4-vCPU Xeon) and both Node majors and Pillow pins. Two things are not proven: that the resvg native binary on macOS or arm64 gives the same pixels as linux x64, and that another libm cannot flip a Lanczos coefficient. CI (ubuntu x64, glibc) is the arbiter. An author on another platform takes CI's bytes from the `rebuilt-campaign-assets` artifact when the step fails.

### Chromium vs resvg, frame by frame

`compare-renders.py` compares the committed PNGs with the last Chromium-built tree (item 1's tip, `1a0b5db`). Every frame of the full @2x and @3x atlas pages of both worlds is rebuilt at its source size from its trim rectangle, and every other generated PNG is compared whole: 803 items. Differences are measured on premultiplied RGBA. max is the largest channel difference (0 to 255). mean is the mean absolute channel difference over all pixels and channels. IoU is computed between the two alpha masks, at alpha ≥ 128 and at alpha > 0. Full data: `compare-renders.csv` and `compare-renders.json`.

| Set | items | identical | size mismatches | max diff | mean of means | worst mean (item) | IoU≥128 min / mean | IoU>0 min |
|---|---|---|---|---|---|---|---|---|
| W01 @2x frames | 179 | 0 | 0 | 115 | 0.159 | 1.156 (`ui-cooldown`) | 0.8418 (`bedrock-edge-4`) / 0.9760 | 0.9398 |
| W01 @2x frames (raster source) | 1 | 1 | 0 | 0 | 0.000 | 0.000 (`test-raster`) | 1.0000 / 1.0000 | 1.0000 |
| W01 @3x frames | 179 | 0 | 0 | 110 | 0.111 | 0.467 (`ui-cooldown`) | 0.9482 (`rig-damage-1`) / 0.9924 | 0.9616 |
| W01 @3x frames (raster source) | 1 | 1 | 0 | 0 | 0.000 | 0.000 (`test-raster`) | 1.0000 / 1.0000 | 1.0000 |
| W02 @2x frames | 94 | 0 | 0 | 95 | 0.196 | 0.848 (`mission-cryovein`) | 0.8418 (`bedrock-edge-4`) / 0.9681 | 0.9643 |
| W02 @3x frames | 94 | 0 | 0 | 101 | 0.138 | 0.421 (`mission-cryovein`) | 0.9652 (`frozen-rock-edge-4`) / 0.9940 | 0.9738 |
| band pages @2x | 24 | 0 | 0 | 16 | 0.095 | 0.117 (`w02-d-rock-2x`) | 1.0000 / 1.0000 | 1.0000 |
| band pages @3x | 24 | 0 | 0 | 16 | 0.080 | 0.093 (`w01-a-rock-3x`) | 1.0000 / 1.0000 | 1.0000 |
| W01 icons | 114 | 0 | 0 | 74 | 0.344 | 1.274 (`ui-cooldown-48`) | 0.9406 (`ui-cooldown-24`) / 0.9923 | 0.9464 |
| backgrounds (sky, ridges, runtime skies) | 9 | 0 | 0 | 63 | 0.015 | 0.023 (`w01-ridge-near`) | 0.0795 (`w01-sky`) / 0.7119 | 0.9916 |
| W02 icons | 84 | 0 | 0 | 210 | 0.320 | 3.381 (`w02-s3-icon-64`) | 0.9483 (`w02-s3-icon-64`) / 0.9927 | 0.9054 |

Selected frames (max / mean / IoU≥128 / IoU>0):

| frame | @2x page | @3x page |
|---|---|---|
| `ore-o1` | 47 / 0.306 / 0.9947 / 0.9940 | 63 / 0.243 / 0.9968 / 0.9958 |
| `ore-o3` | 53 / 0.512 / 0.9962 / 0.9949 | 50 / 0.309 / 0.9979 / 0.9963 |
| `package-o2` | 48 / 0.339 / 0.9758 / 0.9929 | 68 / 0.270 / 0.9970 / 0.9931 |
| `deposit-socket` (translucent) | 9 / 0.119 / 1.0000 / 0.9941 | 13 / 0.107 / 1.0000 / 0.9978 |
| `tier-mark-hc-1` | 50 / 0.101 / 0.9612 / 0.9643 | 49 / 0.067 / 0.9865 / 0.9879 |
| `rig-body-0` | 38 / 0.114 / 0.9791 / 0.9973 | 45 / 0.112 / 0.9991 / 0.9985 |
| `rig-drill-down-3` | 28 / 0.051 / 0.9764 / 0.9785 | 38 / 0.032 / 0.9962 / 0.9964 |
| `rig-cabin` | 58 / 0.105 / 0.9876 / 0.9988 | 72 / 0.075 / 0.9978 / 0.9962 |
| `ui-cooldown` | 115 / 1.156 / 0.9748 / 0.9633 | 74 / 0.467 / 0.9846 / 0.9874 |
| `sky-body` (the only W01 gradient) | 56 / 0.096 / 0.9984 / 0.9979 | 78 / 0.084 / 0.9982 / 0.9989 |
| `dock-stage-0` (dashes) | 70 / 0.092 / 0.9831 / 0.9963 | 110 / 0.091 / 0.9971 / 0.9960 |
| `stone-edge-5` (thin strip) | 43 / 0.193 / 0.9031 / 0.9964 | 41 / 0.135 / 0.9685 / 0.9928 |

`compare-worst.png` shows each set's item with the largest mean difference, one row each: Chromium, resvg, and the largest channel difference × 4. The rows, top to bottom, are `ui-cooldown` @2x and @3x, `mission-cryovein` (W02) @2x and @3x, `w01-a-rock-3x`, `w02-d-rock-2x`, `ui-cooldown-48` (icon), `w01-ridge-near` and `w02-s3-icon-64`. Every difference is a one-pixel anti-aliasing band on edges, the same finding as the scratch study before this item (identical numbers for the frames both measured). The low values have plain causes:

- `w01-sky` IoU≥128 of 0.08: its faint stars stay below alpha 128 in one renderer and cross it in the other. IoU>0 is 0.99.
- `bedrock-edge-4`, `frozen-rock-edge-4` and `stone-edge-5`: thin strips, where one pixel of edge is a large share of the mask.
- The W02 icons are cropped to their alpha bounding box before resizing, so a one-pixel bounding-box change moves the whole 64 px thumbnail by a pixel (`w02-s3-icon-64`: its top edge moved from y 18 to 17).
- The band pages tile better: `check-render-assets` reports a maximum seam of 0, against 2 on the Chromium pages.

resvg anti-aliasing is coarser, with fewer distinct edge colours, so shading tiers must be counted from SVG fills or with anti-aliased pixels excluded (as `scripts/art_tiers.py` and item 1's checks already do), never from unique colours in a render.

### Asset checks, before and after

`npm run assets:check` passes on both trees with every gate at its threshold:

| measure (gate) | Chromium (`1a0b5db`) | resvg |
|---|---|---|
| W01 material ΔE / ΔL (≥ 12 / ≥ 8) | ≥ 15.5 / ≥ 14.6 | ≥ 15.4 / ≥ 14.6 |
| W02 material ΔE / ΔL (≥ 12 / ≥ 8) | ≥ 21.3 / ≥ 19.4 | ≥ 21.2 / ≥ 19.4 |
| band pages: maximum seam (≤ 6); material ΔL (≥ 8); band ΔE (≥ 10) | 2; ≥ 9.1; ≥ 12.4 | 0; ≥ 9.1; ≥ 12.4 |
| tier mark drawn span (≤ 0.18 of the frame, + 1 px) | ≤ 0.174 | ≤ 0.177 |
| identification edge ΔE / ΔL (≥ 30 / ≥ 15) | ≥ 45.2 / ≥ 45.1 | ≥ 45.2 / ≥ 45.1 |
| high-contrast mark over copper's body (≥ 20 L\*); light share (≥ 45 %) | ≥ 27.6; ≥ 52 % | ≥ 26.0; ≥ 56 % |
| deposit socket alpha (≤ 160) | ≤ 65 | ≤ 66 |
| W01 / W02 full @2x page PNG | 384 KiB / 218 KiB | 228 KiB / 122 KiB |

### Timings, old vs new

Same 4-vCPU machine, Node 22.23.4, Pillow 12.3.0, `.cache/` deleted first, nothing else running:

| step | Chromium 156 + Pillow `optimize` | resvg + canonical encoder |
|---|---|---|
| W01 sources and W02 sources | not part of the build | 0.3 s |
| W01 build (`build-campaign-assets.mjs`) | 23.9 s | 4.3 s |
| W02 build (`build-frontier-assets.mjs`) | 13.2 s | 3.7 s |
| band pages (`build-band-assets.mjs`) | 17.8 s | 7.3 s |
| total | 54.8 s | 15.6 s step by step; 13.3 to 13.5 s as one `npm run assets:rebuild` (three runs) |

### PNG bytes, before and after

| PNGs | files | Chromium + Pillow (KiB) | resvg + canonical (KiB) | change |
|---|---|---|---|---|
| band pages (loaded at run time) | 48 | 4558.0 | 2232.9 | −51.0 % |
| runtime atlas pages and runtime skies (loaded at run time) | 6 | 1093.7 | 635.3 | −41.9 % |
| backgrounds: skies and ridges (loaded at run time) | 7 | 102.9 | 49.9 | −51.5 % |
| full atlas pages (read by the checks) | 4 | 1558.0 | 917.5 | −41.1 % |
| icons (DOM) | 198 | 778.1 | 634.2 | −18.5 % |
| all generated PNGs | 263 | 8090.6 | 4469.8 | −44.8 % |

Part of the saving comes from resvg's coarser edges (fewer distinct colours compress better), part from filter 0 at level 9. In the scratch study, filter 0 alone took the same Chromium pixels from 7.87 to 6.90 MiB.

### Verification

| Check | Result |
|---|---|
| `npm run assets:check` | pass, numbers in "Asset checks, before and after" |
| `npm test -- --maxWorkers=2` | 305 passed, 5 skipped (item 1's 300 + 5 in `tests/png-canonical.test.mjs`) |
| `npm run format:check`, `npm run build` | pass |
| `npm run test:render` (private copy, Chrome 156, port 5211) | pass, 27 s: hidden geology identical to solid on canvas and WebGL in W01 and W02; textures 33.16 / 35.41 MiB (unchanged); WebGL draws 3 |
| `IMPROVEMENT_CHECKS=visual,fog,harness npm run test:improvements` | pass, 139 s: fog check (both worlds hide caves identically to solid rock), visual (12 captures keep HUD contrast ≥ 4.5:1), harness (8 §9 fixtures at backing 1, the T13a placeholder drawn) |
| `npm run test:hud:surface` | pass |
| `npm run test:render:memory` | pass, byte for byte what item 1 and main read: desktop boot 47,663,924, W01 58,280,756, W02 66,407,220; phone boot 20,176,176, W01 30,793,008, W02 33,152,304 |
| `npm run test:surface:render` | pass, 233 s |
| `npm run test:frontier` (not in CI) | fails at "Schema1 import preserves original packages" (`Slag iron` vs `Ironium`), the same failure on item 1's tip `1a0b5db` with the same command; it does not involve assets |
| `npm run test:campaign:browser` (not in CI) | fails at `scripts/campaign-smoke.mjs:1251` (the stale `/300/` expectation that PR #16 refreshes), as on main |
| Proof 4: `git archive HEAD`, fresh `npm ci`, Node 24.22.2, Pillow 12.0.0, the exact CI step | step exit 0 in 13.0 s; `git status --porcelain --untracked-files=all -- assets/campaign` empty. The tree was exported with `git archive` of the staged tree, which differs from the commit only in this cell |

### Reproduce

```bash
# rebuild (no browser), twice, and compare every file
PYTHON=python3 npm run assets:rebuild
(find assets/campaign -type f | LC_ALL=C sort | xargs sha256sum) > /tmp/a.txt
rm -rf .cache && PYTHON=python3 npm run assets:rebuild
(find assets/campaign -type f | LC_ALL=C sort | xargs sha256sum) | cmp - /tmp/a.txt
# the frame comparison with the last Chromium-built tree
python3 docs/qa/t13b-asset-pipeline/compare-renders.py 1a0b5db docs/qa/t13b-asset-pipeline
# diagnostic only: which modified PNGs changed pixels, not just bytes
python3 scripts/art-unchanged-pngs.py
```
