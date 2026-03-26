# Writs Implementation Spec

**Status:** Implemented, 2026-03-26. Derived from the [writs redesign](writs.md).

This spec tells an implementing agent exactly what to build, in what order, touching which files. It assumes familiarity with the writs redesign document but is self-contained enough to implement from.

## Scope

Replace the rigid four-level work hierarchy (works, pieces, jobs, strokes) with the unified writ system. This touches:

- **Database schema** — new `writs` table, migration to drop old tables
- **Core module** — new `writ.ts`, modifications to `commission.ts`, `clockworks.ts`, `session.ts`, `events.ts`, `guild-config.ts`, `index.ts`
- **Stdlib tools** — new tools (`complete-session`, `fail-writ`, `create-writ`, `list-writs`, `show-writ`), remove old tools (work-*, piece-*, job-*, stroke-*)
- **Guild starter kit** — migration file, updated standing order templates
- **Existing tests** — update clockworks tests, add writ tests

NOT in scope: CLI commands for writs, guild-monitor updates, documentation beyond code comments, re-summon limit configuration.

---

## Phase 1: Schema & Data Model

### 1.1 Migration: `002-writs.sql`

Add to `packages/guild-starter-kit/migrations/`:

```sql
-- Writs — unified work tracking
CREATE TABLE writs (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'ready'
                CHECK(status IN ('ready', 'active', 'pending', 'completed', 'failed', 'cancelled')),
    parent_id   TEXT REFERENCES writs(id),
    session_id  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_writs_parent ON writs(parent_id);
CREATE INDEX idx_writs_status ON writs(status);
CREATE INDEX idx_writs_type_status ON writs(type, status);

-- Link commissions to their mandate writ
ALTER TABLE commissions ADD COLUMN writ_id TEXT REFERENCES writs(id);

-- Link sessions to their bound writ
ALTER TABLE sessions ADD COLUMN writ_id TEXT REFERENCES writs(id);

-- Drop old hierarchy tables (never populated in production)
DROP TABLE IF EXISTS strokes;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS pieces;
DROP TABLE IF EXISTS works;
```

**Notes:**
- `session_id` on writs tracks which session currently owns the writ (set on `ready → active`, cleared on completion/failure/interruption). This is for debugging/queries, not dispatch logic.
- `writ_id` on commissions is the mandate writ. Set by the framework when the mandate is created.
- `writ_id` on sessions is the bound writ. Set by the clockworks at dispatch time.
- Old tables are safe to drop — they were never populated (the commission pipeline bypassed them entirely).

### 1.2 Core module: `packages/core/src/writ.ts`

New file. All writ CRUD, status transitions, and completion rollup.

#### Types

```typescript
export interface WritRecord {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: 'ready' | 'active' | 'pending' | 'completed' | 'failed' | 'cancelled';
  parentId: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WritStatus = WritRecord['status'];

export interface CreateWritOptions {
  type: string;
  title: string;
  description?: string;
  parentId?: string;
}

export interface WritChildSummary {
  id: string;
  type: string;
  title: string;
  status: WritStatus;
  childCount?: number;       // for nested summary
  completedCount?: number;   // for nested summary
}
```

#### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createWrit` | `(home, opts: CreateWritOptions) → WritRecord` | Validates type against guild.json `writTypes` + built-in types (`mandate`, `summon`). Generates id with `wrt` prefix. Inserts with status `ready`. Fires `<type>.ready` event. Audits. |
| `readWrit` | `(home, writId) → WritRecord \| null` | Simple read by id. |
| `listWrits` | `(home, opts: { parentId?, type?, status? }) → WritRecord[]` | Filtered list, ordered by `created_at DESC`. |
| `activateWrit` | `(home, writId, sessionId) → WritRecord` | Transition `ready → active`. Sets `session_id`. No event fired. Throws if not in `ready` status. |
| `completeWrit` | `(home, writId) → WritRecord` | Called by `complete-session` handler. Checks children. If no children or all complete → `completed`, fires `<type>.completed`, triggers `rollupParent()`. If incomplete children → `pending`. Clears `session_id`. |
| `failWrit` | `(home, writId) → WritRecord` | Transition `active → failed`. Fires `<type>.failed`. Cascades: cancels incomplete children (recursively). Clears `session_id`. |
| `cancelWrit` | `(home, writId) → WritRecord` | Transition → `cancelled`. Fires `<type>.cancelled`. Cascades: cancels incomplete children. |
| `interruptWrit` | `(home, writId) → WritRecord` | Transition `active → ready`. Fires `<type>.ready` (re-dispatch). Clears `session_id`. |
| `rollupParent` | `(home, parentId) → void` | Completion rollup. If parent is `pending` and all children complete: check if a standing order exists for `<parentType>.ready`. If yes → transition parent to `ready` (fires event). If no → auto-complete parent, recurse up. If parent is `pending` and siblings remain incomplete → no action. |
| `getWritChildren` | `(home, writId) → WritChildSummary[]` | Direct children with optional nested counts for progress appendix. |
| `buildProgressAppendix` | `(home, writId) → string` | Renders the markdown progress appendix for resumed sessions. |

