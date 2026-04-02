# The Walker — API Contract

Status: **Draft — MVP**

Package: `@shardworks/walker-apparatus` · Plugin id: `walker`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Walker runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Walker is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Walker runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `walk()` step function.

The Walker owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Walker itself is stateless between `walk()` calls; all state lives in the Stacks.

> **Design history:** The design decisions behind this spec are documented in `/workspace/nexus-mk2/docs/archive/design-sessions/walker-static-rig.md`.

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

- [The Rigging System](/workspace/nexus/docs/architecture/rigging.md) — full rigging architecture (Walker, Fabricator, Executor, Manifester). This spec implements a subset.
- [The Fabricator](/workspace/nexus/docs/architecture/apparatus/fabricator.md) — engine design registry and `EngineDesign` type definitions.
- [The Scriptorium](/workspace/nexus/docs/architecture/apparatus/scriptorium.md) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- [The Animator](/workspace/nexus/docs/architecture/apparatus/animator.md) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- [The Clerk](/workspace/nexus/docs/architecture/apparatus/clerk.md) — writ lifecycle API.
- [The Stacks](/workspace/nexus/docs/architecture/apparatus/stacks.md) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the [Fabricator spec](/workspace/nexus/docs/architecture/apparatus/fabricator.md) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

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
},
```

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

1. **Collect completed engines.** Scan all active rigs for engines with `status === 'running'`. For each, read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status, populate its yields, and propagate rig failure if needed. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and its upstream engine has `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (givensSpec + upstream yields) and context, then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance and mark it completed, all within the walk call. For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`, and return. Completion is collected on subsequent walk calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph.

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
      givensSpec: { writ, buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: 'review',
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: 'revise',
      givensSpec: {}, yields: null },
  ]
}
```

The `givensSpec` is populated from the Walker's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). Future: `givensSpec` will also hold template expressions (e.g. `${draft.worktreePath}`) that resolve dynamic values from upstream yields.

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

> **Scaffolding note:** For the static rig, the Walker merges all upstream yields into givens by engine id, alongside the givensSpec values set at spawn time. Each engine casts what it needs. This is adequate for a fixed five-engine pipeline where every engine knows exactly what's upstream. Future: a `needs` declaration on the engine design controls which upstream yields are included and how they're mapped — potentially via a template language like `${draft.worktreePath}`. This scaffolding gets replaced, not extended.

Each engine produces typed yields that downstream engines consume as givens. The yields are stored on the `EngineInstance.yields` field in the Stacks. When the Walker runs an engine, it assembles the givens by merging the givensSpec (set at rig spawn time) with upstream yields:

```typescript
function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
  // Collect all upstream yields (for the escape hatch and for merging)
  const upstream: Record<string, unknown> = {}
  let current = engine
  while (current.upstream) {
    const up = rig.engines.find(e => e.id === current.upstream)!
    upstream[up.id] = up.yields
    current = up
  }

  // Givens = givensSpec (literal values) + upstream yields, merged into one bag.
  // For the static rig, all upstream yields are included by engine id.
  // Future: givensSpec includes templates (e.g. ${draft.worktreePath}) that
  // resolve specific values from upstream yields into typed givens.
  const givens = { ...engine.givensSpec, ...upstream }

  const context: EngineRunContext = {
    engineId: engine.id,
    upstream,
  }

  return { givens, context }
}
```

For the static rig, all upstream yields are merged into givens by engine id. This means the `implement` engine sees `givens.writ` (from givensSpec) and `givens.draft` (upstream yields from the draft engine) in the same bag. Future: the givensSpec includes template expressions that resolve specific upstream values, replacing the blunt "merge everything" approach.

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

The review engine also writes `findings` to the commission data directory: `experiments/data/commissions/<writ-id>/review-findings.md`.

### `ReviseYields`

```typescript
interface ReviseYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
  wasNoOp: boolean    // true if the revise anima exited without making changes (review passed clean)
}
```

**Produced by:** `revise` engine (set by Walker's collect step when session completes)
**Consumed by:** `seal` (no data dependency — seal just needs revise to be done)

`wasNoOp` is determined by checking whether any new commits were made during the session. Useful for observability/cost analysis.

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
async run(givens: Record<string, unknown>, { engineId }: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = givens.draft as DraftYields

  const handle = animator.summon({
    role: givens.role as string,
    prompt: writ.body,
    cwd: draft.worktreePath,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId, writId: writ.id },
  })

  const sessionId = await getSessionIdFromHandle(handle)
  return { status: 'launched', sessionId }
}
```

The writ body is passed directly as the prompt. The `dispatch.sh` script appends the "commit your work" instruction to the writ body before posting — a stopgap that stays in `dispatch.sh`.

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
async run(givens: Record<string, unknown>, { engineId }: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = givens.draft as DraftYields

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
    role: 'reviewer',
    prompt,
    cwd: draft.worktreePath,
    metadata: {
      engineId,
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

Commit your findings before ending your session.
```

