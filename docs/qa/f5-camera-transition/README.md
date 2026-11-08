# F5: smoothed surface-to-deep camera transition

Evidence for item 2 of the art programme: F5 in `docs/ART_QUALITY_AUDIT.md` §5.2, the camera whip fix. The audit cites `scene.ts` 788-795 and 1056-1098 on an older commit. Since then, 5bbcaa0 had already replaced the switch at renderY 0.2 with a smoothstep over rows 0 to 4. What `main` still did:

- **The zoom stepped at 120 m.** The target jumped from 1.0 to 1.05 once `campaign.depth` passed 120 m. That depth comes from the vehicle's state, which waits for each cut to finish, so in a drilled descent the step fired with the drawn rig already near row 12.7.
- **The camera followed stiffly, and in pixels.** It used `1 − exp(−22 dt)`, a 45 ms time constant, on the pixel scroll. A zoom change moves that scroll target by world x × Δtile, about 100 px at column 31 for the 5 % step, so the follow dragged the rig across the screen.

## What changed

- **One blend at the surface.** `surfaceFraming` is now 1 − smoothstep(−0.4, 1.6, renderY) (`SURFACE_BLEND` in `view.ts`). The zoom, the vertical framing (`campaignCameraY`) and the home pull all use it, as does the short-landscape offset.
- **Parameterised zoom targets.** `CAMERA_ZOOM` holds surface 0.88, shaft 1.0, deep 1.05, dock and title 0.88, and inspection 1.08. `cameraZoomTarget(renderY, zoom)` blends surface to shaft over `SURFACE_BLEND`, and shaft to deep over `DEEP_BLEND`: rows 9.64 to 13.64, which is 100 to 140 m, centred on the former step. T11 can change the table under D1 without touching either blend.
- **A critically damped follow.** `followSpring` solves a critically damped spring exactly for a target held over the frame, with ω = 9 per second, a time constant of 111 ms. It never overshoots, and the frame rate does not change its path.
  - **Where it runs.** The camera follows the screen centre in world tiles, not the pixel scroll, so a zoom scales the view about the centre instead of dragging the follow across the world.
  - **The zoom.** It follows its target with the same spring, in place of `exp(−24 dt)`.
- **Snaps kept.** A new campaign, a jump of more than 8 tiles or a resize still sets the camera at once; the first two now set the zoom at once too, so an import settles without easing. Reduced motion sets both at once every frame, as before.
- **Exact settling.** Within a quarter of a device pixel, and moving less than that per frame, the camera rests exactly on its target. The zoom does the same within 0.0005, so settled views are stable.
- **Paused reframing.** When the interface changes while the game is paused (the title, for instance), the camera keeps following for `framingTime`. That window is now 1.5 s instead of 0.5 s, because the slower spring needs about 1.3 s to settle a 700 CSS px move at DPR 2; the old follow finished within 0.5 s.

## How it is measured

`scripts/camera-smoke.mjs` (`npm run test:camera`, part of `verify`) now runs two descents in each form (desktop 1440×900, phone 393×851, landscape 568×320), on the scene clock: one `advance()` is one 50 ms frame. Both start from spawn, (20.5, −0.36), in the audit's W01 world (`fresh-w01.json`), with the starter seam's ore marked sold so the hold never fills.

- **Drill:** hold Down and dig natively down the seam column to row 14.6 (146 m), 295 frames.
- **Drop:** the same column open to row 16, so the rig falls from the surface through 120 m, 65 frames.

Each frame records the rig's screen position and the tile size. The script asserts at most 40 CSS px of rig movement per frame and at most 3 % zoom change per 100 ms (two frames). `CAMERA_REPORT_ONLY=1` records without asserting; that is how `main` was measured.

In this world the lander is 15 tiles from spawn, so at the surface the home pull holds the camera about 6 tiles towards it. That pull fading out over the blend is the largest motion in every descent, and it is what the drop's 34 px peak comes from.

## Acceptance

| Line | Target | `main` | F5 | |
|---|---|---|---|---|
| Rig screen movement, worst frame of the six descents | ≤ 40 CSS px per 50 ms | 34.8 | 34.3 | met (`main` met it too) |
| Zoom change, worst 100 ms of the six descents | ≤ 3 % | 4.50 % | 2.39 % | met |
| Fog check, camera round trip (`render-acceptance.mjs`), settled-view captures | pass | pass | pass (local `verify`) | met |
| `npm test`, `format:check` | pass | — | pass | met |

The per-frame tables, before and after, are in [`tables.md`](tables.md), and every frame of both desktop runs is in [`descents.csv`](descents.csv).

| Form | Descent | Rig move, CSS px per 50 ms: `main` → F5 | Zoom change per 100 ms: `main` → F5 |
|---|---|---|---|
| desktop | drill | 19.0 → 15.2 | 4.50 % → 1.03 % |
| desktop | drop | 34.8 → 34.3 | 4.50 % → 2.39 % |
| phone | drill | 12.5 → 5.6 | 4.50 % → 1.03 % |
| phone | drop | 16.8 → 11.5 | 4.50 % → 2.39 % |
| landscape | drill | 12.5 → 4.5 | 4.50 % → 1.03 % |
| landscape | drop | 13.4 → 9.1 | 4.50 % → 2.39 % |

## Notes

- **The 120 m step is gone.** On `main`, the drilled descent's worst frames are the 120 m step: the rig moves 19 px in one frame as the zoom jumps 4.5 % in 100 ms. With F5 the zoom changes by at most 0.18 % per 100 ms through 100–140 m in the drilled descent, and 0.90 % in the drop.
- **The surface blend is narrower than `main`'s.** It spans rows −0.4 to 1.6, as the audit specifies, where `main` already used 0 to 4. A fast drop therefore crosses it sooner: the surface zoom change peaks at 2.39 % per 100 ms against `main`'s 2.06 %, and the rig movement peaks earlier but no higher (34.3 against 34.8 px). Both stay inside the limits.
- **Margin.** The desktop drop peak, 34.3 px, leaves 5.7 px. A rig falling faster through the surface blend than this one would approach the limit; the spring's ω and the blend's width are the parameters to revisit then.
- **The camera smoke's own ascent check** (camera motion near the surface follows the rig rather than snapping) still passes on every form.

## Reproduce

```bash
CAMERA_ARTIFACTS=artifacts/camera npm run test:camera
```

```bash
CAMERA_REPORT_ONLY=1 CAMERA_ARTIFACTS=artifacts/camera-main npm run test:camera
```

```bash
python3 docs/qa/f5-camera-transition/tables.py artifacts/camera-main/results.json artifacts/camera/results.json
```

The second command runs on a checkout of `main` with this branch's `scripts/camera-smoke.mjs`.

## Verification

The whole `verify` job of `checks.yml` passed locally before the push, every step exiting 0, in 757 s:
- `npm test` (276 passed, 5 skipped), `format:check` and `build`;
- `test:improvements` with `behavior,visual,fog,harness`: the fog check, whose views must settle on the same camera twice; the 12 visual captures and the §9 harness, all taken after `settledView`;
- `test:campaign:storage`, `test:feel`, `test:audio` and `test:plan-ui`;
- `test:render`, including the camera round trip, which restores byte-identical terrain pixels after five camera shifts on Canvas and WebGL;
- `test:render:memory`;
- `test:camera`, with the six descents above (identical to the evidence run, frame for frame);
- `test:hud:surface`, and `test:opening:browser` on desktop and portrait.

Local runs use Node 22.23.4 and Playwright's Chromium 153; CI uses Node 24 and Chromium 156.
