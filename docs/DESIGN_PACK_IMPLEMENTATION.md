# Design pack v0.1 — implementation strategy and review plan

Date: 2026-11-01. Status: **approved; W01 and the W02 expansion implemented; Phase 2 awaits W03**. The user subsequently requested removal of the alternate prototype mode; this plan now describes a single campaign application.

The subsequently authorized [improvement plan](IMPROVEMENT_PLAN.md) prioritizes the existing W01/W02 experience and shared content tools before W03. Its Phase 0–3 numbering describes that improvement program, separately from the campaign phases below. See [current implementation progress](IMPROVEMENT_PROGRESS.md).

This plan maps the supplied campaign and visual design onto the Phaser/TypeScript baseline at checkpoint `a03079b`. The user approved beginning implementation after reviewing this document. Current first-slice behavior and remaining work are recorded in [CAMPAIGN_W01.md](CAMPAIGN_W01.md).

## Direction agreed for this plan

- Implement the supplied five-era campaign: fifteen destinations, ten destinations per main route, five independent branch choices and 32 main routes.
- Adopt the pack's persistent HUD for conditions, the current objective and equipped tools. Keep settings, inventory management and expanded history in the pause/dock interfaces. Building transactions remain inside the game.
- Follow the pack's topology: W01–W06 may wrap when their seams are navigable; W07–W15 have visible boundaries and their specified fragment, chamber or layer layouts. Horizontal boundaries do not regenerate ore.
- Use the pack's crisp illustrated 2D art direction, flat side view and compact modular rig. The concept boards guide production drawings; they are not sprite atlases.
- Preserve permanent progression without a compulsory reset. Combat progression, a global ore-price market and required offline income remain outside this version's design.
- Publish one campaign application. Keep its checkpoint namespace stable, and leave retired browser save bytes untouched without selecting, converting or deleting them.
- Keep Phaser, TypeScript, static browser hosting, Docker and GitHub Pages. Node.js remains build/asset/test tooling; this design does not require an account or a game server.

The HUD and boundary choices above were explicitly confirmed during this planning review and supersede the earlier campaign preferences for pause-only conditions and universal wrapping.

## Sources and verified scope

Inputs are `motherload-progression-and-art-bible.pdf` (51 pages), its matching HTML, `motherload-balance-v01.json`, `motherload-asset-manifest.json`, the two concept boards and their provenance prompts. The separately uploaded PDF, HTML, balance JSON and manifest match the ZIP copies byte for byte.

The destination sheets and balance records define the intended v0.1 design. Their stated production rules take precedence over incidental detail in the generated illustrations. Ambiguities below are proposed implementation decisions, not claims that the source already specifies them.

Independent checks reproduced:

| Design quantity | Verified result |
| --- | --- |
| Main routes | 32 distinct routes, ten worlds each, valid ANY-parent gates |
| Reference duration | 960 minutes; W04 completion at 255 minutes |
| Reference spending per main route | 80,083,950 CR, excluding service costs |
| Permanent hardware | 45 purchases across nine ranks; 24,942,750 CR in total |
| Local technology | 45 nodes overall; 30 on a main route |
| Ordinary resources / relics / principal mission objects | 60 / 15 / 15 |
| Manifest | 251 design briefs, with many states and exports per brief |
| Full map storage scope | 262,400 cells across all fifteen maps and layers, before discovery/entities |

The arithmetic is verified. Campaign length, earnings, movement feel, difficulty, branch parity and device performance remain **targets to measure**, not implemented or demonstrated results.

## Strategy: reusable campaign systems, delivered in playable slices

Build one complete destination before expanding the campaign. Complete both alternatives at each branch before declaring that branch finished. Develop mechanics, final-scale artwork, sound and mobile controls together so an attractive screen and a working simulation do not diverge.

Use the collision substeps, committed-cut behavior, discovery rules and save-failure experience as references. The campaign owns its state model and rules. Keep abstractions tied to concrete requirements and protect implemented behavior with campaign regressions.

### Proposed system boundaries

