# Writs

**Status:** Implemented, 2026-03-26. Distilled from design discussion between Sean and Coco.

This document specifies the writ system — a redesign of work decomposition and dispatch that replaces the rigid four-level hierarchy (work → piece → job → stroke) with a flexible, type-driven model. It eliminates strokes as a separate concept, introduces prompt templates, and provides uniform writ binding for all summons.

## What This Replaces

The current system has three entangled problems:

1. **The work hierarchy is rigid but the pipeline ignores it.** The schema defines four fixed levels (work, piece, job, stroke) with strict containment. But the commission pipeline skips all of it — commissions go directly to artificers with no works, pieces, or jobs created. Artificers can't record strokes because no job exists.

2. **The clockworks has hardcoded commission logic.** `executeAnimaOrder` checks for `commissionId` in event payloads and does commission-specific work. This couples the generic dispatch mechanism to one specific workflow.

3. **Animas are summoned with insufficient context.** The user prompt is either raw commission content, a `brief` string, or null. The anima doesn't know what event triggered its summoning, what it's supposed to do, or what context is relevant.

## Design Principles

**Events are transient, writs are durable.** Events signal that something happened. Writs record that something needs to happen. If an event is dropped or a session crashes, the writ persists as "not done yet" — recoverable, queryable, restartable. Events drive reactions; writs hold intent.

**Writs are the only planning/tracking primitive.** There is no separate "stroke" concept. What were previously strokes are child writs of a lightweight type (e.g., "step"). One data model, one completion mechanism, all the way down.

**Every summon gets a writ.** The clockworks creates or binds a writ for every anima session. For writ lifecycle events, the writ already exists. For any other event, the framework automatically synthesizes a generic writ. The result is uniform session resumption, progress tracking, and audit across all summons.

**The framework provides lifecycle mechanics, not work vocabulary.** The framework knows about writs, statuses, parent/child relationships, events, and sessions. It does not know what a "feature," "task," or "step" is. Those are guild-defined types that drive event naming and standing order routing.

**Summons are generic.** The clockworks summons animas based on standing orders. It does not have special logic for commissions, jobs, or any specific type of work. Context is provided through prompt templates on standing orders, hydrated from event payloads and writ fields.

## Events — "something happened"

Transient signals processed by the clockworks. An event fires, standing orders match on the event name, actions (engines or summons) execute. The event is marked processed.

Events are reactive. They tell the system "X just occurred." They do not carry forward obligations — if the reaction fails, the event does not automatically retry. But the writ created during dispatch persists as durable intent.

### Writ Lifecycle Events

When a writ transitions status, the framework emits `<type>.<status>` with a known payload shape:

```
{ writId, parentId, type }
```

The clockworks recognizes these automatically — a `writId` in the payload means the writ already exists. No synthesis needed.

### Other Events

All other events (commission system events, session lifecycle, custom guild events, operational signals) use their own payload shapes. When these trigger a summon, the clockworks synthesizes a writ to bind to the session.

## Writs — "something needs to happen"

Durable records of intent. A writ says "this thing needs to get done" and persists until it's done or explicitly cancelled. Writs are the system's memory of outstanding obligations and the unified log of everything the guild has done.

Writs have:
- A **type** — guild-defined vocabulary (e.g., "feature", "task", "step", "review"), plus framework-reserved built-in types
- An optional **parent** — another writ, forming a flexible tree
- A **status** with lifecycle events emitted on transitions
- A **title** and **description** — the specification of what needs to happen

The hierarchy is flexible. A commission might produce one writ (simple bug fix) or a deep tree (feature → tasks → steps). Operational events produce standalone writs with no parent. The framework treats both the same.

### Built-in Types

The framework reserves two types:

- **`mandate`** — the root writ created automatically when a commission arrives. The commission record points to its mandate writ; the writ does not point back. This bridges the commission system (patron-facing) and the writ system (guild-internal).
- **`summon`** — auto-synthesized writ for operational event sessions. Provides durability, resumption, and audit for non-work summons.

These do not need to be declared in `guild.json`. Guilds can wire standing orders to their lifecycle events (`mandate.ready`, `mandate.completed`, `summon.completed`) but don't have to.

### Strokes Are Writs

What were previously "strokes" are child writs of a lightweight type (e.g., "step"). The guild defines the type name.

An anima's "plan strokes" tool becomes "create child writs." Its "complete stroke" tool becomes "complete child writ." The framework needs no special stroke machinery — writs all the way down.

This means:
- **Progress visibility** is uniform. "Task is 3/5 steps done" is the same query as "feature is 2/4 tasks done" — count complete children vs. total children, at any level.
- **Completion rollup** is one mechanism. Same function at every level.
- **Session resumption** checks the writ's children. Incomplete children? Re-summon.

