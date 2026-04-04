# Inventory: core-api.md pre-Stacks Clockworks API

## Summary

`docs/reference/core-api.md` documents the public API surface of `@shardworks/nexus-core`. The Events section and parts of the Clockworks section describe a pre-Stacks persistence model — referencing raw SQL tables (`event_dispatches`), SQL query patterns (`SQL LIKE`), and exposing internal Clockworks runner operations (`recordDispatch`, `readPendingEvents`, `markEventProcessed`) as public API. Additionally, the Ledger Shared Types table contains 16 stale types from a four-level work hierarchy (Work/Piece/Job/Stroke) that was replaced by the writ system.

---

## Affected Files

| File | Change |
|------|--------|
| `docs/reference/core-api.md` | Primary target — Events section, Clockworks section, Ledger types |

No other files are modified. This is a documentation-only change.

---

## Issue 1: Dispatch functions in Events section (lines 87–122)

### `listDispatches(home, opts?): DispatchRecord[]` (lines 87–96)

Lists event dispatch records with filters. References `DispatchRecord` and `ListDispatchesOptions` types. This is an internal Clockworks operation — dispatch records are operational state of the Clockworks apparatus, not part of the public `nexus-core` API. The Clockworks apparatus will own this via Stacks books.

### `recordDispatch(home, opts): void` (lines 98–114)

Records a dispatch in the `event_dispatches` table. Explicitly names a raw SQL table. Used internally by the Clockworks runner. Not a public API.

### Types (lines 116–122)

`DispatchRecord` and `ListDispatchesOptions` are the types backing the two dispatch functions above.

**Evidence:** The Clockworks architecture doc states: "The event and dispatch tables are internal Clockworks operational state — not part of the guild's Books." The Stacks API contract states: "Direct database access in `nexus-clockworks` and `nexus-sessions` is replaced with `guild().apparatus<StacksApi>('stacks')` calls."

---

## Issue 2: Clockworks runner internals in Events section (lines 65–75)

### `readPendingEvents(home): GuildEvent[]` (lines 65–67)

Reads unprocessed events ordered by `fired_at`. This is the Clockworks runner's queue-draining operation, not a general-purpose read.

### `markEventProcessed(home, eventId): void` (lines 73–75)

Marks an event as processed (`sets processed = 1`). References a raw SQL column value. Internal to the Clockworks runner — the runner marks events processed after dispatching standing orders.

**Evidence:** `readPendingEvents` and `markEventProcessed` are not exported from `@shardworks/nexus-core` (checked `packages/framework/core/src/index.ts`). These functions do not exist in the codebase at all — the doc is aspirational.

---

## Issue 3: Raw SQL references in Events section (lines 46–82)

### Section header (line 46)

"The event system — signaling, reading, validation, **dispatch recording**." — dispatch recording is not part of this section's public API.

### `signalEvent` description (line 50)

"persist it to the Clockworks **events table**" — references a raw SQL table name.

### `listEvents` name filter (line 82)

"filter by name pattern (**SQL `LIKE`** — use `%` for wildcards)" — exposes SQL implementation detail.

---

## Issue 4: Clockworks section lacks Stacks context (line 440)

The Clockworks section (line 440) describes the runner API without mentioning that event/dispatch persistence is Stacks-based. The section header says only "matches pending events to standing orders and dispatches them." No indication that dispatch tracking, pending-event reads, and processed-marking are handled internally by the apparatus.

---

## Issue 5: Stale pre-writ types in Ledger Shared Types (lines 285–300)

The Ledger Shared Types table includes 16 types from the old four-level work hierarchy:

| Stale Type | Old Entity |
|-----------|-----------|
| `WorkRecord`, `CreateWorkOptions`, `ListWorksOptions`, `UpdateWorkOptions` | Works |
| `PieceRecord`, `CreatePieceOptions`, `ListPiecesOptions`, `UpdatePieceOptions` | Pieces |
| `JobRecord`, `CreateJobOptions`, `ListJobsOptions`, `UpdateJobOptions` | Jobs |
| `StrokeRecord`, `CreateStrokeOptions`, `ListStrokesOptions`, `UpdateStrokeOptions` | Strokes |

The writ system replaced all four levels. The schema reference (`docs/reference/schema.md`) confirms: "Writs are typed, tree-structured obligations that replace the earlier four-level hierarchy (works, pieces, jobs, strokes)." The Ledger section already documents writs (`createWrit`, `listWrits`, `showWrit`, etc.) but the types table still lists the old hierarchy.

**Missing writ types:** `WritRecord`, `CreateWritOptions`, `ListWritsOptions`, and `WritProgress` (returned by `getWritProgress`) are documented in the function signatures above the table but not listed as types.

---

## Actual `@shardworks/nexus-core` Exports (Current State)

For reference, the actual exports from `packages/framework/core/src/index.ts`:

```typescript
// Plugin model: Kit, Apparatus, Plugin, LoadedKit, LoadedApparatus, LoadedPlugin, StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus
// Guild singleton: Guild, guild, setGuild, clearGuild
// Paths: findGuildRoot, nexusDir, worktreesPath, clockPidPath, clockLogPath
// Package resolution: derivePluginId, readGuildPackageJson, resolvePackageNameForPluginId, resolveGuildPackageEntry
// Guild config: GuildConfig, createInitialGuildConfig, readGuildConfig, writeGuildConfig, EventDeclaration, StandingOrder, ClockworksConfig, GuildSettings, guildConfigPath
// IDs: generateId
// Version: VERSION
```

None of the event, register, ledger, daybook, clockworks, or conversation functions documented in core-api.md are currently exported. The doc is aspirational — describing the intended public API. This inventory addresses the parts that describe a pre-Stacks persistence model; the broader doc-vs-reality gap is noted in observations.

---

## Cross-references

- **Clockworks architecture:** `docs/architecture/clockworks.md` — defines events/dispatches as internal operational state; shows the SQL schema (also pre-Stacks)
- **Stacks API contract:** `docs/architecture/apparatus/stacks.md` — mandates all persistence through Stacks books
- **Schema reference:** `docs/reference/schema.md` — documents `events` and `event_dispatches` tables, confirms writ replacement of old hierarchy
- **Observation #4 from remove-dispatch-apparatus:** This spec was filed from that observation
