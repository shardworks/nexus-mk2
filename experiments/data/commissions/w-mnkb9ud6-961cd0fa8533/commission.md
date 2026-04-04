---
author: plan-writer
author_version: 2026-04-04
estimated_complexity: 2
---

# Update core-api.md to Reflect Stacks-based Clockworks

## Summary

Update `docs/reference/core-api.md` to remove pre-Stacks persistence patterns from the Events and Clockworks sections, relocate internal Clockworks runner operations out of the public API, and replace stale pre-writ types in the Ledger section. This is a documentation-only change to a single file.

## Current State

The Events section of core-api.md documents seven functions and three types. Three of these — `listDispatches`, `recordDispatch`, and their backing types — describe internal Clockworks dispatch tracking that references the `event_dispatches` SQL table directly. Two more — `readPendingEvents` and `markEventProcessed` — are Clockworks runner internals that expose implementation details (`processed = 1`). The `signalEvent` description references "the Clockworks events table" and `listEvents` mentions "SQL `LIKE`" by name.

The Clockworks section describes the runner API without noting that persistence is Stacks-based.

The Ledger Shared Types table lists 16 types from the old Work/Piece/Job/Stroke hierarchy, which was replaced by writs. The writ functions are already documented in the Ledger section but their types are missing from the table.

## Requirements

- R1: Remove `listDispatches`, `recordDispatch`, `DispatchRecord`, and `ListDispatchesOptions` from the Events section. These are internal Clockworks apparatus state.
- R2: Remove `readPendingEvents` and `markEventProcessed` from the Events section. These are Clockworks runner internals.
- R3: Remove raw SQL references: "events table" → "event queue"; remove "SQL `LIKE`" framing; remove "dispatch recording" from section header.
- R4: Add a dispatch tracking callout in the Events section noting that dispatch records are managed by the Clockworks apparatus via Stacks books.
- R5: Add Stacks context to the Clockworks section header, noting the apparatus owns event/dispatch state via Stacks and internal operations are not public API.
- R6: Replace the 16 stale Work/Piece/Job/Stroke types in the Ledger Shared Types table with the 4 current writ types: `WritRecord`, `CreateWritOptions`, `ListWritsOptions`, `WritProgress`.

## Scope Decisions

### S1: Dispatch functions removed, not relocated
**Decision:** Remove `listDispatches` and `recordDispatch` entirely. Do not move them to the Clockworks section.
**Rationale:** The Clockworks runner returns dispatch results through `TickResult.dispatches: DispatchSummary[]`. There is no need for a separate `listDispatches` query — callers get dispatch info from `clockTick`/`clockRun` results. `recordDispatch` is a pure internal write used by the runner; exposing it would break the Stacks write-path guarantee.

### S2: readPendingEvents and markEventProcessed removed, not kept as convenience
**Decision:** Remove both functions from the public API surface.
**Rationale:** `readPendingEvents` is the Clockworks runner's queue-drain query. Callers wanting to inspect pending events can use `listEvents(home, { pending: true })`. `markEventProcessed` mutates internal state that should only be touched by the runner. Neither function exists in the current codebase; removing them from the doc costs nothing.

### S3: listEvents LIKE pattern kept, SQL framing removed
**Decision:** Keep the `%` wildcard pattern syntax in `listEvents`. Remove the explicit "SQL `LIKE`" callout.
**Rationale:** The Stacks query language supports `LIKE` as a filter operator (see `WhereCondition` in `stacks.md`). The wildcard behavior is useful and survives the Stacks migration. What changes is framing — the doc should describe the behavior ("exact match or `LIKE` pattern with `%` wildcards") without naming the SQL implementation.

### S4: Pre-writ types replaced, not left in place
**Decision:** Replace all 16 Work/Piece/Job/Stroke types with 4 writ types.
**Rationale:** The four-level hierarchy was removed from the schema. The Ledger section already documents the writ API (`createWrit`, `listWrits`, `showWrit`, `completeWrit`, `failWrit`, `getWritProgress`). The types table should match. The replacement types are derived from the function signatures already documented in the section.

### S5: Broader doc-vs-reality gap is out of scope
**Decision:** Do not update the doc to match actual `nexus-core` exports.
**Rationale:** Most functions documented in core-api.md (Register, Ledger, Daybook, Conversations, Clockworks) are aspirational — they describe the intended API surface but none are currently exported from `@shardworks/nexus-core`. Reconciling the full doc with current exports is a separate, larger effort. This spec addresses only the pre-Stacks persistence patterns called out in the brief.