| Boundary | Responsibilities |
| --- | --- |
| Versioned definitions | World geometry/topology, hardware, local gear, materials, resource tags, objective predicates, hazard parameters, construction and route gates |
| Campaign state | Credits, component ranks, ownership/loadout, certificates, milestone progress, current destination and persistent completion |
| World instance | Seed, terrain/discovery chunks, deposits, exposed packages, mission sources, structures, supports, relays, hazards and later layers/pockets |
| Simulation | Fixed/bounded time steps, movement, cutting, environmental forces, tool activation, collision and package handling |
| Transactions/events | Purchases, processing, banking, sale, construction, recovery, travel and idempotent objective rewards |
| Presentation | World renderer, modular rig, persistent HUD, docks/shops, map, input prompts, sound and accessibility |
| Persistence | Transactional campaign/world records, revisions, backups, export/import and protected failures |

Suggested new modules live under `src/campaign/`, with `config`, `simulation`, `inventory`, `objectives`, `worlds`, `persistence` and `presentation` boundaries. Exact filenames follow implementation needs; these are ownership boundaries rather than a requirement for a large framework.

### Normalize the supplied data before using it at runtime

The JSON is a reference dataset. Many effects, hazards, gates and goals are English sentences; blueprint unlock rules also appear in the bible. Create typed records with explicit parameters and registered handlers. Keep descriptions for display, but never execute formula strings or infer gameplay by parsing their prose.

Maintain stable IDs and a traceable mapping back to each source record. Check all references, prerequisites, slots, prices, world IDs and manifest links. Derive or cross-check repeated budget totals so a price change cannot silently leave stale route tables. Record balance and generator versions separately from the save schema version.

### Establish durable economic and entity contracts early

- Store credits as integer tenths of a CR. Define rounding and transaction charge timing once; use the same rules in shops, processing, services, saves and telemetry.
- Replace slot-only cargo with identified packages that retain origin, balance version, value, bulk, mass and tags. Apply qualified processing once and retain its identity, preventing repeated compaction or sale amplification through ejection/recollection.
- Track a deposit/package lifecycle independently of terrain: unextracted, exposed, carried, safely banked, sold or lost. One authoritative location/owner prevents duplication through portals, storage, recovery, time changes and layers.
- Keep ordinary stored cargo distinct from credits. W11's relay banks without selling. Mission objects have a protected compartment and separate banked/unbanked progress.
- A full hold leaves a recoverable exposed package. Provide readable bulk requirements and an explicit eject choice; capacity must not silently discard mined packages.
- Separate objective counters, banked proof, construction payments and certificate grants. Apply rewards/payments once even if a button repeats or saving is interrupted.
- Keep ownership prerequisites separate from equipped slots: one drill, one mobility, one processor and two utilities; integrated/mission equipment follows the pack's exceptions.

### Save and world handling

Use the versioned campaign store backed by IndexedDB transactions. Retired browser save keys are not read, converted or deleted; there is no alternate runtime or decoder.

Persist campaign metadata and changed world chunks atomically where a transaction crosses boundaries. Include cargo/mission ownership, depletion identity, construction, purchased-price versions, current-world condition and persistent support/relay/layer changes. Use explicit revisions and conflict protection across tabs, validated backups, bounded imports and clear quota/error recovery. Measure campaign export sizes before expanding limits.

Only the active world simulates. Pause, backgrounding and travel freeze hazard/tool timers; inactive worlds do not advance using wall-clock time. Load visited worlds from their saved instances without regenerating them when balance changes. Choose and test per-world exploration origins/arrival padding so every listed terminal objective is actually in bounds; only W04 includes five arrival rows inside its specified 600 rows.

### Generation and movement

Place mission rooms, required objects, safe observation points, retreats and necessary fixtures before caves and hazards. Then generate ordinary veins and validate the completed layout. Keep the pack's 12% anchor rate as a starting parameter; enforce its ordinary-value and entry-income safeguards after carving instead of treating density as proof of solvency.

Validate a world against its intended entry capabilities and mandatory tool sequence, including the ability to earn R1 and return safely. A geometric path alone is insufficient if unavoidable damage, energy use or a circular equipment gate makes the route unusable.

One campaign motion system handles gravity, mass, current, wind, bracing, tethers and later fields through bounded forces. Camera and inputs remain screen-relative. Retain responsive acknowledgement and reliable supported drilling while measuring the pack's different speed/capacity values. Collision is independent of sprite artwork.

