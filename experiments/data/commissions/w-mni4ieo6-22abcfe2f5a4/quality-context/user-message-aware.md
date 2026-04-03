## Commission Spec

# Walker Increment 2 — Quick Engine Execution (Implement)

Status: **Draft**

Complexity: **3**

Codex: nexus

## Authoritative Spec

The complete Walker design is at `docs/architecture/apparatus/walker.md`. This commission replaces the `implement` engine stub with a real Animator-backed implementation. Read the full spec — particularly the `implement` engine section, the collect step, and the `ImplementYields` type.

---

## What already exists (after Increment 1)

- **The Fabricator** — engine design registry, kit scanning, `getEngineDesign()`. Operational.
- **The Walker** — walk function, priority ordering, static graph spawning, rig data model, CDC handler, engine failure propagation, `walk` and `walkContinual` tools. Operational.
- **Clockwork engines** — `draft` (real, opens draft binding) and `seal` (real, seals draft binding). Operational.
- **Quick engine stubs** — `implement`, `review`, `revise` are stubs returning mock completed yields. These are what we're replacing (implement only in this increment).
- **The Animator** — session launch (`summon`), session recording, session polling via the sessions book. Operational.
- **The Scriptorium** — draft bindings with worktree paths. Operational.

The Walker already handles the quick engine lifecycle (launch → store sessionId → mark running → collect on subsequent walks). This was tested with mocks in Increment 1. This commission wires up the real Animator integration.

---

## What to build

### 1. Replace the `implement` engine stub

The stub currently returns `{ status: 'completed', yields: mockYields }`. Replace it with the real implementation from the spec:

- Pull `writ` from givens, `draft` (DraftYields) from `context.upstream.draft`
- Wrap `writ.body` with commit instruction: `` `${writ.body}\n\nCommit all changes before ending your session.` ``
- Call `animator.summon()` with role from givens, assembled prompt, draft worktree as cwd, git author email set to `${writ.id}@nexus.local`, and metadata containing `engineId` and `writId`
- Return `{ status: 'launched', sessionId }` — the Walker's existing collect step handles the rest

### 2. Implement the `implement` collect step

The Walker's collect step (priority 1) already detects when a running engine's session reaches terminal status. For the implement engine, the collect step builds yields:

```typescript
const session = await stacks.get('sessions', engine.sessionId)
engine.yields = {
  sessionId: session.id,
  sessionStatus: session.status,
} satisfies ImplementYields
```

This may already be handled generically by the Walker's collect step from Increment 1 (if it was implemented to build yields from session data for any quick engine). If so, verify it works correctly with the real Animator. If the collect step is currently stub-aware, update it to handle real session records.

### 3. End-to-end validation

After this increment, the Walker can run `draft → implement → seal` as a working pipeline — functional parity with the Dispatch apparatus, on the new architecture. The review and revise engines remain stubs (they pass through without doing real work).

---

## What to validate

Tests should cover:

- **Implement engine launches a real session:** calls `animator.summon()` with correct role, prompt, cwd, environment, metadata
- **Prompt wrapping:** writ body gets the commit instruction appended
- **Session polling:** Walker's collect step detects session completion from the sessions book and populates `ImplementYields`
- **Session failure:** if the Animator session fails, the engine fails, the rig fails, the writ transitions to failed
- **End-to-end with stubs:** `draft` (real) → `implement` (real) → `review` (stub) → `revise` (stub) → `seal` (real) completes successfully

---

## What is NOT in scope

