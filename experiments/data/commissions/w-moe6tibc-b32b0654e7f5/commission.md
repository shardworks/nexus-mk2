Lifted from the planning run of "Scheduled standing orders (cron) — MVP-1" (w-modf696g-466fb615667c). Each numbered observation below is a draft mandate ready for curator promotion.

1. Refresh `docs/reference/event-catalog.md` reserved-namespace list and Clockworks events table
2. Refresh `docs/reference/core-api.md` `isFrameworkEvent` and Clockworks Schema sections
3. Add a `clock list` filter for `schedule.fired` events when scheduled orders are heavily used
4. Hot-edit support for scheduled standing orders
5. Move scheduled-standing-orders 'Deferred' bullet update from sibling commission to this one if sequencing matters
6. Daemon tick interval interaction with `@every` sub-second scheduling
7. Cron-parser dependency adds a new third-party library to the Clockworks apparatus
8. Standing-order validator drops the unknown-key error message for `schedule:` once it lands
