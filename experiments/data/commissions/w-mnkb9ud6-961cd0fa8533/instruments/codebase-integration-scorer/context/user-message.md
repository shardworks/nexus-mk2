## Commission Spec

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

## Commission Diff

```
 docs/reference/core-api.md | 69 +++++++---------------------------------------
 1 file changed, 10 insertions(+), 59 deletions(-)

diff --git a/docs/reference/core-api.md b/docs/reference/core-api.md
index 6487c87..c28e5df 100644
--- a/docs/reference/core-api.md
+++ b/docs/reference/core-api.md
@@ -43,11 +43,11 @@ Resolve a single engine from a module's default export. Same pattern as `resolve
 
 ## Events
 
-The event system — signaling, reading, validation, dispatch recording. Events are immutable facts persisted to the Clockworks event queue. The Clockworks runner processes them separately via `nsg clock`.
+The event system — signaling, reading, and validation. Events are immutable facts persisted to the Clockworks event queue. The Clockworks runner processes them separately via `nsg clock`.
 
 ### `signalEvent(home, name, payload, emitter): string`
 
-Signal an event — persist it to the Clockworks events table. Does **not** process the event.
+Signal an event — persist it to the Clockworks event queue. Does **not** process the event.
 
 - `name` — event name (e.g. `"commission.posted"`, `"code.reviewed"`)
 - `payload` — JSON-serializable event data, or `null`
@@ -62,64 +62,27 @@ Check if an event name is in a reserved framework namespace. Reserved namespaces
 
 Validate that a custom event name is declared in `guild.json` clockworks.events. **Throws** if the name is in a reserved namespace or not declared.
 
-### `readPendingEvents(home): GuildEvent[]`
-
-Read all unprocessed events from the queue, ordered by `fired_at` ascending.
-
 ### `readEvent(home, id): GuildEvent | null`
 
 Read a single event by ID.
 
-### `markEventProcessed(home, eventId): void`
-
-Mark an event as processed (sets `processed = 1`).
-
 ### `listEvents(home, opts?): GuildEvent[]`
 
 List events with optional filters. Returns newest first.
 
 **Options (`ListEventsOptions`):**
-- `name?: string` — filter by name pattern (SQL `LIKE` — use `%` for wildcards)
+- `name?: string` — filter by event name (exact match or `LIKE` pattern with `%` wildcards)
 - `emitter?: string` — filter by emitter
 - `pending?: boolean` — `true` = unprocessed only, `false` = processed only, omit for all
 - `limit?: number` — max results
 
-### `listDispatches(home, opts?): DispatchRecord[]`
-
-List event dispatch records with optional filters.
-
-**Options (`ListDispatchesOptions`):**
-- `eventId?: string`
-- `handlerType?: string` — `"engine"` or `"anima"`
-- `handlerName?: string`
-- `status?: string` — `"success"` or `"error"`
-- `limit?: number`
-
-### `recordDispatch(home, opts): void`
-
-Record a dispatch in the `event_dispatches` table. Used by the Clockworks runner.
-
-```typescript
-recordDispatch(home, {
-  eventId: string,
-  handlerType: 'engine' | 'anima',
-  handlerName: string,
-  targetRole?: string,
-  noticeType?: 'summon' | 'brief',
-  startedAt: string,
-  endedAt: string,
-  status: 'success' | 'error',
-  error?: string,
-})
-```
-
 ### Types
 
 | Type | Description |
 |------|-------------|
 | `ListEventsOptions` | Filters for `listEvents()` |
-| `DispatchRecord` | A single dispatch record (id, eventId, handlerType, handlerName, etc.) |
-| `ListDispatchesOptions` | Filters for `listDispatches()` |
+
+> **Dispatch tracking.** Dispatch records (what ran in response to each event) are internal Clockworks operational state, managed by the Clockworks apparatus via Stacks books. They are not part of the `nexus-core` API surface. See the Clockworks section for the runner API that exposes dispatch results.
 
 ---
 
@@ -282,22 +245,10 @@ Returns `{ total, completed, failed, cancelled, pending, active, ready }` — co
 | `CommissionSummary` | id, content, status, workshop, statusReason, createdAt, updatedAt |
 | `CommissionDetail` | Summary + assignments[] + sessions[] |
 | `ListCommissionsOptions` | `{ status?, workshop? }` |
-| `WorkRecord` | id, commissionId, title, description, status, createdAt, updatedAt |
-| `CreateWorkOptions` | `{ title, description?, commissionId? }` |
-| `ListWorksOptions` | `{ status?, commissionId? }` |
-| `UpdateWorkOptions` | `{ title?, description?, status? }` |
-| `PieceRecord` | id, workId, title, description, status, createdAt, updatedAt |
-| `CreatePieceOptions` | `{ title, description?, workId? }` |
-| `ListPiecesOptions` | `{ status?, workId? }` |
-| `UpdatePieceOptions` | `{ title?, description?, status? }` |
-| `JobRecord` | id, pieceId, title, description, status, assignee, createdAt, updatedAt |
-| `CreateJobOptions` | `{ title, description?, pieceId?, assignee? }` |
-| `ListJobsOptions` | `{ status?, pieceId?, assignee? }` |
-| `UpdateJobOptions` | `{ title?, description?, status?, assignee? }` |
-| `StrokeRecord` | id, jobId, kind, content, status, createdAt, updatedAt |
-| `CreateStrokeOptions` | `{ jobId, kind, content? }` |
-| `ListStrokesOptions` | `{ jobId?, status? }` |
-| `UpdateStrokeOptions` | `{ status?, content? }` |
+| `WritRecord` | id, type, title, description, status, parentId, sessionId, createdAt, updatedAt |
+| `CreateWritOptions` | `{ type, title, description?, parentId? }` |
+| `ListWritsOptions` | `{ status?, type?, parentId? }` |
+| `WritProgress` | `{ total, completed, failed, cancelled, pending, active, ready }` |
 
 ---
 
@@ -437,7 +388,7 @@ Full conversation detail including all turns.
 
 ## Clockworks
 
-The event processing runner — matches pending events to standing orders and dispatches them.
+The event processing runner — matches pending events to standing orders and dispatches them. The Clockworks apparatus owns its event and dispatch state via Stacks books (not raw SQL tables). Internal operations — reading pending events, marking events processed, recording dispatches — are handled by the apparatus and are not part of the public API. The runner functions below expose dispatch results without leaking persistence details.
 
 ### `clockTick(home, eventId?): Promise<TickResult | null>`
 

