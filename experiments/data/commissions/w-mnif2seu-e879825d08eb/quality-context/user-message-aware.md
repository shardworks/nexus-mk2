## Commission Spec

# Walker Increment 3 — Review and Revise Engines

Status: **Ready**

Complexity: **5**

Codex: nexus

## Authoritative Spec

The complete Walker design is at `docs/architecture/apparatus/walker.md`. This commission replaces the `review` and `revise` engine stubs with real implementations. Read the full spec — particularly the engine implementation sections for review and revise, their yield types, prompt templates, and collect steps.

---

## What already exists (after Increments 1 & 2)

- **The Walker** — fully operational walk function, priority ordering, static graph, CDC handler, engine failure propagation, tools. Operational.
- **The Fabricator** — engine design registry. Operational.
- **Clockwork engines** — `draft` and `seal` are real. Operational.
- **Implement engine** — real Animator-backed implementation. Launches sessions, Walker collects results. Operational.
- **Quick engine stubs** — `review` and `revise` are stubs returning mock yields. These are what we're replacing.
- **The Animator** — session launch, recording, and **session output capture** (`SessionResult.output` — the final assistant message text). The `output` field is available on session records in the sessions book. Operational.
- **The Scriptorium** — draft bindings with worktree paths, seal. Operational.

**Prerequisite:** The Animator session output commission must be complete before this increment. The review engine's collect step reads `session.output` to extract the reviewer's findings.

---

## What to build

### 1. Replace the `review` engine stub

The review engine is a quick engine that runs mechanical checks synchronously, then launches a reviewer anima session. See the spec for the full implementation.

**Mechanical checks (synchronous, before the session):**
- If `givens.buildCommand` is set, run it in the draft worktree and capture the result as a `MechanicalCheck` (name, passed, output truncated to 4KB, durationMs)
- If `givens.testCommand` is set, same treatment
- These are shell commands executed via `child_process` in the draft worktree

**Diff and status capture:**
- Compute `git diff` from `draft.baseSha` to HEAD in the draft worktree
- Capture `git status --porcelain`

**Prompt assembly:**
- Assemble the review prompt from the template in the spec (commission/spec body, implementation diff, worktree state, mechanical check results, structured findings format instructions)
- The prompt ends with: "Produce your findings as your final message in the format above."

**Session launch:**
- Call `animator.summon()` with `role` from givens (should be `'reviewer'`), assembled prompt, draft worktree as cwd
- Stash `mechanicalChecks` in session metadata for the collect step to retrieve
- Return `{ status: 'launched', sessionId }`

