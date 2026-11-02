# Improvement smoke fixtures

`improvement-w01.json` and `improvement-w02.json` are formatted copies of the
checkpoints archived in `docs/improvement-plan/shots/`. They describe the playable
`dbf0b1a` baseline and retain the public campaign import envelope.

`scripts/improvement-smoke.mjs` imports these through the real game UI. Individual
scenarios deliberately change position, discovered terrain, resources or mission
proof to isolate rendering and late interactions. They are not evidence of human
progression time. The first-tow and archive-duration scenarios start fresh games.