```

## Full File Contents (for context)

=== FILE: docs/reference/core-api.md ===
# Core API Reference

`@shardworks/nexus-core` — the shared infrastructure library for the guild system. All functions take `home: string` (the guild root path) as their first argument unless noted otherwise.

---

## Authoring

> **Note:** The `tool()` factory, `ToolDefinition`, `ToolCaller`, `isToolDefinition()`, and `resolveToolFromExport()` have moved to `@shardworks/tools-apparatus`. See the [Instrumentarium API Contract](../architecture/apparatus/instrumentarium.md) for the tool authoring API.

The following SDK factories remain in `@shardworks/nexus-core`:

### `engine(def): EngineDefinition`

Define a clockwork engine — an event-driven handler invoked by standing orders.

```typescript
engine({
  name: string,
  handler: (event: GuildEvent | null, ctx: EngineContext) => Promise<void>,
}): EngineDefinition
```

The handler receives the triggering `GuildEvent` (or `null` for direct invocation) and an `EngineContext` (`{ home: string }`).

### `isClockworkEngine(obj): obj is EngineDefinition`

Type guard — checks if a value has the `__clockwork: true` brand.

### `resolveEngineFromExport(moduleDefault, engineName?): EngineDefinition | null`

Resolve a single engine from a module's default export. Same pattern as `resolveToolFromExport`.

### Types

| Type | Description |
|------|-------------|
| `GuildEvent` | `{ id, name, payload, emitter, firedAt }` — immutable event from the queue |
| `EngineContext` | `{ home: string }` — injected into engine handlers |
| `EngineDefinition` | A fully-defined clockwork engine (return type of `engine()`) |

---

## Events

The event system — signaling, reading, and validation. Events are immutable facts persisted to the Clockworks event queue. The Clockworks runner processes them separately via `nsg clock`.

### `signalEvent(home, name, payload, emitter): string`

Signal an event — persist it to the Clockworks event queue. Does **not** process the event.

- `name` — event name (e.g. `"commission.posted"`, `"code.reviewed"`)
- `payload` — JSON-serializable event data, or `null`
- `emitter` — who signaled it: anima name, engine name, or `"framework"`
- **Returns:** the event ID (e.g. `"evt-a3f7b2c1"`)

### `isFrameworkEvent(name): boolean`

Check if an event name is in a reserved framework namespace. Reserved namespaces: `anima.`, `commission.`, `tool.`, `migration.`, `guild.`, `standing-order.`, `session.`. Note: writ lifecycle events (e.g. `mandate.ready`, `task.completed`) are framework-emitted but use guild-defined type names — they are not in this list. See [Event Catalog](event-catalog.md#writ-lifecycle-events).

### `validateCustomEvent(home, name): void`

Validate that a custom event name is declared in `guild.json` clockworks.events. **Throws** if the name is in a reserved namespace or not declared.

### `readEvent(home, id): GuildEvent | null`

Read a single event by ID.

### `listEvents(home, opts?): GuildEvent[]`

List events with optional filters. Returns newest first.

**Options (`ListEventsOptions`):**
- `name?: string` — filter by event name (exact match or `LIKE` pattern with `%` wildcards)
- `emitter?: string` — filter by emitter
- `pending?: boolean` — `true` = unprocessed only, `false` = processed only, omit for all
- `limit?: number` — max results

### Types

| Type | Description |
|------|-------------|
| `ListEventsOptions` | Filters for `listEvents()` |

> **Dispatch tracking.** Dispatch records (what ran in response to each event) are internal Clockworks operational state, managed by the Clockworks apparatus via Stacks books. They are not part of the `nexus-core` API surface. See the Clockworks section for the runner API that exposes dispatch results.

---

## Register

Anima identity and lifecycle — creation, querying, updating, and removal.

### `instantiate(opts): InstantiateResult`

Create a new anima in the guild. Validates roles exist and have available seats, reads and snapshots curriculum/temperament content at current versions. All operations run in a single transaction.

**Options (`InstantiateOptions`):**
- `home: string`
- `name: string` — must be unique
- `roles: string[]` — at least one required; each must be defined in guild.json
- `curriculum?: string` — by name (must be registered in guild.json)
- `temperament?: string` — by name (must be registered in guild.json)

**Returns (`InstantiateResult`):** `{ animaId, name, roles, curriculum, temperament }`

### `listAnimas(home, opts?): AnimaSummary[]`

List animas with optional filters by `status` and/or `role`.

### `showAnima(home, animaId): AnimaDetail | null`

Show detailed info for a single anima. Accepts either ID or name.

### `updateAnima(home, animaId, opts): AnimaDetail`

Update an anima's status and/or roles. Accepts either ID or name. When updating roles, replaces all existing roles.

**Options (`UpdateAnimaOptions`):**
- `status?: string` — new status value
- `roles?: string[]` — complete replacement set

### `removeAnima(home, animaId): void`

Retire an anima — sets status to `'retired'` and removes all roster entries. Accepts either ID or name.

### Manifest Functions

These functions assemble an anima's identity for a session.

### `readAnima(home, animaName): AnimaRecord`

Read an anima's full record including roles and composition metadata. **Throws** if not found.

### Tool Resolution

Tool resolution has moved to **The Instrumentarium** (`@shardworks/tools-apparatus`). The Loom resolves an anima's roles into a flat permissions array, then calls `instrumentarium.resolve({ permissions, channel })` to get the available tool set. See [The Instrumentarium — Permission Model](../architecture/apparatus/instrumentarium.md#permission-model).

### `readCodex(home): string`

Read all `.md` files from the `codex/` directory (non-recursive). Returns them joined with `---` separators.

### `readRoleInstructions(home, config, animaRoles): string`

Read role-specific instructions for an anima's roles from the files pointed to by role definitions in guild.json.

### `assembleSystemPrompt(codex, roleInstructions, anima, tools, unavailable?): string`

Assemble the composed system prompt. Sections included in order: Codex → Role Instructions → Training (curriculum) → Temperament → Tool Instructions → Unavailable Tools notice.

### `manifest(home, animaName): Promise<ManifestResult>`

The main entry point for session preparation. Reads composition, resolves tools, assembles system prompt. **Throws** if anima is not active.

**Returns (`ManifestResult`):**
- `anima: AnimaRecord`
- `systemPrompt: string`
- `composition: { codex, roleInstructions, curriculum, temperament, toolInstructions }`
- `tools: ResolvedTool[]`
- `unavailable: UnavailableTool[]`
- `warnings: string[]`

### Types

| Type | Description |
|------|-------------|
| `AnimaSummary` | id, name, status, roles, createdAt |
| `AnimaDetail` | Full detail including curriculum/temperament names and versions |
| `AnimaRecord` | Full record with composition snapshots (used by manifest) |
| `ListAnimasOptions` | `{ status?, role? }` |
| `UpdateAnimaOptions` | `{ status?, roles? }` |
| `InstantiateOptions` | Options for `instantiate()` |
| `InstantiateResult` | `{ animaId, name, roles, curriculum, temperament }` |
| `ResolvedTool` | `{ name, path, instructions, package }` |
| `UnavailableTool` | `{ name, reasons[] }` |
| `ManifestResult` | Full manifest with composition provenance |

---

## Ledger

Commission lifecycle and writ CRUD. All entities are historical records — no deletes, only status transitions.

### Commissions

#### `commission(opts): CommissionResult`

Post a commission to the guild. Creates a record with status `"posted"`, creates a mandate writ linked to the commission, and signals `commission.posted`. Validates that the workshop exists in guild.json.

**Options (`CommissionOptions`):** `{ home, spec, workshop }`

**Returns:** `{ commissionId }`

#### `listCommissions(home, opts?): CommissionSummary[]`

List commissions. Filter by `status` and/or `workshop`.

#### `readCommission(home, commissionId): { id, content, status, workshop, statusReason, writId } | null`

Read a commission record (basic fields only).

#### `showCommission(home, commissionId): CommissionDetail | null`

Extended commission view including assignments (anima ID, name, assigned-at) and linked sessions (session ID, anima ID, started/ended-at).

#### `updateCommissionStatus(home, commissionId, status, reason): void`

Update a commission's status and reason.

### Writs

#### `createWrit(home, opts): WritRecord`

Create a writ. Signals `{type}.ready`. Options: `{ type, title, description?, parentId? }`. The type must be a built-in type (`mandate`, `summon`) or declared in `guild.json` `writTypes`.

#### `listWrits(home, opts?): WritRecord[]`

Filter by `status`, `type`, and/or `parentId`.

#### `showWrit(home, writId): WritRecord | null`

#### `updateWritStatus(home, writId, status): WritRecord`

Transition a writ's status. Signals `{type}.completed` on completion, `{type}.failed` on failure. Failure cascades cancellation to incomplete children.

#### `completeWrit(home, writId): CompletionResult`

Mark a writ as completed. If the writ has incomplete children, transitions to `pending` instead. When all children complete, auto-transitions to `ready` (if a standing order exists for `{type}.ready`) or `completed` (if not). Returns `{ changed, newStatus }`.

#### `failWrit(home, writId, reason): void`

Mark a writ as failed. Cascades cancellation to all incomplete children. Signals `{type}.failed`.

#### `getWritProgress(home, writId): WritProgress`

Returns `{ total, completed, failed, cancelled, pending, active, ready }` — counts of child writs by status.

### Shared Types

| Type | Description |
|------|-------------|
| `CompletionCheck` | `{ complete: boolean, total, done, pending, failed }` |
| `CompletionResult` | `{ changed: boolean, newStatus: string }` |
| `CommissionOptions` | `{ home, spec, workshop }` |
| `CommissionResult` | `{ commissionId }` |
| `CommissionSummary` | id, content, status, workshop, statusReason, createdAt, updatedAt |
| `CommissionDetail` | Summary + assignments[] + sessions[] |
| `ListCommissionsOptions` | `{ status?, workshop? }` |
| `WritRecord` | id, type, title, description, status, parentId, sessionId, createdAt, updatedAt |
| `CreateWritOptions` | `{ type, title, description?, parentId? }` |
| `ListWritsOptions` | `{ status?, type?, parentId? }` |
| `WritProgress` | `{ total, completed, failed, cancelled, pending, active, ready }` |

---

## Daybook

Session tracking and audit trail.

### `listSessions(home, opts?): SessionSummary[]`

List sessions with optional filters. Returns newest first.

**Options (`ListSessionsOptions`):**
- `anima?: string` — filter by anima name or ID
- `workshop?: string`
- `trigger?: string` — `"consult"`, `"summon"`, `"brief"`, or `"convene"`
- `status?: 'active' | 'completed'` — active = no `ended_at`, completed = has `ended_at`
- `limit?: number`

### `showSession(home, sessionId): SessionDetail | null`

Full session detail including all token usage, cost, duration, composition metadata, and record path.

### `listAuditLog(home, opts?): AuditEntry[]`

List audit log entries, newest first.

**Options (`ListAuditLogOptions`):**
- `actor?: string` — e.g. `"patron"`, `"operator"`, `"framework"`, `"instantiate"`
- `action?: string` — e.g. `"commission_posted"`, `"anima_updated"`
- `targetType?: string` — e.g. `"commission"`, `"anima"`, `"writ"`
- `targetId?: string`
- `limit?: number`

### Session Funnel

The unified session infrastructure. ALL sessions flow through `launchSession()`.

### `registerSessionProvider(provider): void`

Register a session provider (e.g. claude-code, claude-api). Called once at startup.

### `getSessionProvider(): SessionProvider | null`

Get the registered session provider.

### `resolveWorkspace(payload): ResolvedWorkspace`

Resolve workspace context from an event payload. Returns `{ kind: 'guildhall' }`, `{ kind: 'workshop-temp', workshop, worktreePath }`, or `{ kind: 'workshop-managed', workshop, worktreePath }`.

### `createTempWorktree(home, workshop): string`

Create a temporary worktree from a workshop's bare repo (detached HEAD at main). Returns the absolute path.

### `removeTempWorktree(home, workshop, worktreePath): void`

Remove a temporary worktree. Logs but does not throw on failure.

### `launchSession(options): Promise<SessionResult>`

Launch a session through the registered provider. The complete lifecycle:
1. Create temp worktree (if `workshop-temp`)
2. Insert `session.started` row in Daybook
3. Signal `session.started` event
4. Delegate to provider
5. Update session row with metrics
6. Write SessionRecord JSON to `.nexus/sessions/`
7. Signal `session.ended` event
8. Tear down temp worktree (if autonomous + workshop-temp)

**Guarantees:** Steps 5–8 execute even if the provider throws.

### Types

| Type | Description |
|------|-------------|
| `SessionSummary` | id, animaId, provider, trigger, workshop, workspaceKind, startedAt, endedAt, exitCode, costUsd, durationMs |
| `SessionDetail` | Full record including token usage, composition metadata, providerSessionId, recordPath |
| `ListSessionsOptions` | Filters for `listSessions()` |
| `SessionProvider` | `{ name, launch(opts), launchStreaming?(opts) }` — the provider contract |
| `SessionProviderLaunchOptions` | What the provider receives (home, manifest, prompt, interactive, cwd, claudeSessionId?, ...) |
| `SessionProviderResult` | What the provider returns (exitCode, tokenUsage?, costUsd?, durationMs, ...) |
| `SessionLaunchOptions` | Full options for `launchSession()` — includes conversationId?, turnNumber?, claudeSessionId?, onChunk? |
| `SessionResult` | `{ sessionId, exitCode, tokenUsage?, costUsd?, durationMs, providerSessionId?, transcript?, conversationId?, turnNumber? }` |
| `SessionChunk` | Union: `{ type: 'text', text }` \| `{ type: 'tool_use', tool }` \| `{ type: 'tool_result', tool }` |
| `WorkspaceContext` | `{ workshop?, worktreePath? }` — standard event payload fields |
| `ResolvedWorkspace` | Discriminated union: guildhall, workshop-temp, or workshop-managed |
| `SessionRecord` | Full session record written to disk as JSON |
| `AuditEntry` | id, actor, action, targetType, targetId, detail, timestamp |
| `ListAuditLogOptions` | Filters for `listAuditLog()` |

---

## Conversations

Multi-turn interaction with animas — web consultation and convene sessions. See the **[Conversations API Reference](./conversations.md)** for the full guide including schema, integration patterns, and analytics queries.

### `createConversation(home, opts): CreateConversationResult`

Create a new conversation with participant records. Does NOT take a first turn.

### `takeTurn(home, conversationId, participantId, message): AsyncGenerator<ConversationChunk>`

Take a turn in a conversation. Manifests the anima, calls `launchSession()` with `--resume` threading, streams response chunks. The core primitive.

### `endConversation(home, conversationId, reason?): void`

End a conversation. Sets status to `'concluded'` or `'abandoned'`.

### `nextParticipant(home, conversationId): { participantId, name } | null`

Next participant in a convene rotation (round-robin). Returns `null` if done.

### `formatConveneMessage(home, conversationId, participantId): string`

Format the message for the next convene participant (new turns since their last).

### `listConversations(home, opts?): ConversationSummary[]`

List conversations. Filter by `status`, `kind`, `limit`.

### `showConversation(home, conversationId): ConversationDetail | null`

Full conversation detail including all turns.

### Types

| Type | Description |
|------|-------------|
| `ConversationChunk` | Union: text, tool_use, tool_result, turn_complete |
| `CreateConversationOptions` | Options for `createConversation()` |
| `CreateConversationResult` | `{ conversationId, participants[] }` |
| `ConversationSummary` | List view with computed turnCount and totalCostUsd |
| `ConversationDetail` | Full view with turns array |
| `ListConversationsOptions` | Filters for `listConversations()` |

---

## Clockworks

The event processing runner — matches pending events to standing orders and dispatches them. The Clockworks apparatus owns its event and dispatch state via Stacks books (not raw SQL tables). Internal operations — reading pending events, marking events processed, recording dispatches — are handled by the apparatus and are not part of the public API. The runner functions below expose dispatch results without leaking persistence details.

### `clockTick(home, eventId?): Promise<TickResult | null>`

Process a single event. If `eventId` is provided, processes that specific event. Otherwise, processes the next pending event. Returns `null` if no events to process.

### `clockRun(home): Promise<ClockRunResult>`

Process all pending events until the queue is empty. Loops because standing order failures may generate new events (`standing-order.failed`).

### `clockStart(home, options?): ClockStartResult`

Start the clockworks daemon as a detached background process. The daemon polls the event queue at the specified interval and processes events automatically.

```typescript
clockStart(home, { interval: 2000 })
// => { pid: 12345, logFile: '/path/to/.nexus/clock.log' }
```

Options: `{ interval?: number }` — polling interval in ms (default 2000). All options are optional. Throws if the daemon is already running.

### `clockStop(home): ClockStopResult`

Stop the running clockworks daemon. Sends SIGTERM and removes the PID file. Handles stale PID files gracefully.

```typescript
clockStop(home)
// => { pid: 12345, stopped: true }
```

### `clockStatus(home): ClockStatus`

Check whether the clockworks daemon is running. Cleans up stale PID files automatically.

```typescript
clockStatus(home)
// => { running: true, pid: 12345, logFile: '...', uptime: 360000 }
// or { running: false }
```

### Types

| Type | Description |
|------|-------------|
| `TickResult` | `{ eventId, eventName, dispatches: DispatchSummary[] }` |
| `DispatchSummary` | `{ handlerType, handlerName, status, error? }` |
| `ClockRunResult` | `{ processed: TickResult[], totalEvents }` |
| `ClockStartOptions` | `{ interval?: number }` |
| `ClockStartResult` | `{ pid, logFile }` |
| `ClockStopResult` | `{ pid, stopped }` |
| `ClockStatus` | `{ running, pid?, logFile?, uptime? }` |

---

## Guild Config

Reading and writing `guild.json` — the guild's central configuration file.

### `readGuildConfig(home): GuildConfig`

Read and parse `guild.json` from the guild root.

### `writeGuildConfig(home, config): void`

Write `guild.json` to the guild root (pretty-printed with trailing newline).

### `guildConfigPath(home): string`

Resolve the path to `guild.json`.

### `createInitialGuildConfig(name, nexusVersion, model): GuildConfig`

Create the default guild.json content for a new guild. All registries start empty.

### Types

| Type | Description |
|------|-------------|
| `GuildConfig` | The full guild.json shape: name, nexus, plugins, settings, plus plugin config sections |

---

## Infrastructure

Path resolution, ID generation, preconditions, workshops, worktrees, bundles, migrations, tool installation, and guild initialization.

### Paths

| Function | Returns |
|----------|---------|
| `findGuildRoot(startDir?)` | Guild root path (walks up looking for `guild.json`). Throws if not found. |
| `nexusDir(home)` | `.nexus` directory path |
| `booksPath(home)` | `.nexus/nexus.db` — the Books SQLite database |
| `ledgerPath(home)` | *(Deprecated)* Alias for `booksPath()` |
| `worktreesPath(home)` | `.nexus/worktrees` — commission worktrees root |
| `workshopsPath(home)` | `.nexus/workshops` — bare clone directory |
| `workshopBarePath(home, name)` | `.nexus/workshops/{name}.git` |

### IDs

#### `generateId(prefix): string`

Generate a prefixed hex ID: `{prefix}-{8 hex chars}`.

| Prefix | Entity |
|--------|--------|
| `a-` | anima |
| `c-` | commission |
| `conv-` | conversation |
| `cpart-` | conversation participant |
| `evt-` | event |
| `ses-` | session |
| `wrt-` | writ |

Additional prefixes used internally: `aud-` (audit log), `ed-` (event dispatch), `r-` (roster), `ac-` (anima composition), `ca-` (commission assignment).

### `VERSION: string`

The framework version string, read from `@shardworks/nexus-core/package.json`.

### Tool Installation

#### `installTool(opts): InstallResult`

Install a tool, engine, curriculum, or temperament into the guild. Supports five source types: registry, git-url, workshop, tarball, link.

**Options (`InstallToolOptions`):** `{ home, source, name?, roles?, commit?, link?, bundle? }`

**Returns (`InstallResult`):** `{ category, name, installedTo, sourceKind, warnings }`

#### `removeTool(opts): RemoveResult`

Remove a tool from the guild. Deregisters from guild.json, removes from disk, cleans up node_modules.

**Options (`RemoveToolOptions`):** `{ home, name, category? }`

#### `classifySource(source, link?): SourceKind`

Classify a source string: `'registry'`, `'git-url'`, `'workshop'`, `'tarball'`, or `'link'`.

### Tool Registry

#### `listTools(home, category?): ToolSummary[]`

List all installed artifacts from guild.json. Filter by category (`'tools'`, `'engines'`, `'curricula'`, `'temperaments'`).

### Preconditions

#### `readPreconditions(descriptorPath): Precondition[]`

Read preconditions from a descriptor file. Returns empty array if none declared.

#### `checkOne(precondition): PreconditionCheckResult`

Run a single precondition check.

#### `checkPreconditions(preconditions): PreconditionCheckResult[]`

Check all preconditions in an array.

#### `checkAllPreconditions(home, config): ToolPreconditionResult[]`

Check preconditions for all tools and engines in a guild.

#### `checkToolPreconditions(descriptorPath): PreconditionCheckResult[]`

Convenience wrapper for install-time warnings.

**Precondition types:**
- `CommandPrecondition` — checks if a command exists on PATH
- `CommandOutputPrecondition` — runs a command, checks stdout against a regex
- `EnvPrecondition` — checks if an env var is set and non-empty

### Workshops

#### `addWorkshop(opts): AddWorkshopResult`

Clone a remote repo as a bare clone and register in guild.json.

#### `removeWorkshop(opts): void`

Remove bare clone, worktrees, and guild.json entry.

#### `listWorkshops(home): WorkshopInfo[]`

List all workshops with status (cloned, active worktree count).

#### `showWorkshop(home, name): WorkshopDetail | null`

Detailed workshop info including bare path and default branch.

#### `createWorkshop(opts): AddWorkshopResult`

Create a new GitHub repo via `gh`, then add it as a workshop. Seeds with an initial commit on `main`.

#### `checkGhAuth(): string | null`

Check if `gh` is installed and authenticated. Returns `null` if OK, error message otherwise.

#### `deriveWorkshopName(input): string`

Derive a workshop name from a URL or `org/name` format.

### Worktrees

#### `setupWorktree(config): WorktreeResult`

Create a git worktree for a commission session. Creates a branch `commission-{id}` from the base branch.

#### `teardownWorktree(home, workshop, commissionId): void`

Remove a commission worktree. Does **not** delete the branch.

#### `listWorktrees(home, workshop?): WorktreeResult[]`

List active commission worktrees.

### Bundles

#### `readBundleManifest(bundleDir): BundleManifest`

Read and validate `nexus-bundle.json`. Enforces: tools/engines require `package`, content requires `package` or `path`, migrations require `path`.

#### `installBundle(opts): InstallBundleResult`

Install all artifacts from a bundle manifest. Handles transitive bundles (nested `nexus-bundle.json`).

#### `isBundleDir(dir): boolean`

Check if a directory contains `nexus-bundle.json`.

### Migrations

#### `discoverMigrations(migrationsDir): MigrationFile[]`

Discover migration files matching `NNN-description.sql`, sorted by sequence.

#### `applyMigrations(home, provenance?): MigrateResult`

Apply pending SQL migrations. Each runs in its own transaction. Tracks applied migrations in `_migrations` table.

### Upgrade

#### `planUpgrade(home, bundleDir, bundleSource?): UpgradePlan`

Plan a framework upgrade by diffing the guild's current state against a bundle. Read-only — inspects the guild and bundle but makes no changes. Returns an `UpgradePlan` describing new migrations, updated content, and stale animas.

#### `applyUpgrade(home, bundleDir, plan): UpgradeResult`

Apply an upgrade plan. Installs new migrations (renumbered into the guild's sequence), updates content artifacts (curricula/temperaments), and bumps the nexus version in `guild.json`. Does **not** recompose stale animas — that is a separate operator decision.

**Types:**
- `UpgradePlan` — `{ bundleSource, migrations, contentUpdates, staleAnimas, isEmpty }`
- `UpgradeResult` — `{ migrationsApplied, contentUpdated, staleAnimaCount }`
- `MigrationPlanEntry` — `{ bundleFilename, guildSequence, guildFilename }`
- `ContentUpdateEntry` — `{ category, name, installedVersion, bundleVersion, bundlePath }`
- `StaleAnimaEntry` — `{ id, name, roles, curriculum, temperament }` (curriculum/temperament are `{ composedVersion, currentVersion } | null`)

### Guild Init

#### `initGuild(home, name, model): void`

Initialize a new guild — creates guild.json, package.json, .git, .nexus directory, and applies migrations.

### Rehydrate

#### `rehydrate(home): RehydrateResult`

Reconstruct runtime state after a fresh clone: re-clone workshop bare repos, `npm install` for registry deps, reinstall workshop/tarball tools from on-disk source, report linked tools needing re-linking.

### Types

| Type | Description |
|------|-------------|
| `SourceKind` | `'registry' \| 'git-url' \| 'workshop' \| 'tarball' \| 'link'` |
| `InstallToolOptions` | Full options for `installTool()` |
| `InstallResult` | `{ category, name, installedTo, sourceKind, warnings }` |
| `RemoveToolOptions` | `{ home, name, category? }` |
| `RemoveResult` | `{ category, name, removedFrom }` |
| `ToolSummary` | `{ name, category, upstream, installedAt, bundle? }` |
| `Precondition` | Union: CommandPrecondition \| CommandOutputPrecondition \| EnvPrecondition |
| `PreconditionCheckResult` | `{ precondition, passed, message? }` |
| `ToolPreconditionResult` | `{ name, category, available, checks, failures }` |
| `AddWorkshopOptions` | `{ home, name, remoteUrl }` |
| `AddWorkshopResult` | `{ name, remoteUrl, barePath }` |
| `RemoveWorkshopOptions` | `{ home, name }` |
| `WorkshopInfo` | `{ name, remoteUrl, addedAt, cloned, activeWorktrees }` |
| `WorkshopDetail` | WorkshopInfo + `{ barePath, defaultBranch }` |
| `CreateWorkshopOptions` | `{ home, repoName, private? }` |
| `WorktreeConfig` | `{ home, workshop, commissionId, baseBranch? }` |
| `WorktreeResult` | `{ path, branch, commissionId }` |
| `BundleManifest` | `{ description?, tools?, engines?, curricula?, temperaments?, migrations? }` |
| `BundlePackageEntry` | `{ package, name? }` |
| `BundleContentEntry` | `{ package?, path?, name? }` |
| `BundleMigrationEntry` | `{ path }` |
| `InstallBundleOptions` | `{ home, bundleDir, bundleSource?, commit? }` |
| `InstallBundleResult` | `{ installed, artifacts, migrationProvenance? }` |
| `MigrationFile` | `{ sequence, filename, path }` |
| `MigrationProvenance` | `{ bundle, originalName }` |
| `MigrateResult` | `{ applied[], skipped[], total }` |
| `RehydrateResult` | `{ workshopsCloned[], workshopsFailed[], fromPackageJson, fromSlotSource[], needsRelink[] }` |



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: docs/reference/schema.md ===
# Schema Reference

The guild's Books database (``.nexus/nexus.db``) — SQLite, WAL mode, foreign keys enforced. All entity IDs are TEXT using prefixed hex format.

---

## Entity Relationship Diagram

```
                            ┌─────────────────────┐
                            │    commissions       │
                            │─────────────────────│
                            │ id (c-)              │
                            │ content              │
                            │ status               │
                            │ workshop             │
                            └──────┬──────┬────────┘
                                   │      │
                    ┌──────────────┘      └──────────────┐
                    │                                    │
        ┌───────────┴──────────┐          ┌──────────────┴──────────┐
        │ commission_assignments│          │  commission_sessions    │
        │──────────────────────│          │─────────────────────────│
        │ commission_id ←──────│          │ commission_id ←─────────│
        │ anima_id ────────────│──┐       │ session_id ─────────────│──┐
        └──────────────────────┘  │       └─────────────────────────┘  │
                                  │                                    │
        ┌─────────────────────────┘                                    │
        │                                                              │
   ┌────┴──────────────┐                                ┌──────────────┴──────┐
   │     animas        │                                │      sessions       │
   │───────────────────│                                │─────────────────────│
   │ id (a-)           │                                │ id (ses-)           │
   │ name (unique)     │                                │ anima_id ───────────│──→ animas
   │ status            │                                │ provider, model     │
   └────┬──────────────┘                                │ trigger, workshop   │
        │                                               │ token usage, cost   │
        │                                               └─────────────────────┘
   ┌────┴──────────────────┐
   │  anima_compositions   │     ┌───────────────┐
   │───────────────────────│     │    roster      │
   │ anima_id (unique) ────│     │───────────────│
   │ curriculum snapshot   │     │ anima_id ──────│──→ animas
   │ temperament snapshot  │     │ role           │
   └───────────────────────┘     └───────────────┘


   ┌─────────────────────┐
   │       writs         │
   │─────────────────────│
   │ id (wrt-)           │
   │ type, title         │
   │ status              │
   │ parent_id ──────────│──→ writs (self-ref, optional)
   │ session_id          │
   └─────────────────────┘
        ↑                    ↑
        │                    │
   commissions.writ_id   sessions.writ_id


   ┌─────────────────────┐          ┌──────────────────────┐
   │      events         │          │   event_dispatches   │
   │─────────────────────│          │──────────────────────│
   │ id (evt-)           │          │ id (ed-)             │
   │ name, payload       │←─────────│ event_id             │
   │ emitter, fired_at   │          │ handler_type/name    │
   │ processed           │          │ target_role          │
   └─────────────────────┘          │ status, error        │
                                    └──────────────────────┘

   ┌─────────────────────┐
   │    audit_log        │
   │─────────────────────│
   │ id (aud-)           │
   │ actor, action       │
   │ target_type/id      │
   │ detail, timestamp   │
   └─────────────────────┘
```

---

## Table-by-Table Reference

### `animas`

The Register — anima identity records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (a-) |
| `name` | TEXT | NOT NULL, UNIQUE | Human-readable name |
| `status` | TEXT | NOT NULL, CHECK | One of: `aspirant`, `active`, `retired` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |

### `anima_compositions`

Frozen snapshots of an anima's training content at instantiation time.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, UNIQUE, FK → animas | One composition per anima |
| `curriculum_name` | TEXT | NOT NULL | Curriculum name at instantiation |
| `curriculum_version` | TEXT | NOT NULL | Curriculum version at instantiation |
| `temperament_name` | TEXT | NOT NULL | Temperament name at instantiation |
| `temperament_version` | TEXT | NOT NULL | Temperament version at instantiation |
| `curriculum_snapshot` | TEXT | NOT NULL | Full curriculum content (frozen) |
| `temperament_snapshot` | TEXT | NOT NULL | Full temperament content (frozen) |
| `composed_at` | TEXT | NOT NULL, DEFAULT now | When the composition was created |

### `roster`

Role assignments — which animas hold which roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, FK → animas | The anima |
| `role` | TEXT | NOT NULL | Role name (must match guild.json roles) |
| `standing` | INTEGER | NOT NULL, DEFAULT 0 | Reserved for future use |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | When the role was assigned |

### `commissions`

Patron-posted work orders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (c-) |
| `content` | TEXT | NOT NULL | The commission specification |
| `status` | TEXT | NOT NULL, CHECK | One of: `posted`, `assigned`, `in_progress`, `completed`, `failed` |
| `workshop` | TEXT | NOT NULL | Target workshop name |
| `status_reason` | TEXT | | Human-readable reason for current status |
| `writ_id` | TEXT | FK → writs | The commission's mandate writ (set on posting) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `commission_assignments`

Join table — which animas are assigned to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | |
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | |

UNIQUE constraint on `(commission_id, anima_id)`.

### `writs`

Tracked work items — the Ledger's core table. Writs are typed, tree-structured obligations that replace the earlier four-level hierarchy (works, pieces, jobs, strokes).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (wrt-) |
| `type` | TEXT | NOT NULL | Writ type — guild-defined (e.g. `task`, `feature`) or built-in (`mandate`, `summon`) |
| `title` | TEXT | NOT NULL | Human-readable summary |
| `description` | TEXT | | Full description, acceptance criteria, etc. |
| `status` | TEXT | NOT NULL, DEFAULT 'ready', CHECK | One of: `ready`, `active`, `pending`, `completed`, `failed`, `cancelled` |
| `parent_id` | TEXT | FK → writs | Parent writ (null for root writs) |
| `session_id` | TEXT | | Currently bound session (cleared on completion/interruption) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

Indexes: `idx_writs_parent`, `idx_writs_status`, `idx_writs_type_status`.

**Cross-references:** `commissions.writ_id` points to the commission's mandate writ. `sessions.writ_id` points to the writ the session is working on.

### `audit_log`

The Daybook audit trail — records of all significant actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (aud-) |
| `actor` | TEXT | NOT NULL | Who did it: `patron`, `operator`, `framework`, `instantiate`, anima name |
| `action` | TEXT | NOT NULL | What happened: `commission_posted`, `anima_updated`, `writ_created`, etc. |
| `target_type` | TEXT | | Entity type: `commission`, `anima`, `writ`, `session`, `conversation` |
| `target_id` | TEXT | | Entity ID |
| `detail` | TEXT | | JSON-encoded additional context |
| `timestamp` | TEXT | NOT NULL, DEFAULT now | |

### `events`

The Clockworks event queue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (evt-) |
| `name` | TEXT | NOT NULL | Event name (e.g. `commission.posted`, `code.reviewed`) |
| `payload` | TEXT | | JSON-encoded event data |
| `emitter` | TEXT | NOT NULL | Who signaled it |
| `fired_at` | TEXT | NOT NULL, DEFAULT now | |
| `processed` | INTEGER | NOT NULL, DEFAULT 0 | 0 = pending, 1 = processed |

### `event_dispatches`

Dispatch records — what happened when a standing order executed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ed-) |
| `event_id` | TEXT | NOT NULL, FK → events | The triggering event |
| `handler_type` | TEXT | NOT NULL | `engine` or `anima` |
| `handler_name` | TEXT | NOT NULL | Engine name or anima name |
| `target_role` | TEXT | | Role name (for anima dispatches) |
| `notice_type` | TEXT | | `summon` or `brief` (for anima dispatches) |
| `started_at` | TEXT | | |
| `ended_at` | TEXT | | |
| `status` | TEXT | | `success` or `error` |
| `error` | TEXT | | Error message if status is error |

### `sessions`

Session records — every session launched through the funnel.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ses-) |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `provider` | TEXT | NOT NULL | Session provider name (e.g. `claude-code`) |
| `model` | TEXT | | Model identifier |
| `trigger` | TEXT | NOT NULL | `consult`, `summon`, `brief`, or `convene` |
| `workshop` | TEXT | | Workshop name (null for guildhall sessions) |
| `workspace_kind` | TEXT | NOT NULL | `guildhall`, `workshop-temp`, or `workshop-managed` |
| `curriculum_name` | TEXT | | |
| `curriculum_version` | TEXT | | |
| `temperament_name` | TEXT | | |
| `temperament_version` | TEXT | | |
| `roles` | TEXT | | JSON array of role names |
| `started_at` | TEXT | NOT NULL | |
| `ended_at` | TEXT | | Null while session is active |
| `exit_code` | INTEGER | | |
| `input_tokens` | INTEGER | | |
| `output_tokens` | INTEGER | | |
| `cache_read_tokens` | INTEGER | | |
| `cache_write_tokens` | INTEGER | | |
| `cost_usd` | REAL | | |
| `duration_ms` | INTEGER | | |
| `provider_session_id` | TEXT | | Provider's own session identifier |
| `record_path` | TEXT | | Path to the SessionRecord JSON file (relative to guild root) |
| `conversation_id` | TEXT | FK → conversations | Conversation this turn belongs to (null for standalone sessions) |
| `turn_number` | INTEGER | | Position within the conversation (1-indexed) |
| `writ_id` | TEXT | FK → writs | Bound writ (set by clockworks for writ-driven sessions; null for conversations) |

### `conversations`

Multi-turn interactions grouping multiple sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (conv-) |
| `status` | TEXT | NOT NULL, DEFAULT 'active', CHECK | One of: `active`, `concluded`, `abandoned` |
| `kind` | TEXT | NOT NULL, CHECK | `consult` or `convene` |
| `topic` | TEXT | | Seeding prompt or subject |
| `turn_limit` | INTEGER | | Maximum total turns (null = unlimited) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `ended_at` | TEXT | | |
| `event_id` | TEXT | | For convene: the triggering event ID |

### `conversation_participants`

Participants in a conversation — human or anima.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (cpart-) |
| `conversation_id` | TEXT | NOT NULL, FK → conversations | |
| `kind` | TEXT | NOT NULL, CHECK | `anima` or `human` |
| `name` | TEXT | NOT NULL | Anima name or `'patron'` |
| `anima_id` | TEXT | | FK to animas (null for humans) |
| `claude_session_id` | TEXT | | Provider session ID for `--resume` threading |

### `commission_sessions`

Join table — which sessions are linked to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `session_id` | TEXT | NOT NULL, FK → sessions | |

PRIMARY KEY on `(commission_id, session_id)`.

### `_migrations`

Internal tracking table for the migration system. Not part of the regular schema.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sequence` | INTEGER | PRIMARY KEY | Migration sequence number |
| `filename` | TEXT | NOT NULL | Migration filename |
| `applied_at` | TEXT | NOT NULL, DEFAULT now | |
| `bundle` | TEXT | | Bundle that delivered this migration |
| `original_name` | TEXT | | Original filename before renumbering |

