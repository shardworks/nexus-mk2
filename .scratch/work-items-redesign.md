# Writs Redesign

**Status:** Draft — design discussion between Sean and Coco, 2026-03-26

This document captures a proposed redesign of the work decomposition and dispatch systems. It replaces the rigid four-level hierarchy (work → piece → job → stroke) with a flexible, type-driven writ model, eliminates strokes as a separate concept, and introduces prompt templates and uniform writ binding for all summons.

## What This Replaces

The current system has three entangled problems:

1. **The work hierarchy is rigid but the pipeline ignores it.** The schema defines four fixed levels (work, piece, job, stroke) with strict containment (strokes require a job, jobs require a piece, etc.). But the actual commission pipeline skips all of it — commissions go directly to artificers with no works, pieces, or jobs created. Artificers can't record strokes because no job exists.

2. **The clockworks has hardcoded commission logic.** The `executeAnimaOrder` function in `clockworks.ts` checks for `commissionId` in event payloads and does commission-specific work: writing assignments, updating status, reading commission content as the user prompt. This couples the generic dispatch mechanism to one specific workflow.

3. **Animas are summoned with insufficient context.** The user prompt for a summoned anima is either the raw commission content (if the payload has a commissionId), a `brief` string, or null. The anima doesn't know what event triggered its summoning, what it's supposed to do, or what context is relevant.

## Design Principles

**Events are transient, writs are durable.** Events signal that something happened. Writs record that something needs to happen. If an event is dropped or a session crashes, the writ persists as "not done yet" — recoverable, queryable, restartable. Events drive reactions; writs hold intent.

**Writs are the only planning/tracking primitive.** There is no separate "stroke" concept. What were previously strokes — atomic progress records planned by an anima and checked off as work proceeds — are child writs of a lightweight type (e.g., "step"). One data model, one completion mechanism, all the way down.

**Every summon gets a writ.** The clockworks creates or binds a writ for every anima session. For writ lifecycle events (`task.ready`, `review.ready`), the writ already exists. For any other event, the framework automatically synthesizes a generic writ (type `"summon"`, title from the event name, description from the payload). Guilds don't need to think about this — it's framework plumbing. The result is uniform session resumption, progress tracking, and audit across all summons.

**The framework provides lifecycle mechanics, not work vocabulary.** The framework knows about writs, statuses, parent/child relationships, events, and sessions. It does not know what a "feature," "task," or "budget-alert" is. Those are guild-defined types that drive event naming and standing order routing.

**Summons are generic.** The clockworks summons animas based on standing orders. It does not have special logic for commissions, jobs, or any specific type of work. Context is provided through prompt templates on standing orders, hydrated from event payloads and writ lookups.

## The Two Systems

### Events — "something happened"

Transient signals processed by the clockworks. An event fires, standing orders match on the event name, actions (engines or summons) execute. The event is marked processed.

Events are reactive. They tell the system "X just occurred." They do not carry forward obligations — if the reaction fails, the event does not automatically retry. (But the writ created during dispatch persists as durable intent.)

#### Writ Lifecycle Events

When a writ transitions status, the framework emits `<type>.<status>` with a known payload shape:

```
{ writId, parentId, type }
```

> I don't think writs should have a 'commissionId', should they? It seems more like, when commissions come in, a "root writ" is created to "do the commission". Then the commission can have a pointer to its writ, but we don't carry a commission through every single item of work. Or does that field do something we really want/need?

> **Coco:** Agreed — I've dropped `commissionId` from the payload and from writs generally. The commission points to its root writ; writs don't point back. This means `{{writ.commission.*}}` in templates needs a different resolution path — the framework would walk up the parent chain to the root writ, then look up which commission references that root. Slightly more work at hydration time, but a cleaner data model. See my note on template traversal below.

> Sounds good.

The clockworks recognizes these automatically — a `writId` in the payload means the writ already exists. No synthesis needed.

#### Other Events

All other events (session lifecycle, custom guild events, operational signals) use their own payload shapes. When these trigger a summon, the clockworks synthesizes a writ to bind to the session.

### Writs — "something needs to happen"

Durable records of intent. A writ says "this thing needs to get done" and persists until it's done (or explicitly cancelled). Writs are the system's memory of outstanding obligations — and the unified log of everything the guild has done.

