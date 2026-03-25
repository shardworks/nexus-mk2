# Implementation Plan: Core API Documentation & Dashboard Gaps

## Goal

Document the Nexus framework's core API to a sufficient level that animas can build new tools, engines, dashboards, and other software that leverages it. Fill functional gaps discovered during the inventory.

## Phase 1: Fill API Gaps

### 1a. Dashboard Read Functions

Add read-only query functions to `@shardworks/nexus-core` for data currently only accessible via raw SQL:

| Function | Module | Returns | Notes |
|----------|--------|---------|-------|
| `listSessions(home, opts?)` | `session.ts` | `SessionSummary[]` | Filter by anima, workshop, trigger, date range, status (has ended_at or not) |
| `showSession(home, sessionId)` | `session.ts` | `SessionDetail \| null` | Full session row including token usage, cost, duration |
| `listEvents(home, opts?)` | `events.ts` | `GuildEvent[]` | All events (not just pending). Filter by name pattern, emitter, processed status, date range |
| `listDispatches(home, opts?)` | `events.ts` | `DispatchRecord[]` | Filter by event_id, handler_type, handler_name, status |
| `listAuditLog(home, opts?)` | `audit.ts` (new) | `AuditEntry[]` | Filter by actor, action, target_type, target_id, date range |
| `showCommission(home, id)` | `commission.ts` | `CommissionDetail \| null` | Extended version of readCommission that includes assignments and linked sessions |

New types needed: `SessionSummary`, `SessionDetail`, `DispatchRecord`, `AuditEntry`, `CommissionDetail`.

### 1b. Work Hierarchy Rollup Functions

Add functions at every level of the work decomposition hierarchy for checking child completion and rolling up status. These are what engines need to automate the "is this done?" question.

| Function | Module | What it does |
|----------|--------|-------------|
| `checkJobCompletion(home, jobId)` | `job.ts` | Returns `{ complete: boolean, total: number, done: number, pending: number, failed: number }` — counts strokes |
| `completeJobIfReady(home, jobId)` | `job.ts` | If all strokes are complete/failed and none pending, sets job status to `completed` (or `failed` if any stroke failed). Returns `{ changed: boolean, newStatus: string }`. Signals `job.completed` or `job.failed`. |
| `checkPieceCompletion(home, pieceId)` | `piece.ts` | Same shape — counts jobs |
| `completePieceIfReady(home, pieceId)` | `piece.ts` | If all jobs completed/failed/cancelled → complete the piece. Signals `piece.completed`. |
| `checkWorkCompletion(home, workId)` | `work.ts` | Same shape — counts pieces |
| `completeWorkIfReady(home, workId)` | `work.ts` | If all pieces completed/failed/cancelled → complete the work. Signals `work.completed`. |
| `checkCommissionCompletion(home, commissionId)` | `commission.ts` | Same shape — counts works |
| `completeCommissionIfReady(home, commissionId)` | `commission.ts` | If all works completed → complete the commission. Signals `commission.completed`. |

**New events needed:**
- `piece.completed` — `{ pieceId }`
- `commission.completed` — `{ commissionId }`

