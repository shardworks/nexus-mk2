# Walker Static Rig — Design Session History

Design sessions: 2026-04-02

These are the key design decisions made during the Walker and Fabricator design sessions. The authoritative spec is at `.scratch/specs/walker-static-rig.md` (Walker) and `/workspace/nexus/docs/architecture/apparatus/fabricator.md` (Fabricator).

---

## Why a Walker, not a Dispatch upgrade

A review loop bolted onto Dispatch would be throwaway work. Dispatch was designed as disposable scaffolding — extending it just delays building the real rigging system. The Walker is the first real slice of that system, kept deliberately simple with a static graph.

## Static rig graph

No Formulary (now Fabricator) resolution, no origination, no dynamic extension at runtime. Every commission gets the same five-engine pipeline: `draft → implement → review → revise → seal`. The graph is a data structure (an array of `EngineInstance` records with `upstream` pointers), not hardcoded imperative calls — so it evolves naturally into dynamic graphs later.

## Single review pass, not a retry loop

The pipeline is linear: `draft → implement → review → revise → seal`. No conditional branching, no retry counting. The revise engine exits fast if review finds nothing wrong. This avoids dynamic graph manipulation and complex Walker failure handling. Retry/recovery logic arrives with dynamic rig extension.

The original proposal considered a review loop with configurable retry depth. Sean reframed the rigging system's purpose from "do bigger work" to "reduce bad work," which shifted the priority from retry mechanics to getting a single review pass working well.

## Anima-in-the-loop review

The review engine is a quick engine (anima session), not just mechanical checks. An anima reading the spec against the diff catches the partial-completion failure mode that dominates the commission log. Mechanical checks (build, test) run before the reviewer session — their results are included in the reviewer's prompt, not a separate engine.

## `walk()` as a step function

Sean's insight: "the Walker's central API is a 'walk' function which does the next _one_ thing." Each call examines guild state, picks the single highest-priority action, does it, returns. The Walker is stateless between calls — all state lives in the Stacks. This makes the Walker restart-safe and easy to reason about.

## Priority ordering: run > extend > spawn

Finish work in progress before starting new work. The priority:
1. Collect completed engines (unblocks downstream)
2. Run a ready engine (advance existing rigs)
3. Spawn a rig (begin new work)

For the static rig, "extend" doesn't apply — just run and spawn.

## Polling over CDC for session completion

Original discussion considered CDC on the sessions book to detect when quick engines complete. Sean caught a restart-safety issue: CDC would require a mapping table (session → engine) that survives restarts. Polling is simpler — the Walker stores `sessionId` on the engine instance in the Stacks, reads the session record by ID each walk cycle, and checks status. All state is in the Stacks, restart-safe, no mapping table needed.

## CDC for rig→writ lifecycle

The Walker uses a Phase 1 (cascade) CDC handler on its own `rigs` book: when a rig transitions to a terminal state, the handler calls the Clerk API to transition the corresponding writ in the same transaction. This keeps the Walker's engine execution logic decoupled from writ lifecycle management.

## Engines as a real plugin API

Engine designs are kit contributions resolved at runtime by `designId`, not hardcoded function calls. The graph is static, but the engines are pluggable from day one. This means future capability resolution doesn't need to retrofit a plugin boundary.

## The Fabricator owns engine designs

The Walker does not build its own engine registry. The Fabricator apparatus scans kit `engines` contributions at startup and exposes a `getEngineDesign(id)` lookup. The Walker contributes its five engines via its own support kit like any other kit contributor.

Originally called "the Formulary" — renamed because the word evoked prescription drugs more than capability catalogs. "Fabricator" captures "produce things from schematics" and fits the apparatus-as-machine register (alongside Clockworks, Stacks, etc.). Other candidates considered: Foundry (strong but implies manufacturing over resolution), Enginery (archaic, can't grow to hold tools), Artificery (collides with the Artificer role name).

The Fabricator is expected to grow into the guild's general capability catalog — holding engine designs, tool designs, and potentially absorbing the Instrumentarium's tool registry.

## `givens` and `yields`

Engine inputs are called `givens`; engine outputs are called `yields`. The rigging architecture originally used "yield" for engine output, but flagged a clash with JavaScript's `yield` keyword. The plural noun form (`engine.yields` as a property name) avoids the ambiguity. `givens` (from proofs/logic: "what's established before you begin") completes the pair.

## Givens unify static config and upstream data

Rather than separate `params` and `upstreamOutputs`, all engine inputs arrive in one `givens` bag. Some givens are static values set at rig spawn time (role, buildCommand, writ). Some are upstream yields resolved from completed engines (draft worktree path, review findings). The engine doesn't know or care about provenance.

The `givensSpec` on each `EngineInstance` holds the declaration of what givens to assemble. Today it's literal values populated from Walker config at rig spawn time. Future: it will hold template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields, plus a `needs` declaration that controls which upstream yields are included.

## Engine designs don't declare their kind

The original design had `kind: 'clockwork' | 'quick'` on `EngineDesign`. Removed — the Walker inspects the result shape (`completed` with yields vs `launched` with sessionId) instead. No need to predict what the engine will do; just react to what it did. "Clockwork" and "quick" remain as descriptive vocabulary but not as declared fields.

## Thin engine context

The engine's `run()` method receives two arguments: `givens` (the declared inputs) and a thin `EngineRunContext` (just `engineId` and an `upstream` escape hatch with all upstream yields). Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same singleton pattern as tool handlers. No injected apparatus references, no rig reference, no Walker config.

## Implementer role from Walker config

The role to summon for `implement` and `revise` engines is a Walker configuration value (e.g. `{ role: 'artificer' }`), passed into the givensSpec at rig spawn time. Temporary — the Fabricator takes over role selection when capability resolution arrives.

## Dedicated `reviewer` role

A new named role (`reviewer`) with a blank identity (like the artificer today). The review engine assembles the review prompt; the reviewer role's curriculum and temperament can evolve independently.

## Walker is a new package

`@shardworks/walker-apparatus`, not a Dispatch rename. Dispatch is decommissioned — deleted manually once the Walker is live. The Walker has a different dependency set, different data model, and different operational model. A rename would carry unnecessary baggage.
