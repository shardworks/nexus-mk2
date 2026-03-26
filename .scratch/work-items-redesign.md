# Work Items Redesign

**Status:** Draft — design discussion between Sean and Coco, 2026-03-26

This document captures a proposed redesign of the work decomposition and dispatch systems. It replaces the rigid four-level hierarchy (work → piece → job → stroke) with a flexible, type-driven work item model, eliminates strokes as a separate concept, and introduces prompt templates and uniform work item binding for all summons.

## What This Replaces

The current system has three entangled problems:

1. **The work hierarchy is rigid but the pipeline ignores it.** The schema defines four fixed levels (work, piece, job, stroke) with strict containment (strokes require a job, jobs require a piece, etc.). But the actual commission pipeline skips all of it — commissions go directly to artificers with no works, pieces, or jobs created. Artificers can't record strokes because no job exists.

2. **The clockworks has hardcoded commission logic.** The `executeAnimaOrder` function in `clockworks.ts` checks for `commissionId` in event payloads and does commission-specific work: writing assignments, updating status, reading commission content as the user prompt. This couples the generic dispatch mechanism to one specific workflow.

3. **Animas are summoned with insufficient context.** The user prompt for a summoned anima is either the raw commission content (if the payload has a commissionId), a `brief` string, or null. The anima doesn't know what event triggered its summoning, what it's supposed to do, or what context is relevant.

## Design Principles

**Events are transient, work items are durable.** Events signal that something happened. Work items record that something needs to happen. If an event is dropped or a session crashes, the work item persists as "not done yet" — recoverable, queryable, restartable. Events drive reactions; work items hold intent.

**Work items are the only planning/tracking primitive.** There is no separate "stroke" concept. What were previously strokes — atomic progress records planned by an anima and checked off as work proceeds — are child work items of a lightweight type (e.g., "step"). One data model, one completion mechanism, all the way down.

**Every summon gets a work item.** The clockworks creates or binds a work item for every anima session. For work item lifecycle events (`task.ready`, `review.ready`), the work item already exists. For any other event, the framework automatically synthesizes a generic work item (type `"summon"` or `"brief"`, title from the event name, description from the payload). Guilds don't need to think about this — it's framework plumbing. The result is uniform session resumption, progress tracking, and audit across all summons.

**The framework provides lifecycle mechanics, not work vocabulary.** The framework knows about work items, statuses, parent/child relationships, events, and sessions. It does not know what a "feature," "task," or "budget-alert" is. Those are guild-defined types that drive event naming and standing order routing.

**Summons are generic.** The clockworks summons animas based on standing orders. It does not have special logic for commissions, jobs, or any specific type of work. Context is provided through prompt templates on standing orders, hydrated from event payloads and work item lookups.

## The Two Systems

### Events — "something happened"

Transient signals processed by the clockworks. An event fires, standing orders match on the event name, actions (engines or summons) execute. The event is marked processed.

Events are reactive. They tell the system "X just occurred." They do not carry forward obligations — if the reaction fails, the event does not automatically retry. (But the work item created during dispatch persists as durable intent.)

#### Work Item Lifecycle Events

When a work item transitions status, the framework emits `<type>.<status>` with a known payload shape:

```
{ workItemId, parentId, commissionId, type }
```

> I don't think work items should have a 'commissionId', should they? It seems more like, when commissions come in, a "root work item" is created to "do the commission". Then the commission can have a pointer to its work item, but we don't carry a commission through every single item of work. Or does that field do something we really want/need?

The clockworks recognizes these automatically — a `workItemId` in the payload means the work item already exists. No synthesis needed.

#### Other Events

All other events (session lifecycle, custom guild events, operational signals) use their own payload shapes. When these trigger a summon, the clockworks synthesizes a work item to bind to the session.

### Work Items — "something needs to happen"

Durable records of intent. A work item says "this thing needs to get done" and persists until it's done (or explicitly cancelled). Work items are the system's memory of outstanding obligations — and the unified log of everything the guild has done.

Work items have:
- A **type** — guild-defined vocabulary (e.g., "feature", "task", "step", "review", "budget-alert")

> the vocabulary may have a _couple_ builtin types... for the synthesized work items. and the 'commission root work item'

- An optional **parent** — another work item, forming a flexible tree

> do we want other types of relationships? even if not right now, let's add it to our backlog

