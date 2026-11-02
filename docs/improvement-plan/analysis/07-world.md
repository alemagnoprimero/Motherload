# 07 · World design, content variety and exploration rewards

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Auditor key: `world`. Scope: generation, content by depth, caves, hazards, points of interest, relics and discoveries, reasons to explore, return-visit hooks and the content roadmap. Visual treatment of bands belongs to the graphics review (GFX); economy numbers belong to the progression review (PROG). This report specifies themes and mechanics and cross-references those reports.

All scripts, data and images live under `work/world/`, written below as `work/world/...`. Nothing in `<repo>` was modified.

---

## 1. Assessment

**The worlds are clean, safe and fair, but nearly empty of things to find.** Both playable worlds come from one generator skeleton: a six-column protected corridor under the spawn, small elliptical caves stamped in two side lanes on a fixed row rhythm, 12% hard rock dithered evenly, ore veins, and a 0-2 relic roll. Missions and hazards sit at the same coordinates on every seed.

**What a player meets, by depth.** A player who follows the objective locator digs straight down the corridor and sees only that corridor.

- Over 200 seeds, a 600 m W01 descent discovers 186 cells (7.8% of the world).
- It sees no caves, no hazards and no hard rock below 50 m, and a relic on only 4.5% of seeds.
- Only 4 of the 11 50-m bands below the surface contain anything new, and those four are exactly the mission landmarks.
- W02 is the same: 4 of 19 bands.
- Even a systematic explorer who digs a ±10-cell side tunnel every 50 m finds something new in only 5-6 bands.

If every cell is revealed, W01 runs out of new content types at 150 m and W02 at 500 m. After that, depth adds only longer cut times (`model.ts:479`). PROG-F2 also shows that W01 value per cell falls with depth.

**Answers to the brief's questions**

| Question | Answer (evidence in §4-§5) |
|---|---|
| Does digging deeper reveal new things often enough? | No. W01: last new non-mission content type at 100-150 m. W02: at 450-500 m. Mission route: new content in 4/11 and 4/19 bands (F1, F2). |
| Is each world varied by depth, visually and mechanically? | No. Rock share is 8.6-10.3% in every 100 m band. There is one background colour, no strata, and ore type does not depend on depth in W01 (F2; GFX-F7). |
| Are caves and hazards interesting or just obstacles? | Neither. Caves are 2-3-row empty slots (median 9 cells) that touch less ore than average. Hazards are 3-4 fixed pockets away from the route, and a shelf has no tell before it cracks (F3, F4). |
| Are relics and jackpots meaningful? | No. A relic is missing in 27-28% of worlds and is placed at random. It is seen on the mission route in 4.5-6% of seeds, has no identity, and its discovery message is filtered out (F5). |
| Reasons to explore sideways? | Few. Ore density is flat at about 0.18 deposits per solid cell from 2 to 19 columns out. There is no hint of hidden caves, no map and no landmark (F1, F9, F10). |
| Is W01 (40×60) the right size for 45 minutes? | The size is fine; the content is not. The map holds 3.55× its value budget, and completionists see 19-29% of it. Add content, not cells (F12). |
| How do W01 and W02 differ in play? | Gravity, depth-gated rare ores and the volatile window. The skeleton, the empty first 100 m and the corridor experience are the same (F7). |
| Return-visit hooks? | None. Guidance switches off after departure, nothing new appears, and later tools have no effect on earlier worlds (F8). |
| W03 next, or deepen W01/W02 first? | Deepen first, with a reusable content kit (bands, set pieces, per-seed hazards, discoverables, metrics). Then build W03 on that kit. W03 is a parallel branch; it is not on the path to W04 (F13; P2). |

**The fix is cheap relative to its effect.** A prototype of the proposed layout (§4.8) kept the pinned mission depths, the exact 60/30/9/1 ore counts and the value floor, and passed all validity checks on 200/200 seeds. It raised new-content bands on the mission route from 4.2 to 7.3 of 11. It raised relic sightings on the route from 4.5% to 71%, and the median largest cave from 17 to 42 cells.

---

## 2. Strengths (keep these)

- **Deterministic, validated generation.** Seeded generation is reproduced exactly per seed. It is checked by 100-seed tests for budgets, mission cells, unique package locations and route existence (`tests/campaign-world.audit.ts`, `tests/campaign-frontier-world.audit.ts`). Every proposal below keeps that discipline.
- **Mission-first ordering.** Mission cells are placed before caves and ore, so objectives are never carved away (`world.ts:28-55`, `:275-295`). This is the right foundation for set-piece rooms.
- **Persistent excavation and discovery per world** (`types.ts:44-46`; `CAMPAIGN_W02.md` "Returning never regenerates a visited world"). It is the right base for return-visit content.
- **Wall-occluded discovery** with honest line of sight (`model.ts:299-348`), plus the rule that the mission radio never reveals terrain (`poi.ts:98`, `MISSION_POIS.md`). Exploration has genuine mystery to build on.
- **Depth-gated rarity in W02** (`world.ts:386-392`). It is the one place where depth already changes content. W01 should adopt the same idea (PROG-P1).
- **Budget safeguards.** The post-carving value floor and starter seams (`world.ts:148-161`, `:355-364`) mean new content can be added without risking a dead economy.
- **Wreck landmarks and the bearing/range locator** (`poi.ts`, `MISSION_POIS.md`). The interaction pattern is good and can be reused for relics, sites and waypoints.
- **Strong, original design briefs.** The pack's world briefs are evocative and original: "large quiet cavities and rectangular salvage", "smooth melt channels and round trapped bubbles" (balance JSON :222, :403). The game simply does not realise them yet.

---

## 3. Method and artefacts

| Method | Script | Output |
|---|---|---|
| Generation statistics, 200 seeds per world: composition, caves (4-connected air components with wrap), ore per band, first appearance per ore type, cave/ore adjacency, relics, corridor contents, lateral profile, shelf geometry | `work/world/worldgen.audit.ts` | `out/generation.json` |
| Walks using the game's real `Campaign.refreshVisibility()`: (a) **shaft**, a straight descent of the mission column (W01 col 20, W02 col 24); (b) **comb**, the shaft plus a ±10-cell side tunnel every 50 m. Counts what is first seen per 50 m band, new content types, notable encounters, ore gaps and droughts. | `work/world/worldgen.audit.ts` | `out/walks.json` |
| Full-reveal novelty: content types first present per 50 m band if every cell were known | `work/world/worldgen.audit.ts` | `out/novelty-full-reveal.json` |
| Cave lanes by column, row rhythm, hidden air near the mission shaft | `work/world/supplement.audit.ts` | `out/supplement.json` |
| Relic presence and sighting rate (shaft and comb, real visibility) | `work/world/relic/relic-seen.audit.ts` | `out/relic-seen.json` |
| Annotated maps of sample seeds, and air-frequency heatmaps over 200 seeds | `work/world/dump.audit.ts`, `work/world/render_maps.py` | `maps/map-W01-seed73021.png`, `maps/map-W02-seed73021.png`, `maps/heat-air-W01-200seeds.png`, `maps/heat-air-W02-200seeds.png` |
| Prototype layout (bands, per-seed chambers, route-adjacent set pieces, per-seed shelves, one relic), compared on the same metrics | `work/world/world-variant-content.ts`, `work/world/variant.audit.ts`, `work/world/render_variant.py` | `out/variant-compare.json`, `maps/proto-W01-seed73021.png`, `maps/proto-W01-seed11.png` |
| Browser captures (Vite on port 5197, frozen clock, checkpoint fixtures): hidden cave beside the shaft, shelf before and during warning, relic in wall and pickup, W02 vent and cold pocket | `work/world/world-capture.mjs` | `shots/*.png`, `shots/world-capture-results.json` |

Run the vitest files with `cd <repo> && npx vitest run --dir <dir>`. Seeds are 1..200, and new campaigns use a random 32-bit seed (`main.ts:122`). "Notable" means a cave, relic, hazard, mission landmark, set piece, log, special material, or ore of tier 3-4. "New content type" is the first occurrence in that run of a material, ore type, cave, hazard kind, relic, landmark kind or set-piece kind.

---

## 4. Measurements

### 4.1 Composition and caves (200 seeds)

| Metric | W01 Broken asteroid | W02 Ice comet |
|---|---|---|
| Size / cells | 40×60 / 2,400 | 48×100 / 4,800 |
| Deposits / ordinary value | 400 / 19,000 CR (budget 5,350; 3.55×) | 600 / 63,000 CR (budget 18,600; 3.39×) |
| Air at generation | 9.74% (8.3-11.8) | 7.55% (6.4-8.6) |
| Hard rock | 9.07%; 8.6-10.3% in every 100 m band | 9.61%; 9.2-10.5% in every band |
| Air components per world | 24.4 (21-27) | 29.1 (26-32) |
| Cave size, cells (median / p90 / max) | 9 / 14 / 33 | 12 / 19 / 46 |
| Cave height, rows (mean / max) | 2.3 / 7 | 2.9 / 10 |
| Largest cave per world (median) | 17 cells | 24 cells |
| Caves ≥ 20 cells per world | 0.4 (median 0) | 2.6 |
| Caves touching no ore | 22.5% | 34.6% |
| Ore cells bordering air vs any solid cell | 12.7% vs 14.4% (0.88×) | 7.8% vs 9.3% (0.84×) |
| Caves in the first 100 m | 1.25 | 0 |
| Cave centroid row phase (share at the dominant phase) | 65.7% on one of 4 phases | 96% on 3 of 6 phases |
| Columns that never hold a cave | 0, 18-23, 39 (corridor and wrap seam) | 21-28 (corridor) |