---

## Status Lifecycles

### Anima

```
aspirant → active → retired
```

- **aspirant** — created but not yet activated (not currently used by `instantiate()`, which creates directly as `active`)
- **active** — manifested for sessions, holds roles, can be dispatched
- **retired** — removed from service, roster entries deleted

### Commission

```
posted → assigned → in_progress → completed
                                → failed
```

- **posted** — created by patron, waiting for dispatch. A mandate writ is created and linked.
- **assigned** — (manual transition) an anima has been assigned
- **in_progress** — the Clockworks has summoned an anima (automatic on `summon` dispatch)
- **completed** — the mandate writ is fulfilled
- **failed** — manually set when the commission cannot be completed

### Writ

```
ready → active → completed
               → failed → cancelled (cascade)
               → pending → ready (when children complete)
                         → completed (auto, if no standing order)
ready → cancelled
```

- **ready** — available for dispatch. Signals `{type}.ready` (e.g. `mandate.ready`, `task.ready`)
- **active** — an anima is working on it (session bound)
- **pending** — the anima called `complete-session` but child writs are still incomplete. Automatically transitions back to `ready` (or auto-completes) when all children finish.
- **completed** — obligation fulfilled. Signals `{type}.completed`. Triggers completion rollup on parent.
- **failed** — unrecoverable failure. Signals `{type}.failed`. Cascades cancellation to incomplete children.
- **cancelled** — withdrawn, either directly or by cascade from a failed parent.

### Conversation

```
active → concluded
       → abandoned
```

- **active** — conversation is in progress, turns can be taken
- **concluded** — conversation ended normally (turn limit reached or explicitly concluded)
- **abandoned** — conversation ended abnormally (browser disconnect, timeout)

---

## ID Conventions

All entity IDs use the format `{prefix}-{8 hex chars}` where the hex is generated from 4 random bytes (`crypto.randomBytes(4)`).

| Prefix | Entity | Example |
|--------|--------|---------|
| `a-` | Anima | `a-5e6f7a8b` |
| `c-` | Commission | `c-a3f7b2c1` |
| `conv-` | Conversation | `conv-1a2b3c4d` |
| `cpart-` | Conversation participant | `cpart-5e6f7a8b` |
| `evt-` | Event | `evt-1a2b3c4d` |
| `ses-` | Session | `ses-deadbeef` |
| `wrt-` | Writ | `wrt-12345678` |
| `aud-` | Audit log entry | `aud-aabbccdd` |
| `ed-` | Event dispatch | `ed-55667788` |
| `r-` | Roster entry | `r-99aabbcc` |
| `ac-` | Anima composition | `ac-ddeeff00` |
| `ca-` | Commission assignment | `ca-11223344` |

8 hex characters = 4 random bytes ≈ 4.3 billion possibilities per prefix. Sufficient for a single-guild system.

Generation: `generateId(prefix)` from `@shardworks/nexus-core`.

=== CONTEXT FILE: docs/reference/event-catalog.md ===
# Event Catalog

The Clockworks event system — every framework event, custom event rules, and standing order wiring.

---

## Framework Events

Framework events are signaled by core modules and the Clockworks runner. They use reserved namespaces (`commission.`, `session.`, `standing-order.`) and **cannot** be signaled by animas or operators.

### Commission Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `commission.posted` | `{ commissionId, workshop }` | `framework` | A new commission is posted via `commission()` |
| `commission.session.ended` | `{ commissionId, workshop?, exitCode }` | `framework` | A session launched for a commission completes (success or failure) |
| `commission.completed` | `{ commissionId }` | `framework` | `completeCommissionIfReady()` transitions status to `completed` |

**`commission.posted`** is the primary entry point for the commission pipeline. The framework creates a `mandate` writ and signals `mandate.ready` — standing orders typically wire that to summon an anima (e.g. `{ on: "mandate.ready", summon: "artificer" }`).

**`commission.session.ended`** fires when any session associated with a commission finishes. Useful for post-session automation (merge worktrees, check completion, notify).

**`commission.completed`** fires when the commission's mandate writ is fulfilled. This is a terminal event — no further work expected.

### Session Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `session.started` | `{ sessionId, anima, trigger, workshop, workspaceKind }` | `framework` | A session begins (after Daybook row is inserted) |
| `session.ended` | `{ sessionId, anima, trigger, workshop, exitCode, durationMs, costUsd, error }` | `framework` | A session completes (even if the provider threw) |
| `session.record-failed` | `{ sessionId?, error, phase, anima? }` | `framework` | Failed to write session record to Daybook or disk |

**`session.ended`** fires **guaranteed** — the session funnel wraps the provider call in try/finally. The `error` field is non-null if the provider threw. The `costUsd` field may be null if the provider doesn't report cost.

**`session.record-failed`** is a diagnostic event. The `phase` field indicates where the failure occurred: `"insert"` (initial row), `"write-record"` (JSON to disk), or `"update-row"` (final metrics).

### Writ Lifecycle Events

Writ lifecycle events use the writ's **type** as the event namespace. For example, a writ of type `mandate` emits `mandate.ready`, `mandate.completed`, etc. A guild-defined type like `task` emits `task.ready`, `task.completed`, etc.

| Event Pattern | Payload | Emitter | When |
|---------------|---------|---------|------|
| `{type}.ready` | `{ writId, parentId?, commissionId? }` | `framework` | Writ transitions to `ready` — available for dispatch |
| `{type}.completed` | `{ writId, parentId?, commissionId? }` | `framework` | Writ transitions to `completed` |
| `{type}.failed` | `{ writId, parentId?, commissionId? }` | `framework` | Writ transitions to `failed` |

**`{type}.ready`** is the primary dispatch signal. Standing orders wire these to summon animas (e.g. `{ on: "mandate.ready", summon: "artificer" }`). When a commission is posted, the framework creates a `mandate` writ and signals `mandate.ready`.

**Completion rollup:** When all children of a writ complete, the parent transitions from `pending` to `ready` (if a standing order exists for `{type}.ready`) or auto-completes (if not). This cascades upward through the tree — child completion can ripple up to fulfill the root mandate and complete the commission.

**Failure cascade:** When a writ fails, all its incomplete children are cancelled.

#### Event namespace and validation

Writ lifecycle events are **framework-emitted** but use **guild-defined type names** as their namespace. A guild with a `task` writ type gets `task.ready` events — these aren't in the reserved framework namespaces, and they aren't declared in `clockworks.events` either. This is intentional:

- The framework emits them freely (it calls `signalEvent()` directly, bypassing validation).
- An anima calling `signal('task.ready')` will be **rejected** by `validateCustomEvent()` — the event isn't declared in `clockworks.events`, and animas can't spoof writ state transitions.

This asymmetry is a feature: the framework controls writ lifecycle events; animas cannot forge them.

### Clockworks Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `standing-order.failed` | `{ standingOrder, triggeringEvent: { id, name }, error }` | `framework` | A standing order execution fails (engine throws or anima session fails) |

**Loop guard:** If a `standing-order.failed` event was itself triggered by another `standing-order.failed` event, the Clockworks runner skips processing to prevent infinite cascades.

### Reserved Namespaces

The following namespaces are reserved for framework events. Animas cannot signal events in these namespaces via the `signal` tool — `validateCustomEvent()` will throw.

```
anima.
commission.
tool.
migration.
guild.
standing-order.
session.
```

**Note:** Writ lifecycle events (e.g. `mandate.ready`, `task.completed`) use guild-defined type names as namespaces, which are *not* in this reserved list. They are still framework-only — see [Writ Lifecycle Events](#writ-lifecycle-events) for how validation handles this.

---

## Custom Events

Custom events are declared in `guild.json` and can be signaled by animas (via the `signal` MCP tool) or by engines.

### Declaring Custom Events

Add events to `guild.json` under `clockworks.events`:

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "A code review has been completed",
        "schema": { "prUrl": "string", "approved": "boolean" }
      },
      "deploy.requested": {
        "description": "A deployment was requested"
      }
    }
  }
}
```

- `description` — human-readable purpose (optional but recommended)
- `schema` — payload schema hint (informational only, not enforced at runtime)

### Validation Rules

1. The event name must **not** start with a reserved namespace prefix
2. The event name **must** be declared in `guild.json` `clockworks.events`
3. Both rules are enforced by `validateCustomEvent()`, which is called by the `signal` MCP tool

### Signaling Custom Events

From an anima (via the `signal` tool):
```
signal code.reviewed { "prUrl": "https://...", "approved": true }
```

From an engine:
```typescript
import { signalEvent } from '@shardworks/nexus-core';
signalEvent(home, 'code.reviewed', { prUrl: '...', approved: true }, 'my-engine');
```

Framework events bypass `validateCustomEvent()` — they call `signalEvent()` directly.

---

## Standing Order Wiring

Standing orders connect events to actions. They are declared in `guild.json` under `clockworks.standingOrders`.

### Order Types

#### `run` — Execute an engine

```json
{ "on": "session.ended", "run": "completion-rollup" }
```

The Clockworks runner imports the engine by name from `guild.json.engines`, calls its handler with the triggering event, and records a dispatch.

#### `summon` — Launch an anima session

```json
{ "on": "commission.posted", "summon": "artificer" }
```

Resolves the role to an active anima, manifests it, and launches a full session through the session funnel. For commission events, also writes commission assignments and updates commission status to `"in_progress"`.

The `prompt` for the session comes from the commission content (for commission events) or the event payload's `brief` field.

#### `brief` — Launch an anima session (lightweight)

```json
{ "on": "code.reviewed", "brief": "steward" }
```

Same as `summon` but semantically lighter — no commission lifecycle updates.

### Dispatch Lifecycle

When the Clockworks runner processes an event:

1. Find all standing orders where `on` matches the event name
2. For each matching order:
   a. Execute the action (`run` engine, or `summon`/`brief` anima)
   b. Record a dispatch in `event_dispatches` (started_at, ended_at, status, error)
   c. If the action failed, signal `standing-order.failed`
3. Mark the event as processed

### Role Resolution

For `summon` and `brief` orders, the role name is resolved to a specific anima:
- Query the roster for active animas holding the role
- If multiple animas share the role, the one with the lowest ID is selected
- If no active anima holds the role, the dispatch fails with an error

### No-Provider Behavior

If no session provider is registered (e.g. during testing or CLI-only operation), `summon` and `brief` orders are recorded as **skipped** — the intent is logged but no session is launched.

---

## Cookbook

Common patterns for wiring events to actions.

### Standard Commission Pipeline

The default commission flow: patron posts → workshop prepared → mandate dispatched → session runs → workshop merged.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.posted", "run": "workshop-prepare" },
      { "on": "mandate.ready", "summon": "artificer", "prompt": "You have been assigned a commission.\n\n{{writ.title}}\n\n{{writ.description}}" },
      { "on": "mandate.completed", "run": "workshop-merge" }
    ]
  }
}
```

When a commission is posted, the framework creates a `mandate` writ and signals `mandate.ready`. The standing order summons an artificer. When the artificer calls `complete-session`, the mandate completes (or enters `pending` if child writs exist), and `mandate.completed` triggers the merge engine.

### Multi-Level Writ Decomposition

An artificer can decompose a mandate into child writs, each dispatched independently:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.posted", "run": "workshop-prepare" },
      { "on": "mandate.ready", "summon": "sage", "prompt": "Plan this commission.\n\n{{writ.title}}\n\n{{writ.description}}" },
      { "on": "task.ready", "summon": "artificer", "prompt": "{{writ.title}}\n\n{{writ.description}}" },
      { "on": "mandate.completed", "run": "workshop-merge" }
    ]
  }
}
```

The sage receives the mandate, creates `task` child writs, and calls `complete-session`. The mandate enters `pending`. Each `task.ready` event summons an artificer. When all tasks complete, the mandate auto-transitions to `ready` → completes → triggers the merge.

### Custom Writ Types

Guilds declare custom writ types in `guild.json` to match their workflow vocabulary:

```json
{
  "writTypes": {
    "task": { "description": "A concrete unit of work" },
    "feature": { "description": "A user-facing capability" },
    "bug": { "description": "A defect to fix" }
  }
}
```

Each type gets its own lifecycle events (`task.ready`, `feature.completed`, `bug.failed`) and can be wired to different standing orders.

Multiple standing orders can match the same event — they execute in declaration order.

=== CONTEXT FILE: docs/reference/conversations.md ===
# Conversations API Reference

Multi-turn interaction with animas — web consultation and convene sessions.

Conversations group multiple sessions (turns) into a single logical interaction. Each turn is a full `launchSession()` call through the standard session funnel — same manifest pipeline, same metrics, same session records. The conversation layer is thin: it groups sessions, threads claude session IDs for `--resume`, and tracks overall conversation state.

---

## Concepts

### Kinds

| Kind | Description | Participants |
|------|-------------|-------------|
| `consult` | Human talks to an anima (from dashboard or CLI) | 1 human + 1 anima |
| `convene` | Multiple animas hold a turn-limited dialogue | N animas |

### Turns and Sessions

Each turn in a conversation produces a session row in the `sessions` table. All per-turn metrics (cost, tokens, duration, transcript) live in the existing session infrastructure. The conversation tables add grouping and state on top.

**Human turns** in a consult do not produce sessions. The human's message is passed as the `prompt` to the anima's `takeTurn()` call and appears in the anima's session record as `userPrompt`. This means cost/token analytics are always agent-side — which is what you want for budget tracking. For dialogue reconstruction, `showConversation()` interleaves the anima's prompt (the human's message) with the anima's response.

### Session Threading

Conversation turns use claude's `--resume` flag to maintain conversational continuity. The first turn for each anima participant starts a fresh claude session. Subsequent turns resume it with the `providerSessionId` captured from the previous turn's result. This ID is stored on the `conversation_participants` record and passed through `launchSession()` → provider.

### Manifest at Turn Time

Animas are manifested via `manifest()` on each turn, not at conversation creation time. This means the anima's system prompt, tools, and MCP config reflect the current guild state when the turn is taken. If a tool is installed mid-conversation, the next turn picks it up.

---

## Database Schema

### New Tables

```sql
-- Conversation: one logical multi-turn interaction
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,               -- conv_xxxx
    status      TEXT NOT NULL DEFAULT 'active', -- active | concluded | abandoned
    kind        TEXT NOT NULL,                  -- consult | convene
    topic       TEXT,                           -- seeding prompt / subject
    turn_limit  INTEGER,                        -- max total turns (null = unlimited)
    created_at  TEXT NOT NULL,
    ended_at    TEXT,
    event_id    TEXT                            -- for convene: triggering event
);

-- Participant in a conversation (human or anima)
CREATE TABLE conversation_participants (
    id                TEXT PRIMARY KEY,          -- cpart_xxxx
    conversation_id   TEXT NOT NULL REFERENCES conversations(id),
    kind              TEXT NOT NULL,             -- anima | human
    name              TEXT NOT NULL,             -- anima name or 'patron'
    anima_id          TEXT,                      -- FK to animas (null for humans)
    claude_session_id TEXT                       -- threaded via --resume
);
```

### Sessions Table Extensions

```sql
ALTER TABLE sessions ADD COLUMN conversation_id TEXT REFERENCES conversations(id);
ALTER TABLE sessions ADD COLUMN turn_number     INTEGER;
```

- **`conversation_id`** — groups turns. Null for standalone sessions (summon, brief, terminal consult).
- **`turn_number`** — 1-indexed position within the conversation. Useful for analytics: cost-per-turn curves, cache efficiency trends.

### Analytics Queries

```sql
-- Total cost of a conversation
SELECT SUM(cost_usd) FROM sessions WHERE conversation_id = ?;

-- Per-participant cost breakdown
SELECT a.name, SUM(s.cost_usd), SUM(s.input_tokens), SUM(s.output_tokens)
FROM sessions s JOIN animas a ON a.id = s.anima_id
WHERE s.conversation_id = ?
GROUP BY a.name;