- An optional **commission** reference — tracing back to the patron's original request
- A **status** with lifecycle events emitted on transitions
- A **title** and **description** — the specification of what needs to happen

The hierarchy is flexible. A commission might produce one work item (simple bug fix) or a deep tree (feature → tasks → steps). Operational events produce standalone work items with no parent or commission. The framework treats both the same.

#### Strokes Are Work Items

What were previously "strokes" — atomic progress records planned by an anima and checked off as work proceeds — are child work items of a lightweight type. The guild defines the type name (e.g., "step").

An anima's "plan strokes" tool becomes "create child work items." Its "complete stroke" tool becomes "complete child work item." The framework needs no special stroke machinery — work items all the way down.

This means:
- **Progress visibility** is uniform. "Task is 3/5 steps done" is the same query as "feature is 2/4 tasks done" — count complete children vs. total children, at any level.
- **Completion rollup** is one mechanism. All steps complete → complete the parent task → cascade up. Same function at every level.
- **Session resumption** checks the work item's children. Incomplete children? Re-summon.

A "step" work item is lightweight: `{ type: "step", title: "Add retry queue data structure", parent_id: <task>, status: "open" }`. Description optional. Commission reference inherited from parent. Not meaningfully heavier than a stroke record.

#### Status Lifecycle

```
open → ready → active → completed
                     → failed
         → cancelled
```

- **open** — created but not yet ready for dispatch.
- **ready** — available for the next step. Fires `<type>.ready`.
- **active** — an anima is working on it.
- **completed** — done. Fires `<type>.completed`. Triggers completion rollup on parent.
- **failed** — could not be completed. Fires `<type>.failed`.
- **cancelled** — explicitly abandoned. Treated as "done" for completion rollup purposes.

#### Completion Model

**Animas explicitly complete work items via `complete-session`.** When an anima calls `complete-session`, the framework:

1. Marks the session as complete
2. If the session references a work item with all children complete (or no children) → marks the work item completed → fires `<type>.completed` → triggers completion rollup on parent
3. Cascade continues until reaching a root item or an incomplete sibling

**If a session ends WITHOUT `complete-session`** (context limit, crash, timeout), the framework treats it as interrupted:

1. Check the work item's children — incomplete children remain? → re-summon (staged session)
2. No children and no `complete-session`? → re-summon (the anima was interrupted before it could finish or plan)

This gives one tool, one signal: "I'm done with what I was summoned to do." Everything else is framework mechanics.

When a root work item with a commission reference completes, the commission itself is marked complete.

#### Type-Driven Events

When a work item transitions status, the framework emits `<type>.<status>`:

```
task.created      — a "task" work item was created
task.ready        — a "task" was marked ready
task.completed    — a "task" was completed
feature.ready     — a "feature" was marked ready
review.created    — a "review" work item was created
budget-alert.completed — a synthesized "budget-alert" was completed
```

Types are declared in `guild.json` so the framework can validate event names and guilds can document their taxonomy.

## How Summons Work

When the clockworks matches a summon standing order, the dispatch process is:

### 1. Bind or synthesize a work item

**If the event has a `workItemId` in its payload** (work item lifecycle event): bind the session to the existing work item. Mark it `active`.

**If the event does NOT have a `workItemId`** (any other event): the framework automatically synthesizes a work item:
- **type:** `"summon"` for summon orders, `"brief"` for brief orders
- **title:** the event name (e.g., `"token.budget.low"`)
- **description:** serialized event payload
- **parent_id:** null
- **commission_id:** null

This is invisible to the guild. The standing order is just:

```json
{ "on": "token.budget.low", "summon": "foreman", "prompt": "..." }
```

The framework handles the rest. The synthesized work item provides durability, resumption, and audit — the guild gets those for free without declaring anything.

### 2. Hydrate the prompt template

Resolve the prompt template from the standing order, substituting:
- `{{field}}` — from the event payload
- `{{workItem.*}}` — from the bound work item (whether existing or synthesized)
- `{{workItem.parent.*}}` — walk up the parent chain
- `{{workItem.commission.*}}` — follow the commission reference

### 3. Manifest and launch

Resolve the role to an anima. Manifest it. Launch the session through the session funnel with the hydrated prompt. The session record includes the work item reference.

### 4. On session end

- `complete-session` was called → complete the work item (if children are all done) → rollup
- `complete-session` was NOT called → check for incomplete children → re-summon if needed

## Prompt Templates on Standing Orders

