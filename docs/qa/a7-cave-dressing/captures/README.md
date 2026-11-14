# A7 before/after game fixtures

Same build before/after explicit A7 art-review poses; automatic placement belongs to T5.

Each screenshot passed two byte-identical captures one 50 ms scene step apart. All canonical frames keep the fixture's geometry, ore, rig and camera; paired before/after discovery is unchanged after normal settling. The 60/150/330 m frames are context checks: automatic placement arrives in T5.

Sheets show HUD-free frames beside the board at the same tile scale. Measurements use the existing `art-sheets.py` scoring windows, which differ from the matched-scale display crop.

| Fixture | Edge before → after (≥0.06) | L* before → after (board ±4) | Warm % before → after (cavern 2–5) | Rock sd before → after (≥15) | Changed HUD-free pixels |
|---|---|---|---|---|---|
| [c-site-W01-SITE-4-wreck@2](sheet-c-site-W01-SITE-4-wreck@2.png) | 0.081 → 0.084 | 22.7 → 22.7 (21.0) | 0.49 → 0.51 | 32.70 → 32.70 | 44298 |
| [p-portrait-cavern-site4@3](sheet-p-portrait-cavern-site4@3.png) | 0.055 → 0.057 | 21.4 → 21.6 (21.0) | 0.97 → 1.02 | 30.80 → 30.80 | 45913 |
| [a04-dive-60m@2](sheet-a04-dive-60m@2.png) | 0.067 → 0.067 | 25.5 → 25.5 (25.9) | 0.11 → 0.11 | 19.90 → 19.90 | 0 |
| [a05-dive-150m@2](sheet-a05-dive-150m@2.png) | 0.068 → 0.068 | 25.5 → 25.5 (25.9) | 0.05 → 0.05 | 45.50 → 45.50 | 0 |
| [b-330m-plate-band-C@2](sheet-b-330m-plate-band-C@2.png) | 0.078 → 0.078 | 26.2 → 26.2 (21.0) | 0.05 → 0.05 | 14.80 → 14.80 | 0 |
| [a04p-dive-60m-phone@3](sheet-a04p-dive-60m-phone@3.png) | 0.040 → 0.040 | 26.6 → 26.6 (30.1) | 0.38 → 0.38 | 19.00 → 19.00 | 0 |
| [a05p-dive-150m-phone@3](sheet-a05p-dive-150m-phone@3.png) | 0.042 → 0.042 | 26.2 → 26.2 (30.1) | 0.10 → 0.10 | 45.70 → 45.70 | 0 |
| [b-330mp-plate-band-C-phone@3](sheet-b-330mp-plate-band-C-phone@3.png) | 0.049 → 0.049 | 27.9 → 27.9 (21.0) | 0.10 → 0.10 | 14.30 → 14.30 | 0 |

## Staged-frame render measurements

All poses pass the renderer's full-frame known-cell gate, including the 2 device px filter gutter; crystal footprints also exclude every known ore deposit's 3×3 neighbourhood. This validates these explicit poses; the separate scramble suite checks hidden-information invariance.

Texture residency includes the field renderer's raw GL texture. Five parked frames are sampled after seven warm-up steps for canonical captures and five for fixed-camera details. Boot residency is measured separately by the verify harness.

| Capture | Max draws / limit | Max uploads while parked | Resident MiB / active limit | Requested / drawn |
|---|---|---|---|---|
| c-site-W01-SITE-4-wreck@2 | 9 / 12 | 0 | 9.44 / 64 | 7 / 7 |
| p-portrait-cavern-site4@3 | 9 / 10 | 0 | 5.67 / 40 | 7 / 7 |
| a04-dive-60m@2 | 5 / 12 | 0 | 12.99 / 64 | 0 / 0 |
| a05-dive-150m@2 | 4 / 12 | 0 | 16.24 / 64 | 0 / 0 |
| b-330m-plate-band-C@2 | 4 / 12 | 0 | 9.44 / 64 | 0 / 0 |
| a04p-dive-60m-phone@3 | 5 / 10 | 0 | 9.26 / 40 | 0 / 0 |
| a05p-dive-150m-phone@3 | 4 / 10 | 0 | 10.76 / 40 | 0 / 0 |
| b-330mp-plate-band-C-phone@3 | 4 / 10 | 0 | 5.67 / 40 | 0 / 0 |
| a7-group-0-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 8 / 8 |
| a7-group-1-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 8 / 8 |
| a7-group-2-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 8 / 8 |
| a7-crystal-0-hc-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 2 / 2 |
| a7-crystal-1-hc-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 2 / 2 |
| a7-crystal-2-hc-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 2 / 2 |
| a7-rust-desktop@2 | 9 / 12 | 0 | 9.44 / 64 | 10 / 10 |
| a7-group-0-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 8 / 8 |
| a7-group-1-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 8 / 8 |
| a7-group-2-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 8 / 8 |
| a7-crystal-0-hc-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 2 / 2 |
| a7-crystal-1-hc-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 2 / 2 |
| a7-crystal-2-hc-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 2 / 2 |
| a7-rust-phone@3 | 9 / 10 | 0 | 5.67 / 40 | 10 / 10 |

## Every generated frame in game

All 52 frames were captured in both forms.

The normal grouped views contain three stalactites, two rubble frames, one boulder and a floor/wall crystal pair each. Three separate crystal pairs use actual high-contrast mode; the rust view includes all four drips and six particle frames. The existing additive pass draws each crystal's emissive sibling, including the zero-energy black HC sibling.

Group and crystal details move only the rig to the existing floor at (14.65, 45.64); the phone detail camera uses `?tile=32` to include every staged prop. Their full source bounds must fit the viewport. Canonical fixtures retain their original camera, rig and native tile scale.

Explicit A7 wall poses use the logical face and can leave a gap to T2's displaced boundary; T5 owns actual face contact.

Actual base + emissive frame coverage: desktop 52/52, phone 52/52. Missing names, if any, are in `captures.json`.
