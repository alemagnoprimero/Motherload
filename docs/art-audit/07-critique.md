# 07 — Critique of `ART_QUALITY_AUDIT-draft.md`

*Review of the draft dated 2026-11-03, read against `origin/main` 644e222 (read-only), the concept board `docs/art-direction/d0-target-board.png`, the captures in `v2/shots/` and `v2/shots2/` (both manifests complete), and the prototype outputs in `prototype/out/`.*

- **New evidence for this review** is in `critique/` beside this file: `measure.py` (reproduces every number below; writes `measure.json`), plus the crops `a04-rig-crop.png`, `concept-surface-props-2x.png`, `concept-portrait-surface-3x.png`, `portrait-aspect-cavern.png`, `b330-plate-crop.png` and `w02-sheet.jpg`.
- **Units:** as in the draft, luma is Rec. 709 on 0–255.

---

## Verdict

**The diagnosis is right and well grounded.** The value inversion, the erase-only light, the cell-square renderer, the props that were never authored and the text in the playfield are all real. Nearly every file:line reference I checked points at the code it describes (see "What I verified").

**The plan would not yet deliver the board.** Executed as written, the game would reach "same family" on desktop for shaft and cavern rock, edges and light. The owner would still see six things:

1. The **60 m shaft panel** shows a 2.3-tile shaft with air around the rig and a visible warm cone. A 1-tile shaft never looks like that, and when the rig drills down the cone points into rock.
2. The **300 m cavern panel's beacon** has no counterpart at the wreck. The game's "Wreck survey beacon" sits in the route column at 100 m.
3. The **"portrait" panels** are not phone frames. They have a 0.69 aspect; a 393×851 phone is 0.46.
4. In the prototype cavern, **cave air is as light as rock**, which inverts the board's dark hollow.
5. **Every dive to the slice cavern** still crosses the hatched 300 m plate layer and band B in the old look.
6. **Motion** (reveal, digging, light shimmer) was never reviewed.

**Engineering.** The route is feasible in Phaser 3.90, which runs on WebGL1, but several pieces are not planned:

- CI breaks on the first light change.
- The proposed scramble test cannot see the new leak paths the plan itself adds.
- The memory figures understate the asset list by at least 3×.
- The schedule has no slack on its critical path.

I found nothing that breaks existing saves, provided the issues on generator-version plumbing and frozen generators (16) are fixed.

**Count:** 31 issues, of which 2 are blockers, 14 major and 15 minor.

---

## What I verified (holds)

| Claim in the draft | Check | Result |
|---|---|---|
| Unknown rock luma 84–89, concept 57 | `a04` crops: 88.5 / 88.4 (sd 1.5); `b-550m`: 84.1; board shaft: 57.3 / 58.9 (sd 10–11) | ✓ |
| Explored darker than unexplored below band A | `lighting.ts:73-77`: unknown 0.16; visible (1−ambient)×0.72 gives 0.24 in B and 0.52 in D | ✓ |
| Rim strokes and cell clip | `terrain.ts:162-164`, `248-277`; the 46 edge-mask SVGs in `assets/campaign/source` are packed into `w01-atlas.json` but not into the runtime atlases, and nothing in `src` references them | ✓ |
| Terrain raster capped at 1.5 | `terrain.ts:41` | ✓ |
| One-way resolution ratchet | `view.ts:99-121` (the ceiling only falls) | ✓ |
| Six GeometryMask sites | `scene.ts:680, 1491, 1646, 1735, 1769, 1793` | ✓ |
| Label re-upload | `scene.ts:648-649` guarded; `710-714` unguarded | ✓ |
| Lamp dots under the pad | `scene.ts:1325-1332` at depth 11 vs dock at depth 15 (`1360-1370`) | ✓ |
| Wedge shared by 6 of 8 site kinds; ringed badge r 14 | `render-sources.mjs:8-11, 12-28` | ✓ |
| 270 sprite SVGs without gradients | 177 (`source/`) + 93 (`w02/`), none with `Gradient`. Only the 24 band pages use one | ✓ |
| Wreck floats about 1.9 cells | Measured 255 device px = 1.85 tiles in `c-site-W01-SITE-4-wreck@2.png`. Cause: the site y is the ellipse centre (`world.ts:260-273`) | ✓ |
| Upward chips | `scene.ts:763-768`: `vy = −random × 2.3` | ✓ |
| COVERAGE line citations (38, 39, 45, 53–62, 69–73) | Read | ✓ |
| Scorecard means and effort totals | 1.4/1.4/1.6/1.4/1.2/1.2/1.2; Phase 1 44–61 d; total 84–113 d and 70–77 artist-days | ✓ arithmetic |
| Prototype metrics quoted in §1/§8 | Match `06-prototype.md` and `metrics.txt` | ✓ (one exception in issue 4) |
| The existing CI dark-share gate does not block F4 | `improvement-smoke.mjs:1025-1031` requires ≤0.60 below luma 40. Prototype shaft 0.108, cavern 0.214; board shaft 0.093, cavern 0.43 | ✓ no conflict |
| Saves | T4 regenerates pristine tiles from the seed. Tiles only ever become air (`model.ts:1024` dig, `1292` shelf collapse), so pristine air equals natural air. Preferences merge onto defaults (`input.ts:128-142`), so a new Scan action loads safely | ✓ no save break |