A "step" writ is lightweight: `{ type: "step", title: "Add retry queue data structure", parent_id: <task>, status: "ready" }`. Description optional. Not meaningfully heavier than a stroke record.

## Status Lifecycle

```
ready → active → completed
              → failed
              → pending → ready  (cycle)
       → cancelled
```

### States

| Status | Meaning | Event fired |
|--------|---------|-------------|
| **ready** | Available for dispatch. Writs are born here. | `<type>.ready` |
| **active** | A session is working on it. | — |
| **pending** | Session completed its pass, but incomplete children remain. Waiting. | — |
| **completed** | Done. All obligations fulfilled. | `<type>.completed` |
| **failed** | Explicitly failed by an anima. Terminal. | `<type>.failed` |
| **cancelled** | Abandoned. Terminal. | `<type>.cancelled` |

### Transitions

| From | To | Trigger |
|------|----|---------|
| ready | active | Session binds to writ |
| active | completed | `complete-session` called; no children or all children complete |
| active | pending | `complete-session` called; incomplete children exist |
| active | ready | Session interrupted (no `complete-session`; writ not failed) |
| active | failed | Anima calls `fail-writ` (terminal; ends session implicitly) |
| pending | ready | All children complete (rollup) |
| pending | cancelled | Explicit cancellation |
| pending | failed | Explicit (operational intervention) |
| ready | cancelled | Explicit cancellation |

`<type>.ready` fires on every transition TO `ready` — both at creation and on `pending → ready`. The same standing order handles initial dispatch and re-dispatch. The progress appendix tells the anima which case it's in.

### Completion Model

**`complete-session`** is the universal "I'm done" signal. When an anima calls it:

1. Session is marked complete.
2. Framework checks the bound writ's children:
   - No children, or all children complete → writ transitions to **completed** → fires `<type>.completed` → triggers completion rollup on parent.
   - Incomplete children exist → writ transitions to **pending**. No event fired. Writ waits for children.

**If a session ends WITHOUT `complete-session`** (context limit, crash, timeout), the framework treats it as interrupted:

1. If the writ is failed → do nothing (failure already handled).
2. Otherwise → writ transitions back to **ready** → fires `<type>.ready` → re-dispatch via standing orders.

The re-summoned anima receives the progress appendix showing current child state, so it can pick up where the previous session left off.

**`fail-writ`** is the explicit failure signal. It is terminal for both the writ and the session:

1. Writ transitions to **failed** → fires `<type>.failed`.
2. Session ends implicitly.
3. Incomplete children are **cancelled** (cascading to their children).
4. Completed children remain completed (historical record).
5. Active children (sessions in progress) are allowed to finish; their writs are cancelled when the session reports back.

### Completion Rollup

When a writ transitions to **completed**, the framework checks its parent:

1. **Parent is `pending` and all siblings are complete** → parent transitions to **ready** → fires `<type>.ready` → standing order re-dispatches for final integration pass.
2. **Parent is `pending` and siblings remain incomplete** → no action. Wait for more siblings.
3. **Parent is `ready` with no standing order for `<type>.ready`** (container writ) → parent auto-completes → rollup continues up the tree.

The container auto-complete rule: a writ auto-completes on rollup **only if no standing order matches `<type>.ready` for its type**. This is a static check — standing orders don't change at runtime. If a standing order exists, the writ must go through the session path (`ready → active → completed`). This prevents race conditions at scale where children complete before the parent's standing order fires.

When a `mandate` writ completes (whether via session or auto-complete), the framework marks the corresponding commission record as complete.

### The Pending → Ready Cycle

A writ can cycle through `pending → ready → active → pending` multiple times. Each cycle represents one "pass" by an anima:

1. **First pass:** Anima is summoned, creates child writs, calls `complete-session` → **pending**.
2. **Children complete:** Rollup transitions writ to **ready** → re-dispatch.
3. **Second pass:** Anima sees all children complete in progress appendix. Does final integration. Calls `complete-session` → **completed**. Or creates more children → **pending** again.

The re-summon limit (configurable per writ or standing order) guards against infinite cycles.

## How Summons Work

When the clockworks matches a summon standing order, the dispatch process is:

### 1. Bind or synthesize a writ

**If the event payload contains `writId`:** Bind the session to the existing writ. Mark it `active`.

The `writId` field is a conventional name. Guild-created events can include it intentionally to bind sessions to existing writs — this is a feature, not a collision risk.

