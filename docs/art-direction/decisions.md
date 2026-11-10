# The Deep Frontier: decisions

Owner decisions for the art programme. The options and the audit's recommendations are in `docs/ART_QUALITY_AUDIT.md` §8; this file records what the director chose. Each entry gives the option chosen, the date and a one-line rationale. Step 2 recorded D5 (2026-11-03). Step 4, the week-1 workshop, recorded D1, D2, D3, D6, D8, D12 and D14 (2026-11-06). The repo copy of this file is `docs/art-direction/decisions.md`, so it travels to Claude Code sessions with the repo; the Project copy is what chats read and update.

Three of the seven workshop decisions depart from the audit's recommendation: D2 (a real 2-wide bore instead of the render-only over-carve), D8 (violet crystals chosen now instead of amber plus a recognition test) and D14 (the waypoint beacon moves to the wreck and the wreck survey moves to M2). Each has an "in detail" section below listing what it changes in the plan.

## Decided

| # | Decision | Option chosen | Date | Rationale |
|---|---|---|---|---|
| D5 | Art sourcing and budget | No commissioned artist. Alejandro is the art-direction owner; Claude executes all art and code. Every asset is hand-written SVG, a seeded generator or shader parameters; pipeline C (painted raster) is dropped. Generated images may serve as silhouette underlays for the three hero props, with a provenance record per asset. | 2026-11-03 | The director chose to direct the art himself with Claude as the only executor, so no painter is on the team; SVG, generator code and shader parameters also match the board's "Vector" target and rebuild byte-identically. The underlay rule follows the audit's recommendation (§6.3, D5), limited to the hero props. |
| D1 | Camera framing | Option B for play (80 to 85 CSS px per tile on desktop, 17 to 18 tiles across, at most ×0.95 on the surface; 56 px on phone portrait, 7.0 tiles; 48 px on phone landscape), with the board's scale (option C, 92 px, 15.7 tiles) as the cave-framing zoom inside known chambers at least 5 rows tall (T11). As recommended. | 2026-11-06 | B is the only option that lets board-level prop detail be read without C's look-ahead loss on phones (about 2.8 tiles each side of the rig); under D5 the @4x pages it needs are re-renders, not art time. |
| D2 | Shaft composition | (b) a real 2-wide bore on dug vertical runs, plus the bore spill light in T1. For the F0 re-cut of the shaft panel, the headlamp beam is tilted up the shaft, as on the board. Not the audit's (a). | 2026-11-06 | The director prefers a shaft whose picture and collision agree and that reaches the board's open-air composition for real; the over-carve would show 0.2 tile of air the rig cannot occupy, and the audit's own playtest row exists because of that. The cost is a drill-time and energy rebalance, accepted. |
| D3 | Overlay policy | Labels on demand with Scan (gamepad L2, a tool-tray button, Shift/F, with a toggle preference); HOME stays an always-on edge chevron with its distance; hazards stay always on. All four additions the board does not show are approved: the phone tray that turns translucent or auto-hides (H4), the distance inside the objective pill (H1, T10), edge chevrons for HOME and off-screen targets (T10), and always-on hazard markers. As recommended. | 2026-11-06 | The board has no text in the world and the game's 60 m frame is 85 % overlay edges; Scan keeps the information one key away, and HOME's distance drives the return-home decision, so it is the one thing that stays on. |
| D6 | Band identity | A slate base at every depth on the board's L\* ladder (unknown about 24, lit wall about 40, lip about 90, interior about 15, cave air about 14), with band accents and a hue shift of up to 15° for bands B and D; band identity comes from inclusions and dressing (regolith pebbles in A, long fractures in B, rust seams and iron lamination in C, crystal seams in D). As recommended. | 2026-11-06 | The board's cavern is slate and the per-tile brown and violet swaps read as a checkerboard; under D5 the band key is shader and generator parameters, so it can be strengthened later if the slice shows the depth cue is too weak. |
| D8 | Crystal colour | Violet, chosen now; not amber. The exact hex is set on the swatch cards (A1, step 6), at the board's accent value (L\* about 67) with the ADD sparkle. The 3×3 placement rule stays (T5, crystals never beside a known deposit). The 5-player recognition test is no longer a gate before A7. Cyan stays reserved for emitters. | 2026-11-06 | Amber crystals are 8 L\* from copper ore in the same hue family and break the audit's own rule that the warmest pixels are emitters; a parameter edit settles it now and gives band D its crystal-seam accent under D6, so no test gate is needed in week 3 or 4. |
| D12 | Lander scale | Match the board, about 2.5 × 1.65 tiles (2.3 tall with the dish, 2.0× the rig's width); the dock interaction zone stays at today's footprint. As recommended. | 2026-11-06 | The board's lander and rig share one scale, and the base reads wide through its dressing (lamps, cables, crates, A3), not through the hull; keeping the zone leaves banking and the dock smoke tests untouched. |
| D14 | Beacon at the wreck | (iii-a) The W01 waypoint beacon moves from the 95 m route cell to the SITE-4 crew gallery (about 435 m), beside the wreck, and the wreck survey moves from mission M1 to M2; M1's proof becomes banking three ordinary packages. One beacon only, and it is the objective, drawn as the T10 emitter. Not the audit's (i) or (ii). | 2026-11-06 | The director wants the board's cavern reached by play with its beacon as the real objective, and no second beacon that looks like a waypoint but is not; the beacon cannot simply move because M1's reward (rank-1 hardware) is what cuts the 310 m plate above the gallery, so the survey moves to M2, which already sends the player to the antenna at 400 m. |

### D5 in detail

**What it replaces.** The audit recommended one commissioned artist for 95 to 107 days, with a named art-direction owner.

**Roles.**
- Art director: Alejandro. Reviews every iteration, picks variants, scores panels at the gates.
- Executor of all art and code: Claude. No Krita or other painting tool.

**Pipelines.**
- B (hand-written layered SVG), A (existing generators) and P (seeded procedural) only.
- Assets 16 to 21 and 38 become seeded generators. Materials 22, 23 and 29 are shader parameters, with Canvas and Medium-tier pages baked from the same shader code.
- The mapping for every §5.6 row is in `docs/art-direction/asset-tracker.md`.

**Generated underlays: yes, with a provenance record per asset** (decided in step 2, 2026-11-03).
- Scope: the silhouettes of the three hero props only: the lander (assets 1 and 2), the wreck (14) and the beacon (15, including the wall-mounted variant).
- An underlay is a reference. The asset is redrawn by hand as clean layered SVG; no underlay pixels and no auto-traced paths ship. Board pixels are never copied into any asset.
- The board stays the silhouette target: alpha IoU ≥ 0.7 with the board's silhouette at matched scale, whatever an underlay shows.
- Provenance: one record per asset at `assets/campaign/source/provenance/<asset>.json` (audit §6.2: source, reference used, reviewer, with "hand-painted share" read as "redrawn share"), plus for each underlay the tool, the prompt, the date and the image's SHA-256. Underlay images are not committed under `assets/`.
- Tools: the Adobe connector offers no image generation in this environment (only generative expand). Figma (`generate_image`) and Canva (`generate-image`) are connected to this account and not yet tried.

**Effects on the audit's plan.**
- §6.1 "Medium": "vector" is taken literally, so assets 16 to 21 and 38 leave pipeline C, and so does every other row of §5.6 whose Pipe column includes C (10, 14, 22, 23, 29 to 31, 36 and 44 to 48). A7, A8 and A14 are re-estimated in `docs/art-direction/asset-tracker.md`: 5 to 6.5 executor-days plus a 1-day shared generator kit, against 8.5 to 9.5 artist-days painted.
- §5.6 conventions: there are no 4× raster masters. Every density, including the @4x desktop pages under D1, is a re-render from source. The size note is redone in `docs/art-direction/asset-tracker.md`.
- §6.2: the "Organic dressing, back walls, iron shelf" row (Krita or Photoshop, `.kra` or `.psd` masters) no longer applies. The provenance row stands.
- §5.7 and §1 "What it costs": artist-days become executor-days in this Project's chats and in Claude Code sessions. The director's review time (about two or three sessions a week, roughly an hour each, during the slice) sets the pace of the art track.
- D13 and F0: panels described as "painted over prototype renders" are composited as SVG overlays on those renders instead.

### D1 in detail

Per the §8 D1 options table, column B, with C as the cave-framing zoom.
- **T11:** zoom per the table; the cave-framing rule eases to C inside known chambers at least 5 rows tall. **F5** (camera whip fix) must hold through the easing.
- **T13b:** atlas pages are chosen by device px per tile, not by pointer type. Desktop at backing 2 needs 160 to 170 device px per tile, so the rig, ore and hero props get a @4x desktop page; phones at DPR 3 load @3x at a 1.17× upscale.
  - *As built (2026-11-09, in review; `src/campaign/render/zones.ts`).* Device px per tile = `campaignTileSize()` × F1's backing ceiling, min(devicePixelRatio, Render quality, 2) (the `?backing=` pin when set): not the adaptive level, so an F1 step never reloads pages, and not the 0.88–1.08 context zoom. Density = clamp(ceil(px / 48), 2, 4) for the hero pages and clamp(…, 2, 3) for the rest. At today's tiles 1440 × 900 @2 has 130.9 px (@3x) and a 393 × 851 @3 phone 88 px (@2x); the @4x desktop and @3x phone paths arrive with T11's tile (shown now at 1728 × 1117 @2, and with the debug-only `?tile=82` and `?tile=56`).
  - *Budget guard (part of T13b).* When the pages D1 asks for would take the projected resident texture bytes over the form's §7 budget, non-hero zones step down to @2x, the step that saves most first, until they fit or none is left; hero pages keep their D1 density. A form over its budget even with every non-hero zone at @2x keeps those fewest bytes, and the F1 readout says `over §7`. A step lasts for the session in that world, render tier and D1 density (a ratchet): densities never step back up mid-play, so a descent and a climb load each page at most once per density. The form is F1's render tier as F1 decides it: D1's density never reads the pointer, but the tier does, as F1 always has (High is WebGL with `highp` on a fine pointer, so a coarse tablet is Medium and takes the phone's budgets), and the retained-terrain projection sizes the terrain as `render/terrain.ts` does, pointer included. High has the desktop 64 MiB; Medium and Low have the phone's 20 MiB at boot, which is at the dock until the rig first leaves it (render-memory's boot sample), and 40 MiB in play everywhere else, the dock included once the rig has left it. The projection is the render layers (the retained terrain, the light map, 0.25 MiB of small canvases), the band pages and the sky and ridges for the rig's position, plus the planned pages. With `?tile=56` on a 393 × 851 @3 phone it holds the surface's non-hero page at @2x at boot, 19.79 MiB resident (20.69 without the guard), and the step stays for the W01 session: 30.46 MiB at W01 row 18 instead of 31.36. A coarse 1366 × 1024 @2 tablet (Medium) and a Canvas desktop at 1440 × 900 @2 (Low) are over their phone budgets even at @2x, because of their retained terrain (17.5 and 19.5 MiB): the guard holds their non-hero pages at @2x for the session (tablet 30.93 MiB at boot and 41.29 at W01 row 18; Canvas desktop 33.28 and 43.64).
  - *Phones and the 1.17× note.* F1 caps the backing scale at 2, so a DPR 3 phone renders 2 device px per CSS px: a 56 CSS px tile is 112 device px, which picks @3x (144 px per tile) at a 0.78× downscale, not D1's 1.17× upscale (which assumed a DPR 3 backing).
  - *Zones (part of T13b).* Pages are grouped by where their frames are drawn, one shared function (`scripts/campaign-zones.mjs`) for both world builds, the checks and the manifests the game reads: `core` (always resident: the rig and its tools, thrust, ore, packages, relics, sockets, tier marks, cracks, mission markers, `ui-mission`, warning shelves, surface salvage, and every frame drawn in more than one zone), `surface` (band A: sky body, lander, refuge and relay stages), `shaft` (frames drawn only in bands A and B: W01 rows 0–29, W02 rows 0–44) and `cave` (only in bands C and D: W01 rows 30–59, W02 rows 45–99). Shaft or cave is decided from where `world.ts` and the POI scenery actually place each frame, checked against generated worlds. Terrain tiles, DOM-only icons and frames nothing draws stay off the pages. Resident: W01's core always, W02's core while W02 is current or its hardware is owned, and the zones of the rig's band ±1 (surface pages and the sky and ridges with band A; the current lander stage and the next).
  - *Hero set at @4x (part of T13b).* All `rig-*` and `tool-*` (the tools are rig layers), `thrust-*`, `ore-*`, `package-*`, `relic`, `deposit-socket`, `tier-mark-hc-*`, `mission-beacon`, `site-wreck` and the lander `dock-stage-*`. Everything else stops at @3x; raster-source frames (T13a) stop at @3x too, having no @4x master.