---

## Issues

### Blockers

**1. Blocker. The G1 targets are compositions the game cannot produce in play, so the gate either fails or gets satisfied with staged fixtures.**

*Evidence.*

**Shaft.**
- The board's shaft is 2.3 tiles wide: rims at x 518 and 627, tile ≈ 44–47 px. The rig stands on a ledge and faces sideways, with air on both sides.
- The game digs 1-tile shafts. The hull frame is 92 px on a 96 px/tile page (0.96 tile, `rig-body-0`). The rig spans 112 saturated px on a 130.9 px tile in `a04` (`critique/a04-rig-crop.png`), so the rig *is* the shaft.
- While drilling down, the cone points into rock. The prototype found the same ("the cone hits the wall after 0.1 tile", `06-prototype.md` §4), and its concept-zoom shaft (`proto-shaft-conceptzoom-1440x900@2.png`) shows no cone at all.

**Cavern.**
- The board puts a beacon tripod beside the wreck at 300 m.
- In the game the "Wreck survey beacon" is at `(W01.spawnX, beaconRow + 0.5)` = (20.5, 9.5), which is 100 m down, inside the route column (`poi.ts:236-246`, `config.ts:367`). SITE-4 has no beacon. The prototype placed one there as "not a game object at site 4" (`06` §7).
- The cavern fixture is a teleport with a radius-6 reveal (`v2/shots/manifest.json`, `c-site-*`). It is not a state reached by playing.

**Portrait.**
- The board's panels measure 693×358 (1.94) and 246×358 (0.69). They are not 16:9 (1.78) or 9:19 (0.47).
- A 393×851 phone (0.46) shows about 50 % more height per unit of width than the "portrait" panel (`critique/portrait-aspect-cavern.png`).
- §4.3 asks the owner to score each portrait panel ≥4 against a frame the phone cannot show.

*Fix.* Add a Phase 0 item **F0, "reachable targets"** (2–3 d of art direction plus owner time):

1. **Shaft (decision D2).** Choose and record one of these:
   - (a) A render-only over-carve of **0.20 tile per side** into *known* solid on dug vertical runs. The visual shaft becomes 1.4 tiles, leaving 0.22 tile of air beside the 0.96-tile hull and 0.125 tile in the side-drill pose. That stays within the plan's own ≤0.3-tile visual-collision bound.
   - (b) A 2-wide bore.

   Either way, add a **bore spill light** to T1: while drilling down, a 2.0-tile warm pool on the shaft walls above and below the rig. The draft's 0.1-tile over-carve is too small for the side pose (issue 19).

   Re-cut the shaft target as "1.4-tile visual shaft, rig turned to face a wall, cone horizontal", and have the owner approve that panel.
2. **Cavern.** Either add a beacon set piece to the W01-SITE-4 content (an owner decision on content), or remove the beacon from the cavern target and give asset 15 a wall-mounted variant for the real beacon cell at (20.5, 9.5), which has 1-tile clearance.
3. **Fixtures.** Produce every G1 fixture by native play: a scripted drive with the `campaign-smoke.mjs` helpers and the real `refreshVisibility` (`model.ts:579-626`), with no `discovered.fill` and no radius reveals.
4. **Aspect.**
   - Score desktop on a 1440×743 band (1.94) and portrait on a 393×572 window (0.69), each cropped around the rig at the board's anchor.
   - Separately review the full 393×851 frame against an owner-approved 9:19 extension of each panel, painted over the prototype render.

**2. Blocker. The hidden-information guard (F7) as specified cannot detect the leak paths the plan adds, and the existing CI checks only look at inset crops.**