**Collect step:**
- Read `session.output` (the reviewer's final structured message) from the session record
- Parse `passed` from the "Overall: PASS/FAIL" line: `/^###\s*Overall:\s*PASS/mi`
- Retrieve `mechanicalChecks` from `session.metadata`
- Build `ReviewYields`: `{ sessionId, passed, findings: session.output, mechanicalChecks }`

### 2. Replace the `revise` engine stub

The revise engine summons an anima to address review findings (or exit quickly if the review passed). See the spec for the full implementation.

**State capture:**
- Capture `git status --porcelain` and `git diff` (uncommitted changes) in the draft worktree

**Prompt assembly:**
- Assemble the revision prompt from the template in the spec (commission/spec body, review findings, pass/fail branch with instructions, current worktree state)
- If review passed: "The review passed. No changes are required. Confirm the work looks correct and exit. Do not make unnecessary changes or spend unnecessary time reassessing."
- If review failed: "The review identified issues that need to be addressed. See 'Required Changes' in the findings above. Address each item, then commit your changes."
- Ends with: "Commit all changes before ending your session."

**Session launch:**
- Call `animator.summon()` with `role` from givens (the implementer role, e.g. `'artificer'`), assembled prompt, draft worktree as cwd, git author email set to `${writ.id}@nexus.local`
- Return `{ status: 'launched', sessionId }`

**Collect step:**
- Read session record, build `ReviseYields`: `{ sessionId, sessionStatus }`

### 3. Register the `reviewer` role

Add a `reviewer` role to the guild's anima roster. The role starts with a blank identity (no curriculum, no temperament) — the review engine assembles the full prompt. The role just needs to exist so `animator.summon({ role: 'reviewer' })` succeeds.

---

## What to validate

Tests should cover:

- **Mechanical checks:** build/test commands execute in the draft worktree; output is captured and truncated to 4KB; pass/fail is detected from exit code; missing commands are skipped gracefully
- **Review prompt assembly:** all template sections are populated correctly (spec, diff, status, checks, instructions)
- **Review collect step:** `session.output` is parsed correctly; `passed` extraction handles PASS and FAIL cases; mechanical checks are retrieved from session metadata
- **Revise prompt assembly:** pass branch and fail branch produce different prompts; review findings are included
- **Revise engine exits quickly on pass:** when `review.passed` is true, the revise session should complete rapidly (the prompt tells the anima to confirm and exit)
- **End-to-end:** `draft → implement → review → revise → seal` completes successfully with all real engines
- **Review failure path:** if the review finds issues, the revise engine gets the findings and the pipeline still completes

---

## What is NOT in scope

- Reviewer role curriculum/temperament — blank identity for now
- Review retry loops — single pass only (the static rig is linear)
- Findings written to disk or commission data directory — findings are captured via `session.output`, not file I/O
- Dynamic rig extension based on review results

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.
## Referenced Files (from spec, pre-commission state)


=== REFERENCED FILE: docs/architecture/apparatus/walker.md (pre-commission state) ===
# The Walker — API Contract

Status: **Ready — MVP**

Package: `@shardworks/walker-apparatus` · Plugin id: `walker`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Walker runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Walker is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Walker runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `walk()` step function.

The Walker owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Walker itself is stateless between `walk()` calls; all state lives in the Stacks.

---

## Dependencies

```
requires: ['fabricator', 'clerk', 'stacks']
```

- **The Fabricator** — resolves engine designs by `designId`.
- **The Clerk** — queries ready writs; receives writ transitions via CDC.
- **The Stacks** — persists rigs book, reads sessions book, hosts CDC handler on rigs book.

Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Walker dependencies.

### Reference docs

- **The Rigging System** (`docs/architecture/rigging.md`) — full rigging architecture (Walker, Fabricator, Executor, Manifester). This spec implements a subset.
- **The Fabricator** (`docs/architecture/apparatus/fabricator.md`) — engine design registry and `EngineDesign` type definitions.
- **The Scriptorium** (`docs/architecture/apparatus/scriptorium.md`) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- **The Animator** (`docs/architecture/apparatus/animator.md`) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- **The Clerk** (`docs/architecture/apparatus/clerk.md`) — writ lifecycle API.
- **The Stacks** (`docs/architecture/apparatus/stacks.md`) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

The Walker resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.

### Kit contribution

The Walker contributes its five engine designs via its support kit:

```typescript
// In walker-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: {
    walk:          walkTool,           // single step — do one thing and return
    walkContinual: walkContinualTool,  // polling loop — walk every ~5s until stopped
  },
},
```

**Tool naming note:** Hyphenated tool names (e.g. `start-walking`) have known issues with CLI argument parsing and tool grouping in `nsg`. The names above use camelCase in code; the CLI surface (`nsg walk`, `nsg walk-continual`) needs to work cleanly with the Instrumentarium's tool registration. Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands.

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Walker contributes its engines like any other kit — no special registration path.

---

## The Walk Function

The Walker's core is a single step function:

```typescript
interface WalkerApi {
  /**
   * Examine guild state and perform the single highest-priority action.
   * Returns a description of what was done, or null if there's nothing to do.
   */
  walk(): Promise<WalkResult | null>
}

type WalkResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Each `walk()` call does exactly one thing. The priority ordering:

1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent walk calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.

If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).

### Operational model: `start-walking`

The Walker exports a `start-walking` tool that runs the walk loop:

```
nsg start-walking    # starts polling loop, walks every ~5s
nsg walk             # single step (useful for debugging/testing)
```

The loop: call `walk()`, sleep `pollIntervalMs` (default 5000), repeat. When `walk()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle.

---

## Rig Data Model

### Rig

```typescript
interface Rig {
  id: string
  writId: string
  status: 'running' | 'completed' | 'failed'
  engines: EngineInstance[]
}
```

Stored in the Stacks `rigs` book. One rig per writ. The Walker reads and updates rigs via normal Stacks `put()`/`patch()` operations.

### Engine Instance

```typescript
interface EngineInstance {
  id: string               // unique within the rig, e.g. 'draft', 'implement', 'review', 'revise', 'seal'
  designId: string         // engine design id — resolved from the Fabricator
  status: 'pending' | 'running' | 'completed' | 'failed'
  upstream: string[]       // ids of engines that must complete first (empty = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Walker polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: WalkerConfig): EngineInstance[] {
  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],
      givensSpec: { writ }, yields: null },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'],
      givensSpec: { writ, role: 'reviewer', buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],
      givensSpec: {}, yields: null },
  ]
}
```

The `givensSpec` is populated from the Walker's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.

**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Walker should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.

When the Walker runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:

```typescript
function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
  // Collect all completed engine yields for the context escape hatch.
  // All completed yields are included regardless of graph distance —
  // simpler than chain-walking and equivalent for the static graph.
  const upstream: Record<string, unknown> = {}
  for (const e of rig.engines) {
    if (e.status === 'completed' && e.yields !== undefined) {
      upstream[e.id] = e.yields
    }
  }

  // Givens = givensSpec only. Upstream data stays on context.
  const givens = { ...engine.givensSpec }

  const context: EngineRunContext = {
    engineId: engine.id,
    upstream,
  }

  return { givens, context }
}
```

Givens contain only what the givensSpec declares — static values set at rig spawn time (writ, role, buildCommand, etc.). Engines that need upstream data (worktree path, review findings, etc.) pull it from `context.upstream` by engine id. This keeps the givens contract clean: what you see in the givensSpec is exactly what the engine receives.

### `DraftYields`

```typescript
interface DraftYields {
  draftId: string         // the draft binding's unique id (from DraftRecord.id)
  codexName: string       // which codex this draft is on (from DraftRecord.codexName)
  branch: string          // git branch name for the draft (from DraftRecord.branch)
  path: string            // absolute path to the draft worktree (from DraftRecord.path)
  baseSha: string         // commit SHA at draft open — used to compute diffs later
}
```

**Produced by:** `draft` engine
**Consumed by:** all downstream engines. Establishes the physical workspace.

> **Note:** Field names mirror the Scriptorium's `DraftRecord` type (`codexName`, `branch`, `path`) rather than inventing Walker-specific aliases. `baseSha` is the only field the draft engine adds itself — by reading `HEAD` after opening the draft.

### `ImplementYields`

```typescript
interface ImplementYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `implement` engine (set by Walker's collect step when session completes)
**Consumed by:** `review` (needs to know the session completed)

### `ReviewYields`

```typescript
interface ReviewYields {
  sessionId: string
  passed: boolean                      // reviewer's overall assessment
  findings: string                     // structured markdown: what passed, what's missing, what's wrong
  mechanicalChecks: MechanicalCheck[]  // build/test results run before the reviewer session
}

interface MechanicalCheck {
  name: 'build' | 'test'
  passed: boolean
  output: string    // stdout+stderr, truncated to 4KB
  durationMs: number
}
```

**Produced by:** `review` engine
**Consumed by:** `revise` (needs `passed` to decide whether to do work, needs `findings` as context)

The `mechanicalChecks` are run by the engine *before* launching the reviewer session — their results are included in the reviewer's prompt.

### `ReviseYields`

```typescript
interface ReviseYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `revise` engine (set by Walker's collect step when session completes)
**Consumed by:** `seal` (no data dependency — seal just needs revise to be done)

### `SealYields`

```typescript
interface SealYields {
  sealedCommit: string                     // the commit SHA at head of target after sealing (from SealResult)
  strategy: 'fast-forward' | 'rebase'      // merge strategy used (from SealResult)
  retries: number                          // rebase retry attempts needed (from SealResult)
  inscriptionsSealed: number               // number of commits incorporated (from SealResult)
}
```

**Produced by:** `seal` engine
**Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.

> **Note:** Field names mirror the Scriptorium's `SealResult` type. Push is a separate Scriptorium operation — the seal engine seals but does not push.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Walker's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

### `draft` (clockwork)

Opens a draft binding on the commission's target codex.

```typescript
async run(givens: Record<string, unknown>, _context: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const writ = givens.writ as Writ
  const draft = await scriptorium.openDraft({ codexName: writ.codex, associatedWith: writ.id })
  const baseSha = await getHeadSha(draft.path)

  return {
    status: 'completed',
    yields: { draftId: draft.id, codexName: draft.codexName, branch: draft.branch, path: draft.path, baseSha } satisfies DraftYields,
  }
}
```

### `implement` (quick)

Summons an anima to do the commissioned work.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  const prompt = `${writ.body}\n\nCommit all changes before ending your session.`

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.

**Collect step (Walker, not engine):** When the Walker's collect step detects the session has completed, it builds the yields:

```typescript
// In Walker's collect step
const session = await stacks.get('sessions', engine.sessionId)
engine.yields = {
  sessionId: session.id,
  sessionStatus: session.status,
} satisfies ImplementYields
```

### `review` (quick)

Runs mechanical checks, then summons a reviewer anima to assess the implementation.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  // 1. Run mechanical checks synchronously
  const checks: MechanicalCheck[] = []
  if (givens.buildCommand) {
    checks.push(await runCheck('build', givens.buildCommand as string, draft.path))
  }
  if (givens.testCommand) {
    checks.push(await runCheck('test', givens.testCommand as string, draft.path))
  }

  // 2. Compute diff since draft opened
  const diff = await gitDiff(draft.path, draft.baseSha)
  const status = await gitStatus(draft.path)

  // 3. Assemble review prompt
  const prompt = assembleReviewPrompt(writ, diff, status, checks)

  // 4. Launch reviewer session
  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    metadata: {
      engineId: context.engineId,
      writId: writ.id,
      mechanicalChecks: checks,  // stash for collect step to include in yields
    },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

**Review prompt template:**

```markdown
# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

{writ.body}

## Implementation Diff

Changes since the draft was opened:

```diff
{git diff draft.baseSha..HEAD in worktree}
```

## Current Worktree State

```
{git status --porcelain}
```

## Mechanical Check Results

{for each check}
### {name}: {PASSED | FAILED}
```
{output, truncated to 4KB}
```
{end for}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.
```

**Collect step:** The Walker retrieves the reviewer's findings from the session output — the reviewer produces structured markdown as its final message, and the Animator captures this on the session record. No file is written to the worktree (review artifacts don't belong in the codebase).

```typescript
// In Walker's collect step
const session = await stacks.get('sessions', engine.sessionId)
const findings = session.output  // reviewer's structured findings from final message
const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
const checks = session.metadata?.mechanicalChecks ?? []

engine.yields = { sessionId: session.id, passed, findings, mechanicalChecks: checks } satisfies ReviewYields
```

**Dependency:** The Animator's `SessionResult.output` field (the final assistant message text) must be available for this to work. See the Animator spec (`docs/architecture/apparatus/animator.md`) — the `output` field is populated from the session provider's transcript at recording time.

### `revise` (quick)

Summons an anima to address review findings.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields
  const review = context.upstream.review as ReviewYields

  const status = await gitStatus(draft.path)
  const diff = await gitDiffUncommitted(draft.path)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

**Revision prompt template:**

```markdown
# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

{writ.body}

## Review Findings

{review.findings}

## Review Result: {PASS | FAIL}

{if review.passed}
The review passed. No changes are required. Confirm the work looks correct
and exit. Do not make unnecessary changes or spend unnecessary time reassessing.
{else}
The review identified issues that need to be addressed. See "Required Changes"
in the findings above. Address each item, then commit your changes.
{end if}

## Current State

```
{git status --porcelain}
```

```diff
{git diff HEAD, if any uncommitted changes}
```

Commit all changes before ending your session.
```

**Collect step:**

```typescript
const session = await stacks.get('sessions', engine.sessionId)
engine.yields = { sessionId: session.id, sessionStatus: session.status } satisfies ReviseYields
```

### `seal` (clockwork)

Seals the draft binding.

```typescript
async run(_givens: Record<string, unknown>, ctx: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const draft = ctx.upstream.draft as DraftYields

  const result = await scriptorium.seal({
    codexName: draft.codexName,
    sourceBranch: draft.branch,
  })

  return {
    status: 'completed',
    yields: {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    } satisfies SealYields,
  }
}
```

The seal engine does **not** transition the writ — that's handled by the CDC handler on the rigs book.

---

## CDC Handler

The Walker registers one CDC handler at startup:

### Rig terminal state → writ transition

**Book:** `rigs`
**Phase:** Phase 1 (cascade) — the writ transition joins the same transaction as the rig update
**Trigger:** rig status transitions to `completed` or `failed`

```typescript
stacks.watch('rigs', async (event) => {
  if (event.type !== 'update') return
  const rig = event.doc
  const prev = event.prev

  // Only fire on terminal transitions
  if (prev.status === rig.status) return
  if (rig.status !== 'completed' && rig.status !== 'failed') return

  if (rig.status === 'completed') {
    const sealYields = rig.engines.find(e => e.id === 'seal')?.yields as SealYields
    await clerk.transition(rig.writId, 'completed', {
      resolution: `Sealed at ${sealYields.sealedCommit} (${sealYields.strategy}, ${sealYields.inscriptionsSealed} inscriptions).`,
    })
  } else {
    const failedEngine = rig.engines.find(e => e.status === 'failed')
    await clerk.transition(rig.writId, 'failed', {
      resolution: `Engine '${failedEngine?.id}' failed: ${failedEngine?.error ?? 'unknown error'}`,
    })
  }
})
```

Because this is Phase 1 (cascade), the writ transition joins the same transaction as the rig status update. If the Clerk call throws, the rig update rolls back too.

---

## Engine Failure

When any engine fails (throws, or a quick engine's session has `status: 'failed'`):

1. The engine is marked `status: 'failed'` with the error (detected during "collect completed engines" for quick engines, or directly during execution for clockwork engines)
2. The rig is marked `status: 'failed'` (same transaction)
3. CDC fires on the rig status change → handler calls Clerk API to transition the writ to `failed`
4. The draft is **not** abandoned — preserved for patron inspection

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.

Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Walker's).

---

## Dependency Map

```
Walker
  ├── Fabricator  (resolve engine designs by designId)
  ├── Clerk       (query ready writs, transition writ state via CDC)
  ├── Stacks      (persist rigs book, read sessions book, CDC handler on rigs book)
  │
  Engines (via guild() singleton, not Walker dependencies)
  ├── Scriptorium (draft, seal engines — open drafts, seal)
  ├── Animator    (implement, review, revise engines — summon animas)
  └── Loom        (via Animator's summon — context composition)
```

---

## Future Evolution

These are known directions the Walker and its data model will grow. None are in scope for the static rig MVP.

- **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
- **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
- **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Walker checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Walker marks it failed (and optionally terminates the session).
- **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

---

## What This Spec Does NOT Cover

- **Origination.** Commission → rig mapping is hardcoded (static graph).
- **The Executor as a separate apparatus.** The Walker runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Walker processes multiple ready engines across rigs.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.

---

## Configuration

```json
{
  "walker": {
    "role": "artificer",
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields optional. `role` defaults to `"artificer"`. `pollIntervalMs` defaults to `5000`. `buildCommand` and `testCommand` are run by the review engine before launching the reviewer; omitted means those mechanical checks are skipped (reviewer anima still does spec-vs-diff assessment).


## Commission Diff

```
```
 packages/plugins/walker/src/engines/review.ts | 154 ++++++++-
 packages/plugins/walker/src/engines/revise.ts | 103 +++++-
 packages/plugins/walker/src/types.ts          |  41 +++
 packages/plugins/walker/src/walker.test.ts    | 443 ++++++++++++++++++++++++--
 packages/plugins/walker/src/walker.ts         |  22 +-
 5 files changed, 714 insertions(+), 49 deletions(-)

diff --git a/packages/plugins/walker/src/engines/review.ts b/packages/plugins/walker/src/engines/review.ts
index ad98d7f..05f91a1 100644
--- a/packages/plugins/walker/src/engines/review.ts
+++ b/packages/plugins/walker/src/engines/review.ts
@@ -1,26 +1,154 @@
 /**
- * Review engine — stub (Increment 1).
+ * Review engine — quick (Animator-backed).
  *
- * Returns a completed result with mock yields so the full pipeline can be
- * tested end-to-end. Increment 3 replaces this with real Animator-backed
- * quick engine execution.
+ * Runs mechanical checks (build/test) synchronously in the draft worktree,
+ * then summons a reviewer anima to assess the implementation against the spec.
+ * Returns `{ status: 'launched', sessionId }` so the Walker's collect step
+ * can parse the reviewer's findings from session.output on subsequent walks.
+ *
+ * Collect step (Walker):
+ *   - Reads session.output as the reviewer's structured markdown findings
+ *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
+ *   - Retrieves mechanicalChecks from session.metadata
  */
 
+import { execFile } from 'node:child_process';
+import { promisify } from 'node:util';
+import { guild } from '@shardworks/nexus-core';
 import type { EngineDesign } from '@shardworks/fabricator-apparatus';
+import type { AnimatorApi } from '@shardworks/animator-apparatus';
+import type { WritDoc } from '@shardworks/clerk-apparatus';
+import type { DraftYields, MechanicalCheck } from '../types.ts';
+
+const execFileAsync = promisify(execFile);
+
+async function runCheck(name: 'build' | 'test', command: string, cwd: string): Promise<MechanicalCheck> {
+  const start = Date.now();
+  try {
+    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], { cwd });
+    const output = (stdout + stderr).slice(0, 4096);
+    return { name, passed: true, output, durationMs: Date.now() - start };
+  } catch (err: unknown) {
+    const execErr = err as { stdout?: string; stderr?: string };
+    const output = ((execErr.stdout ?? '') + (execErr.stderr ?? '')).slice(0, 4096);
+    return { name, passed: false, output, durationMs: Date.now() - start };
+  }
+}
+
+async function gitDiff(cwd: string, baseSha: string): Promise<string> {
+  try {
+    const { stdout } = await execFileAsync('git', ['diff', `${baseSha}..HEAD`], { cwd });
+    return stdout;
+  } catch {
+    return '';
+  }
+}
+
+async function gitStatus(cwd: string): Promise<string> {
+  try {
+    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
+    return stdout;
+  } catch {
+    return '';
+  }
+}
+
+function assembleReviewPrompt(writ: WritDoc, diff: string, status: string, checks: MechanicalCheck[]): string {
+  const checksSection = checks.length === 0
+    ? '(No mechanical checks configured.)'
+    : checks.map((c) => `### ${c.name}: ${c.passed ? 'PASSED' : 'FAILED'}\n\`\`\`\n${c.output}\n\`\`\``).join('\n\n');
+
+  return `# Code Review
+
+You are reviewing work on a commission. Your job is to assess whether the
+implementation satisfies the spec, identify any gaps or problems, and produce
+a structured findings document.
+
+## The Commission (Spec)
+
+${writ.body}
+
+## Implementation Diff
+
+Changes since the draft was opened:
+
+\`\`\`diff
+${diff}
+\`\`\`
+
+## Current Worktree State
+
+\`\`\`
+${status}
+\`\`\`
+
+## Mechanical Check Results
+
+${checksSection}
+
+## Instructions
+
+Assess the implementation against the spec. Produce your findings in this format:
+
+### Overall: PASS or FAIL
+
+### Completeness
+- Which spec requirements are addressed?
+- Which are missing or partially addressed?
+
+### Correctness
+- Are there bugs, logic errors, or regressions?
+- Do the tests pass? If not, what fails?
+
+### Quality
+- Code style consistent with the codebase?
+- Appropriate test coverage for new code?
+- Any concerns about the approach?
+
+### Required Changes (if FAIL)
+Numbered list of specific changes needed, in priority order.
+
+Produce your findings as your final message in the format above.`;
+}
 
 const reviewEngine: EngineDesign = {
   id: 'review',
 
-  async run(_givens, _context) {
-    return {
-      status: 'completed',
-      yields: {
-        sessionId: 'stub',
-        passed: true,
-        findings: 'Stub review — no findings.',
-        mechanicalChecks: [],
+  async run(givens, context) {
+    const animator = guild().apparatus<AnimatorApi>('animator');
+    const writ = givens.writ as WritDoc;
+    const draft = context.upstream['draft'] as DraftYields;
+
+    // 1. Run mechanical checks synchronously before the reviewer session
+    const checks: MechanicalCheck[] = [];
+    if (givens.buildCommand) {
+      checks.push(await runCheck('build', givens.buildCommand as string, draft.path));
+    }
+    if (givens.testCommand) {
+      checks.push(await runCheck('test', givens.testCommand as string, draft.path));
+    }
+
+    // 2. Compute diff since draft opened and current worktree state
+    const diff = await gitDiff(draft.path, draft.baseSha);
+    const status = await gitStatus(draft.path);
+
+    // 3. Assemble review prompt
+    const prompt = assembleReviewPrompt(writ, diff, status, checks);
+
+    // 4. Launch reviewer session — stash mechanicalChecks in metadata for collect step
+    const handle = animator.summon({
+      role: givens.role as string,
+      prompt,
+      cwd: draft.path,
+      metadata: {
+        engineId: context.engineId,
+        writId: writ.id,
+        mechanicalChecks: checks,
       },
-    };
+    });
+
+    const sessionResult = await handle.result;
+    return { status: 'launched', sessionId: sessionResult.id };
   },
 };
 
diff --git a/packages/plugins/walker/src/engines/revise.ts b/packages/plugins/walker/src/engines/revise.ts
index 27df883..d759e5a 100644
--- a/packages/plugins/walker/src/engines/revise.ts
+++ b/packages/plugins/walker/src/engines/revise.ts
@@ -1,24 +1,103 @@
 /**
- * Revise engine — stub (Increment 1).
+ * Revise engine — quick (Animator-backed).
  *
- * Returns a completed result with mock yields so the full pipeline can be
- * tested end-to-end. Increment 3 replaces this with real Animator-backed
- * quick engine execution.
+ * Summons an anima to address review findings. If the review passed, the
+ * prompt instructs the anima to confirm and exit without unnecessary changes.
+ * If the review failed, the prompt directs the anima to address each item
+ * in the findings and commit the result.
+ *
+ * Returns `{ status: 'launched', sessionId }` so the Walker's collect step
+ * can store ReviseYields on completion.
  */
 
+import { execFile } from 'node:child_process';
+import { promisify } from 'node:util';
+import { guild } from '@shardworks/nexus-core';
 import type { EngineDesign } from '@shardworks/fabricator-apparatus';
+import type { AnimatorApi } from '@shardworks/animator-apparatus';
+import type { WritDoc } from '@shardworks/clerk-apparatus';
+import type { DraftYields, ReviewYields } from '../types.ts';
+
+const execFileAsync = promisify(execFile);
+
+async function gitStatus(cwd: string): Promise<string> {
+  try {
+    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
+    return stdout;
+  } catch {
+    return '';
+  }
+}
+
+async function gitDiffUncommitted(cwd: string): Promise<string> {
+  try {
+    const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd });
+    return stdout;
+  } catch {
+    return '';
+  }
+}
+
+function assembleRevisionPrompt(writ: WritDoc, review: ReviewYields, status: string, diff: string): string {
+  const reviewResult = review.passed ? 'PASS' : 'FAIL';
+  const instructions = review.passed
+    ? `The review passed. No changes are required. Confirm the work looks correct\nand exit. Do not make unnecessary changes or spend unnecessary time reassessing.`
+    : `The review identified issues that need to be addressed. See "Required Changes"\nin the findings above. Address each item, then commit your changes.`;
+
+  const diffSection = diff.trim()
+    ? `\`\`\`diff\n${diff}\n\`\`\``
+    : '(No uncommitted changes.)';
+
+  return `# Revision Pass
+
+You are revising prior work on a commission based on review findings.
+
+## The Commission (Spec)
+
+${writ.body}
+
+## Review Findings
+
+${review.findings}
+
+## Review Result: ${reviewResult}
+
+${instructions}
+
+## Current State
+
+\`\`\`
+${status}
+\`\`\`
+
+${diffSection}
+
+Commit all changes before ending your session.`;
+}
 
 const reviseEngine: EngineDesign = {
   id: 'revise',
 
-  async run(_givens, _context) {
-    return {
-      status: 'completed',
-      yields: {
-        sessionId: 'stub',
-        sessionStatus: 'completed',
-      },
-    };
+  async run(givens, context) {
+    const animator = guild().apparatus<AnimatorApi>('animator');
+    const writ = givens.writ as WritDoc;
+    const draft = context.upstream['draft'] as DraftYields;
+    const review = context.upstream['review'] as ReviewYields;
+
+    const status = await gitStatus(draft.path);
+    const diff = await gitDiffUncommitted(draft.path);
+    const prompt = assembleRevisionPrompt(writ, review, status, diff);
+
+    const handle = animator.summon({
+      role: givens.role as string,
+      prompt,
+      cwd: draft.path,
+      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
+      metadata: { engineId: context.engineId, writId: writ.id },
+    });
+
+    const sessionResult = await handle.result;
+    return { status: 'launched', sessionId: sessionResult.id };
   },
 };
 
diff --git a/packages/plugins/walker/src/types.ts b/packages/plugins/walker/src/types.ts
index e361c74..31dad0f 100644
--- a/packages/plugins/walker/src/types.ts
+++ b/packages/plugins/walker/src/types.ts
@@ -174,6 +174,47 @@ export interface ImplementYields {
   sessionStatus: 'completed' | 'failed';
 }
 
+/**
+ * A single mechanical check (build or test) run by the review engine
+ * before launching the reviewer session.
+ */
+export interface MechanicalCheck {
+  /** Check name. */
+  name: 'build' | 'test';
+  /** Whether the command exited with code 0. */
+  passed: boolean;
+  /** Combined stdout+stderr, truncated to 4KB. */
+  output: string;
+  /** Wall-clock duration of the check in milliseconds. */
+  durationMs: number;
+}
+
+/**
+ * Yields from the `review` quick engine.
+ * Assembled by the Walker's collect step from session.output and session.metadata.
+ */
+export interface ReviewYields {
+  /** The Animator session id. */
+  sessionId: string;
+  /** Reviewer's overall assessment — true if the review passed. */
+  passed: boolean;
+  /** Structured markdown findings from the reviewer's final message. */
+  findings: string;
+  /** Mechanical check results run before the reviewer session. */
+  mechanicalChecks: MechanicalCheck[];
+}
+
+/**
+ * Yields from the `revise` quick engine.
+ * Set by the Walker's collect step when the Animator session completes.
+ */
+export interface ReviseYields {
+  /** The Animator session id. */
+  sessionId: string;
+  /** Terminal status of the session. */
+  sessionStatus: 'completed' | 'failed';
+}
+
 // Augment GuildConfig so `guild().guildConfig().walker` is typed.
 declare module '@shardworks/nexus-core' {
   interface GuildConfig {
diff --git a/packages/plugins/walker/src/walker.test.ts b/packages/plugins/walker/src/walker.test.ts
index df29c80..bbf58a4 100644
--- a/packages/plugins/walker/src/walker.test.ts
+++ b/packages/plugins/walker/src/walker.test.ts
@@ -26,7 +26,7 @@ import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparat
 import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';
 
 import { createWalker } from './walker.ts';
-import type { WalkerApi, RigDoc, EngineInstance } from './types.ts';
+import type { WalkerApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';
 
 // ── Test bootstrap ────────────────────────────────────────────────────
 
@@ -59,7 +59,7 @@ function buildCtx(): {
  */
 function buildFixture(
   guildConfig: Partial<GuildConfig> = {},
-  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string } = { status: 'completed' },
+  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string; output?: string } = { status: 'completed' },
 ): {
   stacks: StacksApi;
   clerk: ClerkApi;
@@ -68,7 +68,7 @@ function buildFixture(
   memBackend: InstanceType<typeof MemoryBackend>;
   fire: (event: string, ...args: unknown[]) => Promise<void>;
   summonCalls: SummonRequest[];
-  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string }) => void;
+  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) => void;
 } {
   const memBackend = new MemoryBackend();
   const stacksPlugin = createStacksApparatus(memBackend);
@@ -153,6 +153,7 @@ function buildFixture(
           provider: 'mock',
           exitCode: outcome.status === 'completed' ? 0 : 1,
           ...(outcome.error ? { error: outcome.error } : {}),
+          ...(outcome.output !== undefined ? { output: outcome.output } : {}),
           metadata: request.metadata,
         };
         await sessBook.put(doc);
@@ -165,6 +166,7 @@ function buildFixture(
           provider: 'mock',
           exitCode: outcome.status === 'completed' ? 0 : 1,
           ...(outcome.error ? { error: outcome.error } : {}),
+          ...(outcome.output !== undefined ? { output: outcome.output } : {}),
           metadata: request.metadata,
         } as SessionResult;
       })();
@@ -208,7 +210,7 @@ function buildFixture(
   return {
     stacks, clerk, fabricator, walker, memBackend, fire,
     summonCalls,
-    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string }) {
+    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) {
       currentSessionOutcome = outcome;
     },
   };
