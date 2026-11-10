# §9.2 table

| Check | Target | surface (desktop) | 60 m (desktop) | 60 m (phone) | surface (phone) |
|---|---|---|---|---|---|
| Unknown rock luma (sd) | 45–65, sd ≥7 (G1) | 62.6 (2.7) ✗ | 61.7 (3.4) ✗ | 62.9 (3.8) ✗ | 63.7 (2.9) ✗ |
| Known lit minus unknown: near the lamp (cells) / all known solid | ≥+15 near the lamp; ≥+5 everywhere (G1) | +66.2 (3) / +58.3 ✓ | +60.3 (4) / +61.9 ✓ | +59.1 (4) / +60.7 ✓ | +65.0 (3) / +57.0 ✓ |
| Unknown rock minus cave air | ≥+10 (G1) | — | +23.1 ✓ | +24.4 ✓ | — |
| Lit rock minus cave air (all known solid) | ≥+18 (G1) | — | +85.0 ✓ | +85.1 ✓ | — |
| Rock sd within 3 tiles of a light | ≥15 (G1; needs art) | 3.5 ✗ | 9.4 ✗ | 9.5 ✗ | 3.5 ✗ |
| Frame L\* mean (concept) | within ±4 of the concept; shaft and cavern (G1) | 25.3 (26.3) | 26.8 (25.9) ✓ | 27.6 (30.1) ✓ | 27.5 (27.1) |
| Frame luma mean (sd) | — | 59.5 (18.8) | 63.4 (17.7) | 65.4 (26.5) | 64.6 (21.5) |
| Share within ±3 L\* of the mode (concept) | ≤0.45; shaft (G1) | 0.477 (0.358) | 0.792 (0.359) ✗ | 0.487 (0.222) ✗ | 0.490 (0.322) |
| p2–p98 / p98 L\* (concept) | ≥40 / ≥54; shaft (G1; needs art) | 36.7 / 52.1 (51.7 / 65.4) | 37.4 / 52.7 (47.0 / 58.1) ✗ | 42.8 / 57.3 (69.8 / 79.5) ✓ | 36.2 / 54.9 (44.5 / 58.6) |
| Edge density (concept) | ≥0.06; shaft and cavern (G1) | 0.025 (0.086) | 0.020 (0.074) ✗ | 0.021 (0.153) ✗ | 0.014 (0.084) |
| Warm-accent share, % (concept) | 1.5–4 % surface; 2–5 % cavern (G1) | 0.28 (2.60) ✗ | 0.09 (0.66) | 0.35 (2.16) | 0.34 (1.38) ✗ |
| Natural-cave boundary, axis-aligned share | ≤30 % (G1), cavern; hard rock excluded | — | — | — | — |
| Wall profile (rock → lip → undercut → air) | lip ≥ rock +55; undercut ≤ air −8 (G1) | — | 109→139→36→37 ✗ | 109→153→36→37 ✗ | — |
| Tile-normalised mean gradient | ≥2.5 (G1) | 1.16 ✗ | 1.01 ✗ | — | — |
| Playfield within 10 luma of one value | ≤25 % (G2) | 81.8 % ✗ | 87.4 % ✗ | — | — |
| Headlamp core L\* / b\* (0.35 tile) | ≥70 / +15 to +30 (G1); shaft and cavern | — | 88.5 / +17.6 ✓ | 89.2 / +17.6 ✓ | — |
| Overlay edge share | ≤20 % (G1) | 25 % ✗ | 42 % ✗ | 48 % ✗ | 53 % ✗ |
| Text items in the playfield, HUD left out | ≤1 with Scan off (G1) | 7 ✗ | 5 ✗ | 5 ✗ | 5 ✗ |
| Framing, tiles across | per D1, still pending (G1) | 25.0 | 22.0 | 8.9 | 10.1 |

Frames: `a02-spawn-1440x900@2` (surface-wide, backing 2, rig at 0.74, 0.69 of the window against 0.532, 0.689), `a04-dive-60m@2` (shaft-wide, backing 2, rig at 0.50, 0.60 of the window against 0.536, 0.76), `a04p-dive-60m-phone@3` (shaft-tall, backing 2, rig at 0.50, 0.74 of the window against 0.575, 0.758), `p-portrait-02-spawn@3` (surface-tall, backing 2, rig at 0.50, 0.69 of the window against 0.502, 0.69).

Values in brackets are the concept panel's, scored at its interior minus the HUD and at least 5 px inside the border. Game values are scored on the HUD-free frame in the panel's window (1440×743, 1440×792 for the cavern, 393×572 and 393×608 on the phone), cropped around the rig at the panel's anchor and clamped to the frame. ✓ and ✗ compare with the target only on the scene kinds §9.2 sets it for (shaft, cavern or surface, by the frame's panel; the 330 m frame uses the cavern panel). Edge density is measured as metrics.py measured it, 690 px wide, on every game frame (its phone renders included) and on the 693 px wide panels; the tall panels, which it never scored, keep the wide panels' px per tile. Known lit minus unknown gives lit known solid (any kind, within 2.5 tiles of the rig, with its cell count in brackets; blank under 3 cells) and then all known solid in the window; ✓ needs both clauses, ✗ any measured one failing. Lit rock minus cave air uses all known solid, as 06-prototype.md §3 did. "Rock" is solid terrain of every kind, as in 06-prototype.md §3; the rock sd row pools the kinds, so a soil and hard-rock mix raises it.

Not measured by the harness:

- Brightness order: lamp > rims > walls > unknown > interior and cave air: needs the T1 light layers.
- Floor contact; walls and ceilings visual vs collision air: needs the T2 field geometry.
- Headlamp occlusion test; bore spill in the down pose: needs the T1 light stack.
- Warm accents by emitter: needs T1 emitters.
- Objective size; HAUL; bar labels; tier badge diameter: HUD work (H items); DOM boxes are in the manifest.
- Board inventory; prop grounding; hero props structural: art items and owner review.
- p95 on a physical phone: read on a remote real device with ?debug=frametime.
- Hidden information under full-frame scramble: F7; the inset-crop checks still run in verify.