*Evidence.*
- F7 "randomise unknown tiles and expect identical pixels" only scrambles `world.tiles`. But **T4 regenerates pristine tiles from the seed**, so a renderer that reads natural/dug flags for *unknown* cells would pass. Examples are the σ 0.7 natural/dug weights in the field (`06` §2 T2) and silhouette layers built from pristine air.
- The prototype avoided this only because its scramble also overwrote `sim.pristine` (`proto.js:157`). The draft does not carry that over.
- **T5** says "crystals with no ore in the 3×3 neighbourhood" (§4.3) and principle 3 says decoration "never … sits beside ore". Read literally, that consults hidden deposits, and a missing crystal would then reveal ore. The prototype used *known* deposits only (`proto.js:222`, `cellPkg = known && …`).
- **T6** snaps props to the floor, **T11** frames "known chambers", and A8 paints back-wall strips. Each is a new path that could read the true geometry.
- The existing guards compare only an inset crop of a 2×5-cell block: 3 px inset in `improvement-smoke.mjs:804-877` and 5 px in `render-acceptance.mjs:163-171, 236`. A field blur of σ 0.30 tile changes pixels up to about 1 tile away, which those crops never see.

*Fix.*
1. **Structural guarantee.** The renderer receives only a `KnownWorldView`: per cell, `known`, and for known cells only `type`, `natural`, `deposit tier` and `site id`. Unknown cells read as "solid, band(row)". The renderer never gets `world.tiles` or the pristine array.
2. **F7 test.** After discovery:
   - randomise `world.tiles` for unknown cells *and* inject a scrambled pristine array through a debug hook;
   - move every hidden deposit, undiscovered site, shelf, cold pocket, vent and pressure seam.

   Compare **full frames** for the surface, the 60 m shaft, the 150 m side tunnel, the SITE-4 cavern and a 393×851 phone. Run with Scan off and on, with the T11 framing on, on WebGL and Canvas. The pass condition is 0 differing pixels.
3. **T5 wording.** "No *known* deposit in the 3×3 neighbourhood. Recompute on discovery, and fade a decal out over 300 ms when a neighbour reveals ore."
4. **Old checks.** Keep the two existing crop checks as smoke tests, but let the full-frame scramble be the gate.

### Major

**3. Major. CI fails as soon as T1 lands, and F3 duplicates harnesses the repository already has.**

*Evidence.*
- `render-acceptance.mjs:158-162` asserts `probe.fogBlurMaximumAlphaStep !== null`. The probe captures only canvases drawn while `ctx.filter` starts with `blur(` (`render-probe.mjs:169-187`). T1 removes that blur (`lighting.ts:86`), so the assertion fails on both renderers.
- The camera-shift round trip requires byte-identical pixels outside the rig box (`render-acceptance.mjs:175-215`). T1's motes and temporal ray smoothing, T10's pulse and the lamp flicker (asset 4) will differ between frames unless they run on the scene clock.
- F3 proposes productising `work/tech/tech-probe.mjs`, which patches the scene module in flight through a network route. The repository already has `render-probe.mjs` (GL hooks), `render-acceptance.mjs`, `render-memory.mjs`, `improvement-pixels.py` and `dataset` diagnostics on `#campaign-game`.

*Fix.*
- Make F3 an extension of `render-probe.mjs`, `render-acceptance.mjs` and `improvement-smoke.mjs`.
- Add `window.__campaignDebug.lightTexture()` (a DynamicTexture snapshot) and redefine `fogEdge` on the new base texture.
- Drive every new time-varying term from the scene's `elapsed`, freeze it under `freeze()`, and turn it off in reduced motion. Add this to the T1, T10 and T12 acceptance criteria.
- Move `?overlays=0` from W8 into F3, because F3 needs HUD-free snapshots in Phase 0.
- Add a debug pin for `RenderScaleBudget`.

**4. Major. In the prototype cavern, cave air is as light as rock. §8's "brightness order holds ✓" is wrong for the cavern, and so is the "3–4 on terrain" rating.**

*Evidence.* Region means from `debug-regions-cavern` × `proto-cavern-1440x900@2.png`:

| Region | Prototype | Board cavern |
|---|---|---|
| Unknown solid | 46.7 | — |
| Air | 46.2 | Back wall 33.9 (sd 5.2) |
| Known solid | 62.9 | Rock 52–57 (sd 22–23) |

- In `proto-cavern-conceptzoom-1440x900@2.png` the cave air measures 51.5 (sd 3.1).
- The board reads as a dark hollow framed by lit rock. The prototype reads as a lit teal field framed by grey crazy paving.
- T4's own gate (back-wall luma 28–42) would reject the prototype, but §8 marks the order as passing.

*Fix.*
- Mark the §8 brightness-order row "fails in the cavern".
- Add a check: **unknown rock minus cave air ≥ +10 luma, and known lit rock minus cave air ≥ +18**.
- Set the back-wall base to `#17242e` (luma ≈ 33) before any light.
- Add a highlight-range gate: rock sd ≥ 15 within 3 tiles of a light (the board's rock sd is 22, the prototype's 8–10).

**5. Major. Motion is neither reviewed nor gated, yet that is where a player forms the impression.**

*Evidence.* Every gate is a still (§8). The prototype "did not judge motion" (`06` §7). The new renderer adds five motion behaviours:

- **Digging.** The σ 0.30-tile field rewrites about 1 tile around every dug cell, so natural walls visibly morph.
- **Discovery.** Unknown cells count as solid. A revealed cave therefore "opens", and its iso-line jumps as cells become known: about 1 cell per frame while moving, because discovery is a 4.5-tile disc (`model.ts:607-627`).
- **Light edges.** 720-ray edges shimmer.
- **Decor.** Decals pop in.
- **Flicker.** The beacon and lamps flicker.

*Fix.* Add **G1-motion**: a 20 s scripted run per scene (surface → first cut → 60 m → side tunnel → SITE-4) at 60 fps, reviewed by the owner, plus these measurable checks:

| Check | Target |
|---|---|
| Revealed cells | Cross-fade from unknown over 250 ms |
| Field patch on dig | Lerps over 120 ms; pixels farther than 1.2 tiles from the dug cell change ≤2 luma |
| Static pixels with the rig parked | Per-frame change ≤1 luma |
| Decals | Fade in over 300 ms |
| Flicker | Amplitude ≤8 luma, period ≥0.4 s, off in reduced motion |

**6. Major. The floor-contact tolerance is too loose, so the rig will float or sink on organic floors.**

*Evidence.*
- T2 allows visual-to-collision error up to "≤0.3 tile", which is 39 device px on a 130.9 px tile.
- The prototype keeps 30 % of the low-frequency wobble on floors (`floorCalm .7`, `06` §2) plus a 0.08 high-frequency jag.
- The prototype notes "the rig appears to balance on a nub" on a 1-cell pillar.
- The rig body is only ±0.39 tile (`config.ts:371`).

*Fix.*
- Faces with solid below and air above get zero low-frequency displacement and a jag of ≤0.01 tile.
- **Acceptance:** |visual floor − collision floor| ≤2 device px at every column the rig's tracks can occupy.
- 1-cell pillars render with a flat top at least 0.8 tile wide.
- Keep ≤0.3 tile for walls and ceilings only.

**7. Major. Decision D1 (camera framing) omits the surface zoom, understates the board's phone scale, and ignores what it does to texel density and asset priority.**

*Evidence.*
- **Surface zoom.** The surface and dock zoom is 0.88 (`scene.ts:787-795`). At D1's `width/17` the surface shows about 19.3 tiles; the board's surface shows about 15.7 (tile ≈ 44 px in a 693 px panel, `critique/concept-surface-props-2x.png`).
- **Portrait scale.** The board's portrait shows about 5.6 tiles, and the rig is 52 px, 21 % of the panel width (`critique/concept-portrait-surface-3x.png`). D1's 52 px tile gives 7.6 tiles, and the rig 50–60 px, 13–15 % of 393 px.
- **Texel density.** At `width/17` a desktop tile is 84.7 CSS px, or 169 device px at backing 2. That exceeds the 144 px/tile @3x page, and the rig frames (asset 40) are P1, so the hero of every G1 frame would be upscaled.
- **Phone pages.** `artQuality` is hard-coded to 2 on coarse pointers (`scene.ts:833-837`), and @3x pages never load on phones (`art.ts:144`). Any portrait tile above 48 CSS px therefore samples @2x art upscaled.

*Fix.*
- Write D1 as a table of zoom per state (surface, dock, ≤120 m, deep, inspection, phone portrait, phone landscape), including the board-matching values 15.7 tiles and 5.6 tiles as options, with gameplay look-ahead noted.
- Choose atlas pages by device px per tile, not by pointer type.
- If D1 goes beyond 48 px on phones or 72 px on desktop, move asset 40 (rig) to P0 and budget @4x pages in §6.

**8. Major. The layer stack would leave front props unlit.**

*Evidence.*
- The light layer is at depth 17 (`lighting.ts:19`). The rig draws at depths 18–23 (`rig.ts:68-132`), above the light. That is fine for a hero.
- T6 puts the "front mound at depth 24", also above the light, so foreground boulders and wreck mounds would show at full albedo in a dark cave. The board draws them as dark silhouettes.
- Phaser's Canvas renderer has no tint path (no `tint` anywhere in `renderer/canvas/`), so per-sprite light tinting cannot rescue the Canvas tier.

*Fix.* Define the stack explicitly:

1. Back wall.
2. Back props.
3. Solid terrain.
4. Front props and decals.
5. The light composite, multiplied over all of the above.
6. The rig, emissives and ADD sprites.

The rig's self-light is the headlamp pool. On Canvas, draw front props before the darkness layer.

Simpler still, and with no masks: sandwich props between a back-wall pass and the solid pass. Unknown cells are opaque solid, so props are hidden there without any GeometryMask. This also closes T6's mask work in both renderers.

**9. Major. The slice leaves out what every player passes through on the way to the slice cavern.**