@@ -848,7 +850,7 @@ describe('Walker', () => {
       const [rig] = await book.list();
 
       // Mark draft + implement as completed
-      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' };
+      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
       const implYields = { sessionId: 'stub', sessionStatus: 'completed' };
       const updatedEngines = rig.engines.map((e: EngineInstance) => {
         if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
@@ -857,17 +859,22 @@ describe('Walker', () => {
       });
       await book.patch(rig.id, { engines: updatedEngines });
 
-      // Walk: review runs — stub clockwork (no external deps)
+      // Walk: review launches a session (quick engine → 'engine-started')
       const result = await walker.walk();
-      assert.equal(result?.action, 'engine-completed');
+      assert.equal(result?.action, 'engine-started');
       assert.equal((result as { engineId: string }).engineId, 'review');
+
+      // Walk: collect step picks up the completed review session
+      const result2 = await walker.walk();
+      assert.equal(result2?.action, 'engine-completed');
+      assert.equal((result2 as { engineId: string }).engineId, 'review');
     });
   });
 
-  // ── Full stub pipeline ─────────────────────────────────────────────
+  // ── Full pipeline ─────────────────────────────────────────────────
 
-  describe('full pipeline with stubs', () => {
-    it('walks through implement → review → revise stubs → rig completion → writ completed', async () => {
+  describe('full pipeline', () => {
+    it('walks through implement → review → revise → rig completion → writ completed', async () => {
       const { clerk, walker, stacks } = fix;
       const writ = await postWrit(clerk, 'Full pipeline test');
 
@@ -894,16 +901,26 @@ describe('Walker', () => {
       assert.equal(r1c?.action, 'engine-completed');
       assert.equal((r1c as { engineId: string }).engineId, 'implement');
 
-      // Walk: review runs (stub → completed)
+      // Walk: review launches a session (quick engine)
       const r2 = await walker.walk();
-      assert.equal(r2?.action, 'engine-completed');
+      assert.equal(r2?.action, 'engine-started');
       assert.equal((r2 as { engineId: string }).engineId, 'review');
 
-      // Walk: revise runs (stub → completed)
+      // Walk: collect review session
+      const r2c = await walker.walk();
+      assert.equal(r2c?.action, 'engine-completed');
+      assert.equal((r2c as { engineId: string }).engineId, 'review');
+
+      // Walk: revise launches a session (quick engine)
       const r3 = await walker.walk();
-      assert.equal(r3?.action, 'engine-completed');
+      assert.equal(r3?.action, 'engine-started');
       assert.equal((r3 as { engineId: string }).engineId, 'revise');
 
+      // Walk: collect revise session
+      const r3c = await walker.walk();
+      assert.equal(r3c?.action, 'engine-completed');
+      assert.equal((r3c as { engineId: string }).engineId, 'revise');
+
       // Pre-complete seal (real impl would need codexes)
       const [rig3] = await book.list();
       const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 5 };
@@ -972,16 +989,26 @@ describe('Walker', () => {
       assert.equal(r1c?.action, 'engine-completed');
       assert.equal((r1c as { engineId: string }).engineId, 'implement');
 
-      // review runs (stub)
+      // review launches (quick engine)
       const r2 = await walker.walk();
-      assert.equal(r2?.action, 'engine-completed');
+      assert.equal(r2?.action, 'engine-started');
       assert.equal((r2 as { engineId: string }).engineId, 'review');
 
-      // revise runs (stub)
+      // collect review
+      const r2c = await walker.walk();
+      assert.equal(r2c?.action, 'engine-completed');
+      assert.equal((r2c as { engineId: string }).engineId, 'review');
+
+      // revise launches (quick engine)
       const r3 = await walker.walk();
-      assert.equal(r3?.action, 'engine-completed');
+      assert.equal(r3?.action, 'engine-started');
       assert.equal((r3 as { engineId: string }).engineId, 'revise');
 
+      // collect revise
+      const r3c = await walker.walk();
+      assert.equal(r3c?.action, 'engine-completed');
+      assert.equal((r3c as { engineId: string }).engineId, 'revise');
+
       // seal runs (stub) — last engine → rig completes
       const r4 = await walker.walk();
       assert.equal(r4?.action, 'rig-completed');
@@ -996,6 +1023,386 @@ describe('Walker', () => {
     });
   });
 
+  // ── Review engine — Animator integration ─────────────────────────
+
+  describe('review engine — Animator integration', () => {
+    it('calls animator.summon() with reviewer role, draft cwd, and prompt containing spec', async () => {
+      const { clerk, walker, stacks, summonCalls } = fix;
+      const writ = await postWrit(clerk, 'Review integration test');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          return e;
+        }),
+      });
+
+      const result = await walker.walk(); // launch review
+      assert.equal(result?.action, 'engine-started');
+      assert.equal((result as { engineId: string }).engineId, 'review');
+
+      assert.equal(summonCalls.length, 1, 'summon should be called once for review');
+      const call = summonCalls[0];
+      assert.equal(call.role, 'reviewer', 'review engine uses reviewer role');
+      assert.equal(call.cwd, '/p', 'cwd is the draft worktree path');
+      assert.ok(call.prompt.includes('# Code Review'), 'prompt includes review header');
+      assert.ok(call.prompt.includes(writ.body), 'prompt includes writ body (spec)');
+      assert.ok(call.prompt.includes('## Instructions'), 'prompt includes instructions section');
+      assert.ok(call.prompt.includes('### Overall: PASS or FAIL'), 'prompt includes findings format');
+      assert.deepEqual(call.metadata?.mechanicalChecks, [], 'no mechanical checks when not configured');
+    });
+
+    it('collects ReviewYields: parses PASS from session.output', async () => {
+      const { clerk, walker, stacks } = fix;
+      await postWrit(clerk);
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const fakeSessionId = generateId('ses', 4);
+      const findings = '### Overall: PASS\n\n### Completeness\nAll requirements met.';
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
+          return e;
+        }),
+      });
+
+      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
+      await sessBook.put({
+        id: fakeSessionId,
+        status: 'completed',
+        startedAt: new Date().toISOString(),
+        provider: 'test',
+        output: findings,
+        metadata: { mechanicalChecks: [] },
+      });
+
+      const result = await walker.walk(); // collect review
+      assert.equal(result?.action, 'engine-completed');
+      assert.equal((result as { engineId: string }).engineId, 'review');
+
+      const [updated] = await book.list();
+      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
+      const yields = reviewEngine?.yields as ReviewYields;
+      assert.equal(yields.sessionId, fakeSessionId);
+      assert.equal(yields.passed, true, 'passed should be true when output contains PASS');
+      assert.equal(yields.findings, findings);
+      assert.deepEqual(yields.mechanicalChecks, []);
+    });
+
+    it('collects ReviewYields: passed is false when output contains FAIL', async () => {
+      const { clerk, walker, stacks } = fix;
+      await postWrit(clerk);
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const fakeSessionId = generateId('ses', 4);
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
+          return e;
+        }),
+      });
+
+      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
+      await sessBook.put({
+        id: fakeSessionId,
+        status: 'completed',
+        startedAt: new Date().toISOString(),
+        provider: 'test',
+        output: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
+        metadata: { mechanicalChecks: [] },
+      });
+
+      await walker.walk(); // collect review
+      const [updated] = await book.list();
+      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
+      const yields = reviewEngine?.yields as ReviewYields;
+      assert.equal(yields.passed, false, 'passed should be false when output contains FAIL');
+    });
+
+    it('collects ReviewYields: mechanicalChecks retrieved from session.metadata', async () => {
+      const { clerk, walker, stacks } = fix;
+      await postWrit(clerk);
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const fakeSessionId = generateId('ses', 4);
+      const checks: MechanicalCheck[] = [
+        { name: 'build', passed: true, output: 'Build succeeded', durationMs: 1200 },
+        { name: 'test', passed: false, output: '3 tests failed', durationMs: 4500 },
+      ];
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
+          return e;
+        }),
+      });
+
+      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
+      await sessBook.put({
+        id: fakeSessionId,
+        status: 'completed',
+        startedAt: new Date().toISOString(),
+        provider: 'test',
+        output: '### Overall: FAIL',
+        metadata: { mechanicalChecks: checks },
+      });
+
+      await walker.walk(); // collect review
+      const [updated] = await book.list();
+      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
+      const yields = reviewEngine?.yields as ReviewYields;
+      assert.equal(yields.mechanicalChecks.length, 2);
+      assert.equal(yields.mechanicalChecks[0].name, 'build');
+      assert.equal(yields.mechanicalChecks[0].passed, true);
+      assert.equal(yields.mechanicalChecks[1].name, 'test');
+      assert.equal(yields.mechanicalChecks[1].passed, false);
+    });
+  });
+
+  // ── Review engine — mechanical checks ────────────────────────────
+
+  describe('review engine — mechanical checks', () => {
+    let mechFix: ReturnType<typeof buildFixture>;
+
+    beforeEach(() => {
+      mechFix = buildFixture({
+        walker: {
+          buildCommand: 'echo "build output"',
+          testCommand: 'exit 1',
+        },
+      });
+    });
+
+    afterEach(() => {
+      clearGuild();
+    });
+
+    it('executes build and test commands; captures pass/fail from exit code', async () => {
+      const { clerk, walker, stacks, summonCalls } = mechFix;
+      await postWrit(clerk);
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          return e;
+        }),
+      });
+
+      const result = await walker.walk(); // launch review (runs checks first)
+      assert.equal(result?.action, 'engine-started');
+
+      assert.equal(summonCalls.length, 1);
+      const checks = summonCalls[0].metadata?.mechanicalChecks as MechanicalCheck[];
+      assert.equal(checks.length, 2, 'both build and test checks should run');
+
+      const buildCheck = checks.find((c) => c.name === 'build');
+      assert.ok(buildCheck, 'build check should be present');
+      assert.equal(buildCheck!.passed, true, 'echo exits 0 → passed');
+      assert.ok(buildCheck!.output.includes('build output'), 'output captured from stdout');
+      assert.ok(typeof buildCheck!.durationMs === 'number', 'durationMs recorded');
+
+      const testCheck = checks.find((c) => c.name === 'test');
+      assert.ok(testCheck, 'test check should be present');
+      assert.equal(testCheck!.passed, false, 'exit 1 → failed');
+    });
+
+    it('skips checks gracefully when no buildCommand or testCommand configured', async () => {
+      const noCmdFix = buildFixture({ walker: {} }); // no buildCommand/testCommand
+      const { clerk, walker: w, stacks: s, summonCalls: sc } = noCmdFix;
+      await postWrit(clerk);
+      await w.walk(); // spawn
+
+      const book = rigsBook(s);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          return e;
+        }),
+      });
+
+      await w.walk(); // launch review
+      assert.deepEqual(sc[0].metadata?.mechanicalChecks, [], 'no checks when commands not configured');
+      clearGuild();
+    });
+
+    it('truncates check output to 4KB', async () => {
+      const bigFix = buildFixture({
+        walker: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
+      });
+      const { clerk, walker: w, stacks: s, summonCalls: sc } = bigFix;
+      await postWrit(clerk);
+      await w.walk(); // spawn
+
+      const book = rigsBook(s);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          return e;
+        }),
+      });
+
+      await w.walk(); // launch review (runs check with big output)
+      const checks = sc[0].metadata?.mechanicalChecks as MechanicalCheck[];
+      assert.ok(checks[0].output.length <= 4096, `output should be truncated to 4KB, got ${checks[0].output.length} chars`);
+      clearGuild();
+    });
+  });
+
+  // ── Revise engine — Animator integration ─────────────────────────
+
+  describe('revise engine — Animator integration', () => {
+    it('calls animator.summon() with role from givens, draft cwd, and writ env', async () => {
+      const { clerk, walker, stacks, summonCalls } = fix;
+      const writ = await postWrit(clerk, 'Revise integration test');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS\nAll good.', mechanicalChecks: [] };
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
+          return e;
+        }),
+      });
+
+      const result = await walker.walk(); // launch revise
+      assert.equal(result?.action, 'engine-started');
+      assert.equal((result as { engineId: string }).engineId, 'revise');
+
+      assert.equal(summonCalls.length, 1, 'summon called once for revise');
+      const call = summonCalls[0];
+      assert.equal(call.role, 'artificer', 'revise uses role from givens (default artificer)');
+      assert.equal(call.cwd, '/p', 'cwd is draft worktree path');
+      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
+    });
+
+    it('revision prompt includes pass branch when review passed', async () => {
+      const { clerk, walker, stacks, summonCalls } = fix;
+      await postWrit(clerk, 'Pass branch test');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const reviewYields: ReviewYields = {
+        sessionId: 'rev-1',
+        passed: true,
+        findings: '### Overall: PASS\nAll requirements met.',
+        mechanicalChecks: [],
+      };
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
+          return e;
+        }),
+      });
+
+      await walker.walk(); // launch revise
+      const prompt = summonCalls[0].prompt;
+      assert.ok(prompt.includes('## Review Result: PASS'), 'prompt includes PASS result');
+      assert.ok(prompt.includes('The review passed'), 'prompt includes pass branch instruction');
+      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
+    });
+
+    it('revision prompt includes fail branch when review failed', async () => {
+      const { clerk, walker, stacks, summonCalls } = fix;
+      await postWrit(clerk, 'Fail branch test');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const reviewYields: ReviewYields = {
+        sessionId: 'rev-1',
+        passed: false,
+        findings: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
+        mechanicalChecks: [],
+      };
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
+          return e;
+        }),
+      });
+
+      await walker.walk(); // launch revise
+      const prompt = summonCalls[0].prompt;
+      assert.ok(prompt.includes('## Review Result: FAIL'), 'prompt includes FAIL result');
+      assert.ok(
+        prompt.includes('The review identified issues that need to be addressed'),
+        'prompt includes fail branch instruction',
+      );
+      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
+    });
+
+    it('ReviseYields: sessionId and sessionStatus collected from session record', async () => {
+      const { clerk, walker, stacks } = fix;
+      await postWrit(clerk);
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      const fakeSessionId = generateId('ses', 4);
+      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS', mechanicalChecks: [] };
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) => {
+          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
+          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
+          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
+          if (e.id === 'revise') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
+          return e;
+        }),
+      });
+
+      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
+      await sessBook.put({
+        id: fakeSessionId,
+        status: 'completed',
+        startedAt: new Date().toISOString(),
+        provider: 'test',
+      });
+
+      const result = await walker.walk(); // collect revise
+      assert.equal(result?.action, 'engine-completed');
+      assert.equal((result as { engineId: string }).engineId, 'revise');
+
+      const [updated] = await book.list();
+      const reviseEngine = updated.engines.find((e: EngineInstance) => e.id === 'revise');
+      const yields = reviseEngine?.yields as { sessionId: string; sessionStatus: string };
+      assert.equal(yields.sessionId, fakeSessionId);
+      assert.equal(yields.sessionStatus, 'completed');
+    });
+  });
+
   // ── Walk returns null ──────────────────────────────────────────────
 
   describe('walk() returns null', () => {
diff --git a/packages/plugins/walker/src/walker.ts b/packages/plugins/walker/src/walker.ts
index 17bf2fc..62c2a9b 100644
--- a/packages/plugins/walker/src/walker.ts
+++ b/packages/plugins/walker/src/walker.ts
@@ -165,12 +165,22 @@ export function createWalker(): Plugin {
           return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
         }
 
-        // Completed session — assemble yields from session record.
-        const yields: Record<string, unknown> = {
-          sessionId: session.id,
-          sessionStatus: session.status,
-          ...(session.output !== undefined ? { output: session.output } : {}),
-        };
+        // Completed session — assemble engine-specific yields from session record.
+        let yields: Record<string, unknown>;
+        if (engine.id === 'review') {
+          // Review collect: parse findings and passed flag from session output;
+          // retrieve mechanicalChecks stashed in session metadata by the review engine.
+          const findings = session.output ?? '';
+          const passed = /^###\s*Overall:\s*PASS/mi.test(findings);
+          const mechanicalChecks = (session.metadata?.mechanicalChecks as unknown[]) ?? [];
+          yields = { sessionId: session.id, passed, findings, mechanicalChecks };
+        } else {
+          yields = {
+            sessionId: session.id,
+            sessionStatus: session.status,
+            ...(session.output !== undefined ? { output: session.output } : {}),
+          };
+        }
 
         if (!isJsonSerializable(yields)) {
           await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
```
```

## Full File Contents (for context)


=== FILE: packages/plugins/walker/src/engines/review.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Walker's collect step
 * can parse the reviewer's findings from session.output on subsequent walks.
 *
 * Collect step (Walker):
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields, MechanicalCheck } from '../types.ts';

const execFileAsync = promisify(execFile);

async function runCheck(name: 'build' | 'test', command: string, cwd: string): Promise<MechanicalCheck> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], { cwd });
    const output = (stdout + stderr).slice(0, 4096);
    return { name, passed: true, output, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    const output = ((execErr.stdout ?? '') + (execErr.stderr ?? '')).slice(0, 4096);
    return { name, passed: false, output, durationMs: Date.now() - start };
  }
}

