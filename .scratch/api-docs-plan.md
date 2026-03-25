# Implementation Plan: Core API Documentation & Dashboard Gaps

## Goal

Document the Nexus framework's core API to a sufficient level that animas can build new tools, engines, dashboards, and other software that leverages it. Fill functional gaps discovered during the inventory.

---

## Phase 1: Fill API Gaps — ✅ COMPLETE

> Implemented in commit `dc7bd24` by Coco. 27 files changed, +1379 lines.

### 1a. Dashboard Read Functions — ✅

Read-only query functions added to `@shardworks/nexus-core`:

| Function | Module | Returns | Notes |
|----------|--------|---------|-------|
| `listSessions(home, opts?)` | `session.ts` | `SessionSummary[]` | Filter by anima, workshop, trigger, status (active/completed), limit |
| `showSession(home, sessionId)` | `session.ts` | `SessionDetail \| null` | Full session row including token usage, cost, duration |
| `listEvents(home, opts?)` | `events.ts` | `GuildEvent[]` | All events (not just pending). Filter by name pattern (LIKE), emitter, processed status, limit |
| `listDispatches(home, opts?)` | `events.ts` | `DispatchRecord[]` | Filter by event_id, handler_type, handler_name, status, limit |
| `listAuditLog(home, opts?)` | `audit.ts` (new) | `AuditEntry[]` | Filter by actor, action, target_type, target_id, limit |
| `showCommission(home, id)` | `commission.ts` | `CommissionDetail \| null` | Extended version of readCommission that includes assignments and linked sessions |

New types: `SessionSummary`, `SessionDetail`, `ListSessionsOptions`, `ListEventsOptions`, `DispatchRecord`, `ListDispatchesOptions`, `AuditEntry`, `ListAuditLogOptions`, `CommissionDetail`.

**Implementation note:** Date range filters were not implemented on any of the list functions — all use `limit` instead. Date range filtering can be added later if needed.

### 1b. Work Hierarchy Rollup Functions — ✅

| Function | Module | What it does |
|----------|--------|-------------|
| `checkJobCompletion(home, jobId)` | `job.ts` | Returns `{ complete, total, done, pending, failed }` — counts strokes |
| `completeJobIfReady(home, jobId)` | `job.ts` | If no strokes pending, sets job to `completed` (or `failed` if any stroke failed). Signals `job.completed` or `job.failed`. |
| `checkPieceCompletion(home, pieceId)` | `piece.ts` | Same shape — counts jobs |
| `completePieceIfReady(home, pieceId)` | `piece.ts` | If all jobs completed/cancelled (none failed, none pending) → complete. Signals `piece.completed`. |
| `checkWorkCompletion(home, workId)` | `work.ts` | Same shape — counts pieces |
| `completeWorkIfReady(home, workId)` | `work.ts` | If all pieces completed/cancelled → complete. Signals `work.completed`. |
| `checkCommissionCompletion(home, commissionId)` | `commission.ts` | Same shape — counts works |
| `completeCommissionIfReady(home, commissionId)` | `commission.ts` | If all works completed/cancelled → complete. Signals `commission.completed`. |

New events added: `piece.completed` (also fires from `updatePiece` on status=completed), `commission.completed`.

**Policy implemented:** A piece with failed jobs stays `active` — auto-completion only fires when all jobs are completed/cancelled, none failed.

### 1c. CLI Commands — ✅

```
nsg session list [--anima <name>] [--workshop <name>] [--trigger <type>] [--status <status>] [--limit <n>]
nsg session show <id>
nsg event list [--name <pattern>] [--emitter <name>] [--pending] [--limit <n>]
nsg event show <id>
nsg dispatch list [--event <id>] [--handler <name>] [--status <status>] [--limit <n>]
nsg audit list [--actor <name>] [--action <action>] [--target <type>] [--target-id <id>] [--limit <n>]
nsg commission show <id>               # enhanced: shows assignments + sessions
nsg commission check <id>              # shows work completion summary
nsg job check <id>                     # shows stroke completion summary
nsg piece check <id>                   # shows job completion summary
nsg work check <id>                    # shows piece completion summary
```

