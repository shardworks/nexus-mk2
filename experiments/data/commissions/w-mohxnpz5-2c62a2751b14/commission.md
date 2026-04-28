The guild.json templates shipped with the framework (and any starter packs) likely wire `commission.posted`, `commission.completed`, `commission.sealed`, `commission.failed`, `schedule.fired`, or `standing-order.failed` as `on:` triggers. After C2 those triggers stop matching anything and the standing orders silently no-op. C2 itself replaces the names in source code and docs but cannot reach an operator's existing `guild.json`. Sweep:

- `packages/framework/cli/src/templates/` (or wherever the `nsg init` template lives)
- Any bundle directory in the repo (grep `clockworks` + `standingOrders` together)
- The default `astrolabe`, `spider`, etc. plugin bundles for any wired `commission.*`

Update the names lockstep with C2's docs refresh, and consider a one-time startup warning when `clockworks.standingOrders` references a known-deleted name (the `validatorWarning` option from D13).

This is a separate commission because it spans multiple plugin templates and depends on C2's vocabulary having landed.