## Delivery phases and review gates

Each playable phase produces runnable source, a repeatable seed/save, focused tests, desktop/phone captures, notes, a Git checkpoint and a browser preview. Publish progress only after its gate passes. Later destinations may be shown as locked silhouettes without presenting unfinished mechanics as playable content.

| Phase | Delivered scope | Exit gate |
| --- | --- | --- |
| 0 — contracts and art proof | Pin source data; build typed definitions/validation; define campaign save, package and action contracts. Produce one W01 scene at gameplay scale with rig, cutting, ore, a hazard cue, dock, HUD and shop preview. | Route/data checks agree with the pack; no silent defaults for missing effects; desktop/phone art is readable; confirm the small set of rule clarifications below. |
| 1 — complete W01 | Campaign entry/save/load, bulk cargo and exposed packages, basic bank/trade/service, rank 0–1 hardware, all three local tools, brittle shelves, three objectives/payments, visible construction and restored-lander departure. | Two novice opening trips fund a useful purchase with service reserve, including one minor impact. Complete M1–M3, recover and reload without losing or duplicating progress. Unrelated browser save bytes remain intact. |
| 2 — complete Frontier slice | W02 and W03, rank 2 hardware, travel/returns and persistent ownership. W02 adds ice/volatile extraction, preservation and energy recovery. W03 adds scanning, collapse, supports and the winch. | Both branches independently open W04. Each tool has a visible next-trip effect. At least 100 seeds per world pass reachability and economic checks. Review the first complete campaign choice. |
| 3 — planetary engineering | Regenerated W04 campaign mine and ranks 3–4, relays/prepared-shaft transit, then W05 pressure/buoyancy/currents and W06 heat/storage/bursts. | W04's infrastructure reduces measured return effort. Both planetary branches support safe entry and reach the stellar choices. Playtest the intended first 4–5 hours; do not claim parity after implementing only one branch. |
| 4 — stellar industry | W07 reef flight/wind/lightning capture, W09 dense extraction/bracing, then W08 containment and flare cycles; ranks 5–6. | Both paths reach W08. Hazards teach a cue/refuge/retreat; pause freezes them. Captured/recovered energy cannot recursively generate more energy. |
| 5 — spatial routes | W10 tidal fragments/drifting packages, W12 resonance, then W11 chamber portals and remote banking; ranks 7–8. | Every portal route retains a return or recovery path. Packages transfer exactly once. Resonance and map boundaries stay readable without rotating controls. |
| 6 — dimensional finale | W13 linked layers, W14 bounded time pockets, then W15 causal cutting, approved construction, final assembly and custom claims; rank 9. | All 32 routes reach the ending. W15 stationary fixtures support either previous branch. Invalid shifts/builds cost nothing; temporal operations never restore sold ore. Custom modifier combinations pass reachability checks. |
| 7 — campaign tuning and release | Full-run telemetry/playtests, branch comparisons, complete art/audio/accessibility pass and physical Android performance work. Refine each earlier phase continuously rather than postponing all polish here. | Evidence supports the campaign pacing, readability and performance targets below; remaining limitations are recorded with the release checkpoint. |

The first implementation batch after plan approval is **Phase 0 followed by W01**. W02/W03 are the first expansion after that foundation proves itself. We should not produce all fifteen worlds or all 251 briefs before the W01 look and loop work together.

## Artwork and interface production

### Produce a small proof before scaling

The W01 proof must show the cabin/body and deployed drill, main terrain edges/interiors, all four ordinary mineral silhouettes, an exposed package, a mission object, a brittle-shelf warning, a dock, HUD and a shop comparison. Capture it on desktop, portrait and short landscape at actual gameplay size. Check clean alpha, readable collision edges, grayscale item/hazard distinction, 24 px icons, and stable tread/drill alignment through animation.

W01's full production subset covers 29 manifest briefs; the complete W01–W03 slice covers 70, before animation/state expansion. The full manifest contains 251 briefs, not 251 image files: hardware/equipment/mineral icons alone require 300 exports at 64/128 px, and the 45 structures need 135 state illustrations. Terrain, backgrounds, sound, sample variants and transitions add further outputs.