*Evidence.*
- **Plate layer.** W01 has a full-width 2-row plate layer at rows 30–31: 80 plate tiles in `fresh-w01.json`, 40 per row. It is drawn with diagonal stripes (`terrain.ts:236-247`, `critique/b330-plate-crop.png`). It is the board's "heavy iron shelf", yet W4 and asset 38 sit in Phase 2.
- **Shelf.** A brittle shelf hazard sits at (13.5, 46.5), 2–3 cells from W01-SITE-4 at (15.5, 43.5), inside the slice frame.
- **Band B.** Band B covers rows 11–29 and holds the second milestone (the valve at row 24, `config.ts:368`). It and the B→C cut (`b-330m-…`: blue-grey to brown in one row) stay old until W1.

*Fix.*
- Move W4 and asset 38 (plate and shelf page, 3 crack states) into P0.
- Give band B shader parameters and a material swatch in Phase 1 (about 1 d).
- Pull W1's 2-row dithered band transition into Phase 1 (about 1 d).
- Add 150 m, 330 m and the title (`a01`) to the G1 sheet as "transit frames" that must each score ≥3.

**10. Major. HUD parity is assumed rather than planned, and the G1 sheets are HUD-free.**

*Evidence.* The draft calls the HUD "the one layer that already resembles the board" (§3). Against the board:

| Element | Board | Game |
|---|---|---|
| Vitals | One pill with labelled ENERGY and HULL bars | Bars without labels |
| Status | "0 m · 2/7 · HAUL 60 CR · CR 20" and pause | No HAUL value |
| Objective | A pill about 150×22 px in a 693 px panel (≈312×46 CSS px at 1440) | `a04`: a card with "01/03", a sub-goal, Details and Contracts, ≈352×87 CSS px, about 2× the area |
| Other UI | None | HOME chip, "Home 0.9L · Safe" chip, tool tray, depth rail; on phones also "TAP Read field log" and "Hold full · 7/7" (`p-portrait-03-dive-70m@3.png`) |

*Fix.* Add **H1–H4** (2–3 d) to Phase 1:
- **H1:** the objective becomes a pill (title plus distance; details on tap or hover).
- **H2:** a HAUL value.
- **H3:** bar labels at widths ≥900 px.
- **H4:** a phone tray that becomes translucent or auto-hides, agreed with the owner as the one exception the board does not show.

Score one as-shipped HUD frame per scene under question 4.

**11. Major. Specifics of Phaser 3.90 and WebGL1 are missing from T1, T2, T3, T6 and T7.**

*Evidence.*
- **WebGL1.** Phaser creates a WebGL1 context (`node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:770`, `getContext('webgl')`). That rules out R8 textures and `texelFetch`, and the field must use LUMINANCE/ALPHA or RGBA8.
- **Field patches.** `createUint8ArrayTexture` exists (`:3250`), but there is no `texSubImage2D` helper. The 48×48 field patches need raw GL on the texture wrapper, with Phaser's bound-texture state reset afterwards.
- **World wrap.** The field textures are NPOT (W01 640×960, W02 768×1600), so REPEAT and mipmaps are unavailable. The 40- and 48-column worlds wrap, so the seam at x = 0 needs manual handling. The prototype's value noise is not periodic either (`06` §7).
- **Precision.** World-space Worley at up to 1600 texels breaks at mediump. Phaser's own shaders declare `precision mediump float`.
- **Context loss.** The game has no `contextlost` or `contextrestored` handling (nothing in `src`). Raw textures and DynamicTexture contents are lost on mobile backgrounding.
- **Canvas gaps.** `Rope` has an empty Canvas renderer (`RopeCanvasRenderer.js`), and T7 uses it for cables. `BitmapMask` is a no-op on Canvas (`BitmapMask.js:148`), and T6's "feathered mask" implies it.
- **Canvas blur.** T3 still inherits the `ctx.filter` blur at `lighting.ts:86`.

*Fix.*
- **T2:** pad the field by 4 wrapped columns on each side and sample with clamp; make the noise periodic over the world width; require `HIGH_FLOAT` precision, with a fallback to the Medium (baked pages) tier; coalesce patches to at most one bounding-box upload per frame.
- **Context loss:** add a handler that rebuilds the field and relights, plus a smoke test using `WEBGL_lose_context`.
- **T7:** draw cables in Canvas as Graphics bezier strokes.
- **T6:** use the sandwich approach from issue 8.
- **T3:** build darkness from a 1-px-per-cell canvas upscaled with `imageSmoothingQuality = "high"`, with no `ctx.filter`.
- **Testing:** add Firefox (`.github/workflows/firefox.yml` already exists) to the device gates.

**12. Major. The memory figures are wrong or unmeasurable.**

