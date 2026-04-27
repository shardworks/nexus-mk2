# Tools/CLI events cleanup and Astrolabe events kit declaration

## Intent
Two small cleanups in one commission. Delete the `tool.installed` / `tool.removed` event surface (and its bootstrap-emit helper) that no longer earns its complexity. Add Astrolabe's `supportKit.events` declaration for its existing `astrolabe.plan.files-over-threshold` event.

## Motivation
The two pieces are bundled because both are small and both unblock the same redesign milestone (every plugin that emits has a matching kit declaration; every retained emit site uses its declared name). They share no code beyond living in the same redesign batch.

The `tool.installed` / `tool.removed` events use a "bootstrap-and-emit" pattern: spinning up a guild, resolving Clockworks, emitting, and tearing down — entirely so the emit can happen from a CLI command that doesn't otherwise interact with the running guild. The complexity has not earned its keep; no standing orders consume these events and no current plan requires them.

Astrolabe is the only plugin in the codebase already following the plugin-id-prefix convention organically. It needs a kit declaration to integrate cleanly with the new infrastructure; the emit site itself is unchanged.

## Non-negotiable decisions

### Delete `tool.installed` and `tool.removed`
Remove the emit sites in the framework CLI's plugin install and uninstall commands. Remove the `bootstrapEmitToolEvent` helper module entirely (no other callers). Remove the corresponding test file. Update the plugin install/uninstall command help text if it references the events.

### Add Astrolabe `supportKit.events` (static map)
One declared entry:
- `astrolabe.plan.files-over-threshold` — plan finalize detected manifest file count exceeded the configured threshold (soft warn).

The emit site in Astrolabe's plan-finalize engine is unchanged — it already uses the right name.

## Behavioral cases the design depends on
- `nsg plugin install <name>` succeeds with no event emission — no `tool.installed` row appears in the events book.
- `nsg plugin uninstall <name>` succeeds with no event emission — no `tool.removed` row appears.
- An Astrolabe plan finalize that exceeds the threshold continues to emit `astrolabe.plan.files-over-threshold` — exact same payload, exact same name.
- An anima signal tool emit attempt on `astrolabe.plan.files-over-threshold` fails (framework-owned).

## Documentation
Remove `tool.installed` / `tool.removed` references from `event-catalog.md` and any other docs. Add `astrolabe.plan.files-over-threshold` to `event-catalog.md` if not already present.

## Out of scope
- A replacement event surface for plugin install/uninstall — none planned; if needed in the future, can be reintroduced as a plugin-id-prefixed surface owned by whichever plugin manages installation.
- Other Astrolabe events — Astrolabe declares only the one event today.
- The events-kit infrastructure itself — C1.

## References
- Design root: click `c-mog0glxx`.
- Depends on C1 (events-kit infrastructure) being landed (declared via `spider.follows`).