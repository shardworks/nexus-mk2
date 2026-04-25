The summon-relay brief (and the architecture/event-catalog docs) assume that writs emit lifecycle events of the form `{type}.ready` (etc.) with payload `{ writId, parentId?, commissionId? }` (`docs/reference/event-catalog.md:43`). A grep across all packages shows **no code path emits these events today** — the Clerk's `transition()` does not call `clockworks.emit()`, and the only existing `clockworks.emit()` site is the auto-wired CDC observer in `clockworks.ts:326`.

This is the first commission whose acceptance depends on those events firing in production. Without it, the summon relay can be wired by an operator, the standing order can validate, but no `{type}.ready` event will ever be emitted to drive the dispatch.

A follow-up commission needs to wire framework emission of writ lifecycle events. Likely surfaces:

- `packages/plugins/clerk/src/clerk.ts` — inside `transition()`: after a successful state machine transition, call `clockworks.emit('{type}.{phase}', { writId, parentId, ... }, 'framework')` for the new phase.
- The Clerk would need to reference the Clockworks api lazily (Clockworks already requires Clerk, so a hard requires would be circular — lazy resolve via `guild().apparatus<ClockworksApi>('clockworks')` is the cleanest path).
- Decide which phases emit (`ready`, `completed`, `failed`, `stuck` per the doc; or every transition uniformly).
- Decide whether to map plugin-defined writ-type state names onto a normalized vocabulary (e.g. `<type>.ready` regardless of internal phase name) or emit verbatim phase names.

The current event-catalog wording (`Writ transitions to ready — available for dispatch`) presumes mandate-style phase names; a normalized event vocabulary would be more durable across plugin-contributed writ types.