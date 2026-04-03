# Walker Increment 1.1 — Spec Alignment & Test Gaps

Status: **Draft**

Complexity: **3**

Codex: nexus

## Authoritative Spec

The complete Walker design is at `docs/architecture/apparatus/walker.md`. This commission aligns the Increment 1 implementation with the authoritative spec on structural details and fills test gaps.

---

## Context

Increment 1 (`w-mni1acqg`) delivered all functional requirements — walk lifecycle, priority ordering, CDC handler, clockwork engines, stub pipeline. However the implementation diverged from the authoritative spec on several structural/naming details. This followup aligns them before Increment 2 builds on top.

---

## What to change

### 1. WalkResult — align discriminant and variant names

**Current (implementation):**
```typescript
type WalkResult =
  | { type: 'collected'; rigId: string; engineId: string }
  | { type: 'ran'; rigId: string; engineId: string }
  | { type: 'launched'; rigId: string; engineId: string }
  | { type: 'spawned'; rigId: string; writId: string }
```

**Target (spec):**
```typescript
type WalkResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Changes:
- Rename discriminant field from `type` to `action`
- Rename `collected` and `ran` to `engine-completed` (both represent a completed engine — one from collection, one from inline execution)
- Rename `launched` to `engine-started`
- Rename `spawned` to `rig-spawned`
- Add `rig-completed` variant — returned when the walk step causes a rig to reach a terminal state (either via collection or inline execution). This variant replaces the `engine-completed` return in those cases and includes the `outcome` field.

Update all references in `types.ts`, `walker.ts`, `tools/walk.ts`, and all tests.

### 2. Per-engine givensSpec

**Current:** All five engines receive an identical `givensSpec` bag containing `writ`, `role`, and optionally `buildCommand`/`testCommand`.

**Target:** Each engine gets only the givens it needs:

```typescript
{ id: 'draft',     givensSpec: { writ } }
{ id: 'implement', givensSpec: { writ, role } }
{ id: 'review',    givensSpec: { writ, role: 'reviewer', buildCommand, testCommand } }
{ id: 'revise',    givensSpec: { writ, role } }
{ id: 'seal',      givensSpec: {} }
```

Update `buildStaticEngines()` in `walker.ts`. This is important for setting precedent — when engines declare `needs` in the future, the givensSpec is what gets validated against those declarations. A sloppy givensSpec now means a harder migration later.

### 3. Add `baseSha` to DraftYields

**Current:** `DraftYields` has `draftId`, `codexName`, `branch`, `path`. No `baseSha`.

**Target:** Add `baseSha: string` — the HEAD commit SHA at the time the draft was opened. Read it via git after `openDraft()` returns.

```typescript
import { execSync } from 'node:child_process'

const baseSha = execSync('git rev-parse HEAD', { cwd: draft.path, encoding: 'utf-8' }).trim()
```

Update the `DraftYields` interface in `types.ts` and the `draft` engine in `engines/draft.ts`. This field is consumed by the review engine (Increment 3) to compute diffs.

### 4. Error handling improvements

**`trySpawn` — narrow the catch:** The current code catches all errors from `clerk.transition(writ.id, 'active')` silently. Narrow this to only swallow transition-state errors (the race condition where another Walker instance already transitioned the writ). Re-throw unexpected errors.

```typescript
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
```

**`walkContinual` tool — add error handling:** Wrap the walk() call in the polling loop with try/catch. Log the error and continue polling rather than crashing the loop.

### 5. Add missing test: yield serialization failure

The spec explicitly requested testing that non-JSON-serializable yields cause engine failure. Add a test:

- Register a custom engine design that returns `{ status: 'completed', yields: { fn: () => {} } }` (a function — not serializable)
- Spawn a rig, set up the engine to run
- Walk — expect the engine to fail with a serialization error message
- Verify rig status is `failed`

### 6. Add missing test: full pipeline without manual seal patch

The current full pipeline test manually patches the seal engine to `completed` instead of running it through the Walker. This is because the real seal engine calls the Scriptorium which isn't available in tests.

Fix: register a stub `seal` engine design in the test that returns `{ status: 'completed', yields: { sealedCommit: 'abc', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 1 } }`. Let the Walker run it. This tests the actual rig-completion path (all engines completed → rig completed → CDC → writ completed) without manual patching.

---

## What NOT to change

- **`upstream: string[]`** — Keep the array. The spec says `string | null` (single parent), but the implementation's `string[]` is more forward-looking for DAG support. The authoritative spec will be updated to match.
- **Rig status `'running'`** — Keep `'running'`. The spec says `'active'` but writs also use `'active'`, creating ambiguity. `'running'` is clearer for rigs. The authoritative spec will be updated to match.
- **`buildUpstreamMap` collecting all yields** — Keep the collect-all behavior. It's equivalent for the static graph and simpler than walking the chain. The spec's chain-walking pseudocode was illustrative, not prescriptive.

---

## What to validate

Tests should cover (in addition to existing 22 tests):

- **Yield serialization failure** — non-serializable yields cause engine failure
- **Full pipeline without manual patching** — Walker runs all 5 engines to completion
- **Per-engine givensSpec** — seal gets `{}`, implement gets `{ writ, role }`, review gets `{ writ, role, buildCommand, testCommand }`
- **WalkResult variant names** — all tests updated to use `action` discriminant
- **`baseSha` populated** — DraftYields includes baseSha from git HEAD

All existing tests must continue to pass (with updated assertions for renamed fields).

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.