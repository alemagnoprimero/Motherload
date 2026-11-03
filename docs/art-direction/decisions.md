# The Deep Frontier: decisions

Owner decisions for the art programme. The options and the audit's recommendations are in `docs/ART_QUALITY_AUDIT.md` §8; this file records what the director chose. Each entry gives the option chosen, the date and a one-line rationale. Step 4 (the week-1 workshop) adds D1, D2, D3, D6, D8, D12 and D14. Step 7 commits this file as `docs/art-direction/decisions.md`, so it travels to Claude Code sessions with the repo.

## Decided

| # | Decision | Option chosen | Date | Rationale |
|---|---|---|---|---|
| D5 | Art sourcing and budget | No commissioned artist. Alejandro is the art-direction owner; Claude executes all art and code. Every asset is hand-written SVG, a seeded generator or shader parameters; pipeline C (painted raster) is dropped. Generated images may serve as silhouette underlays for the three hero props, with a provenance record per asset. | 2026-11-03 | The director chose to direct the art himself with Claude as the only executor, so no painter is on the team; SVG, generator code and shader parameters also match the board's "Vector" target and rebuild byte-identically. The underlay rule follows the audit's recommendation (§6.3, D5), limited to the hero props. |

### D5 in detail

**What it replaces.** The audit recommended one commissioned artist for 95 to 107 days, with a named art-direction owner.

**Roles.**
- Art director: Alejandro. Reviews every iteration, picks variants, scores panels at the gates.
- Executor of all art and code: Claude. No Krita or other painting tool.

**Pipelines.**
- B (hand-written layered SVG), A (existing generators) and P (seeded procedural) only.
- Assets 16 to 21 and 38 become seeded generators. Materials 22, 23 and 29 are shader parameters, with Canvas and Medium-tier pages baked from the same shader code.
- The mapping for every §5.6 row is in `asset-tracker.md`.

**Generated underlays: yes, with a provenance record per asset** (decided in step 2, 2026-11-03).
- Scope: the silhouettes of the three hero props only: the lander (assets 1 and 2), the wreck (14) and the beacon (15, including the wall-mounted variant).
- An underlay is a reference. The asset is redrawn by hand as clean layered SVG; no underlay pixels and no auto-traced paths ship. Board pixels are never copied into any asset.
- The board stays the silhouette target: alpha IoU ≥ 0.7 with the board's silhouette at matched scale, whatever an underlay shows.
- Provenance: one record per asset at `assets/campaign/source/provenance/<asset>.json` (audit §6.2: source, reference used, reviewer, with "hand-painted share" read as "redrawn share"), plus for each underlay the tool, the prompt, the date and the image's SHA-256. Underlay images are not committed under `assets/`.
- Tools: the Adobe connector offers no image generation in this environment (only generative expand). Figma (`generate_image`) and Canva (`generate-image`) are connected to this account and not yet tried.

**Effects on the audit's plan.**
- §6.1 "Medium": "vector" is taken literally, so assets 16 to 21 and 38 leave pipeline C, and so does every other row of §5.6 whose Pipe column includes C (10, 14, 22, 23, 29 to 31, 36 and 44 to 48). A7, A8 and A14 are re-estimated in `asset-tracker.md`: 5 to 6.5 executor-days plus a 1-day shared generator kit, against 8.5 to 9.5 artist-days painted.
- §5.6 conventions: there are no 4× raster masters. Every density, including the @4x desktop pages under D1, is a re-render from source. The size note is redone in `asset-tracker.md`.
- §6.2: the "Organic dressing, back walls, iron shelf" row (Krita or Photoshop, `.kra` or `.psd` masters) no longer applies. The provenance row stands.
- §5.7 and §1 "What it costs": artist-days become executor-days in this Project's chats and in Claude Code sessions. The director's review time (about two or three sessions a week, roughly an hour each, during the slice) sets the pace of the art track.
- D13 and F0: panels described as "painted over prototype renders" are composited as SVG overlays on those renders instead.

## Standing decisions from art-programme-sequence.md

Recorded here so they reach Claude Code sessions with the repo copy.

- **Device gate without buying a phone** (2026-11-03). Android emulator or Playwright device emulation for layout, touch and CI. Remote real devices for frame time, shader precision and memory: Samsung Remote Test Lab (Galaxy A series) for the A54 class, Firebase Test Lab or a BrowserStack trial for the Pixel 6a class, and a remote iOS device for the oldest supported iOS Safari. F1 adds an on-screen p95 frame-time readout so a remote device reports numbers without adb. This replaces the physical reference phones wherever the audit uses them: ordering one before week 1 (§1) and arranging it in F0, the G0 check, the 3-day T2 spike, G1 item 8, the second phone before G2, and the p95 frame-time gate (§7, §9.2), which is read on a remote real device instead.
- **Review loop.** Art is reviewed inside a game fixture through the T13a path, never in isolation. Hero props: three silhouette variants first, the director picks one, then two or three shading rounds. Structural checks run in CI: at least 3 shading tiers per material zone, silhouette IoU ≥ 0.7 with the board at matched scale, and no two scenery frames with IoU above 0.70.
- **Lanes.** Claude Code: every T, F, H, W, X and U item, the generator items A9 to A13, CI checks and PRs with captures. Chats in this Project: decisions, F0, A1, art sessions (one asset item per chat), gate reviews and Adobe steps. Offline (Alejandro): playtests, the three fresh reviewers for D11, and the remote device gates.

## Pending

| # | Decision | When | Audit recommendation (§8) |
|---|---|---|---|
| D1 | Camera framing | Week-1 workshop (step 4) | Option B for play, with the board's scale (option C) as the cave-framing zoom in known chambers at least 5 rows tall; rig (asset 40) moves to P0, with @4x desktop pages for rig, ore and hero props |
| D2 | Shaft composition | Week-1 workshop | (a) a render-only 0.20-tile over-carve per side into known solid, plus the bore spill light; not a 2-wide bore |
| D3 | Overlay policy | Week-1 workshop | Labels on demand with Scan; HOME stays an always-on edge chevron; hazards stay always on |
| D6 | Band identity | Week-1 workshop | A slate base with band accents (rust, crystals) |
| D8 | Crystal colour | Week-1 workshop | Keep amber, place crystals only where no known deposit is in the 3×3 neighbourhood, and run a 5-player recognition test before A7's crystals are made; if players confuse them with ore, pick a hue that no ore uses |
| D12 | Lander scale | Week-1 workshop | Match the board, about 2.5×1.65 tiles; keep the dock interaction zone unchanged |
| D14 | Beacon at the wreck | Week-1 workshop | (i) a dormant crew beacon in the SITE-4 set piece, lit on discovery and never a waypoint; otherwise (ii) drop it from the target and make the wall-mounted variant for the 95 m beacon |
| D4 | Renderer route | Before the T2 spike (week 2) | WebGL shader as the primary renderer with a lower-quality Canvas fallback; information parity instead of Canvas pixel parity |
| D7 | Generator version 3 | Before Phase 2 | Approve for Phase 2, after F9 and with the version checks replaced (W2) |
| D13 | W02 target | Before Phase 3 | Approve three W02 panels (surface, 180 m, deep cavern) before any W02 art; under D5 they are SVG overlays on prototype renders |
| D10 | Impact kicks | At G1 | On by default at 1.5 px or less, shake stays off, off in reduced motion, after accessibility sign-off |
| D11 | Sign-off panel | At G1 | The director plus three reviewers who have not seen the work |
| D9 | Withdrawn | | Keep the board's crescent as drawn |