*Evidence.*
- **Asset list size.** "Rows 1–51 come to about 20 MB at @3x." Decoded RGBA from the table's own canvas sizes (`critique/measure.json`):

  | Rows | Size |
  |---|---|
  | Back-wall strips (21, 30) | 27.0 MiB |
  | Ridges (12) | 10.1 MiB |
  | Iron shelf (38) | 15.2 MiB |
  | Lander (1–4) | 7.6 MiB |

  These four rows alone come to about 60 MiB. The material pages of rows 22 and 29 (4 bands × 2 materials × 3 variants at 1152²) add 121.5 MiB.
- **Residency metric.** It counts only TextureManager entries at 4 B/px (`scene.ts:2028-2038`). F8's compression would never register under that metric. The T2 field texture (raw GL) and any composite render target would be invisible; a full-frame target at backing 2 is 2880×1800×4 B = 19.8 MiB, which cancels the 19.5 MiB terrain-buffer saving that §6 counts on.

*Fix.*
- Replace the total with per-zone resident budgets: surface zone; cave zone for the current band plus its neighbours (`art.ts:63-70` loads index ±1).
- Make the metric format-aware and include render targets and raw textures.
- Fold darkness into the terrain shader, as §6 itself suggests, so no full-frame target is needed.
- On the WebGL High tier, drop band pages, which are needed only for Canvas and the Medium tier: about −21 MiB.

**13. Major. The schedule has internal contradictions and no slack on the critical path.**

*Evidence.*
- F4 "can ship in week 1" (§1), but F4 depends on F3, which depends on F1: 1 + 3–4 + 1.5–2 = 5.5–7 days for one engineer.
- T1 marches rays "on the visual field" and reads "the same lip mask" (`06` §2 T7–T8), both T2 outputs, yet T1 lists only F1 and F4 as dependencies. T11's over-carve is also a field operation, but it lists only F5.
- T13, the asset pipeline, arrives in Phase 1, while the artist starts the P0 rows in week 1 and §5.4 requires review "in a fixture, never in isolation".
- Decisions D1, D2, D6 and D8 fix texel density, shaft composition, band hue and crystal hue, all of which P0 art needs, but none is scheduled.
- Critical path: F1 → F3 → F7 → T2 spike (3 d) → T2 → T1 → T5/T10 → integration and owner review ≈ 33–40 engineer-days on one person, for a 7-week phase.
- If the T2 spike fails, the fallback (asset 52, 320 tiles, +6–9 d) has no slot.

*Fix.*
- Add a week-1 decision workshop for D1, D2, D6, D8 and D12 (issue 18), using the concept-zoom prototype renders.
- Drop F4's dependency on F3 (measure it with the existing `improvement-pixels.py` and the audit scripts), so F4 really ships in week 1.
- Add T2 as a dependency of T1 and T11.
- Move a minimal T13 into Phase 0: a PNG into `frames.json`, visible in a fixture.
- State G1 as **9–11 weeks**, with an explicit branch for a failed spike, or cut menus and W02 from the committed scope.

**14. Major. Art effort is underestimated where it matters most, and there is no art-direction budget.**

*Evidence.*
- **A2 lander** (stage 0, dish, emissive) gets 2.5 d against a target of "≥250 colours, ≥25 % soft shading".
- **W5** gets 5 d for lander stages 1–3, rig shading (8 body frames plus cabin and modules), pad, refuge, relay and stakes.
- **A9/A10** give 3 d to the material look of bands A and C, the surface that covers 54–84 % of every underground frame.
- None of the estimates includes revision rounds, and no one is named to own art direction once A1 is done.

*Fix.*
- Add 30 % for revisions on hero props (A2, A5, A6, W5).
- Raise A9/A10 to 6–8 d, with a swatch card signed off before T2's parameters freeze.
- Budget 0.5 d per week of art direction for the whole programme (about 9 d).
- Restate the total as about 95–105 artist-days, or about 19–21 weeks for one artist.

**15. Major. T8 (Scan) clashes with existing input, label code and tests.**

*Evidence.*
- **Gamepad.** L1 is standard button 4, which is already `interact` (`input.ts:62-73`).
- **Touch.** A touch held for 180 ms becomes the joystick (`pointer.ts:83, 96`), so a long-press cannot also mean Scan.
- **Two label systems.** The game has two: the Phaser text pool (`scene.ts:611-655`) and DOM beacons (`ui/world-labels.ts`). "`world-annotations.ts`" ignores the second.
- **Tests.** `feel-smoke.mjs:149, 256` looks up the HOME `.world-beacon`, and `plan-ui-smoke.mjs:466` asserts the HOME label stays attached. With Scan off those tests fail; they need rewriting, not just passing.
- **Gameplay.** HOME distance drives the return-home decision.

