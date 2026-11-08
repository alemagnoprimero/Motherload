# Art kit

Shared helpers for the art programme's generators (built in art item A4). Every art session that draws with code imports these instead of writing its own. Authoring only: the game loads the rasterized PNGs, never these modules.

| Module | Use it for |
|---|---|
| `random.mjs` | `random(seed)` and `fork(name)`: seeded streams that give the same numbers on every machine |
| `palette.mjs` | `band(id)` (the A1 swatch cards), `board(key)` (the board samples for sky, props and emitters), Lab and LCh moves (`withL`, `shiftL`, `mixLab`, `tiers`), `bevelColours` |
| `svg.mjs` | `num`, `polygon`, `layer`, gradients, `svgDocument`, the outline rule (`outlineWidth`, `outlineStroke`), `periodic` for tiling pages, `bevelEdges` |
| `emissive.mjs` | `emissivePair`: the base frame and its `-emissive` sibling from one description |
| `records.mjs` | `upsertFrames` into a `frames.json`; `writeProvenance` for `assets/campaign/source/provenance/<asset>.json` |
| `review.mjs` | Panels at the board's tile scale and their rasterizing, for `scripts/art-review.py` |

A session's round, in order:

1. Draw with the kit; keep numbers through `num` so sources rebuild byte-identically.
2. Write a small driver like `scripts/art-review-a4.mjs` that composes candidate panels at the board's tile scale, then run `python3 scripts/art-review.py <out>/review.json <out>/sheet.png` for the sheet, the measures and the IoU duplicate check.
3. After the director's pick, regenerate the sources, `npm run campaign:assets`, then `python3 scripts/art-unchanged-pngs.py --restore`, so only images whose pixels changed stay modified.
4. Capture the fixture with `scripts/art-captures.mjs`; add the capture folder to `review.json` under `frames` to measure it beside the board.
5. Write the provenance record with `records.mjs` and update the asset tracker's rows.

Palette rule: the swatch cards and board samples are on-screen targets within 3 L\*, not shader inputs (style guide §1).
