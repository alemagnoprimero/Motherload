# Balance 0.3

This version extends 0.2 through `balance-overlay.json`. Values are credits in design data and integer tenths in runtime records. The build recomputes world budgets, ore floors and route totals, then compares the active version with runtime configuration.

Overlays affect rules read at use and newly generated worlds. Existing terrain, deposits, collected package values and bulk are preserved by schema 3 migration. See `docs/IMPROVEMENT_PLAN.md` for the approved improvement recommendations and their measurement targets.
