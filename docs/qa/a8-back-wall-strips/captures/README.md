# A8 before/after game fixtures

Same build before/after two explicit A8 back-wall review poses in original known SITE-4 air. Transit frames have no poses. T4 owns automatic clipping, parallax and paired upright repeat.

Each screenshot passed two byte-identical captures one 50 ms scene step apart. Every manifest explicitly reports the field renderer; the live field debug hook is also present. The capture driver does not edit geometry, discovery, ore, rig or camera. Paired settled discovery grids and camera values match; normal checkpoint restoration may discover cells. The 60/150/330 m frames are context checks: automatic clipped back-wall slots arrive in T4.

Sheets show HUD-free frames beside the board at the same tile scale. Measurements use the existing `art-sheets.py` scoring windows, which differ from the matched-scale display crop.

| Fixture | Edge before → after (≥0.06) | L* before → after (board ±4) | Warm % before → after (cavern 2–5) | Rock sd before → after (≥15) | Changed HUD-free pixels |
|---|---|---|---|---|---|
| [a04-dive-60m@2](sheet-a04-dive-60m@2.png) | 0.067 → 0.067 | 25.5 → 25.5 (25.9) | 0.11 → 0.11 | 19.90 → 19.90 | 0 |
| [a05-dive-150m@2](sheet-a05-dive-150m@2.png) | 0.068 → 0.068 | 25.5 → 25.5 (25.9) | 0.05 → 0.05 | 45.50 → 45.50 | 0 |
| [b-330m-plate-band-C@2](sheet-b-330m-plate-band-C@2.png) | 0.078 → 0.078 | 26.2 → 26.2 (21.0) | 0.05 → 0.05 | 14.80 → 14.80 | 0 |
| [c-site-W01-SITE-4-wreck@2](sheet-c-site-W01-SITE-4-wreck@2.png) | 0.081 → 0.081 | 22.7 → 22.4 (21.0) | 0.49 → 0.49 | 32.70 → 32.70 | 512568 |
| [a04p-dive-60m-phone@3](sheet-a04p-dive-60m-phone@3.png) | 0.040 → 0.040 | 26.6 → 26.6 (30.1) | 0.38 → 0.38 | 19.00 → 19.00 | 0 |
| [p-portrait-cavern-site4@3](sheet-p-portrait-cavern-site4@3.png) | 0.055 → 0.055 | 21.4 → 21.0 (21.0) | 0.97 → 0.97 | 30.80 → 30.80 | 440666 |
| [a05p-dive-150m-phone@3](sheet-a05p-dive-150m-phone@3.png) | 0.042 → 0.042 | 26.2 → 26.2 (30.1) | 0.10 → 0.10 | 45.70 → 45.70 | 0 |
| [b-330mp-plate-band-C-phone@3](sheet-b-330mp-plate-band-C-phone@3.png) | 0.049 → 0.049 | 27.9 → 27.9 (21.0) | 0.10 → 0.10 | 14.30 → 14.30 | 0 |

## Staged-frame render measurements

All poses pass the renderer's full-frame known-cell gate, including the 2 device px filter gutter; every covered cell in the original fixture is also air. This validates these explicit poses; the separate scramble suite checks hidden-information invariance.

Texture residency includes the field renderer's raw GL texture. The five parked frames are sampled after seven warm-up steps. Boot residency is measured separately by the verify harness.

| Capture | Max draws / limit | Max uploads while parked | Resident MiB / active limit | Requested / drawn |
|---|---|---|---|---|
| a04-dive-60m@2 | 5 / 12 | 0 | 12.99 / 64 | 0 / 0 |
| a05-dive-150m@2 | 4 / 12 | 0 | 18.68 / 64 | 0 / 0 |
| b-330m-plate-band-C@2 | 4 / 12 | 0 | 11.88 / 64 | 0 / 0 |
| c-site-W01-SITE-4-wreck@2 | 9 / 12 | 0 | 11.88 / 64 | 2 / 2 |
| a04p-dive-60m-phone@3 | 5 / 10 | 0 | 9.26 / 40 | 0 / 0 |
| p-portrait-cavern-site4@3 | 9 / 10 | 0 | 7.62 / 40 | 2 / 2 |
| a05p-dive-150m-phone@3 | 4 / 10 | 0 | 12.71 / 40 | 0 / 0 |
| b-330mp-plate-band-C-phone@3 | 4 / 10 | 0 | 7.62 / 40 | 0 / 0 |

## Both generated strips in game

The SITE-4 after frame draws the default far and near strips at their full source size (10⅔ by 4 tiles), centred at world (13.5, 43.5). Their bounds plus the filter gutter cover only the original known air at columns 8–18, rows 41–45. The poses do not edit world data. The phone camera shows the central part of these strips at its normal native scale; the source review sheet shows each entire strip. The 60/150/330 m poses stay empty.

These actual images review source art in game. Automatic clipping, parallax, reveal and paired upright world repeats belong to T4 and are not claimed by this hook. The single-band preview has visible straight horizontal outer edges and desktop end collars; these are not a measurement of T4 runtime joins.

Actual frame coverage: desktop 2/2, phone 2/2. Missing names, if any, are in `captures.json`.