async function gitDiff(cwd: string, baseSha: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', `${baseSha}..HEAD`], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

async function gitStatus(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

function assembleReviewPrompt(writ: WritDoc, diff: string, status: string, checks: MechanicalCheck[]): string {
  const checksSection = checks.length === 0
    ? '(No mechanical checks configured.)'
    : checks.map((c) => `### ${c.name}: ${c.passed ? 'PASSED' : 'FAILED'}\n\`\`\`\n${c.output}\n\`\`\``).join('\n\n');

  return `# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

${writ.body}

## Implementation Diff

Changes since the draft was opened:

\`\`\`diff
${diff}
\`\`\`

## Current Worktree State

\`\`\`
${status}
\`\`\`

## Mechanical Check Results

${checksSection}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.`;
}

const reviewEngine: EngineDesign = {
  id: 'review',

  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;

    // 1. Run mechanical checks synchronously before the reviewer session
    const checks: MechanicalCheck[] = [];
    if (givens.buildCommand) {
      checks.push(await runCheck('build', givens.buildCommand as string, draft.path));
    }
    if (givens.testCommand) {
      checks.push(await runCheck('test', givens.testCommand as string, draft.path));
    }

    // 2. Compute diff since draft opened and current worktree state
    const diff = await gitDiff(draft.path, draft.baseSha);
    const status = await gitStatus(draft.path);

    // 3. Assemble review prompt
    const prompt = assembleReviewPrompt(writ, diff, status, checks);

    // 4. Launch reviewer session — stash mechanicalChecks in metadata for collect step
    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      metadata: {
        engineId: context.engineId,
        writId: writ.id,
        mechanicalChecks: checks,
      },
    });

    const sessionResult = await handle.result;
    return { status: 'launched', sessionId: sessionResult.id };
  },
};

