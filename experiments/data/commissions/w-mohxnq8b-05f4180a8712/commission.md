The brief deletes five `commission.*` names plus `guild.initialized`, `migration.applied`, `standing-order.failed`, and `schedule.fired`. Operators with existing `guild.json` standing orders bound to these names see no boot error — their orders just silently never fire. The same goes for `clockworks.events` overrides keyed on the deleted names.

A one-time startup warning naming the deleted name and the standing-order index would catch this class of operator drift. Place at:

- `Clockworks.start()` after the kit-build, before the dispatcher's first sweep.
- Or inside the standing-order validator itself — walk `on:` strings against a hardcoded set of known-deleted names.

Decision D13 explicitly defers this. Worth tracking as a separate commission once C2-C5 land and the dust settles.