- **Asset 40** (rig shading, A13) is P0; the rig is 21 % of the tall panel's width on the board and is the one asset the player sees at every depth.
- **Gates:** G1 stills are captured at the board's scale (C) for matching; G1 item 5 also scores one as-shipped frame per scene at the play camera (B).
- **Playtest (§9.4):** time to beacon and hazard hits per run, not worse than at today's camera. At the new D14 depth, "time to beacon" is measured on the M2 leg.

### D2 in detail

**Chosen:** (b) a 2-wide bore on dug vertical runs, plus the bore spill light; a tilted beam for the F0 shaft panel. The audit's over-carve (a) and its "visual and collision disagree" playtest row are dropped.

- **Scope as recorded:** dug vertical runs, the audit's scope for the over-carve. Horizontal tunnels are not changed by this decision.
- **T11** loses "the 0.20-tile over-carve as a field operation" and gains the 2-wide bore as a gameplay change. The session that takes T11 settles, with the director, how the bore is priced (the same time and energy per metre with a 2-wide head, or twice the material) and how the board's ledge composition is reached (the rig standing at one side of the bore, open air beside it). Its acceptance line stays: both shaft lips visible beside the rig in the down and side poses.
- **Balance:** drill time and energy per metre are rebalanced in `BALANCE_VERSIONS.md`; the pacing guardrails (step 2d, nightly) are the check. Every smoke fixture and test that assumes a 1-wide column dig is updated in the same PR.
- **T1:** the bore spill light stays (a warm pool on about 2 tiles of shaft wall above and below the rig while drilling down). The re-cut panel shows the beam tilted up the shaft, so T1 must be able to produce that pose by play (the headlamp tilts up the bore when the rig is stopped against a wall, or an equivalent T1 settles on); the F0 panel may not show a beam the game cannot make.
- **F0 re-cut target:** "a 2-tile shaft, the rig stopped against a wall, the beam tilted up the shaft as on the board." The audit's 1.4-tile text in §4.1, F0 and step 8's prompt is superseded; the board's own shaft is about 2.3 tiles.
- **§9 wall limit:** the 0.3-tile visual-versus-collision limit for walls no longer applies to the shaft, since the two agree.