Writs have:
- A **type** — guild-defined vocabulary (e.g., "feature", "task", "step", "review")

> the vocabulary may have a _couple_ builtin types... for the synthesized writs. and the 'commission root writ'

> **Coco:** Yes. I'm thinking two built-in types: `"summon"` for auto-synthesized operational writs, and `"commission"` for the root writ created when a commission arrives. These are framework-reserved — guilds don't declare them, can't redefine them, but *can* wire standing orders to their lifecycle events (e.g., `commission.completed`). Everything else is guild vocabulary.

> Sounds good.

- An optional **parent** — another writ, forming a flexible tree

> do we want other types of relationships? even if not right now, let's add it to our backlog

> **Coco:** Noted — added to open questions. The obvious candidate is "blocks/blocked-by" for dependency ordering, but that's a can of worms (cycle detection, dispatch gating). Parking it.

- A **status** with lifecycle events emitted on transitions
- A **title** and **description** — the specification of what needs to happen

The hierarchy is flexible. A commission might produce one writ (simple bug fix) or a deep tree (feature → tasks → steps). Operational events produce standalone writs with no parent or commission. The framework treats both the same.

#### Strokes Are Writs

What were previously "strokes" — atomic progress records planned by an anima and checked off as work proceeds — are child writs of a lightweight type. The guild defines the type name (e.g., "step").

An anima's "plan strokes" tool becomes "create child writs." Its "complete stroke" tool becomes "complete child writ." The framework needs no special stroke machinery — writs all the way down.

This means:
- **Progress visibility** is uniform. "Task is 3/5 steps done" is the same query as "feature is 2/4 tasks done" — count complete children vs. total children, at any level.
- **Completion rollup** is one mechanism. All steps complete → complete the parent task → cascade up. Same function at every level.

> is it true that a task with children will never have "more work to finish up" at the parent level?

> **Coco:** Good instinct — no, it's not always true. Consider: an artificer plans 5 steps, completes them all, but then needs to do a final integration pass (run tests, fix imports, etc.) that wasn't a planned step. Two options: (a) the anima creates a new child step for "final integration" before calling complete-session — the system stays consistent, (b) the anima just does the work without recording it, then calls complete-session — the writ completes, but the unrecorded work is invisible. I think (a) is the right guidance for anima instructions: "if you discover more work, add a step for it." The framework shouldn't *force* it, but the instructions should steer toward it. Auto-rollup still works — it only fires when all children are complete AND the session completes.

> Is there a new event (or redispatching of an existing one?) we can do here? I'd like to not rely on such specific behavior from the anima (the final integration). I'd also like to avoid as many special cases as possible. It seems like the right path is to basically "if a writ was worked on, and children were added, the anima that added them should be summoned again when the children roll up". But I'm not sure how to cleanly express that with our current levers.

- **Session resumption** checks the writ's children. Incomplete children? Re-summon.

A "step" writ is lightweight: `{ type: "step", title: "Add retry queue data structure", parent_id: <task>, status: "open" }`. Description optional. Not meaningfully heavier than a stroke record.

#### Status Lifecycle

```
open → ready → active → completed
                     → failed
         → cancelled
```

- **open** — created but not yet ready for dispatch.

> probably like 'new' vs open; when would it be in the this state vs. creating right as ready?

> **Coco:** The main use case is batch creation during planning. A sage triaging a commission might create 4 task writs, flesh out their descriptions one at a time, and only mark each `ready` once it's fully specified. If they created them directly as `ready`, each would immediately fire `task.ready` and potentially get dispatched to an artificer with a half-written description. `open` is the "I'm still working on this" holding state. That said — if this feels like premature complexity, we could cut it and say writs are born `ready`. The sage would just create them one at a time, fully specified. Simpler, but means the sage can't "sketch out the plan" before committing.

> let's collapse "open" and "ready", and call it "new"

- **ready** — available for the next step. Fires `<type>.ready`.
- **active** — an anima is working on it.
- **completed** — done. Fires `<type>.completed`. Triggers completion rollup on parent.
- **failed** — could not be completed. Fires `<type>.failed`.
- **cancelled** — explicitly abandoned. Treated as "done" for completion rollup purposes.