export default reviewEngine;

=== FILE: packages/plugins/walker/src/engines/revise.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Walker's collect step
 * can store ReviseYields on completion.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields, ReviewYields } from '../types.ts';

const execFileAsync = promisify(execFile);

async function gitStatus(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

async function gitDiffUncommitted(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

function assembleRevisionPrompt(writ: WritDoc, review: ReviewYields, status: string, diff: string): string {
  const reviewResult = review.passed ? 'PASS' : 'FAIL';
  const instructions = review.passed
    ? `The review passed. No changes are required. Confirm the work looks correct\nand exit. Do not make unnecessary changes or spend unnecessary time reassessing.`
    : `The review identified issues that need to be addressed. See "Required Changes"\nin the findings above. Address each item, then commit your changes.`;

  const diffSection = diff.trim()
    ? `\`\`\`diff\n${diff}\n\`\`\``
    : '(No uncommitted changes.)';

  return `# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

${writ.body}

## Review Findings

${review.findings}

## Review Result: ${reviewResult}

${instructions}

## Current State

\`\`\`
${status}
\`\`\`

${diffSection}

Commit all changes before ending your session.`;
}

const reviseEngine: EngineDesign = {
  id: 'revise',

  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;
    const review = context.upstream['review'] as ReviewYields;

    const status = await gitStatus(draft.path);
    const diff = await gitDiffUncommitted(draft.path);
    const prompt = assembleRevisionPrompt(writ, review, status, diff);

    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
      metadata: { engineId: context.engineId, writId: writ.id },
    });

    const sessionResult = await handle.result;
    return { status: 'launched', sessionId: sessionResult.id };
  },
};

export default reviseEngine;

=== FILE: packages/plugins/walker/src/types.ts ===
/**
 * The Walker — public types.
 *
 * Rig and engine data model, WalkResult, WalkerApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */

// ── Engine instance status ────────────────────────────────────────────

export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';

// ── Engine instance ───────────────────────────────────────────────────

/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Walker assembles `givens` from this directly; upstream yields arrive
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

// ── Rig ──────────────────────────────────────────────────────────────

export type RigStatus = 'running' | 'completed' | 'failed';

/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`walker/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Walker updates this document
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
}

// ── WalkResult ────────────────────────────────────────────────────────

/**
 * The result of a single walk() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the walk step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type WalkResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' };

// ── WalkerApi ─────────────────────────────────────────────────────────

/**
 * The Walker's public API — retrieved via guild().apparatus<WalkerApi>('walker').
 */
export interface WalkerApi {
  /**
   * Execute one step of the walk loop.
   *
   * Priority ordering: collect > run > spawn.
   * Returns null when no work is available.
   */
  walk(): Promise<WalkResult | null>;
}

// ── Configuration ─────────────────────────────────────────────────────

/**
 * Walker apparatus configuration — lives under the `walker` key in guild.json.
 */
export interface WalkerConfig {
  /**
   * Role to summon for quick engine sessions.
   * Default: 'artificer'.
   */
  role?: string;
  /**
   * Polling interval for walkContinual tool (milliseconds).
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

// ── Engine yield shapes ───────────────────────────────────────────────

/**
 * Yields from the `draft` clockwork engine.
 * The Walker stores these in the engine instance and passes them
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
 * Set by the Walker's collect step when the Animator session completes.
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
 * Assembled by the Walker's collect step from session.output and session.metadata.
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
 * Set by the Walker's collect step when the Animator session completes.
 */
export interface ReviseYields {
  /** The Animator session id. */
  sessionId: string;
  /** Terminal status of the session. */
  sessionStatus: 'completed' | 'failed';
}

// Augment GuildConfig so `guild().guildConfig().walker` is typed.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    walker?: WalkerConfig;
  }
}

=== FILE: packages/plugins/walker/src/walker.test.ts ===
/**
 * Walker — unit tests.
 *
 * Tests rig lifecycle, walk priority ordering, engine execution (clockwork
 * and quick), failure propagation, and CDC-driven writ transitions.
 *
 * Uses in-memory Stacks backend and mock Guild singleton.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild, generateId } from '@shardworks/nexus-core';
import type { Guild, GuildConfig, LoadedKit, LoadedApparatus, StartupContext } from '@shardworks/nexus-core';

import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createClerk } from '@shardworks/clerk-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';

import { createFabricator } from '@shardworks/fabricator-apparatus';
import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparatus';

import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';

import { createWalker } from './walker.ts';
import type { WalkerApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';

// ── Test bootstrap ────────────────────────────────────────────────────

/**
 * Build a minimal StartupContext that captures and fires events.
 */
function buildCtx(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();
  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }
  return { ctx, fire };
}

/**
 * Full integration fixture: starts Stacks (memory), Clerk, Fabricator,
 * and Walker. Returns handles to each API plus mock animator controls.
 */
function buildFixture(
  guildConfig: Partial<GuildConfig> = {},
  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string; output?: string } = { status: 'completed' },
): {
  stacks: StacksApi;
  clerk: ClerkApi;
  fabricator: FabricatorApi;
  walker: WalkerApi;
  memBackend: InstanceType<typeof MemoryBackend>;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
  summonCalls: SummonRequest[];
  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) => void;
} {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const clerkPlugin = createClerk();
  const fabricatorPlugin = createFabricator();
  const walkerPlugin = createWalker();

  if (!('apparatus' in stacksPlugin)) throw new Error('stacks must be apparatus');
  if (!('apparatus' in clerkPlugin)) throw new Error('clerk must be apparatus');
  if (!('apparatus' in fabricatorPlugin)) throw new Error('fabricator must be apparatus');
  if (!('apparatus' in walkerPlugin)) throw new Error('walker must be apparatus');

  const stacksApparatus = stacksPlugin.apparatus;
  const clerkApparatus = clerkPlugin.apparatus;
  const fabricatorApparatus = fabricatorPlugin.apparatus;
  const walkerApparatus = walkerPlugin.apparatus;

  const apparatusMap = new Map<string, unknown>();

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    ...guildConfig,
  };

  const fakeGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not found`);
      return api as T;
    },
    config<T>(_pluginId: string): T { return {} as T; },
    writeConfig() {},
    guildConfig() { return fakeGuildConfig; },
    kits(): LoadedKit[] { return []; },
    apparatuses(): LoadedApparatus[] { return []; },
  };

  setGuild(fakeGuild);

  // Start stacks with memory backend
  const noopCtx = { on: () => {} };
  stacksApparatus.start(noopCtx);
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Manually ensure all books the Walker and Clerk need
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  });
  memBackend.ensureBook({ ownerId: 'walker', book: 'rigs' }, {
    indexes: ['status', 'writId', ['status', 'writId']],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status'],
  });

  // Mock animator — captures summon() calls and writes session docs to Stacks.
  // The implement engine awaits handle.result to get the session id; the mock
  // writes a terminal session record before resolving so the Walker's collect
  // step finds it on the next walk() call.
  let currentSessionOutcome = initialSessionOutcome;
  const summonCalls: SummonRequest[] = [];
  const mockAnimatorApi: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      summonCalls.push(request);
      const sessionId = generateId('ses', 4);
      const startedAt = new Date().toISOString();
      const outcome = currentSessionOutcome;

      const result = (async (): Promise<SessionResult> => {
        const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
        const endedAt = new Date().toISOString();
        const doc: SessionDoc = {
          id: sessionId,
          status: outcome.status,
          startedAt,
          endedAt,
          durationMs: 0,
          provider: 'mock',
          exitCode: outcome.status === 'completed' ? 0 : 1,
          ...(outcome.error ? { error: outcome.error } : {}),
          ...(outcome.output !== undefined ? { output: outcome.output } : {}),
          metadata: request.metadata,
        };
        await sessBook.put(doc);
        return {
          id: sessionId,
          status: outcome.status,
          startedAt,
          endedAt,
          durationMs: 0,
          provider: 'mock',
          exitCode: outcome.status === 'completed' ? 0 : 1,
          ...(outcome.error ? { error: outcome.error } : {}),
          ...(outcome.output !== undefined ? { output: outcome.output } : {}),
          metadata: request.metadata,
        } as SessionResult;
      })();

      async function* emptyChunks(): AsyncIterable<SessionChunk> {}
      return { chunks: emptyChunks(), result };
    },
    animate(): AnimateHandle {
      throw new Error('animate() not used in Walker tests');
    },
  };
  apparatusMap.set('animator', mockAnimatorApi);

  // Start clerk
  clerkApparatus.start(noopCtx);
  const clerk = clerkApparatus.provides as ClerkApi;
  apparatusMap.set('clerk', clerk);

  // Start fabricator with its own ctx so we can fire events
  const { ctx: fabricatorCtx, fire } = buildCtx();
  fabricatorApparatus.start(fabricatorCtx);
  const fabricator = fabricatorApparatus.provides as FabricatorApi;
  apparatusMap.set('fabricator', fabricator);

  // Start walker
  walkerApparatus.start(noopCtx);
  const walker = walkerApparatus.provides as WalkerApi;
  apparatusMap.set('walker', walker);

  // Simulate plugin:initialized for the Walker so the Fabricator scans
  // its supportKit and picks up the five engine designs.
  const walkerLoaded: LoadedApparatus = {
    packageName: '@shardworks/walker-apparatus',
    id: 'walker',
    version: '0.0.0',
    apparatus: walkerApparatus,
  };
  // Fire synchronously — fabricator's handler is sync
  void fire('plugin:initialized', walkerLoaded);

  return {
    stacks, clerk, fabricator, walker, memBackend, fire,
    summonCalls,
    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) {
      currentSessionOutcome = outcome;
    },
  };
}