**If the event payload does NOT contain `writId`:** Synthesize a writ automatically:
- **type:** `"summon"`
- **title:** `"Summon <role>: <event-name>"` (e.g., "Summon foreman: token.budget.low")
- **description:** serialized event payload
- **parent_id:** null

This is invisible to the guild. The standing order is just:

```json
{ "on": "token.budget.low", "summon": "foreman", "prompt": "..." }
```

The synthesized writ provides durability, resumption, and audit for free.

### 2. Hydrate the prompt template

Resolve the prompt template from the standing order, substituting from two scopes:

- `{{field}}` — direct substitution from the event payload
- `{{writ.field}}` — from the bound writ (title, description, type, status, parentId)
- `{{writ.parent.field}}` — from the parent writ (one level up; title, description, type, status, parentId)

No deeper traversal. If a standing order needs ancestor context beyond the parent, the engine or anima that created the writ should bake it into the writ's description at creation time.

### 3. Manifest and launch

Resolve the role to an anima. Manifest it. Launch the session through the session funnel with the hydrated prompt. The session record includes the writ reference.

### 4. On session end

- `complete-session` called → complete or pend the writ (based on children) → rollup if completed
- `fail-writ` called → fail the writ → cancel children → end session
- Neither called → session interrupted → writ back to `ready` → re-dispatch

## Prompt Templates

Standing orders gain a `prompt` field — a template string hydrated at dispatch time.

```json
{
  "on": "task.ready",
  "summon": "artificer",
  "prompt": "You have been assigned a task.\n\n## Task\n**{{writ.title}}**\n\n{{writ.description}}\n\n## Context\nPart of: {{writ.parent.title}}"
}
```

### Template Scopes

| Syntax | Source | Example |
|--------|--------|---------|
| `{{field}}` | Event payload | `{{budgetRemaining}}` |
| `{{writ.field}}` | Bound writ | `{{writ.title}}`, `{{writ.description}}` |
| `{{writ.parent.field}}` | Parent writ (one level) | `{{writ.parent.title}}`, `{{writ.parent.parentId}}` |

Missing values resolve to empty string. No deeper traversal — use tools or bake context into writ descriptions at creation time.

### Resumed Session Prompts

When re-summoning (writ returns to `ready` from `pending` or interruption), the framework appends a progress appendix to the original prompt:

```
[Original prompt from standing order]

---
## Prior Progress
This is a continuation of prior work. Current state of sub-items:

- ✓ Add retry queue data structure (completed)
- ✓ Implement exponential backoff (completed)
- → Write retry loop (active)
- ○ Add max-retries-exceeded test (ready)
- ○ Wire up to webhook dispatcher (ready)
```

The appendix lists **direct children only**. If children have their own children, those are summarized (e.g., "3 tasks (2 completed, 1 active)") rather than expanded.

## Writ Types in guild.json

Types are declared so the framework can validate event names and guilds can self-document their taxonomy.

```json
{
  "writTypes": {
    "feature": {
      "description": "A significant deliverable requiring decomposition into tasks"
    },
    "task": {
      "description": "A single assignable unit of work"
    },
    "step": {
      "description": "An atomic unit of progress within a task"
    },
    "triage": {
      "description": "Scope assessment and decomposition planning for a commission"
    },
    "review": {
      "description": "Operational review of a failure, decision point, or quality check"
    }
  }
}
```

### Validation

- **At writ creation:** `createWrit()` checks the type against `guild.json`. Unknown type → error.
- **At guild init / upgrade:** `nsg init` and `nsg upgrade` validate that standing order event patterns (e.g., `task.ready`, `feature.completed`) reference declared types. Warns about standing orders that can never fire.

## Commission → Mandate Bridge

When a commission is posted, the framework automatically:

1. Fires `commission.posted` (commission system event — no writ exists yet).
2. Creates a root writ of type `"mandate"` with the commission content as description.
3. Links the commission record to the mandate writ (commission has a `writId`).
4. The mandate writ is created in `ready` status → fires `mandate.ready`.

This bridges the two systems cleanly:
- `commission.posted` — commission system event. Use for pre-writ setup (workshop-prepare, git operations).
- `mandate.ready` — writ lifecycle event. Use for dispatching work.
- `mandate.completed` — writ lifecycle event. Framework automatically marks the commission record as complete.

## Examples

### Simple Guild (No Sage)

```json
[
  { "on": "commission.posted", "run": "workshop-prepare" },
  { "on": "mandate.ready", "summon": "artificer",
    "prompt": "You have been assigned a commission.\n\n{{writ.title}}\n\n{{writ.description}}" },
  { "on": "mandate.completed", "run": "workshop-merge" }
]
```

