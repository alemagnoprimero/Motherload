# Interface implementation direction

The 2026-11-02 continuation implements the improvement plan's recommended interface direction. The working title is **The Deep Frontier**. The underlying repository and existing browser-save namespace remain stable.

## Visual reference

The archived [HUD](improvement-plan/analysis/05-hud.md) and [menu](improvement-plan/analysis/06-menus.md) audits define the layouts and tokens. The [D0 concept board](art-direction/README.md) supplies a world/HUD composition reference. These references are implementation targets; their existence does not assert that an owner review or human usability study has occurred.

- Inter for controls and body text; Big Shoulders Display for headings and prominent numbers. Font files ship locally with their OFL licenses.
- Chamfered dark translucent panels, amber emphasis and cyan focus; the current palette and visible keyboard focus remain recognizable.
- Gameplay fills the viewport. Conditions, the active mission and tools are overlays, with the rig's usable area measured from their bounds.
- Important values target at least 18 CSS pixels, labels at least 12, and menu body text predominantly at least 14. Touch actions target 44 pixels.
- Persistent return-reserve state explains the trip home. Hazard notices remain visible independently of progress messages.
- Expanded objectives, recent notices, logs, records and settings belong in in-game drawers or menus.

## Navigation and feedback

The front door offers Continue, New expedition and Settings. Existing expeditions begin paused; New expedition preserves the outgoing campaign in the archive. Pause uses separate pages and a back action. Trade, Workshop and Construction are distinct terminal views with stable focus during transactions.

Keyboard, mouse, the floating touch joystick and controller share the simulation. Context actions use clear verbs. Destructive decisions state what is kept and lost; confirmation is available to keyboard and controller users. Browser modifier shortcuts and focused form fields do not drive the vehicle.

Sales and installations commit simulation state before presentation. Reward presentations can be skipped and do not advance simulation time. Reduced motion removes moving particles, camera shifts and squash effects without changing gameplay timing. Sound, alarms, haptics and shake have independent remembered settings; sound unlocks only on a user gesture.

## Verification boundary

Automated viewport, focus, event, persistence and pixel checks provide regression evidence. The implementation progress record identifies the latest measured results and remaining limitations. Physical Android performance and novice comprehension require separate device/playtesting evidence and must not be inferred from browser emulation.