/** Get the rigs book. */
function rigsBook(stacks: StacksApi) {
  return stacks.book<RigDoc>('walker', 'rigs');
}

/** Post a writ. */
async function postWrit(clerk: ClerkApi, title = 'Test writ', codex?: string): Promise<WritDoc> {
  return clerk.post({ title, body: 'Test body', codex });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Walker', () => {
  let fix: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    fix = buildFixture();
  });

  afterEach(() => {
    clearGuild();
  });

  // ── Fabricator integration ─────────────────────────────────────────

  describe('Fabricator — Walker engine registration', () => {
    it('registers all five engine designs in the Fabricator', () => {
      const { fabricator } = fix;
      assert.ok(fabricator.getEngineDesign('draft'), 'draft engine registered');
      assert.ok(fabricator.getEngineDesign('implement'), 'implement engine registered');
      assert.ok(fabricator.getEngineDesign('review'), 'review engine registered');
      assert.ok(fabricator.getEngineDesign('revise'), 'revise engine registered');
      assert.ok(fabricator.getEngineDesign('seal'), 'seal engine registered');
    });

    it('returns undefined for an unknown engine ID', () => {
      assert.equal(fix.fabricator.getEngineDesign('nonexistent'), undefined);
    });
  });

  // ── walk() idle ────────────────────────────────────────────────────

  describe('walk() — idle', () => {
    it('returns null when there is no work', async () => {
      const result = await fix.walker.walk();
      assert.equal(result, null);
    });
  });

  // ── Spawn ──────────────────────────────────────────────────────────

  describe('walk() — spawn', () => {
    it('spawns a rig for a ready writ and transitions writ to active', async () => {
      const { clerk, walker, stacks } = fix;
      const writ = await postWrit(clerk);
      assert.equal(writ.status, 'ready');

      const result = await walker.walk();
      assert.ok(result !== null, 'expected a walk result');
      assert.equal(result.action, 'rig-spawned');
      assert.equal((result as { writId: string }).writId, writ.id);

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
      assert.equal(rigs[0].writId, writ.id);
      assert.equal(rigs[0].status, 'running');
      assert.equal(rigs[0].engines.length, 5);

      // Writ should now be active
      const updatedWrit = await clerk.show(writ.id);
      assert.equal(updatedWrit.status, 'active');
    });

    it('does not spawn a second rig for a writ that already has one', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);

      await walker.walk(); // spawns rig

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1, 'only one rig should exist');
    });

    it('spawns rigs for the oldest ready writ first (FIFO)', async () => {
      const { clerk, walker } = fix;

      // Small delay to ensure different createdAt timestamps
      const w1 = await postWrit(clerk, 'First writ');
      await new Promise((r) => setTimeout(r, 2));
      const w2 = await postWrit(clerk, 'Second writ');

      const r1 = await walker.walk();
      assert.equal(r1?.action, 'rig-spawned');
      assert.equal((r1 as { writId: string }).writId, w1.id);

      // Mark rig1 as failed so w2 can spawn
      const rigs = await rigsBook(fix.stacks).list();
      await rigsBook(fix.stacks).patch(rigs[0].id, { status: 'failed' });

      const r2 = await walker.walk();
      assert.equal(r2?.action, 'rig-spawned');
      assert.equal((r2 as { writId: string }).writId, w2.id);
    });
  });

  // ── Priority ordering ──────────────────────────────────────────────

  describe('walk() — priority ordering: collect > run > spawn', () => {
    it('runs before spawning when a rig already exists', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);

      // Spawn the rig
      const r1 = await walker.walk();
      assert.equal(r1?.action, 'rig-spawned');

      // Second walk should run (not spawn another rig)
      // The draft engine will fail (no codexes), resulting in 'rig-completed'
      const r2 = await walker.walk();
      assert.notEqual(r2?.action, 'rig-spawned');
      // Only one rig created
      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
    });

    it('collects before running when a running engine has a terminal session', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Set draft to running with a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
          : e,
      );
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session
      const sessBook = stacks.book<{ id: string; status: string; startedAt: string; provider: string; [key: string]: unknown }>('animator', 'sessions');
      await sessBook.put({ id: fakeSessionId, status: 'completed', startedAt: new Date().toISOString(), provider: 'test' });

      // Walk should collect (not run implement which has no completed upstream)
      const r = await walker.walk();
      assert.equal(r?.action, 'engine-completed');
      assert.equal((r as { engineId: string }).engineId, 'draft');
    });
  });

  // ── Engine readiness ───────────────────────────────────────────────

  describe('engine readiness — upstream must complete first', () => {
    it('only the first engine (no upstream) is runnable initially', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const [rig] = await rigsBook(stacks).list();

      // All engines except draft should have upstream
      const draft = rig.engines.find((e: EngineInstance) => e.id === 'draft');
      const implement = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.deepEqual(draft?.upstream, []);
      assert.deepEqual(implement?.upstream, ['draft']);
    });

    it('implement only launches after draft is completed', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft as completed
      const updatedEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig.id, { engines: updatedEngines });

      // Now walk should launch implement (quick engine → 'engine-started', not 'engine-completed')
      const result = await walker.walk();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');
    });
  });

  // ── Quick engine execution (implement) ────────────────────────────

  describe('implement engine execution', () => {
    it('launches session on first walk, then collects yields on second walk', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft so implement can run
      const updatedEngines = rig0.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig0.id, { engines: updatedEngines });

      // Walk: implement launches an Animator session (quick engine → 'engine-started')
      const result = await walker.walk();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [rig1] = await book.list();
      const impl1 = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl1?.status, 'running', 'engine should be running after launch');
      assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');

      // Walk: collect step finds the terminal session and stores yields
      const result2 = await walker.walk();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'implement');

      const [rig2] = await book.list();
      const impl2 = rig2.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl2?.status, 'completed');
      assert.ok(impl2?.yields !== undefined, 'yields should be stored');
      assert.doesNotThrow(() => JSON.stringify(impl2?.yields));
    });

    it('marks engine and rig failed when engine design is not found', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Inject a bad designId for draft
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      const result = await walker.walk();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error?.includes('nonexistent-engine'));
    });
  });

  // ── Yield serialization failure ────────────────────────────────────

  describe('yield serialization failure', () => {
    it('non-serializable engine yields cause engine and rig failure', async () => {
      const { clerk, walker, stacks, fire } = fix;

      // Register an engine design that returns non-JSON-serializable yields
      const badEngine: EngineDesign = {
        id: 'bad-engine',
        async run() {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { status: 'completed' as const, yields: { fn: (() => {}) as any } };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/bad-engine',
        id: 'test-bad',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { 'bad-engine': badEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Patch draft to use the bad engine design
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'bad-engine' } : e,
        ),
      });

      const result = await walker.walk();
      assert.ok(result !== null);
      assert.equal(result.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error !== undefined && draft.error.length > 0, `expected engine to have an error, got: ${draft?.error}`);
    });
  });

  // ── Implement engine — summon args and prompt wrapping ────────────

  describe('implement engine — Animator integration', () => {
    it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
      const { clerk, walker, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'My commission', 'my-codex');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/the/worktree' } }
            : e,
        ),
      });

      const launchResult = await walker.walk(); // launch implement
      assert.equal(launchResult?.action, 'engine-started');

      assert.equal(summonCalls.length, 1, 'summon should be called once');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'role defaults to artificer');
      assert.equal(call.cwd, '/the/worktree', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
      assert.deepEqual(call.metadata, { engineId: 'implement', writId: writ.id });
    });

    it('wraps the writ body with a commit instruction', async () => {
      const { clerk, walker, stacks, summonCalls } = fix;
      await clerk.post({ title: 'My writ', body: 'Build the feature.' });
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      const launchResult2 = await walker.walk(); // launch implement
      assert.equal(launchResult2?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const expectedPrompt = 'Build the feature.\n\nCommit all changes before ending your session.';
      assert.equal(summonCalls[0].prompt, expectedPrompt);
    });

    it('session failure propagates: engine fails → rig fails → writ transitions to failed', async () => {
      const { clerk, walker, stacks, setSessionOutcome } = fix;
      setSessionOutcome({ status: 'failed', error: 'Process exited with code 1' });

      const writ = await postWrit(clerk, 'Failing writ');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await walker.walk(); // launch implement (session already terminal in Stacks)
      await walker.walk(); // collect: session failed → engine fails → rig fails

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed', 'rig should be failed');
      const impl = updatedRig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed', 'implement engine should be failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed', 'writ should transition to failed via CDC');
    });

    it('ImplementYields contain sessionId and sessionStatus from the session record', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk, 'Yields test');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await walker.walk(); // launch
      await walker.walk(); // collect

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      const yields = impl?.yields as Record<string, unknown>;
      assert.ok(typeof yields.sessionId === 'string', 'sessionId should be a string');
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── Quick engine collect ───────────────────────────────────────────

  describe('quick engine — collect', () => {
    it('collects yields from a terminal session in the sessions book', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Simulate: draft completed, implement launched a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x', codexName: 'c', branch: 'b', path: '/p' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session record
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        output?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: 'Session completed successfully',
      });

      // Walk: collect step should find the terminal session
      const result = await walker.walk();
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      assert.ok(impl?.yields !== undefined);
      const yields = impl?.yields as Record<string, unknown>;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });

    it('marks engine and rig failed when session failed', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        error?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'failed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        error: 'Process exited with code 1',
      });

      const result = await walker.walk();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed');
    });

    it('does not collect a still-running session', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Session is still running
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      // Nothing to collect, implement is running (no pending with completed upstream),
      // spawn skips (rig exists) → null
      const result = await walker.walk();
      assert.equal(result, null);
    });
  });

  // ── Failure propagation ────────────────────────────────────────────

  describe('failure propagation', () => {
    it('engine failure → rig failed → writ transitions to failed via CDC', async () => {
      const { clerk, walker, stacks } = fix;
      const writ = await postWrit(clerk);

      await walker.walk(); // spawn (writ → active)
      const activeWrit = await clerk.show(writ.id);
      assert.equal(activeWrit.status, 'active');

      // Inject bad design to trigger failure
      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'broken' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      // Walk: engine fails → rig fails → CDC → writ fails
      await walker.walk();

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed');
    });
  });

  // ── Givens/context assembly ────────────────────────────────────────

  describe('givens and context assembly', () => {
    it('each engine receives only the givens it needs', async () => {
      const { clerk, walker, stacks } = fix;
      const writ = await postWrit(clerk, 'My writ');
      await walker.walk(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const eng = (id: string) => rig.engines.find((e: EngineInstance) => e.id === id)!;

      // draft: { writ } — no role
      assert.ok('writ' in eng('draft').givensSpec, 'draft should have writ');
      assert.ok(!('role' in eng('draft').givensSpec), 'draft should not have role');
      assert.equal((eng('draft').givensSpec.writ as WritDoc).id, writ.id);

      // implement: { writ, role }
      assert.ok('writ' in eng('implement').givensSpec, 'implement should have writ');
      assert.ok('role' in eng('implement').givensSpec, 'implement should have role');
      assert.equal((eng('implement').givensSpec.writ as WritDoc).id, writ.id);

      // review: { writ, role: 'reviewer' }
      assert.ok('writ' in eng('review').givensSpec, 'review should have writ');
      assert.equal(eng('review').givensSpec.role, 'reviewer', 'review role should be hardcoded reviewer');

      // revise: { writ, role }
      assert.ok('writ' in eng('revise').givensSpec, 'revise should have writ');
      assert.ok('role' in eng('revise').givensSpec, 'revise should have role');

      // seal: {}
      assert.deepEqual(eng('seal').givensSpec, {}, 'seal should get empty givensSpec');
    });

    it('role defaults to "artificer" when not configured', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const implementEngine = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(implementEngine?.givensSpec.role, 'artificer');
    });

    it('upstream map is built from completed engine yields', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft + implement as completed
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      const implYields = { sessionId: 'stub', sessionStatus: 'completed' };
      const updatedEngines = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implYields };
        return e;
      });
      await book.patch(rig.id, { engines: updatedEngines });

      // Walk: review launches a session (quick engine → 'engine-started')
      const result = await walker.walk();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      // Walk: collect step picks up the completed review session
      const result2 = await walker.walk();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'review');
    });
  });

  // ── Full pipeline ─────────────────────────────────────────────────

  describe('full pipeline', () => {
    it('walks through implement → review → revise → rig completion → writ completed', async () => {
      const { clerk, walker, stacks } = fix;
      const writ = await postWrit(clerk, 'Full pipeline test');

      await walker.walk(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (real impl would need codexes)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Walk: implement launches an Animator session (quick engine)
      const r1 = await walker.walk();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // Walk: collect step picks up the completed implement session
      const r1c = await walker.walk();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // Walk: review launches a session (quick engine)
      const r2 = await walker.walk();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // Walk: collect review session
      const r2c = await walker.walk();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // Walk: revise launches a session (quick engine)
      const r3 = await walker.walk();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // Walk: collect revise session
      const r3c = await walker.walk();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // Pre-complete seal (real impl would need codexes)
      const [rig3] = await book.list();
      const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 5 };
      await book.patch(rig3.id, {
        engines: rig3.engines.map((e: EngineInstance) =>
          e.id === 'seal' ? { ...e, status: 'completed' as const, yields: sealYields } : e,
        ),
        status: 'completed',
      });

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });

    it('walks all 5 engines to rig completion without manual seal patching', async () => {
      const { clerk, walker, stacks, fire } = fix;

      // Register a stub seal engine that doesn't require Scriptorium
      const stubSealEngine: EngineDesign = {
        id: 'seal',
        async run() {
          return {
            status: 'completed' as const,
            yields: { sealedCommit: 'abc', strategy: 'fast-forward' as const, retries: 0, inscriptionsSealed: 1 },
          };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/stub-seal',
        id: 'test-seal',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { seal: stubSealEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      const writ = await postWrit(clerk, 'Full pipeline stub seal');
      await walker.walk(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (requires Scriptorium — not available in tests)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // implement launches
      const r1 = await walker.walk();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // collect implement
      const r1c = await walker.walk();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // review launches (quick engine)
      const r2 = await walker.walk();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // collect review
      const r2c = await walker.walk();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // revise launches (quick engine)
      const r3 = await walker.walk();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // collect revise
      const r3c = await walker.walk();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // seal runs (stub) — last engine → rig completes
      const r4 = await walker.walk();
      assert.equal(r4?.action, 'rig-completed');
      assert.equal((r4 as { outcome: string }).outcome, 'completed');

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed', 'writ should transition to completed via CDC');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });
  });

  // ── Review engine — Animator integration ─────────────────────────

  describe('review engine — Animator integration', () => {
    it('calls animator.summon() with reviewer role, draft cwd, and prompt containing spec', async () => {
      const { clerk, walker, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Review integration test');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await walker.walk(); // launch review
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      assert.equal(summonCalls.length, 1, 'summon should be called once for review');
      const call = summonCalls[0];
      assert.equal(call.role, 'reviewer', 'review engine uses reviewer role');
      assert.equal(call.cwd, '/p', 'cwd is the draft worktree path');
      assert.ok(call.prompt.includes('# Code Review'), 'prompt includes review header');
      assert.ok(call.prompt.includes(writ.body), 'prompt includes writ body (spec)');
      assert.ok(call.prompt.includes('## Instructions'), 'prompt includes instructions section');
      assert.ok(call.prompt.includes('### Overall: PASS or FAIL'), 'prompt includes findings format');
      assert.deepEqual(call.metadata?.mechanicalChecks, [], 'no mechanical checks when not configured');
    });

    it('collects ReviewYields: parses PASS from session.output', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const findings = '### Overall: PASS\n\n### Completeness\nAll requirements met.';
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: findings,
        metadata: { mechanicalChecks: [] },
      });

      const result = await walker.walk(); // collect review
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'review');

      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.passed, true, 'passed should be true when output contains PASS');
      assert.equal(yields.findings, findings);
      assert.deepEqual(yields.mechanicalChecks, []);
    });

    it('collects ReviewYields: passed is false when output contains FAIL', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        metadata: { mechanicalChecks: [] },
      });

      await walker.walk(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.passed, false, 'passed should be false when output contains FAIL');
    });

    it('collects ReviewYields: mechanicalChecks retrieved from session.metadata', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const checks: MechanicalCheck[] = [
        { name: 'build', passed: true, output: 'Build succeeded', durationMs: 1200 },
        { name: 'test', passed: false, output: '3 tests failed', durationMs: 4500 },
      ];
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL',
        metadata: { mechanicalChecks: checks },
      });

      await walker.walk(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.mechanicalChecks.length, 2);
      assert.equal(yields.mechanicalChecks[0].name, 'build');
      assert.equal(yields.mechanicalChecks[0].passed, true);
      assert.equal(yields.mechanicalChecks[1].name, 'test');
      assert.equal(yields.mechanicalChecks[1].passed, false);
    });
  });

  // ── Review engine — mechanical checks ────────────────────────────

  describe('review engine — mechanical checks', () => {
    let mechFix: ReturnType<typeof buildFixture>;

    beforeEach(() => {
      mechFix = buildFixture({
        walker: {
          buildCommand: 'echo "build output"',
          testCommand: 'exit 1',
        },
      });
    });

    afterEach(() => {
      clearGuild();
    });

    it('executes build and test commands; captures pass/fail from exit code', async () => {
      const { clerk, walker, stacks, summonCalls } = mechFix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await walker.walk(); // launch review (runs checks first)
      assert.equal(result?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const checks = summonCalls[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.equal(checks.length, 2, 'both build and test checks should run');

      const buildCheck = checks.find((c) => c.name === 'build');
      assert.ok(buildCheck, 'build check should be present');
      assert.equal(buildCheck!.passed, true, 'echo exits 0 → passed');
      assert.ok(buildCheck!.output.includes('build output'), 'output captured from stdout');
      assert.ok(typeof buildCheck!.durationMs === 'number', 'durationMs recorded');

      const testCheck = checks.find((c) => c.name === 'test');
      assert.ok(testCheck, 'test check should be present');
      assert.equal(testCheck!.passed, false, 'exit 1 → failed');
    });

    it('skips checks gracefully when no buildCommand or testCommand configured', async () => {
      const noCmdFix = buildFixture({ walker: {} }); // no buildCommand/testCommand
      const { clerk, walker: w, stacks: s, summonCalls: sc } = noCmdFix;
      await postWrit(clerk);
      await w.walk(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.walk(); // launch review
      assert.deepEqual(sc[0].metadata?.mechanicalChecks, [], 'no checks when commands not configured');
      clearGuild();
    });

    it('truncates check output to 4KB', async () => {
      const bigFix = buildFixture({
        walker: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
      });
      const { clerk, walker: w, stacks: s, summonCalls: sc } = bigFix;
      await postWrit(clerk);
      await w.walk(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.walk(); // launch review (runs check with big output)
      const checks = sc[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.ok(checks[0].output.length <= 4096, `output should be truncated to 4KB, got ${checks[0].output.length} chars`);
      clearGuild();
    });
  });

  // ── Revise engine — Animator integration ─────────────────────────

  describe('revise engine — Animator integration', () => {
    it('calls animator.summon() with role from givens, draft cwd, and writ env', async () => {
      const { clerk, walker, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Revise integration test');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS\nAll good.', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      const result = await walker.walk(); // launch revise
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      assert.equal(summonCalls.length, 1, 'summon called once for revise');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'revise uses role from givens (default artificer)');
      assert.equal(call.cwd, '/p', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
    });

    it('revision prompt includes pass branch when review passed', async () => {
      const { clerk, walker, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Pass branch test');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: true,
        findings: '### Overall: PASS\nAll requirements met.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await walker.walk(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: PASS'), 'prompt includes PASS result');
      assert.ok(prompt.includes('The review passed'), 'prompt includes pass branch instruction');
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('revision prompt includes fail branch when review failed', async () => {
      const { clerk, walker, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Fail branch test');
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: false,
        findings: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await walker.walk(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: FAIL'), 'prompt includes FAIL result');
      assert.ok(
        prompt.includes('The review identified issues that need to be addressed'),
        'prompt includes fail branch instruction',
      );
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('ReviseYields: sessionId and sessionStatus collected from session record', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          if (e.id === 'revise') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await walker.walk(); // collect revise
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      const [updated] = await book.list();
      const reviseEngine = updated.engines.find((e: EngineInstance) => e.id === 'revise');
      const yields = reviseEngine?.yields as { sessionId: string; sessionStatus: string };
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── Walk returns null ──────────────────────────────────────────────

  describe('walk() returns null', () => {
    it('returns null when no rigs exist and no ready writs', async () => {
      const result = await fix.walker.walk();
      assert.equal(result, null);
    });

    it('returns null when the rig has a running engine with no terminal session', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Put draft in 'running' with a live session
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
            : e,
        ),
      });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await walker.walk();
      assert.equal(result, null);
    });
  });
});

=== FILE: packages/plugins/walker/src/walker.ts ===
/**
 * The Walker — rig execution engine apparatus.
 *
 * The Walker drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each walk() call performs one unit of work:
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
 * See: docs/architecture/apparatus/walker.md
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book, ReadOnlyBook } from '@shardworks/stacks-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
import type { SessionDoc } from '@shardworks/animator-apparatus';

import type {
  RigDoc,
  EngineInstance,
  WalkerApi,
  WalkResult,
  WalkerConfig,
} from './types.ts';

import {
  draftEngine,
  implementEngine,
  reviewEngine,
  reviseEngine,
  sealEngine,
} from './engines/index.ts';

import { walkTool, walkContinualTool } from './tools/index.ts';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Check whether a value is JSON-serializable.
 * Non-serializable yields cause engine failure — the Stacks cannot store them.
 */
function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the upstream yields map for a rig: all completed engine yields
 * keyed by engine id. Passed as context.upstream to the engine's run().
 */
function buildUpstreamMap(rig: RigDoc): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const engine of rig.engines) {
    if (engine.status === 'completed' && engine.yields !== undefined) {
      upstream[engine.id] = engine.yields;
    }
  }
  return upstream;
}

/**
 * Find the first pending engine whose entire upstream is completed.
 * Returns null if no runnable engine exists.
 */
function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  for (const engine of rig.engines) {
    if (engine.status !== 'pending') continue;
    const allUpstreamDone = engine.upstream.every((upstreamId) => {
      const dep = rig.engines.find((e) => e.id === upstreamId);
      return dep?.status === 'completed';
    });
    if (allUpstreamDone) return engine;
  }
  return null;
}

/**
 * Produce the five-engine static pipeline for a writ.
 * Each engine receives only the givens it needs.
 * Upstream yields arrive via context.upstream at run time.
 */
function buildStaticEngines(writ: WritDoc, config: WalkerConfig): EngineInstance[] {
  const role = config.role ?? 'artificer';
  const reviewGivens: Record<string, unknown> = {
    writ,
    role: 'reviewer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec: { writ } },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec: { writ, role } },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec: reviewGivens },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec: { writ, role } },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec: {} },
  ];
}

// ── Apparatus factory ──────────────────────────────────────────────────

export function createWalker(): Plugin {
  let rigsBook: Book<RigDoc>;
  let sessionsBook: ReadOnlyBook<SessionDoc>;
  let writsBook: ReadOnlyBook<WritDoc>;
  let clerk: ClerkApi;
  let fabricator: FabricatorApi;
  let walkerConfig: WalkerConfig = {};

  // ── Internal walk operations ─────────────────────────────────────

  /**
   * Mark an engine failed and propagate failure to the rig (same update).
   */
  async function failEngine(
    rig: RigDoc,
    engineId: string,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updatedEngines = rig.engines.map((e) =>
      e.id === engineId
        ? { ...e, status: 'failed' as const, error: errorMessage, completedAt: now }
        : e,
    );
    await rigsBook.patch(rig.id, {
      engines: updatedEngines,
      status: 'failed',
    });
  }

  /**
   * Phase 1 — collect.
   *
   * Find the first running engine with a sessionId whose session has
   * reached a terminal state. Populate yields and advance the engine
   * (and possibly the rig) to completed or failed.
   */
  async function tryCollect(): Promise<WalkResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      for (const engine of rig.engines) {
        if (engine.status !== 'running' || !engine.sessionId) continue;

        const session = await sessionsBook.get(engine.sessionId);
        if (!session || session.status === 'running') continue;

        // Terminal session found — collect.
        const now = new Date().toISOString();

        if (session.status === 'failed' || session.status === 'timeout') {
          await failEngine(rig, engine.id, session.error ?? `Session ${session.status}`);
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        // Completed session — assemble engine-specific yields from session record.
        let yields: Record<string, unknown>;
        if (engine.id === 'review') {
          // Review collect: parse findings and passed flag from session output;
          // retrieve mechanicalChecks stashed in session metadata by the review engine.
          const findings = session.output ?? '';
          const passed = /^###\s*Overall:\s*PASS/mi.test(findings);
          const mechanicalChecks = (session.metadata?.mechanicalChecks as unknown[]) ?? [];
          yields = { sessionId: session.id, passed, findings, mechanicalChecks };
        } else {
          yields = {
            sessionId: session.id,
            sessionStatus: session.status,
            ...(session.output !== undefined ? { output: session.output } : {}),
          };
        }

        if (!isJsonSerializable(yields)) {
          await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, status: 'completed' as const, yields, completedAt: now }
            : e,
        );

        const allCompleted = updatedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: updatedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: engine.id };
      }
    }
    return null;
  }

  /**
   * Phase 2 — run.
   *
   * Find the first pending engine in any running rig whose upstream is
   * all completed. Execute it:
   * - Clockwork ('completed') → store yields, mark engine completed,
   *   check for rig completion.
   * - Quick ('launched') → store sessionId, mark engine running.
   */
  async function tryRun(): Promise<WalkResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      const pending = findRunnableEngine(rig);
      if (!pending) continue;

      const design = fabricator.getEngineDesign(pending.designId);
      if (!design) {
        await failEngine(rig, pending.id, `No engine design found for "${pending.designId}"`);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }

      const now = new Date().toISOString();
      const upstream = buildUpstreamMap(rig);
      const givens = { ...pending.givensSpec };
      const context = { engineId: pending.id, upstream };

      let engineResult: Awaited<ReturnType<typeof design.run>>;
      try {
        // Mark engine as running before executing
        const startedEngines = rig.engines.map((e) =>
          e.id === pending.id ? { ...e, status: 'running' as const, startedAt: now } : e,
        );
        await rigsBook.patch(rig.id, { engines: startedEngines });

        // Re-fetch to get the up-to-date engines list (with startedAt set)
        const updatedRig = { ...rig, engines: startedEngines };

        engineResult = await design.run(givens, context);

        if (engineResult.status === 'launched') {
          // Quick engine — store sessionId, leave engine in 'running'
          const { sessionId } = engineResult;
          const launchedEngines = updatedRig.engines.map((e) =>
            e.id === pending.id
              ? { ...e, status: 'running' as const, sessionId }
              : e,
          );
          await rigsBook.patch(rig.id, { engines: launchedEngines });
          return { action: 'engine-started', rigId: rig.id, engineId: pending.id };
        }

        // Clockwork engine — validate and store yields
        const { yields } = engineResult;
        if (!isJsonSerializable(yields)) {
          await failEngine(updatedRig, pending.id, 'Engine yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const completedAt = new Date().toISOString();
        const completedEngines = updatedRig.engines.map((e) =>
          e.id === pending.id
            ? { ...e, status: 'completed' as const, yields, completedAt }
            : e,
        );
        const allCompleted = completedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: completedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: pending.id };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await failEngine(rig, pending.id, errorMessage);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }
    }
    return null;
  }

  /**
   * Phase 3 — spawn.
   *
   * Find the oldest ready writ with no existing rig. Create a rig and
   * transition the writ to active so the Clerk tracks it as in-progress.
   */
  async function trySpawn(): Promise<WalkResult | null> {
    // Find ready writs ordered by creation time (oldest first)
    const readyWrits = await writsBook.find({
      where: [['status', '=', 'ready']],
      orderBy: ['createdAt', 'asc'],
      limit: 10,
    });

    for (const writ of readyWrits) {
      // Check for existing rig
      const existing = await rigsBook.find({
        where: [['writId', '=', writ.id]],
        limit: 1,
      });
      if (existing.length > 0) continue;

      const rigId = generateId('rig', 4);
      const engines = buildStaticEngines(writ, walkerConfig);

      const rig: RigDoc = {
        id: rigId,
        writId: writ.id,
        status: 'running',
        engines,
      };

      await rigsBook.put(rig);

      // Transition writ to active so Clerk tracks it
      try {
        await clerk.transition(writ.id, 'active');
      } catch (err) {
        // Only swallow state-transition conflicts (writ already moved past 'ready')
        if (err instanceof Error && err.message.includes('transition')) {
          // Race condition — another walker got here first. The rig is already created,
          // so we continue. The writ is already active or beyond.
        } else {
          throw err;
        }
      }

      return { action: 'rig-spawned', rigId, writId: writ.id };
    }

    return null;
  }

  // ── WalkerApi ─────────────────────────────────────────────────────

  const api: WalkerApi = {
    async walk(): Promise<WalkResult | null> {
      const collected = await tryCollect();
      if (collected) return collected;

      const ran = await tryRun();
      if (ran) return ran;

      const spawned = await trySpawn();
      if (spawned) return spawned;

      return null;
    },
  };

  // ── Apparatus ─────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks', 'clerk', 'fabricator'],

      supportKit: {
        books: {
          rigs: {
            indexes: ['status', 'writId', ['status', 'writId']],
          },
        },
        engines: {
          draft:     draftEngine,
          implement: implementEngine,
          review:    reviewEngine,
          revise:    reviseEngine,
          seal:      sealEngine,
        },
        tools: [walkTool, walkContinualTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        walkerConfig = g.guildConfig().walker ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        clerk = g.apparatus<ClerkApi>('clerk');
        fabricator = g.apparatus<FabricatorApi>('fabricator');

        rigsBook = stacks.book<RigDoc>('walker', 'rigs');
        sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
        writsBook = stacks.readBook<WritDoc>('clerk', 'writs');

        // CDC — Phase 1 cascade on rigs book.
        // When a rig reaches a terminal state, transition the associated writ.
        stacks.watch<RigDoc>(
          'walker',
          'rigs',
          async (event) => {
            if (event.type !== 'update') return;

            const rig = event.entry;
            const prev = event.prev;

            // Only act when status changes to a terminal state
            if (rig.status === prev.status) return;

            if (rig.status === 'completed') {
              // Use seal yields as the resolution summary
              const sealEngine = rig.engines.find((e) => e.id === 'seal');
              const resolution = sealEngine?.yields
                ? JSON.stringify(sealEngine.yields)
                : 'Rig completed';
              await clerk.transition(rig.writId, 'completed', { resolution });
            } else if (rig.status === 'failed') {
              const failedEngine = rig.engines.find((e) => e.status === 'failed');
              const resolution = failedEngine?.error ?? 'Engine failure';
              await clerk.transition(rig.writId, 'failed', { resolution });
            }
          },
          { failOnError: true },
        );
      },
    },
  };
}