#### Completion Model

**Animas explicitly complete writs via `complete-session`.** When an anima calls `complete-session`, the framework:

1. Marks the session as complete
2. If the session references a writ with all children complete (or no children) → marks the writ completed → fires `<type>.completed` → triggers completion rollup on parent
3. Cascade continues until reaching a root item or an incomplete sibling

**If a session ends WITHOUT `complete-session`** (context limit, crash, timeout), the framework treats it as interrupted:

1. Check the writ's children — incomplete children remain? → re-summon (staged session)
2. No children and no `complete-session`? → re-summon (the anima was interrupted before it could finish or plan)

This gives one tool, one signal: "I'm done with what I was summoned to do." Everything else is framework mechanics.

> Can we do a deep-dive on "explicit complete-session" vs "complete if session ends with no child items". The tradeoffs, both for animas, anima instructions, and the framework. Consider where either case can go most badly.

> **Coco:** Great question, let me lay this out properly.
>
> **Option A: Explicit `complete-session` required.**
> - Anima must call `complete-session` to signal success. Session ending without it = interrupted = re-summon.
> - ✅ Clear intent signal — no ambiguity about whether the anima *chose* to finish or just ran out of context.
> - ✅ Framework logic is simple: session end without signal = always re-summon.
> - ❌ **Worst failure mode:** An anima finishes all its work, but the session ends RIGHT before it calls `complete-session` (context limit, timeout). Framework re-summons. New session sees all children complete, has nothing to do, calls `complete-session`. Wastes one session but self-heals.
> - ❌ Anima instructions must always include "call complete-session when done." If an anima's instructions are bad and it never calls it, infinite re-summon loop (mitigated by re-summon limits).
>
> **Option B: Auto-complete if session ends with all children complete (or no children).**
> - No explicit signal needed. Framework infers completion from child state.
> - ✅ Simpler for animas — just do the work, the framework figures it out.
> - ✅ No wasted re-summon for the "finished but didn't signal" edge case.
> - ❌ **Worst failure mode:** An anima creates NO children (planning failure, confused, wrong approach), session ends. Framework sees "no children, session ended" → auto-completes the writ. The writ is now "completed" but NO ACTUAL WORK WAS DONE. This is *silent data corruption* — the system thinks work is done that isn't. This can cascade up through rollup, potentially marking a whole feature or commission as complete when nothing happened.
> - ❌ Can't distinguish "I'm done" from "I crashed before I could start" when there are no children.
>
> **My take:** Option A is safer. The worst case (wasted re-summon) is self-healing and costs one session. Option B's worst case (silent false completion) is *catastrophic* and silent. The cost of Option A is "animas must be told to call complete-session" — that's an instruction, not a mechanism. Worth it.
>
> **Hybrid possibility:** Explicit `complete-session` required, BUT if a session ends with all children complete and no `complete-session`, instead of re-summoning, fire a `<type>.review-needed` event or similar. "Hey, this looks done but wasn't explicitly signed off." Probably overkill for v1 though.

> I'm confused about whether we "complete session explicitly" or "auto complete if there are no child work items when the session ends". Either way, I agree that "session complete, work item failed" -> fire failure event and no resummon

> **Coco:** See the deep-dive above — I'm recommending explicit `complete-session`. To be crystal clear about the flow:
> - Anima calls `complete-session` → session marked complete → writ completed (if children all done) → rollup
> - Anima calls `fail-writ` then `complete-session` → session marked complete → writ already failed → fire `<type>.failed` → no rollup, no re-summon
> - Session ends without `complete-session` → interrupted → check children → re-summon
>
> The session ending "naturally" (anima stops generating) without an explicit tool call is always treated as interruption. This avoids the silent-false-completion failure mode.

> What happens to the children if the writ is failed? We also need to consider infinite loops here as well, but that's fine -- we have talk of a guard elsewhere.

#### Type-Driven Events

When a writ transitions status, the framework emits `<type>.<status>`:

```
task.created      — a "task" writ was created
task.ready        — a "task" was marked ready
task.completed    — a "task" was completed
feature.ready     — a "feature" was marked ready
review.created    — a "review" writ was created
summon.completed  — a synthesized "summon" writ was completed
```