*Fix.*
- Put Scan on L2 (button 6), a button in the existing tool tray, and Shift/F, with a toggle option (like `drillToggle`).
- Keep HOME as an edge chevron that is always on.
- Merge both label systems into one module and rewrite the two smoke tests against the new contract.
- Re-estimate T8 at 5–7 d.

**16. Major. Bumping to generator version 3 silently disables onboarding, and T4 relies on generators no test freezes.**

*Evidence.*
- Code with `generatorVersion === 2`: `poi.ts:106` (opening survey), `poi.ts:129` (opening route), `poi.ts:263` (A/B seams), `scene.ts:1334` (seam markers) and `model.ts:2348` (volatile training).
- `world.ts:113` hard-codes `generatorVersion: 2`, and `versions.ts:9` lists `[1, 2]`.
- No test pins the output of `createW01` or `createW02` for v1 or v2. The 100- and 200-seed tests check contracts, not identity. T4 recolours back walls of existing saves from regenerated tiles, which is only correct if v1 and v2 never drift.

*Fix.*
- **Before T4:** add hash tests of `tiles` and `packages` for seeds 0–19 per world and version.
- **For W2:** replace the `=== 2` checks with capability flags or `>= 2`, extend the type, `versions.ts` and the tile-range check at `model.ts:2209`, and re-run `run-pacing`.
- **Estimates:** raise W2 to 6–8 d. The SITE-4 gallery in `fresh-w01` already has a 5-cell floor at row 46, columns 15–19, so the slice does not need v3. Pick G1 seeds with a flat floor under the site, and add "flat site floor" as a v3 contract later.

### Minor

**17. Minor. Hard rock: follow the board, not the prototype.** The board's surface draws hard rock as square, cracked, darker bevelled blocks on the grid, in both formats (`critique/concept-surface-props-2x.png`, `concept-portrait-surface-3x.png`). The prototype rounds hard rock into boulder inclusions (`06` §2 T5), and T2 and asset 23 follow that. *Fix:* hard-rock cells keep square outlines with a 0.03-tile chamfer and cracked-plate fill at L\* −8 relative to strata. Exclude them from the natural-cave axis-aligned measure.

**18. Minor. Lander scale and the wreck ribs.**
- The board's lander is about 2.5×1.65 tiles (2.0× the rig's width). `dock-stage-0` is 375×196 px on a 96 px/tile page, or 3.9×2.0 tiles (3.4× the rig).
- The board's wreck is about 7 tiles wide including the rib arcs. Asset 14 is a "5×1.7 hull" with no ribs.

*Fix:* add decision **D12** (lander at about 2.5×1.8 tiles to match the board, or keep 4×3) before A2, and add "rib arcs ×5, back layer" to asset 14.

**19. Minor. The "1.28-tile rig" figure is wrong.** The hull is 0.96 tile (92/96) and 1.15 tile with the side drill (`rig-drill-right-0` reaches the canvas edge at 128 px). `a04` measures 112 saturated px on a 130.9 px tile. *Fix:* correct §2 and D2. A 0.1-tile over-carve shows lips in the down pose but leaves only 0.025 tile in the side pose. Use ≥0.15 tile, or 0.20 per issue 1.

**20. Minor. The draft contradicts itself in five places.**
- "Lifts unknown ≤3 L\*" (T1) vs "≤2 L\*" (§8).
- "Two reviewers" (D11) vs "three reviewers" (§8).
- "p95 ≤12 ms" (§6) vs "≤16.7 ms" (G1).
- Badge size "0.19 rig widths" (§2/§3) vs "about 0.17 of the ore frame" (§8).
- §8's ✓ for brightness order (issue 4).

*Fix:* one number each: 2 L\*; three fresh reviewers; 16.7 ms on a device (12 ms in the emulated stretch); ≤0.18 of the ore frame.

**21. Minor. The colour-count gates can be gamed.** "≥250 colours (lander)", "≥130 (wreck)" and "<40 significant colours" (W8) are passed trivially by any SVG gradient after anti-aliasing. They were derived from a generated, resampled board. *Fix:* replace them with structural checks (≥3 shading tiers per material zone, alpha IoU ≥0.7 with the board silhouette at matched scale) and the owner score.

**22. Minor. D9 is overrated.** Flipping the crescent departs from the board the owner said they love. No player compares the light direction of a planet with that of the far ridges. *Fix:* keep the board's crescent and drop D9.

**23. Minor. The F1 floor conflicts with the quality tiers.** A hard floor of 1.5 on DPR ≥2 locks slow phones at a low frame rate; today's moving p95 is 54.9 ms (`IMPROVEMENT_PROGRESS.md:58`). The `renderScale` preference accepts only `[1, 1.5, 2]` (`input.ts:120`). `render-adaptive.mjs:68-80` asserts those levels and that load lowers the scale. *Fix:* make the floor per tier (High 2.0, Medium 1.5, Low 1.0), add upward recovery after 10 s below 12 ms, and keep the three levels.