## Convention Reference (sibling files not modified by this commission)


=== CONTEXT FILE: packages/plugins/walker/src/index.ts ===
/**
 * @shardworks/walker-apparatus — The Walker.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, WalkResult, WalkerApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */

import { createWalker } from './walker.ts';

// ── Public types ──────────────────────────────────────────────────────

export type {
  EngineStatus,
  EngineInstance,
  RigStatus,
  RigDoc,
  WalkResult,
  WalkerApi,
  WalkerConfig,
  DraftYields,
  SealYields,
} from './types.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createWalker();

=== CONTEXT FILE: packages/plugins/walker/src/engines ===
tree 3b4ac6a9339b111eb5dd9429ab5632ee58449d49:packages/plugins/walker/src/engines

draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

=== CONTEXT FILE: packages/plugins/walker/src/tools ===
tree 3b4ac6a9339b111eb5dd9429ab5632ee58449d49:packages/plugins/walker/src/tools

index.ts
walk-continual.ts
walk.ts

=== CONTEXT FILE: packages/plugins/walker/src/engines/implement.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Walker's collect step can poll for completion on subsequent walks.
 */

import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields } from '../types.ts';

const implementEngine: EngineDesign = {
  id: 'implement',

  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;

    const prompt = `${writ.body}\n\nCommit all changes before ending your session.`;

    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
      metadata: { engineId: context.engineId, writId: writ.id },
    });

    const sessionResult = await handle.result;
    return { status: 'launched', sessionId: sessionResult.id };
  },
};