- Review and revise engines — still stubs. Increment 3 makes them real.
- Prompt assembly for review/revise
- Mechanical checks (build, test)
- Reviewer role registration
- Session output/transcript capture (that's the Animator commission, not the Walker)

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

1. **Collect a completed engine.** Scan all active rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and its upstream engine has `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent walk calls via step 1.
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
  status: 'active' | 'completed' | 'failed'
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
  upstream: string | null  // id of the engine that must complete first (null = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Walker polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and its upstream engine (if any) has `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: WalkerConfig): EngineInstance[] {
  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: null,
      givensSpec: { writ }, yields: null },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: 'draft',
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: 'implement',
      givensSpec: { writ, role: 'reviewer', buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: 'review',
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: 'revise',
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
  // Collect all upstream yields for the context escape hatch
  const upstream: Record<string, unknown> = {}
  let current = engine
  while (current.upstream) {
    const up = rig.engines.find(e => e.id === current.upstream)!
    upstream[up.id] = up.yields
    current = up
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
  worktreePath: string    // absolute path to the draft worktree
  draftBranch: string     // git branch name for the draft
  codexId: string         // which codex this draft is on
  baseSha: string         // commit SHA at draft open — used to compute diffs later
}
```

**Produced by:** `draft` engine
**Consumed by:** all downstream engines. Establishes the physical workspace.

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
  mergedSha: string     // the commit SHA after sealing (fast-forward merge to main)
  pushed: boolean       // whether the push to upstream succeeded
}
```

**Produced by:** `seal` engine
**Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Walker's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

### `draft` (clockwork)

Opens a draft binding on the commission's target codex.

```typescript
async run(givens: Record<string, unknown>, { engineId }: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('scriptorium')
  const writ = givens.writ as Writ
  const draft = await scriptorium.openDraft({ codexId: writ.codexId, writId: writ.id })
  const baseSha = await getHeadSha(draft.worktreePath)

  return {
    status: 'completed',
    yields: { worktreePath: draft.worktreePath, draftBranch: draft.branch, codexId: writ.codexId, baseSha } satisfies DraftYields,
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
    cwd: draft.worktreePath,
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
    checks.push(await runCheck('build', givens.buildCommand as string, draft.worktreePath))
  }
  if (givens.testCommand) {
    checks.push(await runCheck('test', givens.testCommand as string, draft.worktreePath))
  }

  // 2. Compute diff since draft opened
  const diff = await gitDiff(draft.worktreePath, draft.baseSha)
  const status = await gitStatus(draft.worktreePath)

  // 3. Assemble review prompt
  const prompt = assembleReviewPrompt(writ, diff, status, checks)

  // 4. Launch reviewer session
  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.worktreePath,
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

  const status = await gitStatus(draft.worktreePath)
  const diff = await gitDiffUncommitted(draft.worktreePath)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.worktreePath,
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
async run(givens: Record<string, unknown>, ctx: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('scriptorium')
  const draft = ctx.upstream.draft as DraftYields

  const result = await scriptorium.seal({
    codexId: draft.codexId,
    branch: draft.draftBranch,
  })

  return {
    status: 'completed',
    yields: { mergedSha: result.mergedSha, pushed: result.pushed } satisfies SealYields,
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
      resolution: `Sealed at ${sealYields.mergedSha}. Pushed: ${sealYields.pushed}.`,
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
 packages/plugins/walker/src/engines/implement.ts |  38 ++--
 packages/plugins/walker/src/types.ts             |  11 ++
 packages/plugins/walker/src/walker.test.ts       | 221 +++++++++++++++++++++--
 3 files changed, 239 insertions(+), 31 deletions(-)

diff --git a/packages/plugins/walker/src/engines/implement.ts b/packages/plugins/walker/src/engines/implement.ts
index d81200e..f6f74b6 100644
--- a/packages/plugins/walker/src/engines/implement.ts
+++ b/packages/plugins/walker/src/engines/implement.ts
@@ -1,24 +1,38 @@
 /**
- * Implement engine — stub (Increment 1).
+ * Implement engine — quick (Animator-backed).
  *
- * Returns a completed result with mock yields so the full pipeline can be
- * tested end-to-end. Increment 2 replaces this with real Animator-backed
- * quick engine execution.
+ * Summons an anima to do the commissioned work. Wraps the writ body with
+ * a commit instruction, then calls animator.summon() with the draft
+ * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
+ * so the Walker's collect step can poll for completion on subsequent walks.
  */
 
+import { guild } from '@shardworks/nexus-core';
 import type { EngineDesign } from '@shardworks/fabricator-apparatus';
+import type { AnimatorApi } from '@shardworks/animator-apparatus';
+import type { WritDoc } from '@shardworks/clerk-apparatus';
+import type { DraftYields } from '../types.ts';
 
 const implementEngine: EngineDesign = {
   id: 'implement',
 
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
+
+    const prompt = `${writ.body}\n\nCommit all changes before ending your session.`;
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
index f0e791e..c94f253 100644
--- a/packages/plugins/walker/src/types.ts
+++ b/packages/plugins/walker/src/types.ts
@@ -161,6 +161,17 @@ export interface SealYields {
   inscriptionsSealed: number;
 }
 
+/**
+ * Yields from the `implement` quick engine.
+ * Set by the Walker's collect step when the Animator session completes.
+ */
+export interface ImplementYields {
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
index 9360920..518b9ae 100644
--- a/packages/plugins/walker/src/walker.test.ts
+++ b/packages/plugins/walker/src/walker.test.ts
@@ -23,6 +23,8 @@ import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
 import { createFabricator } from '@shardworks/fabricator-apparatus';
 import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparatus';
 
+import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';
+
 import { createWalker } from './walker.ts';
 import type { WalkerApi, RigDoc, EngineInstance } from './types.ts';
 
@@ -53,15 +55,20 @@ function buildCtx(): {
 
 /**
  * Full integration fixture: starts Stacks (memory), Clerk, Fabricator,
- * and Walker. Returns handles to each API.
+ * and Walker. Returns handles to each API plus mock animator controls.
  */
-function buildFixture(guildConfig: Partial<GuildConfig> = {}): {
+function buildFixture(
+  guildConfig: Partial<GuildConfig> = {},
+  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string } = { status: 'completed' },
+): {
   stacks: StacksApi;
   clerk: ClerkApi;
   fabricator: FabricatorApi;
   walker: WalkerApi;
   memBackend: InstanceType<typeof MemoryBackend>;
   fire: (event: string, ...args: unknown[]) => Promise<void>;
+  summonCalls: SummonRequest[];
+  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string }) => void;
 } {
   const memBackend = new MemoryBackend();
   const stacksPlugin = createStacksApparatus(memBackend);
@@ -121,6 +128,56 @@ function buildFixture(guildConfig: Partial<GuildConfig> = {}): {
     indexes: ['startedAt', 'status'],
   });
 
+  // Mock animator — captures summon() calls and writes session docs to Stacks.
+  // The implement engine awaits handle.result to get the session id; the mock
+  // writes a terminal session record before resolving so the Walker's collect
+  // step finds it on the next walk() call.
+  let currentSessionOutcome = initialSessionOutcome;
+  const summonCalls: SummonRequest[] = [];
+  const mockAnimatorApi: AnimatorApi = {
+    summon(request: SummonRequest): AnimateHandle {
+      summonCalls.push(request);
+      const sessionId = generateId('ses', 4);
+      const startedAt = new Date().toISOString();
+      const outcome = currentSessionOutcome;
+
+      const result = (async (): Promise<SessionResult> => {
+        const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
+        const endedAt = new Date().toISOString();
+        const doc: SessionDoc = {
+          id: sessionId,
+          status: outcome.status,
+          startedAt,
+          endedAt,
+          durationMs: 0,
+          provider: 'mock',
+          exitCode: outcome.status === 'completed' ? 0 : 1,
+          ...(outcome.error ? { error: outcome.error } : {}),
+          metadata: request.metadata,
+        };
+        await sessBook.put(doc);
+        return {
+          id: sessionId,
+          status: outcome.status,
+          startedAt,
+          endedAt,
+          durationMs: 0,
+          provider: 'mock',
+          exitCode: outcome.status === 'completed' ? 0 : 1,
+          ...(outcome.error ? { error: outcome.error } : {}),
+          metadata: request.metadata,
+        } as SessionResult;
+      })();
+
+      async function* emptyChunks(): AsyncIterable<SessionChunk> {}
+      return { chunks: emptyChunks(), result };
+    },
+    animate(): AnimateHandle {
+      throw new Error('animate() not used in Walker tests');
+    },
+  };
+  apparatusMap.set('animator', mockAnimatorApi);
+
   // Start clerk
   clerkApparatus.start(noopCtx);
   const clerk = clerkApparatus.provides as ClerkApi;
@@ -148,7 +205,13 @@ function buildFixture(guildConfig: Partial<GuildConfig> = {}): {
   // Fire synchronously — fabricator's handler is sync
   void fire('plugin:initialized', walkerLoaded);
 
-  return { stacks, clerk, fabricator, walker, memBackend, fire };
+  return {
+    stacks, clerk, fabricator, walker, memBackend, fire,
+    summonCalls,
+    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string }) {
+      currentSessionOutcome = outcome;
+    },
+  };
 }
 
 /** Get the rigs book. */
@@ -321,7 +384,7 @@ describe('Walker', () => {
       assert.deepEqual(implement?.upstream, ['draft']);
     });
 
-    it('implement only runs after draft is completed', async () => {
+    it('implement only launches after draft is completed', async () => {
       const { clerk, walker, stacks } = fix;
       await postWrit(clerk);
       await walker.walk(); // spawn
@@ -337,17 +400,17 @@ describe('Walker', () => {
       );
       await book.patch(rig.id, { engines: updatedEngines });
 
-      // Now walk should run implement
+      // Now walk should launch implement (quick engine → 'launched', not 'ran')
       const result = await walker.walk();
-      assert.equal(result?.type, 'ran');
+      assert.equal(result?.type, 'launched');
       assert.equal((result as { engineId: string }).engineId, 'implement');
     });
   });
 
-  // ── Clockwork execution ────────────────────────────────────────────
+  // ── Quick engine execution (implement) ────────────────────────────
 
-  describe('clockwork engine execution', () => {
-    it('stores yields and marks engine completed in same walk call', async () => {
+  describe('implement engine execution', () => {
+    it('launches session on first walk, then collects yields on second walk', async () => {
       const { clerk, walker, stacks } = fix;
       await postWrit(clerk);
       await walker.walk(); // spawn
@@ -355,7 +418,7 @@ describe('Walker', () => {
       const book = rigsBook(stacks);
       const [rig0] = await book.list();
 
-      // Pre-complete draft so implement can run (stub clockwork)
+      // Pre-complete draft so implement can run
       const updatedEngines = rig0.engines.map((e: EngineInstance) =>
         e.id === 'draft'
           ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
@@ -363,17 +426,26 @@ describe('Walker', () => {
       );
       await book.patch(rig0.id, { engines: updatedEngines });
 
-      // Walk: implement stub runs synchronously (clockwork)
+      // Walk: implement launches an Animator session (quick engine → 'launched')
       const result = await walker.walk();
-      assert.equal(result?.type, 'ran');
+      assert.equal(result?.type, 'launched');
       assert.equal((result as { engineId: string }).engineId, 'implement');
 
       const [rig1] = await book.list();
-      const impl = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
-      assert.equal(impl?.status, 'completed');
-      assert.ok(impl?.yields !== undefined, 'yields should be stored');
-      // Stub yields are JSON-serializable
-      assert.doesNotThrow(() => JSON.stringify(impl?.yields));
+      const impl1 = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
+      assert.equal(impl1?.status, 'running', 'engine should be running after launch');
+      assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');
+
+      // Walk: collect step finds the terminal session and stores yields
+      const result2 = await walker.walk();
+      assert.equal(result2?.type, 'collected');
+      assert.equal((result2 as { engineId: string }).engineId, 'implement');
+
+      const [rig2] = await book.list();
+      const impl2 = rig2.engines.find((e: EngineInstance) => e.id === 'implement');
+      assert.equal(impl2?.status, 'completed');
+      assert.ok(impl2?.yields !== undefined, 'yields should be stored');
+      assert.doesNotThrow(() => JSON.stringify(impl2?.yields));
     });
 
     it('marks engine and rig failed when engine design is not found', async () => {
@@ -401,6 +473,112 @@ describe('Walker', () => {
     });
   });
 
+  // ── Implement engine — summon args and prompt wrapping ────────────
+
+  describe('implement engine — Animator integration', () => {
+    it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
+      const { clerk, walker, stacks, summonCalls } = fix;
+      const writ = await postWrit(clerk, 'My commission', 'my-codex');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) =>
+          e.id === 'draft'
+            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/the/worktree' } }
+            : e,
+        ),
+      });
+
+      await walker.walk(); // launch implement
+
+      assert.equal(summonCalls.length, 1, 'summon should be called once');
+      const call = summonCalls[0];
+      assert.equal(call.role, 'artificer', 'role defaults to artificer');
+      assert.equal(call.cwd, '/the/worktree', 'cwd is draft worktree path');
+      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
+      assert.deepEqual(call.metadata, { engineId: 'implement', writId: writ.id });
+    });
+
+    it('wraps the writ body with a commit instruction', async () => {
+      const { clerk, walker, stacks, summonCalls } = fix;
+      await clerk.post({ title: 'My writ', body: 'Build the feature.' });
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) =>
+          e.id === 'draft'
+            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
+            : e,
+        ),
+      });
+
+      await walker.walk(); // launch implement
+
+      assert.equal(summonCalls.length, 1);
+      const expectedPrompt = 'Build the feature.\n\nCommit all changes before ending your session.';
+      assert.equal(summonCalls[0].prompt, expectedPrompt);
+    });
+
+    it('session failure propagates: engine fails → rig fails → writ transitions to failed', async () => {
+      const { clerk, walker, stacks, setSessionOutcome } = fix;
+      setSessionOutcome({ status: 'failed', error: 'Process exited with code 1' });
+
+      const writ = await postWrit(clerk, 'Failing writ');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) =>
+          e.id === 'draft'
+            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
+            : e,
+        ),
+      });
+
+      await walker.walk(); // launch implement (session already terminal in Stacks)
+      await walker.walk(); // collect: session failed → engine fails → rig fails
+
+      const [updatedRig] = await book.list();
+      assert.equal(updatedRig.status, 'failed', 'rig should be failed');
+      const impl = updatedRig.engines.find((e: EngineInstance) => e.id === 'implement');
+      assert.equal(impl?.status, 'failed', 'implement engine should be failed');
+
+      const failedWrit = await clerk.show(writ.id);
+      assert.equal(failedWrit.status, 'failed', 'writ should transition to failed via CDC');
+    });
+
+    it('ImplementYields contain sessionId and sessionStatus from the session record', async () => {
+      const { clerk, walker, stacks } = fix;
+      await postWrit(clerk, 'Yields test');
+      await walker.walk(); // spawn
+
+      const book = rigsBook(stacks);
+      const [rig] = await book.list();
+      await book.patch(rig.id, {
+        engines: rig.engines.map((e: EngineInstance) =>
+          e.id === 'draft'
+            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
+            : e,
+        ),
+      });
+
+      await walker.walk(); // launch
+      await walker.walk(); // collect
+
+      const [updated] = await book.list();
+      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
+      assert.equal(impl?.status, 'completed');
+      const yields = impl?.yields as Record<string, unknown>;
+      assert.ok(typeof yields.sessionId === 'string', 'sessionId should be a string');
+      assert.equal(yields.sessionStatus, 'completed');
+    });
+  });
+
   // ── Quick engine collect ───────────────────────────────────────────
 
   describe('quick engine — collect', () => {
@@ -635,11 +813,16 @@ describe('Walker', () => {
         ),
       });
 
-      // Walk: implement runs (stub → completed)
+      // Walk: implement launches an Animator session (quick engine)
       const r1 = await walker.walk();
-      assert.equal(r1?.type, 'ran');
+      assert.equal(r1?.type, 'launched');
       assert.equal((r1 as { engineId: string }).engineId, 'implement');
 
+      // Walk: collect step picks up the completed implement session
+      const r1c = await walker.walk();
+      assert.equal(r1c?.type, 'collected');
+      assert.equal((r1c as { engineId: string }).engineId, 'implement');
+
       // Walk: review runs (stub → completed)
       const r2 = await walker.walk();
       assert.equal(r2?.type, 'ran');
```
```

## Full File Contents (for context)


=== FILE: packages/plugins/walker/src/engines/implement.ts ===
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
 * - 'collected'  — collected a running engine's terminal session result
 * - 'ran'        — ran a clockwork engine to completion inline
 * - 'launched'   — launched a quick engine's session
 * - 'spawned'    — created a new rig for a ready writ
 *
 * null means no work was available.
 */
export type WalkResult =
  | { type: 'collected'; rigId: string; engineId: string }
  | { type: 'ran'; rigId: string; engineId: string }
  | { type: 'launched'; rigId: string; engineId: string }
  | { type: 'spawned'; rigId: string; writId: string };

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
import type { WalkerApi, RigDoc, EngineInstance } from './types.ts';

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
  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string } = { status: 'completed' },
): {
  stacks: StacksApi;
  clerk: ClerkApi;
  fabricator: FabricatorApi;
  walker: WalkerApi;
  memBackend: InstanceType<typeof MemoryBackend>;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
  summonCalls: SummonRequest[];
  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string }) => void;
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
    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string }) {
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
      assert.equal(result.type, 'spawned');
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
      assert.equal(r1?.type, 'spawned');
      assert.equal((r1 as { writId: string }).writId, w1.id);

      // Mark rig1 as failed so w2 can spawn
      const rigs = await rigsBook(fix.stacks).list();
      await rigsBook(fix.stacks).patch(rigs[0].id, { status: 'failed' });

      const r2 = await walker.walk();
      assert.equal(r2?.type, 'spawned');
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
      assert.equal(r1?.type, 'spawned');

      // Second walk should run (not spawn another rig)
      // The draft engine will fail (no codexes), resulting in 'ran'
      const r2 = await walker.walk();
      assert.notEqual(r2?.type, 'spawned');
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
      assert.equal(r?.type, 'collected');
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

      // Now walk should launch implement (quick engine → 'launched', not 'ran')
      const result = await walker.walk();
      assert.equal(result?.type, 'launched');
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

      // Walk: implement launches an Animator session (quick engine → 'launched')
      const result = await walker.walk();
      assert.equal(result?.type, 'launched');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [rig1] = await book.list();
      const impl1 = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl1?.status, 'running', 'engine should be running after launch');
      assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');

      // Walk: collect step finds the terminal session and stores yields
      const result2 = await walker.walk();
      assert.equal(result2?.type, 'collected');
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
      assert.equal(result?.type, 'ran');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error?.includes('nonexistent-engine'));
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

      await walker.walk(); // launch implement

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

      await walker.walk(); // launch implement

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
      assert.equal(result?.type, 'collected');
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
      assert.equal(result?.type, 'collected');

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
    it('givensSpec contains the writ and config values set at spawn time', async () => {
      const { clerk, walker, stacks } = fix;
      const writ = await postWrit(clerk, 'My writ');
      await walker.walk(); // spawn

      const [rig] = await rigsBook(stacks).list();

      // All engines share the same givensSpec with writ + config values
      for (const engine of rig.engines) {
        assert.ok('writ' in engine.givensSpec, `engine ${engine.id} should have writ in givensSpec`);
        assert.ok('role' in engine.givensSpec, `engine ${engine.id} should have role in givensSpec`);
        const writInGivens = engine.givensSpec.writ as WritDoc;
        assert.equal(writInGivens.id, writ.id);
      }
    });

    it('role defaults to "artificer" when not configured', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const draftEngine = rig.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draftEngine?.givensSpec.role, 'artificer');
    });

    it('upstream map is built from completed engine yields', async () => {
      const { clerk, walker, stacks } = fix;
      await postWrit(clerk);
      await walker.walk(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft + implement as completed
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' };
      const implYields = { sessionId: 'stub', sessionStatus: 'completed' };
      const updatedEngines = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implYields };
        return e;
      });
      await book.patch(rig.id, { engines: updatedEngines });

      // Walk: review runs — stub clockwork (no external deps)
      const result = await walker.walk();
      assert.equal(result?.type, 'ran');
      assert.equal((result as { engineId: string }).engineId, 'review');
    });
  });

  // ── Full stub pipeline ─────────────────────────────────────────────

  describe('full pipeline with stubs', () => {
    it('walks through implement → review → revise stubs → rig completion → writ completed', async () => {
      const { clerk, walker, stacks } = fix;
      const writ = await postWrit(clerk, 'Full pipeline test');

      await walker.walk(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (real impl would need codexes)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Walk: implement launches an Animator session (quick engine)
      const r1 = await walker.walk();
      assert.equal(r1?.type, 'launched');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // Walk: collect step picks up the completed implement session
      const r1c = await walker.walk();
      assert.equal(r1c?.type, 'collected');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // Walk: review runs (stub → completed)
      const r2 = await walker.walk();
      assert.equal(r2?.type, 'ran');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // Walk: revise runs (stub → completed)
      const r3 = await walker.walk();
      assert.equal(r3?.type, 'ran');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

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


## Convention Reference (sibling files not modified by this commission)


=== CONTEXT FILE: packages/plugins/walker/src/walker.ts ===
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
 * All engines receive the same givensSpec (literal config values + writ).
 * Upstream yields arrive via context.upstream at run time.
 */
function buildStaticEngines(writ: WritDoc, config: WalkerConfig): EngineInstance[] {
  const givensSpec: Record<string, unknown> = {
    writ,
    role: config.role ?? 'artificer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec },
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
          return { type: 'collected', rigId: rig.id, engineId: engine.id };
        }

        // Completed session — assemble yields from session record.
        const yields: Record<string, unknown> = {
          sessionId: session.id,
          sessionStatus: session.status,
          ...(session.output !== undefined ? { output: session.output } : {}),
        };

        if (!isJsonSerializable(yields)) {
          await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
          return { type: 'collected', rigId: rig.id, engineId: engine.id };
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

        return { type: 'collected', rigId: rig.id, engineId: engine.id };
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
        return { type: 'ran', rigId: rig.id, engineId: pending.id };
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
          const launchedEngines = updatedRig.engines.map((e) =>
            e.id === pending.id
              ? { ...e, status: 'running' as const, sessionId: engineResult.sessionId }
              : e,
          );
          await rigsBook.patch(rig.id, { engines: launchedEngines });
          return { type: 'launched', rigId: rig.id, engineId: pending.id };
        }

        // Clockwork engine — validate and store yields
        if (!isJsonSerializable(engineResult.yields)) {
          await failEngine(updatedRig, pending.id, 'Engine yields are not JSON-serializable');
          return { type: 'ran', rigId: rig.id, engineId: pending.id };
        }

        const completedAt = new Date().toISOString();
        const completedEngines = updatedRig.engines.map((e) =>
          e.id === pending.id
            ? { ...e, status: 'completed' as const, yields: engineResult.yields, completedAt }
            : e,
        );
        const allCompleted = completedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: completedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        return { type: 'ran', rigId: rig.id, engineId: pending.id };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await failEngine(rig, pending.id, errorMessage);
        return { type: 'ran', rigId: rig.id, engineId: pending.id };
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
      } catch {
        // Writ may have already been transitioned (race); continue
      }

      return { type: 'spawned', rigId, writId: writ.id };
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
tree e02ba15a2be3e08df5f34d27f0850f561522be99:packages/plugins/walker/src/engines

draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

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

=== CONTEXT FILE: packages/plugins/walker/src/engines/draft.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */

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

    const yields: DraftYields = {
      draftId: draft.id,
      codexName: draft.codexName,
      branch: draft.branch,
      path: draft.path,
    };

    return { status: 'completed', yields };
  },
};

export default draftEngine;

=== CONTEXT FILE: packages/plugins/walker/src/engines/review.ts ===
/**
 * Review engine — stub (Increment 1).
 *
 * Returns a completed result with mock yields so the full pipeline can be
 * tested end-to-end. Increment 3 replaces this with real Animator-backed
 * quick engine execution.
 */

import type { EngineDesign } from '@shardworks/fabricator-apparatus';

const reviewEngine: EngineDesign = {
  id: 'review',

  async run(_givens, _context) {
    return {
      status: 'completed',
      yields: {
        sessionId: 'stub',
        passed: true,
        findings: 'Stub review — no findings.',
        mechanicalChecks: [],
      },
    };
  },
};

export default reviewEngine;


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