### Campaign asset contract

- Use editable layered 2D sources and original production art. Node exports, checks and packs the results. Blender may help block out shapes, but the illustrated campaign style remains the production target.
- Use 48 px logical tiles, 96 px terrain authoring, a nominal 22 × 14-cell desktop view, a 42 × 36 px rig body and separate 0.78 × 0.72-cell collision. Show fewer cells on small screens instead of shrinking labels. Limit the drill extension to the specified 12 px.
- Define cabin pivots, mount points, tread baseline, attachment anchors and layer ordering. Composite independently ranked hardware and equipped modules; avoid generating a full rig for every possible loadout combination.
- Supply the pack's idle/drive/drill/thrust/dock animation timing and tool anticipation/active/recovery states. Damage overlays remain functional rather than recoloring the whole rig.
- Separate terrain, deposits, exposed cargo, cut cracks and collision data. Provide the specified 16-edge terrain masks, eight main interiors, secondary-material variants and three cut states. Retain wall-occluded discovery.
- Keep large world terrain/background/structure/VFX pages scoped to the destination. Keep required UI/item icons available across travel and load installed modules by equipped IDs, including tools from another world.
- Enforce atlas pages no larger than 2048 × 2048 with edge/alpha checks. One decoded RGBA page can use 16 MiB; measure decoded texture memory as well as download size. Render visible terrain chunks only.
- Use world palettes, three subdued parallax planes and restrained effects. Start with the pack's limit of 150 visible particles and one local screen effect; scale down when device measurements require it.

### HUD, controls and accessibility

Implement the approved HUD: energy/hull at the upper left; depth/route distance, cargo and haul value at the upper right; current objective/reward and active tool/utility cooldowns in compact safe areas. Adapt the composition for phones without covering the return route. Larger story text stays at docks; settings and expanded records stay in pause.

Introduce named actions shared by keyboard, controller and touch: movement/cutting, interact, mobility, two utilities, contextual hold modes, map and pause. Use action-aware prompts rather than hardcoded keys, and acknowledge standard input within 100 ms. Keep remapping, hold/toggle preferences, reduced motion, high-contrast outlines and separate audio layers in the shared interface work. Deliver keyboard/touch with each new active mechanic; validate controller/remapping before treating the input framework as complete.

Target 14–16 CSS px body text, supporting text at least 12 px and touch targets at least 44 × 44 CSS px. Preserve visible hazard cues with sound/effects disabled; reduced motion must not change mechanical timing. Pause every relevant timer in menus.

## Economy changes to make deliberately

| Rule | Retired prototype (historical comparison) | Campaign v0.1 |
| --- | --- | --- |
| First hardware tier | Shared 750-credit price | Drill 750; energy 650; cargo 700; hull 450; engine 500 CR |
| First-tier capability | Drill 2.8; energy 15; 15 slots; hull 17; power 160 | Drill 2.8; energy 16; 12 bulk; hull 18; power 185 |
| Cargo | One mineral per slot; excess discarded | Origin-specific bulk/mass; excess left as a recoverable package |
| Capacity purchases | Tank/hull capacity increases without filling | New tank/hull capacity fills on purchase |
| Accounting | Whole-credit service rounding | 0.1 CR transaction precision |
| Recovery | Cargo lost and 20% cash lost | Ordinary cargo/relic loss; bounded spend-based fee; unbanked missions return safely; emergency salvage prevents a permanent dead end |
| Progression | Mineral/depth/equipment loop | Same mining loop plus banked objectives, useful construction, certificates and travel |

Preserve the proposed prices initially so measurements have a defined baseline. Keep all normal seed-solvency checks independent of relics, processor bonuses and mission value. The 5% service allowance in the rate model is an assumption to test, not a tax to implement.

## Proposed clarifications to confirm during review

These resolve incomplete details in the source; they are not additional campaign features.