export default implementEngine;

=== CONTEXT FILE: packages/plugins/walker/src/engines/draft.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */

import { execSync } from 'node:child_process';
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { ScriptoriumApi } from '@shardworks/codexes-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { DraftYields } from '../types.ts';

const draftEngine: EngineDesign = {
  id: 'draft',

  async run(givens, _context) {
    const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
    const writ = givens.writ as WritDoc;

    if (!writ.codex) {
      throw new Error(
        `Writ "${writ.id}" has no codex — cannot open a draft binding.`,
      );
    }

    const draft = await scriptorium.openDraft({
      codexName: writ.codex,
      associatedWith: writ.id,
    });

    const baseSha = execSync('git rev-parse HEAD', { cwd: draft.path, encoding: 'utf-8' }).trim();

    const yields: DraftYields = {
      draftId: draft.id,
      codexName: draft.codexName,
      branch: draft.branch,
      path: draft.path,
      baseSha,
    };

    return { status: 'completed', yields };
  },
};

export default draftEngine;

=== CONTEXT FILE: packages/plugins/walker/src/engines/seal.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */

import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { ScriptoriumApi } from '@shardworks/codexes-apparatus';
import type { DraftYields, SealYields } from '../types.ts';

const sealEngine: EngineDesign = {
  id: 'seal',

  async run(_givens, context) {
    const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
    const draftYields = context.upstream['draft'] as DraftYields | undefined;

    if (!draftYields) {
      throw new Error('Seal engine requires draft yields in context.upstream but none found.');
    }

    const result = await scriptorium.seal({
      codexName: draftYields.codexName,
      sourceBranch: draftYields.branch,
    });

    const yields: SealYields = {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    };

    return { status: 'completed', yields };
  },
};

export default sealEngine;


## Codebase Structure (surrounding directories)

```
```

=== TREE: packages/plugins/walker/src/ ===
engines
index.ts
tools
types.ts
walker.test.ts
walker.ts

=== TREE: packages/plugins/walker/src/engines/ ===
draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

```
```