-- Cost per turn (do later turns get cheaper from caching?)
SELECT turn_number, cost_usd, cache_read_tokens
FROM sessions WHERE conversation_id = ?
ORDER BY turn_number;
```

---

## Session Infrastructure Changes

### SessionProviderLaunchOptions

Added field:

```ts
claudeSessionId?: string
```

When provided, the provider uses `--resume SESSION_ID` to continue an existing conversation instead of starting a fresh session.

### SessionProvider Interface

Added optional method:

```ts
launchStreaming?(options: SessionProviderLaunchOptions): {
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionProviderResult>;
}
```

Returns an async iterable of `SessionChunk` for real-time streaming AND a promise for the final result. Used by `takeTurn()` to stream responses to the dashboard. Falls back to `launch()` when not implemented.

### SessionChunk

```ts
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }
```

### SessionLaunchOptions

Added fields:

```ts
conversationId?: string   // written to sessions.conversation_id
turnNumber?: number       // written to sessions.turn_number
claudeSessionId?: string  // passed through to provider for --resume
onChunk?: (chunk: SessionChunk) => void  // streaming callback
```

The trigger type union is extended: `'consult' | 'summon' | 'brief' | 'convene'`.

---

## Conversation API

All functions take `home: string` (the guild root path) as their first argument.

### `createConversation(home, options): CreateConversationResult`

Create a new conversation with participant records. Does NOT take a first turn.

**Options (`CreateConversationOptions`):**
- `kind: 'consult' | 'convene'`
- `topic?: string` — seeding prompt or subject
- `turnLimit?: number` — max total turns (null = unlimited)
- `participants: Array<{ kind: 'anima' | 'human'; name: string }>` — at least one participant
- `eventId?: string` — for convene: the triggering event ID

**Returns (`CreateConversationResult`):**
- `conversationId: string` — the new conversation ID (`conv_xxxx`)
- `participants: Array<{ id: string; name: string; kind: string }>` — with generated IDs

### `takeTurn(home, conversationId, participantId, message): AsyncGenerator<ConversationChunk>`

Take a turn in a conversation. The core primitive.

For anima participants:
1. Reads conversation state (checks active, turn limit)
2. Manifests the anima via `manifest()` — standard pipeline
3. Calls `launchSession()` with `claudeSessionId` for `--resume`
4. Streams `ConversationChunk`s as they arrive from the provider
5. Updates participant's `claude_session_id` for next turn
6. Auto-concludes if turn limit reached

For human participants: no-op (returns immediately). The human's message should be passed as the `message` argument to the next anima `takeTurn()` call.

**ConversationChunk:**
```ts
type ConversationChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number }
```

**Throws** if conversation is not active or turn limit reached.

### `endConversation(home, conversationId, reason?): void`

End a conversation explicitly. Sets status to `'concluded'` (default) or `'abandoned'`. Idempotent — no-op if already ended.

### `nextParticipant(home, conversationId): { participantId, name } | null`

Get the next participant in a convene rotation (round-robin by creation order). Returns `null` if conversation is not active, turn limit reached, or no anima participants.

### `formatConveneMessage(home, conversationId, participantId): string`

Format the message for the next participant in a convene. Returns only what happened since their last turn (other participants' responses), avoiding duplicate context with `--resume`. Returns the conversation topic if it's the participant's first turn.

### `listConversations(home, opts?): ConversationSummary[]`

List conversations with optional filters.

**Options (`ListConversationsOptions`):**
- `status?: string` — `'active'`, `'concluded'`, or `'abandoned'`
- `kind?: string` — `'consult'` or `'convene'`
- `limit?: number`

**Returns (`ConversationSummary`):**
- `id, status, kind, topic, turnLimit, createdAt, endedAt`
- `participants: Array<{ id, name, kind }>`
- `turnCount: number` — computed from sessions table
- `totalCostUsd: number` — computed from sessions table

### `showConversation(home, conversationId): ConversationDetail | null`

Full conversation detail including all turns.

**Returns (`ConversationDetail`):** extends `ConversationSummary` with:
- `turns: Array<{ sessionId, turnNumber, participant, prompt, exitCode, costUsd, durationMs, startedAt, endedAt }>`

The `prompt` field on each turn is the input message (in a consult, this is the human's message). Together with the session's transcript, this reconstructs the full dialogue.

---

## Integration Patterns

### Dashboard — Web Consultation

```ts
// Start a consultation
const { conversationId, participants } = createConversation(home, {
  kind: 'consult',
  participants: [
    { kind: 'human', name: 'patron' },
    { kind: 'anima', name: 'steward' },
  ],
});

const animaPart = participants.find(p => p.name === 'steward')!;

// On each message from browser:
for await (const chunk of takeTurn(home, conversationId, animaPart.id, userMessage)) {
  ws.send(JSON.stringify(chunk));
}

// On disconnect:
endConversation(home, conversationId, 'abandoned');

// On reconnect with stored conversationId:
const state = showConversation(home, conversationId);
// Restore UI from state.turns
```

### Clockworks — Convene

```ts
const { conversationId } = createConversation(home, {
  kind: 'convene',
  topic: hydratedPrompt,
  turnLimit: 10,
  participants: standingOrder.participants.map(name => ({ kind: 'anima', name })),
  eventId,
});

while (true) {
  const next = nextParticipant(home, conversationId);
  if (!next) break;

  const message = formatConveneMessage(home, conversationId, next.participantId);
  for await (const chunk of takeTurn(home, conversationId, next.participantId, message)) {
    // stream to dashboard, log, etc.
  }
}
```

---

## Types Summary

| Type | Description |
|------|-------------|
| `ConversationChunk` | Union: text, tool_use, tool_result, turn_complete |
| `SessionChunk` | Union: text, tool_use, tool_result (without turn_complete) |
| `CreateConversationOptions` | Options for `createConversation()` |
| `CreateConversationResult` | `{ conversationId, participants[] }` |
| `ConversationSummary` | List view with computed turnCount and totalCostUsd |
| `ConversationDetail` | Full view with turns array |
| `ListConversationsOptions` | Filters for `listConversations()` |

## ID Prefixes

| Prefix | Entity |
|--------|--------|
| `conv-` | conversation |
| `cpart-` | conversation participant |



## Codebase Structure (surrounding directories)

```
=== TREE: docs/reference/ ===
conversations.md
core-api.md
event-catalog.md
schema.md