### 1d. MCP Tools — ✅

| Tool | Registered in bundle | Role assignments |
|------|---------------------|-----------------|
| `session-list` | ✓ | steward |
| `session-show` | ✓ | steward |
| `event-list` | ✓ | steward |
| `event-show` | ✓ | steward |
| `job-check` | ✓ | steward, artificer |
| `piece-check` | ✓ | steward |
| `work-check` | ✓ | steward |
| `commission-check` | ✓ | steward |

**Not as tools** (operator-only via CLI): `dispatch-list`, `audit-list`.

### 1e. Starter Kit Role Assignments — ✅

Updated `init-guild.ts` and `nexus-bundle.json`. Steward gained 8 new tools, artificer gained `job-check`.

---

## Phase 2: Reference Documentation — ✅ COMPLETE

### Location

```
docs/reference/
  core-api.md         — function-by-function reference
  event-catalog.md    — every event, payload, lifecycle
  schema.md           — DB schema, status lifecycles, relationships
```

### 2a. Core API Reference (`docs/reference/core-api.md`)

Organized by domain, not by source file. Each entry has: TypeScript signature, parameter descriptions, return type, one-liner behavior note. Examples only where non-obvious.

Sections:
1. **Authoring** — `tool()`, `engine()`, types, type guards, module resolution
2. **Events** — signaling, reading, listing, validation, dispatch recording
3. **Register** — anima CRUD, instantiation, manifest
4. **Ledger** — commission lifecycle, work decomposition CRUD, hierarchy rollup (check/complete functions)
5. **Daybook** — sessions (list/show), audit log (list)
6. **Clockworks** — clock tick/run
7. **Guild Config** — reading/writing guild.json, types
8. **Infrastructure** — paths, ID generation, preconditions, workshops, worktrees, bundles, migrations

Each domain section opens with a 2-3 sentence overview of what it covers and when you'd use it.

**Implementation note for the agent:** The Phase 1 work added significant new API surface. The core index.ts exports are the source of truth for what's public. Read `packages/core/src/index.ts` first to get the full export list.

### 2b. Event Catalog (`docs/reference/event-catalog.md`)

Three sections:
1. **Framework Events** — every event the framework signals, with payload shape, who fires it, and what standing orders typically respond to it
2. **Custom Events** — how to declare and signal custom events, namespace rules
3. **Standing Order Wiring** — the three order types (`run`, `summon`, `brief`), guild.json format, dispatch lifecycle

Include a "cookbook" subsection with common engine patterns:
- "When session ends, check job completion"
- "When job completes, roll up piece status"
- "When commission posts, auto-assign to workshop"

**Implementation note for the agent:** The complete list of framework events can be found by grepping for `signalEvent(` across `packages/core/src/`. The new Phase 1 events (`piece.completed`, `commission.completed`) need to be included. The reserved namespace list is in `events.ts` (`FRAMEWORK_NAMESPACES`).

### 2c. Schema Reference (`docs/reference/schema.md`)

1. **Entity Relationship Diagram** (ASCII art) — showing the full graph from commissions → works → pieces → jobs → strokes, plus animas ↔ roster ↔ roles, sessions ↔ commission_sessions ↔ commissions
2. **Table-by-table reference** — columns, types, constraints, foreign keys
3. **Status Lifecycles** — valid statuses and transitions for each entity:
   - Anima: aspirant → active → retired
   - Commission: posted → assigned → in_progress → completed/failed
   - Work: open → active → completed/cancelled
   - Piece: open → active → completed/cancelled
   - Job: open → active → completed/failed/cancelled
   - Stroke: pending → complete/failed
4. **ID Conventions** — prefix table, generation strategy

**Implementation note for the agent:** The canonical schema is `packages/guild-starter-kit/migrations/001-schema.sql`. All entity IDs are prefixed hex (e.g. `c-a3f7b2c1`). The prefix table is in `packages/core/src/id.ts` and used across all modules.

### 2d. Update `building-tools.md`

Update the existing guide's "Using @shardworks/nexus-core" section to point to the new reference docs. Add a companion section or separate guide: "Building Engines" — since that guide doesn't exist yet and engines are a primary use case.

