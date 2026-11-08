# The Deep Frontier — visual targets

`d0-target-board.png` is a generated concept board based on the deployed W01 surface and shaft captures. It was produced on 2026-11-02 during implementation of the improvement plan. It is a visual reference, not a capture of completed gameplay and not evidence of owner sign-off.

The six panels pair desktop and portrait compositions for surface spawn, a 60 m shaft and a 300 m cavern. The exact palette and measurable implementation requirements remain those in [graphics audit §7.2–7.4](../improvement-plan/analysis/04-graphics.md) and [the improvement plan](../IMPROVEMENT_PLAN.md).

Use continuous strata, clear material boundaries, dim opaque unexplored rock, lit tunnel walls, restrained amber/cyan accents and a warm rig headlamp. Keep the flat side view, a single sky body and a compact transparent HUD. The cave shown is a composition target: it must never reveal undiscovered terrain or minerals. The generated labels and resource values are illustrative, not balance data.

The plan's quantitative gates are evaluated on actual game captures. Concept art does not establish contrast, phone framing, performance, completed assets or player approval.

The [art quality audit](../ART_QUALITY_AUDIT.md) measures the current game against this board and sets the plan, targets and gates for reaching it.

## Board panel crops

The board's six panels are cropped to one PNG each, pixel-identical to the board inside their windows, so a game capture can be scored against a single panel. `d0-target-panels.json` records where each crop came from and which regions to score.

| Crop                         | Panel                  | Crop size (px) | Game window ([audit §4.3](../ART_QUALITY_AUDIT.md#43-panel-shapes)) |
| ---------------------------- | ---------------------- | -------------- | ------------------------------------------------------------------- |
| `d0-target-surface-wide.png` | Surface, desktop       | 693×358        | 1440×743                                                            |
| `d0-target-surface-tall.png` | Surface, portrait      | 246×358        | 393×572                                                             |
| `d0-target-shaft-wide.png`   | 60 m shaft, desktop    | 693×358        | 1440×743                                                            |
| `d0-target-shaft-tall.png`   | 60 m shaft, portrait   | 246×358        | 393×572                                                             |
| `d0-target-cavern-wide.png`  | 300 m cavern, desktop  | 693×381        | 1440×792                                                            |
| `d0-target-cavern-tall.png`  | 300 m cavern, portrait | 246×381        | 393×608                                                             |

For each panel the JSON gives the `file` and its `sha256`, the `window` on the board (`[x0, y0, x1, y1)`, exclusive ends) and the matching `game_window`. It also records the board's `source_sha256` and how the crops were made (`made`). `interior`, `hud_mask`, `rig_box` and `rig_anchor` are in pixels of the crop, not of the board. These fields matter when scoring:

- **`interior`** is the area inside the border strokes. Take statistics inside it, minus `hud_mask`. In the shaft crops it also leaves out the 1 to 2 px of page background at the top and bottom: the shaft panel is 353.5 px tall between its stroke centrelines, 4.5 px less than the 358 px window, so the window takes in a little of the page behind it. The rounded corners still hold a few border pixels.
- **`hud_mask`** lists generous rectangles over the board's HUD. Exclude them from every statistic. The desktop boxes follow `CONCEPT_HUD` in [`metrics.py`](../art-audit/prototype/metrics.py).
- **`rig_box`, `rig_anchor` and `rig_anchor_fraction`** give the rig's bounding box (hull, tracks and drill bit, not the lamp light), its centre, and that centre as a fraction of the crop. Crop each game capture so the rig sits at the same fraction of its `game_window`. The anchor was read at 6 to 7× zoom and is good to about 1 px.

Other files in this directory:

- [`decisions.md`](decisions.md) is the art director's log of art-programme decisions: the option chosen, the date and the rationale for each, and the decisions still pending.
- [`asset-tracker.md`](asset-tracker.md) tracks each asset in the audit's §5.6 table (how it is made under D5, its priority, status, owner and what it waits on), plus the effort per art item and the size note redone under D5.
- [`asset-budget.py`](asset-budget.py) recomputes the resident texture budget with no painted raster, as D5 decides (the audit's §5.6 size note and §7 projections); run it with `python3 docs/art-direction/asset-budget.py`.
- [`scripts/swatch-cards.py`](../../scripts/swatch-cards.py) makes the W01 swatch cards of art item A1 in [`swatches/`](swatches/) (`w01-band-a.png` to `w01-band-d.png` and `w01-swatches.json`) from `docs/art-audit/data/palette.json`; run it from the repository root, with `--check` to confirm the committed files are byte-identical.