```

## Codebase API Surface (declarations available before this commission)

Scope: all 14 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +132
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 132, reused 132, downloaded 0, added 132, done

devDependencies:
+ @tsconfig/node24 24.0.4
+ typescript 5.9.3

Done in 480ms using pnpm v10.32.1
=== packages/framework/arbor/dist/arbor.d.ts ===
/**
 * Arbor — the guild runtime.
 *
 * `createGuild()` is the single entry point. It reads guild.json, loads all
 * declared plugins, validates dependencies, starts apparatus in order, wires
 * the guild() singleton, and returns the Guild object.
 *
 * The full plugin lifecycle:
 *   1. Load    — imports all declared plugin packages, discriminates kit vs apparatus
 *   2. Validate — checks `requires` declarations, detects circular dependencies
 *   3. Start   — calls start(ctx) on each apparatus in dependency-resolved order
 *   4. Events  — fires `plugin:initialized` after each plugin loads
 *   5. Warn    — advisory warnings for mismatched kit contributions / recommends
 *
 * Pure logic (validation, ordering, events) lives in guild-lifecycle.ts.
 * This file handles I/O and orchestration.
 */
import type { Guild } from '@shardworks/nexus-core';
/**
 * Create and start a guild.
 *
 * Reads guild.json, loads all declared plugins, validates dependencies,
 * starts apparatus in dependency order, and returns the Guild object.
 * Also sets the guild() singleton so apparatus code can access it.
 *
 * @param root - Absolute path to the guild root. Defaults to auto-detection
 *               by walking up from cwd until guild.json is found.
 * @returns The initialized Guild — the same object guild() returns.
 */
export declare function createGuild(root?: string): Promise<Guild>;
//# sourceMappingURL=arbor.d.ts.map
=== packages/framework/arbor/dist/guild-lifecycle.d.ts ===
/**
 * Guild lifecycle — pure logic for plugin validation, ordering, and events.
 *
 * All functions here operate on in-memory data structures (LoadedKit[],
 * LoadedApparatus[], Maps) with no I/O. This makes them independently
 * testable with synthetic fixtures.
 *
 * `createGuild()` in arbor.ts is the orchestrator that performs I/O
 * (config reading, dynamic imports) then delegates to these functions.
 */
import type { StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Throws with a descriptive error on the first problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export declare function validateRequires(kits: LoadedKit[], apparatuses: LoadedApparatus[]): void;
/**
 * Sort apparatuses in dependency-resolved order using topological sort.
 * validateRequires() must be called first to ensure the graph is acyclic.
 */
export declare function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[];
/**
 * Collect advisory warnings for kit contributions that no apparatus
 * consumes, and for missing recommended apparatuses.
 *
 * Returns an array of warning strings. The caller decides how to emit
 * them (console.warn, logger, etc.).
 */
export declare function collectStartupWarnings(kits: LoadedKit[], apparatuses: LoadedApparatus[]): string[];
/**
 * Build a StartupContext for an apparatus's start() call.
 * The context provides event subscription; handlers are stored in the
 * shared eventHandlers map so fireEvent can invoke them later.
 */
export declare function buildStartupContext(eventHandlers: EventHandlerMap): StartupContext;
/**
 * Fire a lifecycle event, awaiting each handler sequentially.
 */
export declare function fireEvent(eventHandlers: EventHandlerMap, event: string, ...args: unknown[]): Promise<void>;
//# sourceMappingURL=guild-lifecycle.d.ts.map
=== packages/framework/arbor/dist/index.d.ts ===
/**
 * @shardworks/nexus-arbor — guild runtime
 *
 * The arbor is the guild host: plugin loading, dependency validation,
 * apparatus lifecycle management. It does NOT own tool discovery — that
 * belongs to The Instrumentarium (tools-apparatus).
 *
 * Plugin authors never import from arbor — they import from @shardworks/nexus-core.
 * The CLI imports from arbor to create the guild runtime and trigger startup.
 *
 * Package dependency graph:
 *   core   — public SDK, types, tool() factory
 *   arbor  — guild host, createGuild()
 *   cli    — nsg binary, Commander.js, framework commands + Instrumentarium tools
 *   plugins — import from core only
 */
export { createGuild } from './arbor.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/cli.d.ts ===
#!/usr/bin/env node
/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */
export {};
//# sourceMappingURL=cli.d.ts.map
=== packages/framework/cli/dist/commands/index.d.ts ===
/**
 * Framework commands — hardcoded CLI commands that work with or without a guild.
 *
 * These are guild lifecycle and plugin management commands that the CLI
 * registers directly, bypassing plugin discovery. They are the CLI's own
 * commands, not tools contributed by kits or apparatus.
 *
 * Plugin-contributed tools are discovered at runtime via The Instrumentarium
 * when a guild is present and the tools apparatus is installed.
 */
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/** All framework commands, typed as the base ToolDefinition for uniform handling. */
export declare const frameworkCommands: ToolDefinition[];
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/commands/init.d.ts ===
/**
 * nsg init — create a new guild.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Writes the minimum viable guild: directory structure, guild.json,
 * package.json, .gitignore. Does NOT git init, install bundles, create
 * the database, or instantiate animas — those are separate steps.
 *
 * After init, the user runs `nsg plugin install` to add capabilities.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=init.d.ts.map
=== packages/framework/cli/dist/commands/plugin.d.ts ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */
import { z } from 'zod';
/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export declare function detectPackageManager(guildRoot: string): 'npm' | 'pnpm';
export declare const pluginList: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export declare const pluginInstall: import("@shardworks/tools-apparatus").ToolDefinition<{
    source: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<{
        link: "link";
        registry: "registry";
    }>>;
}>;
export declare const pluginRemove: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export declare const pluginUpgrade: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/cli/dist/commands/status.d.ts ===
/**
 * nsg status — guild status.
 *
 * A framework command. Shows guild identity, framework version, and installed plugins
 * separated into apparatuses (running infrastructure) and kits (passive capabilities).
 * Domain-specific status (writ counts, session history, clock state) belongs
 * to plugins, not here.
 *
 * Requires a booted guild — prints a friendly error if run outside one.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=status.d.ts.map
=== packages/framework/cli/dist/commands/test-helpers.d.ts ===
/**
 * Shared test helpers for CLI command tests.
 *
 * Provides guild accessor setup, temp directory management, and minimal
 * guild.json scaffolding. Extracted from status.test.ts, version.test.ts,
 * and plugin.test.ts where these were copy-pasted identically.
 */
/** Set up a minimal guild accessor pointing at the given directory. */
export declare function setupGuildAccessor(home: string): void;
/** Create a temp directory and register it for cleanup. */
export declare function makeTmpDir(prefix: string): string;
/** Write a minimal guild.json to dir, with optional overrides. */
export declare function makeGuild(dir: string, overrides?: Record<string, unknown>): void;
/** Write a guild-root package.json declaring the given npm dependencies. */
export declare function makeGuildPackageJson(dir: string, deps: Record<string, string>): void;
/** Clean up guild state and temp directories. Call from afterEach(). */
export declare function cleanupTestState(): void;
//# sourceMappingURL=test-helpers.d.ts.map
=== packages/framework/cli/dist/commands/upgrade.d.ts ===
/**
 * nsg upgrade — upgrade the guild framework.
 *
 * Stub — upgrade lifecycle not yet designed. Will handle framework version
 * bumps, guild.json schema reconciliation, and plugin-specific upgrade
 * hooks when implemented.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    dryRun: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=upgrade.d.ts.map
=== packages/framework/cli/dist/commands/version.d.ts ===
/**
 * nsg version — show framework and plugin version info.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Always shows framework and Node versions. When run inside a guild,
 * additionally shows installed plugin versions. Gracefully degrades
 * when run outside a guild (no error, just less info).
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=version.d.ts.map
=== packages/framework/cli/dist/helpers.d.ts ===
/**
 * Pure helper functions for CLI command generation.
 *
 * Extracted from program.ts so they can be tested independently
 * without pulling in heavy runtime dependencies (Arbor, Instrumentarium).
 */
import { z } from 'zod';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Convert camelCase key to kebab-case CLI flag.
 * e.g. 'writId' → '--writ-id'
 */
export declare function toFlag(key: string): string;
/**
 * Detect whether a Zod schema accepts booleans (and only booleans).
 * Used to register Commander flags without <value> for boolean params.
 */
export declare function isBooleanSchema(schema: z.ZodTypeAny): boolean;
/**
 * Determine which hyphen prefixes have enough tools to warrant a group.
 *
 * Returns a Set of prefixes that have 2+ tools sharing them.
 * 'plugin-list' + 'plugin-install' → 'plugin' is a group.
 * 'show-writ' alone → 'show' is NOT a group.
 */
export declare function findGroupPrefixes(tools: ToolDefinition[]): Set<string>;
//# sourceMappingURL=helpers.d.ts.map
=== packages/framework/cli/dist/index.d.ts ===
export { VERSION } from '@shardworks/nexus-core';
export { main } from './program.ts';
export { frameworkCommands } from './commands/index.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/program.d.ts ===
/**
 * nsg program — dynamic Commander setup.
 *
 * Two command sources:
 *
 * 1. **Framework commands** — hardcoded in the CLI package (init, status,
 *    version, upgrade, plugin management). Always available, even without
 *    a guild.
 *
 * 2. **Plugin tools** — discovered at runtime via The Instrumentarium
 *    (tools apparatus). Only available when a guild is present and the
 *    tools apparatus is installed.
 *
 * Tool names are auto-grouped when multiple tools share a hyphen prefix:
 * 'plugin-list' + 'plugin-install' → 'nsg plugin list' / 'nsg plugin install'.
 * A tool like 'show-writ' stays flat ('nsg show-writ') since no other tool
 * starts with 'show-'.
 */
export declare function main(): Promise<void>;
//# sourceMappingURL=program.d.ts.map
=== packages/framework/core/dist/guild-config.d.ts ===
/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
    /** Human-readable description of what this event means. */
    description?: string;
    /** Optional payload schema hint (not enforced in Phase 1). */
    schema?: Record<string, string>;
}
/** A standing order — a registered response to an event. */
export type StandingOrder = {
    on: string;
    run: string;
} | {
    on: string;
    summon: string;
    prompt?: string;
} | {
    on: string;
    brief: string;
};
/** The clockworks configuration block in guild.json. */
export interface ClockworksConfig {
    /** Custom event declarations. */
    events?: Record<string, EventDeclaration>;
    /** Standing orders — event → action mappings. */
    standingOrders?: StandingOrder[];
}
/** Guild-level settings — operational flags and preferences. */
export interface GuildSettings {
    /**
     * Default LLM model for anima sessions (e.g. 'sonnet', 'opus').
     * Replaces the top-level `model` field from GuildConfig V1.
     */
    model?: string;
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified. Set to `false` to require explicit
     * migration via `nsg guild upgrade-books`.
     */
    autoMigrate?: boolean;
}
/**
 * Guild configuration.
 *
 * The plugin-centric model: plugins are npm packages; capabilities (tools, engines,
 * training content) are declared by plugins and discovered dynamically at runtime.
 * Framework-level keys (`name`, `nexus`, `plugins`, `settings`) are defined here;
 * all other top-level keys are plugin configuration sections, keyed by plugin id.
 */
export interface GuildConfig {
    /** Guild name — used as the guildhall npm package name. */
    name: string;
    /** Installed Nexus framework version. */
    nexus: string;
    /** Installed plugin ids (derived from npm package names). Always present; starts empty. */
    plugins: string[];
    /** Clockworks configuration — events, standing orders. */
    clockworks?: ClockworksConfig;
    /** Guild-level settings — operational flags and preferences. Includes default model. */
    settings?: GuildSettings;
}
/**
 * Create the default guild.json content for a new guild.
 * All collections start empty. The default model is stored in settings.
 */
export declare function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig;
/** Read and parse guild.json from the guild root. */
export declare function readGuildConfig(home: string): GuildConfig;
/** Write guild.json to the guild root. */
export declare function writeGuildConfig(home: string, config: GuildConfig): void;
/** Resolve the path to guild.json in the guild root. */
export declare function guildConfigPath(home: string): string;
//# sourceMappingURL=guild-config.d.ts.map
=== packages/framework/core/dist/guild.d.ts ===
/**
 * Guild — the process-level singleton for accessing guild infrastructure.
 *
 * All plugin code — apparatus start(), tool handlers, engine handlers,
 * relay handlers, CDC handlers — imports `guild()` to access apparatus APIs,
 * plugin config, the guild root path, and the loaded plugin graph.
 *
 * Arbor creates the Guild instance before starting apparatus and registers
 * it via `setGuild()`. The instance is backed by live data structures
 * (e.g. the provides Map) that are populated progressively as apparatus start.
 *
 * See: docs/architecture/plugins.md
 */
import type { GuildConfig } from './guild-config.ts';
import type { LoadedKit, LoadedApparatus } from './plugin.ts';
/**
 * Runtime access to guild infrastructure.
 *
 * Available after Arbor creates the instance (before apparatus start).
 * One instance per process.
 */
export interface Guild {
    /** Absolute path to the guild root (contains guild.json). */
    readonly home: string;
    /**
     * Retrieve a started apparatus's provides object by plugin id.
     *
     * Throws if the apparatus is not installed or has no `provides`.
     * During startup, only apparatus that have already started are visible
     * (dependency ordering guarantees declared deps are started first).
     */
    apparatus<T>(name: string): T;
    /**
     * Read a plugin's configuration section from guild.json.
     *
     * Returns `guild.json[pluginId]` cast to `T`. Returns `{}` if no
     * section exists. The generic parameter is a cast — the framework
     * does not validate config shape.
     */
    config<T = Record<string, unknown>>(pluginId: string): T;
    /**
     * Write a plugin's configuration section to guild.json.
     *
     * Updates `guild.json[pluginId]` with `value` and writes the file
     * to disk. Also updates the in-memory config so subsequent reads
     * reflect the change.
     *
     * For framework-level keys (name, nexus, plugins, settings), use
     * the standalone `writeGuildConfig()` function instead.
     */
    writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void;
    /**
     * Read the full parsed guild.json.
     *
     * Escape hatch for framework-level fields (name, nexus, plugins,
     * settings) that don't belong to any specific plugin.
     */
    guildConfig(): GuildConfig;
    /** Snapshot of all loaded kits (including apparatus supportKits). */
    kits(): LoadedKit[];
    /** Snapshot of all started apparatuses. */
    apparatuses(): LoadedApparatus[];
}
/**
 * Get the active guild instance.
 *
 * Throws with a clear message if called before Arbor has initialized
 * the guild (e.g. at module import time, before startup begins).
 */
export declare function guild(): Guild;
/**
 * Set the guild instance. Called by Arbor before starting apparatus.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function setGuild(g: Guild): void;
/**
 * Clear the guild instance. Called by Arbor at shutdown or in tests.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function clearGuild(): void;
//# sourceMappingURL=guild.d.ts.map
=== packages/framework/core/dist/id.d.ts ===
/**
 * Generate a sortable, prefixed ID.
 *
 * Format: `{prefix}-{base36_timestamp}-{hex_random}`
 *
 * The timestamp component (Date.now() in base36) gives lexicographic sort
 * order by creation time. The random suffix prevents collisions without
 * coordination.
 *
 * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
 * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
 */
export declare function generateId(prefix: string, randomByteCount?: number): string;
//# sourceMappingURL=id.d.ts.map
=== packages/framework/core/dist/index.d.ts ===
export declare const VERSION: string;
export { type Kit, type Apparatus, type Plugin, type LoadedKit, type LoadedApparatus, type LoadedPlugin, type StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus, } from './plugin.ts';
export { type Guild, guild, setGuild, clearGuild, } from './guild.ts';
export { findGuildRoot, nexusDir, worktreesPath, clockPidPath, clockLogPath, } from './nexus-home.ts';
export { derivePluginId, readGuildPackageJson, resolvePackageNameForPluginId, resolveGuildPackageEntry, } from './resolve-package.ts';
export { type GuildConfig, createInitialGuildConfig, readGuildConfig, writeGuildConfig, type EventDeclaration, type StandingOrder, type ClockworksConfig, type GuildSettings, guildConfigPath, } from './guild-config.ts';
export { generateId } from './id.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/core/dist/nexus-home.d.ts ===
/**
 * Find the guild root by walking up from a starting directory looking for guild.json.
 *
 * This replaces the old NEXUS_HOME env var approach. The guild root IS the
 * guildhall — a regular git clone with guild.json at the root.
 *
 * @param startDir - Directory to start searching from (defaults to cwd).
 * @throws If no guild.json is found before reaching the filesystem root.
 */
export declare function findGuildRoot(startDir?: string): string;
/** Path to the .nexus framework-managed directory. */
export declare function nexusDir(home: string): string;
/** Path to the top-level worktrees directory (for writ worktrees). */
export declare function worktreesPath(home: string): string;
/** Path to the clockworks daemon PID file. */
export declare function clockPidPath(home: string): string;
/** Path to the clockworks daemon log file. */
export declare function clockLogPath(home: string): string;
//# sourceMappingURL=nexus-home.d.ts.map
=== packages/framework/core/dist/plugin.d.ts ===
/**
 * Plugin system — core types for the Kit/Apparatus model.
 *
 * Plugins come in two kinds:
 * - Kit:       passive package contributing capabilities to consuming apparatuses.
 *              No lifecycle, no running state. Read at load time.
 * - Apparatus: package contributing persistent running infrastructure.
 *              Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * See: docs/architecture/plugins.md
 */
/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly kit: Kit;
}
/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly apparatus: Apparatus;
}
/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus;
/**
 * Startup context passed to an apparatus's start(ctx).
 *
 * Provides lifecycle-event subscription — the only capability that is
 * meaningful only during startup. All other guild access (apparatus APIs,
 * config, home path, loaded plugins) goes through the `guild()` singleton,
 * which is available during start() and in all handlers.
 *
 * See: docs/architecture/plugins.md
 */
export interface StartupContext {
    /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
}
/**
 * A kit — passive package contributing capabilities to consuming apparatuses.
 * Open record: contribution fields (engines, relays, tools, etc.) are defined
 * by the apparatus packages that consume them. `requires` and `recommends` are
 * the only framework-level fields.
 *
 * `requires`: apparatus names whose runtime APIs this kit's contributions depend
 *   on at handler invocation time. Hard startup validation failure if a declared
 *   apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced.
 */
export type Kit = {
    requires?: string[];
    recommends?: string[];
    [key: string]: unknown;
};
/**
 * An apparatus — package contributing persistent running infrastructure.
 * Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * `requires`: apparatus names that must be started before this apparatus's
 *   start() runs. Determines start ordering. Hard startup validation failure
 *   if a declared apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced — the apparatus starts
 *   regardless. Use for soft dependencies needed by optional API methods
 *   (e.g. The Animator recommends The Loom for summon(), but animate()
 *   works without it).
 *
 * `provides`: the runtime API object this apparatus exposes to other plugins.
 *   Retrieved via guild().apparatus<T>(name). Created at manifest-definition time,
 *   populated during start.
 *
 * `supportKit`: kit contributions this apparatus exposes to consuming apparatuses.
 *   Treated identically to standalone kit contributions by consumers.
 *
 * `consumes`: kit contribution field types this apparatus scans for and registers.
 *   Enables framework startup warnings when kits contribute types with no consumer.
 */
export type Apparatus = {
    requires?: string[];
    recommends?: string[];
    provides?: unknown;
    start: (ctx: StartupContext) => void | Promise<void>;
    stop?: () => void | Promise<void>;
    supportKit?: Kit;
    consumes?: string[];
};
/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin = {
    kit: Kit;
} | {
    apparatus: Apparatus;
};
/** Type guard: is this value a kit plugin export? */
export declare function isKit(obj: unknown): obj is {
    kit: Kit;
};
/** Type guard: is this value an apparatus plugin export? */
export declare function isApparatus(obj: unknown): obj is {
    apparatus: Apparatus;
};
/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export declare function isLoadedKit(p: LoadedPlugin): p is LoadedKit;
/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export declare function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/core/dist/resolve-package.d.ts ===
/**
 * Package resolution utilities for guild-installed npm packages.
 *
 * Resolves entry points from the guild's node_modules by reading package.json
 * exports maps directly. Needed because guild plugins are ESM-only packages
 * and createRequire() can't resolve their exports.
 *
 * Also owns:
 * - derivePluginId — canonical npm package name → plugin id derivation
 */
/**
 * Derive the guild-facing plugin id from an npm package name.
 *
 * Convention:
 * - `@shardworks/nexus-ledger`      → `nexus-ledger`   (official scope stripped)
 * - `@shardworks/books-apparatus`   → `books`           (descriptor suffix stripped)
 * - `@acme/my-plugin`               → `acme/my-plugin`  (third-party: drop @ only)
 * - `my-relay-kit`                  → `my-relay`        (descriptor suffix stripped)
 * - `my-plugin`                     → `my-plugin`       (unscoped: unchanged)
 *
 * The `@shardworks` scope is the official Nexus namespace — its plugins are
 * referenced by bare name in guild.json, CLI commands, and config keys.
 * Third-party scoped packages retain the scope as a prefix (without @) to
 * prevent collisions between `@acme/foo` and `@other/foo`.
 *
 * Descriptor suffixes (`-plugin`, `-apparatus`, `-kit`) are stripped after
 * scope resolution so that package naming conventions don't leak into ids.
 */
export declare function derivePluginId(packageName: string): string;
/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export declare function readGuildPackageJson(guildRoot: string, pkgName: string): {
    version: string;
    pkgJson: Record<string, unknown> | null;
};
/**
 * Resolve the npm package name for a plugin id by consulting the guild's root package.json.
 *
 * Scans all dependencies and runs `derivePluginId()` on each to find the
 * package whose derived id matches. This correctly handles descriptor
 * suffixes (-kit, -apparatus, -plugin) that derivePluginId strips.
 *
 * When multiple packages derive to the same id (unlikely but possible),
 * prefers @shardworks-scoped packages over third-party ones.
 *
 * Returns null if no matching dependency is found.
 */
export declare function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null;
/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export declare function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string;
//# sourceMappingURL=resolve-package.d.ts.map
=== packages/plugins/animator/dist/animator.d.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export declare function createAnimator(): Plugin;
//# sourceMappingURL=animator.d.ts.map
=== packages/plugins/animator/dist/index.d.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */
export { type AnimatorApi, type AnimateHandle, type AnimateRequest, type SummonRequest, type SessionResult, type SessionChunk, type TokenUsage, type SessionDoc, type AnimatorConfig, type AnimatorSessionProvider, type SessionProviderConfig, type SessionProviderResult, } from './types.ts';
export { createAnimator } from './animator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/index.d.ts ===
/**
 * Animator tool re-exports.
 */
export { default as sessionList } from './session-list.ts';
export { default as sessionShow } from './session-show.ts';
export { default as summon } from './summon.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/session-list.d.ts ===
/**
 * session-list tool — list recent sessions with optional filters.
 *
 * Queries The Animator's `sessions` book in The Stacks.
 * Returns session summaries ordered by startedAt descending (newest first).
 *
 * See: docs/specification.md (animator § session-list tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        timeout: "timeout";
        running: "running";
    }>>;
    provider: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=session-list.d.ts.map
=== packages/plugins/animator/dist/tools/session-show.d.ts ===
/**
 * session-show tool — show full detail for a single session by id.
 *
 * Reads the complete session record from The Animator's `sessions` book
 * in The Stacks, including tokenUsage, metadata, and all indexed fields.
 *
 * See: docs/specification.md (animator § session-show tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=session-show.d.ts.map
=== packages/plugins/animator/dist/tools/summon.d.ts ===
/**
 * summon tool — dispatch an anima session from the CLI.
 *
 * High-level entry point: composes context via The Loom (passing the
 * role for system prompt composition), then launches a session via
 * The Animator. The work prompt goes directly to the provider.
 *
 * Usage:
 *   nsg summon --prompt "Build the frobnicator" --role artificer
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    prompt: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=summon.d.ts.map
=== packages/plugins/animator/dist/types.d.ts ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */
import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
/** A chunk of output from a running session. */
export type SessionChunk = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    tool: string;
} | {
    type: 'tool_result';
    tool: string;
};
export interface AnimateRequest {
    /**
     * Optional pre-generated session id. When provided, the Animator uses
     * this id instead of generating a new one. Used by summon() to make the
     * session id available on the handle before the Loom weave resolves.
     */
    sessionId?: string;
    /** The anima weave from The Loom (composed identity context). */
    context: AnimaWeave;
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     * This bypasses The Loom — it is not a composition concern.
     */
    prompt?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     * If provided, the session provider resumes the existing conversation
     * rather than starting a new one.
     */
    conversationId?: string;
    /**
     * Caller-supplied metadata recorded alongside the session.
     * The Animator stores this as-is — it does not interpret the contents.
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     *
     * Either way, the return shape is the same: `{ chunks, result }`.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
export interface SessionResult {
    /** Unique session id (generated by The Animator). */
    id: string;
    /** Terminal status. */
    status: 'completed' | 'failed' | 'timeout';
    /** When the session started (ISO-8601). */
    startedAt: string;
    /** When the session ended (ISO-8601). */
    endedAt: string;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    /** Provider name (e.g. 'claude-code'). */
    provider: string;
    /** Numeric exit code from the provider process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Conversation id (for multi-turn resume). */
    conversationId?: string;
    /** Session id from the provider (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage from the provider, if available. */
    tokenUsage?: TokenUsage;
    /** Cost in USD from the provider, if available. */
    costUsd?: number;
    /** Caller-supplied metadata, recorded as-is. */
    metadata?: Record<string, unknown>;
    /**
     * The final assistant text from the session.
     * Extracted by the Animator from the provider's transcript.
     * Useful for programmatic consumers that need the session's conclusion
     * without parsing the full transcript (e.g. the Spider's review collect step).
     */
    output?: string;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface SummonRequest {
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     */
    prompt: string;
    /**
     * The role to summon (e.g. 'artificer', 'scribe').
     * Passed to The Loom for context composition and recorded in session metadata.
     */
    role?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     */
    conversationId?: string;
    /**
     * Additional metadata to record alongside the session.
     * Merged with auto-generated metadata (trigger: 'summon', role).
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
/** The return value from animate() and summon(). */
export interface AnimateHandle {
    /**
     * Session ID, available immediately after launch — before the session
     * completes. Callers that only need to know the session was launched
     * (e.g. quick engines returning `{ status: 'launched', sessionId }`)
     * can return without awaiting `result`.
     */
    sessionId: string;
    /**
     * Async iterable of output chunks from the session. When streaming is
     * disabled (the default), this iterable completes immediately with no
     * items. When streaming is enabled, it yields chunks as the session
     * produces output.
     */
    chunks: AsyncIterable<SessionChunk>;
    /**
     * Promise that resolves to the final SessionResult after the session
     * completes (or fails/times out) and the result is recorded to The Stacks.
     */
    result: Promise<SessionResult>;
}
export interface AnimatorApi {
    /**
     * Summon an anima — compose context via The Loom and launch a session.
     *
     * This is the high-level "make an anima do a thing" entry point.
     * Internally calls The Loom for context composition (passing the role),
     * then animate() for session launch and recording. The work prompt
     * bypasses the Loom and goes directly to the provider.
     *
     * Requires The Loom apparatus to be installed. Throws if not available.
     *
     * Auto-populates session metadata with `trigger: 'summon'` and `role`.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    summon(request: SummonRequest): AnimateHandle;
    /**
     * Animate a session — launch an AI process with the given context.
     *
     * This is the low-level entry point for callers that compose their own
     * AnimaWeave (e.g. The Parlour for multi-turn conversations).
     *
     * Records the session result to The Stacks before `result` resolves.
     *
     * Set `streaming: true` on the request to receive output chunks as the
     * session runs. When streaming is disabled (default), the `chunks`
     * iterable completes immediately with no items.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    animate(request: AnimateRequest): AnimateHandle;
}
/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
    /** Human-readable name (e.g. 'claude-code'). */
    name: string;
    /**
     * Launch a session. Returns `{ chunks, result }` synchronously.
     *
     * The `result` promise resolves when the AI process exits.
     * The `chunks` async iterable yields output when `config.streaming`
     * is true and the provider supports streaming; otherwise it completes
     * immediately with no items.
     *
     * Providers that don't support streaming simply ignore the flag and
     * return empty chunks — no separate method needed.
     */
    launch(config: SessionProviderConfig): {
        chunks: AsyncIterable<SessionChunk>;
        result: Promise<SessionProviderResult>;
    };
}
export interface SessionProviderConfig {
    /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
    systemPrompt?: string;
    /** Initial user message (e.g. writ description). */
    initialPrompt?: string;
    /** Model to use (from guild settings). */
    model: string;
    /** Optional conversation id for resume. */
    conversationId?: string;
    /** Working directory for the session. */
    cwd: string;
    /**
     * Enable streaming output. When true, the provider should yield output
     * chunks as the session produces them. When false (default), the chunks
     * iterable should complete immediately with no items.
     *
     * Providers that don't support streaming may ignore this flag.
     */
    streaming?: boolean;
    /**
     * Resolved tools for this session. When present, the provider should
     * configure an MCP server with these tool definitions.
     *
     * The Loom resolves role → permissions → tools via the Instrumentarium.
     * The Animator passes them through from the AnimaWeave.
     */
    tools?: ResolvedTool[];
    /**
     * Merged environment variables to spread into the spawned process.
     * The Animator merges identity-layer (weave) and task-layer (request)
     * variables before passing them here — task layer wins on collision.
     */
    environment?: Record<string, string>;
}
/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;
export interface SessionProviderResult {
    /** Exit status. */
    status: 'completed' | 'failed' | 'timeout';
    /** Numeric exit code from the process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Provider's session id (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage, if the provider can report it. */
    tokenUsage?: TokenUsage;
    /** Cost in USD, if the provider can report it. */
    costUsd?: number;
    /** The session's full transcript — array of NDJSON message objects. */
    transcript?: TranscriptMessage[];
    /**
     * The final assistant text from the session.
     * Extracted from the last assistant message's text content blocks.
     * Undefined if the session produced no assistant output.
     */
    output?: string;
}
/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
    id: string;
    /**
     * Session status. Initially written as `'running'` when the session is
     * launched (Step 2), then updated to a terminal status (`'completed'`,
     * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
     * The `'running'` state is transient — it only exists between Steps 2 and 5.
     * `SessionResult.status` only includes terminal states.
     */
    status: 'running' | 'completed' | 'failed' | 'timeout';
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    provider: string;
    exitCode?: number;
    error?: string;
    conversationId?: string;
    providerSessionId?: string;
    tokenUsage?: TokenUsage;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    /** The final assistant text from the session. */
    output?: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
    /** Same as the session id. */
    id: string;
    /** Full NDJSON transcript from the session. */
    messages: TranscriptMessage[];
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
    /**
     * Plugin id of the apparatus that implements AnimatorSessionProvider.
     * The Animator looks this up via guild().apparatus() at animate-time.
     * Defaults to 'claude-code' if not specified.
     */
    sessionProvider?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        animator?: AnimatorConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/claude-code/dist/index.d.ts ===
/**
 * Claude Code Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider for the
 * Claude Code CLI. The Animator discovers this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "claude-code"
 *
 * Launches sessions via the `claude` CLI in autonomous mode (--print)
 * with --output-format stream-json for structured telemetry.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { SessionChunk } from '@shardworks/animator-apparatus';
/**
 * Extract the final assistant text from a transcript.
 *
 * Walks the transcript backwards to find the last `assistant` message
 * and concatenates its text content blocks.
 *
 * @internal Exported for testing only.
 */
export declare function extractFinalAssistantText(transcript: Record<string, unknown>[]): string | undefined;
/**
 * Create the Claude Code session provider apparatus.
 *
 * The apparatus has no startup logic — it just provides the
 * AnimatorSessionProvider implementation. The Animator looks it up
 * via guild().apparatus('claude-code').
 */
export declare function createClaudeCodeProvider(): Plugin;
declare const _default: Plugin;
export default _default;
export { createMcpServer, startMcpHttpServer } from './mcp-server.ts';
export type { McpHttpHandle } from './mcp-server.ts';
/** Parsed result from stream-json output. @internal */
export interface StreamJsonResult {
    exitCode: number;
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    providerSessionId?: string;
}
/**
 * Parse a single NDJSON message from stream-json output.
 *
 * Returns parsed chunks for streaming and accumulates data into the
 * provided accumulators (transcript, metrics).
 *
 * @internal Exported for testing only.
 */
export declare function parseStreamJsonMessage(msg: Record<string, unknown>, acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
}): SessionChunk[];
/**
 * Process NDJSON buffer, calling handler for each complete line.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export declare function processNdjsonBuffer(buffer: string, handler: (msg: Record<string, unknown>) => void): string;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/claude-code/dist/mcp-server.d.ts ===
/**
 * MCP Tool Server — serves guild tools as typed MCP tools during anima sessions.
 *
 * Two entry points:
 *
 * 1. **`createMcpServer(tools)`** — library function. Takes an array of
 *    ToolDefinitions (already resolved by the Instrumentarium) and returns
 *    a configured McpServer.
 *
 * 2. **`startMcpHttpServer(tools)`** — starts an in-process HTTP server
 *    serving the MCP tool set via Streamable HTTP on an ephemeral localhost
 *    port. Returns a handle with the URL (for --mcp-config) and a close()
 *    function for cleanup.
 *
 * The MCP server is one-per-session. The claude-code provider owns the
 * lifecycle — starts before the Claude process, stops after it exits.
 *
 * See: docs/architecture/apparatus/claude-code.md
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Handle returned by startMcpHttpServer().
 *
 * Provides the URL for --mcp-config and a close() function for cleanup.
 */
export interface McpHttpHandle {
    /** URL for --mcp-config (e.g. "http://127.0.0.1:PORT/mcp"). */
    url: string;
    /** Shut down the HTTP server and MCP transport. */
    close(): Promise<void>;
}
/**
 * Create and configure an MCP server with the given tools.
 *
 * Each tool's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to
 * validate params via Zod and format the result as MCP tool output.
 *
 * Tools with `callableBy` set that does not include `'anima'` are
 * filtered out. Tools without `callableBy` are included (available
 * to all callers by default).
 */
export declare function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>;
/**
 * Start an in-process HTTP server serving the MCP tool set via SSE.
 *
 * Uses the MCP SDK's SSE transport: the client GETs /sse to establish
 * the event stream, then POSTs messages to /message. Claude Code's
 * --mcp-config expects `type: "sse"` for HTTP-based MCP servers.
 *
 * The server binds to 127.0.0.1 only — not network-accessible.
 *
 * Returns a handle with the URL (for --mcp-config) and a close() function.
 * The caller is responsible for calling close() after the session exits.
 *
 * Each session gets its own server instance. Concurrent sessions get
 * independent servers on different ports.
 */
export declare function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>;
//# sourceMappingURL=mcp-server.d.ts.map
=== packages/plugins/clerk/dist/clerk.d.ts ===
/**
 * The Clerk — writ lifecycle management apparatus.
 *
 * The Clerk manages the lifecycle of writs: lightweight work orders that flow
 * through a fixed status machine (ready → active → completed/failed, or
 * ready/active → cancelled). Each writ has a type, a title, a body, and
 * optional codex and resolution fields.
 *
 * Writ types are validated against the guild config's writTypes field plus the
 * built-in type ('mandate'). An unknown type is rejected at post time.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createClerk(): Plugin;
//# sourceMappingURL=clerk.d.ts.map
=== packages/plugins/clerk/dist/index.d.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
export { type ClerkApi, type ClerkConfig, type WritTypeEntry, type WritDoc, type WritLinkDoc, type WritLinks, type WritStatus, type PostCommissionRequest, type WritFilters, } from './types.ts';
export { createClerk } from './clerk.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/commission-post.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    title: z.ZodString;
    body: z.ZodString;
    type: z.ZodOptional<z.ZodString>;
    codex: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=commission-post.d.ts.map
=== packages/plugins/clerk/dist/tools/index.d.ts ===
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
export { default as writLink } from './writ-link.ts';
export { default as writUnlink } from './writ-unlink.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-accept.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-accept.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-cancel.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=writ-cancel.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-complete.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-complete.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-fail.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-fail.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-link.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-link.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-list.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        ready: "ready";
        active: "active";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>>;
    type: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=writ-list.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-show.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-show.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-unlink.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-unlink.d.ts.map
=== packages/plugins/clerk/dist/types.d.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */
/**
 * A writ's position in its lifecycle.
 *
 * Transitions:
 *   ready → active (accept)
 *   active → completed (complete)
 *   active → failed (fail)
 *   ready | active → cancelled (cancel)
 *
 * completed, failed, cancelled are terminal — no further transitions.
 */
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
/**
 * A writ document as stored in The Stacks.
 */
export interface WritDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique writ id (`w-{base36_timestamp}{hex_random}`). Sortable by creation time. */
    id: string;
    /** Writ type — must be a type declared in guild config, or a built-in type. */
    type: string;
    /** Current lifecycle status. */
    status: WritStatus;
    /** Short human-readable title. */
    title: string;
    /** Detail text. */
    body: string;
    /** Target codex name. */
    codex?: string;
    /** ISO timestamp when the writ was created. */
    createdAt: string;
    /** ISO timestamp of the last mutation. */
    updatedAt: string;
    /** ISO timestamp when the writ was accepted (transitioned to active). */
    acceptedAt?: string;
    /** ISO timestamp when the writ reached a terminal state. */
    resolvedAt?: string;
    /** Summary of how the writ resolved (set on any terminal transition). */
    resolution?: string;
}
/**
 * Request to post a new commission (create a writ).
 */
export interface PostCommissionRequest {
    /**
     * Writ type. Defaults to the guild's configured defaultType, or "mandate"
     * if no default is configured. Must be a valid declared type.
     */
    type?: string;
    /** Short human-readable title describing the work. */
    title: string;
    /** Detail text. */
    body: string;
    /** Optional target codex name. */
    codex?: string;
}
/**
 * Filters for listing writs.
 */
export interface WritFilters {
    /** Filter by status. */
    status?: WritStatus;
    /** Filter by writ type. */
    type?: string;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * A writ type entry declared in clerk config.
 */
export interface WritTypeEntry {
    /** The writ type name (e.g. "mandate", "task", "bug"). */
    name: string;
    /** Optional human-readable description of this writ type. */
    description?: string;
}
/**
 * Clerk apparatus configuration — lives under the `clerk` key in guild.json.
 */
export interface ClerkConfig {
    /** Additional writ type declarations. The built-in type "mandate" is always valid. */
    writTypes?: WritTypeEntry[];
    /** Default writ type when commission-post is called without a type (default: "mandate"). */
    defaultType?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        clerk?: ClerkConfig;
    }
}
/**
 * A link document as stored in The Stacks (clerk/links book).
 */
export interface WritLinkDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Deterministic composite key: `{sourceId}:{targetId}:{type}`. */
    id: string;
    /** The writ that is the origin of this relationship. */
    sourceId: string;
    /** The writ that is the target of this relationship. */
    targetId: string;
    /** Relationship type — an open string (e.g. "fixes", "retries", "supersedes", "duplicates"). */
    type: string;
    /** ISO timestamp when the link was created. */
    createdAt: string;
}
/**
 * Result of querying links for a writ — both directions in one response.
 */
export interface WritLinks {
    /** Links where this writ is the source (this writ → other writ). */
    outbound: WritLinkDoc[];
    /** Links where this writ is the target (other writ → this writ). */
    inbound: WritLinkDoc[];
}
/**
 * The Clerk's runtime API — retrieved via guild().apparatus<ClerkApi>('clerk').
 */
export interface ClerkApi {
    /**
     * Post a new commission, creating a writ in 'ready' status.
     * Validates the writ type against declared types in guild config.
     */
    post(request: PostCommissionRequest): Promise<WritDoc>;
    /**
     * Show a writ by id. Throws if not found.
     */
    show(id: string): Promise<WritDoc>;
    /**
     * List writs with optional filters, ordered by createdAt descending.
     */
    list(filters?: WritFilters): Promise<WritDoc[]>;
    /**
     * Count writs matching optional filters.
     */
    count(filters?: WritFilters): Promise<number>;
    /**
     * Transition a writ to a new status, optionally setting additional fields.
     * Validates that the transition is legal.
     */
    transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
    /**
     * Create a typed directional link from one writ to another.
     * Both writs must exist. Self-links are rejected. Idempotent — returns
     * the existing link if the (sourceId, targetId, type) triple already exists.
     */
    link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
    /**
     * Query all links for a writ — both outbound (this writ is the source)
     * and inbound (this writ is the target).
     */
    links(writId: string): Promise<WritLinks>;
    /**
     * Remove a link. Idempotent — no error if the link does not exist.
     */
    unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/codexes/dist/git.d.ts ===
/**
 * Lightweight git helper — typed wrapper around child_process.execFile.
 *
 * All git operations in the Scriptorium go through this module for
 * safety (no shell injection) and consistent error handling.
 */
export interface GitResult {
    stdout: string;
    stderr: string;
}
export declare class GitError extends Error {
    readonly command: string[];
    readonly stderr: string;
    readonly exitCode: number | null;
    constructor(message: string, command: string[], stderr: string, exitCode: number | null);
}
/**
 * Run a git command with typed error handling.
 *
 * @param args - git subcommand and arguments (e.g. ['clone', '--bare', url])
 * @param cwd - working directory for the command
 */
export declare function git(args: string[], cwd?: string): Promise<GitResult>;
/**
 * Resolve the default branch of a bare clone by reading HEAD.
 *
 * Returns the branch name (e.g. 'main'), not the full ref.
 */
export declare function resolveDefaultBranch(bareClonePath: string): Promise<string>;
/**
 * Get the commit SHA at the tip of a branch in a bare clone.
 */
export declare function resolveRef(bareClonePath: string, ref: string): Promise<string>;
/**
 * Check if a branch has commits ahead of another branch.
 * Returns the number of commits ahead.
 */
export declare function commitsAhead(bareClonePath: string, branch: string, base: string): Promise<number>;
//# sourceMappingURL=git.d.ts.map
=== packages/plugins/codexes/dist/index.d.ts ===
/**
 * @shardworks/codexes-apparatus — The Scriptorium.
 *
 * Guild codex management: bare clone registry, draft binding lifecycle
 * (git worktrees), sealing (ff-only merge or rebase+ff), and push.
 * Default export is the apparatus plugin.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export type { ScriptoriumApi, CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, PushRequest, SealResult, CodexesConfig, CodexesSettings, CodexConfigEntry, } from './types.ts';
export { createScriptorium } from './scriptorium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/scriptorium-core.d.ts ===
/**
 * The Scriptorium — core logic.
 *
 * Manages the codex registry (bare clones), draft binding lifecycle
 * (worktrees), and sealing (ff-only merge or rebase+ff). All git
 * operations go through the git helper for safety.
 *
 * Draft tracking is in-memory — drafts are reconstructed from
 * filesystem state at startup and maintained in memory during the
 * process lifetime.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, SealResult, PushRequest, ScriptoriumApi } from './types.ts';
export declare class ScriptoriumCore {
    private codexes;
    private drafts;
    private maxMergeRetries;
    private draftRoot;
    private get home();
    private codexesDir;
    private bareClonePath;
    private draftWorktreePath;
    start(): void;
    /**
     * Load a codex from config. Checks for existing bare clone;
     * initiates background clone if missing.
     */
    private loadCodex;
    /**
     * Reconcile in-memory draft tracking with filesystem state.
     * Scans the worktree directories and rebuilds the draft map.
     */
    private reconcileDrafts;
    /**
     * Ensure a codex's bare clone is ready. Blocks if a background
     * clone is in progress. Throws if the codex is unknown or clone failed.
     */
    private ensureReady;
    private performClone;
    /**
     * Advance refs/heads/<branch> to the remote's position if the remote is
     * strictly ahead of the local sealed binding.
     *
     * This handles commits pushed to the remote outside the Scriptorium:
     * if the remote has advanced past the local sealed binding, sealing must
     * rebase the draft onto the remote position — not the stale local one.
     *
     * If the local sealed binding is already ahead of (or equal to) the remote
     * (e.g. contains unpushed seals from contention scenarios), it is kept.
     */
    private advanceToRemote;
    private performFetch;
    createApi(): ScriptoriumApi;
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    list(): Promise<CodexRecord[]>;
    show(name: string): Promise<CodexDetail>;
    remove(name: string): Promise<void>;
    fetchCodex(name: string): Promise<void>;
    push(request: PushRequest): Promise<void>;
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    seal(request: SealRequest): Promise<SealResult>;
    private draftsForCodex;
    private toCodexRecord;
}
//# sourceMappingURL=scriptorium-core.d.ts.map
=== packages/plugins/codexes/dist/scriptorium.d.ts ===
/**
 * The Scriptorium — apparatus implementation.
 *
 * Wires together the ScriptoriumCore (git operations, draft lifecycle)
 * and exposes the ScriptoriumApi as the `provides` object. Tools are
 * contributed via supportKit.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createScriptorium(): Plugin;
//# sourceMappingURL=scriptorium.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-add.d.ts ===
/**
 * codex-add tool — register an existing git repository as a guild codex.
 *
 * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the entry
 * to guild.json. Blocks until the clone completes.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    remoteUrl: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-add.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-list.d.ts ===
/**
 * codex-list tool — list all registered codexes.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=codex-list.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-push.d.ts ===
/**
 * codex-push tool — push a branch to the codex's remote.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=codex-push.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-remove.d.ts ===
/**
 * codex-remove tool — remove a codex from the guild.
 *
 * Abandons all active drafts, removes the bare clone, and removes
 * the entry from guild.json. Does NOT delete the remote repository.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-remove.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-show.d.ts ===
/**
 * codex-show tool — show details of a specific codex including active drafts.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-show.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-abandon.d.ts ===
/**
 * draft-abandon tool — abandon a draft binding.
 *
 * Removes the git worktree and branch. Fails if the draft has
 * unsealed inscriptions unless force: true.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-abandon.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-list.d.ts ===
/**
 * draft-list tool — list active draft bindings.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-list.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-open.d.ts ===
/**
 * draft-open tool — open a draft binding on a codex.
 *
 * Creates an isolated git worktree for concurrent work. Fetches from
 * the remote before branching to ensure freshness.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
    startPoint: z.ZodOptional<z.ZodString>;
    associatedWith: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-open.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-seal.d.ts ===
/**
 * draft-seal tool — seal a draft into the codex.
 *
 * Incorporates the draft's inscriptions into the sealed binding via
 * ff-only merge. If ff is not possible, rebases and retries. Fails
 * hard on conflicts — no merge commits, no auto-resolution.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    sourceBranch: z.ZodString;
    targetBranch: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    keepDraft: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-seal.d.ts.map
=== packages/plugins/codexes/dist/tools/index.d.ts ===
/**
 * Scriptorium tool re-exports.
 */
export { default as codexAdd } from './codex-add.ts';
export { default as codexList } from './codex-list.ts';
export { default as codexShow } from './codex-show.ts';
export { default as codexRemove } from './codex-remove.ts';
export { default as codexPush } from './codex-push.ts';
export { default as draftOpen } from './draft-open.ts';
export { default as draftList } from './draft-list.ts';
export { default as draftAbandon } from './draft-abandon.ts';
export { default as draftSeal } from './draft-seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/types.d.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export interface CodexRecord {
    /** Codex name — unique within the guild. */
    name: string;
    /** Remote repository URL. */
    remoteUrl: string;
    /** Whether the bare clone exists and is healthy. */
    cloneStatus: 'ready' | 'cloning' | 'error';
    /** Number of active drafts for this codex. */
    activeDrafts: number;
}
export interface CodexDetail extends CodexRecord {
    /** Default branch name on the remote (e.g. 'main'). */
    defaultBranch: string;
    /** Timestamp of last fetch. */
    lastFetched: string | null;
    /** Active drafts for this codex. */
    drafts: DraftRecord[];
}
export interface DraftRecord {
    /** Unique draft id (ULID). */
    id: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for this draft. */
    branch: string;
    /** Absolute filesystem path to the draft's working directory (git worktree). */
    path: string;
    /** When the draft was opened. */
    createdAt: string;
    /** Optional association — e.g. a writ id. */
    associatedWith?: string;
}
export interface OpenDraftRequest {
    /** Codex to open the draft for. */
    codexName: string;
    /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
    branch?: string;
    /**
     * Starting point — branch, tag, or commit to branch from.
     * Default: remote HEAD (the codex's default branch).
     */
    startPoint?: string;
    /** Optional association metadata (e.g. writ id). */
    associatedWith?: string;
}
export interface AbandonDraftRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch name of the draft to abandon. */
    branch: string;
    /** Force abandonment even if the draft has unsealed inscriptions. */
    force?: boolean;
}
export interface SealRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch to seal (the draft's branch). */
    sourceBranch: string;
    /** Target branch (the sealed binding). Default: codex's default branch. */
    targetBranch?: string;
    /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
    maxRetries?: number;
    /** Keep the draft after successful sealing. Default: false. */
    keepDraft?: boolean;
}
export interface SealResult {
    /** Whether sealing succeeded. */
    success: boolean;
    /** Strategy used: 'fast-forward' or 'rebase'. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts needed (0 = first try). */
    retries: number;
    /** The commit SHA at head of target after sealing. */
    sealedCommit: string;
    /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
    inscriptionsSealed: number;
}
export interface PushRequest {
    /** Codex name. */
    codexName: string;
    /**
     * Branch to push. Default: codex's default branch.
     */
    branch?: string;
}
export interface CodexesConfig {
    settings?: CodexesSettings;
    registered?: Record<string, CodexConfigEntry>;
}
export interface CodexesSettings {
    /** Max rebase-retry attempts during sealing under contention. Default: 3. */
    maxMergeRetries?: number;
    /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
    draftRoot?: string;
}
export interface CodexConfigEntry {
    /** The remote URL of the codex's git repository. */
    remoteUrl: string;
}
export interface ScriptoriumApi {
    /**
     * Register an existing repository as a codex.
     * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
     * entry to the `codexes` config section in `guild.json`.
     * Blocks until the clone completes.
     */
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    /**
     * List all registered codexes with their status.
     */
    list(): Promise<CodexRecord[]>;
    /**
     * Show details for a single codex, including active drafts.
     */
    show(name: string): Promise<CodexDetail>;
    /**
     * Remove a codex from the guild. Abandons all active drafts,
     * removes the bare clone from `.nexus/codexes/`, and removes the
     * entry from `guild.json`. Does NOT delete the remote repository.
     */
    remove(name: string): Promise<void>;
    /**
     * Fetch latest refs from the remote for a codex's bare clone.
     * Called automatically before draft creation and sealing; can
     * also be invoked manually.
     */
    fetch(name: string): Promise<void>;
    /**
     * Push a branch to the codex's remote.
     * Pushes the specified branch (default: codex's default branch)
     * to the bare clone's configured remote. Does not force-push.
     */
    push(request: PushRequest): Promise<void>;
    /**
     * Open a draft binding on a codex.
     *
     * Creates a new git branch from `startPoint` (default: the codex's
     * sealed binding) and checks it out as an isolated worktree under
     * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
     * before branching to ensure freshness.
     *
     * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
     * Rejects with a clear error if a draft with the same branch name
     * already exists for this codex.
     */
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    /**
     * List active drafts, optionally filtered by codex.
     */
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    /**
     * Abandon a draft — remove the draft's worktree and git branch.
     * Fails if the draft has unsealed inscriptions unless `force: true`.
     * The inscriptions persist in the git reflog but the draft is no
     * longer active.
     */
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    /**
     * Seal a draft — incorporate its inscriptions into the sealed binding.
     *
     * Git strategy: fast-forward merge only. If ff is not possible,
     * rebases the draft branch onto the target and retries. Retries up
     * to `maxRetries` times (default: from settings.maxMergeRetries)
     * to handle contention from concurrent sealing. Fails hard if the
     * rebase produces conflicts — no auto-resolution, no merge commits.
     *
     * On success, abandons the draft (unless `keepDraft: true`).
     */
    seal(request: SealRequest): Promise<SealResult>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/fabricator/dist/fabricator.d.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Spider on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */
import type { Plugin } from '@shardworks/nexus-core';
/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
    /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
    engineId: string;
    /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
    upstream: Record<string, unknown>;
}
/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 */
export type EngineRunResult = {
    status: 'completed';
    yields: unknown;
} | {
    status: 'launched';
    sessionId: string;
};
/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
    /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
    id: string;
    /**
     * Execute this engine.
     *
     * @param givens   — the engine's declared inputs, assembled by the Spider.
     * @param context  — minimal execution context: engine id and upstream yields.
     */
    run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
    /**
     * Assemble yields from a completed session.
     *
     * Called by the Spider's collect step when a quick engine's session
     * reaches a terminal state. The engine looks up whatever it needs
     * via guild() — same dependency pattern as run().
     *
     * @param sessionId — the session to collect yields from (primary input).
     * @param givens    — same givens that were passed to run().
     * @param context   — same execution context that was passed to run().
     *
     * If not defined, the Spider uses a generic default:
     *   { sessionId, sessionStatus, output? }
     *
     * Only relevant for quick engines (those that return { status: 'launched' }).
     * Clockwork engines return yields directly from run().
     */
    collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
    /**
     * Look up an engine design by ID.
     * Returns the design if registered, undefined otherwise.
     */
    getEngineDesign(id: string): EngineDesign | undefined;
}
/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export declare function createFabricator(): Plugin;
//# sourceMappingURL=fabricator.d.ts.map
=== packages/plugins/fabricator/dist/index.d.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */
export type { EngineDesign, EngineRunContext, EngineRunResult, } from './fabricator.ts';
export type { FabricatorApi } from './fabricator.ts';
export { createFabricator } from './fabricator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/index.d.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */
export { type LoomApi, type WeaveRequest, type AnimaWeave, type LoomConfig, type RoleDefinition, createLoom, } from './loom.ts';
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        loom?: LoomConfig;
    }
}
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/loom.d.ts ===
/**
 * The Loom — session context composition apparatus.
 *
 * The Loom owns system prompt assembly. Given a role name, it produces
 * an AnimaWeave — the composed identity context that The Animator uses
 * to launch a session. The work prompt (what the anima should do) is
 * not the Loom's concern; it bypasses the Loom and goes directly to
 * the Animator.
 *
 * The Loom resolves the role's permission grants from guild.json, then
 * calls the Instrumentarium to resolve the permission-gated tool set.
 * Tools are returned on the AnimaWeave so the Animator can pass them
 * to the session provider for MCP server configuration.
 *
 * See: docs/specification.md (loom)
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
export interface WeaveRequest {
    /**
     * The role to weave context for (e.g. 'artificer', 'scribe').
     *
     * When provided, the Loom resolves role → permissions from guild.json,
     * then calls the Instrumentarium to resolve the permission-gated tool set.
     * Tools are returned on the AnimaWeave.
     *
     * When omitted, no tool resolution occurs — the AnimaWeave has no tools.
     */
    role?: string;
}
/**
 * The output of The Loom's weave() — the composed anima identity context.
 *
 * Contains the system prompt (produced by the Loom from the anima's
 * identity layers) and the resolved tool set for the role. The work
 * prompt is not part of the weave — it goes directly to the Animator.
 */
export interface AnimaWeave {
    /**
     * The system prompt for the AI process. Composed from guild charter,
     * tool instructions, and role instructions. Undefined when no
     * composition layers produce content.
     */
    systemPrompt?: string;
    /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
    tools?: ResolvedTool[];
    /** Environment variables derived from role identity (e.g. git author/committer). */
    environment?: Record<string, string>;
}
/** The Loom's public API, exposed via `provides`. */
export interface LoomApi {
    /**
     * Weave an anima's session context.
     *
     * Given a role name, produces an AnimaWeave containing the composed
     * system prompt and the resolved tool set. The system prompt is assembled
     * from the guild charter, tool instructions (for the resolved tool set),
     * and role instructions — in that order.
     *
     * Tool resolution is active: if a role is provided and the Instrumentarium
     * is installed, the Loom resolves role → permissions → tools.
     */
    weave(request: WeaveRequest): Promise<AnimaWeave>;
}
/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
    /** Permission grants in `plugin:level` format. */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. Default: false.
     */
    strict?: boolean;
}
/** Loom configuration from guild.json. */
export interface LoomConfig {
    /** Role definitions keyed by role name. */
    roles?: Record<string, RoleDefinition>;
}
/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export declare function createLoom(): Plugin;
//# sourceMappingURL=loom.d.ts.map
=== packages/plugins/parlour/dist/index.d.ts ===
/**
 * @shardworks/parlour-apparatus — The Parlour.
 *
 * Multi-turn conversation management: creates conversations, registers
 * participants, orchestrates turns (with streaming), enforces turn limits,
 * and ends conversations. Delegates session launch to The Animator and
 * context composition to The Loom.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
export { type ParlourApi, type ConversationDoc, type TurnDoc, type ParticipantRecord, type Participant, type CreateConversationRequest, type CreateConversationResult, type ParticipantDeclaration, type TakeTurnRequest, type TurnResult, type ConversationChunk, type ConversationSummary, type ConversationDetail, type TurnSummary, type ListConversationsOptions, } from './types.ts';
export { createParlour } from './parlour.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/parlour.d.ts ===
/**
 * The Parlour — multi-turn conversation management apparatus.
 *
 * Manages two kinds of conversation:
 * - consult: a human talks to an anima
 * - convene: multiple animas hold a structured dialogue
 *
 * The Parlour orchestrates turns — it decides when and for whom to call
 * The Animator, and tracks conversation state in The Stacks. It does not
 * launch sessions itself (delegates to The Animator) or assemble prompts
 * (delegates to The Loom).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Parlour apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks', 'animator', 'loom']` — conversation orchestration
 * - `provides: ParlourApi` — the conversation management API
 * - `supportKit` — contributes `conversations` + `turns` books + management tools
 */