### S6: Clockworks architecture doc (clockworks.md) is out of scope
**Decision:** Do not update `docs/architecture/clockworks.md` even though it also contains raw SQL schemas for `events` and `event_dispatches`.
**Rationale:** The architecture doc is a design document, not an API reference. Its SQL schema section describes the logical model. Updating architecture docs to remove all SQL references is a separate effort that requires broader design alignment (e.g., do Clockworks events become Stacks books or remain raw SQL?).

### S7: schema.md is out of scope
**Decision:** Do not update `docs/reference/schema.md` even though it documents `events` and `event_dispatches` as SQL tables.
**Rationale:** The schema reference documents the current physical schema. Until the Clockworks apparatus is implemented with Stacks books and the SQL tables are actually removed, the schema reference should reflect reality.

## Design

All changes are to a single file: `docs/reference/core-api.md`.

### Events Section (R1, R2, R3, R4)

**Remove these function blocks:**
- `readPendingEvents(home): GuildEvent[]` (lines 65–67)
- `markEventProcessed(home, eventId): void` (lines 73–75)
- `listDispatches(home, opts?): DispatchRecord[]` (lines 87–96)
- `recordDispatch(home, opts): void` (lines 98–114)

**Update section header (line 46):**
```
Before: The event system — signaling, reading, validation, dispatch recording.
After:  The event system — signaling, reading, and validation.
```

**Update `signalEvent` description (line 50):**
```
Before: Signal an event — persist it to the Clockworks events table.
After:  Signal an event — persist it to the Clockworks event queue.
```

**Update `listEvents` name filter (line 82):**
```
Before: filter by name pattern (SQL `LIKE` — use `%` for wildcards)
After:  filter by event name (exact match or `LIKE` pattern with `%` wildcards)
```

**Update Types table (lines 116–122):**

Remove `DispatchRecord` and `ListDispatchesOptions` rows. Keep only `ListEventsOptions`.

**Add dispatch tracking callout** after the types table:
> **Dispatch tracking.** Dispatch records (what ran in response to each event) are internal Clockworks operational state, managed by the Clockworks apparatus via Stacks books. They are not part of the `nexus-core` API surface. See the Clockworks section for the runner API that exposes dispatch results.

### Clockworks Section (R5)

**Update section description (line 440):**
```
Before:
The event processing runner — matches pending events to standing orders and dispatches them.

After:
The event processing runner — matches pending events to standing orders and dispatches them. The Clockworks apparatus owns its event and dispatch state via Stacks books (not raw SQL tables). Internal operations — reading pending events, marking events processed, recording dispatches — are handled by the apparatus and are not part of the public API. The runner functions below expose dispatch results without leaking persistence details.
```

### Ledger Shared Types (R6)

**Replace lines 285–300** (the 16 stale types) with:

| Type | Description |
|------|-------------|
| `WritRecord` | id, type, title, description, status, parentId, sessionId, createdAt, updatedAt |
| `CreateWritOptions` | `{ type, title, description?, parentId? }` |
| `ListWritsOptions` | `{ status?, type?, parentId? }` |
| `WritProgress` | `{ total, completed, failed, cancelled, pending, active, ready }` |

## Validation Checklist

- V1 [R1]: `grep -c "listDispatches\|recordDispatch\|DispatchRecord\|ListDispatchesOptions" docs/reference/core-api.md` returns 0.
- V2 [R2]: `grep -c "readPendingEvents\|markEventProcessed" docs/reference/core-api.md` returns 0.
- V3 [R3]: `grep -c "events table\|SQL.*LIKE\|dispatch recording" docs/reference/core-api.md` returns 0.
- V4 [R4]: `grep "Dispatch tracking" docs/reference/core-api.md` matches the callout.
- V5 [R5]: `grep "Stacks books" docs/reference/core-api.md` matches the Clockworks section.
- V6 [R6]: `grep -c "WorkRecord\|PieceRecord\|JobRecord\|StrokeRecord" docs/reference/core-api.md` returns 0. `grep "WritRecord" docs/reference/core-api.md` matches.
- V7: The remaining Events functions (`signalEvent`, `isFrameworkEvent`, `validateCustomEvent`, `readEvent`, `listEvents`) are unchanged except for the SQL de-framing.
- V8: The Clockworks runner functions (`clockTick`, `clockRun`, `clockStart`, `clockStop`, `clockStatus`) and their types are unchanged.

## Test Cases

No automated tests — this is a documentation-only change. Validation is via grep checks in the checklist above.