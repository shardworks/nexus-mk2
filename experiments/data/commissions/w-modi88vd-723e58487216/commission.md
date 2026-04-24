`docs/architecture/clockworks.md` (lines 100-165) still describes the pre-concluded standing-order shape: flat-spread params on top-level keys, plus `summon:` / `brief:` sugar variants. Per concluded click `c-modgto1o`, the canonical form is `{ on, run, with? }` only; sugar forms are dropped and params live under `with:`.

The doc refresh is tracked by brief 12 (`w-modf69vg`) of the Clockworks MVP series, so this is already scheduled. Logged as an observation so it does not fall through the cracks if brief 12 slips. Files to update when the refresh lands:

- `docs/architecture/clockworks.md` — Standing Orders section, guild.json Shape section, summon-verb section (drop entirely), Relay params section (reframe as `with:` contents).
- `docs/reference/event-catalog.md` (if it exists) — event examples may reference old shape.

Not in scope for task 2 itself, but worth surfacing: the relay contract that lands in task 2 must match the concluded shape, not the stale doc.