Standing orders gain a `prompt` field — a template string hydrated from the event payload and work item lookups.

```json
{
  "on": "task.ready",
  "summon": "artificer",
  "prompt": "You have been assigned a task.\n\n## Task\n**{{workItem.title}}**\n\n{{workItem.description}}\n\n## Context\nThis is part of: {{workItem.parent.title}}\nOriginal commission: {{workItem.commission.content}}"
}
```

Template resolution:
- `{{field}}` — direct substitution from the event payload
- `{{workItem.*}}` — the bound work item's fields (title, description, type, status)
- `{{workItem.parent.*}}` — the parent work item's fields (one level up)
- `{{workItem.commission.*}}` — the commission linked to this work item (walks up to root if needed)

For operational summons:

```json
{
  "on": "token.budget.low",
  "summon": "foreman",
  "type": "budget-alert",
  "prompt": "Token budget alert: {{budgetRemaining}} of {{budgetTotal}} remaining.\n\nReview active sessions and halt non-critical work if needed."
}
```

The prompt uses event payload fields directly. The synthesized work item provides durability and resumption, but the prompt context comes from the event.

### Resumed Session Prompts

When re-summoning for a staged session, the framework appends the work item's child state to the prompt:

```
[Original prompt from standing order]

---
## Prior Progress
This is a continuation of prior work. Current state of sub-items:

- ✓ Add retry queue data structure (completed)
- ✓ Implement exponential backoff (completed)
- → Write retry loop (active)
- ○ Add max-retries-exceeded test (open)
- ○ Wire up to webhook dispatcher (open)
```

The framework generates this appendix from the work item's children. The anima sees exactly where things stand without needing to query.

## Work Item Types in guild.json

Types are declared so the framework can validate event names and guilds can self-document their taxonomy.