#### Built-in type constants

```typescript
export const BUILTIN_WRIT_TYPES = ['mandate', 'summon'] as const;
```

#### Type validation

```typescript
export function validateWritType(home: string, type: string): void {
  if (BUILTIN_WRIT_TYPES.includes(type as any)) return;
  const config = readGuildConfig(home);
  const declared = config.writTypes ?? {};
  if (!Object.hasOwn(declared, type)) {
    throw new Error(`Writ type "${type}" is not declared in guild.json writTypes.`);
  }
}
```

---

## Phase 2: Guild Config Changes

### 2.1 `guild-config.ts` — Add `writTypes`

Add to `GuildConfig` interface:

```typescript
/** Writ types declared by this guild. */
writTypes?: Record<string, { description: string }>;
```

Add to `StandingOrder` type:

```typescript
export type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string }
  | { on: string; brief: string };  // brief is deprecated but keep for backward compat
```

The `prompt` field is added to summon orders. It's a template string hydrated at dispatch time.

### 2.2 `events.ts` — Update framework namespaces

Replace the `FRAMEWORK_NAMESPACES` array. Remove `work.`, `piece.`, `job.`, `stroke.`. The writ system uses `<type>.<status>` events which are guild-defined types — they should NOT be in the reserved namespace list. Instead, writ lifecycle events are emitted by the framework but use guild-defined type names.

New reserved namespaces:

```typescript
const FRAMEWORK_NAMESPACES = [
  'anima.',
  'commission.',
  'mandate.',    // built-in writ type
  'summon.',     // built-in writ type
  'tool.',
  'migration.',
  'guild.',
  'standing-order.',
  'session.',
];
```

**Important:** Guild-defined writ type events (e.g. `task.ready`, `feature.completed`) are emitted by the framework on behalf of the writ system. They are NOT custom events and should NOT require declaration in `clockworks.events`. The framework emits them directly via `signalEvent()` with emitter `'framework'`.

---

## Phase 3: Clockworks Overhaul

### 3.1 `clockworks.ts` — Rewrite `executeAnimaOrder`

The current function has ~80 lines of commission-specific logic (assignment records, status updates, commission content lookup, session linkage). All of this is replaced by the writ binding flow.

**New dispatch flow for summon orders:**

```
1. Resolve role → anima
2. Bind or synthesize writ
3. Hydrate prompt template
4. Manifest anima
5. Resolve workspace
6. Launch session (with writ_id)
7. On return: handle session end
```

#### Step 2: Bind or synthesize writ

```typescript
function bindOrSynthesizeWrit(
  home: string,
  event: GuildEvent,
  roleName: string,
): string {
  const payload = event.payload as Record<string, unknown> | null;
  const writId = payload?.writId as string | undefined;

  if (writId) {
    // Existing writ — activate it
    activateWrit(home, writId, /* sessionId set after launch */);
    return writId;
  }

  // Synthesize a summon writ
  const writ = createWrit(home, {
    type: 'summon',
    title: `Summon ${roleName}: ${event.name}`,
    description: JSON.stringify(event.payload),
  });
  return writ.id;
}
```

**Sequencing note:** The writ is activated (set to `active`) with a placeholder session ID, then the real session ID is written back after `launchSession()` returns the session record. Alternatively, the session row can be created first (current `insertSessionRow` pattern), then the writ activated with that session ID. The latter is cleaner — match the existing pattern.

