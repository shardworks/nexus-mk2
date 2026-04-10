_Imported from `.scratch/todo/multi-rig-architectural-exploration.md` (2026-04-10)._

## Opened With

The starting question was small: "I'd like to be able to retry failed engines in a rig." A rebase conflict at the seal step wipes out 100 hours of upstream work, and the only recourse today is reposting the commission as a new writ. We wanted a retry primitive.

What the conversation surfaced instead: **the 1:1 writ-to-rig coupling is the root cause of several separate pain points**, and no amount of engine-level retry machinery will fix the underlying shape.

The insight is a reframe of the basic data model:

> The writ is a long-lived **obligation** record. Rigs are **ephemeral execution attempts** against that obligation. A writ can accumulate multiple rigs over its lifetime.

Under this model, a whole class of problems dissolves:

- **Recovery from failure** → spawn a new rig with just the failed step. No engine-retry primitive needed; retry lives at the rig level.
- **Mid-rig decomposition → resume** → rig A ends naturally when it spawns children; children run; rig B spawns on the parent for the remaining phases. No pause primitive needed.
- **Patron-requested revision** → spawn a revision rig on the same writ. No "repost as new commission" ceremony; history stays intact.
- **Stuck recovery** → the previous rig is done; spawn a new one. The writ stays open.
- **Amendments and scope changes** → cancel current rig, spawn a new one with updated spec. Writ lifecycle preserved.

This matches how patrons actually think: *"I asked for X"* is durable; *"here's the 3rd attempt at delivering X"* is transient.

It also strengthens the planning/execution boundary rather than violating it. Under 1:1, writ status was leaking execution detail (`active` meant "a rig is running" — an execution fact). Under multi-rig, writ status tracks obligation lifecycle; rig status tracks execution. The two layers stop conflating.

The refined boundary rule: *most* rigs execute work and produce artifacts; *some* rigs execute **planning** and produce writ structure. Both are legitimate. What's prohibited is a non-planning rig reaching sideways to modify writ structure during execution. If an implementation rig discovers decomposition is needed, it escalates ("needs replanning") and a separate planning rig handles the modification.

## Summary

Parked architectural exploration. Not scheduled. Complexity estimate: **21** (possibly 34 if workspace persistence is as involved as suspected). This is a foundational refactor that touches Clerk, Spider, Fabricator, Scriptorium, Clockworks, Oculus, and every consumer that assumes 1:1 — not a feature to cram into an unrelated change.

**The coherent answer to shipping:** don't patch the 1:1 model further. Attempts to bolt on engine retry, pause primitives, and clever status schemes are all compensating for the 1:1 coupling, and they'll keep piling up. In the interim, accept the 1:1 limitations honestly; add a `stuck` signal if we need the recoverability escalation *now*, but know it's a bridge.

**Status model under multi-rig** (if we build it): drops from 7–8 statuses to 6. `ready` and `active` collapse into `open` (the queued-vs-running distinction becomes a query on rigs, not a writ status). `waiting` disappears because "has non-terminal children" is a query predicate, not a primary state. `stuck` remains because it's the one signal that needs to escalate out of "details queryable" into patron-visible alerting.

**Open lines** tracked as child quests:

- Status model simplification (6 honest statuses; `waiting` demoted to query predicate; `open` replaces `ready`/`active`).
- Parent-child relationship semantics — the relationship currently carries three distinct meanings (decomposition, sub-tasks, follow-ups) that should probably split.
- Brief → mandate collapse, and the implications for the in-flight Astrolabe design.
- Rig template generation beyond "one template per writ type" (template library + patches vs Fabricator backward-chaining vs LLM-planned rigs).
- Cross-rig data flow and workspace persistence (where do rig yields live? where does the worktree live across rigs?).

Plus a handful of smaller open questions parked in Notes.

## Notes

- **Ancillary insight — status as single-concern field.** The current 8-value vocabulary encodes five orthogonal concerns in one axis (visibility, work state, structural, trouble, outcome), which is why it feels bloated. Any future status design should pick one concern (obligation lifecycle) and push the others to separate fields or queries.
- **Ancillary insight — `waiting` is derived.** Even without multi-rig, `waiting` is a candidate for removal. "Has non-terminal children" is a query predicate that was promoted to a status.
- **Cross-codex writs** are a natural fit for the "planning rig generates children" pattern — and they're the case where per-target first-class tracking matters most. See the "Cross-Codex Writs Under Multi-Rig" section of the source doc.
- **Boundary smells worth watching** if we build multi-rig: cross-rig data flow as writ-level state (bad); writ-level draft persistence (bad — use a separate workspace entity); rig outputs stored inside the writ document (bad — FK-linked separate tables).
- **Smaller open questions** not yet promoted to child quests:
  - Who decides writ completion — automatic on any rig seal + reopen capability, or explicit seal-writ step, or rig-declared intent at spawn time? (Leaning: automatic + reopen.)
  - Rig-level events in Clockworks (`rig.spawned`, `rig.completed`, `rig.failed`) distinct from writ-level events — probably yes.
  - "Stuck" → recovery flow trigger — patron action, auto via standing order, or configurable per guild? (Leaning: configurable.)
  - How many rigs can a writ accumulate? (Probably fine — index on `(writId, status)` and `(writId, spawnedAt desc)`.)
- **Dependency on T1.4 (decisions & ratification):** multi-rig would produce more cross-rig decisions that would benefit from structured ratification. Not blocking, but worth keeping the two lines aware of each other.
- **The Fabricator is the natural home for rig construction** under multi-rig. Today it's a capability catalog ("what engines exist"). Tomorrow it could be a rig builder ("given writ + intent + context, produce an engine graph"). Keeps rig construction out of Spider (which just *runs* rigs) and in a dedicated apparatus.