Flow: Commission posted → workshop prepared → mandate writ created → artificer summoned → artificer creates step children, calls `complete-session` → mandate pending → steps complete → mandate ready → artificer re-summoned for final pass → `complete-session` → mandate completed → commission marked done → workshop merged.

### Guild With Planning (Sage + Artificer)

Writ types: `feature`, `task`, `step`, `triage`

```json
[
  { "on": "commission.posted", "run": "workshop-prepare" },
  { "on": "mandate.ready", "summon": "sage",
    "prompt": "A new commission needs triage.\n\n{{writ.description}}\n\nAssess scope. Decompose into features and tasks. Mark leaf items as ready when they are specified well enough for an artificer to execute." },
  { "on": "feature.ready", "summon": "sage",
    "prompt": "This feature needs planning.\n\n## Feature\n{{writ.title}}\n{{writ.description}}\n\nBreak this into concrete tasks. Mark each task ready when specified." },
  { "on": "task.ready", "summon": "artificer",
    "prompt": "You have been assigned a task.\n\n## Task\n{{writ.title}}\n\n{{writ.description}}\n\n## Context\nPart of: {{writ.parent.title}}" },
  { "on": "task.failed", "summon": "steward",
    "prompt": "A task has failed.\n\n{{writ.title}}\n{{writ.description}}\n\nAssess the failure and recommend next steps." },
  { "on": "mandate.completed", "run": "workshop-merge" }
]
```

Completion cascade: steps → tasks → features → mandate → commission marked done.

### Operational Standing Orders

```json
[
  { "on": "commission.failed", "run": "create-failure-review" },
  { "on": "review.ready", "summon": "steward",
    "prompt": "A commission has failed and needs review.\n\n{{writ.description}}\n\nAssess the failure, determine root cause, and recommend: retry, modify, or abandon." },
  { "on": "token.budget.low", "summon": "foreman",
    "prompt": "Token budget alert: {{budgetRemaining}} of {{budgetTotal}} remaining.\n\nReview active sessions and halt non-critical work if needed." },
  { "on": "midnight.cron", "summon": "ops",
    "prompt": "Nightly maintenance window. Inspect system metrics, queue health, and worktree state. Create writs for anything that needs attention." }
]
```

Every operational summon produces a `"summon"` writ automatically. Durable record, resumption on interruption, audit trail — all for free.

## What Changes From Current System

### Removed
- Fixed four-level hierarchy (work → piece → job → stroke containment)
- Separate tables for works, pieces, jobs, strokes
- The strokes table entirely (strokes become child writs)
- Hardcoded commission logic in `executeAnimaOrder`
- Commission-specific prompt construction in the clockworks
- Reserved event namespaces for `work.`, `piece.`, `job.`, `stroke.`
- Distinction between "writ sessions" and "operational sessions"
- `brief` as a separate standing order type

### Added
- Single `writs` table with `type`, optional `parent_id`, and `status`
- Writ types declared in `guild.json`
- Built-in types: `"mandate"` (root writs for commissions) and `"summon"` (operational)
- `pending` status for writs waiting on children
- `<type>.<status>` event naming convention
- Automatic writ synthesis for non-writ event summons
- `complete-session` tool as the universal "I'm done" signal
- `fail-writ` tool as the terminal failure signal
- Prompt templates on standing orders with template hydration
- Automatic progress appendix for resumed sessions
- Container auto-complete for types with no standing order

### Preserved
- Commissions as the patron-facing input boundary
- The clockworks event/standing-order dispatch model
- The session funnel (manifest → launch → record)
- Completion rollup (generalized to one recursive function)
- Atomic progress tracking (as child writs instead of strokes)

## Open Questions

1. **Re-summon limits.** Need a max-retries or circuit-breaker mechanism for writs that keep cycling without converging. Configurable per writ or standing order.

2. **Other relationship types.** Backlog: blocks/blocked-by, related-to. Not for v1.

3. **Migration path.** One migration: drop works, pieces, jobs, strokes tables; create writs table. No data migration (old tables were never populated).

4. **Documentation.** Three docs needed: (a) writ system overview (this document, finalized), (b) prompt template reference (syntax, scopes, examples), (c) steward curriculum update. The prompt template reference is highest priority — it's the primary configuration surface for guilds.

5. **Work-decomposition.md.** Needs full rewrite to reflect the writs model. Concepts of scope vocabulary and operational boundaries remain valid but are now guild policy expressed through types, not framework-enforced structure.

6. **Commission → mandate creation timing.** The framework creates the mandate writ after `commission.posted` handlers run but before the next tick. This ensures `workshop-prepare` can do its git setup before any writ events fire. Exact sequencing TBD during implementation.