#### Step 3: Hydrate prompt template

```typescript
function hydratePromptTemplate(
  home: string,
  template: string | undefined,
  event: GuildEvent,
  writId: string,
): string | null {
  if (!template) return null;

  const payload = event.payload as Record<string, unknown> ?? {};
  const writ = readWrit(home, writId);
  const parent = writ?.parentId ? readWrit(home, writ.parentId) : null;

  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();

    if (k.startsWith('writ.parent.')) {
      const field = k.slice('writ.parent.'.length);
      return parent ? String((parent as any)[field] ?? '') : '';
    }
    if (k.startsWith('writ.')) {
      const field = k.slice('writ.'.length);
      return writ ? String((writ as any)[field] ?? '') : '';
    }
    // Direct payload field
    return String(payload[k] ?? '');
  });
}
```

**Field name mapping:** Template fields use camelCase (`{{writ.parentId}}`), matching the TypeScript interface, not the SQL column names.

#### Step 7: Session end handling

After `launchSession()` returns, the clockworks must handle the writ lifecycle:

```typescript
// After session completes:
const writ = readWrit(home, writId);

if (writ.status === 'failed') {
  // fail-writ was called during the session — already handled
  return;
}

if (sessionEndedCleanly) {
  // complete-session was called — already handled by the tool
  return;
}

// Session interrupted (crash, timeout, context limit)
// No complete-session or fail-writ was called
interruptWrit(home, writId);
```

**How do we know if `complete-session` was called?** The `complete-session` tool writes a flag to the session record or the writ record. Simplest approach: check the writ's status after the session returns. If it's still `active`, no completion/failure tool was called — treat as interruption.

### 3.2 Remove `brief` handling

The `brief` branch in `processEvent` is deprecated. Keep it functional for backward compatibility but don't extend it. Briefs are replaced by prompt templates on summon orders.

### 3.3 Remove commission-specific logic

Delete from `executeAnimaOrder`:
- Commission assignment creation (`commission_assignments` insert)
- Commission status update (`updateCommissionStatus`)
- Commission content lookup for prompt (`readCommission`)
- `commission_sessions` join row insert
- `commission.session.ended` event signaling

All of this is now handled by:
- The commission → mandate bridge (in `commission.ts`)
- The writ binding flow (generic)
- Completion rollup (mandate completes → commission marked done)

---

## Phase 4: Commission → Mandate Bridge

### 4.1 `commission.ts` — Add mandate creation

Modify the `commission()` function. After creating the commission record and signaling `commission.posted`:

```typescript
// After commission.posted handlers run, create the mandate writ.
// The mandate is created in a separate step so workshop-prepare can
// run before any writ events fire.
```

**Implementation choice:** Two approaches for timing:

**A. Inline in `commission()` after event signal:** Simple, but `commission.posted` standing orders (like `workshop-prepare`) haven't run yet when the mandate is created. The mandate's `ready` event would be queued after `commission.posted`, so standing orders process in the right order (events are FIFO).

**B. Engine that creates the mandate:** A `create-mandate` engine runs on `commission.posted` after `workshop-prepare`. More explicit ordering but adds a framework engine.

**Recommendation: Option A.** Events are FIFO. `commission.posted` fires first, its standing orders process first (including `workshop-prepare`). Then `mandate.ready` fires, its standing orders process second. The clockworks processes one event at a time. This is the right ordering without any engine.

```typescript
// In commission():
// ... existing commission creation and event signal ...

// Create mandate writ
const writ = createWrit(home, {
  type: 'mandate',
  title: spec.substring(0, 200),  // First 200 chars as title
  description: spec,
});

// Link commission to mandate
db.prepare(`UPDATE commissions SET writ_id = ? WHERE id = ?`).run(writ.id, commissionId);
```

**Title derivation:** The mandate title is derived from the commission spec. Options:
- First line of the spec (if multi-line)
- First 200 characters (truncated)
- The commission ID itself

Recommend: first line, truncated to 200 chars. If single line, use the whole thing.

### 4.2 Mandate completion → commission completion