---

## Phase 3: Building Engines Guide — ✅ COMPLETE

`docs/guides/building-engines.md` — practical guide parallel to building-tools.md.

Covers:
1. The `engine()` factory — minimal example
2. Standing order wiring — how guild.json connects events to engines
3. Reading and writing guild state from an engine
4. Signaling follow-on events (event chaining)
5. Error handling and the `standing-order.failed` safety net
6. Testing engines (with real guild setup)
7. Installation and registration
8. Reference implementation — a concrete rollup engine that does the "session ends → check job → complete piece" chain

**Implementation note for the agent:** The Phase 1 rollup functions (`completeJobIfReady`, `completePieceIfReady`, etc.) are designed to be called from engines. The reference implementation should show an engine that wires `session.ended` → `completeJobIfReady` → `completePieceIfReady` as an event chain using standing orders.

---

## Phase 4: Delivery Assessment — ✅ COMPLETE

Now that the docs exist (once Phases 2-3 are done) and we know their size and shape, how do we get them to animas who need them? This phase produces a recommendation, not an implementation.

The implementer reviews the docs produced in Phases 2-3, measures their size, and evaluates delivery options:

- **Role instructions** — a "toolsmith" or "framework-developer" role whose instructions include (or reference) the API docs. Manifest engine reads from the guildhall and injects at session time. Works from any workspace.
- **Curriculum** — package the reference as training content. Delivered at instantiation. Current limitation: one curriculum per anima.
- **Tool instructions** — attach relevant doc sections to specific tools (e.g., hierarchy rollup docs ship with `job-check`). Scoped but fragmented.
- **Reference tool** — an MCP tool the anima queries on demand (`api-reference lookup "listSessions"`). Keeps docs out of context until needed. Requires building a tool.
- **Hybrid** — e.g., concise role instructions with a reference tool for deep dives.

The right answer depends on doc size (500 lines of tight reference is fine in a system prompt; 3000 lines is not), commission context (a dashboard builder needs the full API; an engine builder needs events + hierarchy), and whether the docs are stable enough to snapshot into curricula or should be read live from the guildhall.

The deliverable for Phase 4 is a short recommendation doc with the chosen approach, rationale, and implementation steps — which then becomes its own commission if non-trivial.

---

## Commissioning Strategy

### What's Done

Phase 1 (all sub-phases) is complete. The API surface now exists for dashboard reads and hierarchy rollup. CLI and MCP tools are wired and role-gated. 13/13 tests pass.

### What's Left — Commissioning Recommendations

**Phase 2** is documentation — reference material. Could be one commission but it's heavy. Recommended split:
- **2A:** Core API reference (the big one — requires reading every export in `index.ts` and documenting accurately)
- **2B+2C:** Event catalog + schema reference (smaller, more mechanical — can run in parallel with 2A)
- **2D:** Building-tools update (small, depends on 2A existing to link to)

**Phase 3** is a standalone commission that depends on Phase 2 being done (so the guide can reference the docs).

**Phase 4** is a delivery assessment — depends on all docs existing so the assessor can measure their actual size and shape.

### Execution Order

```
Phase 2A     (core API reference)           ← commissionable now
Phase 2B+2C  (event catalog + schema)       ← commissionable now, parallel with 2A
     ↓
Phase 2D + Phase 3  (guides — depend on reference docs existing)
     ↓
Phase 4      (delivery assessment — depends on all docs existing)
```

### Estimated Scope

| Phase | Files Changed | Complexity |
|-------|--------------|------------|
| ~~1A+1B~~ | ~~6 core modules~~ | ~~✅ DONE~~ |
| ~~1C+1D+1E~~ | ~~19 CLI/tool/config files~~ | ~~✅ DONE~~ |
| 2A | 1 large doc | High — requires reading and accurately documenting every export |
| 2B+2C | 2 docs | Medium — structured reference material, schema is already defined |
| 2D+3 | 2-3 docs | Medium — guide writing, includes example code |
| 4 | 1 recommendation doc | Low — assessment and recommendation, not implementation |
