# Animator event surface migration

## Intent
Migrate Animator's event surface onto the kit-contribution mechanism delivered in C1. Renames session events with the `animator.` prefix, deletes events that no longer earn their keep, and adds Animator's `supportKit.events` declaration as a static map.

## Motivation
Animator emits six events today: three about the session lifecycle (`session.started`, `session.ended`, `session.record-failed`) which need plugin-id prefixing; two about anima identity (`anima.manifested`, `anima.session.ended`) which are subsumed by the renamed session events for v0; and one cross-plugin oddity (`commission.session.ended`) where Animator emits in Clerk's namespace based on a payload-driven check. The cross-plugin emit was the symptom of the wrong abstraction — commissions are no longer treated as a special case in the redesigned event surface (covered by `writ.mandate.<status>` from C2).

## Non-negotiable decisions

### Add Animator `supportKit.events` (static map)
Three declared entries:
- `animator.session.started` — anima session entered running state.
- `animator.session.ended` — anima session terminal-emit (any outcome).
- `animator.session.record-failed` — detached session record write failed.

Static map; no function form needed.

### Rename emit sites in Animator's session-emission helper
- `session.started` → `animator.session.started`.
- `session.ended` → `animator.session.ended`.
- `session.record-failed` → `animator.session.record-failed`.

The `safeEmit` helper, payload shapes, and best-effort try/catch breadcrumb behavior are unchanged. Only the event name changes.

### Delete decommissioned emit sites
Remove emit sites and supporting code for:
- `commission.session.ended` — including the Clerk apparatus lookup, the `parentId` walk to root mandate, and the conditional emit logic that fires only when session metadata's `writId` resolves to a root mandate.
- `anima.manifested` — the `animator.session.started` emit subsumes it for v0.
- `anima.session.ended` — the `animator.session.ended` emit subsumes it.

The Clerk apparatus lookup helper and the root-mandate-walk machinery in Animator's session-emission module are removed entirely (no longer needed once `commission.session.ended` is gone).

## Behavioral cases the design depends on
- A session entering `running` fires exactly one `animator.session.started` event.
- A session terminal-emit fires exactly one `animator.session.ended` event.
- A failed session record write fires exactly one `animator.session.record-failed` event.
- A session terminal-emit on a session whose writ is a child of a root mandate fires `animator.session.ended` only — no commission-specific event.
- A session with anima role metadata fires `animator.session.started` / `animator.session.ended` like any other session — no anima-specific event.
- An anima signal tool emit attempt on `animator.session.started` (or any other Animator name) fails (framework-owned).

## Documentation
Refresh `animator.md` and `event-catalog.md` to reflect the new event names and the removed events.

## Out of scope
- Re-introducing anima identity events in a future commission once the Roster apparatus lands — out of scope here. The `EventSpec` reservation supports adding them later non-breakingly.
- Re-introducing commission-aware events in any form — the redesign treats commissions as `writ.mandate.<...>`, not specially.
- The events-kit infrastructure itself — C1.

## References
- Design root: click `c-mog0glxx`.
- Depends on C1 (events-kit infrastructure) being landed (declared via `spider.follows`).