In `writ.ts`, when a `mandate` writ completes (via `completeWrit` or auto-complete rollup), mark the corresponding commission as completed:

```typescript
// In completeWrit(), after setting status to 'completed':
if (writ.type === 'mandate') {
  // Find the commission that points to this mandate
  const row = db.prepare(
    `SELECT id FROM commissions WHERE writ_id = ?`
  ).get(writId);
  if (row) {
    updateCommissionStatus(home, row.id, 'completed', 'mandate completed');
    signalEvent(home, 'commission.completed', { commissionId: row.id }, 'framework');
  }
}
```

---

## Phase 5: Session Integration

### 5.1 `session.ts` — Add writ reference

Add `writId` to `SessionLaunchOptions`:

```typescript
export interface SessionLaunchOptions {
  // ... existing fields ...
  /** Bound writ ID, if any. */
  writId?: string;
}
```

Add to `insertSessionRow` — write `writ_id` to the sessions table.

Add to `SessionResult`:

```typescript
export interface SessionResult {
  // ... existing fields ...
  writId?: string;
}
```

### 5.2 Session trigger type

Update the `trigger` type to replace `'brief'` usage:

```typescript
trigger: 'consult' | 'summon' | 'brief';  // keep brief for backward compat
```

No change needed — `summon` already exists.

---

## Phase 6: MCP Tools

### 6.1 New tools (in `packages/stdlib/src/tools/`)

#### `complete-session.ts`

The universal "I'm done" signal. When called by an anima:

1. Find the session's bound writ (from context — the tool needs the guild home and session ID, or the writ ID directly).
2. Call `completeWrit(home, writId)` which handles:
   - No children or all complete → `completed` → rollup
   - Incomplete children → `pending`
3. Return the writ's new status to the anima.

**Context problem:** The anima doesn't know its own session ID or writ ID. Solutions:
- **Option A:** Pass `writId` as an environment variable or in the system prompt at session launch.
- **Option B:** The tool looks up the active writ by session. Requires the session ID to be available.
- **Option C:** The tool accepts no arguments — it finds the writ bound to the current session automatically. This requires a session context mechanism.

**Recommendation:** The simplest viable approach is to inject the `writId` into the tool's context. The clockworks already knows the writ when launching the session. It can pass the writ ID through the manifest/system-prompt, or through an environment variable that the tool reads. The tool then calls `completeWrit(home, writId)` with no arguments from the anima.

**Implementation:** Add a `NEXUS_WRIT_ID` environment variable set by the clockworks before launching the session. The `complete-session` tool reads it. If not set (e.g., interactive/consult sessions), the tool is a no-op or returns a "no bound writ" message.

```typescript
// Tool definition
export default tool({
  name: 'complete-session',
  description: 'Signal that you have completed your work on the current writ. Call this when you are done.',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Brief summary of what was accomplished.',
      },
    },
  },
  handler: async ({ summary }, { home }) => {
    const writId = process.env.NEXUS_WRIT_ID;
    if (!writId) {
      return { status: 'no-writ', message: 'No writ bound to this session.' };
    }
    const writ = completeWrit(home, writId);
    return {
      status: writ.status,
      message: writ.status === 'completed'
        ? 'Writ completed. Good work.'
        : `Writ pending — ${countIncompleteChildren(home, writId)} child items still in progress.`,
    };
  },
});
```

#### `fail-writ.ts`

Terminal failure signal.

```typescript
export default tool({
  name: 'fail-writ',
  description: 'Signal that the current writ cannot be completed. This is terminal — the writ and all incomplete children will be marked failed/cancelled.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Why this writ failed.',
      },
    },
    required: ['reason'],
  },
  handler: async ({ reason }, { home }) => {
    const writId = process.env.NEXUS_WRIT_ID;
    if (!writId) {
      return { status: 'error', message: 'No writ bound to this session.' };
    }
    const writ = failWrit(home, writId);
    return { status: 'failed', writId: writ.id, reason };
  },
});
```

#### `create-writ.ts`

Create a child writ. This replaces `work-create`, `piece-create`, `job-create`, `stroke-create`.