> note taht I don't think 'budget-alert' as a type would be synthesized... aren't they all just "summon"? Although, see below

> **Coco:** You're right — fixed. All auto-synthesized writs are type `"summon"`. The standing order in the operational example had a `"type": "budget-alert"` field which was confusing — that was suggesting guilds could override the synthesized type. I've removed that. If a guild wants `budget-alert` as a real type, they declare it in `guild.json` and create writs of that type intentionally via an engine.

Types are declared in `guild.json` so the framework can validate event names and guilds can document their taxonomy.

## How Summons Work

When the clockworks matches a summon standing order, the dispatch process is:

### 1. Bind or synthesize a writ

**If the event has a `writId` in its payload** (writ lifecycle event): bind the session to the existing writ. Mark it `active`.

> do we want to just conventionally use this name, meaning its possible guild-created events would also be detected as "writ events". Or should we use a more shadowed field (__nexus.writId, __writId, __type == 'writ'). a guild _could_ still include this shape... but it's not very likely to be an accident and probably someone being clever.

> **Coco:** I'd go with the simple conventional name (`writId`). Reasoning: (1) if a guild intentionally puts a `writId` in a custom event payload, they probably *want* the session bound to that writ — that's a feature, not a bug. (2) Accidental collision is very unlikely — you'd have to name a payload field `writId` by accident. (3) Double-underscore namespacing looks ugly in event payloads and adds cognitive overhead for anyone reading standing orders. The "someone being clever" case is actually a useful escape hatch — a guild can create a custom event type that still binds to an existing writ, getting the lifecycle benefits without going through the standard writ event path.

> Ok, sounds good

**If the event does NOT have a `writId`** (any other event): the framework automatically synthesizes a writ:
- **type:** `"summon"`

> `summon` works, and may be best. But do we want to consider something like `summon.<original-type>` or `summon(<original-type>)`, e.g. `summon.token.budget.low`

> **Coco:** I'd keep it flat — just `"summon"`. Reasons: (1) The type field drives event naming (`<type>.<status>`), so `summon.token.budget.low` as a type would emit `summon.token.budget.low.completed` — getting messy. (2) The event that triggered it is already captured in the writ's title and description. (3) If you want to distinguish summon subtypes, that's the moment to declare a real type in `guild.json`. The synthesized writs are the "I don't care, just give me durability" path — keep them dumb.

> Sounds good

- **title:** the event name (e.g., `"token.budget.low"`)