**Collect step:** The Walker reads the review findings file from the worktree, extracts `passed` from the "Overall: PASS/FAIL" line, and builds the yields:

```typescript
// In Walker's collect step
const session = await stacks.get('sessions', engine.sessionId)
const findings = await readFile(path.join(draft.worktreePath, 'review-findings.md'))
const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
const checks = session.metadata?.mechanicalChecks ?? []

engine.yields = { sessionId: session.id, passed, findings, mechanicalChecks: checks } satisfies ReviewYields

// Also write to commission data directory
await writeFile(`${commissionDir}/review-findings.md`, findings)
```

### `revise` (quick)

Summons an anima to address review findings.

```typescript
async run(givens: Record<string, unknown>, { engineId }: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = givens.draft as DraftYields
  const review = givens.review as ReviewYields

  const status = await gitStatus(draft.worktreePath)
  const diff = await gitDiffUncommitted(draft.worktreePath)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.worktreePath,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId, writId: writ.id },
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
and exit. Do not make unnecessary changes.
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

**Collect step:** Checks for new commits to detect no-op:

```typescript
const session = await stacks.get('sessions', engine.sessionId)
const currentSha = await getHeadSha(draft.worktreePath)
const wasNoOp = currentSha === preRevisionSha  // compare to SHA before revise session

engine.yields = { sessionId: session.id, sessionStatus: session.status, wasNoOp } satisfies ReviseYields
```

### `seal` (clockwork)

Seals the draft binding.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('scriptorium')
  const draft = givens.draft as DraftYields

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

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig; retry/recovery logic comes with dynamic extension later.

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

## Observability

The Laboratory does **not** need to watch the `rigs` book. Its existing observation points are sufficient:

- **Writ created** (existing CDC on writs book) → creates commission data dir, `commission.md`, `review.md` template, commission log skeleton. Unchanged.
- **Session started/ended** (existing CDC on sessions book) → writes per-session YAML records under `experiments/data/commissions/<writ-id>/sessions/`. With the Walker, a single commission now produces up to three sessions (implement, review, revise). The Laboratory already writes session records keyed by session ID, so multiple sessions per commission just means multiple files. No Laboratory changes needed.
- **Writ completed/failed** (existing CDC on writs book) → triggers quality scoring. Unchanged — the trigger is the writ transition, not the rig.

The review engine writes `review-findings.md` to the commission data directory. This is a new artifact but doesn't require Laboratory changes — the engine writes it directly.

---

## What This Spec Does NOT Cover

- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Future work.
- **Origination.** Commission → rig mapping is hardcoded (static graph). Future work.
- **The Executor as a separate apparatus.** For now, the Walker runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Walker processes multiple ready engines across rigs.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. A natural enhancement: during the "collect completed engines" step, the Walker checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Walker marks it failed (and optionally terminates the session). Out of scope for now — the polling loop will just keep checking until the session completes or fails on its own.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.
- **Framework sync.** `dispatch.sh` currently syncs `/workspace/nexus/` before dispatch. This is a dev environment concern, not the Walker's responsibility. Stays in operational tooling.
- **The "commit your work" instruction.** Stays in `dispatch.sh` as a stopgap appended to the writ body. Not promoted to the Walker. Fixed properly when the Loom gains role instructions.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.

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

---

## Commission Scope

This is a large piece of work. Recommended decomposition:

1. **Walker core + Fabricator + engine interface + static graph + clockwork engines (draft, seal) + CDC handler.** The Walker can spawn rigs, resolve engine designs from the Fabricator, walk the graph, run clockwork engines, and manage rig→writ lifecycle via CDC. The Fabricator scans kit `engines` contributions and exposes `getEngineDesign(id)` — shipped in the same increment. Quick engines are stubs that immediately return `{ status: 'completed', output: mockOutput }`. Validates: Walker→Fabricator seam, engine plugin API, rig data model, priority logic, engine readiness, graph traversal, yields storage and retrieval, failure propagation, rig→writ CDC transition. Tests should cover the full lifecycle with stubbed quick engines.

2. **Quick engine execution (implement).** Wire up the Animator integration — launching sessions, storing sessionId, polling for completion in the collect step. The Walker can now run `draft → implement → seal` as a working pipeline — functional parity with Dispatch, on the new architecture. Review and revise engines are still stubs.

3. **Review and revise engines.** Add prompt assembly, mechanical checks, findings extraction, and no-op detection. Register the `reviewer` role in the guild. Full `draft → implement → review → revise → seal` pipeline operational. This is where the quality improvement lands.