```typescript
export default tool({
  name: 'create-writ',
  description: 'Create a child writ under the current writ. Use this to decompose work into sub-items.',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'Writ type (e.g. "task", "step", "feature").' },
      title: { type: 'string', description: 'Short title describing what needs to be done.' },
      description: { type: 'string', description: 'Detailed description (optional).' },
      parentId: { type: 'string', description: 'Parent writ ID. Defaults to the current session writ.' },
    },
    required: ['type', 'title'],
  },
  handler: async ({ type, title, description, parentId }, { home }) => {
    const resolvedParent = parentId ?? process.env.NEXUS_WRIT_ID;
    const writ = createWrit(home, {
      type,
      title,
      description,
      parentId: resolvedParent,
    });
    return writ;
  },
});
```

#### `list-writs.ts`

```typescript
// Replaces work-list, piece-list, job-list, stroke-list
// Parameters: parentId?, type?, status?
// Returns: WritRecord[]
```

#### `show-writ.ts`

```typescript
// Replaces work-show, piece-show, job-show, stroke-show
// Parameters: writId (required)
// Returns: WritRecord + children summary
```

### 6.2 Tools to remove

Delete these files from `packages/stdlib/src/tools/`:

```
work-create.ts, work-list.ts, work-show.ts, work-update.ts, work-check.ts
piece-create.ts, piece-list.ts, piece-show.ts, piece-update.ts, piece-check.ts
job-create.ts, job-list.ts, job-show.ts, job-update.ts, job-check.ts
stroke-create.ts, stroke-list.ts, stroke-show.ts, stroke-update.ts
```

Update `packages/stdlib/src/tools.ts` and `packages/stdlib/src/index.ts` to remove old tool registrations and add new ones.

### 6.3 Tools to keep (unchanged)

- `commission.ts`, `commission-list.ts`, `commission-show.ts`, `commission-update.ts`, `commission-check.ts` — commissions still exist as the patron-facing input boundary
- All clock-*, event-*, session-*, anima-*, workshop-*, tool-* tools

---

## Phase 7: Prompt Template Hydration

### 7.1 Progress appendix

When a writ transitions to `ready` from `pending` or from `active` (interruption), and a standing order re-dispatches, the prompt should include a progress appendix.

**Detection:** The clockworks can detect re-dispatch by checking whether the writ has children. If the writ has children (even if all are complete), it's a re-dispatch. Alternatively, track the dispatch count on the writ (add a `dispatch_count` column).

**Simpler approach:** Always append the progress section if the writ has children. First dispatch = no children = no appendix. Re-dispatch = has children = appendix appears. This is correct by construction.

The appendix is appended to the hydrated prompt:

```typescript
const prompt = hydratePromptTemplate(home, order.prompt, event, writId);
const appendix = buildProgressAppendix(home, writId);
const fullPrompt = appendix ? `${prompt}\n\n---\n${appendix}` : prompt;
```

### 7.2 `buildProgressAppendix` format

```markdown
## Prior Progress
This is a continuation of prior work. Current state of sub-items:

- ✓ Add retry queue data structure (completed)
- ✓ Implement exponential backoff (completed)
- ✗ Write retry loop (failed)
- ○ Add max-retries-exceeded test (ready)
```

Children with their own children get a summary: `"3 tasks (2 completed, 1 active)"` appended in parentheses.

---

## Phase 8: Cleanup

### 8.1 Remove old core modules

Delete from `packages/core/src/`:
- `work.ts`
- `piece.ts`
- `job.ts`
- `stroke.ts`

### 8.2 Update `packages/core/src/index.ts`

Remove all exports from `work.ts`, `piece.ts`, `job.ts`, `stroke.ts`. Add exports from `writ.ts`.

### 8.3 Update clockworks tests

`packages/core/src/clockworks.test.ts` — update to test new dispatch flow (writ binding, prompt hydration, session end handling).

### 8.4 New test file

`packages/core/src/writ.test.ts` — test all writ functions:
- Create, read, list
- Status transitions (activate, complete, fail, cancel, interrupt)
- Completion rollup (single level, multi-level, container auto-complete)
- Progress appendix rendering
- Type validation

---

## Implementation Order

This ordering minimizes broken intermediate states:

1. **Schema + data model** (Phase 1) — migration file, `writ.ts` with types and CRUD. Tests for writ.ts.
2. **Guild config** (Phase 2) — `writTypes` on GuildConfig, `prompt` on StandingOrder.
3. **Commission bridge** (Phase 4) — mandate creation in `commission()`. Test that commissions create mandates.
4. **Clockworks overhaul** (Phase 3) — new dispatch flow. This is the biggest change. Test with standing orders that have prompt templates.
5. **Session integration** (Phase 5) — `writId` on session records.
6. **Tools** (Phase 6) — new MCP tools, remove old ones.
7. **Prompt templates** (Phase 7) — hydration + progress appendix.
8. **Cleanup** (Phase 8) — remove old modules, update exports, update tests.

**Phasing for commissions:** Phases 1–3 can be done as one commit — schema, writ module, and commission bridge. The system is non-functional between the migration dropping old tables and the new code being in place, so these must ship together as an atomic migration.

---

## Files Changed (Summary)

### New files
| File | Description |
|------|-------------|
| `packages/core/src/writ.ts` | Writ CRUD, status transitions, completion rollup, progress appendix |
| `packages/core/src/writ.test.ts` | Tests for writ module |
| `packages/guild-starter-kit/migrations/002-writs.sql` | Schema migration |
| `packages/stdlib/src/tools/complete-session.ts` | Universal session completion tool |
| `packages/stdlib/src/tools/fail-writ.ts` | Terminal failure tool |
| `packages/stdlib/src/tools/create-writ.ts` | Create child writs |
| `packages/stdlib/src/tools/list-writs.ts` | List writs with filters |
| `packages/stdlib/src/tools/show-writ.ts` | Show writ detail + children |

### Modified files
| File | Changes |
|------|---------|
| `packages/core/src/guild-config.ts` | Add `writTypes` to GuildConfig, `prompt` to StandingOrder |
| `packages/core/src/commission.ts` | Add mandate creation, remove old completion check logic |
| `packages/core/src/clockworks.ts` | Rewrite `executeAnimaOrder` — writ binding, prompt hydration, session end handling. Remove commission-specific logic. |
| `packages/core/src/session.ts` | Add `writId` to launch options, session record, session row |
| `packages/core/src/events.ts` | Update `FRAMEWORK_NAMESPACES` |
| `packages/core/src/index.ts` | Remove old exports, add writ exports |
| `packages/core/src/clockworks.test.ts` | Update for new dispatch flow |
| `packages/stdlib/src/tools.ts` | Remove old tool registrations, add new ones |
| `packages/stdlib/src/index.ts` | Update exports |

### Deleted files
| File | Reason |
|------|--------|
| `packages/core/src/work.ts` | Replaced by writ.ts |
| `packages/core/src/piece.ts` | Replaced by writ.ts |
| `packages/core/src/job.ts` | Replaced by writ.ts |
| `packages/core/src/stroke.ts` | Replaced by writ.ts |
| `packages/stdlib/src/tools/work-*.ts` (5 files) | Replaced by writ tools |
| `packages/stdlib/src/tools/piece-*.ts` (5 files) | Replaced by writ tools |
| `packages/stdlib/src/tools/job-*.ts` (5 files) | Replaced by writ tools |
| `packages/stdlib/src/tools/stroke-*.ts` (4 files) | Replaced by writ tools |

---

## Resolved Design Decisions

### 1. Writ ID injection — Both env var and system prompt

`NEXUS_WRIT_ID` environment variable set by clockworks before session launch. Tools read it from `process.env`. The hydrated prompt template gives the anima human-readable context about what it's working on. Env var is the programmatic channel; prompt is the awareness channel.

### 2. Session completion detection — Check writ status

After session returns, clockworks checks the writ's status. If still `active` → interrupted (no `complete-session` or `fail-writ` called). If `completed`/`pending` → `complete-session` was called. If `failed` → `fail-writ` was called. No provider changes needed.

### 3. Commission title derivation — First line of spec

First line of the commission spec, truncated to 200 chars. Commissions don't currently have a `title` field (just `content`). Patron-provided titles are a future enhancement.

### 4. Atomic migration — Single commit

Ship everything in one commit. The old tables (works, pieces, jobs, strokes) were never populated — the commission pipeline bypassed them entirely. No data to migrate, no multi-user coordination needed.