The row rhythm is visible in `maps/heat-air-W01-200seeds.png`. Air share per row alternates 15-23% and about 1% every 40 m, identically across seeds (`out/supplement.json` › `variety.W01.rowAirPct`). It forms two vertical "lanes" with a solid band between.

### 4.2 What the mission route shows (shaft walk, real visibility, 200 seeds)

| W01 band | Ores seen | Ore CR | Rock cells | Cave cells | Hazard seen | Relic seen | New content types |
|---|---|---|---|---|---|---|---|
| 0-50 m | 13.0 | 657 | 0.36 | 0 | 0% | 0% | soil, O1, O2, O3, (rock 31%) |
| 50-100 m | 4.1 | 351 | 0 | 0 | 0% | 0% | beacon |
| 100-150 m | 3.1 | 145 | 0 | 0 | 0% | 0% | — |
| 150-200 m | 2.8 | 129 | 0 | 0 | 0% | 0.5% | — |
| 200-250 m | 2.5 | 114 | 0 | 0 | 0% | 0% | valve |
| 250-300 m | 3.0 | 140 | 0 | 0 | 0% | 0% | — |
| 300-350 m | 2.8 | 130 | 0 | 0 | 0% | 0% | — |
| 350-400 m | 2.6 | 124 | 0 | 0 | 0% | 0% | antenna |
| 400-450 m | 2.5 | 114 | 0 | 0 | 0% | 1% | — |
| 450-500 m | 2.5 | 114 | 0 | 0 | 0% | 1% | — |
| 500-550 m | 2.6 | 117 | 0 | 0 | 0% | 1% | — |
| 550-600 m | 1.9 | 92 | 0 | 0 | 0% | 1% | navigation core |

- **W01 shaft.**
  - 186 cells discovered (7.8%).
  - New content in **4.2 of 11** bands below the surface; a notable encounter in 5.5 of 11.
  - About 8.6 content types met in total.
  - Ore discovery gap: median 10 m, mean 21 m. Longest ore drought: median **100 m**, p90 160 m, maximum 310 m.
- **W02 shaft.**
  - 306 cells discovered (6.4%).
  - New content in **4.2 of 19** bands: sample seam 150 m, first cryosilicate 250 m, cryo vein 450 m, catalyst 1000 m. A notable encounter in 6.4 of 19.
  - **0 caves, 0 hazards, 0 rock below 50 m.**
  - Longest drought: median **140 m**, maximum 310 m.
- **Hidden air beside the shaft.** In W01 the shaft passes within the 4.5-cell lamp radius of hidden air on 8.3 of 60 rows, about 15 hidden-air sightings per descent, none of them visible (`out/supplement.json`). Captures: `shots/w01-shaft-hidden-cave-fog.png` and `shots/w01-shaft-same-spot-revealed.png` show a cave two cells from the shaft at 140 m.

### 4.3 What an explorer sees (comb walk)

- **W01.**
  - Discovers 40.7% of cells.
  - New content in 5.6 of 11 bands; notable in 10.8 of 11, mostly caves.
  - Brittle shelves are seen in 35% of seeds (100-150 m), 100% (250-300 m) and 36% (400-450 m).
  - Longest ore drought: median 50 m.
- **W02.**
  - Discovers 32.4% of cells.
  - New content in 5.3 of 19 bands; notable in 13.6 of 19.
  - Cold pockets are seen in 5% (250-300 m) and 19% (550-600 m) of seeds. **Vents are never seen**, because they are 15.5 columns from the shaft.

### 4.4 Full-reveal novelty (everything known, 200 seeds)

| Band | W01 new content types (share of seeds) | W02 new content types |
|---|---|---|
| 0-50 m | soil, rock, O1, O2, O3 (100%), O4 (30%), relic (10%) | ice, rock, O1, O2 |
| 50-100 m | cave (97%), beacon, O4 (25%) | — (nothing) |
| 100-150 m | shelf (100%), O4 (15%) | cave, sample seam |
| 150-200 m | O4 (13%) | — |
| 200-250 m | valve | cryosilicate (100%) |
| 250-300 m | — | cold pocket |
| 300-350 m | — | — |
| 350-400 m | antenna | — |
| 400-450 m | — | cryo vein |
| 450-500 m | — | vent |
| 500-600 m | core at 550-600 m | — |
| 600-950 m | n/a | Helion ice (5-25% of seeds per band) |
| 950-1000 m | n/a | catalyst |

**First appearance by ore type.**
- W01: Silverium median row 1 (10 m); Goldium median row 8 (80 m), p10 row 1, max row 37. All four tiers are present in the first 100 m.
- W02: Cryosilicate from row 24 on every seed; Helion ice median row 74 (min 64).

### 4.5 Hazards and relics

| Item | W01 | W02 |
|---|---|---|
| Hazard sites | 3 shelves at **(8,14), (31,29), (11,46) on 200/200 seeds** (`world.ts:92-96`) | Cold pockets (10.5,28.5) and (37.5,61.5); vents (8.5,48.5) and (39.5,83.5), as constants (`frontier.ts:125-134`) |
| Distance from corridor | 7-10 columns | 9.5-13.5 columns from the corridor edge |
| Seen on the mission shaft | 0% | 0% |
| Tell before activation | None; drawn only once `shelf.warning !== null` (`scene.ts:1603`); `shots/w01-shelf-before-trigger.png` vs `shots/w01-shelf-warning.png` | Static icon and ellipse in a 3×3 pocket (`world.ts:326-329`; `shots/w02-vent-pocket.png`, `shots/w02-cold-pocket.png`) |
| Relic count 0/1/2 | 28% / 59.5% / 12.5% | 27% / 57% / 16% |
| Relic depth | Anywhere; 21% in the first 100 m; median row 27 | Rows 20-99; median 55 |
| Relic seen: shaft / comb (all seeds) | **4.5% / 31.5%** | **6% / 26%** |
| Relic seen when one exists: shaft / comb | 6.3% / 43.8% | 8.2% / 35.6% |
| Relic art and name | Shared brief "five-point broken ring enclosing a solid core" for all 15 worlds (manifest :905, :1128, :1351, ...); named "\<world\> relic" | same |

### 4.6 What is fixed across seeds

| Element | Fixed? | Source |
|---|---|---|
| Mission columns and rows | Fixed | `world.ts:28-50`, `:275-290`; `config.ts:354-357`; `frontier.ts:13-15` |
| Starter seams and the first volatile | Fixed | `world.ts:5-8`, `:357-364` |
| Six-column corridor (all base material, no air) | Fixed | `world.ts:58`, `:274`; measured 0 rock and 0 air cells on 200/200 seeds |
| Shelf and W02 hazard coordinates | Fixed | `world.ts:92-96`; `frontier.ts:125-134` |
| Cave rows (every 4 or 6 rows) and lanes (x 3-15 and 27-36 in W01) | Fixed | `world.ts:74-77`, `:312-316` |
| Cave x-positions and sizes within lanes, rock dither, ore cells, relic | Random | — |

### 4.7 W01 vs W02 as played

| | W01 | W02 |
|---|---|---|
| Gravity | 0.55 | 0.35 |
| Materials | soil, hard rock (×1.85 cut) | ice, frozen rock (×1.85); thermal auger ×0.55 on ice |
| Caves per 100 m | about 4 (1.25 in the first 100 m) | about 3 (0 in the first 100 m) |
| Rarity by depth | none (ore pool shuffled; `world.ts:162-179`) | O3 from 240 m, O4 from 640 m |
| Distinct mechanic | shelf (off-route) | volatile release window; cold and vent (off-route) |
| First world-specific encounter on the route | beacon at 100 m | sample seam at 150 m; first volatile at 240-250 m |
| New-content bands on the mission shaft | 4 of 11 | 4 of 19 |
| Generator | `createW01` | `createW02`, a constant-swapped copy of the same skeleton (`world.ts:257-463`) |

### 4.8 Prototype check: the proposed layout is feasible

`work/world/world-variant-content.ts` is a prototype-only W01 variant. It has:
- four bands (rows aligned to GFX §7.2);
- a one-column soil route;
- plate slabs and fracture slots;
- a fused-plate stratum at 310 m (PROG-P3);
- two per-seed "quiet cavities", one of which breaches the route wall;
- route-adjacent set pieces (survey camp; crystal geode holding the relic);
- free set pieces (salvage pod; collapsed shaft);
- shelves on per-seed chamber ceilings;
- the same 400-deposit budget, with PROG-P1 minimum rows.