1. **Opening services:** provide basic banking, trading and partial service at the starting lander. W01 M1 improves the service/refuge infrastructure, rather than locking the ability needed to bank its own objective.
2. **First purchase target:** preserve the two marked 380/480 CR seams. Starting cash plus both hauls totals 880 CR before costs; after M1's 200 CR payment, at most 680 CR remains before service. Test an affordable useful hull/engine/energy purchase and a reserve; do not promise the old 750-credit drill after those two trips.
3. **Credit/processing rules:** use integer tenths, an explicit deterministic rounding policy, charge only for accepted processing, and persist processing provenance. Test eject/recollect, partial-service and interrupted-write boundaries.
4. **Recovery spending:** interpret cumulative equipment spending as actual hardware plus local-gear purchases, excluding services and construction. Use the pack's capped fee and zero-debt rule.
5. **Banking:** keep stored ordinary packages in a destination warehouse ledger with explicit sale/retrieval at docks. Remote banking moves package ownership without creating credits. Reset per-expedition quotas/charges on a real dock return, without granting duplicate deposits or mission progress.
6. **Specialist inputs:** preserve committed cuts while defining W02's post-completion release/preservation window. Define W06 R2's usable heat-spend behavior before R3 exists, so M2 can be completed without circular unlocking. Record the exact pocket-cycle timing for W14 before that phase.
7. **Coordinates:** define arrival padding, exploration rows and terminal-object placement per world; a single surface/depth formula cannot describe all maps.

## Validation and tuning gates

- **Data and progression:** enumerate all 32 routes, validate source/manifest references and blueprint chains, and verify that optional branches/tools are never required by the next mandatory gate. W15 must work after either W13 or W14.
- **Generation:** test at least 100 seeds per implemented world. Mission routes survive carving; ordinary reachable value is at least three times the local reference spend, with the pack's entry/M1–M2/M3 distribution. Baseline entry equipment can obtain R1 income and return. Include hazards/energy constraints in input-driven checks, beyond structural path checks.
- **Tools and economy:** verify every implemented multiplier, tag, range, cooldown, slot, charge and rounding rule, including use on older worlds. Include a novice two-trip opening with one minor impact and service reserve.
- **Persistence:** exercise travel, reload, imports, full holds, exposed/ejected/warehouse packages, construction, protected mission objects, concurrent tabs, quota failures and interrupted writes. Keep campaign checkpoints stable and unrelated browser data untouched.
- **Spatial/temporal safety:** test one-owner package identity, permanent depletion, free invalid shifts, bounded construction, portal return guarantees and safe mission restoration.
- **Presentation:** test real atlas loading, actual pixels/animation anchors, grayscale identification, fonts, touch targets, reduced motion and hazards without sound. Use desktop plus portrait/short-landscape browser checks for each playable slice.
- **Performance:** target 60 fps desktop and a measured 30 fps floor on a selected physical Android device, including large cargo, many supports and two-layer terrain. Browser emulation verifies layout/input but cannot establish that device result.
- **Telemetry:** collect local playtest summaries for ordinary net CR/min, packages/min, bulk use, service/recovery costs, travel/shop/paused time, purchases, skipped gear and time between meaningful gains. Keep jackpots separate. Do not add external analytics transmission as part of this plan.
- **Human pacing:** compare novice, cautious-explorer and optimizer runs. Aim for a 14–18 hour median main campaign and 4–5 hours through W04; investigate paired-branch duration differences above 20%. Permit mastery to shorten play. Do not enforce duration with timers or tedious ordinary cuts.

The proposed 2–4 minute early expeditions are an explicit risk to measure: at stock rates, ten energy units provide about 32 seconds of continuous underground cutting or 53 seconds of single-axis underground movement. Starting energy is six. Separate active expedition, dock/shop and paused time before judging this target, then tune with input-driven runs rather than assuming the price tables establish duration.

Run focused checks during implementation and the complete relevant regression at slice boundaries. For releases, verify the production bundle, Docker service and deployed Pages build against the same checkpoint. No campaign-duration claim is earned by route arithmetic alone.

## Review outcome requested

Review the phased strategy, the first W01 milestone and the proposed clarification rules. Once agreed, implementation starts with the versioned campaign contracts and the W01 art/gameplay proof, then completes W01 before expanding to both first-branch destinations. Schedule estimates should follow this measured slice and an agreed art-quality bar; assigning dates to the entire fifteen-world production now would imply precision we do not have.