export declare function createParlour(): Plugin;
//# sourceMappingURL=parlour.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-end.d.ts ===
/**
 * conversation-end tool — end an active conversation.
 *
 * Sets conversation status to 'concluded' or 'abandoned'.
 * Idempotent — no error if the conversation is already ended.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    reason: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        concluded: "concluded";
        abandoned: "abandoned";
    }>>>;
}>;
export default _default;
//# sourceMappingURL=conversation-end.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-list.d.ts ===
/**
 * conversation-list tool — list conversations with optional filters.
 *
 * Queries The Parlour's conversations via the ParlourApi.
 * Returns conversation summaries ordered by createdAt descending (newest first).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        concluded: "concluded";
        abandoned: "abandoned";
    }>>;
    kind: z.ZodOptional<z.ZodEnum<{
        consult: "consult";
        convene: "convene";
    }>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=conversation-list.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-show.d.ts ===
/**
 * conversation-show tool — show full detail for a conversation.
 *
 * Returns the complete conversation record including all turns,
 * participant list, and aggregate cost.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=conversation-show.d.ts.map
=== packages/plugins/parlour/dist/tools/index.d.ts ===
/**
 * Parlour tool re-exports.
 */
export { default as conversationList } from './conversation-list.ts';
export { default as conversationShow } from './conversation-show.ts';
export { default as conversationEnd } from './conversation-end.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/types.d.ts ===
/**
 * The Parlour — public types.
 *
 * These types form the contract between The Parlour apparatus and all
 * callers (CLI consult command, clockworks convene handlers, etc.).
 * No implementation details.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { SessionResult, SessionChunk } from '@shardworks/animator-apparatus';
export interface ConversationDoc {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    eventId: string | null;
    participants: ParticipantRecord[];
    /** Stored once at creation — all turns must use the same cwd for --resume. */
    cwd: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface ParticipantRecord {
    /** Stable participant id (generated at creation). */
    id: string;
    kind: 'anima' | 'human';
    name: string;
    /** Anima id, resolved at creation time. Null for human participants. */
    animaId: string | null;
    /**
     * Provider session id for --resume. Updated after each turn so
     * the next turn can continue the provider's conversation context.
     */
    providerSessionId: string | null;
}
/**
 * Internal turn record stored in the turns book.
 * One entry per takeTurn() call — both human and anima turns.
 */