| Metric (200 seeds) | Shipped W01 | Prototype |
|---|---|---|
| Invalid seeds (package in air, duplicate location, air in route or mission cell, wrong 240/120/36/4 counts) | 0 | **0** |
| Ordinary value (floor 16,050 CR) | 19,000 CR | 19,000 CR |
| Relics per world | 0.85 (0-2) | **1 (always)** |
| Shaft: bands with new content (of 11) | 4.18 | **7.34** (6-10) |
| Shaft: bands with a notable encounter | 5.52 | **8.90** |
| Shaft: relic seen | 4.5% | **71%** |
| Comb: bands with new content | 5.61 | **8.39** |
| Comb: relic seen | 31.5% | **100%** |
| Largest cave (median) | 17 cells | **42** |
| Caves ≥ 20 cells per world | 0.4 | **2.8** |
| Cave row-phase counts (4 phases) | 1064 / 3208 / 526 / 88 | 613 / 569 / 709 / 720 |

The prototype still has gaps at 300-350 m and 400-450 m because band C reuses "cave" as its novelty. The full proposal (P4/P5) adds a band-C signature site and a hazard. See `maps/proto-W01-seed73021.png`.

---

## 5. Findings (most severe first)

### WORLD-F1 · Critical · The mission route is a sterile six-column corridor: following the objectives, players meet only soil and common ore

**Evidence**
- **The corridor is built to be empty.** `protectedColumn` covers columns 18-23 in W01 (`world.ts:58`) and 22-27 in W02 (`world.ts:274`). Those columns get no hard rock (`world.ts:61`, `:297`) and are never carved (`world.ts:63-73`, `:299-309`). Every objective is in them (`world.ts:28-50`, `:275-290`).
- **Measured on 200 seeds:** 0 rock and 0 air cells in the corridor (`out/generation.json` › `corridor`).
- **What a descent sees.**
  - A full W01 descent discovers 7.8% of the world and meets 0 caves, 0 hazards and 0 rock below 50 m.
  - It finds something new in only 4 of 11 bands, and those are the four mission landmarks.
  - It sees a relic on 4.5% of seeds.
  - Longest ore drought: median 100 m, maximum 310 m (§4.2).
  - W02: 4 of 19 bands; drought median 140 m.
- **Hidden air nearby.** Caves lie 2-4 cells from the shaft on about 8 of 60 W01 rows but are never visible: `shots/w01-shaft-hidden-cave-fog.png` vs `shots/w01-shaft-same-spot-revealed.png`.
- **Speed.** PROG-F1 measures this path at 163-165 s of active play.

**Player impact.** The HUD sends every player down the one place in the world where nothing can happen. The core loop ("dig, discover, decide") collapses into dig-and-fetch, and the world's content goes unseen by anyone who follows guidance.

### WORLD-F2 · Major · Depth reveals nothing new after 150 m (W01) or 500 m (W02): one material pair, four ores and one cave style for the whole world

**Evidence**
- **Novelty runs out early.** In full-reveal novelty, the last non-mission new content type in W01 appears at 100-150 m (the first shelf). In W02 only Helion ice (from 640 m) and the catalyst follow the 450-500 m vent (§4.4).
- **Ore type is depth-blind in W01.** All four W01 ore tiers usually appear by 80 m, because ore type is drawn from one shuffled pool and only counts are split by band (`world.ts:162-179`).
- **Materials do not change.**
  - There are three tile kinds, air, base and hard rock, plus bedrock (`model.ts:273-280`, `:1360`).
  - Hard rock stays at 8.6-10.3% in every 100 m band.
  - The renderer uses one background colour per world (`scene.ts:1030`) and picks tile variants by hash, not depth (`scene.ts:1140-1143`; GFX-F7).
- **Only cut time changes.** It grows up to 1.74× in W01 and 2.24× in W02 (`model.ts:479`). PROG-F2 shows W01 value per cell falls with depth.

**Player impact.** "The deep frontier" has no frontier. Going deeper costs more and shows nothing new, which feeds the owner's progression complaint directly.

### WORLD-F3 · Major · Caves are small, regular, empty pockets on a fixed ladder, neither landmarks nor rewards

**Evidence**
- **Small and short.** Median cave is 9 cells and 2-3 rows tall in W01 (12 cells in W02). The largest cave per world has a median of 17 cells. W01 has 0.4 caves of 20 cells or more per world (§4.1).
- **Regular.** The generator stamps one ellipse per side every 4 rows (W01) or 6 rows (W02) inside two lanes (`world.ts:74-88`, `:312-325`). 66% of W01 caves are centred on the same row phase. The 200-seed heatmaps show identical stripes (`maps/heat-air-W01-200seeds.png`, `maps/heat-air-W02-200seeds.png`).
- **Empty.** Caves never contain anything, because ore candidates are solid cells only (`world.ts:136-147`).
- **Not ore-rich.** Ore borders air less often than the average solid cell (0.88× W01, 0.84× W02), and 22.5% (W01) and 34.6% (W02) of caves touch no ore.
- **Never at the wrap seam.** Columns 0 and 39 are never carved (`world.ts:65-66`).
- **Unmet brief.** The pinned briefs ask for "large quiet cavities and rectangular salvage" (balance JSON :222) and "smooth melt channels and round trapped bubbles" (:403).

**Player impact.** Breaking into a cave should be the genre's best surprise: shelter, a vista, a rich wall. Here every cave is the same small slot with nothing in it, so caves add neither danger, nor reward, nor memory.

### WORLD-F4 · Major · Hazards are few, fixed and off-route, and the W01 shelf has no tell until it is already cracking

**Evidence**
- **Few and fixed.**
  - W01 has three shelves at the same coordinates on 200/200 seeds (`world.ts:92-96`), 7-10 columns from the corridor.
  - W02 has two cold pockets and two vents as constants (`frontier.ts:125-134`), each carved into its own 3×3 pocket (`world.ts:326-329`), 9.5-13.5 columns from the corridor.
  - The comet climate runs only on W02 (`model.ts:682`).
- **Rarely met.** The mission shaft meets a hazard on 0% of seeds in both worlds; even the comb never sees a vent (§4.3).
- **No tell.** The shelf is drawn only after its warning starts (`scene.ts:1592-1615`), so it looks like ordinary soil until it cracks (`shots/w01-shelf-before-trigger.png` vs `shots/w01-shelf-warning.png`). The pinned brief asks for "two visible dust puffs before shelf failure" (manifest W01 `fx`; FEEL-F9).
- **No guarding role.** Hazards protect nothing: none is placed by reward, route or band rules.

**Player impact.** The world itself poses almost no risk or decision, so danger comes only from running dry. Fixed coordinates are memorised after one run, and the hazards teach nothing that the player ever needs.

### WORLD-F5 · Major · Relics are generic, missing from about 28% of worlds, almost never met on the route, and found silently

**Evidence**
- **Often missing.** The count is a 0/1/2 roll (`world.ts:219-220`, `:426-427`); 28% (W01) and 27% (W02) of seeds have none.
- **Placed without intent.** Locations are uniformly random: 21% of W01 relics sit in the first 100 m, and none is tied to a landmark (`out/generation.json` › `relics`).
- **Rarely seen.** The mission shaft sees a relic on 4.5% / 6% of seeds; an explorer on 31.5% / 26% (`out/relic-seen.json`).
- **No identity.** All 15 designed relics share one brief, "five-point broken ring enclosing a solid core", and the name pattern "\<world\> relic" (manifest :905, :1128, :1351, ...).
- **Silent discovery.** The exposure message is filtered out by `presentationMessage` (`main.ts:415`), so a relic gets the same "+ name" popup as ore (`scene.ts:941-956`; `shots/w01-relic-exposed.png`).
- **No afterlife.** A carried relic is lost on recovery (`model.ts:1101`). No record, case or collection exists: a search of `src/` finds relic only in generation (`world.ts:219-241`, `:426-448`), rendering (`scene.ts:1193`), a processing exclusion (`model.ts:657`) and descriptive strings (`main.ts:194`, `:356`, `:968`; `frontier.ts:90`).

**Player impact.** The genre's jackpot moment is a coin flip that most players never see, and it carries no story and no collection value.

### WORLD-F6 · Major · The world has no lore, logs or environmental storytelling; story exists only in mission names

**Evidence**
- **No lore system.** A search of `src/` for lore, codex, journal, log, story or archive finds only the "Navigation archive" destination list (`main.ts:196`, `:1290`).
- **Wrecks are line art.** Mission wrecks are runtime line art at four fixed points (`scene.ts:504-778`; GFX-F13). Mission objects are single cells, not the "mission rooms" the plan called for (`DESIGN_PACK_IMPLEMENTATION.md:86`).
- **Nothing explains the setting.** Nothing tells the player who left the lander, why the asteroid is broken, or what the comet refuge was.

**Player impact.** There is no narrative pull to explore beyond the four objectives. The world reads as procedural filler rather than a place with a past, which undercuts "game quality" more than any single art asset.

### WORLD-F7 · Moderate · W02 plays like W01 recoloured and stretched; its distinct content arrives late and off the route