```json
{
  "workItemTypes": {
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

Guilds define types for work they intentionally create and route — production work, planning, reviews. A simple guild might have just `"task"` and `"step"`.

The framework reserves two built-in types for auto-synthesized work items: `"summon"` and `"brief"`. These don't need to be declared in `guild.json` — the framework creates them automatically when operational events trigger anima sessions. Guilds can wire standing orders to `summon.completed` or `brief.completed` if they want to react to operational sessions finishing, but most won't need to.

## Example: Simple Guild (No Sage)

Standing orders:
```json
[
  { "on": "commission.posted", "run": "workshop-prepare" },
  { "on": "commission.ready", "run": "auto-scaffold" },
  { "on": "task.ready", "summon": "artificer",
    "prompt": "You have been assigned a task.\n\n{{workItem.title}}\n\n{{workItem.description}}\n\nOriginal request:\n{{workItem.commission.content}}" },
  { "on": "task.completed", "run": "completion-rollup" },
  { "on": "commission.session.ended", "run": "workshop-merge" }
]
```

The `auto-scaffold` engine reads the commission, creates a single work item of type "task" with the commission content as description, marks it ready. The artificer gets summoned with full context via the prompt template.

The artificer creates child "step" items as it plans its work. Completes each step as it goes. When done, calls `complete-session`. Framework completes the task, rolls up to the commission.

If the artificer's context runs out, the session ends without `complete-session`. Framework checks the task's children — incomplete steps remain. Re-summons with the original prompt plus the progress appendix.

## Example: Guild With Planning (Sage + Artificer)

Work item types: `feature`, `task`, `step`, `triage`

Standing orders:
```json
[
  { "on": "commission.posted", "run": "workshop-prepare" },
  { "on": "commission.ready", "run": "create-triage" },
  { "on": "triage.ready", "summon": "sage",
    "prompt": "A new commission needs triage.\n\nCommission: {{workItem.commission.content}}\n\nAssess scope. Decompose into features and tasks. Mark leaf items as ready when they are specified well enough for an artificer to execute." },
  { "on": "feature.ready", "summon": "sage",
    "prompt": "This feature needs planning.\n\n## Feature\n{{workItem.title}}\n{{workItem.description}}\n\n## Commission Context\n{{workItem.commission.content}}\n\nBreak this into concrete tasks. Mark each task ready when specified." },
  { "on": "task.ready", "summon": "artificer",
    "prompt": "You have been assigned a task.\n\n## Task\n{{workItem.title}}\n\n{{workItem.description}}\n\n## Context\nPart of: {{workItem.parent.title}}\nCommission: {{workItem.commission.content}}" },
  { "on": "task.completed", "run": "completion-rollup" },
  { "on": "task.failed", "brief": "steward",
    "prompt": "A task has failed.\n\n{{workItem.title}}\n{{workItem.description}}\n\nAssess the failure and recommend next steps." }
]
```

Completion cascades: steps → tasks → features → triage → commission.

## Example: Operational Standing Orders

```json
[
  { "on": "commission.failed", "run": "create-failure-review" },
  { "on": "review.ready", "summon": "steward",
    "prompt": "A commission has failed and needs review.\n\n{{workItem.description}}\n\nAssess the failure, determine root cause, and recommend: retry, modify, or abandon." },
  { "on": "token.budget.low", "summon": "foreman",
    "prompt": "Token budget alert: {{budgetRemaining}} of {{budgetTotal}} remaining.\n\nReview active sessions and halt non-critical work if needed." },
  { "on": "midnight.cron", "summon": "ops",
    "prompt": "Nightly maintenance window. Inspect system metrics, queue health, and worktree state. Create work items for anything that needs attention." }
]
```

Every summon produces a work item — the framework synthesizes them automatically for operational events. The midnight inspector gets a `"summon"` work item titled `"midnight.cron"`. If it finds problems, it can create child work items. If it gets interrupted, it gets re-summoned. When it's done, it calls `complete-session`, the item completes, and there's a durable record that the inspection happened.

## What Changes From Current System

### Removed
- Fixed four-level hierarchy (work → piece → job → stroke containment)
- Separate tables for works, pieces, jobs, strokes
- The strokes table entirely (strokes become child work items)
- Hardcoded commission logic in `executeAnimaOrder`
- Commission-specific prompt construction in the clockworks
- Reserved event namespaces for `work.`, `piece.`, `job.`, `stroke.`
- Distinction between "work item sessions" and "operational sessions"

### Added
- Single `work_items` table with `type` and optional `parent_id`
- Work item types declared in `guild.json`
- `<type>.<status>` event naming convention
- Automatic work item synthesis for all non-work-item event summons (generic types, invisible to guild)
- `complete-session` tool as the universal "I'm done" signal
- Prompt templates on standing orders with template hydration
- Automatic progress appendix for resumed sessions

### Preserved
- Commissions as the patron-facing input boundary
- The clockworks event/standing-order dispatch model
- The session funnel (manifest → launch → record)
- Completion rollup (generalized to one recursive function)
- Atomic progress tracking (as child work items instead of strokes)

## Open Questions

1. **Re-summon limits.** If `complete-session` is never called (anima keeps crashing, or keeps running out of context without making progress), the framework keeps re-summoning. Need a max-retries or circuit-breaker mechanism. Probably a configurable limit on the work item or standing order.

2. **Prompt template traversal depth.** `{{workItem.parent.title}}` is one level. Do we need `{{workItem.parent.parent.title}}`? Probably: support one level of parent explicitly, plus `{{workItem.commission.*}}` that walks all the way up regardless of depth.

3. **Step event noise.** If steps fire `step.created`, `step.completed` etc., a task with 10 steps generates 20+ events. Should certain types be flagged as "quiet" (suppress lifecycle events)? Or is the event volume fine since they're processed serially and most won't match any standing orders?

4. **Migration path.** Current schema has separate works, pieces, jobs, strokes tables. Migrating to unified work_items requires schema migration and updating CRUD functions. What's the sequencing?

5. **`complete-session` vs. `fail-session`.** Should there be an explicit failure signal, or does the anima call `fail-work-item` on its work item and then `complete-session`? Leaning toward: `complete-session` means "I'm done" (success). If the anima wants to signal failure, it explicitly fails its work item first, then completes the session. The framework sees: session complete, work item failed → fire `<type>.failed`, no re-summon.

6. **Brief standing orders.** `brief` orders are semantically lighter than `summon`. Do they also get synthesized work items? Probably yes for consistency — synthesized as type `"brief"`. The overhead is one row in a table. The benefit is uniform audit and resumption.

8. **Work-decomposition.md.** The existing work decomposition doc describes the four-level hierarchy, the opus concept, capability tiering, and the four boundaries (decomposition, planning, dispatch, progress). Much of this needs rewriting. The concepts of scope vocabulary and operational boundaries are still valid but are now guild policy expressed through types, not framework-enforced structure. The capability tiering discussion is still relevant but aspirational.
