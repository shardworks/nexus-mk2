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