**Evidence**
- **Same skeleton.** `createW02` copies `createW01`'s skeleton with new constants (`world.ts:257-463`): the same six-column corridor, ellipse caves on a rhythm, 12% rock and relic roll.
- **Real differences are few.** Gravity, depth-gated O3/O4, the volatile window and four fixed hazard pockets (§4.7).
- **Empty opening.** The first 100 m of W02 contain no caves and no new content type (§4.4). The first volatile is at 240-250 m, and the first hazard (a cold pocket) is at 280 m and off the route.
- **Fewer caves for its size.** W02 has twice W01's cells but fewer caves per 100 m.

**Player impact.** Arriving at a new world should be the biggest novelty spike of the campaign. Instead, the comet's first two trips repeat W01 in blue.

### WORLD-F8 · Moderate · No return-visit hooks: worlds go static after completion, guidance stops, and later tools do nothing on earlier worlds

**Evidence**
- **Guidance stops.** After W01 departure `campaignSignal` returns undefined (`poi.ts:237`). The tracker shows only "Frontier charted · Ice comet ready · Moon chapter in development" (`missions.ts:16-37`); after W02 M3, "Iron planet charted · chapter in development" (`missions.ts:129-151`).
- **Static worlds, world-locked tools.** No event adds content to a visited world. The thermal auger, condenser and preservation chamber act only on W02 ice and volatiles (`model.ts:456-465`, `:601-602`, `:615`). Nothing in W01 is gated by a later tool.
- **The return card promises nothing new:** "Return to your established shafts, banked cargo and restored lander." (`main.ts:1314-1315`).

**Player impact.** Persistent excavation, an approved and costly feature, has no gameplay payoff. Once three milestones are paid, nothing pulls the player back (see also PROG-F5).

### WORLD-F9 · Moderate · Explored terrain cannot be reviewed: no claim map, no waypoints, no landmark memory

**Evidence**
- **No terrain map.** Discovery is persisted per cell (`types.ts:46`; `model.ts:345`), but the only map is the destination list (`main.ts:1290-1370`). The flight record shows "Deepest discovery" as a number (`main.ts:613`).
- **Guidance covers missions only.** It targets current-stage mission objects (`poi.ts:233-306`). World-space markers exist only for that target within 80 m (`scene.ts:1421-1488`) and for the lander label near the surface (`scene.ts:1301-1310`). HUD-F1 notes the home bearing is lost below about 72-126 m.

**Player impact.** Side exploration is disorienting, and a remembered cave or vein cannot be found again. Discoveries never become navigation landmarks, which removes a classic reason to explore sideways.

### WORLD-F10 · Moderate · Hidden structure is imperceptible: there is no hint of caves or rooms behind walls

**Evidence**
- **Unknown cells all look alike.** Every unknown cell, including hidden air, uses the same "geology-independent substrate" (`scene.ts:1112-1123`).
- **No other sense of what is behind a wall.** Visibility is strict line of sight within 4.5 cells (`model.ts:299-348`). There is no audio, dust or draft cue, and no scanner until W03's designed R1.
- **Near misses are common.** About 15 hidden-air sightings per W01 corridor descent go unperceived (§4.2).

**Player impact.** Sideways digging is a blind guess, and caves are found by accident. Players cannot make informed exploration choices, which compounds F1.

### WORLD-F11 · Moderate · The world skeleton is identical across seeds, so new campaigns feel the same

**Evidence**
- **Fixed:** mission positions, starter seams, corridor, shelf and hazard coordinates, cave rows and lanes (§4.6).
- **Random:** only cave x-positions within lanes, rock dither, ore cells and the relic. The heatmaps show the same ladder on 200 seeds.

**Player impact.** Replays and "new campaign" offer little variety, and an experienced player can dig the same column and know every hazard in advance. PROG-F6 covers the mission side of this.

### WORLD-F12 · Moderate · W01's 45-minute target is limited by content, not map size

**Evidence**
- **Size.** W01 is 40×60 = 2,400 cells: 1.8 view widths and 4.3 view heights at the nominal 22×14-cell desktop view (`DESIGN_PACK_IMPLEMENTATION.md:120`; `layout.ts:2-5`).
- **The map is under-used, not too small.**
  - It holds 3.55× its value budget (§4.1).
  - Completionist bots discover 19-29% of it (PROG §4.7); a ±10-cell comb reveals 40.7%.
  - The critical path is 163-165 s of active play (PROG-F1).
- **Too few discoveries for the target.** W01 offers 13 encounterable content types and 4 landmarks. At 45 minutes that is about one landmark per 11 minutes.

**Player impact.** Enlarging W01 would add commute, not interest. The target can only be met by denser, more varied content (and PROG-P3 gating).

### WORLD-F13 · Moderate · The roadmap scales a generator that has no content system, and one pinned brief points back at the reference game

**Evidence**
- **The briefs need features that do not exist.** The pinned W03-W06 briefs require structures the generator lacks:
  - W03: "horizontal strata interrupted by large diagonal fractures"; "one supported pocket is guaranteed at each objective" (balance JSON :580).
  - W04: "compact industrial ruins".
  - W05: current bands.
  - W06: "cooling refuges are always reachable".
- **No shared generation module.** W02 was added as a ~200-line copy (`world.ts:257-463`).
- **Branch structure.** W03 is a parallel branch: W04's parents are W02 *or* W03 (`config.ts:119`, ANY-gate at `:495`), so W03 adds an alternative, not campaign length.
- **Reference-game wording.** W04's pinned mechanic says "Retain the original six-region depth arc" (balance JSON :761), which points at the reference game's region structure.

**Player impact.** Building W03 next with today's approach would ship a third sterile-corridor world and multiply the later retrofit cost. Reproducing a reference depth arc would undercut the campaign's originality.

### WORLD-F14 · Moderate · W01's mineral names reproduce the reference game's first four minerals

**Evidence**
- `config.ts:370-407`: Ironium, Bronzium, Silverium, Goldium at 30/60/100/250 CR. The same names and values appear in the reference table in `docs/RESEARCH.md` (mineral table: Ironium 30, Bronzium 60, Silverium 100, Goldium 250).
- They are pinned in the design pack's W01 `ore_names` (balance JSON :228).
- All other worlds' ore names are original (Frost iron, Blue nickel, Cryosilicate, Helion ice, and so on).

**Player impact.** The opening world, the one every player sees, carries the reference game's named content. That contradicts the owner's direction of an original campaign and makes the game read as a clone at first glance.

---

## 6. Proposals (highest priority first)

Effort: S ≤ 1 day; M 2-4 days; L 1-2 weeks; XL more than 2 weeks, for one experienced developer.

### WORLD-P1 · Open the mission route: a one-column guaranteed route, with route-adjacent features in every band · Effort M · Impact high

**Addresses:** F1, F10 (partly), F11.

**Change**
- Shrink the protected corridor from six columns to a one-column drillable route: W01 column 20 plus the mission cells; W02 column 24.
- Allow hard rock, caves and rooms beside the route.
- Guarantee in each band below the opening at least one feature whose open interior touches the route's wall cell. The feature can be a chamber, set piece, rare pocket or visible hazard pocket; a straight descent then breaks into it.

**Implementation**
- **`world.ts`, both generators.** Replace `protectedColumn` (`:58`, `:274`) with a `routeCells` set. Keep starter seams at columns 20/21, rows 0-6 (`:132-134`), and mission cells solid.
- **New pass.** After caves, add a `ensureRouteFeature(band)` pass that extends the nearest cave or stamps a small pocket when a band has no air at the route's neighbour columns.
- **Pinned safety rules.**
  - "Starting safe route contains no unavoidable shelf" (balance JSON :214): no shelf whose cell lies in a route column or a neighbour column.
  - W02 comment "optional hazard pockets never overlap the required central mission route" (`frontier.ts:124`): keep hazard centres at least 2 cells from the route.
- **Generator version.** Bump `GENERATOR_VERSION` to 2 (`config.ts:5`) and let `decodeCampaign` accept 1 and 2 (`model.ts:1244-1246`), shared with PROG-P1. Saved worlds keep their stored terrain.
- **Tests.**
  - `tests/campaign-world.audit.ts:76-78` currently requires columns 20 and 21 to be soil on every row. Change it to the route column and the seam rows.
  - Keep the W02 flood-fill reachability test (`tests/campaign-frontier-world.audit.ts`).

**Acceptance (200 seeds; port `work/world/worldgen.audit.ts` into `tests/`)**
- Route cells are never air or hard rock (except a declared gate, PROG-P3). Mission cells are solid. 0 invalid packages (as in §4.8).
- Mission shaft: a cave, set piece or hazard pocket is seen in ≥ 6 of 11 W01 bands and ≥ 10 of 19 W02 bands; new content in ≥ 7 of 11 W01 bands (prototype 7.34).
- Shaft longest ore drought: median ≤ 60 m (now 100 m in W01, 140 m in W02).
- No shelf is triggerable from a route cell; the existing first-trip tests still pass.

**Depends on:** none. Pair with PROG-P1 (one generator bump) and PROG-P11 (per-seed mission columns).

