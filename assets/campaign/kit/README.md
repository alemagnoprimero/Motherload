# Art kit

Shared helpers for the art programme's generators (built in art item A4). Every art session that draws with code imports these instead of writing its own. Authoring only: the game loads the rasterized PNGs, never these modules.

| Module | Use it for |
|---|---|
| `random.mjs` | `random(seed)` and `fork(name)`: seeded streams that give the same numbers on every machine |
| `palette.mjs` | `band(id)` (the A1 swatch cards), `board(key)` (the board samples for sky, props and emitters), Lab and LCh moves (`withL`, `shiftL`, `mixLab`, `tiers`), `bevelColours` |
| `svg.mjs` | `num`, `polygon`, `layer`, gradients, `svgDocument`, the outline rule (`outlineWidth`, `outlineStroke`), `periodic` for tiling pages, `bevelEdges` |
| `emissive.mjs` | `emissivePair`: the base frame and its `-emissive` sibling from one description |
| `records.mjs` | `upsertFrames` into a `frames.json`; `writeProvenance` for `assets/campaign/source/provenance/<asset>.json` |
| `review.mjs` | Panels at the board's tile scale and their rasterizing (resvg, as the game's assets), for `scripts/art-review.py` |

A session's round, in order:

1. Draw with the kit; keep numbers through `num` so sources rebuild byte-identically.
2. Write a small driver like `scripts/art-review-a4.mjs` that composes candidate panels at the board's tile scale, then run `python3 scripts/art-review.py <out>/review.json <out>/sheet.png` for the sheet, the measures and the IoU duplicate check (`scripts/art-review-a12.mjs` and `.py` are the prop version: frames in band blocks, cross-variant IoU). `scripts/art_tiers.py` counts shading tiers per material zone, from `data-zone` groups in the SVG or from zone masks on a render.
3. After the director's pick, rebuild everything from source with `PYTHON=python3 npm run assets:rebuild` (both worlds' sources and assets, then the band pages). Builds are byte-identical on every machine (audit T13b): resvg renders the SVGs without a browser and `scripts/png-canonical.mjs` writes every PNG the same way, so only images whose pixels changed show up as modified, and CI's `verify` job rebuilds and fails on any difference. `python3 scripts/art-unchanged-pngs.py` stays as a diagnostic (it tells a pixel change from an encoding change); a rebuild no longer needs its `--restore`.
4. Capture the fixture with `scripts/art-captures.mjs`; add the capture folder to `review.json` under `frames` to measure it beside the board.
5. Write the provenance record with `records.mjs` and update the asset tracker's rows.

Palette rule: the swatch cards and board samples are on-screen targets within 3 L\*, not shader inputs (style guide §1).