### D3 in detail

- **F6** (week 1) stands: delete the nameplate, A/B only during the coach, drop " · mission part", rail on hover or pause; at most 4 text items at 60 m.
- **T8:** one annotation system with Scan; at most 1 text item with Scan off, 0 within 1.2 tiles of the rig, overlay edge share ≤ 20 %. Asset 28 (edge chevron, pulse ring, Scan glyph, leader tick) is drawn by T8.
- **T10:** the waypoint is a pulsing beacon emitter with a light shaft; an edge chevron marks off-screen targets; the distance moves into the objective pill ("Survey the wreck · 39 m ↓").
- **H1 to H4:** all four approved at this workshop, as the audit asked.
- **Always on:** HOME as an edge chevron with its distance; hazard markers for every known hazard. Everything else on Scan.
- **Playtest (§9.4):** time to first bank not worse; HOME found without Scan.

### D6 in detail

- **A1 (step 6):** the swatch cards derive bands B and D from the band-A and band-C values by the ≤ 15° hue-shift rule, holding the L\* steps; the cards for A, B and C are signed before T2's parameters freeze.
- **Assets 22, 23, 29:** shader parameters per band on the slate base; **31** (W1): band dressing carries the identity.
- **Reopen if:** the slice shows players cannot tell bands apart at the play camera. The fallback is a bolder shift (30° to 40°) on the same L\* ladder, a parameter change.