**Deviation:** none against pinned values. It replaces an implementation note ("mission corridor is drillable soil", `CAMPAIGN_W01.md:13`): the route stays drillable soil but becomes narrower. New seeds produce different maps.

### WORLD-P2 · Sequence the roadmap: deepen W01/W02 with a shared content kit before building W03; design W04's band arc originally · Effort S (decision and plan) · Impact high

**Addresses:** F13, F7, F8, F12.

**Change**
- Insert a "content kit" phase before W03: P3 + P1 + P4 + P5 + P6 + P7 for W01 and W02, then P8-P13.
- Build W03 on the kit. Its seismic scanner reveals sites and unstable tiles; its supports and fault set pieces become prefab families.
- Replace W04's pinned "original six-region depth arc" wording with an original band arc authored from the W04 brief (iron bands, industrial ruins, pressure vents), for example five bands with names of the owner's choosing.

**Implementation**
- Update `docs/DESIGN_PACK_IMPLEMENTATION.md` (the delivery-phases table at :92-104) and `docs/PROJECT.md:31`.
- Record the W04 decision there, and note it beside the pinned JSON. Do not edit the pinned JSON (`design/v0.1/README.md`).
- See the schedule in §7.7.

**Acceptance**
- The owner approves the order.
- W03's own design doc lists which kit stages it reuses: bands, prefabs, per-seed hazards, logs, relic.
- W04's band list contains no reference-game region structure.

**Depends on:** none.

**Deviation:** changes the approved phase order (Phase 2 = "W02 and W03", `DESIGN_PACK_IMPLEMENTATION.md:100`), and reinterprets the W04 brief's "original six-region depth arc" (balance JSON :761).

### WORLD-P3 · One staged world generator plus a world-content metrics harness in CI · Effort M · Impact high (enabler)

**Addresses:** F11, F13. Enables P1, P4-P8, P12.

**Change**
- Refactor `createW01`/`createW02` into `generateWorld(def, seed, version)` with explicit stages, in order:
  1. route and missions;
  2. band base materials;
  3. set pieces;
  4. caves by band style;
  5. hazards by band rule;
  6. ore veins (rarity by band, PROG-P1);
  7. relic and sites;
  8. validation (route drillable, reachability for the declared tool rank, value floor, entry income).
- Port this audit's measurements into a committed report and test.

**Implementation**
- **Code layout.**
  - `src/campaign/generation/stages.ts`, `bands.ts`, `prefabs.ts`, `validate.ts`.
  - `WorldGenDef` records live in `config.ts` and `frontier.ts`.
  - `createW01/createW02` become thin wrappers.
  - Keep the v1 code path behind `version === 1`, with a golden test (seed → identical tiles and packages) so old seeds stay reproducible.
- **Harness.** `tests/world-metrics.audit.ts`, plus `npm run world:report`, prints this report's metrics per world:
  - shaft and comb novelty per 50 m;
  - notable bands;
  - longest drought;
  - largest cave and caves ≥ 20 cells;
  - row-phase spread;
  - hazards visible from the route;
  - relic sighting rate.
- **Thresholds** start as in P1, P4 and P5 below.

