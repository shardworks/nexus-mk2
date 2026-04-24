# Refresh Clockworks architecture doc

## Intent

Bring `docs/architecture/clockworks.md` into sync with what actually ships. The doc was written as a design document before implementation; several of its specifics now diverge from the landed surface, most notably the standing-order shape (nested `with:` rather than flat-spread params), the absence of `summon:` and `brief:` sugar forms, and the promotion of scheduled standing orders from a "Deferred" bullet to a first-class feature. This commission rewrites the affected sections and refreshes examples throughout so the doc is a trustworthy reference for plugin authors and operators.

## Motivation

The architecture doc is the canonical reference for anyone writing a relay, authoring a standing order, or contributing a ClockworksKit plugin. If the doc describes a flat-spread param shape and the code expects nested `with:`, every new plugin author falls into a confusing collision zone. If the doc shows `{ summon: "artificer" }` as a valid sugar form and the loader rejects it, the first-time experience is a broken example copied from the doc.

This is specifically called out as its own commission because the sage planning any of the earlier code commissions will (correctly) treat architecture-doc updates as out-of-scope for that commission. Making it a first-class task ensures the doc refresh actually happens.

## Non-negotiable decisions

### Rewrite the Standing Orders section around the `{ on, run, with? }` shape

The doc's current Standing Orders section states *"Every standing order has one canonical form: `{ on, run, ...params }`."* Update to the new canonical form:

```typescript
interface StandingOrder {
  on: string;              // event trigger (or schedule, see below)
  run: string;             // relay name
  with?: Record<string, unknown>;   // params passed to the relay
  // Clockworks-reserved metadata keys may be added over time (schedule, id, enabled, etc.)
}
```

Examples in the section should show the nested `with:` form. Add a short rationale paragraph: top-level keys are Clockworks-reserved metadata; relay params live under `with:` so the two namespaces cannot collide. Pattern follows GitHub Actions' `with:`.

### Remove the summon-sugar and brief-sugar sections

The doc has a dedicated *"The `summon` verb (syntactic sugar)"* subsection describing `summon:` desugaring into `run: summon-relay`. Delete this subsection in full. The `brief:` sugar is similarly removed from any anticipated form.

Keep the **Summon relay params** subsection — the summon relay itself still ships as the stdlib relay. Adjust the invocation examples there to use the canonical `run: summon-relay` with params inside `with:`.

### Add a Scheduled Standing Orders section; remove it from "Deferred"

Currently the Deferred section at the bottom of the doc reads:

> Scheduled standing orders — time-triggered rather than event-triggered. Deferred.

Scheduled orders now ship. Remove this bullet from the Deferred section and add a new first-class Scheduled Standing Orders section (placement: after the main Standing Orders section, before or near The Clockworks Runner).

The new section describes:

- The `schedule:` top-level key as an alternative trigger to `on:`; standing orders have exactly one trigger source.
- Cron-expression syntax (standard 5-field unix cron) and `@every <duration>` fixed-interval syntax with `s`/`m`/`h` units.
- Missed-fire semantics: one fire on daemon restart if `nextFireTime` is past; no backfill.
- The synthesized `schedule.fired` event name (reserved framework namespace).
- Validation at `guild.json` load time.
- Mutual exclusion with `on:` (a single standing order cannot have both).

Example in the new section:

```json
{ "schedule": "*/5 * * * *", "run": "reckoner-tick" }
{ "schedule": "@every 1h", "run": "tech-debt-scan", "with": { "depth": "full" } }
```

### Refresh the `guild.json` Shape example

The doc has a full `guild.json` Shape block listing sample standing orders. Rewrite every sample order to use the canonical `{ on, run, with? }` form; drop any `summon:` sugar entries. Include at least one `schedule:` order in the sample so the scheduled form is visible.

### Refresh the Relay Contract section

The Relay Contract section mentions that *"Params are extracted from the standing order at dispatch time — any key that isn't `on` or `run` becomes a param."* Update to describe the `with:` extraction: params are `order.with ?? {}`. The rest of the section (handler signature, `relay()` factory, `RelayContext`) can stay as-is.

### Audit for other flat-spread references

Walk the full doc once end-to-end and update any remaining references to the old flat-spread shape, including:

- Error Handling section's example `standingOrder` payload
- ClockworksKit section's relay invocation examples
- Any code snippet using the old destructuring pattern

Consistency is the whole point of this commission.

### Preserve the rest of the doc's structure and prose

Only the sections touched by substance changes are rewritten. Sections describing Events, the Runner, the signal tool, the Clockworks Schema (events/event_dispatches tables), daemon Phase 2, book CDC auto-wiring, and Error Handling (loop guard) can stay as-is — they match the shipping implementation. Do not restructure the doc beyond what the substance changes require.

## Out of scope

- **New architecture decisions.** This commission records what shipped; it does not invent new design.
- **Reference-doc updates outside `clockworks.md`.** The event catalog (`docs/reference/event-catalog.md`), guild-metaphor doc, and other references may also need touch-ups — those are separate concerns and tracked separately if needed.
- **Migration guides for hypothetical upgrade paths.** No existing guild is running the flat-spread shape in production; no migration guide is needed.
- **Sanitizing or rewriting the Deferred section as a whole.** Remove only the scheduled-standing-orders bullet. Other deferred items (natural-language triggers, pre-event hooks, payload schema enforcement, webhook injection, log rotation) remain deferred.
- **Adding rationale essays.** Brief inline rationale where the shape change warrants it; not deep-dive justifications.

## Behavioral cases the design depends on

- A reader opening `docs/architecture/clockworks.md` sees the canonical standing-order shape as `{ on, run, with? }` with nested `with:` for params; no `summon:` sugar appears anywhere.
- The Scheduled Standing Orders section describes the `schedule:` trigger at the same level of authority as the `on:` trigger; cron syntax and `@every` are documented with examples.
- The Deferred section no longer lists scheduled standing orders.
- The `guild.json` Shape block shows realistic examples using `with:` and at least one `schedule:` order.
- Every code snippet in the doc that shows standing-order syntax uses the nested-params shape.

## References

- `docs/architecture/clockworks.md` — the doc to refresh
- `c-mo1mql8a` — Clockworks MVP timer apparatus