**Schema note:** The `pieces` table CHECK constraint currently allows `open|active|completed|cancelled`. No `failed` status on pieces or works — only jobs have `failed`. This seems intentional (pieces don't "fail" — their jobs fail, and the piece status reflects the aggregate). The rollup functions should handle this: a piece with all jobs completed/cancelled (none failed) → `completed`. A piece with any failed jobs → needs a policy decision. We decided:

* Piece stays `active` until someone manually resolves it

### 1c. CLI Commands

Add CLI commands for the new functions under existing noun groups:

```
nsg session list [--anima <name>] [--workshop <name>] [--trigger <type>] [--limit <n>]
nsg session show <id>
nsg event list [--name <pattern>] [--emitter <name>] [--pending] [--limit <n>]
nsg event show <id>                    # already works via readEvent, just needs CLI wiring
nsg dispatch list [--event <id>] [--status <status>] [--limit <n>]
nsg audit list [--actor <name>] [--action <action>] [--target <type>] [--limit <n>]
nsg commission show <id>               # enhanced to show assignments + sessions
```

Work hierarchy rollup commands:
```
nsg job check <id>                     # shows stroke completion summary
nsg piece check <id>                   # shows job completion summary
nsg work check <id>                    # shows piece completion summary
nsg commission check <id>              # shows work completion summary
```

### 1d. MCP Tools

Add tools for functions that animas would use during sessions:

| Tool | Why an anima needs it |
|------|----------------------|
| `session-list` | Anima investigating recent activity (debugging, reporting) |
| `event-list` | Anima understanding what happened (forensics, monitoring) |
| `job-check` | Anima checking if a job's strokes are all done |
| `piece-check` | Anima checking if a piece's jobs are all done |
| `work-check` | Anima checking if a work's pieces are all done |
| `commission-check` | Anima checking overall commission progress |

**Not as tools** (operator-only via CLI):
- `dispatch-list` — infrastructure forensics, not anima work
- `audit-list` — operator inspection, not anima work

### 1e. Starter Kit Role Assignments

The guild-starter-kit defines two roles (steward, artificer) with no baseTools. New tools need role assignments in `init-guild.ts` and the bundle manifest (`nexus-bundle.json`).

Current role tool assignments:
- **Steward:** commission CRUD, anima CRUD, workshop CRUD, tool management, clockworks, work hierarchy reads + updates, signal, nexus-version
- **Artificer:** commission-show, work/piece/job show, job-update, stroke CRUD, signal

New tool assignments:

| Tool | Steward | Artificer | Rationale |
|------|---------|-----------|-----------|
| `session-list` | ✓ | | Operational monitoring — steward's job |
| `session-show` | ✓ | | Operational monitoring — steward's job |
| `event-list` | ✓ | | Event forensics — steward's job |
| `event-show` | ✓ | | Event forensics — steward's job |
| `job-check` | ✓ | ✓ | Artificers need to check if their job's strokes are done |
| `piece-check` | ✓ | | Piece-level rollup is planning/oversight, not execution |
| `work-check` | ✓ | | Work-level rollup is planning/oversight |
| `commission-check` | ✓ | | Commission-level rollup is steward oversight |

Note: The `*-check` tools are read-only (they report completion status, they don't mutate). The `completeXIfReady` functions are for engines, not direct anima use — engines wire them to events via standing orders. If an anima needs to manually complete a job, they already have `job-update`.

---

## Phase 2: Reference Documentation

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
2. **Events** — signaling, reading, validation, dispatch recording
3. **Register** — anima CRUD, instantiation, manifest
4. **Ledger** — commission lifecycle, work decomposition CRUD, hierarchy rollup
5. **Daybook** — sessions, audit log
6. **Clockworks** — clock tick/run
7. **Guild Config** — reading/writing guild.json, types
8. **Infrastructure** — paths, ID generation, preconditions, workshops, worktrees, bundles, migrations

Each domain section opens with a 2-3 sentence overview of what it covers and when you'd use it.

### 2b. Event Catalog (`docs/reference/event-catalog.md`)

Three sections:
1. **Framework Events** — every event the framework signals, with payload shape, who fires it, and what standing orders typically respond to it
2. **Custom Events** — how to declare and signal custom events, namespace rules
3. **Standing Order Wiring** — the three order types (`run`, `summon`, `brief`), guild.json format, dispatch lifecycle

Include a "cookbook" subsection with common engine patterns:
- "When session ends, check job completion"
- "When job completes, roll up piece status"
- "When commission posts, auto-assign to workshop"

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

### 2d. Update `building-tools.md`

Update the existing guide's "Using @shardworks/nexus-core" section to point to the new reference docs. Add a companion section or separate guide: "Building Engines" — since that guide doesn't exist yet and engines are a primary use case.

---

## Phase 3: Building Engines Guide

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

---

## Commissioning Strategy

**Phase 1** is implementation work — core functions, CLI, tools. This is commissionable in 2-3 sub-commissions:
- **1A+1B:** Core functions (dashboard reads + rollup functions + new events). One commission, one agent, touches `packages/core/src/`.
- **1C+1D:** CLI commands + MCP tools. Depends on 1A+1B. One commission, touches `packages/cli/` and `packages/stdlib/`.

**Phase 2** is documentation — reference material. This could be one commission but it's heavy. The agent needs to read the full codebase to write accurate docs. Could split:
- **2A:** Core API reference (the big one)
- **2B+2C:** Event catalog + schema reference (smaller, more mechanical)
- **2D:** Building-tools update + building-engines guide

**Phase 3** is a standalone commission that depends on Phase 2 being done (so the guide can reference the docs).

**Phase 4** is a delivery assessment — now that the docs exist and we know their size and shape, how do we get them to animas who need them? This phase produces a recommendation, not an implementation. The implementer reviews the docs produced in Phases 2-3, measures their size, and evaluates delivery options:

- **Role instructions** — a "toolsmith" or "framework-developer" role whose instructions include (or reference) the API docs. Manifest engine reads from the guildhall and injects at session time. Works from any workspace.
- **Curriculum** — package the reference as training content. Delivered at instantiation. Current limitation: one curriculum per anima.
- **Tool instructions** — attach relevant doc sections to specific tools (e.g., hierarchy rollup docs ship with `job-check`). Scoped but fragmented.
- **Reference tool** — an MCP tool the anima queries on demand (`api-reference lookup "listSessions"`). Keeps docs out of context until needed. Requires building a tool.
- **Hybrid** — e.g., concise role instructions with a reference tool for deep dives.

The right answer depends on doc size (500 lines of tight reference is fine in a system prompt; 3000 lines is not), commission context (a dashboard builder needs the full API; an engine builder needs events + hierarchy), and whether the docs are stable enough to snapshot into curricula or should be read live from the guildhall.

The deliverable for Phase 4 is a short recommendation doc with the chosen approach, rationale, and implementation steps — which then becomes its own commission if non-trivial.

### Execution Order

```
Phase 1A+1B  (core functions)
     ↓
Phase 1C+1D  (CLI + tools)
     ↓
Phase 2A     (core API reference)
Phase 2B+2C  (event catalog + schema — can parallel with 2A)
     ↓
Phase 2D + Phase 3  (guides — depend on reference docs existing)
     ↓
Phase 4      (delivery assessment — depends on all docs existing)
```

### Estimated Scope

| Phase | Files Changed | Complexity |
|-------|--------------|------------|
| 1A+1B | ~6 core modules + tests | Medium — pattern is well-established, mostly following existing CRUD conventions |
| 1C+1D | ~8-10 CLI/tool files | Medium — mechanical, follows existing CLI noun-verb pattern |
| 2A | 1 large doc | High — requires reading and accurately documenting every export |
| 2B+2C | 2 docs | Medium — structured reference material, schema is already defined |
| 2D+3 | 2-3 docs | Medium — guide writing, includes example code |
| 4 | 1 recommendation doc | Low — assessment and recommendation, not implementation |
