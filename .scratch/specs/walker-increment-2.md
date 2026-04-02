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