> Again, this works. But maybe we would want something more readable.. options: (a) humanize common cases like dot-separated, camelcase, snakecase, kebabcase (token.budget.low -> 'Token Budget Low', 'something-failed' -> 'Something Failed), (b) or more simply `Summon <role>: token.budget.low` or `token.budget.low: Summon <role>`

> **Coco:** I like option (b) — `"Summon foreman: token.budget.low"`. It tells you what happened AND who was called. The raw event name is still there for machine parsing, but the title reads like a log entry a human can scan. Easy to implement (it's a string template, we have the role from the standing order). Let's go with that.

> Agreed.

- **description:** serialized event payload
- **parent_id:** null

This is invisible to the guild. The standing order is just:

```json
{ "on": "token.budget.low", "summon": "foreman", "prompt": "..." }
```

The framework handles the rest. The synthesized writ provides durability, resumption, and audit — the guild gets those for free without declaring anything.

### 2. Hydrate the prompt template

Resolve the prompt template from the standing order, substituting:
- `{{field}}` — from the event payload
- `{{writ.*}}` — from the bound writ (whether existing or synthesized)
- `{{writ.parent.*}}` — from the parent writ (one level up)

> I'm included to say... no traversal depth? Direct fields from the payload, and then access to writ fields (including parentId). Anyting else has to be looked up using tools. If we see every artificer walking a whole tree up to commission we could try steering away in prompts or revisiting.

> **Coco:** I can get behind that — it's the simplest thing. `{{field}}` for payload, `{{writ.*}}` for the bound writ. No parent traversal, no commission lookup in templates. If a standing order needs commission context, the engine that created the writ can stuff it into the writ's description at creation time. That pushes the context-gathering into the planning phase (where it belongs) rather than the dispatch phase. It also means the template system is dead simple to implement — just two lookup scopes. I'll update the examples to match.
>
> One exception worth discussing: do we keep `{{writ.parent.*}}` as a convenience? It's a single join, not a traversal, and "Part of: {{writ.parent.title}}" is genuinely useful context that's awkward to bake into every writ description. But I could go either way.

> Ok, let's add the parent context but no ancestors beyond that. Which means we need to make sure `writ.parent.parentId` is also available

### 3. Manifest and launch

Resolve the role to an anima. Manifest it. Launch the session through the session funnel with the hydrated prompt. The session record includes the writ reference.

### 4. On session end

- `complete-session` was called → complete the writ (if children are all done) → rollup
- `complete-session` was NOT called → check for incomplete children → re-summon if needed

## Prompt Templates on Standing Orders

Standing orders gain a `prompt` field — a template string hydrated from the event payload and writ lookups.

```json
{
  "on": "task.ready",
  "summon": "artificer",
  "prompt": "You have been assigned a task.\n\n## Task\n**{{writ.title}}**\n\n{{writ.description}}\n\n## Context\nThis is part of: {{writ.parent.title}}"
}
```

Template resolution:
- `{{field}}` — direct substitution from the event payload
- `{{writ.*}}` — the bound writ's fields (title, description, type, status)
- `{{writ.parent.*}}` — the parent writ's fields (one level up, if we keep it)

For operational summons:

```json
{
  "on": "token.budget.low",
  "summon": "foreman",
  "prompt": "Token budget alert: {{budgetRemaining}} of {{budgetTotal}} remaining.\n\nReview active sessions and halt non-critical work if needed."
}
```

The prompt uses event payload fields directly. The synthesized writ provides durability and resumption, but the prompt context comes from the event.

### Resumed Session Prompts

When re-summoning for a staged session, the framework appends the writ's child state to the prompt:

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

The framework generates this appendix from the writ's children. The anima sees exactly where things stand without needing to query.

> How would this work if children have children? Maybe we only list the "light-weight" children (strokes, e.g. steps now). Wouldn't necessarily want someone taking on bigger tasks that somehow got added

> **Coco:** Good catch. I think the rule is: **list only the direct children of the writ being resumed.** If you're resuming a task, you see its steps. If you're resuming a feature (which would be unusual — features don't usually get direct sessions), you'd see its tasks. You wouldn't see steps-of-tasks — that's a different session's problem.
>
> The "wouldn't want someone taking on bigger tasks" concern is real but I think it's handled by the type system and standing orders. If a child writ is type `"task"`, it has its own `task.ready` event and gets its own session. The resumed parent session would see it listed but shouldn't try to do it — the anima's instructions should say "your steps are listed below; the tasks are handled separately." Though... that's a lot of weight on instructions. Maybe the appendix should filter to only show "leaf" types (steps) and summarize others: "3 tasks (2 completed, 1 active)". Worth prototyping both and seeing what reads better.

## Writ Types in guild.json

Types are declared so the framework can validate event names and guilds can self-document their taxonomy.

> where does this validation haappen?

> **Coco:** Two places: (1) **At writ creation** — when `createWrit()` is called (by an engine or anima tool), the framework checks the type against `guild.json`. Unknown type → error. This catches typos and misconfigurations early. (2) **At guild init / upgrade** — `nsg init` and `nsg upgrade` can validate that standing order event patterns (`task.ready`, `feature.completed`) reference declared types. This is a lint-time check, not a runtime check — it warns about standing orders that can never fire because no writ of that type will ever exist. We could also validate at event emission time, but that feels redundant if we validate at creation.

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

Guilds define types for work they intentionally create and route — production work, planning, reviews. A simple guild might have just `"task"` and `"step"`.

The framework reserves two built-in types for auto-synthesized writs: `"summon"` (for operational event sessions) and `"commission"` (for root writs created when commissions arrive). These don't need to be declared in `guild.json` — the framework creates them automatically. Guilds can wire standing orders to `summon.completed` or `commission.completed` if they want to react to these finishing, but most won't need to.

## Example: Simple Guild (No Sage)

Standing orders:
```json
[
  { "on": "commission.posted", "run": "workshop-prepare" },
  { "on": "commission.ready", "summon": "artificer",
    "prompt": "You have been assigned a commission.\n\n{{writ.title}}\n\n{{writ.description}}" },
  { "on": "commission.completed", "run": "workshop-merge" }
]
```

> Is this needed? couldn't we just add a standing order to send commissions to an artificer, and pull commission fields into the prompt?

> **Coco:** You're right — with prompt templates, the `auto-scaffold` engine that creates a task writ is unnecessary for simple guilds. The `commission.ready` event can directly summon an artificer, with the root `"commission"` writ providing the context. I've simplified the example above. The commission writ is created automatically by the framework when the commission arrives; `workshop-prepare` does its git stuff; then `commission.ready` summons the artificer directly. No intermediate scaffolding engine needed.
>
> For guilds that *want* decomposition (sage + artificer), they'd still have an engine or sage session that creates child writs. But the simple path is now genuinely simple.

The artificer creates child "step" writs as it plans its work. Completes each step as it goes. When done, calls `complete-session`. Framework completes the commission writ, which marks the commission itself as complete.

> We don't "roll up to commission" if we create a root-task for commissions. Although it does raise the question of.. how do commissions get marked as complete in that scenario? Could be something internal that is checked on every work item completion... kinda heavy handed. Maybe a periodic check in the clockworks? Each N ticks, scan all incomplete commissions and check their work item status. Complete/cancel/fail as appropraite

> **Coco:** I think the `"commission"` built-in type solves this cleanly. When a commission arrives, the framework creates a root writ of type `"commission"`. All guild-created writs (tasks, features) are children of it. When the commission writ completes (via normal rollup from its children), the framework sees it's a `"commission"` type writ and marks the actual commission record as complete. One check, at completion rollup time, only for writs of type `"commission"`. No periodic scanning needed.
>
> The flow: commission posted → framework creates commission writ → `commission.ready` fires → guild's standing orders take over → eventually all children complete → commission writ auto-completes via rollup → framework marks the commission done.
>
> This also means `commission.completed` as an event is just the normal `<type>.<status>` pattern — no special machinery.

> I like it.

If the artificer's context runs out, the session ends without `complete-session`. Framework checks the writ's children — incomplete steps remain. Re-summons with the original prompt plus the progress appendix.

## Example: Guild With Planning (Sage + Artificer)

Writ types: `feature`, `task`, `step`, `triage`

Standing orders:
```json
[
  { "on": "commission.posted", "run": "workshop-prepare" },
  { "on": "commission.ready", "summon": "sage",
    "prompt": "A new commission needs triage.\n\n{{writ.description}}\n\nAssess scope. Decompose into features and tasks. Mark leaf items as ready when they are specified well enough for an artificer to execute." },
  { "on": "feature.ready", "summon": "sage",
    "prompt": "This feature needs planning.\n\n## Feature\n{{writ.title}}\n{{writ.description}}\n\nBreak this into concrete tasks. Mark each task ready when specified." },
  { "on": "task.ready", "summon": "artificer",
    "prompt": "You have been assigned a task.\n\n## Task\n{{writ.title}}\n\n{{writ.description}}\n\n## Context\nPart of: {{writ.parent.title}}" },
  { "on": "task.failed", "summon": "steward",
    "prompt": "A task has failed.\n\n{{writ.title}}\n{{writ.description}}\n\nAssess the failure and recommend next steps." }
]
```

Completion cascades: steps → tasks → features → commission writ → commission marked done.

## Example: Operational Standing Orders

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

Every summon produces a writ — the framework synthesizes them automatically for operational events. The midnight inspector gets a `"summon"` writ titled `"Summon ops: midnight.cron"`. If it finds problems, it can create child writs. If it gets interrupted, it gets re-summoned. When it's done, it calls `complete-session`, the writ completes, and there's a durable record that the inspection happened.

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
- Single `writs` table with `type` and optional `parent_id`
- Writ types declared in `guild.json`
- Built-in types: `"summon"` (operational) and `"commission"` (root writs for commissions)
- `<type>.<status>` event naming convention
- Automatic writ synthesis for all non-writ event summons (type `"summon"`, invisible to guild)
- `complete-session` tool as the universal "I'm done" signal
- Prompt templates on standing orders with template hydration
- Automatic progress appendix for resumed sessions

### Preserved
- Commissions as the patron-facing input boundary
- The clockworks event/standing-order dispatch model
- The session funnel (manifest → launch → record)
- Completion rollup (generalized to one recursive function)
- Atomic progress tracking (as child writs instead of strokes)

## Open Questions

1. **Re-summon limits.** If `complete-session` is never called (anima keeps crashing, or keeps running out of context without making progress), the framework keeps re-summoning. Need a max-retries or circuit-breaker mechanism. Probably a configurable limit on the writ or standing order.

2. **Prompt template traversal depth.** Currently proposing: `{{field}}` for payload, `{{writ.*}}` for the bound writ. Possibly `{{writ.parent.*}}` as a convenience (single join, not a walk). No deeper traversal — use tools or bake context into writ descriptions at creation time.

> I'm included to say... no traversal depth? Direct fields from the payload, and then access to writ fields (including parentId). Anyting else has to be looked up using tools. If we see every artificer walking a whole tree up to commission we could try steering away in prompts or revisiting.

> **Coco:** Acknowledged — see the template section above. I'm on board with minimal templates. The one thing I want to keep discussing is whether `{{writ.parent.*}}` (one level, single join) earns its keep. It's the difference between `"Part of: {{writ.parent.title}}"` in a template vs. every planning engine manually copying parent context into child writ descriptions. But if you're feeling "start minimal, add later" — I'm fine with payload + writ fields only.

> Added feedback in traversal section - keep parent, and parent.parentId. no further

3. **Step event noise.** If steps fire `step.created`, `step.completed` etc., a task with 10 steps generates 20+ events. Should certain types be flagged as "quiet" (suppress lifecycle events)? Or is the event volume fine since they're processed serially and most won't match any standing orders?

> I feel like it's fine? I'm inclined to let it ride unless we see real problems at reasonable scale

> **Coco:** Agreed. Events that don't match any standing orders are cheap — they get marked processed and that's it. No-op. Let it ride.

4. **Migration path.** Current schema has separate works, pieces, jobs, strokes tables. Migrating to unified writs requires schema migration and updating CRUD functions. What's the sequencing?

> Publish a new version with the crud functions, tools, and CLI updated. It also has a migration that just deletes the irrelevant tables. When my guild (the only one in existence) upgrades, the schema is applied et voila.

> **Coco:** Clean and simple. One migration: drop works, pieces, jobs, strokes tables; create writs table. No data migration since the old tables were never populated (the pipeline skipped them). Ship it.

5. **`complete-session` semantics.** Resolved: explicit `complete-session` required. See deep-dive above.

6. ~~**Brief standing orders.**~~ Removed — prompt templates meet the need.

> Let's just remove brief for now. Don't prompt templates meet the original need, better. (I think we talked about maybe different prompts for 'briefs' vs 'summons'.)

> **Coco:** Done. Briefs are gone. Any standing order can have a prompt template now, so the distinction between "summon with lots of context" and "brief with a quick note" is just... different prompt templates on different standing orders. Same mechanism.

7. **Other relationship types.** Backlog item — consider blocks/blocked-by, related-to, etc. Not for v1.

8. **Work-decomposition.md.** Needs rewriting to reflect writs model.

> yeah this will need to be updated bigly

9. **Documentation.** Especially prompt template syntax and writ lifecycle. Needs to be good enough for both humans and the steward anima.

> We will need decent documentation on this. Especially the template for prompts, which is much more complex than our previous config options. Both for humans, and also make sure the Steward has good info so he can assist

> **Coco:** Absolutely. I'd suggest three docs: (1) a **writ system overview** (what this draft becomes, minus the design discussion), (2) a **prompt template reference** (syntax, available scopes, examples for common patterns), (3) an update to the **steward curriculum** so the steward can help guilds debug their standing orders and templates. The prompt template reference is the most important — it's the primary configuration surface for guilds now.

10. **Commission writ creation timing.** When exactly does the framework create the `"commission"` root writ? At `commission.posted` (before workshop-prepare)? At `commission.ready` (after)? Needs to be defined so guilds know when the writ exists and can be referenced.