export interface TurnDoc {
    id: string;
    conversationId: string;
    turnNumber: number;
    participantId: string;
    participantName: string;
    participantKind: 'anima' | 'human';
    /** The message passed to this turn (human message or inter-turn context). */
    message: string | null;
    /** Session id from The Animator (null for human turns). */
    sessionId: string | null;
    startedAt: string;
    endedAt: string | null;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface CreateConversationRequest {
    /** Conversation kind. */
    kind: 'consult' | 'convene';
    /** Seed topic or prompt. Used as the initial message for the first turn. */
    topic?: string;
    /** Maximum allowed turns (anima turns only). Null = unlimited. */
    turnLimit?: number;
    /** Participants in the conversation. */
    participants: ParticipantDeclaration[];
    /** Working directory — persists for the conversation's lifetime. */
    cwd: string;
    /** Triggering event id, for conversations started by clockworks. */
    eventId?: string;
}
export interface ParticipantDeclaration {
    kind: 'anima' | 'human';
    /** Display name. For anima participants, this is the anima name
     *  used to resolve identity via The Loom at turn time. */
    name: string;
}
export interface CreateConversationResult {
    conversationId: string;
    participants: Participant[];
}
export interface Participant {
    id: string;
    name: string;
    kind: 'anima' | 'human';
}
export interface TakeTurnRequest {
    conversationId: string;
    participantId: string;
    /** The message for this turn. For consult: the human's message.
     *  For convene: typically assembled by the caller, or omitted to
     *  let The Parlour assemble it automatically. */
    message?: string;
}
export interface TurnResult {
    /** The Animator's session result for this turn. Null for human turns. */
    sessionResult: SessionResult | null;
    /** Turn number within the conversation (1-indexed). */
    turnNumber: number;
    /** Whether the conversation is still active after this turn. */
    conversationActive: boolean;
}
/** A chunk of output from a conversation turn. */
export type ConversationChunk = SessionChunk | {
    type: 'turn_complete';
    turnNumber: number;
    costUsd?: number;
};
export interface ConversationSummary {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    participants: Participant[];
    /** Computed from turn records. */
    turnCount: number;
    /** Aggregate cost across all turns. */
    totalCostUsd: number;
}
export interface ConversationDetail extends ConversationSummary {
    turns: TurnSummary[];
}
export interface TurnSummary {
    sessionId: string | null;
    turnNumber: number;
    participant: string;
    message: string | null;
    startedAt: string;
    endedAt: string | null;
}
export interface ListConversationsOptions {
    status?: 'active' | 'concluded' | 'abandoned';
    kind?: 'consult' | 'convene';
    limit?: number;
}
export interface ParlourApi {
    /**
     * Create a new conversation.
     *
     * Sets up conversation and participant records. Does NOT take a first
     * turn — that's a separate call to takeTurn().
     */
    create(request: CreateConversationRequest): Promise<CreateConversationResult>;
    /**
     * Take a turn in a conversation.
     *
     * For anima participants: weaves context via The Loom, assembles the
     * inter-turn message, and calls The Animator to run a session. Returns
     * the session result. For human participants: records the message as
     * context for the next turn (no session launched).
     *
     * Throws if the conversation is not active or the turn limit is reached.
     */
    takeTurn(request: TakeTurnRequest): Promise<TurnResult>;
    /**
     * Take a turn with streaming output.
     *
     * Same as takeTurn(), but yields ConversationChunks as the session
     * produces output. Includes a turn_complete chunk at the end.
     */
    takeTurnStreaming(request: TakeTurnRequest): {
        chunks: AsyncIterable<ConversationChunk>;
        result: Promise<TurnResult>;
    };
    /**
     * Get the next participant in a conversation.
     *
     * For convene: returns the next anima in round-robin order.
     * For consult: returns the anima participant (human turns are implicit).
     * Returns null if the conversation is not active or the turn limit is reached.
     */
    nextParticipant(conversationId: string): Promise<Participant | null>;
    /**
     * End a conversation.
     *
     * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
     * disconnect). Idempotent — no error if already ended.
     */
    end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;
    /**
     * List conversations with optional filters.
     */
    list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
    /**
     * Show full detail for a conversation.
     */
    show(conversationId: string): Promise<ConversationDetail | null>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/spider/dist/engines/draft.d.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const draftEngine: EngineDesign;
export default draftEngine;
//# sourceMappingURL=draft.d.ts.map
=== packages/plugins/spider/dist/engines/implement.d.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Spider's collect step can poll for completion on subsequent walks.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const implementEngine: EngineDesign;
export default implementEngine;
//# sourceMappingURL=implement.d.ts.map
=== packages/plugins/spider/dist/engines/index.d.ts ===
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/engines/review.d.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can call this engine's collect() method on subsequent crawls.
 *
 * Collect method:
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviewEngine: EngineDesign;
export default reviewEngine;
//# sourceMappingURL=review.d.ts.map
=== packages/plugins/spider/dist/engines/revise.d.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can store ReviseYields on completion.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviseEngine: EngineDesign;
export default reviseEngine;
//# sourceMappingURL=revise.d.ts.map
=== packages/plugins/spider/dist/engines/seal.d.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const sealEngine: EngineDesign;
export default sealEngine;
//# sourceMappingURL=seal.d.ts.map
=== packages/plugins/spider/dist/index.d.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */
export type { EngineStatus, EngineInstance, RigStatus, RigDoc, RigFilters, CrawlResult, SpiderApi, SpiderConfig, DraftYields, SealYields, } from './types.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/spider.d.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createSpider(): Plugin;
//# sourceMappingURL=spider.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-continual.d.ts ===
/**
 * crawl-continual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval. By default the loop runs
 * indefinitely; pass a positive maxIdleCycles to enable auto-stop after
 * that many consecutive idle cycles.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    maxIdleCycles: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pollIntervalMs: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=crawl-continual.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-one.d.ts ===
/**
 * crawl-one tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=crawl-one.d.ts.map
=== packages/plugins/spider/dist/tools/index.d.ts ===
export { default as crawlOneTool } from './crawl-one.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
export { default as rigShowTool } from './rig-show.ts';
export { default as rigListTool } from './rig-list.ts';
export { default as rigForWritTool } from './rig-for-writ.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/tools/rig-for-writ.d.ts ===
/**
 * rig-for-writ tool — find the rig for a given writ.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    writId: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-for-writ.d.ts.map
=== packages/plugins/spider/dist/tools/rig-list.d.ts ===
/**
 * rig-list tool — list rigs with optional filters.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        running: "running";
    }>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=rig-list.d.ts.map
=== packages/plugins/spider/dist/tools/rig-show.d.ts ===
/**
 * rig-show tool — retrieve a rig by id.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-show.d.ts.map
=== packages/plugins/spider/dist/types.d.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
 * via `context.upstream` as the escape hatch.
 */
export interface EngineInstance {
    /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
    id: string;
    /** The engine design to look up in the Fabricator. */
    designId: string;
    /** Current execution status. */
    status: EngineStatus;
    /** Engine IDs that must be completed before this engine can run. */
    upstream: string[];
    /** Literal givens values set at rig spawn time. */
    givensSpec: Record<string, unknown>;
    /** Yields from a completed engine run (JSON-serializable). */
    yields?: unknown;
    /** Error message if this engine failed. */
    error?: string;
    /** Session ID from a launched quick engine, used by the collect step. */
    sessionId?: string;
    /** ISO timestamp when execution started. */
    startedAt?: string;
    /** ISO timestamp when execution completed (or failed). */
    completedAt?: string;
}
export type RigStatus = 'running' | 'completed' | 'failed';
/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
 * in-place as engines run and complete.
 */
export interface RigDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique rig id. */
    id: string;
    /** The writ this rig is executing. */
    writId: string;
    /** Current rig status. */
    status: RigStatus;
    /** Ordered engine pipeline. */
    engines: EngineInstance[];
    /** ISO timestamp when the rig was created. */
    createdAt: string;
}
/**
 * Filters for listing rigs.
 */
export interface RigFilters {
    /** Filter by rig status. */
    status?: RigStatus;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult = {
    action: 'engine-completed';
    rigId: string;
    engineId: string;
} | {
    action: 'engine-started';
    rigId: string;
    engineId: string;
} | {
    action: 'rig-spawned';
    rigId: string;
    writId: string;
} | {
    action: 'rig-completed';
    rigId: string;
    writId: string;
    outcome: 'completed' | 'failed';
};
/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
    /**
     * Execute one step of the crawl loop.
     *
     * Priority ordering: collect > run > spawn.
     * Returns null when no work is available.
     */
    crawl(): Promise<CrawlResult | null>;
    /**
     * Show a rig by id. Throws if not found.
     */
    show(id: string): Promise<RigDoc>;
    /**
     * List rigs with optional filters, ordered by createdAt descending.
     */
    list(filters?: RigFilters): Promise<RigDoc[]>;
    /**
     * Find the rig for a given writ. Returns null if no rig exists.
     */
    forWrit(writId: string): Promise<RigDoc | null>;
}
/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
    /**
     * Role to summon for quick engine sessions.
     * Default: 'artificer'.
     */
    role?: string;
    /**
     * Polling interval for crawlContinual tool (milliseconds).
     * Default: 5000.
     */
    pollIntervalMs?: number;
    /**
     * Build command to pass to quick engines.
     */
    buildCommand?: string;
    /**
     * Test command to pass to quick engines.
     */
    testCommand?: string;
}
/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
 * to downstream engines via context.upstream['draft'].
 */
export interface DraftYields {
    /** The draft's unique id. */
    draftId: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for the draft. */
    branch: string;
    /** Absolute filesystem path to the draft's worktree. */
    path: string;
    /** HEAD commit SHA at the time the draft was opened. Used by review engine to compute diffs. */
    baseSha: string;
}
/**
 * Yields from the `seal` clockwork engine.
 */
export interface SealYields {
    /** The commit SHA at head of the target branch after sealing. */
    sealedCommit: string;
    /** Git strategy used. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts. */
    retries: number;
    /** Number of inscriptions (commits) sealed. */
    inscriptionsSealed: number;
}
/**
 * Yields from the `implement` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ImplementYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
/**
 * A single mechanical check (build or test) run by the review engine
 * before launching the reviewer session.
 */
export interface MechanicalCheck {
    /** Check name. */
    name: 'build' | 'test';
    /** Whether the command exited with code 0. */
    passed: boolean;
    /** Combined stdout+stderr, truncated to 4KB. */
    output: string;
    /** Wall-clock duration of the check in milliseconds. */
    durationMs: number;
}
/**
 * Yields from the `review` quick engine.
 * Assembled by the Spider's collect step from session.output and session.metadata.
 */
export interface ReviewYields {
    /** The Animator session id. */
    sessionId: string;
    /** Reviewer's overall assessment — true if the review passed. */
    passed: boolean;
    /** Structured markdown findings from the reviewer's final message. */
    findings: string;
    /** Mechanical check results run before the reviewer session. */
    mechanicalChecks: MechanicalCheck[];
}
/**
 * Yields from the `revise` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        spider?: SpiderConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/stacks/dist/backend.d.ts ===
/**
 * StacksBackend — persistence abstraction for The Stacks.
 *
 * All SQLite-specific types stay behind this interface. The apparatus
 * and all consuming plugins depend only on these types. Backend
 * implementations (SQLite, in-memory) implement this interface.
 *
 * See: docs/specification.md §8
 */