**Acceptance**
- The v1 golden test passes. The v2 thresholds are enforced in `npm test`, and the report runs in under 60 s for 200 seeds per world (this audit's scripts take 50 s for both worlds).
- Adding W03 requires a def, prefabs and typed handlers, not a new 200-line generator.

**Depends on:** none.

**Deviation:** none.

### WORLD-P4 · Depth bands as data: each band adds one material or structure, one cave style, one hazard role and one signature site · Effort L · Impact high

**Addresses:** F2, F3, F7.

**Change**
- Four bands per world, using GFX §7.2's rows and names, so visuals and mechanics change together.
- Each band introduces exactly one new thing the player can learn.
- A first-entry banner ("BROKEN PLATES · 110 m") and a depth-rail tick (HUD-P10) mark the boundary.
- Full specs are in §7.1. In summary:
  - **W01.** A Regolith (no caves, teaching); B Broken plates (plate slabs, fracture slots, shelves); C Iron shelf (fused-plate stratum at 310 m per PROG-P3, quiet cavities ≥ 40 cells, salvage); D Core rubble (rubble halls, crystal geodes, pressure seams per PROG-P3c).
  - **W02.** A Snow crust (packed snow cuts faster, frost bubbles); B Blue glacier (**clear-ice lenses that are solid but transparent to line of sight**, melt channels, cold pockets); C Clathrate (bubble galleries with volatile clusters on their walls; vents start); D Black ice (pressure ice, Helion geodes guarded by vents).

**Implementation**
- `BandDef[]` in `WorldGenDef` (§7.1 schema). New tile ids, each with a cut multiplier read in `model.ts:466-486`:
  - 4 fused plate (W01 C);
  - 5 packed snow (W02 A);
  - 6 clear ice (W02 B);
  - 7 pressure ice (W02 D).
- **Visibility.** Clear ice is transparent in `refreshVisibility` (`model.ts:299-348`: treat tile 6 as see-through in the ray test, still solid for collision).
- **Save decoding.** `decodeCampaign` accepts tile ids per world (`model.ts:1360`).
- **Art.** GFX-P6 supplies band tilesets and back walls. Ambience follows FEEL-P10.

**Acceptance (200 seeds)**
- Each band's signature feature is present on ≥ 95% of seeds.
- Full-reveal new content in ≥ 9 of 12 W01 bands and ≥ 14 of 20 W02 bands.
- Mission shaft: new content in ≥ 7/11 (W01) and ≥ 12/19 (W02) bands.
- Caves: W01 largest ≥ 40 cells on ≥ 90% of seeds and caves ≥ 20 cells at 3 or more per world (prototype 42 and 2.8). Row-phase max/min ratio ≤ 1.5 (prototype 1.27; shipped 36).
- Clear ice: an O3/O4 or cave behind clear ice is visible from the route at least once per W02 seed. Collision is unchanged.
- The band banner shows once per band per world and persists.

**Depends on:** P3, P1. Coordinate with GFX-P6, PROG-P1 and PROG-P3.

**Deviation:** new materials and band mechanics (fused plate, packed snow, clear ice, pressure ice) are not in the v0.1 pack. Band rows and palettes extend the pinned five-colour palette (GFX D2). The fused plate is PROG-P3's proposal.

### WORLD-P5 · A set-piece room library with environmental storytelling, including the planned mission rooms · Effort L · Impact high

**Addresses:** F6, F3, F1, F12.

**Change**
- Authored ASCII prefabs, 6-8 per world, 4-6 placed per seed. Each has a role (shelter, cache, landmark, challenge, story) and a band pool.
- Mission objects get rooms: valve chamber, comms wreck, capsule vault; sample seam; catalyst vault.
- Each site has scenery props, an optional log (P8) and, for some, the relic (P6).
- Libraries:
  - **W01:** survey camp, burst cargo pod, plate-arch hall, collapsed shaft, crystal geode, seismograph mast, pressure-assembly room (mission).
  - **W02:** frozen probe, melt cathedral, bubble gallery, vent garden, ice-locked rig, catalyst vault (mission).
- Templates are in §7.2.

**Implementation**
- **Parser.** `src/campaign/generation/prefabs.ts`. Glyphs: `.` air, `#` hard rock, `o` ore slot, `R` relic slot, `L` log, `S` shelf, `v` vent, `c` cold pocket, `p` prop, space = keep.
- **Placement.** After missions, before caves. Uses band pools, a route-adjacency flag (for P1) and a minimum spacing.
- **State.** `world.sites[]` (id, kind, x, y, w, h, discovered, logRead, looted) is persisted and validated like shelves (`model.ts:1433-1449`).
- **Rendering.** Props come from a new atlas section (GFX-P11). The wreck line art in `scene.ts:504-778` becomes prefab props.
- **Discovery.** The first sight of a site fires a "site discovered" event: name label plus a FEEL-P5 cue.

**Acceptance**
- W01 ≥ 4 sites per seed (≥ 1 in each of bands B-D); W02 ≥ 6.
- Every site is reachable from the route with rank-0 tools, or its declared tool. Checked by a 200-seed flood test that treats hard rock as drillable and gate tiles as needing the declared rank.
- Sites never overlap route or mission cells. Discovery persists across save/reload and travel.
- With P1: the mission shaft breaks into a site in ≥ 3 bands (prototype: camp seen 63% at 150-200 m, geode 83% at 500-550 m).

**Depends on:** P3, P1. Art: GFX-P11.

**Deviation:** none against approved decisions. Mission rooms were in the approved plan (`DESIGN_PACK_IMPLEMENTATION.md:86`).

### WORLD-P6 · Relics as a named per-world collection with an anomaly signal and a proper reveal · Effort M · Impact medium-high

**Addresses:** F5.

**Change**
- **Placement.** Exactly one named relic per world, placed in a deep site (W01 crystal geode; W02 ice-locked rig) or a challenge pocket. This aligns with PROG-P7(d).
- **Signal.** An "anomaly" ping within 6 cells, using the POI band logic, never revealing terrain.
- **Reveal.** Exposure gets a named card ("Relic recovered: Lattice segment · Ember arc") and its own cue.
- **Relic case.** Banking adds the relic to a lander case that persists across worlds. The case shows empty slots for charted worlds.
- **Selling.** Selling keeps the pinned value (750 / 3,000 CR); keeping it is a collection choice.
- **Lore tie-in (optional, original).** Each relic is one segment of a broken ring, a natural variation on the pinned silhouette "five-point broken ring enclosing a solid core". The segments together point toward the campaign's "World seed" finale (W15 quest).

**Implementation**
- `world.ts` relic placement (`:219-241`, `:426-448`) moves into the site stage.
- `config.ts` gets `RELICS` records (id, world, name, caption, frame).
- `poi.ts` gets an `anomaly` kind.
- `main.ts:415` stops filtering exposure for relic tags.
- A dock "Relic case" section, and state `progress.relics: string[]` with decode validation.
- Art: one silhouette variant per world, a ring segment with a different cut.

**Acceptance**
- A relic on 200/200 seeds.
- Seen on the mission shaft on ≥ 60% of seeds (prototype 71%) and by the comb on 100%.
- A named card appears on exposure; the case persists through travel, reload and export/import.

**Depends on:** none to start (a simple pocket works); best with P5.

**Deviation:** count changes from the 0/1/2 roll to exactly 1 (also PROG decision 5). Per-world relic silhouettes depart from the shared pinned brief. Optional: a relic carried at recovery returns to its site instead of being lost (pinned rule "ordinary cargo/relic loss", `DESIGN_PACK_IMPLEMENTATION.md:145`); owner decision.

### WORLD-P7 · Give W01's minerals original names · Effort S · Impact medium

**Addresses:** F14.

**Change**
- Rename the four W01 ores to names that fit the broken-asteroid salvage theme. The owner chooses; candidates:
  - **O1:** Slag iron / Plate iron.
  - **O2:** Rust copper / Ember copper.
  - **O3:** Mirror tin / Shard silver.
  - **O4:** Lantern crown / Core crown.
- Keep ids `W01-O1..O4`, silhouettes and patterns.
- Whether the inherited 30/60/100/250 values change is the progression owner's call (PROG-P1 keeps them).

**Implementation**
- `config.ts:370-407` names. Display names come from config by `itemId` rather than the stored `package.name`, so older saves show the new names: `scene.ts:941-956` popup, cargo rows `main.ts:589-603`, legend `mineral-legend.ts`.
- Update the smoke-test regexes `scripts/campaign-smoke.mjs:488`, `:895` and `scripts/usability-smoke.mjs:261`.
- `check-campaign-data.mjs:198` compares ids, values, bulk, mass and weight, not names, so it needs no change.
- Note the override in `DESIGN_PACK_IMPLEMENTATION.md`; do not edit the pinned JSON.

**Acceptance**
- No reference-game mineral name appears in the UI, legend, popups or saves exported after the change.
- Older checkpoints load and display the new names.
- `npm test` and the smoke tests pass.

**Depends on:** none.

**Deviation:** deviates from the pinned W01 `ore_names` (balance JSON :228), for originality.

### WORLD-P8 · Per-seed hazards placed by band rules, guarding rewards, with readable tells · Effort M · Impact medium-high

**Addresses:** F4, F11.

**Change**
- Hazards become per-seed `world.hazards[]` placed by band rules. Each hazard has a role:
  - **guard**, within 3 cells of a cache, geode, crystal cluster or relic;
  - **teach**, visible from the route once per world;
  - **route-shaper**, on the shortest side path to a site.
- **Tells.** Shelves get a pre-trigger tell: hairline crack decal on the cell, plus two dust puffs when the rig is within 3 cells (pinned brief; FEEL-P7).
- **Counts.**
  - W01: shelves B-C 3-5 on chamber ceilings; pressure seams D (PROG-P3c).
  - W02: cold pockets B-C 2-4, vents C-D 2-4, vent pairs guarding Helion geodes.
- **Unchanged:** damage values, warning times and cooldowns (`config.ts:458`; `frontier.ts:141-142`).

**Implementation**
- Replace the `W02_HAZARDS` constant reads in `model.ts:696-721` and `scene.ts:1489-1591` with `world.hazards`, persisted and validated like shelves (`model.ts:1433-1449`).
- Generation stage 5 (P3). Shelves are chosen from chamber ceilings away from the route (prototype method in `world-variant-content.ts`).
- Legend entries come from the world's hazard kinds (`main.ts:210-276`).

**Acceptance (200 seeds)**
- Shelf positions span ≥ 30 distinct cells and vents ≥ 20.
- ≥ 1 hazard is visible from the mission route per world on ≥ 90% of seeds, yet no hazard can trigger from a route cell.
- ≥ 70% of hazards lie within 3 cells of a reward.
- The shelf tell is visible ≥ 1.5 s before the trigger zone is entered at stock speed (browser fixture as in `work/world/world-capture.mjs`).

**Depends on:** P3, P4.

**Deviation:** none against pinned values. The W02 coordinates are code constants, not design data. The pinned "no unavoidable shelf on the starting route" is kept.

### WORLD-P9 · Field logs: an original lore thread told through sites · Effort M · Impact medium

**Addresses:** F6, F8.

**Change**
- 6-8 logs in W01 and 8-10 in W02, each attached to a site or mission room.
- A log is read on the spot through a short in-world card that does not pause the simulation, and collected into a "Survey log" pause tab with per-world completion ("Logs 3/7").
- The last log of each world hints at the next world.
- Example premise and sample logs are in §7.4. They are original placeholders for the owner to rewrite.

**Implementation**
- `src/campaign/lore.ts`: typed records (id, world, site kind, order, title, text).
- `progress.logs: string[]`, with decode validation.
- Scene: a log glyph on discovered log sites.
- `main.ts`: a pause-grid section next to "Cargo manifest" (`main.ts:202-205`).
- Copy style follows the UX copy guidance in HUD-P6.

**Acceptance**
- Every log is reachable (P5 tests). Read state persists through travel, reload and import.
- A world shows 100% when all its logs are read.
- Cards never cover the rig or extraction cues (HUD-P8 lanes).

**Depends on:** P5.

**Deviation:** none.

### WORLD-P10 · A claim map with landmarks and player waypoints · Effort M · Impact medium

**Addresses:** F9, F10.

**Change**
- A "Claim survey" panel in the pause menu and the dock. It renders discovered cells only: shafts, caves seen, sites, logs, relic signal if detected, hazards seen, band labels and the lander.
- Tapping a discovered site sets a waypoint that the HUD locator follows, using the same bearing and range logic as mission guidance.
- Coverage figures: "41% mapped · Sites 4/6 · Logs 3/7 · Relic 0/1".
- Wireframe in §7.5.

**Implementation**
- `main.ts`: a canvas drawn from `world.discovered` and `world.tiles` (1-3 px per cell).
- `poi.ts`: `campaignSignal` accepts an optional `progress.waypoint[world]`.
- No hidden data is drawn: unknown cells stay unknown, including air.

**Acceptance**
- A pixel test proves hidden air renders as unknown.
- The waypoint guides with the bands and arrows in `poi.ts:309-339`, and is cleared on arrival.
- The map fits 393×851 and 1440×900 without horizontal scroll.

**Depends on:** none; better with P5 and P9.

**Deviation:** none.

### WORLD-P11 · Perceptible hints of hidden structure that never leak shape or ore · Effort S · Impact medium

**Addresses:** F10, F1.

**Change**
- **Hollow knock.** While cutting a cell that borders unseen air, play a hollow knock and drift a few dust motes toward the hidden side.
- **Room hum.** Within 6 cells of an undiscovered site, a faint hum (and an optional HUD "signal" glyph).
- **Clear ice (W02).** Clear-ice lenses (P4) give the comet a native "see through" mechanic.

**Implementation**
- `model.ts`: `get hiddenAirNear()` returns directions of unknown air cells within 1-2 cells of the cut target, using simulation truth with presentation-only output.
- `scene.ts` dust via the FEEL-P3 FX layer; `audio.ts` cue.

**Acceptance**
- A unit test emits the hint if and only if hidden air is adjacent.
- A screenshot diff shows unknown cells unchanged apart from transient motes.
- In a scripted shaft run, ≥ 50% of adjacent hidden caves produce a hint.

**Depends on:** none (FEEL-P3 optional).

**Deviation:** none; wall-occluded discovery is kept.

### WORLD-P12 · Rare pockets and a discovery-cadence guarantee · Effort S · Impact medium

**Addresses:** F2, F5, F12.

**Change**
- 3-5 small hidden pockets per world (2×2 to 3×3), pre-seeded so they stay deterministic: an O3/O4 cluster, a curio worth selling, or a fossil plate.
- Placed so that every 50 m band has at least one notable find within 3 cells of the route, a pity rule applied at generation.
- Breaching a pocket gets a FEEL-P5 celebration.
- Rare-find "events" are realised as these seeded pockets rather than runtime spawns, which keeps worlds deterministic and never regenerates content.

**Implementation**
- A generation-stage helper in P3. Pockets reuse the prefab glyphs.
- Curio values come from the progression owner, kept within the existing value floor.

**Acceptance**
- Mission shaft: a notable find in ≥ 9 of 11 W01 bands and ≥ 15 of 19 W02 bands.
- Longest stretch with no notable find is ≤ 100 m on the shaft.
- Ore budgets and counts are unchanged.

**Depends on:** P5.

**Deviation:** none (curio values to be confirmed by the progression owner).

### WORLD-P13 · Return-visit hooks: tool-sealed caches and post-completion claim events · Effort L · Impact medium

**Addresses:** F8.

**Change**
- **(a) Sealed caches.** Each world holds 2-3 caches that a later world's tool opens:
  - W01 "frost-locked lockers" open with the W02 thermal auger;
  - a W01 "fault vault" is located by the W03 seismic scanner;
  - W02 "pressure-ice lenses" open with the W04 hydraulic crown.
  - Each holds a log continuation plus a reward. When the player finds one, the tracker shows "Sealed cache · requires Thermal auger".
- **(b) Claim events.** One seeded event per return visit after M3, such as a surface impact crater with fresh ore near the lander, or a newly opened fissure exposing a site.
  - Events change only undiscovered cells and add uniquely identified packages.
  - They never regenerate sold ore.
- **(c) Survey goals after completion:** logs %, sites %, relic. These feed PROG-P10's mastery stars and restore guidance on completed worlds ("Claim survey: 2 sites uncharted").

**Implementation**
- `world.sites` with `requires: gearId`. The cut check in `model.ts:446-486` refuses with a clear message when the tool is missing.
- `travel()` (`model.ts:1198-1219`) applies `claimEvent(world, visits)`.
- `poi.ts:237` keeps a survey signal after departure.
- `missions.ts` "Claim survey" tasks. Decode validation.

**Acceptance**
- Returning to W01 after W02 M1 shows ≥ 1 sealed cache with its tool name.
- Claim events never alter discovered or excavated cells or banked packages (property test).
- Each completed world lists ≥ 3 post-M3 goals (with PROG-P10).

**Depends on:** P5, P9.

**Deviation:** none against approved decisions; "no mandatory resets" is kept. It makes later-world tools act on earlier worlds, which is new behaviour.

---

## 7. Specifications

### 7.1 Band specifications (mechanics and themes; visuals per GFX §7.2)

Schema (in `WorldGenDef`):

```ts
interface BandDef {
  id: "A" | "B" | "C" | "D";
  name: string;
  rows: [number, number];
  rock: number; // hard-rock share
  special?: {
    tile: number;
    name: string;
    cutMultiplier: number;
    layout: "stratum" | "lenses" | "slabs" | "fill";
    rows?: number[];
    transparent?: boolean;
  };
  caves: {
    style: "none" | "slots" | "chambers" | "halls" | "channels" | "bubbles";
    count: [number, number];
    rx: [number, number];
    ry: [number, number];
  };
  hazards: { kind: "shelf" | "pressure-seam" | "cold" | "vent"; count: [number, number]; role: "guard" | "teach" | "route" }[];
  sites: string[];          // prefab pool
  rarePockets: number;      // P12
  oreBias?: string;         // hook for PROG-P1 weights
  palette: string;          // GFX §7.2 band key
  ambience: string;         // FEEL-P10 layer
  banner: string;           // first-entry text
}
```

**W01 Broken asteroid** (rows match GFX §7.2)

| Band | Rows / depth | Material and structure | Cave style | Hazard role | Signature site / discovery | Banner copy |
|---|---|---|---|---|---|---|
| A Regolith | 0-10 / 0-110 m | soil, rock 6% | none (teaching) | none | starter seams; survey beacon (existing) | "REGOLITH · loose ground, easy cutting" |
| B Broken plates | 11-29 / 110-300 m | rock 12% plus 6-8 horizontal plate slabs (3-7 cells) forming natural ledges | fracture slots (thin, rx 2-4.5, ry 0.6-1) at random positions | shelves on chamber ceilings (teach, guard) | survey camp (route-adjacent, log); burst cargo pod (cache); valve room (mission) | "BROKEN PLATES · ledges hold; ceilings may not" |
| C Iron shelf | 30-47 / 300-480 m | fused-plate stratum rows 30-31 (PROG-P3 gate); rock 20%; rusted salvage beams (props) | 2 quiet cavities (rx 4-6, ry 2-3; ≥ 40 cells), one breaching the route | shelves; loose-plate ceiling in the arch hall | plate-arch hall (landmark, log); comms wreck room (mission) | "IRON SHELF · dense plates below 310 m" |
| D Core rubble | 48-59 / 480-600 m | rock 14%; crystal veins | 3 rubble halls (rx 2.5-4) | pressure seams (PROG-P3c) near geodes | crystal geode (rare ring plus relic, anomaly ping); collapsed shaft (log); capsule vault (mission) | "CORE RUBBLE · the asteroid's broken heart" |

**W02 Ice comet**

| Band | Rows / depth | Material and structure | Cave style | Hazard role | Signature site / discovery | Banner copy |
|---|---|---|---|---|---|---|
| A Snow crust | 0-14 / 0-150 m | packed snow (cut ×0.8) over ice; frozen rock 6% | frost bubbles (r ≤ 1) | none | starter veins; frozen probe (log); sample seam room (mission) | "SNOW CRUST · soft, fast cutting" |
| B Blue glacier | 15-44 / 150-450 m | ice; **clear-ice lenses** (solid, transparent to sight) 4-6 per seed | melt channels (long vertical or diagonal, 1-2 wide, 4-10 tall) | cold pockets 2-3 (teach, route) | melt cathedral (tall shelter, log); crystal seen through clear ice | "BLUE GLACIER · look through the clear ice" |
| C Clathrate | 45-74 / 450-750 m | ice with trapped-gas bubbles | bubble galleries (chained round chambers r 1.5-2.5) | vents 1-2 guarding volatile clusters on gallery walls | cryo vein (mission); bubble gallery | "CLATHRATE · crystals grow on bubble walls" |
| D Black ice | 75-99 / 750-1000 m | frozen rock 20%; **pressure ice** (cut ×1.6, thermal auger applies) | few large voids | vents 2-3 guarding Helion geodes | vent garden; ice-locked rig (relic, log); catalyst vault (mission) | "BLACK ICE · old, dense and rich" |

### 7.2 Set-piece templates (prefab glyphs: `.` air, `#` hard rock, `o` ore slot, `R` relic slot, `L` log, `S` shelf, `v` vent, `p` prop, space = keep)

```
Survey camp (W01 B; route-adjacent: the open side touches the route wall)
#######
#p.L..
#..o..
#######

Crystal geode (W01 D; relic in the ring; anomaly ping 6 cells)
 oRo
o...o
o.p.o
o...o
 ooo

Plate-arch hall (W01 C; ≥ 40-cell quiet cavity; shelf in the arch)
###S#####S##
#....#.....#
#..L.......#
#....#..p..#
###.####.###

Vent garden (W02 D; Helion cluster guarded by two vents)
##v####v##
#.o....o.#
#..oooo..#
##########

Ice-locked rig (W02 D; previous crew's rig; log and relic)
#########
#..ppp..#
#.L.R...#
#########
```

**Placement rules (P5)**
- At least one route-adjacent anchor in each of bands B, C and D.
- Free sites sit 6-16 columns from the route, with at least 4 cells between sites.
- Sites never overlap mission cells.
- Sites are reachable with the band's declared tool rank.
- Ore slots draw from the band's ore pool and count toward the 60/30/9/1 totals, as the prototype does (`world-variant-content.ts`, geode ring).

### 7.3 Data model additions (all persisted and validated in `decodeCampaign`)

| Field | Type | Notes |
|---|---|---|
| `world.sites[]` | `{id, kind, x, y, w, h, discovered, logRead, looted, requires?}` | P5, P13; ids unique per world |
| `world.hazards[]` | `{id, kind, x, y, warning, cooldown}` | P8; replaces the W02 constants; shelves can migrate here |
| `progress.logs` | `string[]` | P9 |
| `progress.relics` | `string[]` | P6 relic case |
| `progress.waypoint` | `Record<worldId, {x, y} \| null>` | P10 |
| `world.visits`, `world.events[]` | `number`, `string[]` | P13 claim events (idempotent) |
| `generatorVersion` | `1 \| 2` | P1/P3, shared with PROG-P1 |

### 7.4 Original lore example (placeholder for the owner to rewrite)

**Premise.**
- You are a contract salvager sent to restore a lander abandoned by the survey crew of the *Wayfarer*.
- The crew vanished after finding segments of an old ring-shaped navigation lattice, one per world. These are the relics, which tie into the campaign's "World seed" finale.
- The logs follow their trail. No combat; tone: quiet, practical, curious.

| Site | Log (sample text) |
|---|---|
| W01 survey camp | "Day 9. The plates shift whenever the lander fires. Sanna says the rock is hollow in places. I say it's broken in all of them." |
| W01 cargo pod | "Manifest 4471: twelve crates of tunnel bracing, one crate stencilled DO NOT SCAN. Pod lost on descent. Bracing would have been nice." |
| W01 plate-arch hall | "These pillars were cut. Not by us. Clean faces, old dust." |
| W01 collapsed shaft | "Shaft 3 sealed after the shelf came down. Kell is fine. The drill is not." |
| W01 crystal geode | "The ring hums when the lamp touches it. Logging it as a relic. Not telling the Registry yet." |
| W01 capsule vault | "If you're reading this, the core is still here and so are you. Take it. Leave the lander better than we did." |
| W02 frozen probe | "Probe K-2: thermal seam at 150 metres. The pockets breathe on a cycle. Don't park over them." |
| W02 melt cathedral | "We melted this hall for a refuge. It refroze in a week. We stayed anyway." |
| W02 ice-locked rig | "Left the *Wayfarer II* here when the condenser failed. Took the second segment with us. The moon will have the third." |

**Relic names (examples).** W01 "Lattice segment · Ember arc"; W02 "Lattice segment · Frost arc". The silhouette is the pinned broken ring, with a different segment cut per world.

### 7.5 Claim map wireframe (pause and dock, 1440×900; stacks full-width on phones)

```
┌ CLAIM SURVEY · Broken asteroid ───────────── 41% mapped ─┐
│   0 m ─ A REGOLITH        ⌂ lander  ▓▓▓│▓▓   ░░░░░░░░     │
│ 100 m   ◎ beacon (surveyed)            │                  │
│ 110 m ─ B BROKEN PLATES   ⌖ survey camp ✎   ▓▓▒▒▒▓        │
│ 250 m   ⚙ valve room (banked)          │   ! shelf seen   │
│ 310 m ─ C IRON SHELF ═════ fused plate ═│═════════════     │
│ 400 m   ⌖ plate-arch hall ✎       ░░░░░│░░                │
│ 480 m ─ D CORE RUBBLE     ◇ anomaly?   │                  │
│ 600 m   ◉ capsule vault                │                  │
│  ▓ explored  ▒ cave seen  ░ unknown  ⌖ site  ✎ log  ◇ relic│
│  Sites 3/6 · Logs 2/7 · Relic 0/1    [ Set waypoint ]     │
└───────────────────────────────────────────────────────────┘
```

### 7.6 World-content metrics (P3 harness; thresholds for generator v2)

| Metric (200 seeds) | Definition | Shipped W01 / W02 | v2 threshold W01 / W02 |
|---|---|---|---|
| Shaft new-content bands | 50 m bands below the first where the route shaft first meets a content type | 4.2/11 · 4.2/19 | ≥ 7/11 · ≥ 12/19 |
| Shaft notable bands | bands with a cave, site, hazard, relic, log, special material or tier 3-4 ore | 5.5/11 · 6.4/19 | ≥ 9/11 · ≥ 15/19 |
| Shaft longest ore drought | metres with no ore seen | median 100 · 140 | ≤ 60 · ≤ 60 |
| Full-reveal new-content bands | of 12 / 20, counting bands where a new type appears on most seeds | 6 / 7 | ≥ 9 / ≥ 14 |
| Largest cave | cells, median | 17 · 24 | ≥ 40 · ≥ 45 |
| Caves ≥ 20 cells | per world | 0.4 · 2.6 | ≥ 3 · ≥ 5 |
| Cave row-phase spread | max/min count over the phases | 36 · > 100 | ≤ 1.5 |
| Hazard visible from route | share of seeds | 0% · 0% | ≥ 90% |
| Relic seen: shaft / comb | share of seeds | 4.5/31.5% · 6/26% | ≥ 60 / 100% |
| Validity | invalid seeds | 0 | 0 |

### 7.7 Content roadmap (one developer; art via GFX)

| Phase | Weeks | Scope | Exit check |
|---|---|---|---|
| A · Kit and route | 1-1.5 | P3 harness and stages, P1 route, P7 names, PROG-P1 rarity (one generator bump), P6 relic (simple pocket) | §7.6 shaft thresholds for P1; relic 200/200 |
| B · Bands | 1.5-2 | P4 for W01 and W02 (four new tiles, cave styles, banners), P8 hazards | full-reveal and cave thresholds; hazards visible from route ≥ 90% |
| C · Places and story | 2 | P5 libraries (7 + 6 prefabs), P9 logs, P12 rare pockets, P11 hints | notable ≥ 9/11, ≥ 15/19; logs reachable |
| D · Memory and return | 1.5 | P10 claim map, P13 sealed caches and claim events (W01 caches opened by the W02 auger) | post-M3 goals listed; property tests |
| E · W03 Fractured moon | 2-3 | Built on the kit: strata and fault prefabs, scanner revealing sites and unstable tiles, supports, winch | W03 meets §7.6 at its own thresholds |
| F · W04 Iron planet | later | Original multi-band arc from the W04 brief (not the reference game's regions) | owner design review |

Phases A-D are about 6-7 weeks. GFX-P6 (band art) and FEEL-P5 (celebrations) run in parallel and are not counted here.

---

## 8. Owner decisions

1. **Route.** Narrow the protected corridor from six columns to a one-column drillable route, and let caves and rooms breach it (P1)? The pinned "no unavoidable shelf on the starting route" stays.
2. **Order.** Insert the content-kit phase (A-D, about 6-7 weeks) before W03, changing the approved Phase 2 order (P2)? Or build W03 first with the current generator?
3. **New band content.** Approve materials and mechanics outside v0.1: fused plate (with PROG-P3), packed snow, clear ice (see-through), pressure ice, melt channels, bubble galleries (P4).
4. **Relics.**
   - Exactly one named relic per world, with per-world art variants of the pinned broken ring and a relic case (P6)?
   - Should a carried relic return to its site on recovery instead of being lost?
5. **W01 mineral names.** Replace Ironium/Bronzium/Silverium/Goldium with original names (P7). Choose from the candidates or supply your own. Values stay with the progression owner.
6. **Lore.** Is the *Wayfarer* / ring-lattice premise acceptable as a starting point? Who writes final text, and how many logs per world (P9)?
7. **Cross-world hooks.** May later tools (for example, the thermal auger) open sealed content on earlier worlds, with seeded claim events after completion (P13)?
8. **Hazards.** Per-seed hazard placement that guards rewards, instead of fixed coordinates (P8)?
9. **W01 size.** Keep 40×60 and add content (recommended), rather than enlarging?
10. **W04 brief.** Replace "Retain the original six-region depth arc" with an original band arc authored for this campaign (P2)?

---

## 9. Cross-references to other auditors

- **PROG-P1** (depth-weighted ore) belongs in generation stage 6. Ship it in the same generator bump as P1. **PROG-P3** (fused plate, pressure seams) supplies band C and D mechanics. **PROG-P7(d)** matches P6. **PROG-P10** mastery stars use P9, P10 and P13 counts. **PROG-P11** (per-seed mission columns) composes with P1's single route.
- **GFX-P6** depth-band art uses §7.1 band rows and names (taken from GFX §7.2). **GFX-P11** supplies prefab props and hazard art. **GFX-F13** wreck line art is replaced by P5 props.
- **FEEL-P3/P5/P7** supply dust, hollow cues, site-discovery and relic celebrations, and shelf puffs.
- **HUD-P4/P10** world-space markers and the depth rail show band ticks, waypoints and the anomaly ping. **HUD-P8** lanes keep log and relic cards off the rig.

---

## 10. Evidence index (paths relative to `docs/improvement-plan/`)

- Measurement scripts:
  - `work/world/worldgen.audit.ts`
  - `work/world/supplement.audit.ts`
  - `work/world/relic/relic-seen.audit.ts`
  - `work/world/dump.audit.ts`
  - `work/world/variant.audit.ts`
- Prototype:
  - `work/world/world-variant-content.ts`
- Data:
  - `work/world/out/generation.json`
  - `work/world/out/walks.json`
  - `work/world/out/novelty-full-reveal.json`
  - `work/world/out/supplement.json`
  - `work/world/out/relic-seen.json`
  - `work/world/out/variant-compare.json`
- Maps:
  - `work/world/maps/map-W01-seed73021.png`
  - `work/world/maps/map-W02-seed73021.png`
  - `work/world/maps/heat-air-W01-200seeds.png`
  - `work/world/maps/heat-air-W02-200seeds.png`
  - `work/world/maps/proto-W01-seed73021.png`
- Captures:
  - `work/world/shots/w01-shaft-hidden-cave-fog.png`
  - `work/world/shots/w01-shaft-same-spot-revealed.png`
  - `work/world/shots/w01-shelf-before-trigger.png`
  - `work/world/shots/w01-shelf-warning.png`
  - `work/world/shots/w01-relic-in-wall.png`
  - `work/world/shots/w01-relic-exposed.png`
  - `work/world/shots/w02-vent-pocket.png`
  - `work/world/shots/w02-cold-pocket.png`
- Capture script:
  - `work/world/world-capture.mjs`
- Baseline screenshots used:
  - `shots/d21-deep-revealed.png` (rectangular caves, uniform terrain, relic ring)
  - `shots/d20-w02-drilling.png` (comet shaft sees only its walls)
  - `shots/d19-w02-surface.png`
