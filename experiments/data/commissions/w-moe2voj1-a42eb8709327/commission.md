Click `c-modgto1o-0add9a2a7f26` is concluded: the `{ on, run, with? }` standing-order shape is the only canonical form; `summon:` and `brief:` sugar are dropped. The standing-order validator already enforces this (`standing-order-validator.ts:45-49`). But several docs still describe the dropped sugar as if it were live:

- `docs/architecture/clockworks.md:121-133` — entire `### The summon verb (syntactic sugar)` section.
- `docs/architecture/clockworks.md:113-119` — the `standingOrders` example mixes sugar and canonical forms.
- `docs/architecture/clockworks.md:151` — the relay-params section explains `summon:`/`brief:` exclusion.
- `docs/architecture/clockworks.md:212, 264-266` — the error-handling and guild.json examples use `summon:` sugar.
- `docs/reference/event-catalog.md:153-171` — `### Order Types` documents both `summon:` and `brief:` as live order types.
- `docs/reference/event-catalog.md:208,226-228` — cookbook examples use `summon:` sugar.
- `docs/architecture/apparatus/clerk.md:882` — example uses `summon:` form.

Brief 12 (`w-modf69vg`) tracks an architecture-doc refresh and the click conclusion explicitly references it. This observation just inventories the surface area so the eventual refresh has a checklist.