### D8 in detail

**Chosen:** violet decoration crystals, now. The audit's "keep amber and test" is not taken.
- **A1 (step 6):** sets the violet hex on the band-C card (and band D's crystal-seam accent) at the board's accent value, about L\* 67, so the cavern's value structure is unchanged; cyan stays for emitters.
- **Asset 20** (A7): "Amber crystals" becomes "Violet crystals, ADD sparkle"; the hue is a generator parameter. Its "waits on" loses the recognition test. **Asset 31** (W1) crystal seams take the same hue. **Asset 36** (amber geode centrepiece, W3) is a landmark, not decoration; whether it follows the generator's violet or stays amber is settled at W3, default violet.
- **T5:** the 3×3 placement rule stays.
- **§9.2 warm share:** the board's 3.9 % warm accents in the cavern came partly from amber crystals; rust drips, the lamp pool and the headlamp now carry the cavern's warm share, and the F0 cavern re-cut shows violet crystals so the G1 target and the check are re-based on it.
- **§9.4:** the "D8 crystals, mistaken for ore" playtest row is dropped; the three fresh reviewers at G1 (D11) can confirm recognition.

### D12 in detail

- **Asset 1** (A2): authored in the §5.6 4×3 canvas at 2.5 × 1.65 tiles, 2.3 tall with the dish; the board's lander crop is the silhouette target (IoU ≥ 0.7). **Asset 2** (stages 1 to 3, W5) builds on its layers.
- **Dock zone:** unchanged in code; the pad and the A3 base dressing (lamps, cables, crates, tools, rocks) fill the rest of the width, as on the board.

### D14 in detail

**Chosen:** (iii-a). The game draws the beacon with the `mission-beacon` object icon through `render/poi-art.ts` (1.2 × 1.6 tiles); the `site-beacon` wedge is in the atlas and never drawn. Today the beacon is the M1 proof at (spawn column, row 9.5), about 95 m, and SITE-4 ("Collapsed crew gallery") is at row 43, about 435 m, below the fused plate at rows 30 to 31 that M1's reward cuts.

- **Campaign change (one PR, Claude Code, replaces the audit's D14-code item):** the W01-BEACON POI and the survey trigger move to the SITE-4 gallery floor beside the wreck (`poi.ts`, `model.ts`, `config.ts` `beaconRow` and the "Survey the beacon at 100 m" text); M1 becomes "bank three ordinary packages" with the same 200 CR fee and reward; M2 ("Recover the lander parts") adds the wreck survey to the valve and antenna; `CAMPAIGN_W01.md`, `MISSION_POIS.md`, `missions.ts`, the coach and tracker text, and the smoke suites (`poi-smoke`, `frontier-smoke`, `campaign-smoke`, `plan-ui-smoke`) change with it. Effort is re-estimated by that session; it is more than the audit's 0.5 d.
- **Pacing:** the opening is shorter (no 95 m survey before the first construction) and the deep leg longer; the nightly pacing guardrails (step 2d) are the check, and the "time to beacon" metric of §9.4 (D1 and T10 rows) is read on the M2 leg.
- **Position:** the beacon stands on the gallery's flat floor (row 46 in `fresh-w01`, columns 15 to 18) beside the wreck, placed by the campaign PR and snapped by T6; exact cell per seed.
- **Asset 15** (A6): the tripod with the ADD diamond and pool leads, in two states (dormant until discovered, lit and pulsing as the T10 waypoint). The wall-mounted variant is no longer required for the slice, since the 95 m cell loses its beacon; it stays in the row as P1 optional. The beacon is a hero prop under D5 (underlay allowed).
- **Targets and gates:** the board's cavern panel stays as drawn, with the beacon as the waypoint; the F0 re-cut composites it on the prototype's SITE-4 render; G1's coverage count stays 21 of 21; G1 item 1 (fixtures reached by native play) now covers the cavern as the M2 objective, which the current teleported capture does not.
- **§9.4:** the "D14 (i) crew beacon, mistaken for the objective" row is dropped; there is one beacon and it is the objective.

## Standing decisions from art-programme-sequence.md (a Project doc in Claude, not in the repo)

Recorded here so they reach Claude Code sessions with the repo copy.

- **Device gate without buying a phone** (2026-11-03). Android emulator or Playwright device emulation for layout, touch and CI. Remote real devices for frame time, shader precision and memory: Samsung Remote Test Lab (Galaxy A series) for the A54 class, Firebase Test Lab or a BrowserStack trial for the Pixel 6a class, and a remote iOS device for the oldest supported iOS Safari. F1 adds an on-screen p95 frame-time readout so a remote device reports numbers without adb. This replaces the physical reference phones wherever the audit uses them: ordering one before week 1 (§1) and arranging it in F0, the G0 check, the 3-day T2 spike, G1 item 8, the second phone before G2, and the p95 frame-time gate (§7, §9.2), which is read on a remote real device instead.
- **Review loop.** Art is reviewed inside a game fixture through the T13a path, never in isolation. Hero props: three silhouette variants first, the director picks one, then two or three shading rounds. Structural checks run in CI: at least 3 shading tiers per material zone, silhouette IoU ≥ 0.7 with the board at matched scale, and no two scenery frames with IoU above 0.70.
- **Lanes.** Claude Code: every T, F, H, W, X and U item, the generator items A9 to A13, CI checks and PRs with captures. Chats in this Project: decisions, F0, A1, art sessions (one asset item per chat), gate reviews and Adobe steps. Offline (Alejandro): playtests, the three fresh reviewers for D11, and the remote device gates.

## Accepted deviations from the audit, recorded at merge

- **F1 (PR #5, merged 2026-11-06).** Every touch-screen device starts in the Medium tier (backing floor 1.5), against §7, because a High floor of 2.0 on phones broke `render-adaptive.mjs`. Provisional: revisit at the T2 spike (D4) with a remote real device, and choose the tier by GPU capability and measured frame time rather than touch. Desktops never lower resolution (High floor 2.0, as specified); CI's software renderer therefore runs the existing checks at backing 2, and F3 runs its harness section at backing 1. A device whose raises keep failing backs off and may take longer than 60 s to return to 2.0; F3 shows the back-off state in the debug readout.
- **F4 (PR #6, merged 2026-11-07).** W02 band D lit hard rock measures +9.2 over unknown against the +15 near-the-lamp target; it passes the §9.2 "≥ +5 everywhere" line. Open item for X1 (W02 retune) and assets 47 to 48; G1 is W01 only. "Unknown rock sd ≥ 7" is a §9.2 G1 gate on T2's material look, not an F4 line; the Phase 0 baseline is sd 2.8 to 4.7. F4 deleted the cream normal-blend lamp as specified; until T1 lands, the headlamp core measures L\* 15 against the ≥ 70 gate. An interim additive core (T1-lite, the first component of T1) is scheduled in Session B; if it is not taken, the G0 review scores the headlamp as "pending T1".
- **A1 (step 6, 2026-11-08), three calls made on the swatch cards:** the violet crystal is `#bd8df6` (L\* 66.9), 2.2 L\* from copper ore in greyscale, so hue, shape and the 3×3 rule tell them apart, and the high-contrast mode must give crystals a value of their own (A7 sets it); bands B and D are A turned −15° toward teal and C turned +15° toward violet at held L\*, which changes slate rock by only ΔE 1 to 3, as D6 intends, with D6's 30° to 40° fallback available; rust seams (asset 17) are drawn by the T2 terrain shader along rock joints near ceilings rather than as strips, so T2's acceptance includes band-C ceiling seams, and A7 keeps the drips as decals.
- **A12 with T9 (2026-11-09, in review).** The high-contrast variant ships as small overlay marks (`tier-mark-hc-1..4` in each world's atlas, at that world's mark centres: a light disc, L\* 95, inside a thin dark outline, with the dark glyph, on the normal mark's footprint, drawn over the ore or package when high contrast is on), not as the audit's full-size HC frames (§5.3 T9 "full-size HC variant", §5.6 row 25 "8 + 8 + 8 HC per world"). Reason: the §7 texture budget. `test:render:memory` has 0.67 MiB of headroom on desktop W02 and 0.76 MiB at phone boot; eight full-size HC ore frames add about 0.5 MiB to each W01 page set and fail desktop W02, while the eight marks trim to 16 × 16 px at @2x (24 × 25 at @3x) and grow no page. The ore and package frames themselves keep the hue-independent mark. Scan (T8) does not exist yet; it can join the same switch. Revisit with T13b's zone pages if a full-size variant is still wanted. Two smaller A12 deviations, also in review: the socket is one generic frame whose seat hugs O1 (the lowest, commonest ore), so the taller O2 to O4 rise out of it rather than sitting inside a recess "larger than every ore silhouette"; and the a04 tile-normalised gradient row, already failing, drops 1.05 → 1.02 at backing 2 (1.00 → 0.97 at backing 1) because the white rings and cream notches T9 removes were the frame's hardest small edges (docs/qa/a12-ore-sockets).

- **T13b (2026-11-09, in review).** Built as `docs/qa/t13b-asset-pipeline/` records; the rules that later items build on:
  - *Rasterizer.* resvg (`@resvg/resvg-js` 2.6.2, pinned) renders every SVG frame and page, and `scripts/png-canonical.mjs` (pako 2.1.0, pinned) writes every PNG the same way, so `npm run assets:rebuild` is byte-identical on every machine; CI's `verify` job rebuilds and fails on any difference. No browser is needed to build art.
  - *Emissive siblings.* `<frame>-emissive` (same size as its base, authored with the kit's `emissivePair`) holds only the lit parts, lit; the base draws them unlit. The game draws the sibling from the base's page with the ADD blend (Canvas `lighter`), from a pool of its own, copying the base's final position, origin, scale, flip, rotation, alpha and mask, and only while its base is drawn. Depth: 17.6 for every base below 18 (above the light map at 17 and T1-lite's ADD core at 17.5, so they share one ADD run), the base's depth + 0.05 for rig layers (18–23). T1-lite's radial core stays separate until T1. The survey beacon's lamp is the first; the convention and the draw-call budget are in `assets/campaign/kit/README.md`.
  - *Deviations from the audit's T13b row and the plan, accepted for review.* "4× masters" become re-renders from source (D5). The audit's acceptance "a DPR 3 phone with tiles > 48 CSS px loads @3x zone pages" is met with the debug `?tile=56`, because no phone has such a tile before T11. The scene waits only for the core pages and the zones of the rig's own band, not every required page, so crossing into a new band never pauses play while a neighbour page loads; after a jump (another world, or more than 8 rows from the last drawn frame: an import, travel, a respawn) it also waits for the zones of the bands surely on screen, so nothing in view pops in, while a zone that may be off screen still streams. Each lander stage has pages of its own at every density, and the next stage is prefetched. The Low tier (Canvas) takes the phone's budget for the guard, as its tier says. The packer keeps an `-emissive` sibling on its base's page even when a group spills onto a second page. On the beacon only the lamp lights up; the orange pennant is a painted flag. One art change rides along: the rig's track edge moved from 99.5 to 100 units so the tread meets the floor at every density.

## Pending

| # | Decision | When | Audit recommendation (§8) |
|---|---|---|---|
| D4 | Renderer route | Before the T2 spike (week 2) | WebGL shader as the primary renderer with a lower-quality Canvas fallback; information parity instead of Canvas pixel parity |
| D7 | Generator version 3 | Before Phase 2 | Approve for Phase 2, after F9 and with the version checks replaced (W2) |
| D13 | W02 target | Before Phase 3 | Approve three W02 panels (surface, 180 m, deep cavern) before any W02 art; under D5 they are SVG overlays on prototype renders |
| D10 | Impact kicks | At G1 | On by default at 1.5 px or less, shake stays off, off in reduced motion, after accessibility sign-off |
| D11 | Sign-off panel | At G1 | The director plus three reviewers who have not seen the work |
| D9 | Withdrawn | | Keep the board's crescent as drawn |

## Open details for the sessions named

Not decisions; settled by the session that takes the item, with the director.

- **T11 (D2):** bore pricing (per-metre cost with a 2-wide head, or double) and how the ledge composition is reached.
- **T1 (D2):** how the tilted beam is produced by play.
- **W3 (D8):** the geode's hue.
- **Campaign PR (D14):** the beacon's floor cell per seed; M1's new name and coach text.
- **A7 (A1 call):** the high-contrast value for violet crystals, distinct from copper ore in greyscale.
- **T2 (A1 call):** the rust-seam inclusion along band-C ceiling joints, as a shader parameter.