import type { BookEntry, BookSchema, Scalar } from './types.ts';
export interface BookRef {
    ownerId: string;
    book: string;
}
export interface BackendOptions {
    home: string;
}
export interface PutResult {
    created: boolean;
    prev?: BookEntry;
}
export interface PatchResult {
    entry: BookEntry;
    prev: BookEntry;
}
export interface DeleteResult {
    found: boolean;
    prev?: BookEntry;
}
export type InternalCondition = {
    field: string;
    op: 'eq' | 'neq';
    value: Scalar;
} | {
    field: string;
    op: 'gt' | 'gte' | 'lt' | 'lte';
    value: number | string;
} | {
    field: string;
    op: 'like';
    value: string;
} | {
    field: string;
    op: 'in';
    values: Scalar[];
} | {
    field: string;
    op: 'isNull' | 'isNotNull';
};
export interface InternalQuery {
    where?: InternalCondition[];
    orderBy?: Array<{
        field: string;
        dir: 'asc' | 'desc';
    }>;
    limit?: number;
    offset?: number;
}
/** Narrowed query type for count() — conditions only, no pagination. */
export interface CountQuery {
    where?: InternalCondition[];
}
export interface BackendTransaction {
    put(ref: BookRef, entry: BookEntry, opts?: {
        withPrev: boolean;
    }): PutResult;
    patch(ref: BookRef, id: string, fields: Record<string, unknown>): PatchResult;
    delete(ref: BookRef, id: string, opts?: {
        withPrev: boolean;
    }): DeleteResult;
    get(ref: BookRef, id: string): BookEntry | null;
    find(ref: BookRef, query: InternalQuery): BookEntry[];
    count(ref: BookRef, query: CountQuery): number;
    commit(): void;
    rollback(): void;
}
export interface StacksBackend {
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=backend.d.ts.map
=== packages/plugins/stacks/dist/cdc.d.ts ===
/**
 * CDC registry — handler registration, event buffering, and coalescing.
 *
 * Two-phase execution model:
 * - Phase 1 (failOnError: true):  runs INSIDE the transaction
 * - Phase 2 (failOnError: false): runs AFTER commit with coalesced events
 *
 * See: docs/specification.md (stacks § CDC)
 */
import type { BookEntry, ChangeEvent, ChangeHandler, WatchOptions } from './types.ts';
interface WatcherEntry {
    handler: ChangeHandler;
    failOnError: boolean;
}
export interface BufferedEvent {
    ref: string;
    ownerId: string;
    book: string;
    docId: string;
    type: 'create' | 'update' | 'delete';
    entry?: BookEntry;
    prev?: BookEntry;
}
/**
 * Coalesce buffered events per-document.
 *
 * Rules:
 *   create                    → create (final state)
 *   create → update(s)        → create (final state)
 *   create → delete           → (no event)
 *   update(s)                 → update (first prev, final state)
 *   update(s) → delete        → delete (first prev)
 *   delete                    → delete (prev)
 */
export declare function coalesceEvents(buffer: BufferedEvent[]): ChangeEvent<BookEntry>[];
export declare class CdcRegistry {
    private readonly watchers;
    private locked;
    /**
     * Register a CDC handler for a book.
     * Must be called before any writes (enforced by `locked` flag).
     */
    watch(ownerId: string, bookName: string, handler: ChangeHandler, options?: WatchOptions): void;
    /** Mark the registry as locked — called on first write. */
    lock(): void;
    /** Check if any handlers are registered for a book (controls pre-read). */
    hasWatchers(ownerId: string, bookName: string): boolean;
    /** Get Phase 1 handlers (failOnError: true) for a book. */
    getPhase1Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /** Get Phase 2 handlers (failOnError: false) for a book. */
    getPhase2Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /**
     * Fire Phase 1 handlers for a single event. Throws on handler error
     * (caller is responsible for rolling back the transaction).
     */
    firePhase1(ownerId: string, bookName: string, event: ChangeEvent<BookEntry>): Promise<void>;
    /**
     * Fire Phase 2 handlers for coalesced events. Errors are logged, not thrown.
     */
    firePhase2(events: ChangeEvent<BookEntry>[]): Promise<void>;
}
export {};
//# sourceMappingURL=cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/helpers.d.ts ===
/**
 * Conformance test helpers — create a StacksApi from a bare backend,
 * bypassing the guild startup machinery.
 *
 * Each test gets a fresh backend + API instance. No state leaks.
 */
import type { StacksBackend, BookRef } from '../backend.ts';
import type { BookEntry, StacksApi, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, WatchOptions } from '../types.ts';
export interface TestStacks {
    stacks: StacksApi;
    backend: StacksBackend;
    /** Ensure a book exists (bypasses kit contribution flow). */
    ensureBook(ownerId: string, bookName: string, schema?: {
        indexes?: (string | string[])[];
    }): void;
}
export declare function createTestStacks(backendFactory: () => StacksBackend): TestStacks;
export declare function seedDocument(backend: StacksBackend, ref: BookRef, entry: BookEntry): void;
export declare function collectEvents<T extends BookEntry = BookEntry>(stacks: StacksApi, ownerId: string, bookName: string, options?: WatchOptions): ChangeEvent<T>[];
export interface PutCall {
    ref: BookRef;
    entry: BookEntry;
    withPrev: boolean;
}
/**
 * Wraps a backend factory to record put() calls on transactions,
 * so tests can verify whether withPrev was requested.
 */
export declare function spyingBackendFactory(factory: () => StacksBackend): {
    factory: () => StacksBackend;
    putCalls: PutCall[];
};
/** Assert the event is a `create` and check its fields. */
export declare function assertCreateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is CreateEvent<BookEntry>;
/** Assert the event is an `update` and check its fields. */
export declare function assertUpdateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is UpdateEvent<BookEntry>;
/** Assert the event is a `delete` and check its fields. */
export declare function assertDeleteEvent(event: ChangeEvent<BookEntry>, expected: {
    id: string;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is DeleteEvent<BookEntry>;
export declare const OWNER = "test-owner";
export declare const BOOK = "testbook";
export declare const REF: BookRef;
//# sourceMappingURL=helpers.d.ts.map
=== packages/plugins/stacks/dist/conformance/suite.d.ts ===
/**
 * Stacks conformance test suite — parametric registration.
 *
 * Exports a single function that registers all conformance tiers
 * against a given backend factory. Each backend test file calls
 * this with its own factory function.
 */
import type { StacksBackend } from '../backend.ts';
export declare function runConformanceSuite(suiteName: string, backendFactory: () => StacksBackend): void;
//# sourceMappingURL=suite.d.ts.map
=== packages/plugins/stacks/dist/conformance/testable-stacks.d.ts ===
/**
 * Testable Stacks — a minimal StacksApi wired directly to a backend,
 * without requiring the guild startup machinery.
 *
 * Uses the same StacksCore as the production apparatus, ensuring
 * behavioral identity by construction.
 */
import type { StacksBackend } from '../backend.ts';
import type { StacksApi } from '../types.ts';
export declare function createTestableStacks(backend: StacksBackend): StacksApi;
//# sourceMappingURL=testable-stacks.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier1-data-integrity.d.ts ===
/**
 * Tier 1 — Data Integrity conformance tests.
 *
 * Failures here mean data loss or corruption. Non-negotiable.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier1DataIntegrity(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier1-data-integrity.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2-cdc.d.ts ===
/**
 * Tier 2 — CDC Behavioral Correctness conformance tests.
 *
 * Failures here mean the CDC contract is violated.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier2Cdc(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2-cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2.5-transactions.d.ts ===
/**
 * Tier 2.5 — Transaction Semantics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier25Transactions(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2.5-transactions.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier3-queries.d.ts ===
/**
 * Tier 3 — Query Correctness conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier3Queries(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier3-queries.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier4-edge-cases.d.ts ===
/**
 * Tier 4 — Edge Cases and Ergonomics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier4EdgeCases(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier4-edge-cases.d.ts.map
=== packages/plugins/stacks/dist/field-utils.d.ts ===
/**
 * Shared field access and order-by utilities.
 *
 * Used by both the apparatus-level logic (stacks-core.ts) and the
 * memory backend (memory-backend.ts). Kept in a minimal module with
 * no heavy dependencies.
 */
import type { BookEntry, OrderBy } from './types.ts';
/**
 * Access a potentially nested field via dot-notation (e.g. "parent.id").
 */
export declare function getNestedField(obj: BookEntry | Record<string, unknown>, field: string): unknown;
/**
 * Normalize the public OrderBy type into a uniform array of { field, dir }.
 *
 * Does NOT validate field names — callers are responsible for ensuring
 * fields have already been validated (e.g. via translateQuery) before
 * reaching this point. translateQuery calls validateFieldName after
 * normalizing because it sits at the untrusted-input boundary.
 */
export declare function normalizeOrderBy(orderBy: OrderBy): Array<{
    field: string;
    dir: 'asc' | 'desc';
}>;
/**
 * Compare two entries by a list of order-by entries.
 *
 * Shared by the memory backend's sortEntries and the apparatus-level
 * OR query re-sort in stacks-core.ts. Null values sort before non-null
 * in ascending order, after non-null in descending order.
 */
export declare function compareByOrderEntries(a: BookEntry | Record<string, unknown>, b: BookEntry | Record<string, unknown>, orderEntries: Array<{
    field: string;
    dir: 'asc' | 'desc';
}>): number;
//# sourceMappingURL=field-utils.d.ts.map
=== packages/plugins/stacks/dist/index.d.ts ===
/**
 * @shardworks/stacks-apparatus — The Stacks apparatus.
 *
 * Guild persistence layer: NoSQL document store with CDC, transactions,
 * and swappable backend. Default export is the apparatus plugin.
 *
 * See: docs/specification.md
 */
export type { StacksConfig, BookEntry, BookSchema, Book, ReadOnlyBook, Scalar, WhereCondition, WhereClause, OrderEntry, OrderBy, Pagination, BookQuery, ListOptions, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, ChangeHandler, WatchOptions, StacksApi, TransactionContext, } from './types.ts';
export type { StacksBackend, BackendTransaction, BackendOptions, BookRef, InternalQuery, InternalCondition, CountQuery, PutResult, PatchResult, DeleteResult, } from './backend.ts';
export { createStacksApparatus } from './stacks.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/stacks/dist/memory-backend.d.ts ===
/**
 * In-memory StacksBackend for tests.
 *
 * Exported via `@shardworks/stacks-apparatus/testing`. No SQLite dependency.
 * Implements the same contract as the SQLite backend.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare class MemoryBackend implements StacksBackend {
    private store;
    open(_options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, _schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=memory-backend.d.ts.map
=== packages/plugins/stacks/dist/query.d.ts ===
/**
 * Query translation — public WhereClause tuples → InternalQuery.
 *
 * Validates field names against a safe allowlist, then maps the
 * user-facing operator strings to the backend's internal enum.
 */
import type { BookQuery, WhereClause } from './types.ts';
import type { InternalCondition, InternalQuery } from './backend.ts';
export declare function validateFieldName(field: string): string;
export declare function translateQuery(query: BookQuery): InternalQuery;
/**
 * Translate a WhereClause into conditions only (no pagination fields).
 * OR clauses are handled at the apparatus level — this only handles AND.
 */
export declare function translateWhereClause(where?: WhereClause | {
    or: WhereClause[];
}): {
    where?: InternalCondition[];
};
//# sourceMappingURL=query.d.ts.map
=== packages/plugins/stacks/dist/sqlite-backend.d.ts ===
/**
 * SQLite backend for The Stacks — backed by better-sqlite3.
 *
 * Implements the StacksBackend interface. All SQLite-specific details
 * (json_extract, table naming, WAL mode) are encapsulated here.
 *
 * Documents are stored as JSON blobs in a `content` TEXT column.
 * Field queries use json_extract() against declared indexes.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare function tableName(ref: BookRef): string;
export declare class SqliteBackend implements StacksBackend {
    private db;
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
    private requireDb;
}
//# sourceMappingURL=sqlite-backend.d.ts.map
=== packages/plugins/stacks/dist/stacks-core.d.ts ===
/**
 * Stacks core — shared implementation logic for both the production
 * apparatus (stacks.ts) and the testable harness (testable-stacks.ts).
 *
 * This module contains ALL read/write/transaction/CDC logic. The two
 * consumer modules only add their own wiring: the apparatus adds guild()
 * startup and plugin schema reconciliation; the testable harness adds
 * nothing (just exposes createApi() directly).
 *
 * This ensures behavioral identity by construction, not by copy-paste.
 */
import type { BookRef, StacksBackend } from './backend.ts';
import type { BookEntry, BookQuery, StacksApi, TransactionContext, WhereClause } from './types.ts';
export declare class StacksCore {
    readonly backend: StacksBackend;
    private readonly cdc;
    private activeTx;
    constructor(backend: StacksBackend);
    createApi(): StacksApi;
    runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
    private createTransactionContext;
    doPut(ref: BookRef, entry: BookEntry): Promise<void>;
    private doPutInTx;
    doPatch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<BookEntry>;
    private doPatchInTx;
    doDelete(ref: BookRef, id: string): Promise<void>;
    private doDeleteInTx;
    doGet(ref: BookRef, id: string): BookEntry | null;
    doFind(ref: BookRef, query: BookQuery): Promise<BookEntry[]>;
    /**
     * OR queries: run each branch as a separate backend query, deduplicate
     * by id, re-sort, and paginate the merged result set.
     *
     * V1 trade-off: when called outside an active transaction, each branch
     * opens its own throwaway read transaction. For synchronous backends
     * like better-sqlite3, the data can't change between branches so this
     * is safe. A hypothetical async backend could see different snapshots
     * per branch, producing inconsistent results — a known limitation
     * documented in the spec's implementation notes.
     *
     * Performance note: each branch is a separate backend query. count()
     * with OR cannot use the backend's efficient count path since
     * deduplication requires knowing which IDs overlap. Acceptable for v1.
     */
    private doFindOr;
    doCount(ref: BookRef, where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
    private requireTx;
}
//# sourceMappingURL=stacks-core.d.ts.map
=== packages/plugins/stacks/dist/stacks.d.ts ===
/**
 * The Stacks — apparatus implementation.
 *
 * Wires together the backend, CDC registry, and transaction model
 * to provide the StacksApi `provides` object. All core read/write/
 * transaction logic lives in stacks-core.ts.
 *
 * See: docs/specification.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { StacksBackend } from './backend.ts';
export declare function createStacksApparatus(backend?: StacksBackend): Plugin;
//# sourceMappingURL=stacks.d.ts.map
=== packages/plugins/stacks/dist/types.d.ts ===
/**
 * The Stacks — public API types.
 *
 * These types form the contract between The Stacks apparatus and all
 * consuming plugins. No SQLite types, no implementation details.
 *
 * See: docs/specification.md
 */
/** Plugin configuration stored at guild.json["stacks"]. */
export interface StacksConfig {
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified.
     */
    autoMigrate?: boolean;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        stacks?: StacksConfig;
    }
}
/** Every document stored in a book must satisfy this constraint. */
export type BookEntry = {
    id: string;
} & Record<string, unknown>;
/**
 * Schema declaration for a single book in a kit's `books` contribution.
 *
 * `indexes` is a list of fields to create efficient query indexes for.
 * Field names use plain notation ('status') or dot-notation for nested
 * fields ('parent.id'). The Stacks translates internally.
 */
export interface BookSchema {
    indexes?: (string | string[])[];
}
export type Scalar = string | number | boolean | null;
export type WhereCondition = [field: string, op: '=' | '!=', value: Scalar] | [field: string, op: '>' | '>=' | '<' | '<=', value: number | string] | [field: string, op: 'LIKE', value: string] | [field: string, op: 'IN', value: Scalar[]] | [field: string, op: 'IS NULL' | 'IS NOT NULL'];
export type WhereClause = WhereCondition[];
export type OrderEntry = [field: string, direction: 'asc' | 'desc'];
export type OrderBy = OrderEntry | OrderEntry[];
export type Pagination = {
    limit: number;
    offset?: number;
} | {
    limit?: never;
    offset?: never;
};
export type BookQuery = {
    where?: WhereClause | {
        or: WhereClause[];
    };
    orderBy?: OrderBy;
} & Pagination;
export type ListOptions = {
    orderBy?: OrderBy;
} & Pagination;
/** Read-only view of a book — returned by `readBook()` for cross-plugin access. */
export interface ReadOnlyBook<T extends BookEntry> {
    get(id: string): Promise<T | null>;
    find(query: BookQuery): Promise<T[]>;
    list(options?: ListOptions): Promise<T[]>;
    count(where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
}
/** Writable book handle — returned by `book()` for own-plugin access. */
export interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
    /**
     * Upsert a document. Creates if `entry.id` is new; replaces entirely
     * if it already exists. Fires a `create` or `update` CDC event.
     */
    put(entry: T): Promise<void>;
    /**
     * Partially update a document. Merges top-level fields into the existing
     * document. Throws if the document does not exist. Returns the updated
     * document. Fires an `update` CDC event.
     */
    patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
    /**
     * Delete a document by id. Silent no-op if it does not exist.
     * Fires a `delete` CDC event only if the document existed.
     */
    delete(id: string): Promise<void>;
}
export interface CreateEvent<T extends BookEntry> {
    type: 'create';
    ownerId: string;
    book: string;
    entry: T;
}
export interface UpdateEvent<T extends BookEntry> {
    type: 'update';
    ownerId: string;
    book: string;
    entry: T;
    prev: T;
}
export interface DeleteEvent<T extends BookEntry> {
    type: 'delete';
    ownerId: string;
    book: string;
    id: string;
    prev: T;
}
export type ChangeEvent<T extends BookEntry> = CreateEvent<T> | UpdateEvent<T> | DeleteEvent<T>;
export type ChangeHandler<T extends BookEntry = BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void;
export interface WatchOptions {
    /**
     * Controls when the handler runs relative to the transaction commit.
     *
     * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
     *   join the same transaction. If the handler throws, everything rolls back.
     *
     * false — Phase 2: runs AFTER the transaction commits. Errors are logged
     *   as warnings but do not affect committed data.
     *
     * @default true
     */
    failOnError?: boolean;
}
export interface TransactionContext {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
}
export interface StacksApi {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
    watch<T extends BookEntry>(ownerId: string, bookName: string, handler: ChangeHandler<T>, options?: WatchOptions): void;
    transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/tools/dist/index.d.ts ===
/**
 * @shardworks/tools-apparatus — The Instrumentarium.
 *
 * Guild tool registry: scans kit contributions, resolves permission-gated
 * tool sets, and provides the InstrumentariumApi for tool lookup and resolution.
 *
 * The tool() factory and ToolDefinition type live here canonically.
 *
 * See: docs/specification.md (instrumentarium)
 */
export { type ToolCaller, type ToolDefinition, tool, isToolDefinition, } from './tool.ts';
export { type InstrumentariumApi, type ResolvedTool, type ResolveOptions, } from './instrumentarium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/tools/dist/instrumentarium.d.ts ===
/**
 * The Instrumentarium — guild tool registry apparatus.
 *
 * Scans installed tools from kit contributions and apparatus supportKits,
 * resolves permission-gated tool sets on demand, and serves as the single
 * source of truth for "what tools exist and who can use them."
 *
 * The Instrumentarium is role-agnostic — it receives an already-resolved
 * permissions array from the Loom and returns the matching tool set.
 * Role definitions and permission grants are owned by the Loom.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ToolDefinition, ToolCaller } from './tool.ts';
/** A resolved tool with provenance metadata. */
export interface ResolvedTool {
    /** The tool definition (name, description, params schema, handler). */
    definition: ToolDefinition;
    /** Plugin id of the kit or apparatus that contributed this tool. */
    pluginId: string;
}
/** Options for resolving a permission-gated tool set. */
export interface ResolveOptions {
    /**
     * Permission grants in `plugin:level` format.
     * Supports wildcards: `plugin:*`, `*:level`, `*:*`.
     */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. When false (default),
     * permissionless tools are included unconditionally.
     */
    strict?: boolean;
    /** Filter by invocation caller. Tools with no callableBy pass all callers. */
    caller?: ToolCaller;
}
/** The Instrumentarium's public API, exposed via `provides`. */
export interface InstrumentariumApi {
    /**
     * Resolve the tool set for a given set of permissions.
     *
     * Evaluates each registered tool against the permission grants:
     * - Tools with a `permission` field: included if any grant matches
     * - Permissionless tools: always included (default) or gated by `strict`
     * - Caller filtering applied last
     */
    resolve(options: ResolveOptions): ResolvedTool[];
    /**
     * Find a single tool by name. Returns null if not installed.
     */
    find(name: string): ResolvedTool | null;
    /**
     * List all installed tools, regardless of permissions.
     */
    list(): ResolvedTool[];
}
/**
 * Create the Instrumentarium apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['tools']` — scans kit/supportKit contributions
 * - `provides: InstrumentariumApi` — the tool registry API
 */
export declare function createInstrumentarium(): Plugin;
//# sourceMappingURL=instrumentarium.d.ts.map
=== packages/plugins/tools/dist/tool.d.ts ===
/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * A package can export a single tool or an array of tools:
 *
 * @example Single tool
 * ```typescript
 * import { tool } from '@shardworks/tools-apparatus';
 * import { z } from 'zod';
 *
 * export default tool({
 *   name: 'lookup',
 *   description: 'Look up an anima by name',
 *   instructionsFile: './instructions.md',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }) => {
 *     const { home } = guild();
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 *
 * @example Tool collection
 * ```typescript
 * export default [
 *   tool({ name: 'commission', description: '...', params: {...}, handler: ... }),
 *   tool({ name: 'signal', description: '...', params: {...}, handler: ... }),
 * ];
 * ```
 */
import { z } from 'zod';
type ZodShape = Record<string, z.ZodType>;
/**
 * The caller types a tool can be invoked by.
 * - `'cli'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'cli' | 'anima' | 'library';
/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
    /** Tool name — used for resolution when a package exports multiple tools. */
    readonly name: string;
    readonly description: string;
    /** Per-tool instructions injected into the anima's session context (inline text). */
    readonly instructions?: string;
    /**
     * Path to an instructions file, relative to the package root.
     * Resolved by the manifest engine at session time.
     * Mutually exclusive with `instructions`.
     */
    readonly instructionsFile?: string;
    /**
     * Caller types this tool is available to.
     * Always a normalized array. Absent means available to all callers.
     */
    readonly callableBy?: ToolCaller[];
    /**
     * Permission level required to invoke this tool. Matched against role grants.
     *
     * Format: a freeform string chosen by the tool author. Conventional names:
     * - `'read'` — query/inspect operations
     * - `'write'` — create/update operations
     * - `'delete'` — destructive operations
     * - `'admin'` — configuration and lifecycle operations
     *
     * Plugins are free to define their own levels.
     * If omitted, the tool is permissionless — included by default in non-strict
     * mode, excluded in strict mode unless the role grants `plugin:*` or `*:*`.
     */
    readonly permission?: string;
    readonly params: z.ZodObject<TShape>;
    readonly handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
}
/** Input to `tool()` — instructions are either inline text or a file path, not both. */
type ToolInput<TShape extends ZodShape> = {
    name: string;
    description: string;
    params: TShape;
    handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
    /**
     * Caller types this tool is available to.
     * Accepts a single caller or an array. Normalized to an array in the returned definition.
     */
    callableBy?: ToolCaller | ToolCaller[];
    /**
     * Permission level required to invoke this tool.
     * See ToolDefinition.permission for details.
     */
    permission?: string;
} & ({
    instructions?: string;
    instructionsFile?: never;
} | {
    instructions?: never;
    instructionsFile?: string;
});
/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * name, description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives one argument:
 * - `params` — the validated input, typed from your Zod schemas
 *
 * To access guild infrastructure (apparatus, config, home path), import
 * `guild` from `@shardworks/nexus-core` and call `guild()` inside the handler.
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 *
 * Instructions can be provided inline or as a file path:
 * - `instructions: 'Use this tool when...'` — inline text
 * - `instructionsFile: './instructions.md'` — resolved at manifest time
 */
export declare function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape>;
/** Type guard: is this value a ToolDefinition? */
export declare function isToolDefinition(obj: unknown): obj is ToolDefinition;
export {};
//# sourceMappingURL=tool.d.ts.map
=== packages/plugins/tools/dist/tools/tools-list.d.ts ===
/**
 * tools-list — administrative view of all tools installed in the guild.
 *
 * Lists the full registry with optional filters for caller type, permission
 * level, and contributing plugin. This is an inventory tool, not a
 * permission-resolved view — use MCP native tool listing for that.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Summary returned for each tool in the list. */
export interface ToolSummary {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
}
export declare function createToolsList(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    caller: z.ZodOptional<z.ZodEnum<{
        cli: "cli";
        anima: "anima";
        library: "library";
    }>>;
    permission: z.ZodOptional<z.ZodString>;
    plugin: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=tools-list.d.ts.map
=== packages/plugins/tools/dist/tools/tools-show.d.ts ===
/**
 * tools-show — show full details for a single tool.
 *
 * Returns name, description, plugin, permission, callableBy, parameter
 * schema, and instructions for the named tool. Returns null if not found.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Parameter info derived from the Zod schema. */
export interface ParamInfo {
    type: string;
    description: string | null;
    optional: boolean;
}
/** Full detail returned for a single tool. */
export interface ToolDetail {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
    params: Record<string, ParamInfo>;
    instructions: string | null;
}
export declare function createToolsShow(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    name: z.ZodString;
}>;
//# sourceMappingURL=tools-show.d.ts.map