**24. Minor. Split F8.** Compressed pages cannot feed today's Canvas terrain, which builds patterns from `getSourceImage()` as an `HTMLImageElement` (`terrain.ts:195-207`). Compression also needs multi-format KTX output (ASTC, ETC and S3TC) and a new build tool. *Fix:* F8a unloads the duplicate atlas (1 d, Phase 0); F8b adds compression after T2 (3–5 d), with the format matrix and the metric fix from issue 12.

**25. Minor. Provenance collision.** `assets/campaign/generated/provenance.json` is the build manifest, and it states "no board pixels included". Using it for provenance of generated underlays (§5.3) mixes two meanings. *Fix:* keep a per-asset record at `assets/campaign/source/provenance/<asset>.json` (source, prompt reference, the hand-painted share, reviewer).

**26. Minor. The title is fixed for free, so gate it early.** The title renders the live surface (`titleVisible` framing, `scene.ts:1073-1077`). `a01` shows the wireframe lander and salvage heaps. *Fix:* add `a01` to G1, since A2, A3 and T7 already change it. M1 then shrinks to a check.

**27. Minor. The W02 target is invented.** Spending 19–20 artist-days on X2 against a target the owner never saw is a risk; the board shows only W01. *Fix:* before X2, paint over prototype renders to make three W02 panels (surface, 180 m, deep cavern) and get owner approval, as decision D13.

**28. Minor. Back-wall strips and decor must be anchored to the world.** If painted strips (A8, asset 21) were sized or placed per cave component, the visible strip would reveal how far the cave extends. *Fix:* tile strips by world position, clip them to known natural air, and fade them in on reveal.

**29. Minor. "Safe for gameplay" (§1) is not yet shown.** D1 (fewer tiles visible), T8 (labels hidden), T9 (smaller tier marks at 7 CSS px on phones), T11 (camera framing) and the issue 1 over-carve all touch play. *Fix:* replace the claim with a list of these items, each with its playtest metric (time to beacon, time to first bank, tier recognition ≥95 % at 393×851, hazard hits).

**30. Minor. CI time under SwiftShader.** The new full-screen shader at 2880×1800 under SwiftShader may push `checks.yml`'s 30-minute job over its limit. *Fix:* run the CI fixtures at backing 1 and the G-sheets at @2 only nightly (the `schedule` path already exists).

**31. Minor. "0 steady uploads" holds only when the rig is still.** Discovery adds cells on almost every moving frame (`model.ts:579-627`), and every addition patches the field, not just digging. *Fix:* §6 should read "patched on dig *or discovery*, at most one coalesced upload of ≤160×160 texels per frame", measured with the probe's `textureSubUploads`.

---

## Proposed replacement for the G1 gate (consolidates issues 1, 2, 4, 5, 9 and 10)

1. **Fixtures.** Reached by native play from spawn on two seeds. Desktop is scored on a 1440×743 band; portrait on a 393×572 window plus the full 393×851 frame. The targets are the owner-approved F0 re-cuts (shaft with the D2 choice; cavern with or without the beacon by content decision).
2. **Stills.** The §8 metrics, with these additions:
   - unknown minus cave air ≥ +10;
   - lit rock minus cave air ≥ +18;
   - |visual floor − collision floor| ≤2 device px;
   - rock sd ≥15 near lights.
3. **Motion.** The G1-motion run from issue 5, reviewed by the owner, plus its five temporal checks.
4. **Transit and title.** 150 m, 330 m (the plate layer) and `a01` each score ≥3; the three slice scenes score ≥4 on all four questions.
5. **HUD.** One as-shipped frame per scene, scored under question 4.
6. **Hidden information.** The full-frame scramble from issue 2, covering tiles, pristine data, deposits, sites and hazards, on both renderers, with Scan on and off.
7. **Device.** One physical reference phone, arranged in week 1, at backing ≥1.5 with p95 ≤16.7 ms. Also Firefox, the oldest supported iOS Safari, high contrast, reduced motion, and a context-loss test.

---

## Verdict on the vertical slice choice

Surface, 60 m and the SITE-4 gallery are the right three scenes: they are the board's three, and SITE-4 sits in the W01 deep gallery (`world.ts:186-188`), the only cave large enough. The slice is too narrow in three ways:

- it excludes what the player crosses to reach it (issue 9);
- two of its targets are not states the game produces (issue 1);
- it is judged without motion or HUD (issues 5 and 10).

With F0, P0 versions of W4 and band B, and the gate above, it is the right slice, and the gate is strict enough to stop a slice that only looks like the board in staged stills.
