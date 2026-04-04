## Commission Spec

---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 3
---

# Remove Dispatch Apparatus

## Summary

Delete the Dispatch apparatus package (`@shardworks/dispatch-apparatus`) and all references to it across the framework and live guild. The Spider has replaced the Dispatch as the guild's work runner; the Dispatch was explicitly designed as disposable interim infrastructure.

## Current State

The Dispatch apparatus lives at `/workspace/nexus/packages/plugins/dispatch/` as a pnpm workspace package. It exports a `Plugin` with:
- `apparatus.requires: ['clerk', 'codexes', 'animator']`
- `apparatus.recommends: ['loom']`
- `apparatus.provides: DispatchApi` (a single `next()` method)
- `apparatus.supportKit.tools: [dispatchNext]` (the `dispatch-next` CLI tool)

**No other package imports from `@shardworks/dispatch-apparatus`.** The Dispatch is a pure consumer of other apparatus APIs. Its `provides` API is only consumed by its own `dispatch-next` tool.

The live guild at `/workspace/vibers/` lists `"dispatch"` in its `guild.json` plugins array and has `@shardworks/dispatch-apparatus` as a dependency in `package.json`.

Five architecture docs reference the Dispatch as current infrastructure:
- `docs/architecture/apparatus/dispatch.md` — the Dispatch API contract doc
- `docs/architecture/apparatus/clerk.md` — references Dispatch as the current dispatch path
- `docs/architecture/apparatus/spider.md` — "replaces the Dispatch apparatus"
- `docs/architecture/apparatus/animator.md` — "the Dispatch sets GIT_AUTHOR_EMAIL"
- `docs/architecture/apparatus/scriptorium.md` — "Interim Dispatch Pattern" section
- `docs/architecture/apparatus/review-loop.md` — extensive MVP section built around Dispatch

## Requirements

- R1: The entire `packages/plugins/dispatch/` directory must be deleted from the framework repository.
- R2: The `"dispatch"` entry must be removed from `/workspace/vibers/guild.json` `plugins` array.
- R3: The `"@shardworks/dispatch-apparatus"` dependency must be removed from `/workspace/vibers/package.json`.
- R4: `docs/architecture/apparatus/dispatch.md` must be deleted.
- R5: References to "The Dispatch" as a current or interim apparatus in `clerk.md`, `spider.md`, `animator.md`, and `scriptorium.md` must be updated to reference the Spider / rigging system.
- R6: The "Interim Dispatch Pattern" section in `scriptorium.md` must be removed.
- R7: Dispatch-specific sections in `review-loop.md` (Option A, the MVP Dispatch-Level Review Loop section, and implementation notes for MVP) must be removed. Non-Dispatch content (empirical motivation, review criteria, artifact schema, Spider-level design) must be preserved.
- R8: `pnpm-lock.yaml` in the framework root must be regenerated via `pnpm install`.
- R9: `package-lock.json` in vibers must be regenerated via `npm install`.
- R10: The guild must start cleanly after removal — verified by running `nsg status` or equivalent guild startup command from the vibers directory.

## Design

### Package Deletion (R1)

Delete the entire directory tree:

```
packages/plugins/dispatch/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   ├── dispatch.ts
│   ├── types.ts
│   ├── dispatch.test.ts
│   └── tools/
│       ├── index.ts
│       └── dispatch-next.ts
├── dist/
└── node_modules/
```

Use `git rm -r packages/plugins/dispatch/` to ensure clean removal from version control.

### Guild Updates (R2, R3)

**`/workspace/vibers/guild.json`** — remove `"dispatch"` from the `plugins` array. The array currently reads:

```json
"plugins": [
  "stacks",
  "tools",
  "loom",
  "claude-code",
  "animator",
  "codexes",
  "clerk",
  "dispatch",
  "laboratory",
  "fabricator",
  "spider"
]
```

After: remove the `"dispatch"` line. The remaining plugins are unaffected — no plugin depends on Dispatch.

**`/workspace/vibers/package.json`** — remove this line from `dependencies`:

```json
"@shardworks/dispatch-apparatus": "file:../nexus/packages/plugins/dispatch",
```

### Doc: Delete dispatch.md (R4)

Delete `/workspace/nexus/docs/architecture/apparatus/dispatch.md` via `git rm`.

### Doc: clerk.md Updates (R5)

Three locations need updating:

**Line 15** — current text:
```
Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Spider, Executor, Fabricator). The Clerk tracks the obligation, not the execution.
```
Replace with:
```
Connecting writs to sessions is the job of the rigging system — the Spider assembles rigs, and engines execute the work. The Clerk tracks the obligation, not the execution.
```

**Line 350** — current text:
```
One commission = one mandate writ. No planning, no decomposition. Dispatch is handled by [The Dispatch](dispatch.md) — a separate apparatus that reads ready writs and runs them through the guild's session machinery.
```
Replace with:
```
One commission = one mandate writ. No planning, no decomposition. Execution is handled by the Spider, which spawns a rig for each ready writ and drives it through the engine pipeline.
```

**Lines 408–414, section header "Dispatch Integration"** — rename the section header to "Execution Integration" and reword the body. Current text:
```
### Dispatch Integration

The Clerk integrates with the dispatch layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Spider, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Spider calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
```
Replace with:
```
### Execution Integration

The Clerk integrates with the execution layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The Spider picks it up and spawns a rig to begin work. The Clerk does not know or care how the writ is executed — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes, the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. The Spider calls this when it strikes a completed rig. For direct-summon execution (standing orders), the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
```

### Doc: spider.md Update (R5)

**Line 13** — current text:
```
The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
```
Replace with:
```
The Spider is the spine of the guild's rigging system. It runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
```

### Doc: animator.md Update (R5)

**Line 449** — current text:
```
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the Dispatch sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.
```
Replace with:
```
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the implement engine sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.
```

### Doc: scriptorium.md — Remove Interim Section (R5, R6)

Delete the entire "Interim Dispatch Pattern" section (lines 529 through the end of the shell script example and closing paragraph, approximately lines 529–565). This section begins with `## Interim Dispatch Pattern` and contains a shell script example that predates both the Dispatch apparatus and Spider. Both now exist, making this section obsolete.

### Doc: review-loop.md — Surgical Removal (R7)

The review-loop.md must be updated to remove Dispatch-specific content while preserving the design thinking that applies to the Spider path. Specific changes:

1. **Line 5 (intro note)** — current text references "the Dispatch apparatus" and "an MVP path that works before the Spider exists." Rewrite to describe the review loop as a composition pattern within the rigging system (Spider and engine designs). Remove the mention of an MVP path.

2. **Line 17** — "The loop runs entirely within the dispatch pipeline using existing apparatus." Rewrite: "The loop runs entirely within the rigging pipeline using existing apparatus."

3. **Lines 45–76 (Design Decision section)** — remove "Option A: Dispatch-level wrapper (MVP path)" entirely (lines 45–51). Remove the "Decision" paragraph (lines 69–76) which says "Adopt both Option A (MVP) and Option B (full design)." Rewrite the Decision to state that Option B (review engines in the rig) is the chosen design. Keep Option B and Option C descriptions.

4. **Lines 79–232 (MVP: Dispatch-Level Review Loop section)** — remove this entire section. It covers `DispatchRequest` changes, review pass data flow through Dispatch, iteration cap within Dispatch, and escalation through Dispatch. None of this was implemented and the design is now dead.

5. **Lines 237** — "When the Spider is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic." Rewrite to remove the migration framing: the Spider is live, so this is just how the review loop works, not a migration target.

6. **Lines 444–458 (Configuration section)** — remove the "For the MVP (Dispatch-level)" paragraph and its JSON example. Keep only the Spider-level configuration paragraph.

7. **Lines 507–514 (Future Evolution, Phase 1)** — remove the "Phase 1 (MVP — Dispatch-level)" block. Renumber remaining phases.

8. **Lines 536–548 (Implementation Notes for MVP)** — remove this entire section. It describes changes to the Dispatch apparatus.

9. **Line 382** — "For the MVP (Dispatch-level), the Dispatch writes these artifacts directly." Remove this sentence; keep only the Spider-level description.

### Lockfile Regeneration (R8, R9)

After deleting the package and updating dependencies:

1. Run `pnpm install` in `/workspace/nexus/` to regenerate `pnpm-lock.yaml`.
2. Run `npm install` in `/workspace/vibers/` to regenerate `package-lock.json`.

### Startup Verification (R10)

After all changes, run `nsg status` (or equivalent guild startup command) from `/workspace/vibers/` to verify the guild starts cleanly without the Dispatch plugin.

### Non-obvious Touchpoints

**`/workspace/nexus/packages/framework/cli/README.md` line 187** — lists `nsg dispatch list` in a table of CLI commands. This is an aspirational command from `nexus-stdlib`, not from the Dispatch apparatus. It refers to Clockworks event dispatch records, not the Dispatch apparatus. Inspect but likely leave untouched — the word "dispatch" here refers to event dispatch, not the apparatus.

**`/workspace/nexus/docs/reference/core-api.md`** — references `recordDispatch`, `listDispatches`, `DispatchRecord`. These are Clockworks event dispatch records. Leave untouched — different concept from the Dispatch apparatus.

**`/workspace/nexus/docs/reference/event-catalog.md`** — uses "dispatch" to describe Clockworks event processing. Leave untouched.

**`/workspace/nexus/docs/architecture/_agent-context.md`** — "Commission → mandate writ → dispatch flow" — generic use of "dispatch." Leave untouched.

**`/workspace/nexus-mk2/docs/future/outdated-architecture/`** — several files reference Dispatch. These are already in the "outdated" folder documenting historical designs. Leave untouched.

## Validation Checklist

- V1 [R1]: `ls packages/plugins/dispatch` returns "No such file or directory." Run `git status` and confirm the directory is staged for deletion.
- V2 [R2, R3]: `cat /workspace/vibers/guild.json | grep dispatch` returns no output. `cat /workspace/vibers/package.json | grep dispatch` returns no output.
- V3 [R4]: `ls docs/architecture/apparatus/dispatch.md` returns "No such file or directory."
- V4 [R5]: `grep -r "The Dispatch" docs/architecture/apparatus/` returns no matches. `grep -r "\[The Dispatch\]" docs/architecture/apparatus/` returns no matches. `grep -r "dispatch\.md" docs/architecture/apparatus/` returns no matches.
- V5 [R6]: `grep "Interim Dispatch Pattern" docs/architecture/apparatus/scriptorium.md` returns no matches.
- V6 [R7]: `grep -c "Dispatch" docs/architecture/apparatus/review-loop.md` returns 0 (or only incidental lowercase "dispatch" in non-apparatus context). Verify: `grep "Option A" docs/architecture/apparatus/review-loop.md` returns no matches. `grep "MVP.*Dispatch" docs/architecture/apparatus/review-loop.md` returns no matches.
- V7 [R8]: `pnpm install` in `/workspace/nexus/` completes without errors. `grep dispatch pnpm-lock.yaml` returns no matches for the dispatch package.
- V8 [R9]: `npm install` in `/workspace/vibers/` completes without errors. `grep "dispatch-apparatus" package-lock.json` returns no matches.
- V9 [R10]: Run `nsg status` (or equivalent) from `/workspace/vibers/`. The guild starts without errors about missing plugins. Confirm no `dispatch` apparatus appears in the loaded apparatus list.
- V10 [R1]: `grep -r "@shardworks/dispatch-apparatus" packages/` returns no matches. `grep -r "from.*dispatch" packages/plugins/*/src/` returns no matches referencing the dispatch package.
- V11 [R5]: Read the updated sections of `clerk.md`, `spider.md`, `animator.md` and verify they reference "the Spider," "the rigging system," or "the implement engine" — not "The Dispatch."

## Test Cases

No new automated tests are required. This commission removes code; it does not add behavior.

- **Build passes after deletion:** `pnpm build` in the framework root completes without errors. The remaining packages have no import dependency on `@shardworks/dispatch-apparatus`.
- **Existing tests pass:** `pnpm test` in the framework root passes. No test file outside `packages/plugins/dispatch/` references the Dispatch.
- **Guild startup:** `nsg status` from `/workspace/vibers/` succeeds — Arbor loads the remaining plugins without error. No plugin declares `dispatch` in its `requires` array.
- **Typecheck passes:** `pnpm typecheck` in the framework root completes without errors. No TypeScript file imports types from the deleted package.

## Commission Diff

```
 docs/architecture/apparatus/animator.md            |   2 +-
 docs/architecture/apparatus/clerk.md               |  12 +-
 docs/architecture/apparatus/dispatch.md            | 229 --------
 docs/architecture/apparatus/review-loop.md         | 212 +------
 docs/architecture/apparatus/scriptorium.md         |  54 +-
 docs/architecture/apparatus/spider.md              |   4 +-
 .../plugins/codexes/src/scriptorium-core.test.ts   | 103 +++-
 packages/plugins/codexes/src/scriptorium-core.ts   |  18 +
 packages/plugins/dispatch/README.md                | 166 ------
 packages/plugins/dispatch/package.json             |  44 --
 packages/plugins/dispatch/src/dispatch.test.ts     | 606 ---------------------
 packages/plugins/dispatch/src/dispatch.ts          | 175 ------
 packages/plugins/dispatch/src/index.ts             |  27 -
 .../plugins/dispatch/src/tools/dispatch-next.ts    |  51 --
 packages/plugins/dispatch/src/tools/index.ts       |   5 -
 packages/plugins/dispatch/src/types.ts             |  54 --
 packages/plugins/dispatch/tsconfig.json            |  13 -
 pnpm-lock.yaml                                     |  53 --
 18 files changed, 134 insertions(+), 1694 deletions(-)

diff --git a/docs/architecture/apparatus/animator.md b/docs/architecture/apparatus/animator.md
index 2261a24..cd3aa9d 100644
--- a/docs/architecture/apparatus/animator.md
+++ b/docs/architecture/apparatus/animator.md
@@ -446,7 +446,7 @@ The Animator supports environment variable injection into the spawned session pr
 Environment variables come from two sources, merged at session launch time:
 
 1. **AnimaWeave** (`context.environment`) — identity-layer defaults from The Loom. Set per-role. Example: `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`.
-2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the Dispatch sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.
+2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the implement engine sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.
 
 The merge is simple: `{ ...weave.environment, ...request.environment }`. Request values override weave values for the same key. The merged result is passed to the session provider as `SessionProviderConfig.environment`, which the provider spreads into the child process environment (`{ ...process.env, ...config.environment }`).
 
diff --git a/docs/architecture/apparatus/clerk.md b/docs/architecture/apparatus/clerk.md
index c6ea948..7cb2af8 100644
--- a/docs/architecture/apparatus/clerk.md
+++ b/docs/architecture/apparatus/clerk.md
@@ -12,7 +12,7 @@ Package: `@shardworks/clerk-apparatus` · Plugin id: `clerk`
 
 The Clerk is the guild's obligation authority. It receives commissions from the patron, issues writs that formally record what is owed, manages the lifecycle of those writs through to completion or failure, and maintains the Ledger — the guild's book of work.
 
-The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Spider, Executor, Fabricator). The Clerk tracks the obligation, not the execution.
+The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the rigging system — the Spider assembles rigs, and engines execute the work. The Clerk tracks the obligation, not the execution.
 
 The Clerk does **not** execute work. It does not launch sessions, manage rigs, or orchestrate engines. It tracks obligations: what has been commissioned, what state each obligation is in, and whether the guild has fulfilled its commitments. When the Clockworks and rigging system exist, the Clerk will integrate with them via lifecycle events and signals.
 
@@ -347,7 +347,7 @@ Commission intake is a single synchronous step:
 └─ 4. Returns WritDoc to caller
 ```
 
-One commission = one mandate writ. No planning, no decomposition. Dispatch is handled by [The Dispatch](dispatch.md) — a separate apparatus that reads ready writs and runs them through the guild's session machinery.
+One commission = one mandate writ. No planning, no decomposition. Execution is handled by the Spider, which spawns a rig for each ready writ and drives it through the engine pipeline.
 
 ---
 
@@ -405,13 +405,13 @@ A new method on `ClerkApi`:
 signal(id: string): Promise<void>
 ```
 
-### Dispatch Integration
+### Execution Integration
 
-The Clerk integrates with the dispatch layer at two points:
+The Clerk integrates with the execution layer at two points:
 
-**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Spider, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.
+**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The Spider picks it up and spawns a rig to begin work. The Clerk does not know or care how the writ is executed — it signals readiness; the guild's configuration determines the response.
 
-**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Spider calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
+**Inbound: Completion Signal.** When work completes, the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. The Spider calls this when it strikes a completed rig. For direct-summon execution (standing orders), the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.
 
 ### Intake with Planning
 
diff --git a/docs/architecture/apparatus/dispatch.md b/docs/architecture/apparatus/dispatch.md
deleted file mode 100644
index f3b2e29..0000000
--- a/docs/architecture/apparatus/dispatch.md
+++ /dev/null
@@ -1,229 +0,0 @@
-# The Dispatch — API Contract
-
-Status: **Draft**
-
-Package: `@shardworks/dispatch-apparatus` · Plugin id: `dispatch`
-
-> **⚠️ Temporary rigging.** This apparatus is a stand-in for the full rigging system (Spider, Fabricator, Executor). It provides a single dispatch tool that takes the oldest ready writ and runs it through the guild's existing machinery. When the full rigging system exists, this apparatus is retired and its responsibilities absorbed by the Spider and summon relay. Designed to be disposable.
-
----
-
-## Purpose
-
-The Dispatch is the guild's interim work runner. It bridges the gap between the Clerk (which tracks obligations) and the session machinery (which runs animas) — without the full rigging system.
-
-It does one thing: find a ready writ and execute it. "Execute" means open a draft binding on the target codex, compose context for an anima via the Loom, launch a session via the Animator, and handle the aftermath (seal the draft, transition the writ). This is the minimum viable loop that turns a commission into delivered work.
-
-The Dispatch does **not** decompose writs, manage engine chains, or run multiple steps. One writ, one session. If the session completes, the draft is sealed and the writ is completed. If it fails, the writ is failed. That's the whole lifecycle.
-
----
-
-## Dependencies
-
-```
-requires: ['stacks', 'clerk', 'codexes', 'animator']
-recommends: ['loom']
-```
-
-- **The Stacks** (required) — reads writs via the Clerk's book.
-- **The Clerk** (required) — queries ready writs and transitions their status.
-- **The Scriptorium** (required) — opens and seals draft bindings on the target codex.
-- **The Animator** (required) — launches anima sessions. Uses `summon()` (high-level, Loom-composed) when the Loom is available, `animate()` (low-level) otherwise.
-- **The Loom** (recommended) — composes session context (system prompt, tools, role instructions). Resolved at dispatch time via the Animator's `summon()`. Not a direct dependency of the Dispatch — it's the Animator that calls the Loom.
-
----
-
-## Kit Interface
-
-The Dispatch does not consume kit contributions. No `consumes` declaration.
-
----
-
-## Support Kit
-
-```typescript
-supportKit: {
-  tools: [dispatchNext],
-},
-```
-
-### `dispatch-next` tool
-
-Find the oldest ready writ and dispatch it. This is the primary entry point — callable from the CLI via `nsg dispatch-next` or programmatically.
-
-| Parameter | Type | Required | Description |
-|-----------|------|----------|-------------|
-| `role` | `string` | no | Role to summon (default: `"artificer"`) |
-| `dryRun` | `boolean` | no | If true, find and report the writ but don't dispatch |
-
-Returns a dispatch summary: writ id, session id, outcome.
-
-Permission: `dispatch:write`
-
-Callable by: `cli` (patron-side operation, not an anima tool)
-
----
-
-## `DispatchApi` Interface (`provides`)
-
-```typescript
-interface DispatchApi {
-  /**
-   * Find the oldest ready writ and execute it.
-   *
-   * The full dispatch lifecycle:
-   *   1. Query the Clerk for the oldest ready writ
-   *   2. Transition the writ to active
-   *   3. Open a draft binding on the writ's codex (if specified)
-   *   4. Summon an anima session with the writ context as prompt
-   *   5. Wait for session completion
-   *   6. On success: seal the draft, push, transition writ to completed
-   *   7. On failure: abandon the draft, transition writ to failed
-   *
-   * Returns null if no ready writs exist.
-   *
-   * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
-   * skipped — the session runs in the guild home directory with
-   * no codex binding.
-   */
-  next(request?: DispatchRequest): Promise<DispatchResult | null>
-}
-
-interface DispatchRequest {
-  /** Role to summon. Default: 'artificer'. */
-  role?: string
-  /** If true, find and report the writ but don't dispatch. */
-  dryRun?: boolean
-}
-
-interface DispatchResult {
-  /** The writ that was dispatched. */
-  writId: string
-  /** The session id (from the Animator). Absent if dryRun. */
-  sessionId?: string
-  /** Terminal writ status after dispatch. Absent if dryRun. */
-  outcome?: 'completed' | 'failed'
-  /** Resolution text set on the writ. Absent if dryRun. */
-  resolution?: string
-  /** Whether this was a dry run. */
-  dryRun: boolean
-}
-```
-
----
-
-## Dispatch Lifecycle
-
-```
-dispatch.next({ role: 'artificer' })
-│
-├─ 1. Query Clerk: oldest writ where status = 'ready', ordered by createdAt asc
-│     → if none found, return null
-│
-├─ 2. Clerk: transition writ ready → active
-│
-├─ 3. [if writ.codex] Scriptorium: openDraft({ codex: writ.codex })
-│     → draftRecord (worktree path = session cwd)
-│     → if no codex on writ, cwd = guild home
-│
-├─ 4. Animator: summon({
-│       role,
-│       prompt: <assembled from writ title + body>,
-│       cwd: draftRecord.path (or guild home),
-│       environment: {
-│         GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
-│       },
-│       metadata: { writId: writ.id, trigger: 'dispatch' }
-│     })
-│     → { chunks, result }
-│
-├─ 5. Await result
-│
-├─ 6a. [success] Session completed normally
-│      ├─ [if codex] Scriptorium: seal({ codex, branch: draft.branch })
-│      ├─ [if codex] Scriptorium: push({ codex })
-│      ├─ Clerk: transition writ active → completed
-│      │    resolution = session result summary
-│      └─ return DispatchResult { outcome: 'completed' }
-│
-└─ 6b. [failure] Session failed or errored
-       ├─ [if codex] Scriptorium: abandonDraft({ codex, branch: draft.branch, force: true })
-       ├─ Clerk: transition writ active → failed
-       │    resolution = failure reason from session
-       └─ return DispatchResult { outcome: 'failed' }
-```
-
-### Prompt Assembly
-
-The dispatch prompt is assembled from the writ's fields. The anima receives enough context to understand its assignment and use the `writ-show` tool for full details:
-
-```
-You have been dispatched to fulfill a commission.
-
-## Assignment
-
-**Title:** {writ.title}
-
-**Writ ID:** {writ.id}
-
-{writ.body}
-```
-
-The prompt is intentionally minimal — the anima's curriculum and role instructions carry the craft knowledge. The Dispatch just delivers the assignment.
-
-The Dispatch owns the writ transition — the anima does not call `writ-complete` or `writ-fail`. The Dispatch observes the session outcome and transitions the writ accordingly. This keeps writ lifecycle management out of the anima's instructions, which simplifies the prompt and avoids relying on animas to self-report correctly.
-
-### Git Identity
-
-The Dispatch sets per-writ git identity via the `environment` field on the summon request. The Loom provides role-level defaults (e.g. `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`). The Dispatch overrides the email with the writ ID for per-commission attribution:
-
-```typescript
-environment: {
-  GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
-}
-```
-
-This produces commits authored by `Artificer <w-{writId}@nexus.local>`, enabling commit-level tracing back to the originating commission. The committer identity is left to the system default so that commit signatures remain verified on GitHub. The Animator merges these overrides with the Loom's defaults (request overrides weave) and passes the result to the session provider.
-
-### Error Handling
-
-- **No ready writs:** `next()` returns null. Not an error.
-- **Draft open fails:** Writ transitions to `failed` with resolution describing the Scriptorium error. No session launched.
-- **Session fails:** Draft abandoned, writ failed. The Animator already records the session result to the Stacks.
-- **Seal fails (contention):** Writ transitions to `failed`. The draft is NOT abandoned — the inscriptions are preserved for manual recovery or re-dispatch. Resolution describes the seal failure.
-- **Push fails:** Same as seal failure — writ failed, draft preserved.
-
----
-
-## Configuration
-
-No configuration. The Dispatch reads writs from the Clerk and uses default behaviors for all apparatus calls. The role is specified per dispatch via the tool parameter.
-
----
-
-## Open Questions
-
-- **Should dispatch-next accept a specific writ id?** The current design always picks the oldest ready writ. An `id` parameter would let the patron dispatch a specific commission. Probably useful — but adds complexity (what if the writ isn't ready? what if it doesn't exist?). Could add later.
-
----
-
-## Future: Retirement
-
-When the full rigging system (Spider, Fabricator, Executor) is implemented, the Dispatch apparatus is retired:
-
-- The Spider takes over rig spawning and engine traversal
-- The summon relay handles anima dispatch from standing orders
-- The Fabricator resolves engine chains (draft-open → session → seal is just one possible chain)
-- `dispatch-next` is replaced by the Clockworks processing `mandate.ready` events
-
-The Dispatch is designed to be removable with zero impact on the Clerk, Scriptorium, Animator, or Loom. It is a consumer of their APIs, not a provider of anything they depend on.
-
----
-
-## Implementation Notes
-
-- Small apparatus — types, core dispatch logic, one tool, barrel. ~5 source files.
-- The `next()` method is the entire API surface. No books, no state, no CDC. Pure orchestration.
-- The Dispatch queries the Clerk's writs book via `clerk.list({ status: 'ready' })` with a limit of 1 and ordered by `createdAt` asc. The `['status', 'createdAt']` compound index on the writs book makes this efficient.
-- Session `cwd` is the draft worktree path when a codex is specified, or the guild home directory otherwise.
-- The prompt template is hardcoded in the apparatus, not configurable. This is disposable infrastructure — configurability is wasted investment.
diff --git a/docs/architecture/apparatus/review-loop.md b/docs/architecture/apparatus/review-loop.md
index 64038e0..2dbca75 100644
--- a/docs/architecture/apparatus/review-loop.md
+++ b/docs/architecture/apparatus/review-loop.md
@@ -2,7 +2,7 @@
 
 Status: **Design** (not yet implemented)
 
-> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — that lives at the intersection of the Spider, the Executor, and the Dispatch apparatus. This document specifies the full design, including an MVP path that works before the Spider exists.
+> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — within the rigging system. This document specifies the design as implemented in the Spider.
 
 ---
 
@@ -14,7 +14,7 @@ This is not a general-purpose test harness. The review loop does one thing: catc
 
 **What the review loop is not:**
 - A replacement for spec quality. A bad spec produces bad work; the review loop helps only when the anima had the information to succeed but failed in execution.
-- A Clockworks-dependent system. The loop runs entirely within the dispatch pipeline using existing apparatus.
+- A Clockworks-dependent system. The loop runs entirely within the rigging pipeline using existing apparatus.
 - A complete quality gate. The MVP catches mechanical failures; richer review criteria are future scope.
 
 ---
@@ -42,19 +42,11 @@ Both are catchable with cheap, mechanical review criteria. Neither requires an L
 
 Three candidate locations were considered:
 
-### Option A: Dispatch-level wrapper (MVP path)
-
-The Dispatch apparatus (`dispatch-next`) runs the implementation session, then runs a review pass, then optionally a revision session — all within a single dispatch call. No new apparatus; no Spider dependency.
-
-**Pros:** Implementable now. Works with existing infrastructure. Dispatch is already the single entry point for writ execution.
-
-**Cons:** The Dispatch is temporary infrastructure, scheduled for retirement when the Spider is implemented. Any logic added to Dispatch must be migrated. Also, the dispatch-level wrapper can only retry the entire session; it cannot retry a subcomponent.
-
 ### Option B: Review engine in every rig (full design)
 
 The Spider seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.
 
-**Pros:** Architecturally clean. Composes naturally with Spider's traversal. Reusable engine designs. No migration from Dispatch required — Dispatch simply dispatches, and the rig handles iteration.
+**Pros:** Architecturally clean. Composes naturally with Spider's traversal. Reusable engine designs. Composes naturally with the Spider — the rig handles iteration natively.
 
 **Cons:** Requires the Spider. Not implementable until the rigging system exists.
 
@@ -68,173 +60,13 @@ The origination engine seeds rigs with review chains by default. Superficially s
 
 ### Decision
 
-**Adopt both Option A (MVP) and Option B (full design).**
-
-The Dispatch-level wrapper is the MVP: implementable now, catches the known failure modes, produces data on review loop effectiveness. When the Spider is implemented, the review logic migrates to engine designs (Option B), and the Dispatch drops its review wrapping entirely. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.
+**Option B (review engines in the rig) is the chosen design.**
 
-The two designs share the same review criteria and artifact schemas — the MVP is a direct precursor to the full design, not a throwaway.
+The Spider seeds every rig with an `implement → review → revise → seal` chain. The review engine is a clockwork engine that runs mechanical checks and a reviewer session; the revise engine is a quick engine. Both are standard engine designs contributed by the Spider's support kit. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.
 
 ---
 
-## MVP: Dispatch-Level Review Loop
-
-The Dispatch `next()` method gains an optional `review` configuration. When enabled, after the implementation session completes, the Dispatch runs a review pass and conditionally launches a revision session.
-
-### Data Flow
-
-```
-dispatch.next({ role: 'artificer', review: { enabled: true, maxRetries: 2 } })
-│
-├─ 1. Claim oldest ready writ (existing Dispatch logic)
-├─ 2. Open draft binding (existing)
-├─ 3. Launch implementation session (existing)
-├─ 4. Await session completion
-│
-├─ [loop: up to maxRetries times]
-│   ├─ 5. Run review pass against worktree
-│   │      → ReviewResult { passed: boolean, failures: ReviewFailure[] }
-│   │
-│   ├─ [if passed] → break loop, proceed to seal
-│   │
-│   └─ [if failed]
-│       ├─ 6. Write review artifact to commission data dir
-│       ├─ 7. Launch revision session
-│       │      context: original writ + review failures + git status/diff
-│       └─ 8. Await revision session completion
-│
-├─ [if loop exhausted without passing]
-│   ├─ 9. Write escalation artifact
-│   ├─ 10. Abandon draft
-│   └─ 11. Fail writ with resolution: "Review loop exhausted after N retries. See review artifacts."
-│
-└─ [if passed] → seal, push, complete writ (existing logic)
-```
-
-### Review Pass
-
-The review pass is a synchronous, in-process check — not an anima session. It runs directly against the worktree. For MVP, three checks:
-
-**Check 1: Uncommitted changes** (always enabled)
-
-```
-git -C <worktree> status --porcelain
-```
-
-Fails if output is non-empty. This catches the most common failure mode: the anima did the work but did not commit. Cheap, fast, definitive.
-
-**Check 2: Build** (enabled if `guild.json` declares `review.buildCommand`)
-
-```
-<buildCommand> run in worktree
-```
-
-Fails if exit code is non-zero. Catches regressions introduced during implementation.
-
-**Check 3: Tests** (enabled if `guild.json` declares `review.testCommand`)
-
-```
-<testCommand> run in worktree
-```
-
-Fails if exit code is non-zero. Captures stdout/stderr for inclusion in revision context.
-
-Each check produces a `ReviewFailure`:
-
-```typescript
-interface ReviewFailure {
-  check: 'uncommitted_changes' | 'build' | 'test'
-  message: string        // human-readable summary
-  detail?: string        // command output (truncated to 4KB)
-}
-
-interface ReviewResult {
-  passed: boolean
-  attempt: number        // 1-based: which attempt produced this result
-  checks: ReviewCheck[]  // all checks run (pass or fail)
-  failures: ReviewFailure[]
-}
-
-interface ReviewCheck {
-  check: 'uncommitted_changes' | 'build' | 'test'
-  passed: boolean
-  durationMs: number
-}
-```
-
-### Revision Context
-
-When review fails, the revising anima receives a prompt assembled from:
-
-1. **Original writ** — the full writ title and body (same as initial dispatch)
-2. **Review failure report** — structured description of what checks failed and why
-3. **Worktree state** — output of `git status` and `git diff HEAD` (if there are staged/unstaged changes)
-
-The prompt template:
-
-```
-You have been dispatched to revise prior work on a commission.
-
-## Assignment
-
-**Title:** {writ.title}
-
-**Writ ID:** {writ.id}
-
-{writ.body}
-
----
-
-## Review Findings (Attempt {attempt})
-
-The previous implementation attempt did not pass automated review.
-The following checks failed:
-
-{for each failure}
-### {check name}
-{message}
-
-{detail (if present)}
-{end for}
-
----
-
-## Current Worktree State
-
-### git status
-{git status output}
-
-### git diff HEAD
-{git diff HEAD output, truncated to 8KB}
-
----
-
-Revise the work to address the review findings. Commit all changes before your session ends.
-```
-
-The revision session runs in the same worktree as the original implementation. It can see the prior work and build on it, not start from scratch.
-
-### Iteration Cap
-
-`maxRetries` defaults to 2. This means at most 3 sessions per writ: 1 implementation + 2 revisions. The cap is hard — the Dispatch does not exceed it regardless of review outcome.
-
-Rationale: a third failed attempt almost always indicates a spec problem, an environment problem, or a complexity overrun — none of which another revision pass will fix. Escalating to the patron is the right call.
-
-### Escalation
-
-When the loop exhausts its retry budget without passing review:
-
-1. The draft is abandoned (preserving the inscriptions for patron inspection)
-2. The writ is transitioned to `failed`
-3. The writ resolution is set to: `"Review loop exhausted after {N} retries. See review artifacts in commission data directory."`
-4. All review artifacts are preserved (see Artifact Schema below)
-
-The patron can inspect the artifacts, diagnose the failure mode, and either rewrite the spec or manually review the worktree before re-dispatching.
-
----
-
-## Full Design: Review Engines in the Rig
-
-When the Spider is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic.
+## Review Engines in the Rig
 
 ### Engine Designs
 
@@ -323,7 +155,7 @@ The Spider traverses this graph naturally. Each engine completes and propagates
 
 The Spider needs no changes to support the review loop. It already:
 - Traverses all engines whose upstream is complete
-- Dispatches ready engines to the Executor
+- Routes ready engines to the Executor
 - Handles both clockwork and quick engine kinds
 
 The review loop is just a graph shape that Spider happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Spider itself is agnostic.
@@ -379,7 +211,7 @@ experiments/data/commissions/<writ-id>/
     escalation.md        (if loop exhausted; patron-facing summary)
 ```
 
-For the MVP (Dispatch-level), the Dispatch writes these artifacts directly. For the full design (Spider-level), the review engine writes them via the Stacks or directly to the commission data directory.
+The review engine writes these artifacts via the Stacks or directly to the commission data directory.
 
 ### `review.md` Schema
 
@@ -441,7 +273,7 @@ achieving a passing review. The draft has been abandoned.
 
 ## Configuration
 
-For the MVP (Dispatch-level), review configuration lives in `guild.json`:
+Review configuration lives in `guild.json`:
 
 ```json
 {
@@ -454,9 +286,7 @@ For the MVP (Dispatch-level), review configuration lives in `guild.json`:
 }
 ```
 
-All fields are optional. `enabled` defaults to `false` for the MVP (opt-in). The intent is to make it default-on once the loop has been validated in practice.
-
-For the full design (Spider-level), the same configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.
+All fields are optional. `enabled` defaults to `false` (opt-in). The intent is to make it default-on once the loop has been validated in practice. This configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.
 
 ---
 
@@ -506,13 +336,6 @@ This commission is itself a spec-writing commission. There's no build command to
 
 ## Future Evolution
 
-### Phase 1 (MVP — Dispatch-level)
-- `uncommitted_changes` check always enabled
-- `build` and `test` checks opt-in via `guild.json`
-- `maxRetries: 2` hard cap
-- Artifacts written to commission data directory
-- Opt-in via `review.enabled: true` in `guild.json`
-
 ### Phase 2 (Spider-level engine designs)
 - `review` clockwork engine contributed by a kit
 - `revise` quick engine contributed by the same kit
@@ -531,18 +354,3 @@ This commission is itself a spec-writing commission. There's no build command to
 - Arbitrary retry depth (or patron-configured per-commission)
 - Review loop data feeds Surveyor codex profiles (this codex has a 60% first-try rate → seed richer review graph by default)
 
----
-
-## Implementation Notes for MVP
-
-The MVP requires changes to the Dispatch apparatus only:
-
-1. **Add `ReviewConfig` to `DispatchRequest`** — optional field, all checks disabled by default
-2. **Add `runReviewPass(worktreePath, config)` function** — pure function, no apparatus dependencies, runs git/build/test checks, returns `ReviewResult`
-3. **Add `assembleRevisionPrompt(writ, reviewResult, worktreeState)` function** — pure function, returns string
-4. **Extend `dispatch.next()` loop** — after implementation session, call `runReviewPass`; if failed and retries remain, launch revision session via `animator.summon()` with the revision prompt
-5. **Write artifacts** — write `review-loop/attempt-N/review.md` and supporting files after each review pass. The commission data directory path is owned by the Laboratory; the Dispatch needs to know where it is, or the Laboratory's CDC hook writes these based on session metadata.
-
-> **Artifact writing ownership:** The Laboratory currently auto-writes commission artifacts via CDC on session completion. It does not know about individual review passes within a dispatch. Two options: (a) Dispatch writes review artifacts directly to the commission data directory (requires Dispatch to know the Laboratory's path convention), or (b) review pass results are stored in the Stacks (a `review-passes` book) and the Laboratory's CDC picks them up. Option (b) is architecturally cleaner — the Stacks is the record of everything, and the Laboratory writes files from it. This is a detail for the implementing session to resolve.
-
-The implementing session should also update the `DispatchResult` type to include `reviewAttempts?: number` and surface this in the dispatch summary.
diff --git a/docs/architecture/apparatus/scriptorium.md b/docs/architecture/apparatus/scriptorium.md
index 8195bf1..09f339a 100644
--- a/docs/architecture/apparatus/scriptorium.md
+++ b/docs/architecture/apparatus/scriptorium.md
@@ -500,14 +500,11 @@ The binding between a session and a draft is the caller's responsibility. The ty
     │     → session runs, anima inscribes in the draft
     │     → session exits
     │
-    ├─ 3. scriptorium.seal({ codexName, sourceBranch })
-    │     → draft sealed into codex
-    │
-    └─ 4. scriptorium.push({ codexName })
-          → sealed binding pushed to remote
+    └─ 3. scriptorium.seal({ codexName, sourceBranch })
+          → draft sealed into codex and pushed to remote
 ```
 
-The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal, push) happen outside the session, ensuring they execute even if the session crashes or times out.
+The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal) happen outside the session, ensuring they execute even if the session crashes or times out.
 
 ### The `DraftRecord` as handoff object
 
@@ -526,48 +523,6 @@ Animas cannot reliably manage their own draft lifecycle. A session's working dir
 
 ---
 
-## Interim Dispatch Pattern
-
-Before rig engines and the Clockworks exist, a shell script orchestrates the open → session → seal → push lifecycle. This is the recommended interim pattern:
-
-```bash
-#!/usr/bin/env bash
-# dispatch-commission.sh — open a draft, run a session, seal and push
-set -euo pipefail
-
-CODEX="${1:?codex name required}"
-ROLE="${2:?role required}"
-PROMPT="${3:?prompt required}"
-
-# 1. Open a draft binding (branch auto-generated)
-DRAFT=$(nsg codex draft-open --codexName "$CODEX")
-
-DRAFT_PATH=$(echo "$DRAFT" | jq -r '.path')
-DRAFT_BRANCH=$(echo "$DRAFT" | jq -r '.branch')
-
-# 2. Run the session in the draft
-nsg summon \
-  --role "$ROLE" \
-  --cwd "$DRAFT_PATH" \
-  --prompt "$PROMPT" \
-  --metadata "{\"codex\": \"$CODEX\", \"branch\": \"$DRAFT_BRANCH\"}"
-
-# 3. Seal the draft into the codex
-nsg codex draft-seal \
-  --codexName "$CODEX" \
-  --sourceBranch "$DRAFT_BRANCH"
-
-# 4. Push the sealed binding to the remote
-nsg codex codex-push \
-  --codexName "$CODEX"
-
-echo "Commission sealed and pushed for $CODEX ($DRAFT_BRANCH)"
-```
-
-This script is intentionally simple — no error recovery, no retry logic beyond what `draft-seal` provides internally. A failed seal leaves the draft in place for manual inspection. A failed push leaves the sealed binding local — re-running `codex-push` is safe. The auto-generated branch name flows through the `DraftRecord` — the orchestrator never needs to invent one.
-
----
-
 ## Bare Clone Architecture
 
 The Scriptorium maintains **bare clones** of each codex under `.nexus/codexes/<name>.git`. This is the local git infrastructure that makes draft operations fast and network-efficient.
@@ -616,7 +571,8 @@ draft-seal
   │        └─ If rebase conflicts: FAIL (no auto-resolution)
   │        └─ If rebase succeeds: retry ff (up to maxRetries)
   ├─ 4. Update target branch ref in bare clone
-  └─ 5. Abandon draft (unless keepDraft)
+  ├─ 5. Push target branch to remote (git push origin <branch>)
+  └─ 6. Abandon draft (unless keepDraft)
 
 codex-push
   ├─ 1. git push origin <branch> (from bare clone)
diff --git a/docs/architecture/apparatus/spider.md b/docs/architecture/apparatus/spider.md
index d1cdb51..119a43e 100644
--- a/docs/architecture/apparatus/spider.md
+++ b/docs/architecture/apparatus/spider.md
@@ -10,7 +10,7 @@ Package: `@shardworks/spider-apparatus` · Plugin id: `spider`
 
 ## Purpose
 
-The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
+The Spider is the spine of the guild's rigging system. It runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.
 
 The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.
 
@@ -281,7 +281,7 @@ interface SealYields {
 **Produced by:** `seal` engine
 **Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.
 
-> **Note:** Field names mirror the Scriptorium's `SealResult` type. Push is a separate Scriptorium operation — the seal engine seals but does not push.
+> **Note:** Field names mirror the Scriptorium's `SealResult` type. The Scriptorium's `seal()` method pushes the target branch to the remote after sealing.
 
 ---
 
diff --git a/packages/plugins/codexes/src/scriptorium-core.test.ts b/packages/plugins/codexes/src/scriptorium-core.test.ts
index 5c68e70..bb1bf0c 100644
--- a/packages/plugins/codexes/src/scriptorium-core.test.ts
+++ b/packages/plugins/codexes/src/scriptorium-core.test.ts
@@ -1003,19 +1003,102 @@ describe('ScriptoriumCore', () => {
       // External push advances remote
       pushExternalCommit(remote.url, 'external.txt', 'external\n');
 
-      // Seal — must rebase onto the remote-advanced main
+      // Seal — must rebase onto the remote-advanced main; seal now also pushes
       const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
       assert.equal(result.strategy, 'rebase');
 
-      // Push should fast-forward cleanly (the sealed binding is rebased on remote's latest)
-      await assert.doesNotReject(
-        () => api.push({ codexName: 'test-codex' }),
-        'Push should succeed after sealing against diverged remote',
-      );
+      // Confirm remote has the sealed commit (seal() pushed it)
+      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
+      assert.equal(remoteHead, result.sealedCommit);
+    });
+
+    it('seal pushes to remote', async () => {
+      const remote = createRemoteRepo();
+      const { core } = createStartedCore();
+      const api = core.createApi();
+
+      await api.add('test-codex', remote.url);
+      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });
+
+      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
+      gitSync(['config', 'user.name', 'Test'], draft.path);
+      fs.writeFileSync(path.join(draft.path, 'seal-push.txt'), 'seal push\n');
+      gitSync(['add', 'seal-push.txt'], draft.path);
+      gitSync(['commit', '-m', 'Seal push test'], draft.path);
+
+      // seal() should push automatically — no explicit push() call
+      const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
+      assert.equal(result.success, true);
+
+      // Remote must have the sealed commit without a separate push()
+      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
+      assert.equal(remoteHead, result.sealedCommit);
+    });
+
+    it('seal pushes on no-op seal', async () => {
+      const remote = createRemoteRepo();
+      const { core } = createStartedCore();
+      const api = core.createApi();
+
+      await api.add('test-codex', remote.url);
+      // Open a draft but make no commits — sealing is a no-op
+      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });
 
-      // Confirm remote has the sealed commit
+      const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
+      assert.equal(result.success, true);
+      assert.equal(result.inscriptionsSealed, 0);
+
+      // Remote must match the sealed commit even on a no-op seal
       const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
       assert.equal(remoteHead, result.sealedCommit);
+
+      void draft; // suppress unused warning
+    });
+
+    it('push failure after seal throws with distinct message', async () => {
+      const remote = createRemoteRepo();
+      const { core } = createStartedCore();
+      const api = core.createApi();
+
+      await api.add('test-codex', remote.url);
+      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });
+
+      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
+      gitSync(['config', 'user.name', 'Test'], draft.path);
+      fs.writeFileSync(path.join(draft.path, 'push-fail.txt'), 'push fail\n');
+      gitSync(['add', 'push-fail.txt'], draft.path);
+      gitSync(['commit', '-m', 'Push fail test'], draft.path);
+
+      // Find the bare clone path via the draft's gitdir.
+      // The gitdir is something like /tmp/.../codexes/test-codex.git/worktrees/my-draft
+      // Go up two levels to get the bare clone root.
+      const gitDir = gitSync(['rev-parse', '--git-dir'], draft.path);
+      const cloneGitDir = path.resolve(path.join(gitDir, '..', '..'));
+
+      // Set a push-only URL to an invalid location so fetch still works but push fails.
+      // git remote set-url --push only overrides the push URL, leaving fetch URL intact.
+      gitSync(['remote', 'set-url', '--push', 'origin', 'file:///nonexistent/path.git'], cloneGitDir);
+
+      // seal() should fail with a push error, not a seal error
+      await assert.rejects(
+        () => api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' }),
+        (err: unknown) => {
+          assert.ok(err instanceof Error, 'Expected an Error');
+          assert.match(err.message, /Push failed after successful seal/,
+            `Expected push-failure message, got: ${err instanceof Error ? err.message : err}`);
+          return true;
+        },
+      );
+
+      // The local bare clone's ref should have been updated (seal succeeded locally)
+      const localRef = gitSync(['rev-parse', 'main'], cloneGitDir);
+      // The draft's HEAD should match the local sealed ref
+      const draftHead = gitSync(['rev-parse', 'HEAD'], draft.path);
+      assert.equal(localRef, draftHead);
+
+      // The draft must still exist (push runs before abandonDraft)
+      const drafts = await api.listDrafts();
+      assert.equal(drafts.length, 1, 'Draft should still exist after push failure');
     });
   });
 
@@ -1082,12 +1165,10 @@ describe('ScriptoriumCore', () => {
       gitSync(['config', 'user.name', 'Test'], draft.path);
       gitSync(['commit', '-m', 'Add pushed feature'], draft.path);
 
+      // seal() now pushes automatically — no explicit push() call needed
       const sealResult = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
 
-      // Push to remote
-      await api.push({ codexName: 'test-codex' });
-
-      // Verify the remote has the commit
+      // Verify the remote has the commit (pushed by seal())
       const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
       assert.equal(remoteHead, sealResult.sealedCommit);
     });
diff --git a/packages/plugins/codexes/src/scriptorium-core.ts b/packages/plugins/codexes/src/scriptorium-core.ts
index 2715966..d655a4c 100644
--- a/packages/plugins/codexes/src/scriptorium-core.ts
+++ b/packages/plugins/codexes/src/scriptorium-core.ts
@@ -517,6 +517,15 @@ export class ScriptoriumCore {
 
         // Check if source is already at target (nothing to seal)
         if (targetRef === sourceRef) {
+          // Push before abandoning draft — if push fails the draft survives for inspection
+          try {
+            await git(['push', 'origin', targetBranch], clonePath);
+          } catch (pushErr) {
+            throw new Error(
+              `Push failed after successful seal: ${pushErr instanceof Error ? pushErr.message : pushErr}`,
+            );
+          }
+
           // Clean up draft unless keepDraft
           if (!request.keepDraft) {
             await this.abandonDraft({
@@ -547,6 +556,15 @@ export class ScriptoriumCore {
             clonePath,
           );
 
+          // Push before abandoning draft — if push fails the draft survives for inspection
+          try {
+            await git(['push', 'origin', targetBranch], clonePath);
+          } catch (pushErr) {
+            throw new Error(
+              `Push failed after successful seal: ${pushErr instanceof Error ? pushErr.message : pushErr}`,
+            );
+          }
+
           // Clean up draft unless keepDraft
           if (!request.keepDraft) {
             await this.abandonDraft({
diff --git a/packages/plugins/dispatch/README.md b/packages/plugins/dispatch/README.md
deleted file mode 100644
index 53e5a6e..0000000
--- a/packages/plugins/dispatch/README.md
+++ /dev/null
@@ -1,166 +0,0 @@
-# `@shardworks/dispatch-apparatus`
-
-> **⚠️ Temporary rigging.** The Dispatch is a stand-in for the full rigging system (Spider, Fabricator, Executor). When that system exists, this apparatus is retired.
-
-The Dispatch is the guild's interim work runner. It bridges the gap between the Clerk (which tracks obligations) and the session machinery (which runs animas). It does one thing: find the oldest ready writ and execute it.
-
-The Dispatch sits downstream of the Clerk and Animator:
-`clerk ← dispatch → animator → (codexes)`
-
----
-
-## Installation
-
-Add to your package's dependencies:
-
-```json
-{
-  "@shardworks/dispatch-apparatus": "workspace:*"
-}
-```
-
-The Dispatch requires the Clerk, Scriptorium (codexes), and Animator to be installed in the guild. The Loom is recommended (used indirectly via `Animator.summon()`). The Stacks is used internally by the Clerk but is not a direct dependency of the Dispatch.
-
----
-
-## API
-
-The Dispatch exposes a `DispatchApi` via its `provides` interface, retrieved at runtime:
-
-```typescript
-import type { DispatchApi } from '@shardworks/dispatch-apparatus';
-
-const dispatch = guild().apparatus<DispatchApi>('dispatch');
-```
-
-### `next(request?): Promise<DispatchResult | null>`
-
-Find the oldest ready writ and execute it.
-
-```typescript
-// Dispatch with defaults (role: 'artificer')
-const result = await dispatch.next();
-
-// Dispatch with a specific role
-const result = await dispatch.next({ role: 'scribe' });
-
-// Dry run — preview without dispatching
-const result = await dispatch.next({ dryRun: true });
-
-if (!result) {
-  console.log('No ready writs.');
-} else {
-  console.log(result.outcome); // 'completed' | 'failed' | undefined (dryRun)
-}
-```
-
-| Parameter | Type | Description |
-|---|---|---|
-| `role` | `string` | Role to summon (default: `"artificer"`) |
-| `dryRun` | `boolean` | If true, find and report the writ but don't dispatch |
-
-Returns `null` if no ready writs exist.
-
----
-
-## Dispatch Lifecycle
-
-```
-next({ role: 'artificer' })
-│
-├─ 1. Query Clerk: clerk.list({ status: 'ready' }), take oldest (last in desc list)
-│     → if none found, return null
-│
-├─ 2. Clerk: transition writ ready → active
-│
-├─ 3. [if writ.codex] Scriptorium: openDraft({ codexName: writ.codex })
-│     → draftRecord (worktree path = session cwd)
-│     → if no codex on writ, cwd = guild home
-│
-├─ 4. Animator: summon({
-│       role, prompt, cwd,
-│       environment: { GIT_*_EMAIL: `${writ.id}@nexus.local` },
-│       metadata: { writId, trigger: 'dispatch' }
-│     })
-│     → { chunks, result }
-│
-├─ 5. Await result
-│
-├─ 6a. [success] Session completed normally
-│      ├─ [if codex] Scriptorium: seal({ codexName, sourceBranch: draft.branch })
-│      ├─ [if codex] Scriptorium: push({ codexName })
-│      ├─ Clerk: transition writ active → completed
-│      └─ return DispatchResult { outcome: 'completed' }
-│
-└─ 6b. [failure] Session failed or timed out
-       ├─ [if codex] Scriptorium: abandonDraft({ codexName, branch, force: true })
-       ├─ Clerk: transition writ active → failed
-       └─ return DispatchResult { outcome: 'failed' }
-```
-
-### Error Handling
-
-| Failure | Writ transition | Draft |
-|---|---|---|
-| No ready writs | none | n/a |
-| Draft open fails | → `failed` | n/a (never opened) |
-| Session fails | → `failed` | abandoned (force) |
-| Seal fails | → `failed` | **preserved** (for recovery) |
-| Push fails | → `failed` | **preserved** (for recovery) |
-
-The Dispatch owns writ transitions — the anima does **not** call `writ-complete` or `writ-fail`. This keeps writ lifecycle management out of anima instructions.
-
----
-
-## Support Kit
-
-The Dispatch contributes one tool:
-
-### Tools
-
-| Tool | Permission | Callable by | Description |
-|---|---|---|---|
-| `dispatch-next` | `dispatch:write` | `cli` | Find and dispatch the oldest ready writ |
-
----
-
-## Key Types
-
-```typescript
-interface DispatchApi {
-  next(request?: DispatchRequest): Promise<DispatchResult | null>;
-}
-
-interface DispatchRequest {
-  role?: string;    // default: 'artificer'
-  dryRun?: boolean;
-}
-
-interface DispatchResult {
-  writId: string;
-  sessionId?: string;                    // absent if dryRun
-  outcome?: 'completed' | 'failed';     // absent if dryRun
-  resolution?: string;                  // absent if dryRun
-  dryRun: boolean;
-}
-```
-
-See `src/types.ts` for the complete type definitions.
-
----
-
-## Configuration
-
-No configuration. The Dispatch reads writs from the Clerk and uses default behaviors for all apparatus calls. The role is specified per dispatch via the tool parameter.
-
----
-
-## Exports
-
-The package exports all public types and the `createDispatch()` factory:
-
-```typescript
-import dispatchPlugin, { createDispatch, type DispatchApi } from '@shardworks/dispatch-apparatus';
-```
-
-The default export is a pre-built plugin instance, ready for guild installation.
diff --git a/packages/plugins/dispatch/package.json b/packages/plugins/dispatch/package.json
deleted file mode 100644
index 8d26daf..0000000
--- a/packages/plugins/dispatch/package.json
+++ /dev/null
@@ -1,44 +0,0 @@
-{
-  "name": "@shardworks/dispatch-apparatus",
-  "version": "0.0.0",
-  "license": "ISC",
-  "repository": {
-    "type": "git",
-    "url": "https://github.com/shardworks/nexus",
-    "directory": "packages/plugins/dispatch"
-  },
-  "description": "The Dispatch — interim work runner: find the oldest ready writ and execute it",
-  "type": "module",
-  "exports": {
-    ".": "./src/index.ts"
-  },
-  "scripts": {
-    "build": "tsc",
-    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
-    "typecheck": "tsc --noEmit"
-  },
-  "dependencies": {
-    "@shardworks/animator-apparatus": "workspace:*",
-    "@shardworks/clerk-apparatus": "workspace:*",
-    "@shardworks/codexes-apparatus": "workspace:*",
-    "@shardworks/loom-apparatus": "workspace:*",
-    "@shardworks/nexus-core": "workspace:*",
-    "@shardworks/tools-apparatus": "workspace:*",
-    "zod": "4.3.6"
-  },
-  "devDependencies": {
-    "@shardworks/stacks-apparatus": "workspace:*",
-    "@types/node": "25.5.0"
-  },
-  "files": [
-    "dist"
-  ],
-  "publishConfig": {
-    "exports": {
-      ".": {
-        "types": "./dist/index.d.ts",
-        "import": "./dist/index.js"
-      }
-    }
-  }
-}
diff --git a/packages/plugins/dispatch/src/dispatch.test.ts b/packages/plugins/dispatch/src/dispatch.test.ts
deleted file mode 100644
index 3bf68da..0000000
--- a/packages/plugins/dispatch/src/dispatch.test.ts
+++ /dev/null
@@ -1,606 +0,0 @@
-/**
- * Dispatch apparatus tests.
- *
- * Uses a fake session provider, in-memory Stacks, real Clerk, real Animator,
- * real Loom, and a fake Scriptorium to test the full dispatch lifecycle
- * without spawning real AI processes or touching git.
- */
-
-import { describe, it, beforeEach, afterEach } from 'node:test';
-import assert from 'node:assert/strict';
-
-import { setGuild, clearGuild } from '@shardworks/nexus-core';
-import type { Guild, GuildConfig } from '@shardworks/nexus-core';
-import { createStacksApparatus } from '@shardworks/stacks-apparatus';
-import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
-import type { StacksApi } from '@shardworks/stacks-apparatus';
-import { createLoom } from '@shardworks/loom-apparatus';
-import { createAnimator } from '@shardworks/animator-apparatus';
-import type {
-  AnimatorSessionProvider,
-  SessionProviderConfig,
-  SessionChunk,
-} from '@shardworks/animator-apparatus';
-import { createClerk } from '@shardworks/clerk-apparatus';
-import type { ClerkApi } from '@shardworks/clerk-apparatus';
-import type { ScriptoriumApi, DraftRecord, SealResult } from '@shardworks/codexes-apparatus';
-
-import { createDispatch } from './dispatch.ts';
-import type { DispatchApi } from './types.ts';
-
-// ── Shared empty chunks ───────────────────────────────────────────────
-
-const emptyChunks: AsyncIterable<SessionChunk> = {
-  [Symbol.asyncIterator]() {
-    return {
-      async next() {
-        return { value: undefined as unknown as SessionChunk, done: true as const };
-      },
-    };
-  },
-};
-
-// ── Fake session provider ─────────────────────────────────────────────
-
-interface FakeProviderOptions {
-  status?: 'completed' | 'failed' | 'timeout';
-  error?: string;
-}
-
-function createFakeProvider(options: FakeProviderOptions = {}): AnimatorSessionProvider {
-  let callCount = 0;
-
-  return {
-    name: 'fake',
-    launch(_config: SessionProviderConfig) {
-      callCount++;
-      const status = options.status ?? 'completed';
-      return {
-        chunks: emptyChunks,
-        result: Promise.resolve({
-          status,
-          exitCode: status === 'completed' ? 0 : 1,
-          providerSessionId: `fake-sess-${callCount}`,
-          error: options.error,
-        }),
-      };
-    },
-  };
-}
-
-// ── Fake Scriptorium ──────────────────────────────────────────────────
-
-interface FakeScriptoriumOptions {
-  openDraftFails?: boolean;
-  sealFails?: boolean;
-  pushFails?: boolean;
-}
-
-function createFakeScriptorium(options: FakeScriptoriumOptions = {}): ScriptoriumApi {
-  let draftCounter = 0;
-
-  return {
-    async openDraft({ codexName, associatedWith }): Promise<DraftRecord> {
-      if (options.openDraftFails) throw new Error('openDraft: bare clone not ready');
-      draftCounter++;
-      return {
-        id: `draft-${draftCounter}`,
-        codexName,
-        branch: `draft-test-${draftCounter}`,
-        path: `/tmp/worktrees/${codexName}/draft-${draftCounter}`,
-        createdAt: new Date().toISOString(),
-        associatedWith,
-      };
-    },
-    async seal(): Promise<SealResult> {
-      if (options.sealFails) throw new Error('seal: merge conflict');
-      return { success: true, strategy: 'fast-forward', retries: 0, sealedCommit: 'abc123def' };
-    },
-    async push(): Promise<void> {
-      if (options.pushFails) throw new Error('push: remote rejected');
-    },
-    async abandonDraft(): Promise<void> {
-      // no-op
-    },
-    async add() { throw new Error('not implemented'); },
-    async list() { return []; },
-    async show() { throw new Error('not implemented'); },
-    async remove() {},
-    async fetch() {},
-    async listDrafts() { return []; },
-  };
-}
-
-// ── Spy fake provider (captures SessionProviderConfig) ───────────────
-
-function createSpyFakeProvider(): {
-  provider: AnimatorSessionProvider;
-  getCapturedConfig: () => SessionProviderConfig | null;
-} {
-  let capturedConfig: SessionProviderConfig | null = null;
-  return {
-    provider: {
-      name: 'fake-spy',
-      launch(config: SessionProviderConfig) {
-        capturedConfig = config;
-        return {
-          chunks: emptyChunks,
-          result: Promise.resolve({
-            status: 'completed' as const,
-            exitCode: 0,
-            providerSessionId: 'fake-spy-sess',
-          }),
-        };
-      },
-    },
-    getCapturedConfig: () => capturedConfig,
-  };
-}
-
-// ── Test harness ──────────────────────────────────────────────────────
-
-interface SetupOptions {
-  provider?: AnimatorSessionProvider;
-  scriptorium?: ScriptoriumApi;
-}
-
-interface TestContext {
-  dispatch: DispatchApi;
-  clerk: ClerkApi;
-  scriptorium: ScriptoriumApi;
-}
-
-function setup(options: SetupOptions = {}): TestContext {
-  const memBackend = new MemoryBackend();
-  const stacksPlugin = createStacksApparatus(memBackend);
-  const loomPlugin = createLoom();
-  const animatorPlugin = createAnimator();
-  const clerkPlugin = createClerk();
-  const dispatchPlugin = createDispatch();
-
-  const provider = options.provider ?? createFakeProvider();
-  const scriptorium = options.scriptorium ?? createFakeScriptorium();
-
-  const apparatusMap = new Map<string, unknown>();
-  apparatusMap.set('fake-provider', provider);
-  apparatusMap.set('codexes', scriptorium);
-
-  const fakeGuildConfig: GuildConfig = {
-    name: 'test-guild',
-    nexus: '0.0.0',
-    plugins: [],
-    settings: { model: 'sonnet' },
-    animator: { sessionProvider: 'fake-provider' },
-  };
-
-  const fakeGuild: Guild = {
-    home: '/tmp/fake-guild',
-    apparatus<T>(name: string): T {
-      const api = apparatusMap.get(name);
-      if (!api) throw new Error(`Apparatus "${name}" not installed`);
-      return api as T;
-    },
-    config<T>(pluginId: string): T {
-      if (pluginId === 'animator') {
-        return { sessionProvider: 'fake-provider' } as T;
-      }
-      return {} as T;
-    },
-    writeConfig() {},
-    guildConfig() { return fakeGuildConfig; },
-    kits: () => [],
-    apparatuses: () => [],
-  };
-
-  setGuild(fakeGuild);
-
-  // Start stacks
-  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
-  stacksApparatus.start({ on: () => {} });
-  const stacks = stacksApparatus.provides as StacksApi;
-  apparatusMap.set('stacks', stacks);
-
-  // Ensure books
-  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
-    indexes: ['status', 'type', 'createdAt'],
-  });
-  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
-    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
-  });
-
-  // Start loom
-  const loomApparatus = (loomPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
-  loomApparatus.start({ on: () => {} });
-  apparatusMap.set('loom', loomApparatus.provides);
-
-  // Start animator
-  const animatorApparatus = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
-  animatorApparatus.start({ on: () => {} });
-  apparatusMap.set('animator', animatorApparatus.provides);
-
-  // Start clerk
-  const clerkApparatus = (clerkPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
-  clerkApparatus.start({ on: () => {} });
-  const clerk = clerkApparatus.provides as ClerkApi;
-  apparatusMap.set('clerk', clerk);
-
-  // Start dispatch
-  const dispatchApparatus = (dispatchPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
-  dispatchApparatus.start({ on: () => {} });
-  const dispatch = dispatchApparatus.provides as DispatchApi;
-  apparatusMap.set('dispatch', dispatch);
-
-  return { dispatch, clerk, scriptorium };
-}
-
-// ── Tests ─────────────────────────────────────────────────────────────
-
-describe('Dispatch', () => {
-  afterEach(() => {
-    clearGuild();
-  });
-
-  // ── No ready writs ────────────────────────────────────────────────
-
-  describe('next() — empty queue', () => {
-    it('returns null when there are no ready writs', async () => {
-      const { dispatch } = setup();
-      const result = await dispatch.next();
-      assert.equal(result, null);
-    });
-
-    it('returns null when all writs are in terminal states', async () => {
-      const { dispatch, clerk } = setup();
-      const writ = await clerk.post({ title: 'Already done', body: '' });
-      await clerk.transition(writ.id, 'active');
-      await clerk.transition(writ.id, 'completed');
-
-      const result = await dispatch.next();
-      assert.equal(result, null);
-    });
-  });
-
-  // ── Dry run ───────────────────────────────────────────────────────
-
-  describe('next({ dryRun: true })', () => {
-    it('returns the writ id without dispatching', async () => {
-      const { dispatch, clerk } = setup();
-      const writ = await clerk.post({ title: 'Dry run target', body: '' });
-
-      const result = await dispatch.next({ dryRun: true });
-
-      assert.ok(result);
-      assert.equal(result.writId, writ.id);
-      assert.equal(result.dryRun, true);
-      assert.equal(result.sessionId, undefined);
-      assert.equal(result.outcome, undefined);
-    });
-
-    it('does not transition the writ on dry run', async () => {
-      const { dispatch, clerk } = setup();
-      const writ = await clerk.post({ title: 'Stay ready', body: '' });
-
-      await dispatch.next({ dryRun: true });
-
-      const after = await clerk.show(writ.id);
-      assert.equal(after?.status, 'ready');
-    });
-
-    it('returns null on dry run when no ready writs exist', async () => {
-      const { dispatch } = setup();
-      const result = await dispatch.next({ dryRun: true });
-      assert.equal(result, null);
-    });
-  });
-
-  // ── Success path — no codex ───────────────────────────────────────
-
-  describe('next() — successful session, no codex', () => {
-    it('transitions writ ready → active → completed', async () => {
-      const { dispatch, clerk } = setup();
-      const writ = await clerk.post({ title: 'No codex work', body: '' });
-
-      const result = await dispatch.next();
-
-      assert.ok(result);
-      assert.equal(result.writId, writ.id);
-      assert.equal(result.outcome, 'completed');
-      assert.equal(result.dryRun, false);
-      assert.ok(result.sessionId);
-      assert.ok(result.resolution);
-
-      const after = await clerk.show(writ.id);
-      assert.equal(after?.status, 'completed');
-    });
-
-    it('uses the default role "artificer" when none specified', async () => {
-      // Verifies no error from omitting role
-      const { dispatch, clerk } = setup();
-      await clerk.post({ title: 'Default role test', body: '' });
-
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.outcome, 'completed');
-    });
-
-    it('accepts an explicit role', async () => {
-      const { dispatch, clerk } = setup();
-      await clerk.post({ title: 'Scribe work', body: '' });
-
-      const result = await dispatch.next({ role: 'scribe' });
-      assert.ok(result);
-      assert.equal(result.outcome, 'completed');
-    });
-  });
-
-  // ── Success path — with codex ─────────────────────────────────────
-
-  describe('next() — successful session, with codex', () => {
-    it('opens draft, seals, pushes, and completes the writ', async () => {
-      const openCalls: string[] = [];
-      const sealCalls: string[] = [];
-      const pushCalls: string[] = [];
-
-      const scriptorium = createFakeScriptorium();
-      // Wrap to track calls
-      const trackingScriptorium: ScriptoriumApi = {
-        ...scriptorium,
-        async openDraft(req) {
-          openCalls.push(req.codexName);
-          return scriptorium.openDraft(req);
-        },
-        async seal(req) {
-          sealCalls.push(req.codexName);
-          return scriptorium.seal(req);
-        },
-        async push(req) {
-          pushCalls.push(req.codexName);
-          return scriptorium.push(req);
-        },
-      };
-
-      const { dispatch, clerk } = setup({ scriptorium: trackingScriptorium });
-
-      // Post a writ with a codex field (via index signature)
-      const writ = await clerk.post({ title: 'Codex work', body: '' });
-      // Patch the codex field onto the writ — WritDoc allows arbitrary fields
-      // The Clerk doesn't expose codex patching, so we rely on the index signature
-      // and test the no-codex path for Clerk-created writs.
-      // For codex-bound writs, we test the Dispatch internals directly.
-      // (A real commission-post would include codex; the Clerk API accepts it via [key: string]: unknown)
-
-      // Dispatch the writ without codex (standard path)
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.outcome, 'completed');
-
-      // No codex on the writ, so no draft ops expected
-      assert.equal(openCalls.length, 0);
-      assert.equal(sealCalls.length, 0);
-      assert.equal(pushCalls.length, 0);
-
-      const after = await clerk.show(writ.id);
-      assert.equal(after?.status, 'completed');
-    });
-  });
-
-  // ── Failure path — session fails ──────────────────────────────────
-
-  describe('next() — session fails', () => {
-    it('transitions writ to failed when session fails', async () => {
-      const { dispatch, clerk } = setup({
-        provider: createFakeProvider({ status: 'failed', error: 'Claude exited with code 1' }),
-      });
-
-      const writ = await clerk.post({ title: 'Doomed commission', body: '' });
-
-      const result = await dispatch.next();
-
-      assert.ok(result);
-      assert.equal(result.writId, writ.id);
-      assert.equal(result.outcome, 'failed');
-      assert.ok(result.resolution);
-      assert.equal(result.dryRun, false);
-
-      const after = await clerk.show(writ.id);
-      assert.equal(after?.status, 'failed');
-    });
-
-    it('records the session error as the failure resolution', async () => {
-      const { dispatch, clerk } = setup({
-        provider: createFakeProvider({ status: 'failed', error: 'Out of tokens' }),
-      });
-
-      await clerk.post({ title: 'Token fail', body: '' });
-
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.resolution, 'Out of tokens');
-    });
-
-    it('uses session status as resolution when no error message', async () => {
-      const { dispatch, clerk } = setup({
-        provider: createFakeProvider({ status: 'timeout' }),
-      });
-
-      await clerk.post({ title: 'Timeout commission', body: '' });
-
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.resolution, 'Session timeout');
-    });
-  });
-
-  // ── FIFO ordering ─────────────────────────────────────────────────
-
-  describe('next() — FIFO dispatch ordering', () => {
-    it('dispatches the oldest ready writ first', async () => {
-      const { dispatch, clerk } = setup();
-
-      // Create writs with small delays to ensure different createdAt timestamps
-      const w1 = await clerk.post({ title: 'First posted', body: '' });
-      await new Promise((r) => setTimeout(r, 5));
-      const w2 = await clerk.post({ title: 'Second posted', body: '' });
-      await new Promise((r) => setTimeout(r, 5));
-      const w3 = await clerk.post({ title: 'Third posted', body: '' });
-
-      // First dispatch should take w1 (oldest)
-      const r1 = await dispatch.next();
-      assert.ok(r1);
-      assert.equal(r1.writId, w1.id);
-
-      // Second dispatch should take w2
-      const r2 = await dispatch.next();
-      assert.ok(r2);
-      assert.equal(r2.writId, w2.id);
-
-      // Third dispatch should take w3
-      const r3 = await dispatch.next();
-      assert.ok(r3);
-      assert.equal(r3.writId, w3.id);
-
-      // No more ready writs
-      const r4 = await dispatch.next();
-      assert.equal(r4, null);
-    });
-  });
-
-  // ── Draft open failure ────────────────────────────────────────────
-
-  describe('next() — draft open fails', () => {
-    it('fails the writ and returns without launching a session', async () => {
-      // We need a writ with a codex field to trigger draft opening.
-      // Since the Clerk API doesn't expose codex, we test a representative
-      // scenario: if a future commission-post includes a codex field, it would
-      // be stored via the index signature and read by the Dispatch.
-      // For now, verify the no-codex path (draft open is skipped entirely).
-      // The openDraftFails option is exercised via integration if codex is set.
-
-      // This test verifies the fail path when scriptorium.openDraft throws.
-      // To trigger this path we need a writ with writ.codex set.
-      // Since WritDoc has [key: string]: unknown, we test by confirming the
-      // Dispatch gracefully handles the no-codex case (draft not attempted).
-
-      const { dispatch, clerk } = setup({
-        scriptorium: createFakeScriptorium({ openDraftFails: true }),
-      });
-
-      const writ = await clerk.post({ title: 'No codex — draft skip', body: '' });
-
-      // Without a codex on the writ, openDraft is never called even if it would fail
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.outcome, 'completed'); // no codex → no draft → proceeds to session
-
-      const after = await clerk.show(writ.id);
-      assert.equal(after?.status, 'completed');
-    });
-  });
-
-  // ── Seal / push failure ───────────────────────────────────────────
-
-  describe('next() — seal fails', () => {
-    it('fails the writ without abandoning the draft when seal fails', async () => {
-      // Seal failure only occurs when a codex is present. Without a codex field
-      // on the writ, the seal path is skipped. This test verifies that the
-      // no-codex successful path still completes correctly even with a
-      // sealFails scriptorium (seal is never called).
-      const abandonCalls: string[] = [];
-      const scriptorium = createFakeScriptorium({ sealFails: true });
-      const trackingScriptorium: ScriptoriumApi = {
-        ...scriptorium,
-        async abandonDraft(req) {
-          abandonCalls.push(req.branch);
-        },
-      };
-
-      const { dispatch, clerk } = setup({ scriptorium: trackingScriptorium });
-      await clerk.post({ title: 'Seal test — no codex', body: '' });
-
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.outcome, 'completed'); // no codex — seal never attempted
-
-      // abandonDraft was not called (no codex)
-      assert.equal(abandonCalls.length, 0);
-    });
-  });
-
-  // ── Writ not taken during dry run ─────────────────────────────────
-
-  describe('next() — idempotency', () => {
-    it('same writ is returned by two consecutive dry runs', async () => {
-      const { dispatch, clerk } = setup();
-      const writ = await clerk.post({ title: 'Idempotent check', body: '' });
-
-      const r1 = await dispatch.next({ dryRun: true });
-      const r2 = await dispatch.next({ dryRun: true });
-
-      assert.ok(r1);
-      assert.ok(r2);
-      assert.equal(r1.writId, writ.id);
-      assert.equal(r2.writId, writ.id);
-
-      // Still ready after two dry runs
-      const after = await clerk.show(writ.id);
-      assert.equal(after?.status, 'ready');
-    });
-  });
-
-  // ── Active writ skipped ───────────────────────────────────────────
-
-  describe('next() — skips non-ready writs', () => {
-    it('skips active and terminal writs, finds only ready ones', async () => {
-      const { dispatch, clerk } = setup();
-
-      // Create a writ and put it in active state
-      const active = await clerk.post({ title: 'Already active', body: '' });
-      await clerk.transition(active.id, 'active');
-
-      // Create a completed writ
-      const completed = await clerk.post({ title: 'Already completed', body: '' });
-      await clerk.transition(completed.id, 'active');
-      await clerk.transition(completed.id, 'completed');
-
-      // The only ready writ
-      const ready = await clerk.post({ title: 'The ready one', body: '' });
-
-      const result = await dispatch.next();
-      assert.ok(result);
-      assert.equal(result.writId, ready.id);
-    });
-  });
-
-  // ── Git identity environment ──────────────────────────────────────
-
-  describe('next() — git identity environment', () => {
-    it('passes writ-scoped GIT_*_EMAIL to the session provider', async () => {
-      const { provider, getCapturedConfig } = createSpyFakeProvider();
-      const { dispatch, clerk } = setup({ provider });
-
-      const writ = await clerk.post({ title: 'Git identity test', body: '' });
-
-      await dispatch.next();
-
-      const captured = getCapturedConfig();
-      assert.ok(captured);
-      assert.ok(captured!.environment, 'environment should be present');
-      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
-      assert.ok(captured!.environment?.GIT_AUTHOR_NAME, 'GIT_AUTHOR_NAME should be present');
-    });
-
-    it('preserves Loom role name in GIT_*_NAME while overriding email', async () => {
-      const { provider, getCapturedConfig } = createSpyFakeProvider();
-      const { dispatch, clerk } = setup({ provider });
-
-      const writ = await clerk.post({ title: 'Name/email split test', body: '' });
-
-      await dispatch.next();
-
-      const captured = getCapturedConfig();
-      assert.ok(captured);
-      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
-      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
-    });
-  });
-});
diff --git a/packages/plugins/dispatch/src/dispatch.ts b/packages/plugins/dispatch/src/dispatch.ts
deleted file mode 100644
index d883225..0000000
--- a/packages/plugins/dispatch/src/dispatch.ts
+++ /dev/null
@@ -1,175 +0,0 @@
-/**
- * The Dispatch — interim work runner.
- *
- * Bridges the Clerk (which tracks obligations) and the session machinery
- * (which runs animas). Finds the oldest ready writ and executes it:
- * opens a draft binding, composes context, launches a session, and handles
- * the aftermath (seal the draft, transition the writ).
- *
- * This apparatus is temporary rigging — designed to be retired when the
- * full rigging system (Spider, Fabricator, Executor) is implemented.
- *
- * See: docs/architecture/apparatus/dispatch.md
- */
-
-import type { Plugin } from '@shardworks/nexus-core';
-import { guild } from '@shardworks/nexus-core';
-import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
-import type { ScriptoriumApi, DraftRecord } from '@shardworks/codexes-apparatus';
-import type { AnimatorApi, SessionResult } from '@shardworks/animator-apparatus';
-
-import type { DispatchApi, DispatchRequest, DispatchResult } from './types.ts';
-import { dispatchNext } from './tools/index.ts';
-
-// ── Prompt assembly ──────────────────────────────────────────────────
-
-function assemblePrompt(writ: WritDoc): string {
-  const lines = [
-    'You have been dispatched to fulfill a commission.',
-    '',
-    '## Assignment',
-    '',
-    `**Title:** ${writ.title}`,
-    '',
-    `**Writ ID:** ${writ.id}`,
-  ];
-
-  if (writ.body) {
-    lines.push('', writ.body);
-  }
-
-  return lines.join('\n');
-}
-
-// ── Apparatus factory ────────────────────────────────────────────────
-
-/**
- * Create the Dispatch apparatus plugin.
- *
- * Returns a Plugin with:
- * - `requires: ['clerk', 'codexes', 'animator']`
- * - `recommends: ['loom']` — used indirectly via Animator.summon()
- * - `provides: DispatchApi` — the dispatch API
- * - `supportKit` — contributes the `dispatch-next` tool
- */
-export function createDispatch(): Plugin {
-  const api: DispatchApi = {
-    async next(request?: DispatchRequest): Promise<DispatchResult | null> {
-      const role = request?.role ?? 'artificer';
-      const dryRun = request?.dryRun ?? false;
-
-      const clerk = guild().apparatus<ClerkApi>('clerk');
-
-      // 1. Find oldest ready writ (FIFO — list returns desc by createdAt, take last)
-      const readyWrits = await clerk.list({ status: 'ready' });
-      const writ = readyWrits[readyWrits.length - 1] ?? null;
-
-      if (!writ) return null;
-
-      if (dryRun) {
-        return { writId: writ.id, dryRun: true };
-      }
-
-      const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
-      const animator = guild().apparatus<AnimatorApi>('animator');
-
-      // 2. Transition writ ready → active
-      await clerk.transition(writ.id, 'active');
-
-      // 3. Open draft if writ has a codex
-      const codexName = typeof writ.codex === 'string' ? writ.codex : undefined;
-      let draft: DraftRecord | undefined;
-
-      if (codexName) {
-        try {
-          draft = await scriptorium.openDraft({ codexName, associatedWith: writ.id });
-        } catch (err) {
-          const reason = `Draft open failed: ${String(err)}`;
-          await clerk.transition(writ.id, 'failed', { resolution: reason });
-          return { writId: writ.id, outcome: 'failed', resolution: reason, dryRun: false };
-        }
-      }
-
-      // Session cwd: draft worktree path if codex, otherwise guild home
-      const cwd = draft?.path ?? guild().home;
-
-      // 4. Assemble prompt and summon anima
-      const prompt = assemblePrompt(writ);
-      const handle = animator.summon({
-        role,
-        prompt,
-        cwd,
-        environment: {
-          GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
-        },
-        metadata: { writId: writ.id, trigger: 'dispatch' },
-      });
-
-      // 5. Await session result
-      let session: SessionResult;
-      try {
-        session = await handle.result;
-      } catch (err) {
-        // Unexpected rejection (summon normally resolves with a failed status)
-        const reason = `Session error: ${String(err)}`;
-        if (codexName && draft) {
-          await scriptorium.abandonDraft({ codexName, branch: draft.branch, force: true });
-        }
-        await clerk.transition(writ.id, 'failed', { resolution: reason });
-        return { writId: writ.id, outcome: 'failed', resolution: reason, dryRun: false };
-      }
-
-      // 6a. Success path
-      if (session.status === 'completed') {
-        if (codexName && draft) {
-          // Seal the draft — fail writ if seal fails but preserve draft for recovery
-          try {
-            await scriptorium.seal({ codexName, sourceBranch: draft.branch });
-          } catch (err) {
-            const reason = `Seal failed: ${String(err)}`;
-            await clerk.transition(writ.id, 'failed', { resolution: reason });
-            return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
-          }
-
-          // Push — same treatment as seal failure
-          try {
-            await scriptorium.push({ codexName });
-          } catch (err) {
-            const reason = `Push failed: ${String(err)}`;
-            await clerk.transition(writ.id, 'failed', { resolution: reason });
-            return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
-          }
-        }
-
-        const resolution = `Session ${session.id} completed`;
-        await clerk.transition(writ.id, 'completed', { resolution });
-        return { writId: writ.id, sessionId: session.id, outcome: 'completed', resolution, dryRun: false };
-      }
-
-      // 6b. Failure path (status: 'failed' | 'timeout')
-      if (codexName && draft) {
-        await scriptorium.abandonDraft({ codexName, branch: draft.branch, force: true });
-      }
-      const reason = session.error ?? `Session ${session.status}`;
-      await clerk.transition(writ.id, 'failed', { resolution: reason });
-      return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
-    },
-  };
-
-  return {
-    apparatus: {
-      requires: ['clerk', 'codexes', 'animator'],
-      recommends: ['loom'],
-
-      supportKit: {
-        tools: [dispatchNext],
-      },
-
-      provides: api,
-
-      start(): void {
-        // No initialization needed — clerk is resolved at call time in next().
-      },
-    },
-  };
-}
diff --git a/packages/plugins/dispatch/src/index.ts b/packages/plugins/dispatch/src/index.ts
deleted file mode 100644
index 321c70e..0000000
--- a/packages/plugins/dispatch/src/index.ts
+++ /dev/null
@@ -1,27 +0,0 @@
-/**
- * @shardworks/dispatch-apparatus — The Dispatch.
- *
- * Interim work runner: finds the oldest ready writ and executes it through
- * the guild's session machinery. Opens a draft binding on the target codex,
- * summons an anima via The Animator, and handles the aftermath (seal the
- * draft, transition the writ). Disposable — retired when the full rigging
- * system (Spider, Fabricator, Executor) is implemented.
- *
- * See: docs/architecture/apparatus/dispatch.md
- */
-
-import { createDispatch } from './dispatch.ts';
-
-// ── Dispatch API ──────────────────────────────────────────────────────
-
-export {
-  type DispatchApi,
-  type DispatchRequest,
-  type DispatchResult,
-} from './types.ts';
-
-export { createDispatch } from './dispatch.ts';
-
-// ── Default export: the apparatus plugin ──────────────────────────────
-
-export default createDispatch();
diff --git a/packages/plugins/dispatch/src/tools/dispatch-next.ts b/packages/plugins/dispatch/src/tools/dispatch-next.ts
deleted file mode 100644
index df76010..0000000
--- a/packages/plugins/dispatch/src/tools/dispatch-next.ts
+++ /dev/null
@@ -1,51 +0,0 @@
-/**
- * dispatch-next tool — find the oldest ready writ and dispatch it.
- *
- * The primary entry point for running guild work. Picks the oldest ready
- * writ (FIFO order), opens a draft on its codex (if any), summons an anima
- * to fulfill it, and transitions the writ to completed or failed based on
- * the session outcome.
- *
- * Usage:
- *   nsg dispatch-next
- *   nsg dispatch-next --role scribe
- *   nsg dispatch-next --dry-run
- *
- * See: docs/architecture/apparatus/dispatch.md
- */
-
-import { tool } from '@shardworks/tools-apparatus';
-import { guild } from '@shardworks/nexus-core';
-import { z } from 'zod';
-import type { DispatchApi } from '../types.ts';
-
-export default tool({
-  name: 'dispatch-next',
-  description: 'Find the oldest ready writ and dispatch it',
-  instructions:
-    'Finds the oldest ready writ (FIFO order), opens a draft binding on its codex ' +
-    'if specified, summons an anima to fulfill the commission, and transitions the ' +
-    'writ to completed or failed based on the session outcome. Returns null if no ' +
-    'ready writs exist. Use dryRun to preview which writ would be dispatched.',
-  params: {
-    role: z.string().optional()
-      .describe('Role to summon (default: "artificer")'),
-    dryRun: z.boolean().optional().default(false)
-      .describe('If true, find and report the writ but do not dispatch'),
-  },
-  callableBy: 'cli',
-  permission: 'dispatch:write',
-  handler: async (params) => {
-    const dispatch = guild().apparatus<DispatchApi>('dispatch');
-    const result = await dispatch.next({
-      role: params.role,
-      dryRun: params.dryRun,
-    });
-
-    if (!result) {
-      return { status: 'idle', message: 'No ready writs found.' };
-    }
-
-    return result;
-  },
-});
diff --git a/packages/plugins/dispatch/src/tools/index.ts b/packages/plugins/dispatch/src/tools/index.ts
deleted file mode 100644
index 47f0a8c..0000000
--- a/packages/plugins/dispatch/src/tools/index.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-/**
- * Dispatch tool re-exports.
- */
-
-export { default as dispatchNext } from './dispatch-next.ts';
diff --git a/packages/plugins/dispatch/src/types.ts b/packages/plugins/dispatch/src/types.ts
deleted file mode 100644
index 52d9931..0000000
--- a/packages/plugins/dispatch/src/types.ts
+++ /dev/null
@@ -1,54 +0,0 @@
-/**
- * The Dispatch — public types.
- *
- * These types form the contract between The Dispatch apparatus and all
- * callers (CLI, clockworks). No implementation details.
- *
- * See: docs/architecture/apparatus/dispatch.md
- */
-
-// ── DispatchApi (the `provides` interface) ───────────────────────────
-
-export interface DispatchApi {
-  /**
-   * Find the oldest ready writ and execute it.
-   *
-   * The full dispatch lifecycle:
-   *   1. Query the Clerk for the oldest ready writ
-   *   2. Transition the writ to active
-   *   3. Open a draft binding on the writ's codex (if specified)
-   *   4. Summon an anima session with the writ context as prompt
-   *   5. Wait for session completion
-   *   6. On success: seal the draft, push, transition writ to completed
-   *   7. On failure: abandon the draft, transition writ to failed
-   *
-   * Returns null if no ready writs exist.
-   *
-   * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
-   * skipped — the session runs in the guild home directory with
-   * no codex binding.
-   */
-  next(request?: DispatchRequest): Promise<DispatchResult | null>;
-}
-
-// ── Request / Result ─────────────────────────────────────────────────
-
-export interface DispatchRequest {
-  /** Role to summon. Default: 'artificer'. */
-  role?: string;
-  /** If true, find and report the writ but don't dispatch. */
-  dryRun?: boolean;
-}
-
-export interface DispatchResult {
-  /** The writ that was dispatched. */
-  writId: string;
-  /** The session id (from the Animator). Absent if dryRun. */
-  sessionId?: string;
-  /** Terminal writ status after dispatch. Absent if dryRun. */
-  outcome?: 'completed' | 'failed';
-  /** Resolution text set on the writ. Absent if dryRun. */
-  resolution?: string;
-  /** Whether this was a dry run. */
-  dryRun: boolean;
-}
diff --git a/packages/plugins/dispatch/tsconfig.json b/packages/plugins/dispatch/tsconfig.json
deleted file mode 100644
index 4229950..0000000
--- a/packages/plugins/dispatch/tsconfig.json
+++ /dev/null
@@ -1,13 +0,0 @@
-{
-  "extends": "../../../tsconfig.json",
-  "compilerOptions": {
-    "outDir": "dist",
-    "rootDir": "src"
-  },
-  "include": [
-    "src"
-  ],
-  "exclude": [
-    "src/**/*.test.ts"
-  ]
-}
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index d8b8383..a0c2709 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -132,59 +132,6 @@ importers:
         specifier: 25.5.0
         version: 25.5.0
 
-  packages/plugins/dashboard:
-    dependencies:
-      '@shardworks/clerk-apparatus':
-        specifier: workspace:*
-        version: link:../clerk
-      '@shardworks/nexus-core':
-        specifier: workspace:*
-        version: link:../../framework/core
-      '@shardworks/stacks-apparatus':
-        specifier: workspace:*
-        version: link:../stacks
-      '@shardworks/tools-apparatus':
-        specifier: workspace:*
-        version: link:../tools
-      zod:
-        specifier: 4.3.6
-        version: 4.3.6
-    devDependencies:
-      '@types/node':
-        specifier: 25.5.0
-        version: 25.5.0
-
-  packages/plugins/dispatch:
-    dependencies:
-      '@shardworks/animator-apparatus':
-        specifier: workspace:*
-        version: link:../animator
-      '@shardworks/clerk-apparatus':
-        specifier: workspace:*
-        version: link:../clerk
-      '@shardworks/codexes-apparatus':
-        specifier: workspace:*
-        version: link:../codexes
-      '@shardworks/loom-apparatus':
-        specifier: workspace:*
-        version: link:../loom
-      '@shardworks/nexus-core':
-        specifier: workspace:*
-        version: link:../../framework/core
-      '@shardworks/tools-apparatus':
-        specifier: workspace:*
-        version: link:../tools
-      zod:
-        specifier: 4.3.6
-        version: 4.3.6
-    devDependencies:
-      '@shardworks/stacks-apparatus':
-        specifier: workspace:*
-        version: link:../stacks
-      '@types/node':
-        specifier: 25.5.0
-        version: 25.5.0
-
   packages/plugins/fabricator:
     dependencies:
       '@shardworks/nexus-core':

```

## Full File Contents (for context)

=== FILE: docs/architecture/apparatus/animator.md ===
# The Animator — API Contract

Status: **Draft — MVP**

Package: `@shardworks/animator-apparatus` · Plugin id: `animator`

> **⚠️ MVP scope.** This spec covers session launch, structured telemetry recording, streaming output, error guarantees, and session inspection tools. There is no MCP tool server, no Instrumentarium dependency, no role awareness, and no event signalling. The Animator receives a woven context and a working directory, launches a session provider process, and records what happened. See the Future sections for the target design.

---

## Purpose

The Animator brings animas to life. It is the guild's session apparatus — the single entry point for making an anima do work. Two API levels serve different callers:

- **`summon()`** — the high-level "make an anima do a thing" call. Composes context via The Loom, launches a session, records the result. This is what the summon relay, the CLI, and most callers use.
- **`animate()`** — the low-level call for callers that compose their own `AnimaWeave` (e.g. The Parlour for multi-turn conversations).

Both methods return an `AnimateHandle` synchronously — a `{ sessionId, chunks, result }` triple. The `sessionId` is available immediately, before the session completes — callers that only need to know the session was launched can return without awaiting. The `result` promise resolves when the session completes. The `chunks` async iterable yields output when `streaming: true` is set; otherwise it completes immediately with no items. There is no separate streaming method — the `streaming` flag on the request controls the behavior, and the return shape is always the same.

The Animator does not assemble system prompts — that is The Loom's job. `summon()` delegates context composition to The Loom; `animate()` accepts a pre-composed `AnimaWeave` from any source. This separation means The Loom can evolve its composition model (adding role instructions, curricula, temperaments) without changing The Animator's interface.

---

## Dependencies

```
requires:   ['stacks']
recommends: ['loom']
```

- **The Stacks** (required) — records session results (the `sessions` book) and full transcripts (the `transcripts` book).
- **The Loom** (recommended) — composes session context for `summon()`. Not needed for `animate()`, which accepts a pre-composed context. Resolved at call time, not at startup — the Animator starts without the Loom, but `summon()` throws if it's not installed. Arbor emits a startup warning if the Loom is not installed.

---

## Kit Contribution

The Animator contributes two books and session tools via its supportKit:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  tools: [sessionList, sessionShow, summon],
},
```

### `session-list` tool

List recent sessions with optional filters. Returns session summaries ordered by `startedAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'running' \| 'completed' \| 'failed' \| 'timeout'` | Filter by terminal status |
| `provider` | `string` | Filter by provider name |
| `conversationId` | `string` | Filter by conversation |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `SessionResult[]` (summary projection — id, status, provider, startedAt, endedAt, durationMs, exitCode, costUsd).

Callers that need to filter by metadata fields (e.g. `metadata.writId`, `metadata.animaName`) use The Stacks' query API directly. The tool exposes filters for fields the Animator itself indexes.

### `session-show` tool

Show full detail for a single session by id.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Session id |

Returns: the complete session record from The Stacks, including `tokenUsage`, `metadata`, `output`, and all indexed fields.

### `summon` tool

Summon an anima from the CLI. Calls `animator.summon()` with the guild home as working directory. CLI-only (`callableBy: 'cli'`). Requires `animate` permission.

| Parameter | Type | Description |
|---|---|---|
| `prompt` | `string` (required) | The work prompt — what the anima should do |
| `role` | `string` (optional) | Role to summon (e.g. `'artificer'`, `'scribe'`) |

Returns: session summary (id, status, provider, durationMs, exitCode, costUsd, tokenUsage, error).

---

## `AnimatorApi` Interface (`provides`)

```typescript
interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level entry point. Passes the role to The Loom for
   * identity composition, then animate() for session launch and recording.
   * The work prompt bypasses The Loom and goes directly to the provider.
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Requires The Loom apparatus to be installed. Throws if not available.
   */
  summon(request: SummonRequest): AnimateHandle

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` to receive output chunks as the session runs.
   * When streaming is disabled (default), `chunks` completes immediately.
   */
  animate(request: AnimateRequest): AnimateHandle
}

/** The return value from animate() and summon(). */
interface AnimateHandle {
  /** Session ID, available immediately after launch — before the session completes. */
  sessionId: string
  /** Output chunks. Empty iterable when not streaming. */
  chunks: AsyncIterable<SessionChunk>
  /** Resolves to the final SessionResult after recording. */
  result: Promise<SessionResult>
}

/** A chunk of output from a running session. */
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }

interface SummonRequest {
  /** The work prompt — sent directly to the provider, bypasses The Loom. */
  prompt: string
  /** The role to summon (e.g. 'artificer'). Passed to The Loom for composition. */
  role?: string
  /** Working directory for the session. */
  cwd: string
  /** Optional conversation id to resume a multi-turn conversation. */
  conversationId?: string
  /**
   * Additional metadata recorded alongside the session.
   * Merged with auto-generated metadata ({ trigger: 'summon', role }).
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * Use this for per-task identity — e.g. setting GIT_AUTHOR_EMAIL
   * to a writ ID for commit attribution.
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface AnimateRequest {
  /** The anima weave — composed identity context from The Loom (or self-composed). */
  context: AnimaWeave
  /** The work prompt — sent directly to the provider as initialPrompt. */
  prompt?: string
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout'
  /** When the session started (ISO-8601). */
  startedAt: string
  /** When the session ended (ISO-8601). */
  endedAt: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Provider name (e.g. 'claude-code'). */
  provider: string
  /** Numeric exit code from the provider process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Conversation id (for multi-turn resume). */
  conversationId?: string
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage
  /** Cost in USD from the provider, if available. */
  costUsd?: number
  /** Caller-supplied metadata, recorded as-is. See § Caller Metadata. */
  metadata?: Record<string, unknown>
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message in the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

---

## Session Lifecycle

### `summon()` — the high-level path

```
summon(request)
  │
  ├─ 1. Resolve The Loom (throws if not installed)
  ├─ 2. Compose identity: loom.weave({ role })
  │     (Loom produces systemPrompt from anima identity layers;
  │      MVP: systemPrompt is undefined — composition not yet implemented)
  ├─ 3. Build AnimateRequest with:
  │     - context (AnimaWeave from Loom — includes environment)
  │     - prompt (work prompt, bypasses Loom)
  │     - environment (per-request overrides, if any)
  │     - auto-metadata { trigger: 'summon', role }
  └─ 4. Delegate to animate() → full animate lifecycle below
```

### `animate()` — the low-level path

```
animate(request)  →  { chunks, result }  (returned synchronously)
  │
  ├─ 1. Generate session id, capture startedAt
  ├─ 2. Write initial session record to The Stacks (status: 'running')
  │
  ├─ 3. Call provider.launch(config):
  │     - System prompt, initial prompt, model, cwd, conversationId
  │     - environment (merged: weave defaults + request overrides)
  │     - streaming flag passed through for provider to honor
  │     → provider returns { chunks, result } immediately
  │
  ├─ 4. Wrap provider result promise with recording:
  │     - On resolve: capture endedAt, durationMs, extract output from
  │       provider transcript, record session to Stacks, record transcript
  │       to transcripts book
  │     - On reject: record failed result, re-throw
  │     (ALWAYS records — see § Error Handling Contract)
  │
  └─ 5. Return { chunks, result } to caller
        chunks: the provider's iterable (may be empty)
        result: wraps provider result with Animator recording
```

The Animator does not branch on streaming. It passes the `streaming` flag to the provider via `SessionProviderConfig` and returns whatever the provider gives back. Providers that support streaming yield chunks when the flag is set; providers that don't return empty chunks. Callers should not assume chunks will be emitted.

---

## Session Providers

The Animator delegates AI process management to a **session provider** — a pluggable apparatus that knows how to launch and communicate with a specific AI system. The provider is discovered at runtime via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `sessionProvider` field names the plugin id of an apparatus whose `provides` object implements `AnimatorSessionProvider`. The Animator looks it up via `guild().apparatus<AnimatorSessionProvider>(config.sessionProvider)` at animate-time. Defaults to `'claude-code'` if not specified.

```typescript
interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string

  /**
   * Launch a session. Returns { chunks, result } synchronously.
   *
   * The result promise resolves when the AI process exits.
   * The chunks async iterable yields output when config.streaming
   * is true and the provider supports streaming; otherwise it
   * completes immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag
   * and return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>
    result: Promise<SessionProviderResult>
  }
}

interface SessionProviderConfig {
  /** System prompt from the AnimaWeave — may be undefined at MVP. */
  systemPrompt?: string
  /** Work prompt from AnimateRequest.prompt — what the anima should do. */
  initialPrompt?: string
  /** Model to use (from guild settings). */
  model: string
  /** Optional conversation id for resume. */
  conversationId?: string
  /** Working directory for the session. */
  cwd: string
  /** Enable streaming output. Providers may ignore this flag. */
  streaming?: boolean
  /**
   * Environment variables for the session process.
   * Merged by the Animator from the AnimaWeave's environment and any
   * per-request overrides (request overrides weave). The provider
   * spreads these into the spawned process environment.
   */
  environment?: Record<string, string>
}

interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout'
  /** Numeric exit code from the process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage
  /** Cost in USD, if the provider can report it. */
  costUsd?: number
  /** Full session transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[]
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   */
  output?: string
}

/** A single message from the NDJSON stream. Shape varies by provider. */
type TranscriptMessage = Record<string, unknown>
```

The default provider is `@shardworks/claude-code-apparatus` (plugin id: `claude-code`), which launches a `claude` CLI process in autonomous mode with `--output-format stream-json`. Provider packages import the `AnimatorSessionProvider` type from `@shardworks/animator-apparatus` and export an apparatus whose `provides` satisfies the interface.

---

## Error Handling Contract

The Animator guarantees that **step 5 (recording) always executes**, even if the provider throws or the process crashes. The provider launch (steps 3–4) is wrapped in try/finally. If the provider fails:

- The session record is still updated in The Stacks with `status: 'failed'`, the captured `endedAt`, `durationMs`, and the error message.
- `exitCode` defaults to `1` if the provider didn't return one.
- `tokenUsage` and `costUsd` are omitted (the provider may not have reported them).

If the Stacks write itself fails (e.g. database locked), the error is logged but does not propagate — the Animator returns or re-throws the provider error, not a recording error. Session data loss is preferable to masking the original failure.

```
Provider succeeds  → record status 'completed', return result
Provider fails     → record status 'failed' + error, re-throw provider error
Provider times out → record status 'timeout', return result with error
Recording fails    → log warning, continue with return/re-throw
```

---

## Caller Metadata

The `metadata` field on `AnimateRequest` is an opaque pass-through. The Animator records it in the session's Stacks entry without interpreting it. This allows callers to attach contextual information that the Animator itself doesn't understand:

```typescript
// Example: the summon relay attaches dispatch context
const { result } = animator.animate({
  context: wovenContext,
  cwd: '/path/to/worktree',
  metadata: {
    trigger: 'summon',
    animaId: 'anm-3f7b2c1',
    animaName: 'scribe',
    writId: 'wrt-8a4c9e2',
    workshop: 'nexus-mk2',
    workspaceKind: 'workshop-temp',
  },
});
const session = await result;

// Example: nsg consult attaches interactive session context
const { chunks, result: consultResult } = animator.animate({
  context: wovenContext,
  cwd: guildHome,
  streaming: true,
  metadata: {
    trigger: 'consult',
    animaId: 'anm-b2e8f41',
    animaName: 'coco',
  },
});
for await (const chunk of chunks) { /* stream to terminal */ }
const consultSession = await consultResult;
```

The `metadata` field is indexed in The Stacks as a JSON blob. Callers that need to query by metadata fields (e.g. "all sessions for writ X") use The Stacks' JSON path queries against the stored metadata.

This design keeps the Animator focused: it launches sessions and records what happened. Identity, dispatch context, and writ binding are concerns of the caller.

---

## Session Environment

The Animator supports environment variable injection into the spawned session process. This is the mechanism for giving animas distinct identities (e.g. git author) without modifying global host configuration.

Environment variables come from two sources, merged at session launch time:

1. **AnimaWeave** (`context.environment`) — identity-layer defaults from The Loom. Set per-role. Example: `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`.
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the implement engine sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.

The merge is simple: `{ ...weave.environment, ...request.environment }`. Request values override weave values for the same key. The merged result is passed to the session provider as `SessionProviderConfig.environment`, which the provider spreads into the child process environment (`{ ...process.env, ...config.environment }`).

This keeps the Animator generic — it does not interpret environment variables or know about git. The Loom decides what identity defaults a role should have. Orchestrators decide what per-task overrides are needed. The Animator just merges and passes through.

---

## Invocation Paths

The Animator is called from three places:

1. **The summon relay** — when a standing order fires `summon: "role"`, the relay calls `animator.summon()`. This is the Clockworks-driven autonomous path.

2. **`nsg summon`** — the CLI command for direct dispatch. Calls `animator.summon()` to launch a session with a work prompt.

3. **`nsg consult`** — the CLI command for interactive multi-turn sessions. Uses The Parlour, which composes its own context and calls `animator.animate()` directly.

Paths 1 and 2 use `summon()` (high-level — The Loom composes the context). Path 3 uses `animate()` (low-level — The Parlour composes the context). The Animator doesn't know or care which path invoked it — the session lifecycle is identical.

### CLI streaming behavior

The `nsg summon` command invokes the `summon` tool through the generic CLI tool runner, which `await`s the handler and prints the return value. The tool contract (`ToolDefinition.handler`) returns a single value — there is no streaming return type. The CLI prints the structured session summary (id, status, cost, token usage) to stdout when the session completes.

However, **real-time session output is visible during execution via stderr**. The claude-code provider spawns `claude` with `--output-format stream-json` and parses NDJSON from the child process's stdout. As assistant text chunks arrive, the provider writes them to `process.stderr` as a side effect of parsing (in `parseStreamJsonMessage`). Because the CLI inherits the provider's stderr, users see streaming text output in the terminal while the session runs.

This is intentional: stderr carries progress output, stdout carries the structured result. The pattern is standard for CLI tools that produce both human-readable progress and machine-readable results. The streaming output is a provider-level concern — the Animator and the tool system are not involved.

---

## Open Questions

- ~~**Provider discovery.** How does The Animator find installed session providers?~~ **Resolved:** the `guild.json["animator"]["sessionProvider"]` config field names the plugin id of the provider apparatus. The Animator looks it up via `guild().apparatus()`. Defaults to `'claude-code'`.
- **Timeout.** How are session timeouts configured? MVP: no timeout (the session runs until the provider exits).
- **Concurrency.** Can multiple sessions run simultaneously? Current answer: yes, each `animate()` call is independent.

---

## Future: Event Signalling

When The Clockworks integration is updated, The Animator will signal lifecycle events:

- **`session.started`** — fired after step 2 (initial record written). Payload includes `sessionId`, `provider`, `startedAt`, and caller-supplied `metadata`.
- **`session.ended`** — fired after step 5 (result recorded). Payload includes `sessionId`, `status`, `exitCode`, `durationMs`, `costUsd`, `error`, and `metadata`.
- **`session.record-failed`** — fired if the Stacks write in step 5 fails. Payload includes `sessionId` and the recording error. This is a diagnostic event — it means session data was lost.

These events are essential for clockworks standing orders (e.g. retry-on-failure, cost alerting, session auditing). The Animator fires them best-effort — event signalling failures are logged but never mask session results.

Blocked on: Clockworks apparatus spec finalization.

---

## Future: Enriched Session Records

At MVP, the Animator records what it directly observes (provider telemetry) and what the caller passes via `metadata`. The session record in The Stacks looks like:

```typescript
// MVP session record (what The Animator writes)
{
  id: 'ses-a3f7b2c1',
  status: 'completed',
  startedAt: '2026-04-01T12:00:00Z',
  endedAt: '2026-04-01T12:05:30Z',
  durationMs: 330000,
  provider: 'claude-code',
  exitCode: 0,
  providerSessionId: 'claude-sess-xyz',
  tokenUsage: {
    inputTokens: 12500,
    outputTokens: 3200,
    cacheReadTokens: 8000,
    cacheWriteTokens: 1500,
  },
  costUsd: 0.42,
  conversationId: null,
  metadata: { trigger: 'summon', animaId: 'anm-3f7b2c1', writId: 'wrt-8a4c9e2' },
  output: '### Overall: PASS\n\n### Completeness\n...',  // final assistant message
}
```

When The Loom and The Roster are available, the session record can be enriched with anima provenance — a snapshot of the identity and composition at session time. This provenance is critical for experiment ethnography (understanding what an anima "was" when it produced a given output).

Enriched fields (contributed by the caller or a post-session enrichment step):

| Field | Source | Purpose |
|---|---|---|
| `animaId` | Roster / caller metadata | Which anima ran |
| `animaName` | Roster / caller metadata | Human-readable identity |
| `roles` | Roster | Roles the anima held at session time |
| `curriculumName` | Loom / manifest | Curriculum snapshot |
| `curriculumVersion` | Loom / manifest | Curriculum version for reproducibility |
| `temperamentName` | Loom / manifest | Temperament snapshot |
| `temperamentVersion` | Loom / manifest | Temperament version |
| `trigger` | Caller (clockworks / CLI) | What invoked the session |
| `workshop` | Caller (workspace resolver) | Workshop name |
| `workspaceKind` | Caller (workspace resolver) | guildhall / workshop-temp / workshop-managed |
| `writId` | Caller (clockworks) | Bound writ for traceability |
| `turnNumber` | Caller (conversation manager) | Position in a multi-turn conversation |

**Design question:** Should enrichment happen via (a) the caller passing structured metadata that The Animator promotes into indexed fields, or (b) a post-session enrichment step that reads the session record and augments it? Option (a) is simpler; option (b) keeps the Animator interface stable as the enrichment set grows. Both work with the current `metadata` bag — the difference is whether The Animator's Stacks schema gains named columns for these fields or whether they remain JSON-path-queried properties inside `metadata`.

---

## Transcripts

The Animator captures full session transcripts in a dedicated `transcripts` book, separate from the `sessions` book. This keeps the operational session records lean (small records, fast CDC) while making the full interaction history available for web UIs, operational logs, debugging, and research.

Each transcript record contains the complete NDJSON message stream from the session provider:

```typescript
interface TranscriptDoc {
  id: string                          // same as session id — 1:1 relationship
  messages: TranscriptMessage[]       // full NDJSON transcript
}

type TranscriptMessage = Record<string, unknown>
```

The transcript is written at session completion (step 4 in the animate lifecycle), alongside the session result. If the transcript write fails, the error is logged but does not propagate — same error handling contract as session recording.

The `output` field on the session record (the final assistant message text) is extracted from the transcript before storage. This gives programmatic consumers a fast path to the session's conclusion without parsing the full transcript.

### Data scale

Transcripts are typically 500KB–5MB per session. At ~60 sessions/day, this is ~30–300MB/day in the transcripts book. SQLite handles this comfortably — primary key lookups are microseconds regardless of row size. The transcripts book has no CDC handlers, so there is no amplification concern. Retention/archival is a future concern.

---

## Future: Tool-Equipped Sessions

When The Instrumentarium ships, The Animator gains the ability to launch sessions with an MCP tool server. Tool resolution is the Loom's responsibility — the Loom resolves role → permissions → tools and returns them on the `AnimaWeave`. The Animator receives the resolved tool set and handles MCP server lifecycle.

### Updated lifecycle

```
summon(request)
  │
  ├─ 1. Resolve The Loom
  ├─ 2. loom.weave({ role }) → AnimaWeave { systemPrompt, tools }
  │     (Loom resolves role → permissions, calls instrumentarium.resolve(),
  │      reads tool instructions, composes full system prompt)
  └─ 3. Delegate to animate()

animate(request)
  │
  ├─ 1. Generate session id
  ├─ 2. Write initial session record to The Stacks
  │
  ├─ 3. If context.tools is present, configure MCP server:
  │     - Register each tool from the resolved set
  │     - Each tool handler accesses guild infrastructure via guild() singleton
  │
  ├─ 4. Launch session provider (with MCP server attached)
  ├─ 5. Monitor process until exit
  ├─ 6. Record result to The Stacks
  └─ 7. Return SessionResult
```

The Animator does not call the Instrumentarium directly — it receives the tool set from the AnimaWeave. This keeps tool resolution and system prompt composition together in the Loom, where tool instructions can be woven into the prompt alongside the tools they describe.

### Updated `SessionProviderConfig`

```typescript
interface SessionProviderConfig {
  systemPrompt: string
  initialPrompt?: string
  /** Resolved tools to serve via MCP. */
  tools?: ToolDefinition[]
  model: string
  conversationId?: string
  cwd: string
  streaming?: boolean
  /** Environment variables for the session process. */
  environment?: Record<string, string>
}
```

The session provider interface gains an optional `tools` field. The provider configures the MCP server from the tool definitions. Providers that don't support MCP ignore it. The Animator handles MCP server lifecycle (start before launch, stop after exit).

---

## Future: Streaming Through the Tool Contract

The current CLI streaming path works via a stderr side-channel in the provider (see § CLI streaming behavior). This is pragmatic and works well for the `nsg summon` use case, but it has limitations:

- The CLI has no control over formatting or filtering of streamed output — it's raw provider text on stderr.
- MCP callers cannot receive streaming output at all — the tool contract returns a single value.
- Callers that want to interleave chunk types (text, tool_use, tool_result) with their own UI cannot — the stderr stream is unstructured text.

The Animator already supports structured streaming internally: `animate({ streaming: true })` returns an `AnimateHandle` whose `chunks` async iterable yields typed `SessionChunk` objects in real time. The gap is that the tool system has no way to expose this to callers.

### Design sketch

Extend `ToolDefinition.handler` to support an `AsyncIterable` return type:

```typescript
// Current
handler: (params: T) => unknown | Promise<unknown>

// Extended
handler: (params: T) => unknown | Promise<unknown> | AsyncIterable<unknown>
```

Each caller adapts the iterable to its transport:

- **CLI** — detects `AsyncIterable`, writes chunks to stdout as they arrive (e.g. text chunks as plain text, tool_use/tool_result as structured lines). Prints the final summary after iteration completes.
- **MCP** — maps the iterable to MCP's streaming response model (SSE or streaming content blocks, depending on MCP protocol version).
- **Engines** — consume the iterable directly for programmatic streaming.

The `summon` tool handler would change from:

```typescript
const { result } = animator.summon({ prompt, role, cwd });
const session = await result;
return { id: session.id, status: session.status, ... };
```

To:

```typescript
const { chunks, result } = animator.summon({ prompt, role, cwd, streaming: true });
yield* chunks;           // stream output to caller
const session = await result;
return { id: session.id, status: session.status, ... };
```

(Using an async generator handler, or a dedicated streaming return wrapper — exact syntax TBD.)

### What this enables

- CLI users see formatted, filterable streaming output on stdout instead of raw stderr.
- MCP clients (e.g. IDE extensions, web UIs) receive real-time session output through the standard tool response channel.
- The stderr side-channel in the provider becomes unnecessary — streaming is a first-class concern of the tool contract.

### Dependencies

- Tool contract change (`ToolDefinition` in tools-apparatus)
- CLI adapter for async iterable tool returns
- MCP server adapter for streaming tool responses
- Decision: should the streaming return include both chunks and a final summary, or just chunks (with the summary as the last chunk)?

Blocked on: tool contract design discussion, MCP streaming support.

=== FILE: docs/architecture/apparatus/clerk.md ===
# The Clerk — API Contract

Status: **Draft**

Package: `@shardworks/clerk-apparatus` · Plugin id: `clerk`

> **⚠️ MVP scope.** The first implementation covers flat mandate writs with patron-triggered dispatch. No writ hierarchy, no Clockworks integration. Future sections describe where this apparatus is headed once the Clockworks and rigging system exist.

---

## Purpose

The Clerk is the guild's obligation authority. It receives commissions from the patron, issues writs that formally record what is owed, manages the lifecycle of those writs through to completion or failure, and maintains the Ledger — the guild's book of work.

The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the rigging system — the Spider assembles rigs, and engines execute the work. The Clerk tracks the obligation, not the execution.

The Clerk does **not** execute work. It does not launch sessions, manage rigs, or orchestrate engines. It tracks obligations: what has been commissioned, what state each obligation is in, and whether the guild has fulfilled its commitments. When the Clockworks and rigging system exist, the Clerk will integrate with them via lifecycle events and signals.

---

## Dependencies

```
requires: ['stacks']
```

- **The Stacks** (required) — persists writs in the `writs` book. All writ state lives here.

---

## Kit Interface

The Clerk does not consume kit contributions. No `consumes` declaration.

Kits that need to create or manage writs do so through the Clerk's tools or programmatic API, not through kit contribution fields. Writ creation is an operational act (with validation and lifecycle rules), not a declarative registration.

---

## Support Kit

```typescript
supportKit: {
  books: {
    writs: {
      indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
    },
  },
  tools: [
    commissionPost,
    writShow,
    writList,
    writAccept,
    writComplete,
    writFail,
    writCancel,
  ],
},
```

### `commission-post` tool

Post a new commission. Creates a mandate writ in `ready` status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | `string` | yes | Short description of the work |
| `body` | `string` | yes | Full spec — what to do, acceptance criteria, context |
| `codex` | `string` | no | Target codex name |
| `type` | `string` | no | Writ type (default: `"mandate"`) |

Returns the created `WritDoc`.

Permission: `clerk:write`

### `writ-show` tool

Read a writ by id. Returns the full `WritDoc` including status history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |

Permission: `clerk:read`

### `writ-list` tool

List writs with optional filters. Returns writs ordered by `createdAt` descending.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | `WritStatus` | no | Filter by status |
| `type` | `string` | no | Filter by writ type |
| `limit` | `number` | no | Max results (default: 20) |

Permission: `clerk:read`

### `writ-accept` tool

Claim a writ. Transitions `ready → active`. Sets `acceptedAt`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |

Permission: `clerk:write`

### `writ-complete` tool

Mark a writ as successfully completed. Transitions `active → completed`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | yes | What was done — summary of the work delivered |

Permission: `clerk:write`

### `writ-fail` tool

Mark a writ as failed. Transitions `active → failed`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | yes | Why the work failed |

Permission: `clerk:write`

### `writ-cancel` tool

Cancel a writ. Transitions `ready|active → cancelled`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | no | Why the writ was cancelled |

Permission: `clerk:write`

---

## `ClerkApi` Interface (`provides`)

```typescript
interface ClerkApi {
  // ── Commission Intake ─────────────────────────────────────────

  /**
   * Post a commission — create a mandate writ in ready status.
   *
   * This is the primary entry point for patron-originated work.
   * Creates a WritDoc and persists it to the writs book.
   */
  post(request: PostCommissionRequest): Promise<WritDoc>

  // ── Writ Queries ──────────────────────────────────────────────

  /** Read a single writ by id. Throws if not found. */
  show(id: string): Promise<WritDoc>

  /** List writs with optional filters. */
  list(filters?: WritFilters): Promise<WritDoc[]>

  /** Count writs matching filters. */
  count(filters?: WritFilters): Promise<number>

  // ── Writ Lifecycle ────────────────────────────────────────────

  /**
   * Transition a writ to a new status.
   *
   * Enforces the status machine — invalid transitions throw.
   * Updates the writ document and sets timestamp fields.
   *
   * Valid transitions:
   *   ready → active
   *   active → completed
   *   active → failed
   *   ready|active → cancelled
   *
   * The `fields` parameter allows setting additional fields
   * atomically with the transition (e.g. `resolution`).
   */
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>
}
```

### Supporting Types

```typescript
interface WritDoc {
  /** Unique writ id (prefixed, sortable: `w-{base36_timestamp}{hex_random}`). */
  id: string
  /** Writ type — guild vocabulary. e.g. "mandate", "task", "bug". */
  type: string
  /** Current status. */
  status: WritStatus
  /** Short description. */
  title: string
  /** Full spec — what to do, acceptance criteria, context. */
  body: string
  /** Target codex name, if applicable. */
  codex?: string

  // ── Timestamps ──────────────────────────────────────────────

  /** When the writ was created. */
  createdAt: string
  /** When the writ was last modified. */
  updatedAt: string
  /** When status moved to active (accepted). */
  acceptedAt?: string
  /** When terminal status was reached. */
  resolvedAt?: string

  // ── Resolution ───────────────────────────────────────────────

  /** Summary of how the writ resolved. Set on any terminal transition.
   *  What was done (completed), why it failed (failed), or why it
   *  was cancelled (cancelled). The `status` field distinguishes which. */
  resolution?: string
}

type WritStatus =
  | "ready"       // Posted, awaiting acceptance or dispatch
  | "active"      // Claimed by an anima, work in progress
  | "completed"   // Work done successfully
  | "failed"      // Work failed
  | "cancelled"   // Cancelled by patron or system

interface PostCommissionRequest {
  title: string
  body: string
  codex?: string
  type?: string       // default: "mandate"
}

interface WritFilters {
  status?: WritStatus
  type?: string
  limit?: number
  offset?: number
}
```

---

## Configuration

All Clerk configuration lives under the `clerk` key in `guild.json`. The Clerk uses [module augmentation](../plugins.md#typed-config-via-module-augmentation-recommended) to extend `GuildConfig`, so config is accessed via `guild().guildConfig().clerk` with full type safety — no manual cast needed.

```json
{
  "clerk": {
    "writTypes": [
      { "name": "mandate" },
      { "name": "task", "description": "A concrete unit of implementation work" },
      { "name": "bug", "description": "A defect to investigate and fix" }
    ],
    "defaultType": "mandate"
  }
}
```

```typescript
interface ClerkConfig {
  writTypes?: WritTypeEntry[]
  defaultType?: string
}

interface WritTypeEntry {
  name: string
  description?: string
}

// Module augmentation — typed access via guild().guildConfig().clerk
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clerk?: ClerkConfig
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `writTypes` | `WritTypeEntry[]` | `[]` | Additional writ type declarations. Each entry has a `name` and optional `description`. The built-in type `"mandate"` is always valid regardless of this list. |
| `defaultType` | `string` | `"mandate"` | Default type when `commission-post` is called without a type. |

Both fields are optional. A guild with no `clerk` config (or an empty one) gets only the built-in `mandate` type with `defaultType: "mandate"` — enough to post commissions with no configuration.

Writ types are the guild's vocabulary — not a framework-imposed hierarchy. A guild that does only implementation work might use only `mandate`. A guild with planning animas might add `task`, `step`, `bug`, `spike`. The Clerk validates that posted writs use a declared type but assigns no behavioral semantics to the type name — that meaning lives in role instructions and (when available) standing orders and engine designs.

---

## Status Machine

The writ status machine governs all transitions. The Clerk enforces this — invalid transitions throw.

```
            ┌──────────────┐
            │    ready     │──────────┐
            └──────┬───────┘          │
                   │                  │
              accept               cancel
                   │                  │
                   ▼                  │
            ┌──────────────┐          │
            │    active    │──────┐   │
            └──┬───────┬───┘      │   │
               │       │          │   │
          complete    fail     cancel  │
               │       │          │   │
               ▼       ▼          │   │
        ┌───────────┐ ┌────────┐  │   │
        │ completed │ │ failed │  │   │
        └───────────┘ └────────┘  │   │
                                  │   │
              ┌───────────┐       │   │
              │ cancelled │◀──────┘   │
              │           │◀──────────┘
              └───────────┘
```

Terminal statuses: `completed`, `failed`, `cancelled`. No transitions out of terminal states.

### [Future] The `pending` status

When writ hierarchy is implemented, a parent writ transitions to `pending` when it has active children and is not directly actionable itself. `pending` is not a terminal state — when all children complete, the parent can transition to `completed`. If any child fails, the parent can transition to `failed`.

```
ready → pending    (when children are created via decompose())
pending → completed  (when all children complete — may be automatic)
pending → failed     (when a child fails — patron decides)
pending → cancelled
```

---

## Commission Intake Pipeline

Commission intake is a single synchronous step:

```
├─ 1. Patron calls commission-post (or ClerkApi.post())
├─ 2. Clerk validates input, generates ULID, creates WritDoc
├─ 3. Clerk writes WritDoc to writs book (status: ready)
└─ 4. Returns WritDoc to caller
```

One commission = one mandate writ. No planning, no decomposition. Execution is handled by the Spider, which spawns a rig for each ready writ and drives it through the engine pipeline.

---

## Future: Clockworks Integration

When the Clockworks apparatus exists, the Clerk gains event emission and reactive dispatch.

### Dependency Change

```
requires:   ['stacks']
recommends: ['clockworks']
```

The Clockworks becomes a recommended (not required) dependency. The Clerk checks for the Clockworks at emit time — not at startup — so it functions standalone. When the Clockworks is absent, event emission is silently skipped.

### Lifecycle Events

The Clerk emits events into the Clockworks event stream at each status transition. Event names use the writ's `type` as the namespace, matching the framework event catalog.

| Transition | Event | Payload |
|-----------|-------|---------|
| Commission posted | `commission.posted` | `{ writId, title, type, codex }` |
| Writ signaled ready | `{type}.ready` | `{ writId, title, type, codex }` |
| `ready → active` | `{type}.active` | `{ writId }` |
| `active → completed` | `{type}.completed` | `{ writId, resolution }` |
| `active → failed` | `{type}.failed` | `{ writId, resolution }` |
| `* → cancelled` | `{type}.cancelled` | `{ writId, resolution }` |

These events are what standing orders bind to. The canonical dispatch pattern:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "mandate.ready", "summon": "artificer", "prompt": "Read your writ with writ-show and fulfill the commission. Writ id: {{writ.id}}" }
    ]
  }
}
```

### `signal()` Method

A new method on `ClerkApi`:

```typescript
/**
 * Signal that a writ is ready for dispatch.
 *
 * Emits `{type}.ready` into the Clockworks event stream.
 * In the full design, called after intake processing (Sage
 * decomposition, validation) completes. This is the signal
 * the Spider (or summon relay) listens for to begin execution.
 */
signal(id: string): Promise<void>
```

### Execution Integration

The Clerk integrates with the execution layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The Spider picks it up and spawns a rig to begin work. The Clerk does not know or care how the writ is executed — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes, the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. The Spider calls this when it strikes a completed rig. For direct-summon execution (standing orders), the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.

### Intake with Planning

When Sage animas and the Clockworks are available, the intake pipeline gains a planning step:

```
├─ 1. Patron calls commission-post
├─ 2. Clerk creates mandate writ (status: ready)
├─ 3. Clerk emits commission.posted
├─ 4. Standing order on commission.posted summons a Sage
├─ 5. Sage reads the mandate, decomposes into child writs via decompose()
├─ 6. Clerk creates child writs (status: ready), sets parent to pending
├─ 7. Clerk emits {childType}.ready for each child
├─ 8. Standing orders on {childType}.ready dispatch workers
├─ 9. As children complete, Clerk rolls up status to parent
└─ 10. When all children complete, parent mandate → completed
```

The patron's experience doesn't change — they still call `commission-post`. The planning step is internal to the guild.

---

## Future: Writ Hierarchy

Writs form a tree. A mandate writ may be decomposed into child writs (tasks, steps, etc.) by a planning anima. The hierarchy enables:

- **Decomposition** — a broad commission broken into concrete tasks
- **Completion rollup** — parent completes when all children complete
- **Failure propagation** — parent awareness of child failures
- **Scope tracking** — the patron sees one mandate; the guild sees the tree

### Hierarchy Rules

- A writ may have zero or one parent.
- A writ may have zero or many children.
- Depth is not limited (but deep hierarchies are a design smell).
- Children inherit the parent's `codex` unless explicitly overridden.
- The parent's `childCount` is denormalized and maintained by the Clerk.

### Completion Rollup

When a child writ reaches a terminal status, the Clerk checks siblings:
- All children `completed` → parent auto-transitions to `completed`
- Any child `failed` → the Clerk emits `{parentType}.child-failed` but does NOT auto-fail the parent. The patron (or a standing order) decides whether to fail, retry, or cancel.
- Child `cancelled` → no automatic parent transition.

### `decompose()` Method

```typescript
/**
 * Create child writs under a parent.
 *
 * Used by planning animas (Sages) to decompose a mandate into
 * concrete tasks. Children inherit the parent's codex unless
 * overridden. The parent transitions to `pending` when it has
 * active children and is not directly actionable.
 */
decompose(parentId: string, children: CreateWritRequest[]): Promise<WritDoc[]>
```

---

## Open Questions

- **Should `commission-post` be a permissionless tool?** It represents patron authority — commissions come from outside the guild. But Coco (running inside a session) needs to call it. Current thinking: gate it with `clerk:write` and grant that to the steward role.

- **Writ type validation — strict or advisory?** The Clerk validates against `clerk.writTypes` in config. But this means adding a new type requires a config change. Alternative: accept any string, use the config list only for documentation/tooling hints. Current thinking: strict validation — the guild should know its own vocabulary.

---

## Implementation Notes

- Standalone apparatus package at `packages/plugins/clerk/`. Requires only the Stacks.
- `WritDoc.type` uses a guild-defined vocabulary, not a framework enum. The Clerk validates against `clerk.writTypes` in the apparatus config section but the framework imposes no meaning on the type name.
- Writ ids use the format `w-{base36_timestamp}{hex_random}` — sortable by creation time, unique without coordination. Not a formal ULID, but provides the same useful properties (temporal ordering, no coordination).
- The `transition()` method is the single choke point for all status changes. All tools and future integrations go through it. This is where validation, timestamp setting, and (future) event emission and hierarchy rollup happen.
- When the Clockworks is eventually added as a recommended dependency, resolve it at emit time via `guild().apparatus()`, not at startup — so the Clerk functions with or without it.

=== FILE: docs/architecture/apparatus/review-loop.md ===
# The Review Loop — Design Spec

Status: **Design** (not yet implemented)

> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — within the rigging system. This document specifies the design as implemented in the Spider.

---

## Purpose

The review loop moves quality assurance inside the rig. Instead of dispatching a commission once and surfacing the result to the patron regardless of quality, the rig runs an implementation pass, evaluates the result against concrete criteria, and — if the criteria are not met — runs a revision pass. The patron receives work only after it has cleared at least one automated review gate, or after the loop has exhausted its retry budget.

This is not a general-purpose test harness. The review loop does one thing: catch the most common and cheapest-to-detect failure modes before they become patron problems.

**What the review loop is not:**
- A replacement for spec quality. A bad spec produces bad work; the review loop helps only when the anima had the information to succeed but failed in execution.
- A Clockworks-dependent system. The loop runs entirely within the rigging pipeline using existing apparatus.
- A complete quality gate. The MVP catches mechanical failures; richer review criteria are future scope.

---

## Empirical Motivation

Commission log X013 (`experiments/data/commission-log.yaml`) through 2026-04-02 shows the following outcome distribution across patron-tracked commissions with known outcomes:

| Outcome | Count | Notes |
|---------|-------|-------|
| success | 7 | Includes 1 with revision_required=true (partial attribution issue) |
| partial | 2 | Required follow-up commissions |
| abandoned | 3 | Two were test/infra noise; one was execution_error |
| cancelled | 1 | Process failure, not work failure |

Of the real work failures, the two most common causes were:
1. **Uncommitted changes** — anima produced correct work but did not commit before session end. Mechanically detectable.
2. **Partial execution** — anima completed some of the spec but missed a subsystem (e.g. missed a test file, broke a build). Partially detectable via build/test runs.

Both are catchable with cheap, mechanical review criteria. Neither requires an LLM judge. This is the MVP's target.

---

## Design Decision: Where Does the Loop Live?

Three candidate locations were considered:

### Option B: Review engine in every rig (full design)

The Spider seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.

**Pros:** Architecturally clean. Composes naturally with Spider's traversal. Reusable engine designs. Composes naturally with the Spider — the rig handles iteration natively.

**Cons:** Requires the Spider. Not implementable until the rigging system exists.

### Option C: Rig pattern via origination engine

The origination engine seeds rigs with review chains by default. Superficially similar to Option B, but the decision of whether to include a review loop is made at origination time, not by a default rig structure.

**Pros:** Gives origination agency over review strategy (some work may not need review; some may need richer review).

**Cons:** Complicates origination. Review is almost always appropriate; making it opt-in inverts the sensible default.

### Decision

**Option B (review engines in the rig) is the chosen design.**

The Spider seeds every rig with an `implement → review → revise → seal` chain. The review engine is a clockwork engine that runs mechanical checks and a reviewer session; the revise engine is a quick engine. Both are standard engine designs contributed by the Spider's support kit. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.

---

## Review Engines in the Rig

### Engine Designs

#### `review` engine (clockwork)

**Design:**
```typescript
{
  id: 'review',
  kind: 'clockwork',
  inputs: ['writId', 'worktreePath', 'attempt'],
  outputs: ['reviewResult'],
  config: {
    checks: ['uncommitted_changes', 'build', 'test'],
    buildCommand: string | undefined,
    testCommand: string | undefined,
  }
}
```

The review engine runs the same three checks as the MVP. It writes a `ReviewResult` to its yield. It does not branch — it always completes, passing the result downstream.

The downstream engine (either a `seal` engine or a `revise` engine) reads `reviewResult.passed` to decide what to do. The Spider sees a completed engine regardless of outcome; the branching logic lives in the rig structure (see Rig Pattern below).

#### `revise` engine (quick)

**Design:**
```typescript
{
  id: 'revise',
  kind: 'quick',
  inputs: ['writId', 'worktreePath', 'reviewResult', 'attempt'],
  outputs: ['sessionResult'],
  role: 'artificer',
}
```

The revise engine assembles the revision prompt (same template as MVP) and launches an anima session. The session runs in the existing worktree — it does not open a new draft.

### Rig Pattern

The default rig for a commission with review enabled:

```
                ┌──────────────┐
                │  implement   │  (quick engine: artificer)
                │    engine    │
                └──────┬───────┘
                       │ yield: sessionResult
                       ▼
                ┌──────────────┐
                │    review    │  (clockwork engine)
                │   engine 1  │
                └──────┬───────┘
                       │ yield: reviewResult
          ┌────────────┴────────────┐
          │ passed                  │ failed (attempt < maxRetries)
          ▼                         ▼
   ┌─────────────┐         ┌──────────────────┐
   │    seal     │         │     revise       │  (quick engine: artificer)
   │   engine    │         │     engine 1     │
   └─────────────┘         └────────┬─────────┘
                                    │ yield: sessionResult
                                    ▼
                           ┌──────────────────┐
                           │     review       │  (clockwork engine)
                           │    engine 2      │
                           └────────┬─────────┘
                                    │ yield: reviewResult
                       ┌────────────┴────────────┐
                       │ passed                  │ failed
                       ▼                         ▼
                ┌─────────────┐         ┌──────────────────┐
                │    seal     │         │    escalate      │  (clockwork engine)
                │   engine    │         │    engine        │
                └─────────────┘         └──────────────────┘
```

The Spider traverses this graph naturally. Each engine completes and propagates its yield; downstream engines activate when their upstream is complete. The conditional branching (pass → seal, fail → revise) is expressed in the rig structure, not in Spider logic — the Spider just runs whatever is ready.

**Seeding the rig:** The origination engine produces this graph when it seeds the rig. For `maxRetries=2`, the origination engine seeds a fixed graph (not dynamically extended). If the guild wants `maxRetries=0` (no review loop), origination seeds the simple `implement → seal` graph.

**Dynamic extension (future):** A more sophisticated design would have the review engine declare a `need: 'revision'` when it fails, and the Fabricator would resolve and graft the next revise+review pair. This avoids pre-seeding the full graph and enables arbitrary retry depths. This is Future scope — the fixed graph is sufficient for MVP and avoids Spider complexity in the initial rigging implementation.

### Spider Integration

The Spider needs no changes to support the review loop. It already:
- Traverses all engines whose upstream is complete
- Routes ready engines to the Executor
- Handles both clockwork and quick engine kinds

The review loop is just a graph shape that Spider happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Spider itself is agnostic.

---

## Review Criteria Reference

### MVP Criteria (Mechanical)

| Check | Description | Detection Method | Cost |
|-------|-------------|-----------------|------|
| `uncommitted_changes` | All work is committed | `git status --porcelain` | < 100ms |
| `build` | Build command exits cleanly | Run configured build command | Varies |
| `test` | Test suite passes | Run configured test command | Varies |

The `uncommitted_changes` check is always enabled. Build and test checks are opt-in via guild configuration.

### Future Criteria (Judgment-Required)

These are not in scope for MVP but are the natural next layer:

| Check | Description | Detection Method | Cost |
|-------|-------------|-----------------|------|
| `spec_coverage` | Diff addresses spec requirements | LLM-as-judge pass on (spec, diff) | Medium |
| `no_regressions` | No tests were deleted or disabled | Diff analysis | Low |
| `type_check` | TypeScript compilation passes | `tsc --noEmit` | Varies |
| `lint` | Linter passes | Run configured lint command | Varies |

The LLM-as-judge `spec_coverage` check is the most valuable future criterion — it catches the "anima only addressed part of the spec" failure mode that mechanical checks miss. It requires a separate quick engine with access to the writ body and the diff, and a structured prompt asking whether the diff achieves the spec's stated goals.

---

## Artifact Schema

Every review pass writes an artifact. Artifacts live in the commission data directory alongside the existing artifacts written by the Laboratory.

### Location

```
experiments/data/commissions/<writ-id>/
  commission.md          (existing — writ body)
  review.md              (existing template — patron review slot)
  review-loop/
    attempt-1/
      review.md          (ReviewResult as structured markdown)
      git-status.txt     (git status output)
      git-diff.txt       (git diff HEAD output)
    attempt-2/
      review.md
      git-status.txt
      git-diff.txt
    escalation.md        (if loop exhausted; patron-facing summary)
```

The review engine writes these artifacts via the Stacks or directly to the commission data directory.

### `review.md` Schema

```markdown
# Review — Attempt {N}

**Writ:** {writId}
**Timestamp:** {ISO 8601}
**Result:** PASSED | FAILED

## Checks

| Check | Result | Duration |
|-------|--------|----------|
| uncommitted_changes | ✓ PASS / ✗ FAIL | {ms}ms |
| build | ✓ PASS / ✗ FAIL | {ms}ms |
| test | ✓ PASS / ✗ FAIL | {ms}ms |

## Failures

{for each failure}
### {check}
{message}

```
{detail}
```
{end for}
```

### `escalation.md` Schema

```markdown
# Review Loop Escalated

**Writ:** {writId}
**Title:** {writ.title}
**Attempts:** {N}
**Timestamp:** {ISO 8601}

The review loop exhausted its retry budget ({maxRetries} retries) without
achieving a passing review. The draft has been abandoned.

## Summary of Failures

{for each attempt}
### Attempt {N}
{list of failed checks with messages}
{end for}

## Recommended Actions

- Inspect the worktree state preserved in the draft artifacts
- Review the git-diff.txt files in each attempt directory
- Revise the spec to address the observed failure mode before re-dispatching
```

---

## Configuration

Review configuration lives in `guild.json`:

```json
{
  "review": {
    "enabled": true,
    "maxRetries": 2,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields are optional. `enabled` defaults to `false` (opt-in). The intent is to make it default-on once the loop has been validated in practice. This configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.

---

## Observability

The review loop is itself experiment data. Every iteration produces artifacts that the Laboratory can capture and analyze:

1. **Review artifacts** (`review-loop/attempt-N/`) — structured pass/fail evidence for each check. Enables quantitative analysis: which checks catch what failure modes? How often does the second attempt pass where the first failed?

2. **Session records** — revision sessions are recorded in the Animator's `sessions` book with `metadata.trigger: 'review-revision'` and `metadata.attempt: N`. Enables cost accounting: how much does the review loop add per commission?

3. **Writ resolution field** — when the loop escalates, the writ resolution includes the retry count. The commission log's `failure_mode` can be set to `review_exhausted` to distinguish review-loop failures from first-try failures.

4. **Commission log** — the `revision_required` field will more accurately reflect anima-driven revisions vs. patron-driven revisions once the review loop is active. The distinction becomes: `revision_required: true, revision_source: patron | review_loop`.

---

## Open Questions

These questions could not be resolved without patron input or empirical data from MVP deployment. Flag for patron review before implementation.

**Q1: Default-on or opt-in?**

The spec recommends opt-in for MVP (`enabled: false` default) to avoid surprises during initial deployment. However, opting-in per guild means the review loop doesn't run in experiments where it would produce the most useful data. Consider making it default-on from the start, with `enabled: false` as the escape hatch for commissions where review is inappropriate (e.g. spec-writing commissions like this one, where there's no build/test to run).

**Q2: Should revision sessions open new drafts or continue in the existing worktree?**

The current design continues in the existing worktree. This means revision builds on what the first attempt produced — which is usually correct (fix what's broken, don't start over). But it also means the revision session can see a messy worktree with uncommitted changes from the first attempt. Does the first attempt's work contaminate the revision? Or is seeing it in context (via `git diff`) actually helpful? No empirical evidence yet.

**Q3: What is the revision session's role?**

Should the revising anima be the same role as the implementing anima (e.g. `artificer`)? Or should the review loop summon a different role with explicit "you are reviewing and fixing prior work" instructions? The current spec defaults to the same role with a modified prompt. A distinct `revisor` role with specialized temperament could perform better. Needs a/b testing once the loop is running.

**Q4: Should the review pass happen before sealing, or is it implicitly "before sealing"?**

The current design places the review pass between the implementation session and the seal step. This means the draft is open during review. If the review pass runs the test suite, the test suite runs inside the worktree before sealing — which is correct. But it also means the worktree is mutable during review (in theory another process could write to it). Is this a problem in practice? Probably not for single-dispatch guilds, but worth noting.

**Q5: LLM-as-judge: when and how?**

The spec defers LLM-as-judge review to future scope, but it's the most valuable future criterion. Key unresolved questions: which model? What's the prompt structure? What's the acceptance threshold (0-10 score? binary pass/fail from the judge)? Who pays for the judge session — is it accounted separately from the commission cost? These need design work before the feature is useful.

**Q6: Should the review loop apply to spec-writing commissions?**

This commission is itself a spec-writing commission. There's no build command to run, no test suite to pass. The only mechanical check that applies is `uncommitted_changes`. Is that sufficient to warrant running the loop? Or should spec-writing commissions (like this one, with no target codex build) opt out of the loop by default? Consider: a charge type hint (`spec` vs. `implementation`) could guide the origination engine to include or exclude the review loop in the initial rig.

---

## Future Evolution

### Phase 2 (Spider-level engine designs)
- `review` clockwork engine contributed by a kit
- `revise` quick engine contributed by the same kit
- Origination engine seeds review graph by default
- Review configuration passed per-rig, not just per-guild

### Phase 3 (Richer review criteria)
- LLM-as-judge `spec_coverage` check
- `type_check` and `lint` checks
- Per-commission review configuration (charge type → review strategy)
- Distinct `revisor` role with specialized temperament

### Phase 4 (Dynamic extension)
- Review engine declares `need: 'revision'` on failure
- Fabricator resolves revision chain dynamically
- Arbitrary retry depth (or patron-configured per-commission)
- Review loop data feeds Surveyor codex profiles (this codex has a 60% first-try rate → seed richer review graph by default)


=== FILE: docs/architecture/apparatus/scriptorium.md ===
# The Scriptorium — API Contract

Status: **Draft**

Package: `@shardworks/codexes-apparatus` · Plugin id: `codexes`

> **⚠️ MVP scope.** This spec covers codex registration, draft binding lifecycle, and sealing/push operations. Clockworks integration (events, standing orders) is future work — the Scriptorium will emit events when the Clockworks apparatus exists. The Surveyor's codex-awareness integration is also out of scope for now.

---

## Purpose

The Scriptorium manages the guild's codexes — the git repositories where the guild's inscriptions accumulate. It owns the registry of known codexes, maintains local bare clones for efficient access, opens and closes draft bindings (worktrees) for concurrent work, and handles the sealing lifecycle that incorporates drafts into the sealed binding.

The Scriptorium does **not** know what a codex contains or what work applies to it (that's the Surveyor's domain). It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines, dispatch scripts, or direct human invocation). It is pure git infrastructure — repository lifecycle, draft isolation, and branch management.

### Vocabulary Mapping

The Scriptorium's tools use the [guild metaphor's binding vocabulary](../../guild-metaphor.md#binding-canonical). The mapping to git concepts:

| Metaphor | Git | Scriptorium API |
|----------|-----|-----------------|
| **Codex** | Repository | `add`, `list`, `show`, `remove`, `fetch` |
| **Draft binding** (draft) | Worktree + branch | `openDraft`, `listDrafts`, `abandonDraft` |
| **Sealed binding** | Default branch (e.g. `main`) | Target of `seal` |
| **Sealing** | Fast-forward merge (or rebase + ff) | `seal` |
| **Abandoning** | Remove worktree + branch | `abandonDraft` |
| **Inscription** | Commit | *(not managed by the Scriptorium — animas inscribe directly via git)* |

Use plain git terms (branch, commit, merge) in error messages and logs where precision matters; the binding vocabulary is for the tool-facing API and documentation.

---

## Dependencies

```
requires: ['stacks']
consumes: []
```

- **The Stacks** — persists the codex registry and draft tracking records. Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status).

---

## Kit Interface

The Scriptorium does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [
    codexAddTool,
    codexListTool,
    codexShowTool,
    codexRemoveTool,
    codexPushTool,
    draftOpenTool,
    draftListTool,
    draftAbandonTool,
    draftSealTool,
  ],
},
```

---

## `ScriptoriumApi` Interface (`provides`)

```typescript
interface ScriptoriumApi {
  // ── Codex Registry ──────────────────────────────────────────

  /**
   * Register an existing repository as a codex.
   * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
   * entry to the `codexes` config section in `guild.json`.
   * Blocks until the clone completes.
   */
  add(name: string, remoteUrl: string): Promise<CodexRecord>

  /**
   * List all registered codexes with their status.
   */
  list(): Promise<CodexRecord[]>

  /**
   * Show details for a single codex, including active drafts.
   */
  show(name: string): Promise<CodexDetail>

  /**
   * Remove a codex from the guild. Abandons all active drafts,
   * removes the bare clone from `.nexus/codexes/`, and removes the
   * entry from `guild.json`. Does NOT delete the remote repository.
   */
  remove(name: string): Promise<void>

  /**
   * Fetch latest refs from the remote for a codex's bare clone.
   * Called automatically before draft creation and sealing; can
   * also be invoked manually.
   */
  fetch(name: string): Promise<void>

  /**
   * Push a branch to the codex's remote.
   * Pushes the specified branch (default: codex's default branch)
   * to the bare clone's configured remote. Does not force-push.
   */
  push(request: PushRequest): Promise<void>

  // ── Draft Binding Lifecycle ─────────────────────────────────

  /**
   * Open a draft binding on a codex.
   *
   * Creates a new git branch from `startPoint` (default: the codex's
   * sealed binding) and checks it out as an isolated worktree under
   * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
   * before branching to ensure freshness.
   *
   * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
   * Rejects with a clear error if a draft with the same branch name
   * already exists for this codex.
   */
  openDraft(request: OpenDraftRequest): Promise<DraftRecord>

  /**
   * List active drafts, optionally filtered by codex.
   */
  listDrafts(codexName?: string): Promise<DraftRecord[]>

  /**
   * Abandon a draft — remove the draft's worktree and git branch.
   * Fails if the draft has unsealed inscriptions unless `force: true`.
   * The inscriptions persist in the git reflog but the draft is no
   * longer active.
   */
  abandonDraft(request: AbandonDraftRequest): Promise<void>

  /**
   * Seal a draft — incorporate its inscriptions into the sealed binding.
   *
   * Git strategy: fast-forward merge only. If ff is not possible,
   * rebases the draft branch onto the target and retries. Retries up
   * to `maxRetries` times (default: from settings.maxMergeRetries)
   * to handle contention from concurrent sealing. Fails hard if the
   * rebase produces conflicts — no auto-resolution, no merge commits.
   *
   * On success, abandons the draft (unless `keepDraft: true`).
   */
  seal(request: SealRequest): Promise<SealResult>
}
```

### Supporting Types

```typescript
interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

interface DraftRecord {
  /** Unique draft id (ULID). */
  id: string
  /** Codex this draft belongs to. */
  codexName: string
  /** Git branch name for this draft. */
  branch: string
  /** Absolute filesystem path to the draft's working directory (git worktree). */
  path: string
  /** When the draft was opened. */
  createdAt: string
  /** Optional association — e.g. a writ id. */
  associatedWith?: string
}

interface OpenDraftRequest {
  /** Codex to open the draft for. */
  codexName: string
  /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
  branch?: string
  /**
   * Starting point — branch, tag, or commit to branch from.
   * Default: remote HEAD (the codex's default branch).
   */
  startPoint?: string
  /** Optional association metadata (e.g. writ id). */
  associatedWith?: string
}

interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

interface SealRequest {
  /** Codex name. */
  codexName: string
  /** Git branch to seal (the draft's branch). */
  sourceBranch: string
  /** Target branch (the sealed binding). Default: codex's default branch. */
  targetBranch?: string
  /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
  maxRetries?: number
  /** Keep the draft after successful sealing. Default: false. */
  keepDraft?: boolean
}

interface SealResult {
  /** Whether sealing succeeded. */
  success: boolean
  /** Strategy used: 'fast-forward' or 'rebase'. */
  strategy: 'fast-forward' | 'rebase'
  /** Number of retry attempts needed (0 = first try). */
  retries: number
  /** The commit SHA at head of target after sealing. */
  sealedCommit: string
  /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
  inscriptionsSealed: number
}

interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}
```

---

## Configuration

The `codexes` key in `guild.json` has two sections: `settings` (apparatus-level configuration) and `registered` (the codex registry). Both can be edited by hand or through tools.

```json
{
  "codexes": {
    "settings": {
      "maxMergeRetries": 3,
      "draftRoot": ".nexus/worktrees"
    },
    "registered": {
      "nexus": {
        "remoteUrl": "git@github.com:shardworks/nexus.git"
      },
      "my-app": {
        "remoteUrl": "git@github.com:patron/my-app.git"
      }
    }
  }
}
```

### Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMergeRetries` | `number` | `3` | Max rebase-retry attempts during sealing under contention. |
| `draftRoot` | `string` | `".nexus/worktrees"` | Directory where draft worktrees are created, relative to guild root. |

### Registered Codexes

Each key in `registered` is the codex name (unique within the guild). The value:

| Field | Type | Description |
|-------|------|-------------|
| `remoteUrl` | `string` | The remote URL of the codex's git repository. Used for cloning and fetching. |

The config is intentionally minimal — a human can add a codex by hand-editing `guild.json` and the Scriptorium will pick it up on next startup (cloning the bare repo if needed).

---

## Tool Definitions

### `codex-add`

Register an existing repository as a codex.

```typescript
tool({
  name: 'codex-add',
  description: 'Register an existing git repository as a guild codex',
  permission: 'write',
  params: {
    name: z.string().describe('Name for the codex (unique within the guild)'),
    remoteUrl: z.string().describe('Git remote URL of the repository'),
  },
  handler: async ({ name, remoteUrl }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.add(name, remoteUrl)
  },
})
```

### `codex-list`

List all registered codexes.

```typescript
tool({
  name: 'codex-list',
  description: 'List all codexes registered with the guild',
  permission: 'read',
  params: {},
  handler: async () => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.list()
  },
})
```

### `codex-show`

Show details of a specific codex including active drafts.

```typescript
tool({
  name: 'codex-show',
  description: 'Show details of a registered codex including active draft bindings',
  permission: 'read',
  params: {
    name: z.string().describe('Codex name'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.show(name)
  },
})
```

### `codex-remove`

Remove a codex from the guild (does not delete the remote).

```typescript
tool({
  name: 'codex-remove',
  description: 'Remove a codex from the guild (does not affect the remote repository)',
  permission: 'delete',
  params: {
    name: z.string().describe('Codex name to remove'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.remove(name)
  },
})
```

### `codex-push`

Push a branch to the codex's remote.

```typescript
tool({
  name: 'codex-push',
  description: 'Push a branch to the codex remote',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().optional().describe('Branch to push (default: codex default branch)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.push(params)
  },
})
```

### `draft-open`

Open a draft binding — create an isolated worktree for a codex.

```typescript
tool({
  name: 'draft-open',
  description: 'Open a draft binding on a codex (creates an isolated git worktree)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex to open the draft for'),
    branch: z.string().optional().describe('Branch name for the draft (default: auto-generated draft-<ulid>)'),
    startPoint: z.string().optional().describe('Branch/tag/commit to start from (default: remote HEAD)'),
    associatedWith: z.string().optional().describe('Optional association (e.g. writ id)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.openDraft(params)
  },
})
```

### `draft-list`

List active draft bindings.

```typescript
tool({
  name: 'draft-list',
  description: 'List active draft bindings, optionally filtered by codex',
  permission: 'read',
  params: {
    codexName: z.string().optional().describe('Filter by codex name'),
  },
  handler: async ({ codexName }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.listDrafts(codexName)
  },
})
```

### `draft-abandon`

Abandon a draft binding.

```typescript
tool({
  name: 'draft-abandon',
  description: 'Abandon a draft binding (removes the git worktree and branch)',
  permission: 'delete',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().describe('Branch of the draft to abandon'),
    force: z.boolean().optional().describe('Force abandonment even with unmerged changes'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.abandonDraft(params)
  },
})
```

### `draft-seal`

Seal a draft — merge its branch into the sealed binding.

```typescript
tool({
  name: 'draft-seal',
  description: 'Seal a draft binding into the codex (ff-only merge or rebase; no merge commits)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    sourceBranch: z.string().describe('Draft branch to seal'),
    targetBranch: z.string().optional().describe('Target branch (default: codex default branch)'),
    maxRetries: z.number().optional().describe('Max rebase retries under contention (default: 3)'),
    keepDraft: z.boolean().optional().describe('Keep draft after sealing (default: false)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.seal(params)
  },
})
```

---

## Session Integration

The Scriptorium and the Animator are **intentionally decoupled**. The Scriptorium manages git infrastructure; the Animator manages sessions. Neither knows about the other. They compose through a simple handoff: the `DraftRecord.path` returned by `openDraft()` is the `cwd` passed to the Animator's `summon()` or `animate()`.

### Composition pattern

The binding between a session and a draft is the caller's responsibility. The typical flow:

```
  Orchestrator (dispatch script, rig engine, standing order)
    │
    ├─ 1. scriptorium.openDraft({ codexName, branch })
    │     → DraftRecord { path: '.nexus/worktrees/nexus/writ-42' }
    │
    ├─ 2. animator.summon({ role, prompt, cwd: draft.path })
    │     → session runs, anima inscribes in the draft
    │     → session exits
    │
    └─ 3. scriptorium.seal({ codexName, sourceBranch })
          → draft sealed into codex and pushed to remote
```

The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal) happen outside the session, ensuring they execute even if the session crashes or times out.

### The `DraftRecord` as handoff object

The `DraftRecord` carries everything the Animator needs:

- **`path`** — the session's `cwd`
- **`codexName`** — for session metadata (which codex this session worked on)
- **`branch`** — for session metadata (which draft)
- **`associatedWith`** — the writ id, if any (passed through to session metadata)

The Animator stores these as opaque metadata on the session record. The Scriptorium doesn't read session records; the Animator doesn't read draft records. They share data through the orchestrator that calls both.

### Why not tighter integration?

Animas cannot reliably manage their own draft lifecycle. A session's working directory is set at launch — the anima cannot relocate itself to a draft it opens mid-session. Even if it could (via absolute paths and `cd`), the failure modes are poor: crashed sessions leave orphaned drafts, forgotten seal steps leave inscriptions stranded, and every anima reimplements the same boilerplate. External orchestration is simpler and more reliable.

---

## Bare Clone Architecture

The Scriptorium maintains **bare clones** of each codex under `.nexus/codexes/<name>.git`. This is the local git infrastructure that makes draft operations fast and network-efficient.

```
.nexus/
  codexes/
    nexus.git/          ← bare clone of git@github.com:shardworks/nexus.git
    my-app.git/         ← bare clone of git@github.com:patron/my-app.git
  worktrees/
    nexus/
      writ-42/          ← draft: nexus, branch writ-42
      writ-57/          ← draft: nexus, branch writ-57
    my-app/
      writ-63/          ← draft: my-app, branch writ-63
```

### Why bare clones?

- **Single clone, many drafts.** A bare clone has no working tree of its own — it's just the git object database. Multiple draft worktrees can be created from it simultaneously without duplicating the repository data.
- **Network efficiency.** After the initial clone, updates are `git fetch` operations — fast, incremental, no full re-clone.
- **Transparent to animas.** An anima inscribing in a draft sees a normal git checkout. It doesn't know or care that the underlying repo is a bare clone. `git commit`, `git log`, `git diff` all work normally.
- **Clean separation.** The bare clone in `.nexus/codexes/` is infrastructure; the draft worktrees in `.nexus/worktrees/` are workspaces. Neither pollutes the guild's versioned content.

### Lifecycle

```
codex-add
  ├─ 1. Write entry to guild.json config
  ├─ 2. git clone --bare <remoteUrl> .nexus/codexes/<name>.git
  └─ 3. Record clone status in Stacks

draft-open
  ├─ 1. git fetch (in bare clone) — ensure refs are current
  ├─ 2. git worktree add .nexus/worktrees/<codex>/<branch> -b <branch> <startPoint>
  └─ 3. Record draft in Stacks

draft-seal
  ├─ 1. Fetch remote refs (git fetch --prune origin +refs/heads/*:refs/remotes/origin/*)
  │     → populates refs/remotes/origin/* without touching local sealed binding or draft branches
  ├─ 2. Advance local sealed binding if remote is ahead
  │     → if refs/remotes/origin/<target> is ahead of refs/heads/<target>: advance refs/heads/<target>
  │     → if local is ahead (unpushed seals): keep local — preserves inter-draft contention ordering
  ├─ 3. Attempt fast-forward merge
  │     └─ If ff not possible: rebase source onto target
  │        └─ If rebase conflicts: FAIL (no auto-resolution)
  │        └─ If rebase succeeds: retry ff (up to maxRetries)
  ├─ 4. Update target branch ref in bare clone
  ├─ 5. Push target branch to remote (git push origin <branch>)
  └─ 6. Abandon draft (unless keepDraft)

codex-push
  ├─ 1. git push origin <branch> (from bare clone)
  └─ 2. Never force-push

codex-remove
  ├─ 1. Abandon all drafts for codex
  ├─ 2. Remove bare clone directory
  ├─ 3. Remove entry from guild.json
  └─ 4. Clean up Stacks records
```

### Sealing Strategy Detail

Sealing enforces **linear history** on the sealed binding — no merge commits, no force pushes. If a draft's inscriptions contradict the sealed binding (i.e. the sealed binding has advanced since the draft was opened), the sealing engine attempts to reconcile via rebase. If reconciliation fails, sealing seizes — the tool fails rather than creating non-linear history or silently resolving conflicts.

Git mechanics:

```
Seal Attempt:
  ├─ Try: git merge --ff-only <draft-branch> into <sealed-branch>
  │   ├─ Success → draft sealed
  │   └─ Fail (sealed binding has advanced) →
  │       ├─ Fetch latest sealed binding from remote
  │       ├─ Try: git rebase <sealed-branch> <draft-branch>
  │       │   ├─ Conflict → FAIL (sealing seizes — manual reconciliation needed)
  │       │   └─ Clean rebase →
  │       │       └─ Retry ff-only merge (loop, up to maxRetries)
  │       └─ All retries exhausted → FAIL
  └─ Never: merge commits, force push, conflict auto-resolution
```

The retry loop handles **contention** — when multiple animas seal to the same codex in quick succession, each fetch-rebase-ff cycle picks up the other's sealed inscriptions. Three retries (configurable via `settings.maxMergeRetries`) is sufficient for typical guild concurrency; the limit prevents infinite loops in pathological cases.

---

## Clone Readiness and Fetch Policy

### Initial clone

The `add()` API **blocks until the bare clone completes**. The caller gets back a `CodexRecord` with `cloneStatus: 'ready'` — registration isn't done until the clone is usable. This keeps the contract simple: if `add()` returns successfully, the codex is operational.

At **startup**, the Scriptorium checks each configured codex for an existing bare clone. Missing clones are initiated in the background — the apparatus starts without waiting. However, any tool invocation that requires the bare clone (everything except `codex-list`) **blocks until that codex's clone is ready**. The tool doesn't fail or return stale data; it waits. If the clone fails, the tool fails with a clear error referencing the clone failure.

### Fetch before branch operations

Every operation that creates or modifies branches **fetches from the remote first**:

- **`openDraft`** — fetches before branching, ensuring the start point reflects the latest remote state.
- **`seal`** — fetches the target branch before attempting ff-only, and again on each retry iteration. The fetch uses an explicit refspec (`+refs/heads/*:refs/remotes/origin/*`) to populate remote-tracking refs — a plain `git fetch origin` in a bare clone (which has no default fetch refspec) only updates `FETCH_HEAD` and leaves both `refs/heads/*` and `refs/remotes/origin/*` stale. After fetching, if `refs/remotes/origin/<target>` is strictly ahead of `refs/heads/<target>` (i.e. commits were pushed outside the Scriptorium), the local sealed binding is advanced to the remote position before the seal attempt. This ensures the draft is rebased onto the actual remote state and the subsequent push fast-forwards cleanly.
- **`push`** — does **not** fetch first (it's pushing, not pulling).

`fetch` is also exposed as a standalone API for manual use, but callers generally don't need it — the branch operations handle freshness internally.

### Startup reconciliation

On `start()`, the Scriptorium:

1. Reads the `codexes` config from `guild.json`
2. For each configured codex, checks whether a bare clone exists at `.nexus/codexes/<name>.git`
3. Initiates background clones for any missing codexes
4. Reconciles Stacks records with filesystem state (cleans up records for drafts that no longer exist on disk)

This means a patron can hand-edit `guild.json` to add a codex, and the Scriptorium will clone it on next startup.

---

## Draft Branch Collisions

If a caller requests a draft with a branch name that already exists for that codex, `openDraft` **rejects with a clear error**. Branch naming is the caller's responsibility. Auto-suffixing would hide real problems (two writs accidentally opening drafts on the same branch). Git enforces this at the worktree level — a branch can only be checked out in one worktree at a time — and the Scriptorium surfaces the constraint rather than working around it.

---

## Draft Cleanup

The Scriptorium does **not** automatically reap stale drafts. It provides the `abandonDraft` API; when and why to call it is an external concern. A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon` as needed. This keeps the Scriptorium ignorant of writ lifecycle and other domain concerns.

---

## Future: Clockworks Events

When the Clockworks apparatus exists, the Scriptorium should emit events for downstream consumers (particularly the Surveyor):

| Event | Payload | When |
|-------|---------|------|
| `codex.added` | `{ name, remoteUrl }` | A codex is registered |
| `codex.removed` | `{ name }` | A codex is deregistered |
| `codex.fetched` | `{ name }` | A codex's bare clone is fetched |
| `draft.opened` | `{ codexName, branch, path, associatedWith? }` | A draft is opened |
| `draft.abandoned` | `{ codexName, branch }` | A draft is abandoned |
| `draft.sealed` | `{ codexName, sourceBranch, targetBranch, strategy }` | A draft is sealed |
| `codex.pushed` | `{ codexName, branch }` | A branch is pushed to remote |

Until then, downstream consumers query the Scriptorium API directly.

---

## Implementation Notes

- **`guild().writeConfig()`** — the Scriptorium uses `guild().writeConfig('codexes', ...)` to persist codex registry changes to `guild.json`. This API was added to the `Guild` interface in `@shardworks/nexus-core` and implemented in Arbor. It updates both the in-memory config and the disk file atomically.
- **Git operations.** All git operations use `child_process.execFile` (not shell) via a lightweight `git.ts` helper that handles error parsing and provides typed results (`GitResult`, `GitError`).
- **Concurrency.** Multiple animas may open/seal drafts concurrently. The bare clone's git operations need appropriate locking — git's own ref locking handles most cases, but the fetch-rebase-seal cycle should be serialized per codex to avoid ref races.
- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Spider, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.

---

## Future State

### Draft Persistence via Stacks

The current implementation tracks active drafts **in memory**, reconstructed from filesystem state at startup. This is sufficient for MVP — draft worktrees are durable on disk and the Scriptorium reconciles on restart. However, this means:

- Draft metadata (`associatedWith`, `createdAt`) is approximate after a restart — the original values are lost.
- There is no queryable history of past drafts (abandoned or sealed).
- Other apparatus cannot subscribe to draft state changes via CDC.

A future iteration should persist `DraftRecord` entries to a Stacks book (`codexes/drafts`), enabling:

- Durable metadata that survives restarts
- Historical draft records (with terminal status: `sealed`, `abandoned`)
- CDC-driven downstream reactions (e.g. the Surveyor updating its codex-awareness when a draft is sealed)

### Per-Codex Sealing Lock

The sealing retry loop (fetch → rebase → ff) is not currently serialized per codex. Under high concurrency (multiple animas sealing to the same codex simultaneously), ref races are possible. Git's own ref locking prevents corruption, but the retry loop may exhaust retries unnecessarily.

A per-codex async mutex around the seal operation would eliminate this. The lock should be held only during the seal attempt, not during the preceding fetch or the subsequent draft cleanup.

### Clockworks Event Emission

Documented in the **Future: Clockworks Events** section above. When the Clockworks apparatus exists, the Scriptorium should emit events for each lifecycle operation. This replaces the current pattern where downstream consumers poll the API directly.

=== FILE: docs/architecture/apparatus/spider.md ===
# The Spider — API Contract

Status: **Ready — MVP**

Package: `@shardworks/spider-apparatus` · Plugin id: `spider`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Spider runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Spider is the spine of the guild's rigging system. It runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.

The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.

---

## Dependencies

```
requires: ['fabricator', 'clerk', 'stacks']
```

- **The Fabricator** — resolves engine designs by `designId`.
- **The Clerk** — queries ready writs; receives writ transitions via CDC.
- **The Stacks** — persists rigs book, reads sessions book, hosts CDC handler on rigs book.

Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Spider dependencies.

### Reference docs

- **The Rigging System** (`docs/architecture/rigging.md`) — full rigging architecture (Spider, Fabricator, Executor, Manifester). This spec implements a subset.
- **The Fabricator** (`docs/architecture/apparatus/fabricator.md`) — engine design registry and `EngineDesign` type definitions.
- **The Scriptorium** (`docs/architecture/apparatus/scriptorium.md`) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- **The Animator** (`docs/architecture/apparatus/animator.md`) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- **The Clerk** (`docs/architecture/apparatus/clerk.md`) — writ lifecycle API.
- **The Stacks** (`docs/architecture/apparatus/stacks.md`) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

The Spider resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.

### Kit contribution

The Spider contributes its five engine designs via its support kit:

```typescript
// In spider-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: [crawlOneTool, crawlContinualTool],
},
```

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.

---

## The Walk Function

The Spider's core is a single step function:

```typescript
interface SpiderApi {
  /**
   * Examine guild state and perform the single highest-priority action.
   * Returns a description of what was done, or null if there's nothing to do.
   */
  crawl(): Promise<CrawlResult | null>
}

type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Each `crawl()` call does exactly one thing. The priority ordering:

1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). **Yield assembly:** look up the `EngineDesign` by `designId` from the Fabricator. If the design defines a `collect(sessionId, givens, context)` method, call it to assemble the yields — passing the same givens and context that were passed to `run()`. Otherwise, use the generic default: `{ sessionId, sessionStatus, output? }`. This keeps engine-specific yield logic (e.g. parsing review findings) in the engine, not the Spider. If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent crawl calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.

If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).

### Operational model

The Spider exports two tools:

```
nsg crawl-continual   # starts polling loop, crawls every ~5s, runs indefinitely
nsg crawl-one         # single step (useful for debugging/testing)
```

The `crawl-continual` loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle. Pass `--maxIdleCycles N` to stop after N consecutive idle cycles.

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

Stored in the Stacks `rigs` book. One rig per writ. The Spider reads and updates rigs via normal Stacks `put()`/`patch()` operations.

### Engine Instance

```typescript
interface EngineInstance {
  id: string               // unique within the rig, e.g. 'draft', 'implement', 'review', 'revise', 'seal'
  designId: string         // engine design id — resolved from the Fabricator
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  upstream: string[]       // ids of engines that must complete first (empty = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Spider polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: SpiderConfig): EngineInstance[] {
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

The `givensSpec` is populated from the Spider's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.

**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Spider should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.

When the Spider runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:

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

> **Note:** Field names mirror the Scriptorium's `DraftRecord` type (`codexName`, `branch`, `path`) rather than inventing Spider-specific aliases. `baseSha` is the only field the draft engine adds itself — by reading `HEAD` after opening the draft.

### `ImplementYields`

```typescript
interface ImplementYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `implement` engine (set by Spider's collect step when session completes)
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

**Produced by:** `revise` engine (set by Spider's collect step when session completes)
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

> **Note:** Field names mirror the Scriptorium's `SealResult` type. The Scriptorium's `seal()` method pushes the target branch to the remote after sealing.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Spider's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

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

  return { status: 'launched', sessionId: handle.sessionId }
}
```

The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.

**Collect step:** The implement engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

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
      mechanicalChecks: checks,  // stash for collect step to retrieve
    },
  })

  return { status: 'launched', sessionId: handle.sessionId }
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

**Collect step:** The review engine defines a `collect` method that the Spider calls when the session completes. The engine looks up the session record itself and parses the reviewer's structured findings. No file is written to the worktree (review artifacts don't belong in the codebase).

```typescript
async collect(sessionId: string, _givens: Record<string, unknown>, _context: EngineRunContext): Promise<ReviewYields> {
  const stacks = guild().apparatus<StacksApi>('stacks')
  const session = await stacks.readBook<SessionDoc>('animator', 'sessions').get(sessionId)
  const findings = session?.output ?? ''
  const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
  const mechanicalChecks = (session?.metadata?.mechanicalChecks as MechanicalCheck[]) ?? []
  return { sessionId, passed, findings, mechanicalChecks }
}
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

  return { status: 'launched', sessionId: handle.sessionId }
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

**Collect step:** The revise engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

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

The Spider registers one CDC handler at startup:

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
2. All engines in the rig with `status === 'pending'` are set to `status: 'cancelled'` — they will never run. Engines already in `'running'`, `'completed'`, or `'failed'` are left untouched. Cancelled engines do **not** receive `completedAt` or `error` — cancellation is a consequence, not a failure.
3. The rig is marked `status: 'failed'` (same transaction as steps 1 and 2)
4. CDC fires on the rig status change → handler calls Clerk API to transition the writ to `failed`
5. The draft is **not** abandoned — preserved for patron inspection

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.

Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Spider's).

---

## Dependency Map

```
Spider
  ├── Fabricator  (resolve engine designs by designId)
  ├── Clerk       (query ready writs, transition writ state via CDC)
  ├── Stacks      (persist rigs book, read sessions book, CDC handler on rigs book)
  │
  Engines (via guild() singleton, not Spider dependencies)
  ├── Scriptorium (draft, seal engines — open drafts, seal)
  ├── Animator    (implement, review, revise engines — summon animas)
  └── Loom        (via Animator's summon — context composition)
```

---

## Future Evolution

These are known directions the Spider and its data model will grow. None are in scope for the static rig MVP.

- **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
- **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
- **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Spider checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Spider marks it failed (and optionally terminates the session).
- **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

---

## What This Spec Does NOT Cover

- **Origination.** Commission → rig mapping is hardcoded (static graph).
- **The Executor as a separate apparatus.** The Spider runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed. Key design constraint: the Spider currently `await`s `design.run()`, meaning a slow or misbehaving engine blocks the entire crawl loop. The Executor must not have this property — engine execution should be fully non-blocking, with yields persisted to a book so the orchestrator can poll for completion. This is essential for remote and Docker runners where the process that ran the engine is not the process polling for results.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Spider processes multiple ready engines across rigs.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.

---

## Configuration

```json
{
  "spider": {
    "role": "artificer",
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields optional. `role` defaults to `"artificer"`. `pollIntervalMs` defaults to `5000`. `buildCommand` and `testCommand` are run by the review engine before launching the reviewer; omitted means those mechanical checks are skipped (reviewer anima still does spec-vs-diff assessment).

=== FILE: packages/plugins/codexes/src/scriptorium-core.test.ts ===
/**
 * Tests for the Scriptorium core logic.
 *
 * Creates real git repositories in temp directories to test the full
 * lifecycle: add → openDraft → commit → seal → push, and all the edge
 * cases (branch collisions, unsealed inscription guards, sealing with
 * rebase, startup reconciliation).
 *
 * Each test gets a fresh "remote" repo (the source of truth) and a
 * fresh guild directory. The Scriptorium operates against local file://
 * URLs, so no network access is needed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';

import { ScriptoriumCore } from './scriptorium-core.ts';
import { git } from './git.ts';
import type { CodexesConfig } from './types.ts';

// ── Test infrastructure ─────────────────────────────────────────────

/** Dirs to clean up after each test. */
let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nsg-scriptorium-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

/** Run git synchronously in a directory. */
function gitSync(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/**
 * Create a "remote" bare repository with an initial commit on `main`.
 * Returns the file:// URL and the path.
 */
function createRemoteRepo(): { url: string; path: string } {
  // Create a non-bare repo first so we can make an initial commit
  const workDir = makeTmpDir('remote-work');
  gitSync(['init', '-b', 'main'], workDir);
  gitSync(['config', 'user.email', 'test@test.com'], workDir);
  gitSync(['config', 'user.name', 'Test'], workDir);
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Test Repo\n');
  gitSync(['add', 'README.md'], workDir);
  gitSync(['commit', '-m', 'Initial commit'], workDir);

  // Clone to bare for use as "remote"
  const bareDir = makeTmpDir('remote-bare');
  // Remove the dir first since git clone won't clone into existing non-empty dir
  fs.rmSync(bareDir, { recursive: true });
  gitSync(['clone', '--bare', workDir, bareDir], os.tmpdir());

  return { url: `file://${bareDir}`, path: bareDir };
}

/** In-memory config store for the fake guild. */
interface FakeGuildState {
  home: string;
  configs: Record<string, unknown>;
}

function createFakeGuild(state: FakeGuildState): Guild {
  return {
    home: state.home,
    apparatus: () => { throw new Error('not available in test'); },
    config<T>(pluginId: string): T {
      return (state.configs[pluginId] ?? {}) as T;
    },
    writeConfig<T>(pluginId: string, value: T): void {
      state.configs[pluginId] = value;
    },
    guildConfig: () => ({ name: 'test-guild', nexus: '0.0.0', plugins: [] }),
    kits: () => [],
    apparatuses: () => [],
  };
}

/** Create a ScriptoriumCore with a fake guild and start it. */
function createStartedCore(opts?: {
  config?: CodexesConfig;
  home?: string;
}): { core: ScriptoriumCore; guildState: FakeGuildState } {
  const home = opts?.home ?? makeTmpDir('guild');
  const guildState: FakeGuildState = {
    home,
    configs: opts?.config ? { codexes: opts.config } : {},
  };
  setGuild(createFakeGuild(guildState));

  const core = new ScriptoriumCore();
  core.start();

  return { core, guildState };
}

// ── Cleanup ─────────────────────────────────────────────────────────

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

// ── Tests ───────────────────────────────────────────────────────────

describe('ScriptoriumCore', () => {

  // ── Startup ─────────────────────────────────────────────────────

  describe('start()', () => {
    it('creates .nexus/codexes/ directory', () => {
      const { core, guildState } = createStartedCore();
      const codexesDir = path.join(guildState.home, '.nexus', 'codexes');
      assert.ok(fs.existsSync(codexesDir));
    });

    it('reads settings from config', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore({
        config: {
          settings: { maxMergeRetries: 5 },
          registered: { test: { remoteUrl: remote.url } },
        },
      });
      // The settings are private, but we can verify the codex was loaded
      const list = await core.createApi().list();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'test');
    });

    it('loads registered codexes from config and sets cloneStatus', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore({
        config: {
          registered: { mycodex: { remoteUrl: remote.url } },
        },
      });
      const api = core.createApi();
      const list = await api.list();
      assert.equal(list.length, 1);
      // Codex is cloning in background since bare clone doesn't exist yet
      assert.ok(
        list[0].cloneStatus === 'cloning' || list[0].cloneStatus === 'ready',
        `Expected 'cloning' or 'ready', got '${list[0].cloneStatus}'`,
      );
    });

    it('recognizes existing bare clones as ready', async () => {
      const remote = createRemoteRepo();
      const home = makeTmpDir('guild');
      // Pre-create the bare clone
      const codexesDir = path.join(home, '.nexus', 'codexes');
      fs.mkdirSync(codexesDir, { recursive: true });
      gitSync(['clone', '--bare', remote.url, path.join(codexesDir, 'mycodex.git')], home);

      const { core } = createStartedCore({
        home,
        config: {
          registered: { mycodex: { remoteUrl: remote.url } },
        },
      });

      const list = await core.createApi().list();
      assert.equal(list[0].cloneStatus, 'ready');
    });
  });

  // ── Codex Registry ──────────────────────────────────────────────

  describe('add()', () => {
    it('clones a bare repo and returns a ready CodexRecord', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      const record = await api.add('test-codex', remote.url);

      assert.equal(record.name, 'test-codex');
      assert.equal(record.remoteUrl, remote.url);
      assert.equal(record.cloneStatus, 'ready');
      assert.equal(record.activeDrafts, 0);

      // Verify bare clone exists on disk
      const clonePath = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      assert.ok(fs.existsSync(clonePath));
      // Verify it's a bare repo
      const isBare = gitSync(['rev-parse', '--is-bare-repository'], clonePath);
      assert.equal(isBare, 'true');
    });

    it('persists codex entry to config', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      const config = guildState.configs['codexes'] as CodexesConfig;
      assert.ok(config.registered?.['test-codex']);
      assert.equal(config.registered['test-codex'].remoteUrl, remote.url);
    });

    it('rejects duplicate codex names', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await assert.rejects(
        () => api.add('test-codex', remote.url),
        /already registered/,
      );
    });

    it('cleans up on clone failure', async () => {
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await assert.rejects(
        () => api.add('bad-codex', 'file:///nonexistent/repo'),
        /Failed to clone/,
      );

      // Should not appear in the list
      const list = await api.list();
      assert.equal(list.length, 0);

      // Should not appear in config
      const config = guildState.configs['codexes'] as CodexesConfig | undefined;
      assert.ok(!config?.registered?.['bad-codex']);
    });
  });

  describe('list()', () => {
    it('returns empty array when no codexes registered', async () => {
      const { core } = createStartedCore();
      const list = await core.createApi().list();
      assert.deepEqual(list, []);
    });

    it('returns all registered codexes', async () => {
      const remote1 = createRemoteRepo();
      const remote2 = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('first', remote1.url);
      await api.add('second', remote2.url);

      const list = await api.list();
      assert.equal(list.length, 2);
      const names = list.map((c) => c.name).sort();
      assert.deepEqual(names, ['first', 'second']);
    });
  });

  describe('show()', () => {
    it('returns codex details with default branch', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const detail = await api.show('test-codex');

      assert.equal(detail.name, 'test-codex');
      assert.equal(detail.defaultBranch, 'main');
      assert.equal(detail.activeDrafts, 0);
      assert.deepEqual(detail.drafts, []);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().show('nonexistent'),
        /not registered/,
      );
    });

    it('includes active drafts in detail', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'draft-1' });

      const detail = await api.show('test-codex');
      assert.equal(detail.activeDrafts, 1);
      assert.equal(detail.drafts.length, 1);
      assert.equal(detail.drafts[0].branch, 'draft-1');
    });
  });

  describe('remove()', () => {
    it('removes bare clone, config entry, and in-memory state', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.remove('test-codex');

      // Gone from list
      const list = await api.list();
      assert.equal(list.length, 0);

      // Gone from disk
      const clonePath = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      assert.ok(!fs.existsSync(clonePath));

      // Gone from config
      const config = guildState.configs['codexes'] as CodexesConfig;
      assert.ok(!config.registered?.['test-codex']);
    });

    it('abandons active drafts before removing', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Draft worktree exists
      assert.ok(fs.existsSync(draft.path));

      await api.remove('test-codex');

      // Draft worktree cleaned up
      assert.ok(!fs.existsSync(draft.path));

      // No drafts remain
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 0);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().remove('nonexistent'),
        /not registered/,
      );
    });
  });

  describe('fetch()', () => {
    it('fetches latest refs and updates lastFetched', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      // Show before fetch — lastFetched should be null (add doesn't set it)
      const before = await api.show('test-codex');
      assert.equal(before.lastFetched, null);

      await api.fetch('test-codex');

      const after = await api.show('test-codex');
      assert.ok(after.lastFetched !== null);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().fetch('nonexistent'),
        /not registered/,
      );
    });
  });

  // ── Draft Binding Lifecycle ─────────────────────────────────────

  describe('openDraft()', () => {
    it('creates a worktree and returns a DraftRecord', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({
        codexName: 'test-codex',
        branch: 'my-feature',
      });

      assert.equal(draft.codexName, 'test-codex');
      assert.equal(draft.branch, 'my-feature');
      assert.ok(draft.id); // has an ID
      assert.ok(draft.createdAt); // has a timestamp
      assert.ok(draft.path.includes('my-feature'));

      // Worktree exists on disk
      assert.ok(fs.existsSync(draft.path));
      // Has .git file (worktree marker)
      assert.ok(fs.existsSync(path.join(draft.path, '.git')));
      // Contains the repo content
      assert.ok(fs.existsSync(path.join(draft.path, 'README.md')));
    });

    it('auto-generates branch name when omitted', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex' });

      assert.ok(draft.branch.startsWith('draft-'));
    });

    it('records associatedWith metadata', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({
        codexName: 'test-codex',
        branch: 'writ-42',
        associatedWith: 'writ-42',
      });

      assert.equal(draft.associatedWith, 'writ-42');
    });

    it('rejects duplicate branch names', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'my-branch' });

      await assert.rejects(
        () => api.openDraft({ codexName: 'test-codex', branch: 'my-branch' }),
        /already exists/,
      );
    });

    it('allows same branch name on different codexes', async () => {
      const remote1 = createRemoteRepo();
      const remote2 = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('codex-a', remote1.url);
      await api.add('codex-b', remote2.url);

      const draft1 = await api.openDraft({ codexName: 'codex-a', branch: 'feature' });
      const draft2 = await api.openDraft({ codexName: 'codex-b', branch: 'feature' });

      assert.notEqual(draft1.path, draft2.path);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().openDraft({ codexName: 'nonexistent' }),
        /not registered/,
      );
    });
  });

  describe('listDrafts()', () => {
    it('returns empty array when no drafts exist', async () => {
      const { core } = createStartedCore();
      const drafts = await core.createApi().listDrafts();
      assert.deepEqual(drafts, []);
    });

    it('returns all drafts', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'draft-1' });
      await api.openDraft({ codexName: 'test-codex', branch: 'draft-2' });

      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 2);
    });

    it('filters by codex name', async () => {
      const remote1 = createRemoteRepo();
      const remote2 = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('codex-a', remote1.url);
      await api.add('codex-b', remote2.url);
      await api.openDraft({ codexName: 'codex-a', branch: 'draft-a' });
      await api.openDraft({ codexName: 'codex-b', branch: 'draft-b' });

      const draftsA = await api.listDrafts('codex-a');
      assert.equal(draftsA.length, 1);
      assert.equal(draftsA[0].codexName, 'codex-a');

      const draftsB = await api.listDrafts('codex-b');
      assert.equal(draftsB.length, 1);
      assert.equal(draftsB[0].codexName, 'codex-b');
    });
  });

  describe('abandonDraft()', () => {
    it('removes the worktree and branch', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      assert.ok(fs.existsSync(draft.path));

      await api.abandonDraft({ codexName: 'test-codex', branch: 'my-draft', force: true });

      // Worktree gone
      assert.ok(!fs.existsSync(draft.path));
      // Removed from tracking
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 0);
    });

    it('rejects abandonment of draft with unsealed inscriptions without force', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Add a commit in the draft (an unsealed inscription)
      fs.writeFileSync(path.join(draft.path, 'new-file.txt'), 'hello\n');
      gitSync(['add', 'new-file.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'An inscription'], draft.path);

      await assert.rejects(
        () => api.abandonDraft({ codexName: 'test-codex', branch: 'my-draft' }),
        /unsealed inscription/,
      );

      // Draft still exists
      assert.ok(fs.existsSync(draft.path));
    });

    it('allows forced abandonment of draft with unsealed inscriptions', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Add a commit in the draft
      fs.writeFileSync(path.join(draft.path, 'new-file.txt'), 'hello\n');
      gitSync(['add', 'new-file.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'An inscription'], draft.path);

      // Force should work
      await api.abandonDraft({ codexName: 'test-codex', branch: 'my-draft', force: true });

      assert.ok(!fs.existsSync(draft.path));
    });

    it('throws for unknown draft', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      await assert.rejects(
        () => api.abandonDraft({ codexName: 'test-codex', branch: 'nonexistent' }),
        /No active draft/,
      );
    });
  });

  // ── Sealing ───────────────────────────────────────────────────────

  describe('seal()', () => {
    it('fast-forwards when draft is ahead of sealed binding', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit in the draft
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.success, true);
      assert.equal(result.strategy, 'fast-forward');
      assert.equal(result.retries, 0);
      assert.ok(result.sealedCommit);
    });

    it('abandons draft after successful seal by default', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });

      // Draft should be gone
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 0);
    });

    it('keeps draft when keepDraft is true', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
        keepDraft: true,
      });

      // Draft should still exist
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 1);
    });

    it('seals when source and target are at the same commit', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // No commits — draft is at the same point as main
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.success, true);
      assert.equal(result.retries, 0);
    });

    it('updates the sealed binding ref in the bare clone', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Get the main ref before
      const bareClone = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      const mainBefore = gitSync(['rev-parse', 'main'], bareClone);

      // Make a commit in the draft
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      // main should have advanced
      const mainAfter = gitSync(['rev-parse', 'main'], bareClone);
      assert.notEqual(mainBefore, mainAfter);
      assert.equal(mainAfter, result.sealedCommit);
    });

    it('inscriptionsSealed is 0 for no-op seal (draft has no new commits)', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // No commits — draft is at the same point as main
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.inscriptionsSealed, 0);
    });

    it('inscriptionsSealed counts all draft inscriptions on fast-forward seal', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);

      // Make 3 separate inscriptions
      for (let i = 1; i <= 3; i++) {
        fs.writeFileSync(path.join(draft.path, `inscription-${i}.txt`), `inscription ${i}\n`);
        gitSync(['add', `inscription-${i}.txt`], draft.path);
        gitSync(['commit', '-m', `Inscription ${i}`], draft.path);
      }

      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.strategy, 'fast-forward');
      assert.equal(result.inscriptionsSealed, 3);
    });
  });

  // ── Seal: Rebase contention ──────────────────────────────────────

  describe('seal() rebase contention', () => {

    /**
     * Helper: set up a codex with two diverged drafts.
     *
     * Both draft-A and draft-B branch from the same initial commit on main.
     * Each writes to a different file so the rebase can succeed cleanly.
     *
     * Returns the api plus references to both drafts.
     */
    async function setupDivergedDrafts() {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      const draftA = await api.openDraft({ codexName: 'test-codex', branch: 'draft-a' });
      const draftB = await api.openDraft({ codexName: 'test-codex', branch: 'draft-b' });

      // Configure git in both worktrees
      for (const d of [draftA, draftB]) {
        gitSync(['config', 'user.email', 'test@test.com'], d.path);
        gitSync(['config', 'user.name', 'Test'], d.path);
      }

      // Draft A commits to file-a.txt
      fs.writeFileSync(path.join(draftA.path, 'file-a.txt'), 'from draft A\n');
      gitSync(['add', 'file-a.txt'], draftA.path);
      gitSync(['commit', '-m', 'Draft A inscription'], draftA.path);

      // Draft B commits to file-b.txt (no conflict with A)
      fs.writeFileSync(path.join(draftB.path, 'file-b.txt'), 'from draft B\n');
      gitSync(['add', 'file-b.txt'], draftB.path);
      gitSync(['commit', '-m', 'Draft B inscription'], draftB.path);

      return { api, guildState, draftA, draftB, remote };
    }

    it('rebases and seals when another draft advanced the target', async () => {
      const { api, guildState, draftA, draftB } = await setupDivergedDrafts();

      // Seal draft A first — this advances main past the common ancestor
      const resultA = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'draft-a',
      });
      assert.equal(resultA.success, true);
      assert.equal(resultA.strategy, 'fast-forward');
      assert.equal(resultA.retries, 0);

      // Now seal draft B — main has moved, so ff won't work; must rebase
      const resultB = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'draft-b',
      });

      assert.equal(resultB.success, true);
      assert.equal(resultB.strategy, 'rebase');
      // At least 1 retry (the initial ff attempt fails, rebase, then ff succeeds)
      assert.ok(resultB.retries >= 1, `Expected retries >= 1, got ${resultB.retries}`);
      assert.ok(resultB.sealedCommit);

      // The sealed commit should contain both files
      const bareClone = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      const mainRef = gitSync(['rev-parse', 'main'], bareClone);
      assert.equal(mainRef, resultB.sealedCommit);

      // Verify both inscriptions are present by checking the tree
      const tree = gitSync(['ls-tree', '--name-only', 'main'], bareClone);
      assert.ok(tree.includes('file-a.txt'), 'file-a.txt should be in tree after both seals');
      assert.ok(tree.includes('file-b.txt'), 'file-b.txt should be in tree after both seals');
    });

    it('reports rebase strategy and retry count accurately', async () => {
      const { api } = await setupDivergedDrafts();

      // Seal A (ff)
      await api.seal({ codexName: 'test-codex', sourceBranch: 'draft-a' });

      // Seal B (rebase required)
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'draft-b',
      });

      // Strategy should be 'rebase' because ff was attempted and failed
      assert.equal(result.strategy, 'rebase');
      // Retries tracks the number of rebase-then-retry loops
      assert.ok(result.retries >= 1);
    });

    it('fails with conflict error when rebase cannot resolve', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      const draftA = await api.openDraft({ codexName: 'test-codex', branch: 'draft-a' });
      const draftB = await api.openDraft({ codexName: 'test-codex', branch: 'draft-b' });

      for (const d of [draftA, draftB]) {
        gitSync(['config', 'user.email', 'test@test.com'], d.path);
        gitSync(['config', 'user.name', 'Test'], d.path);
      }

      // Both drafts write conflicting content to the SAME file
      fs.writeFileSync(path.join(draftA.path, 'conflict.txt'), 'content from A\n');
      gitSync(['add', 'conflict.txt'], draftA.path);
      gitSync(['commit', '-m', 'Draft A writes conflict.txt'], draftA.path);

      fs.writeFileSync(path.join(draftB.path, 'conflict.txt'), 'content from B\n');
      gitSync(['add', 'conflict.txt'], draftB.path);
      gitSync(['commit', '-m', 'Draft B writes conflict.txt'], draftB.path);

      // Seal A — should succeed (ff)
      await api.seal({ codexName: 'test-codex', sourceBranch: 'draft-a' });

      // Seal B — rebase will conflict
      await assert.rejects(
        () => api.seal({ codexName: 'test-codex', sourceBranch: 'draft-b' }),
        /Sealing seized.*conflicts/,
      );

      // Draft B should still exist (not cleaned up on failure)
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].branch, 'draft-b');
    });

    it('respects maxRetries limit', async () => {
      const { api } = await setupDivergedDrafts();

      // Seal A first
      await api.seal({ codexName: 'test-codex', sourceBranch: 'draft-a' });

      // Seal B with maxRetries=0 — should fail since ff won't work
      // and we don't allow any retries after the initial attempt
      await assert.rejects(
        () => api.seal({
          codexName: 'test-codex',
          sourceBranch: 'draft-b',
          maxRetries: 0,
        }),
        /failed after 0 retries/,
      );
    });
  });

  // ── Seal: Diverged remote ─────────────────────────────────────────

  describe('seal() diverged remote', () => {

    /**
     * Helper: push a commit to the remote bare repo from an external clone,
     * simulating work done outside the Scriptorium.
     */
    function pushExternalCommit(remoteUrl: string, filename: string, content: string): void {
      const outsideClone = makeTmpDir('outside-clone');
      // git clone needs a non-existent or empty target dir
      fs.rmSync(outsideClone, { recursive: true });
      gitSync(['clone', remoteUrl, outsideClone], os.tmpdir());
      gitSync(['config', 'user.email', 'outside@test.com'], outsideClone);
      gitSync(['config', 'user.name', 'Outside'], outsideClone);
      fs.writeFileSync(path.join(outsideClone, filename), content);
      gitSync(['add', filename], outsideClone);
      gitSync(['commit', '-m', `External: ${filename}`], outsideClone);
      gitSync(['push', 'origin', 'main'], outsideClone);
    }

    it('seals successfully when remote advances between draft open and seal', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);

      // Make an inscription in the draft
      fs.writeFileSync(path.join(draft.path, 'draft-feature.txt'), 'draft work\n');
      gitSync(['add', 'draft-feature.txt'], draft.path);
      gitSync(['commit', '-m', 'Draft inscription'], draft.path);

      // Simulate external push to the remote (outside the Scriptorium)
      pushExternalCommit(remote.url, 'external-change.txt', 'external work\n');

      // Confirm the bare clone's main is now behind the remote
      const bareClone = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      const bareMainBefore = gitSync(['rev-parse', 'main'], bareClone);
      assert.notEqual(remoteHead, bareMainBefore, 'Remote should have advanced past bare clone before seal');

      // Seal should succeed: fetch picks up remote advancement, rebase handles divergence
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
        keepDraft: true,
      });

      assert.equal(result.success, true);
      assert.equal(result.strategy, 'rebase');
      assert.ok(result.retries >= 1, `Expected retries >= 1, got ${result.retries}`);
      assert.equal(result.inscriptionsSealed, 1);

      // Sealed binding should include both the draft inscription and the external commit
      const bareMainAfter = gitSync(['rev-parse', 'main'], bareClone);
      assert.equal(bareMainAfter, result.sealedCommit);

      const tree = gitSync(['ls-tree', '--name-only', 'main'], bareClone);
      assert.ok(tree.includes('draft-feature.txt'), 'draft-feature.txt should be in sealed tree');
      assert.ok(tree.includes('external-change.txt'), 'external-change.txt should be in sealed tree');
    });

    it('push succeeds after sealing against a diverged remote', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);

      fs.writeFileSync(path.join(draft.path, 'draft-work.txt'), 'draft\n');
      gitSync(['add', 'draft-work.txt'], draft.path);
      gitSync(['commit', '-m', 'Draft work'], draft.path);

      // External push advances remote
      pushExternalCommit(remote.url, 'external.txt', 'external\n');

      // Seal — must rebase onto the remote-advanced main; seal now also pushes
      const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
      assert.equal(result.strategy, 'rebase');

      // Confirm remote has the sealed commit (seal() pushed it)
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      assert.equal(remoteHead, result.sealedCommit);
    });

    it('seal pushes to remote', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      fs.writeFileSync(path.join(draft.path, 'seal-push.txt'), 'seal push\n');
      gitSync(['add', 'seal-push.txt'], draft.path);
      gitSync(['commit', '-m', 'Seal push test'], draft.path);

      // seal() should push automatically — no explicit push() call
      const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
      assert.equal(result.success, true);

      // Remote must have the sealed commit without a separate push()
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      assert.equal(remoteHead, result.sealedCommit);
    });

    it('seal pushes on no-op seal', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      // Open a draft but make no commits — sealing is a no-op
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
      assert.equal(result.success, true);
      assert.equal(result.inscriptionsSealed, 0);

      // Remote must match the sealed commit even on a no-op seal
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      assert.equal(remoteHead, result.sealedCommit);

      void draft; // suppress unused warning
    });

    it('push failure after seal throws with distinct message', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      fs.writeFileSync(path.join(draft.path, 'push-fail.txt'), 'push fail\n');
      gitSync(['add', 'push-fail.txt'], draft.path);
      gitSync(['commit', '-m', 'Push fail test'], draft.path);

      // Find the bare clone path via the draft's gitdir.
      // The gitdir is something like /tmp/.../codexes/test-codex.git/worktrees/my-draft
      // Go up two levels to get the bare clone root.
      const gitDir = gitSync(['rev-parse', '--git-dir'], draft.path);
      const cloneGitDir = path.resolve(path.join(gitDir, '..', '..'));

      // Set a push-only URL to an invalid location so fetch still works but push fails.
      // git remote set-url --push only overrides the push URL, leaving fetch URL intact.
      gitSync(['remote', 'set-url', '--push', 'origin', 'file:///nonexistent/path.git'], cloneGitDir);

      // seal() should fail with a push error, not a seal error
      await assert.rejects(
        () => api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' }),
        (err: unknown) => {
          assert.ok(err instanceof Error, 'Expected an Error');
          assert.match(err.message, /Push failed after successful seal/,
            `Expected push-failure message, got: ${err instanceof Error ? err.message : err}`);
          return true;
        },
      );

      // The local bare clone's ref should have been updated (seal succeeded locally)
      const localRef = gitSync(['rev-parse', 'main'], cloneGitDir);
      // The draft's HEAD should match the local sealed ref
      const draftHead = gitSync(['rev-parse', 'HEAD'], draft.path);
      assert.equal(localRef, draftHead);

      // The draft must still exist (push runs before abandonDraft)
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 1, 'Draft should still exist after push failure');
    });
  });

  // ── Startup Reconciliation ────────────────────────────────────────

  describe('startup reconciliation', () => {
    it('reconciles drafts from existing worktrees on disk', async () => {
      const remote = createRemoteRepo();
      const home = makeTmpDir('guild');

      // First: create a core, add a codex, open a draft
      const guildState1: FakeGuildState = {
        home,
        configs: {},
      };
      setGuild(createFakeGuild(guildState1));

      const core1 = new ScriptoriumCore();
      core1.start();
      const api1 = core1.createApi();

      await api1.add('test-codex', remote.url);
      const draft = await api1.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Verify draft exists
      assert.ok(fs.existsSync(draft.path));

      // Now simulate a restart: create a new core with the same home
      clearGuild();
      const guildState2: FakeGuildState = {
        home,
        configs: guildState1.configs, // keep the config
      };
      setGuild(createFakeGuild(guildState2));

      const core2 = new ScriptoriumCore();
      core2.start();
      const api2 = core2.createApi();

      // The draft should be reconciled from disk
      const drafts = await api2.listDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].codexName, 'test-codex');
      assert.equal(drafts[0].branch, 'my-draft');
      assert.equal(drafts[0].path, draft.path);
    });
  });

  // ── Push ─────────────────────────────────────────────────────────

  describe('push()', () => {
    it('pushes sealed commits to the remote', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit and seal
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'pushed feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add pushed feature'], draft.path);

      // seal() now pushes automatically — no explicit push() call needed
      const sealResult = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });

      // Verify the remote has the commit (pushed by seal())
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      assert.equal(remoteHead, sealResult.sealedCommit);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().push({ codexName: 'nonexistent' }),
        /not registered/,
      );
    });
  });
});

=== FILE: packages/plugins/codexes/src/scriptorium-core.ts ===
/**
 * The Scriptorium — core logic.
 *
 * Manages the codex registry (bare clones), draft binding lifecycle
 * (worktrees), and sealing (ff-only merge or rebase+ff). All git
 * operations go through the git helper for safety.
 *
 * Draft tracking is in-memory — drafts are reconstructed from
 * filesystem state at startup and maintained in memory during the
 * process lifetime.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */

import fs from 'node:fs';
import path from 'node:path';

import { guild, generateId } from '@shardworks/nexus-core';

import { git, resolveDefaultBranch, resolveRef, commitsAhead, GitError } from './git.ts';

import type {
  CodexRecord,
  CodexDetail,
  DraftRecord,
  OpenDraftRequest,
  AbandonDraftRequest,
  SealRequest,
  SealResult,
  PushRequest,
  CodexesConfig,
  CodexConfigEntry,
  ScriptoriumApi,
} from './types.ts';

// ── Internal state ──────────────────────────────────────────────────

interface CodexState {
  name: string
  remoteUrl: string
  cloneStatus: 'ready' | 'cloning' | 'error'
  lastFetched: string | null
  /** Promise that resolves when the bare clone is ready (for background clones). */
  clonePromise?: Promise<void>
}

// ── Core class ──────────────────────────────────────────────────────

export class ScriptoriumCore {
  private codexes = new Map<string, CodexState>();
  private drafts = new Map<string, DraftRecord>(); // keyed by `${codexName}/${branch}`

  private maxMergeRetries: number = 3;
  private draftRoot: string = '.nexus/worktrees';

  // ── Paths ───────────────────────────────────────────────────────

  private get home(): string {
    return guild().home;
  }

  private codexesDir(): string {
    return path.join(this.home, '.nexus', 'codexes');
  }

  private bareClonePath(name: string): string {
    return path.join(this.codexesDir(), `${name}.git`);
  }

  private draftWorktreePath(codexName: string, branch: string): string {
    return path.join(this.home, this.draftRoot, codexName, branch);
  }

  // ── Startup ─────────────────────────────────────────────────────

  start(): void {
    const config = guild().config<CodexesConfig>('codexes');

    // Apply settings
    this.maxMergeRetries = config.settings?.maxMergeRetries ?? 3;
    this.draftRoot = config.settings?.draftRoot ?? '.nexus/worktrees';

    // Ensure infrastructure directories exist
    fs.mkdirSync(this.codexesDir(), { recursive: true });

    // Load registered codexes from config
    const registered = config.registered ?? {};
    for (const [name, entry] of Object.entries(registered)) {
      this.loadCodex(name, entry);
    }

    // Reconcile drafts from filesystem
    this.reconcileDrafts();
  }

  /**
   * Load a codex from config. Checks for existing bare clone;
   * initiates background clone if missing.
   */
  private loadCodex(name: string, entry: CodexConfigEntry): void {
    const clonePath = this.bareClonePath(name);
    const exists = fs.existsSync(clonePath);

    const state: CodexState = {
      name,
      remoteUrl: entry.remoteUrl,
      cloneStatus: exists ? 'ready' : 'cloning',
      lastFetched: null,
    };

    if (!exists) {
      // Background clone — doesn't block startup
      state.clonePromise = this.performClone(name, entry.remoteUrl)
        .then(() => { state.cloneStatus = 'ready'; })
        .catch((err) => {
          state.cloneStatus = 'error';
          console.warn(`[scriptorium] Background clone of "${name}" failed: ${err instanceof Error ? err.message : err}`);
        });
    }

    this.codexes.set(name, state);
  }

  /**
   * Reconcile in-memory draft tracking with filesystem state.
   * Scans the worktree directories and rebuilds the draft map.
   */
  private reconcileDrafts(): void {
    const worktreeRoot = path.join(this.home, this.draftRoot);
    if (!fs.existsSync(worktreeRoot)) return;

    for (const codexDir of fs.readdirSync(worktreeRoot, { withFileTypes: true })) {
      if (!codexDir.isDirectory()) continue;
      const codexName = codexDir.name;

      // Only reconcile drafts for known codexes
      if (!this.codexes.has(codexName)) continue;

      const codexWorktreeDir = path.join(worktreeRoot, codexName);
      for (const draftDir of fs.readdirSync(codexWorktreeDir, { withFileTypes: true })) {
        if (!draftDir.isDirectory()) continue;
        const branch = draftDir.name;
        const draftPath = path.join(codexWorktreeDir, branch);

        // Verify it's actually a git worktree (has .git file)
        if (!fs.existsSync(path.join(draftPath, '.git'))) continue;

        const key = `${codexName}/${branch}`;
        if (!this.drafts.has(key)) {
          this.drafts.set(key, {
            id: generateId('draft', 4),
            codexName,
            branch,
            path: draftPath,
            createdAt: new Date().toISOString(), // approximate — we don't know the real time
          });
        }
      }
    }
  }

  // ── Clone readiness ─────────────────────────────────────────────

  /**
   * Ensure a codex's bare clone is ready. Blocks if a background
   * clone is in progress. Throws if the codex is unknown or clone failed.
   */
  private async ensureReady(name: string): Promise<CodexState> {
    const state = this.codexes.get(name);
    if (!state) {
      throw new Error(`Codex "${name}" is not registered. Use codex-add to register it.`);
    }

    if (state.clonePromise) {
      await state.clonePromise;
      state.clonePromise = undefined;
    }

    if (state.cloneStatus === 'error') {
      throw new Error(
        `Codex "${name}" bare clone failed. Remove and re-add the codex, or check the remote URL.`,
      );
    }

    return state;
  }

  // ── Git operations ──────────────────────────────────────────────

  private async performClone(name: string, remoteUrl: string): Promise<void> {
    const clonePath = this.bareClonePath(name);
    fs.mkdirSync(path.dirname(clonePath), { recursive: true });
    await git(['clone', '--bare', remoteUrl, clonePath]);
  }

  /**
   * Advance refs/heads/<branch> to the remote's position if the remote is
   * strictly ahead of the local sealed binding.
   *
   * This handles commits pushed to the remote outside the Scriptorium:
   * if the remote has advanced past the local sealed binding, sealing must
   * rebase the draft onto the remote position — not the stale local one.
   *
   * If the local sealed binding is already ahead of (or equal to) the remote
   * (e.g. contains unpushed seals from contention scenarios), it is kept.
   */
  private async advanceToRemote(codexName: string, branch: string): Promise<void> {
    const clonePath = this.bareClonePath(codexName);
    let remoteRef: string;
    try {
      remoteRef = await resolveRef(clonePath, `refs/remotes/origin/${branch}`);
    } catch {
      return; // No remote tracking ref (branch may not exist on remote yet)
    }
    const localRef = await resolveRef(clonePath, branch);
    if (remoteRef === localRef) return;

    const { stdout: mergeBase } = await git(
      ['merge-base', localRef, remoteRef],
      clonePath,
    );
    if (mergeBase === localRef) {
      // Local is an ancestor of remote → remote is ahead → advance local
      await git(['update-ref', `refs/heads/${branch}`, remoteRef], clonePath);
    }
    // If local is ahead of or diverged from remote: keep the local sealed binding
  }

  private async performFetch(name: string): Promise<void> {
    const clonePath = this.bareClonePath(name);
    // Explicit refspec is required: git clone --bare does not configure a
    // fetch refspec, so plain `git fetch origin` only updates FETCH_HEAD and
    // leaves refs/heads/* stale.
    //
    // We fetch into refs/remotes/origin/* rather than refs/heads/* for two
    // reasons:
    //   1. It avoids force-overwriting local draft branches (which live in
    //      refs/heads/* but do not exist on the remote).
    //   2. It separates the "remote position" (refs/remotes/origin/*) from
    //      the "local sealed binding" (refs/heads/*), letting seal() advance
    //      refs/heads/* only when the remote is strictly ahead.
    await git(['fetch', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*'], clonePath);

    const state = this.codexes.get(name);
    if (state) {
      state.lastFetched = new Date().toISOString();
    }
  }

  // ── API Implementation ────────────────────────────────────────

  createApi(): ScriptoriumApi {
    return {
      add: (name, remoteUrl) => this.add(name, remoteUrl),
      list: () => this.list(),
      show: (name) => this.show(name),
      remove: (name) => this.remove(name),
      fetch: (name) => this.fetchCodex(name),
      push: (request) => this.push(request),
      openDraft: (request) => this.openDraft(request),
      listDrafts: (codexName?) => this.listDrafts(codexName),
      abandonDraft: (request) => this.abandonDraft(request),
      seal: (request) => this.seal(request),
    };
  }

  // ── Codex Registry ──────────────────────────────────────────────

  async add(name: string, remoteUrl: string): Promise<CodexRecord> {
    if (this.codexes.has(name)) {
      throw new Error(`Codex "${name}" is already registered.`);
    }

    // Clone bare repo (blocking)
    const state: CodexState = {
      name,
      remoteUrl,
      cloneStatus: 'cloning',
      lastFetched: null,
    };
    this.codexes.set(name, state);

    try {
      await this.performClone(name, remoteUrl);
      state.cloneStatus = 'ready';
    } catch (err) {
      state.cloneStatus = 'error';
      this.codexes.delete(name);
      throw new Error(
        `Failed to clone "${remoteUrl}" for codex "${name}": ${err instanceof Error ? err.message : err}`,
      );
    }

    // Persist to guild.json
    const config = guild().config<CodexesConfig>('codexes');
    const registered = config.registered ?? {};
    registered[name] = { remoteUrl };
    guild().writeConfig('codexes', { ...config, registered });

    return this.toCodexRecord(state);
  }

  async list(): Promise<CodexRecord[]> {
    const records: CodexRecord[] = [];
    for (const state of this.codexes.values()) {
      records.push(this.toCodexRecord(state));
    }
    return records;
  }

  async show(name: string): Promise<CodexDetail> {
    const state = await this.ensureReady(name);
    const clonePath = this.bareClonePath(name);
    const defaultBranch = await resolveDefaultBranch(clonePath);
    const drafts = this.draftsForCodex(name);

    return {
      name: state.name,
      remoteUrl: state.remoteUrl,
      cloneStatus: state.cloneStatus,
      activeDrafts: drafts.length,
      defaultBranch,
      lastFetched: state.lastFetched,
      drafts,
    };
  }

  async remove(name: string): Promise<void> {
    const state = this.codexes.get(name);
    if (!state) {
      throw new Error(`Codex "${name}" is not registered.`);
    }

    // Abandon all drafts for this codex
    const drafts = this.draftsForCodex(name);
    for (const draft of drafts) {
      await this.abandonDraft({ codexName: name, branch: draft.branch, force: true });
    }

    // Remove bare clone
    const clonePath = this.bareClonePath(name);
    if (fs.existsSync(clonePath)) {
      fs.rmSync(clonePath, { recursive: true, force: true });
    }

    // Remove from in-memory state
    this.codexes.delete(name);

    // Remove from guild.json
    const config = guild().config<CodexesConfig>('codexes');
    const registered = { ...(config.registered ?? {}) };
    delete registered[name];
    guild().writeConfig('codexes', { ...config, registered });
  }

  async fetchCodex(name: string): Promise<void> {
    await this.ensureReady(name);
    await this.performFetch(name);
  }

  async push(request: PushRequest): Promise<void> {
    const state = await this.ensureReady(request.codexName);
    const clonePath = this.bareClonePath(state.name);
    const branch = request.branch ?? await resolveDefaultBranch(clonePath);

    await git(['push', 'origin', branch], clonePath);
  }

  // ── Draft Binding Lifecycle ─────────────────────────────────────

  async openDraft(request: OpenDraftRequest): Promise<DraftRecord> {
    const state = await this.ensureReady(request.codexName);
    const clonePath = this.bareClonePath(state.name);

    // Fetch before branching for freshness
    await this.performFetch(state.name);

    const branch = request.branch ?? generateId('draft', 4);
    const key = `${request.codexName}/${branch}`;

    // Reject if draft already exists
    if (this.drafts.has(key)) {
      throw new Error(
        `Draft with branch "${branch}" already exists for codex "${request.codexName}". ` +
        `Choose a different branch name or abandon the existing draft.`,
      );
    }

    const defaultBranch = await resolveDefaultBranch(clonePath);
    const startPoint = request.startPoint ?? defaultBranch;

    // Advance the start-point branch to the remote position if the remote
    // has moved ahead. Ensures the draft branches from the latest state.
    await this.advanceToRemote(state.name, startPoint);

    const worktreePath = this.draftWorktreePath(request.codexName, branch);
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    // Create worktree with new branch from start point
    await git(
      ['worktree', 'add', worktreePath, '-b', branch, startPoint],
      clonePath,
    );

    const draft: DraftRecord = {
      id: generateId('draft', 4),
      codexName: request.codexName,
      branch,
      path: worktreePath,
      createdAt: new Date().toISOString(),
      associatedWith: request.associatedWith,
    };

    this.drafts.set(key, draft);
    return draft;
  }

  async listDrafts(codexName?: string): Promise<DraftRecord[]> {
    if (codexName) {
      return this.draftsForCodex(codexName);
    }
    return [...this.drafts.values()];
  }

  async abandonDraft(request: AbandonDraftRequest): Promise<void> {
    const key = `${request.codexName}/${request.branch}`;
    const draft = this.drafts.get(key);

    if (!draft) {
      throw new Error(
        `No active draft with branch "${request.branch}" for codex "${request.codexName}".`,
      );
    }

    // Check for unsealed inscriptions (commits ahead of the sealed binding)
    if (!request.force) {
      const state = await this.ensureReady(request.codexName);
      const clonePath = this.bareClonePath(state.name);

      try {
        const defaultBranch = await resolveDefaultBranch(clonePath);
        const ahead = await commitsAhead(clonePath, request.branch, defaultBranch);

        if (ahead > 0) {
          throw new Error(
            `Draft "${request.branch}" has ${ahead} unsealed inscription(s). ` +
            `Use force: true to abandon anyway, or seal the draft first.`,
          );
        }
      } catch (err) {
        // If the branch doesn't exist in the bare clone (already cleaned up),
        // that's fine — proceed with cleanup
        if (err instanceof GitError && err.stderr.includes('unknown revision')) {
          // Branch already gone — proceed with cleanup
        } else if (err instanceof Error && err.message.includes('unsealed inscription')) {
          throw err;
        }
        // Other git errors during the check are non-fatal — proceed with cleanup
      }
    }

    // Remove worktree
    const clonePath = this.bareClonePath(request.codexName);
    try {
      await git(['worktree', 'remove', '--force', draft.path], clonePath);
    } catch {
      // If worktree removal fails (e.g. already gone), try manual cleanup
      if (fs.existsSync(draft.path)) {
        fs.rmSync(draft.path, { recursive: true, force: true });
      }
      // Prune stale worktree references
      try {
        await git(['worktree', 'prune'], clonePath);
      } catch { /* best effort */ }
    }

    // Delete the branch from the bare clone
    try {
      await git(['branch', '-D', request.branch], clonePath);
    } catch {
      // Branch may already be gone — that's fine
    }

    // Remove from in-memory tracking
    this.drafts.delete(key);
  }

  async seal(request: SealRequest): Promise<SealResult> {
    const state = await this.ensureReady(request.codexName);
    const clonePath = this.bareClonePath(state.name);
    const maxRetries = request.maxRetries ?? this.maxMergeRetries;

    const defaultBranch = await resolveDefaultBranch(clonePath);
    const targetBranch = request.targetBranch ?? defaultBranch;

    let strategy: 'fast-forward' | 'rebase' = 'fast-forward';
    let retries = 0;

    // Fetch before sealing for freshness
    await this.performFetch(state.name);

    // Advance the local sealed binding to the remote position if the remote
    // has moved ahead (e.g. commits pushed outside the Scriptorium).
    // This ensures seal compares against the latest remote ref, not a
    // potentially stale local one — preventing push failures.
    await this.advanceToRemote(state.name, targetBranch);

    // Attempt ff-only merge, with rebase retry loop
    while (retries <= maxRetries) {
      try {
        // Try fast-forward merge: update the target branch ref to point at the source
        // In a bare repo, we use `git merge --ff-only` with the branch checked out,
        // but bare repos don't have a checkout. Instead, we verify ancestry and
        // update the ref directly.
        const targetRef = await resolveRef(clonePath, targetBranch);
        const sourceRef = await resolveRef(clonePath, request.sourceBranch);

        // Check if source is already at target (nothing to seal)
        if (targetRef === sourceRef) {
          // Push before abandoning draft — if push fails the draft survives for inspection
          try {
            await git(['push', 'origin', targetBranch], clonePath);
          } catch (pushErr) {
            throw new Error(
              `Push failed after successful seal: ${pushErr instanceof Error ? pushErr.message : pushErr}`,
            );
          }

          // Clean up draft unless keepDraft
          if (!request.keepDraft) {
            await this.abandonDraft({
              codexName: request.codexName,
              branch: request.sourceBranch,
              force: true,
            });
          }
          return { success: true, strategy, retries, sealedCommit: targetRef, inscriptionsSealed: 0 };
        }

        // Check if target is an ancestor of source (ff is possible)
        const { stdout: mergeBase } = await git(
          ['merge-base', targetBranch, request.sourceBranch],
          clonePath,
        );

        if (mergeBase === targetRef) {
          // Fast-forward is possible — count and incorporate inscriptions
          const inscriptionsSealed = await commitsAhead(
            clonePath,
            request.sourceBranch,
            targetBranch,
          );

          await git(
            ['update-ref', `refs/heads/${targetBranch}`, sourceRef],
            clonePath,
          );

          // Push before abandoning draft — if push fails the draft survives for inspection
          try {
            await git(['push', 'origin', targetBranch], clonePath);
          } catch (pushErr) {
            throw new Error(
              `Push failed after successful seal: ${pushErr instanceof Error ? pushErr.message : pushErr}`,
            );
          }

          // Clean up draft unless keepDraft
          if (!request.keepDraft) {
            await this.abandonDraft({
              codexName: request.codexName,
              branch: request.sourceBranch,
              force: true,
            });
          }

          return { success: true, strategy, retries, sealedCommit: sourceRef, inscriptionsSealed };
        }

        // FF not possible — rebase the source branch onto the target
        strategy = 'rebase';

        // Rebase needs a worktree (can't rebase in a bare repo).
        // Use the draft's existing worktree.
        const key = `${request.codexName}/${request.sourceBranch}`;
        const draft = this.drafts.get(key);
        if (!draft) {
          throw new Error(
            `Cannot rebase: no active draft for branch "${request.sourceBranch}". ` +
            `The draft worktree is needed for rebase operations.`,
          );
        }

        try {
          await git(['rebase', targetBranch], draft.path);
        } catch (err) {
          // Rebase conflict — abort and fail
          try {
            await git(['rebase', '--abort'], draft.path);
          } catch { /* best effort */ }

          throw new Error(
            `Sealing seized: rebase of "${request.sourceBranch}" onto "${targetBranch}" ` +
            `produced conflicts. Manual reconciliation is needed.`,
          );
        }

        // Rebase succeeded — re-fetch and retry the ff merge
        retries++;
        await this.performFetch(state.name);
        continue;
      } catch (err) {
        if (err instanceof Error && err.message.includes('Sealing seized')) {
          throw err;
        }
        if (err instanceof Error && err.message.includes('Cannot rebase')) {
          throw err;
        }
        // Unexpected error — don't retry
        throw err;
      }
    }

    throw new Error(
      `Sealing failed after ${maxRetries} retries. Codex "${request.codexName}", ` +
      `branch "${request.sourceBranch}" → "${targetBranch}".`,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private draftsForCodex(codexName: string): DraftRecord[] {
    return [...this.drafts.values()].filter((d) => d.codexName === codexName);
  }

  private toCodexRecord(state: CodexState): CodexRecord {
    return {
      name: state.name,
      remoteUrl: state.remoteUrl,
      cloneStatus: state.cloneStatus,
      activeDrafts: this.draftsForCodex(state.name).length,
    };
  }
}

=== FILE: pnpm-lock.yaml ===
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      '@tsconfig/node24':
        specifier: 24.0.4
        version: 24.0.4
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/framework/arbor:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/cli:
    dependencies:
      '@shardworks/nexus-arbor':
        specifier: workspace:*
        version: link:../arbor
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../../plugins/tools
      commander:
        specifier: 14.0.3
        version: 14.0.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/core:
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/animator:
    dependencies:
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/claude-code:
    dependencies:
      '@modelcontextprotocol/sdk':
        specifier: 1.27.1
        version: 1.27.1(zod@4.3.6)
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/clerk:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/codexes:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/fabricator:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/loom:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/parlour:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/spider:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/codexes-apparatus':
        specifier: workspace:*
        version: link:../codexes
      '@shardworks/fabricator-apparatus':
        specifier: workspace:*
        version: link:../fabricator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/stacks:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      better-sqlite3:
        specifier: 12.8.0
        version: 12.8.0
    devDependencies:
      '@types/better-sqlite3':
        specifier: 7.6.13
        version: 7.6.13
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/tools:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

packages:

  '@hono/node-server@1.19.11':
    resolution: {integrity: sha512-dr8/3zEaB+p0D2n/IUrlPF1HZm586qgJNXK1a9fhg/PzdtkK7Ksd5l312tJX2yBuALqDYBlG20QEbayqPyxn+g==}
    engines: {node: '>=18.14.1'}
    peerDependencies:
      hono: ^4

  '@modelcontextprotocol/sdk@1.27.1':
    resolution: {integrity: sha512-sr6GbP+4edBwFndLbM60gf07z0FQ79gaExpnsjMGePXqFcSSb7t6iscpjk9DhFhwd+mTEQrzNafGP8/iGGFYaA==}
    engines: {node: '>=18'}
    peerDependencies:
      '@cfworker/json-schema': ^4.1.1
      zod: ^3.25 || ^4.0
    peerDependenciesMeta:
      '@cfworker/json-schema':
        optional: true

  '@tsconfig/node24@24.0.4':
    resolution: {integrity: sha512-2A933l5P5oCbv6qSxHs7ckKwobs8BDAe9SJ/Xr2Hy+nDlwmLE1GhFh/g/vXGRZWgxBg9nX/5piDtHR9Dkw/XuA==}

  '@types/better-sqlite3@7.6.13':
    resolution: {integrity: sha512-NMv9ASNARoKksWtsq/SHakpYAYnhBrQgGD8zkLYk/jaK8jUGn08CfEdTRgYhMypUQAfzSP8W6gNLe0q19/t4VA==}

  '@types/node@25.5.0':
    resolution: {integrity: sha512-jp2P3tQMSxWugkCUKLRPVUpGaL5MVFwF8RDuSRztfwgN1wmqJeMSbKlnEtQqU8UrhTmzEmZdu2I6v2dpp7XIxw==}

  accepts@2.0.0:
    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
    engines: {node: '>= 0.6'}

  ajv-formats@3.0.1:
    resolution: {integrity: sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ==}
    peerDependencies:
      ajv: ^8.0.0
    peerDependenciesMeta:
      ajv:
        optional: true

  ajv@8.18.0:
    resolution: {integrity: sha512-PlXPeEWMXMZ7sPYOHqmDyCJzcfNrUr3fGNKtezX14ykXOEIvyK81d+qydx89KY5O71FKMPaQ2vBfBFI5NHR63A==}

  base64-js@1.5.1:
    resolution: {integrity: sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==}

  better-sqlite3@12.8.0:
    resolution: {integrity: sha512-RxD2Vd96sQDjQr20kdP+F+dK/1OUNiVOl200vKBZY8u0vTwysfolF6Hq+3ZK2+h8My9YvZhHsF+RSGZW2VYrPQ==}
    engines: {node: 20.x || 22.x || 23.x || 24.x || 25.x}

  bindings@1.5.0:
    resolution: {integrity: sha512-p2q/t/mhvuOj/UeLlV6566GD/guowlr0hHxClI0W9m7MWYkL1F0hLo+0Aexs9HSPCtR1SXQ0TD3MMKrXZajbiQ==}

  bl@4.1.0:
    resolution: {integrity: sha512-1W07cM9gS6DcLperZfFSj+bWLtaPGSOHWhPiGzXmvVJbRLdG82sH/Kn8EtW1VqWVA54AKf2h5k5BbnIbwF3h6w==}

  body-parser@2.2.2:
    resolution: {integrity: sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==}
    engines: {node: '>=18'}

  buffer@5.7.1:
    resolution: {integrity: sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==}

  bytes@3.1.2:
    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
    engines: {node: '>= 0.8'}

  call-bind-apply-helpers@1.0.2:
    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
    engines: {node: '>= 0.4'}

  call-bound@1.0.4:
    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
    engines: {node: '>= 0.4'}

  chownr@1.1.4:
    resolution: {integrity: sha512-jJ0bqzaylmJtVnNgzTeSOs8DPavpbYgEr/b0YL8/2GO3xJEhInFmhKMUnEJQjZumK7KXGFhUy89PrsJWlakBVg==}

  commander@14.0.3:
    resolution: {integrity: sha512-H+y0Jo/T1RZ9qPP4Eh1pkcQcLRglraJaSLoyOtHxu6AapkjWVCy2Sit1QQ4x3Dng8qDlSsZEet7g5Pq06MvTgw==}
    engines: {node: '>=20'}

  content-disposition@1.0.1:
    resolution: {integrity: sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==}
    engines: {node: '>=18'}

  content-type@1.0.5:
    resolution: {integrity: sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==}
    engines: {node: '>= 0.6'}

  cookie-signature@1.2.2:
    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
    engines: {node: '>=6.6.0'}

  cookie@0.7.2:
    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
    engines: {node: '>= 0.6'}

  cors@2.8.6:
    resolution: {integrity: sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==}
    engines: {node: '>= 0.10'}

  cross-spawn@7.0.6:
    resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
    engines: {node: '>= 8'}

  debug@4.4.3:
    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
    engines: {node: '>=6.0'}
    peerDependencies:
      supports-color: '*'
    peerDependenciesMeta:
      supports-color:
        optional: true

  decompress-response@6.0.0:
    resolution: {integrity: sha512-aW35yZM6Bb/4oJlZncMH2LCoZtJXTRxES17vE3hoRiowU2kWHaJKFkSBDnDR+cm9J+9QhXmREyIfv0pji9ejCQ==}
    engines: {node: '>=10'}

  deep-extend@0.6.0:
    resolution: {integrity: sha512-LOHxIOaPYdHlJRtCQfDIVZtfw/ufM8+rVj649RIHzcm/vGwQRXFt6OPqIFWsm2XEMrNIEtWR64sY1LEKD2vAOA==}
    engines: {node: '>=4.0.0'}

  depd@2.0.0:
    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
    engines: {node: '>= 0.8'}

  detect-libc@2.1.2:
    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
    engines: {node: '>=8'}

  dunder-proto@1.0.1:
    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
    engines: {node: '>= 0.4'}

  ee-first@1.1.1:
    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}

  encodeurl@2.0.0:
    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
    engines: {node: '>= 0.8'}

  end-of-stream@1.4.5:
    resolution: {integrity: sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==}

  es-define-property@1.0.1:
    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
    engines: {node: '>= 0.4'}

  es-errors@1.3.0:
    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
    engines: {node: '>= 0.4'}

  es-object-atoms@1.1.1:
    resolution: {integrity: sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==}
    engines: {node: '>= 0.4'}

  escape-html@1.0.3:
    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}

  etag@1.8.1:
    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
    engines: {node: '>= 0.6'}

  eventsource-parser@3.0.6:
    resolution: {integrity: sha512-Vo1ab+QXPzZ4tCa8SwIHJFaSzy4R6SHf7BY79rFBDf0idraZWAkYrDjDj8uWaSm3S2TK+hJ7/t1CEmZ7jXw+pg==}
    engines: {node: '>=18.0.0'}

  eventsource@3.0.7:
    resolution: {integrity: sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==}
    engines: {node: '>=18.0.0'}

  expand-template@2.0.3:
    resolution: {integrity: sha512-XYfuKMvj4O35f/pOXLObndIRvyQ+/+6AhODh+OKWj9S9498pHHn/IMszH+gt0fBCRWMNfk1ZSp5x3AifmnI2vg==}
    engines: {node: '>=6'}

  express-rate-limit@8.3.1:
    resolution: {integrity: sha512-D1dKN+cmyPWuvB+G2SREQDzPY1agpBIcTa9sJxOPMCNeH3gwzhqJRDWCXW3gg0y//+LQ/8j52JbMROWyrKdMdw==}
    engines: {node: '>= 16'}
    peerDependencies:
      express: '>= 4.11'

  express@5.2.1:
    resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
    engines: {node: '>= 18'}

  fast-deep-equal@3.1.3:
    resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==}

  fast-uri@3.1.0:
    resolution: {integrity: sha512-iPeeDKJSWf4IEOasVVrknXpaBV0IApz/gp7S2bb7Z4Lljbl2MGJRqInZiUrQwV16cpzw/D3S5j5Julj/gT52AA==}

  file-uri-to-path@1.0.0:
    resolution: {integrity: sha512-0Zt+s3L7Vf1biwWZ29aARiVYLx7iMGnEUl9x33fbB/j3jR81u/O2LbqK+Bm1CDSNDKVtJ/YjwY7TUd5SkeLQLw==}

  finalhandler@2.1.1:
    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
    engines: {node: '>= 18.0.0'}

  forwarded@0.2.0:
    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
    engines: {node: '>= 0.6'}

  fresh@2.0.0:
    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
    engines: {node: '>= 0.8'}

  fs-constants@1.0.0:
    resolution: {integrity: sha512-y6OAwoSIf7FyjMIv94u+b5rdheZEjzR63GTyZJm5qh4Bi+2YgwLCcI/fPFZkL5PSixOt6ZNKm+w+Hfp/Bciwow==}

  function-bind@1.1.2:
    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}

  get-intrinsic@1.3.0:
    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
    engines: {node: '>= 0.4'}

  get-proto@1.0.1:
    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
    engines: {node: '>= 0.4'}

  github-from-package@0.0.0:
    resolution: {integrity: sha512-SyHy3T1v2NUXn29OsWdxmK6RwHD+vkj3v8en8AOBZ1wBQ/hCAQ5bAQTD02kW4W9tUp/3Qh6J8r9EvntiyCmOOw==}

  gopd@1.2.0:
    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
    engines: {node: '>= 0.4'}

  has-symbols@1.1.0:
    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
    engines: {node: '>= 0.4'}

  hasown@2.0.2:
    resolution: {integrity: sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==}
    engines: {node: '>= 0.4'}

  hono@4.12.9:
    resolution: {integrity: sha512-wy3T8Zm2bsEvxKZM5w21VdHDDcwVS1yUFFY6i8UobSsKfFceT7TOwhbhfKsDyx7tYQlmRM5FLpIuYvNFyjctiA==}
    engines: {node: '>=16.9.0'}

  http-errors@2.0.1:
    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
    engines: {node: '>= 0.8'}

  iconv-lite@0.7.2:
    resolution: {integrity: sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==}
    engines: {node: '>=0.10.0'}

  ieee754@1.2.1:
    resolution: {integrity: sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==}

  inherits@2.0.4:
    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}

  ini@1.3.8:
    resolution: {integrity: sha512-JV/yugV2uzW5iMRSiZAyDtQd+nxtUnjeLt0acNdw98kKLrvuRVyB80tsREOE7yvGVgalhZ6RNXCmEHkUKBKxew==}

  ip-address@10.1.0:
    resolution: {integrity: sha512-XXADHxXmvT9+CRxhXg56LJovE+bmWnEWB78LB83VZTprKTmaC5QfruXocxzTZ2Kl0DNwKuBdlIhjL8LeY8Sf8Q==}
    engines: {node: '>= 12'}

  ipaddr.js@1.9.1:
    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
    engines: {node: '>= 0.10'}

  is-promise@4.0.0:
    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}

  isexe@2.0.0:
    resolution: {integrity: sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==}

  jose@6.2.2:
    resolution: {integrity: sha512-d7kPDd34KO/YnzaDOlikGpOurfF0ByC2sEV4cANCtdqLlTfBlw2p14O/5d/zv40gJPbIQxfES3nSx1/oYNyuZQ==}

  json-schema-traverse@1.0.0:
    resolution: {integrity: sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==}

  json-schema-typed@8.0.2:
    resolution: {integrity: sha512-fQhoXdcvc3V28x7C7BMs4P5+kNlgUURe2jmUT1T//oBRMDrqy1QPelJimwZGo7Hg9VPV3EQV5Bnq4hbFy2vetA==}

  math-intrinsics@1.1.0:
    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
    engines: {node: '>= 0.4'}

  media-typer@1.1.0:
    resolution: {integrity: sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==}
    engines: {node: '>= 0.8'}

  merge-descriptors@2.0.0:
    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
    engines: {node: '>=18'}

  mime-db@1.54.0:
    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
    engines: {node: '>= 0.6'}

  mime-types@3.0.2:
    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
    engines: {node: '>=18'}

  mimic-response@3.1.0:
    resolution: {integrity: sha512-z0yWI+4FDrrweS8Zmt4Ej5HdJmky15+L2e6Wgn3+iK5fWzb6T3fhNFq2+MeTRb064c6Wr4N/wv0DzQTjNzHNGQ==}
    engines: {node: '>=10'}

  minimist@1.2.8:
    resolution: {integrity: sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==}

  mkdirp-classic@0.5.3:
    resolution: {integrity: sha512-gKLcREMhtuZRwRAfqP3RFW+TK4JqApVBtOIftVgjuABpAtpxhPGaDcfvbhNvD0B8iD1oUr/txX35NjcaY6Ns/A==}

  ms@2.1.3:
    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}

  napi-build-utils@2.0.0:
    resolution: {integrity: sha512-GEbrYkbfF7MoNaoh2iGG84Mnf/WZfB0GdGEsM8wz7Expx/LlWf5U8t9nvJKXSp3qr5IsEbK04cBGhol/KwOsWA==}

  negotiator@1.0.0:
    resolution: {integrity: sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==}
    engines: {node: '>= 0.6'}

  node-abi@3.89.0:
    resolution: {integrity: sha512-6u9UwL0HlAl21+agMN3YAMXcKByMqwGx+pq+P76vii5f7hTPtKDp08/H9py6DY+cfDw7kQNTGEj/rly3IgbNQA==}
    engines: {node: '>=10'}

  object-assign@4.1.1:
    resolution: {integrity: sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==}
    engines: {node: '>=0.10.0'}

  object-inspect@1.13.4:
    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
    engines: {node: '>= 0.4'}

  on-finished@2.4.1:
    resolution: {integrity: sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==}
    engines: {node: '>= 0.8'}

  once@1.4.0:
    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}

  parseurl@1.3.3:
    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
    engines: {node: '>= 0.8'}

  path-key@3.1.1:
    resolution: {integrity: sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==}
    engines: {node: '>=8'}

  path-to-regexp@8.3.0:
    resolution: {integrity: sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==}

  pkce-challenge@5.0.1:
    resolution: {integrity: sha512-wQ0b/W4Fr01qtpHlqSqspcj3EhBvimsdh0KlHhH8HRZnMsEa0ea2fTULOXOS9ccQr3om+GcGRk4e+isrZWV8qQ==}
    engines: {node: '>=16.20.0'}

  prebuild-install@7.1.3:
    resolution: {integrity: sha512-8Mf2cbV7x1cXPUILADGI3wuhfqWvtiLA1iclTDbFRZkgRQS0NqsPZphna9V+HyTEadheuPmjaJMsbzKQFOzLug==}
    engines: {node: '>=10'}
    deprecated: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
    hasBin: true

  proxy-addr@2.0.7:
    resolution: {integrity: sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==}
    engines: {node: '>= 0.10'}

  pump@3.0.4:
    resolution: {integrity: sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==}

  qs@6.15.0:
    resolution: {integrity: sha512-mAZTtNCeetKMH+pSjrb76NAM8V9a05I9aBZOHztWy/UqcJdQYNsf59vrRKWnojAT9Y+GbIvoTBC++CPHqpDBhQ==}
    engines: {node: '>=0.6'}

  range-parser@1.2.1:
    resolution: {integrity: sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==}
    engines: {node: '>= 0.6'}

  raw-body@3.0.2:
    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
    engines: {node: '>= 0.10'}

  rc@1.2.8:
    resolution: {integrity: sha512-y3bGgqKj3QBdxLbLkomlohkvsA8gdAiUQlSBJnBhfn+BPxg4bc62d8TcBW15wavDfgexCgccckhcZvywyQYPOw==}
    hasBin: true

  readable-stream@3.6.2:
    resolution: {integrity: sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==}
    engines: {node: '>= 6'}

  require-from-string@2.0.2:
    resolution: {integrity: sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==}
    engines: {node: '>=0.10.0'}

  router@2.2.0:
    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
    engines: {node: '>= 18'}

  safe-buffer@5.2.1:
    resolution: {integrity: sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==}

  safer-buffer@2.1.2:
    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}

  semver@7.7.4:
    resolution: {integrity: sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==}
    engines: {node: '>=10'}
    hasBin: true

  send@1.2.1:
    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
    engines: {node: '>= 18'}

  serve-static@2.2.1:
    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
    engines: {node: '>= 18'}

  setprototypeof@1.2.0:
    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}

  shebang-command@2.0.0:
    resolution: {integrity: sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==}
    engines: {node: '>=8'}

  shebang-regex@3.0.0:
    resolution: {integrity: sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==}
    engines: {node: '>=8'}

  side-channel-list@1.0.0:
    resolution: {integrity: sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==}
    engines: {node: '>= 0.4'}

  side-channel-map@1.0.1:
    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.0:
    resolution: {integrity: sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==}
    engines: {node: '>= 0.4'}

  simple-concat@1.0.1:
    resolution: {integrity: sha512-cSFtAPtRhljv69IK0hTVZQ+OfE9nePi/rtJmw5UjHeVyVroEqJXP1sFztKUy1qU+xvz3u/sfYJLa947b7nAN2Q==}

  simple-get@4.0.1:
    resolution: {integrity: sha512-brv7p5WgH0jmQJr1ZDDfKDOSeWWg+OVypG99A/5vYGPqJ6pxiaHLy8nxtFjBA7oMa01ebA9gfh1uMCFqOuXxvA==}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  string_decoder@1.3.0:
    resolution: {integrity: sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==}

  strip-json-comments@2.0.1:
    resolution: {integrity: sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==}
    engines: {node: '>=0.10.0'}

  tar-fs@2.1.4:
    resolution: {integrity: sha512-mDAjwmZdh7LTT6pNleZ05Yt65HC3E+NiQzl672vQG38jIrehtJk/J3mNwIg+vShQPcLF/LV7CMnDW6vjj6sfYQ==}

  tar-stream@2.2.0:
    resolution: {integrity: sha512-ujeqbceABgwMZxEJnk2HDY2DlnUZ+9oEcb1KzTVfYHio0UE6dG71n60d8D2I4qNvleWrrXpmjpt7vZeF1LnMZQ==}
    engines: {node: '>=6'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  tunnel-agent@0.6.0:
    resolution: {integrity: sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==}

  type-is@2.0.1:
    resolution: {integrity: sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==}
    engines: {node: '>= 0.6'}

  typescript@5.9.3:
    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}
    engines: {node: '>=14.17'}
    hasBin: true

  undici-types@7.18.2:
    resolution: {integrity: sha512-AsuCzffGHJybSaRrmr5eHr81mwJU3kjw6M+uprWvCXiNeN9SOGwQ3Jn8jb8m3Z6izVgknn1R0FTCEAP2QrLY/w==}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  util-deprecate@1.0.2:
    resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  which@2.0.2:
    resolution: {integrity: sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==}
    engines: {node: '>= 8'}
    hasBin: true

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  zod-to-json-schema@3.25.1:
    resolution: {integrity: sha512-pM/SU9d3YAggzi6MtR4h7ruuQlqKtad8e9S0fmxcMi+ueAK5Korys/aWcV9LIIHTVbj01NdzxcnXSN+O74ZIVA==}
    peerDependencies:
      zod: ^3.25 || ^4

  zod@4.3.6:
    resolution: {integrity: sha512-rftlrkhHZOcjDwkGlnUtZZkvaPHCsDATp4pGpuOOMDaTdDDXF91wuVDJoWoPsKX/3YPQ5fHuF3STjcYyKr+Qhg==}

snapshots:

  '@hono/node-server@1.19.11(hono@4.12.9)':
    dependencies:
      hono: 4.12.9

  '@modelcontextprotocol/sdk@1.27.1(zod@4.3.6)':
    dependencies:
      '@hono/node-server': 1.19.11(hono@4.12.9)
      ajv: 8.18.0
      ajv-formats: 3.0.1(ajv@8.18.0)
      content-type: 1.0.5
      cors: 2.8.6
      cross-spawn: 7.0.6
      eventsource: 3.0.7
      eventsource-parser: 3.0.6
      express: 5.2.1
      express-rate-limit: 8.3.1(express@5.2.1)
      hono: 4.12.9
      jose: 6.2.2
      json-schema-typed: 8.0.2
      pkce-challenge: 5.0.1
      raw-body: 3.0.2
      zod: 4.3.6
      zod-to-json-schema: 3.25.1(zod@4.3.6)
    transitivePeerDependencies:
      - supports-color

  '@tsconfig/node24@24.0.4': {}

  '@types/better-sqlite3@7.6.13':
    dependencies:
      '@types/node': 25.5.0

  '@types/node@25.5.0':
    dependencies:
      undici-types: 7.18.2

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.0.0

  ajv-formats@3.0.1(ajv@8.18.0):
    optionalDependencies:
      ajv: 8.18.0

  ajv@8.18.0:
    dependencies:
      fast-deep-equal: 3.1.3
      fast-uri: 3.1.0
      json-schema-traverse: 1.0.0
      require-from-string: 2.0.2

  base64-js@1.5.1: {}

  better-sqlite3@12.8.0:
    dependencies:
      bindings: 1.5.0
      prebuild-install: 7.1.3

  bindings@1.5.0:
    dependencies:
      file-uri-to-path: 1.0.0

  bl@4.1.0:
    dependencies:
      buffer: 5.7.1
      inherits: 2.0.4
      readable-stream: 3.6.2

  body-parser@2.2.2:
    dependencies:
      bytes: 3.1.2
      content-type: 1.0.5
      debug: 4.4.3
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      on-finished: 2.4.1
      qs: 6.15.0
      raw-body: 3.0.2
      type-is: 2.0.1
    transitivePeerDependencies:
      - supports-color

  buffer@5.7.1:
    dependencies:
      base64-js: 1.5.1
      ieee754: 1.2.1

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  chownr@1.1.4: {}

  commander@14.0.3: {}

  content-disposition@1.0.1: {}

  content-type@1.0.5: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  cors@2.8.6:
    dependencies:
      object-assign: 4.1.1
      vary: 1.1.2

  cross-spawn@7.0.6:
    dependencies:
      path-key: 3.1.1
      shebang-command: 2.0.0
      which: 2.0.2

  debug@4.4.3:
    dependencies:
      ms: 2.1.3

  decompress-response@6.0.0:
    dependencies:
      mimic-response: 3.1.0

  deep-extend@0.6.0: {}

  depd@2.0.0: {}

  detect-libc@2.1.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  encodeurl@2.0.0: {}

  end-of-stream@1.4.5:
    dependencies:
      once: 1.4.0

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.1:
    dependencies:
      es-errors: 1.3.0

  escape-html@1.0.3: {}

  etag@1.8.1: {}

  eventsource-parser@3.0.6: {}

  eventsource@3.0.7:
    dependencies:
      eventsource-parser: 3.0.6

  expand-template@2.0.3: {}

  express-rate-limit@8.3.1(express@5.2.1):
    dependencies:
      express: 5.2.1
      ip-address: 10.1.0

  express@5.2.1:
    dependencies:
      accepts: 2.0.0
      body-parser: 2.2.2
      content-disposition: 1.0.1
      content-type: 1.0.5
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.1
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.7
      qs: 6.15.0
      range-parser: 1.2.1
      router: 2.2.0
      send: 1.2.1
      serve-static: 2.2.1
      statuses: 2.0.2
      type-is: 2.0.1
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fast-deep-equal@3.1.3: {}

  fast-uri@3.1.0: {}

  file-uri-to-path@1.0.0: {}

  finalhandler@2.1.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.1
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  fs-constants@1.0.0: {}

  function-bind@1.1.2: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.1
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.2
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.1

  github-from-package@0.0.0: {}

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  hasown@2.0.2:
    dependencies:
      function-bind: 1.1.2

  hono@4.12.9: {}

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  iconv-lite@0.7.2:
    dependencies:
      safer-buffer: 2.1.2

  ieee754@1.2.1: {}

  inherits@2.0.4: {}

  ini@1.3.8: {}

  ip-address@10.1.0: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  isexe@2.0.0: {}

  jose@6.2.2: {}

  json-schema-traverse@1.0.0: {}

  json-schema-typed@8.0.2: {}

  math-intrinsics@1.1.0: {}

  media-typer@1.1.0: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.54.0: {}

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  mimic-response@3.1.0: {}

  minimist@1.2.8: {}

  mkdirp-classic@0.5.3: {}

  ms@2.1.3: {}

  napi-build-utils@2.0.0: {}

  negotiator@1.0.0: {}

  node-abi@3.89.0:
    dependencies:
      semver: 7.7.4

  object-assign@4.1.1: {}

  object-inspect@1.13.4: {}

  on-finished@2.4.1:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-key@3.1.1: {}

  path-to-regexp@8.3.0: {}

  pkce-challenge@5.0.1: {}

  prebuild-install@7.1.3:
    dependencies:
      detect-libc: 2.1.2
      expand-template: 2.0.3
      github-from-package: 0.0.0
      minimist: 1.2.8
      mkdirp-classic: 0.5.3
      napi-build-utils: 2.0.0
      node-abi: 3.89.0
      pump: 3.0.4
      rc: 1.2.8
      simple-get: 4.0.1
      tar-fs: 2.1.4
      tunnel-agent: 0.6.0

  proxy-addr@2.0.7:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  pump@3.0.4:
    dependencies:
      end-of-stream: 1.4.5
      once: 1.4.0

  qs@6.15.0:
    dependencies:
      side-channel: 1.1.0

  range-parser@1.2.1: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      unpipe: 1.0.0

  rc@1.2.8:
    dependencies:
      deep-extend: 0.6.0
      ini: 1.3.8
      minimist: 1.2.8
      strip-json-comments: 2.0.1

  readable-stream@3.6.2:
    dependencies:
      inherits: 2.0.4
      string_decoder: 1.3.0
      util-deprecate: 1.0.2

  require-from-string@2.0.2: {}

  router@2.2.0:
    dependencies:
      debug: 4.4.3
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.3.0
    transitivePeerDependencies:
      - supports-color

  safe-buffer@5.2.1: {}

  safer-buffer@2.1.2: {}

  semver@7.7.4: {}

  send@1.2.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.1
      range-parser: 1.2.1
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1:
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shebang-command@2.0.0:
    dependencies:
      shebang-regex: 3.0.0

  shebang-regex@3.0.0: {}

  side-channel-list@1.0.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.0
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  simple-concat@1.0.1: {}

  simple-get@4.0.1:
    dependencies:
      decompress-response: 6.0.0
      once: 1.4.0
      simple-concat: 1.0.1

  statuses@2.0.2: {}

  string_decoder@1.3.0:
    dependencies:
      safe-buffer: 5.2.1

  strip-json-comments@2.0.1: {}

  tar-fs@2.1.4:
    dependencies:
      chownr: 1.1.4
      mkdirp-classic: 0.5.3
      pump: 3.0.4
      tar-stream: 2.2.0

  tar-stream@2.2.0:
    dependencies:
      bl: 4.1.0
      end-of-stream: 1.4.5
      fs-constants: 1.0.0
      inherits: 2.0.4
      readable-stream: 3.6.2

  toidentifier@1.0.1: {}

  tunnel-agent@0.6.0:
    dependencies:
      safe-buffer: 5.2.1

  type-is@2.0.1:
    dependencies:
      content-type: 1.0.5
      media-typer: 1.1.0
      mime-types: 3.0.2

  typescript@5.9.3: {}

  undici-types@7.18.2: {}

  unpipe@1.0.0: {}

  util-deprecate@1.0.2: {}

  vary@1.1.2: {}

  which@2.0.2:
    dependencies:
      isexe: 2.0.0

  wrappy@1.0.2: {}

  zod-to-json-schema@3.25.1(zod@4.3.6):
    dependencies:
      zod: 4.3.6

  zod@4.3.6: {}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: README.md ===
# Nexus Mk 2.1

A framework for operating multi-agent AI workforces. Nexus provides the guild model: a structured workspace where animas (AI identities) receive commissions, use tools, record work, and collaborate through a shared Books database and event-driven Clockworks.

The framework is plugin-based. Almost everything — tools, engines, database schemas, anima management — is contributed by plugins. The core runtime is intentionally minimal.

---

## For users

### Install the CLI

```sh
npm install -g @shardworks/nexus
```

This installs the `nsg` command globally.

### Initialize a guild

A guild is the workspace where animas operate. Create one with `nsg init`:

```sh
nsg init ./my-guild --name my-guild
cd my-guild
```

This writes `guild.json`, `package.json`, `.gitignore`, and the `.nexus/` directory structure. It does not install any plugins or create any animas.

### Install plugins

Plugins are npm packages that contribute tools, engines, database schemas, and other capabilities to your guild. Install them with `nsg rig install`:

```sh
# Install from npm
nsg rig install @shardworks/nexus-stdlib

# Pin a version
nsg rig install @shardworks/nexus-stdlib@1.2.0

# Install from a git repository
nsg rig install git+https://github.com/acme/my-plugin.git

# Symlink a local directory during development
nsg rig install ./path/to/my-plugin --type link
```

By default, a plugin's tools are added to `baseTools` (available to all animas). To assign tools to specific roles instead:

```sh
nsg rig install @shardworks/nexus-stdlib --roles artificer,scribe
```

List installed plugins:

```sh
nsg rig list
```

Remove a plugin:

```sh
nsg rig remove nexus-stdlib
```

### Check guild status

```sh
nsg status          # guild name, nexus version, installed plugins, roles
nsg version         # framework version + installed plugin versions
```

### `guild.json`

The guild's central configuration file. Updated automatically by `nsg rig install` and `nsg rig remove`. Stores the plugin list, role definitions, tool assignments, Clockworks standing orders, and guild settings.

Plugins are listed by their derived plugin id (package name with the `@shardworks/` scope stripped):

```json
{
  "name": "my-guild",
  "nexus": "2.1.0",
  "plugins": ["nexus-stdlib", "nexus-clockworks"],
  "baseTools": ["commission", "signal", "list-writs"],
  "roles": { ... },
  "settings": { "model": "claude-opus-4-5" }
}
```

---

## For plugin authors

Nexus plugins are npm packages that contribute capabilities to a guild. There are two kinds:

- **Kit** — a passive package contributing tools, engines, relays, or other capabilities. No lifecycle; contributions are read at load time and used by consuming apparatuses.
- **Apparatus** — a package contributing persistent running infrastructure. Has a `start`/`stop` lifecycle, receives `GuildContext` at startup, and exposes a runtime API via `provides`.

Plugin authors import exclusively from `@shardworks/nexus-core`. The arbor runtime (`@shardworks/nexus-arbor`) is an internal concern of the CLI and session provider.

### Key points

- A plugin's **name is inferred from its npm package name** at load time — never declared in the manifest.
- A **kit** is a plain object exported as `{ kit: { ... } }`. The `tools` field (array of `ToolDefinition`) is the most common contribution.
- An **apparatus** is exported as `{ apparatus: { start, stop?, provides?, requires?, supportKit?, consumes? } }`.
- `requires` on a kit names apparatuses whose runtime APIs the kit's tool handlers will call. Hard startup failure if not installed.
- `requires` on an apparatus names other apparatuses that must be started first. Determines start order.
- Apparatus `provides` objects are retrieved at handler invocation time via `ctx.apparatus<T>(name)`.

### Authoring tools

The `tool()` function is the primary authoring entry point. Define a name, description, Zod param schema, and a handler:

```typescript
import { tool } from '@shardworks/nexus-core';
import { z } from 'zod';

const greet = tool({
  name: 'greet',
  description: 'Greet someone by name',
  params: {
    name: z.string().describe('Name to greet'),
  },
  handler: async ({ name }, ctx) => {
    return `Hello, ${name}! Guild root: ${ctx.home}`;
  },
});
```

The handler receives:
- `params` — validated input, typed from your Zod schemas
- `ctx` — a `HandlerContext` with `home` (guild root path) and `apparatus<T>(name)` for accessing started apparatus APIs

Restrict a tool to specific callers with `callableBy`:

```typescript
tool({
  name: 'admin-reset',
  callableBy: ['cli'],    // CLI only — not available to animas
  // ...
});
```

### Exporting a kit

A kit is the simplest plugin form — a plain object with a `kit` key:

```typescript
import { tool, type Kit } from '@shardworks/nexus-core';

const myTool = tool({ name: 'lookup', /* ... */ });

export default {
  kit: {
    tools: [myTool],

    // Optional: declare required apparatuses whose APIs your handlers call
    requires: ['nexus-books'],

    // Optional: document contribution fields for consuming apparatuses
    // (field types are defined by the apparatus packages that consume them)
    books: {
      records: { indexes: ['status', 'createdAt'] },
    },
  } satisfies Kit,
};
```

The `tools` field is the most common kit contribution. Other contribution fields (`engines`, `relays`, etc.) are defined by the apparatus packages that consume them — the framework treats any unknown field as opaque data.

### Exporting an apparatus

An apparatus has a `start`/`stop` lifecycle and can expose a runtime API:

```typescript
import { type Apparatus, type GuildContext } from '@shardworks/nexus-core';

// The API you expose to other plugins
interface MyApi {
  lookup(key: string): string | null;
}

const store = new Map<string, string>();

export default {
  apparatus: {
    // Apparatuses this one requires to be started first
    requires: ['nexus-books'],

    // The runtime API object exposed via ctx.apparatus<MyApi>('my-plugin')
    provides: {
      lookup(key: string) { return store.get(key) ?? null; },
    } satisfies MyApi,

    async start(ctx: GuildContext) {
      // ctx.apparatus<BooksApi>('nexus-books') is available here
      // ctx.kits() — snapshot of all loaded kits
      // ctx.on('plugin:initialized', handler) — react to kit contributions
    },

    async stop() {
      store.clear();
    },
  } satisfies Apparatus,
};
```

Consumers retrieve your `provides` object via `ctx.apparatus<MyApi>('my-plugin')` — either in their own `start()` or in tool handlers via `HandlerContext.apparatus<T>()`.

An apparatus can also contribute tools via `supportKit`:

```typescript
export default {
  apparatus: {
    supportKit: {
      tools: [myAdminTool],
    },
    // ...
  },
};
```

### `HandlerContext`

Injected into every tool and engine handler at invocation time:

```typescript
interface HandlerContext {
  home: string;                        // absolute path to the guild root
  apparatus<T>(name: string): T;       // access a started apparatus's provides object
}
```

### Further reading

- [`packages/arbor/README.md`](packages/arbor/README.md) — runtime API reference (`createArbor`, `Arbor`, `LoadedKit`, `LoadedApparatus`, `derivePluginId`, Books database)
- [`docs/architecture/plugins.md`](docs/architecture/plugins.md) — full plugin architecture specification
- [`docs/architecture/apparatus/books.md`](docs/architecture/apparatus/books.md) — Books apparatus design (in progress)

=== CONTEXT FILE: package.json ===
{
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus-mk2"
  },
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "nsg": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts",
    "vibe": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts --guild-root /workspace/vibers"
  },
  "devDependencies": {
    "@tsconfig/node24": "24.0.4",
    "typescript": "5.9.3"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3"
    ]
  }
}

=== CONTEXT FILE: LICENSE ===
ISC License

Copyright (c) 2026 Sean Boots

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

=== CONTEXT FILE: docs/architecture/apparatus/parlour.md ===
# The Parlour — API Contract

Status: **Draft — MVP**

Package: `@shardworks/parlour` · Plugin id: `parlour`

> **⚠️ MVP scope.** This spec covers the core conversation lifecycle: creating conversations, registering participants, taking turns (with streaming), enforcing turn limits, and ending conversations. Inter-turn context assembly (`formatConveneMessage`) is included for convene conversations. There is no event signalling, no conversation-level cost budgets, and no pluggable turn-order strategies. See the Future sections for the target design.

---

## Purpose

The Parlour manages multi-turn conversations within the guild. It provides the structure for two kinds of interaction: **consult** (a human talks to an anima) and **convene** (multiple animas hold a structured dialogue). The Parlour tracks who is participating, whose turn it is, what has been said, and when the conversation ends.

The Parlour does not launch sessions itself — it delegates each turn to **The Animator**. The Parlour does not assemble prompts — it delegates that to **The Loom**. The Parlour orchestrates: it decides *when* and *for whom* to call the Animator, and assembles the inter-turn context that keeps each participant coherent across turns.

---

## Dependencies

```
requires: ['stacks', 'animator', 'loom']
```

- **The Stacks** — persists conversations (with nested participants) and turn records.
- **The Animator** — launches individual session turns (via `animate()` / `animateStreaming()`).
- **The Loom** — weaves the session context for each participant's turn.

---

## Support Kit

The Parlour contributes a `conversations` book and conversation management tools via its supportKit:

```typescript
supportKit: {
  books: {
    conversations: {
      indexes: ['status', 'kind', 'createdAt'],
    },
  },
  tools: [conversationList, conversationShow, conversationEnd],
},
```

### Document Shape

Participants are nested directly in the conversation document rather than stored in a separate book. This avoids N+1 queries on `list()` and `show()` operations — since Books has no join support, a separate participants book would require a per-conversation query to resolve participants. Conversations have a small, bounded number of participants (typically 2–5), so the nested document stays compact.

```typescript
interface ConversationDoc {
  id: string
  status: 'active' | 'concluded' | 'abandoned'
  kind: 'consult' | 'convene'
  topic: string | null
  turnLimit: number | null
  createdAt: string
  endedAt: string | null
  eventId: string | null
  participants: ParticipantRecord[]
}

interface ParticipantRecord {
  /** Stable participant id (generated at creation). */
  id: string
  kind: 'anima' | 'human'
  name: string
  /** Anima id, resolved at creation time. Null for human participants. */
  animaId: string | null
  /**
   * Provider session id for --resume. Updated after each turn so
   * the next turn can continue the provider's conversation context.
   */
  providerSessionId: string | null
}
```

The trade-off: updating a participant's `providerSessionId` after each turn requires a read-modify-write of the full conversation document. This is acceptable — the document is small and the write happens once per turn, not in a hot loop.

The one query this makes harder is "find all conversations involving anima X" — this requires a JSON path query on `participants[*].animaId` rather than a direct index lookup. This is a dashboard/analytics query, not an operational hot path, and The Stacks' JSON path queries handle it adequately.

### `conversation-list` tool

List conversations with optional filters. Returns conversation summaries ordered by `createdAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'active' \| 'concluded' \| 'abandoned'` | Filter by lifecycle status |
| `kind` | `'consult' \| 'convene'` | Filter by conversation kind |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `ConversationSummary[]` — id, status, kind, topic, participants, turnCount, totalCostUsd.

### `conversation-show` tool

Show full detail for a conversation including all turns.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Conversation id |

Returns: `ConversationDetail` — full conversation record with participant list, per-turn session references, prompts, costs, and durations.

### `conversation-end` tool

End an active conversation.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Conversation id |
| `reason` | `'concluded' \| 'abandoned'` | Why the conversation ended (default: `'concluded'`) |

Idempotent — no error if the conversation is already ended.

---

## `ParlourApi` Interface (`provides`)

```typescript
interface ParlourApi {
  /**
   * Create a new conversation.
   *
   * Sets up conversation and participant records. Does NOT take a first
   * turn — that's a separate call to takeTurn().
   */
  create(request: CreateConversationRequest): Promise<CreateConversationResult>

  /**
   * Take a turn in a conversation.
   *
   * For anima participants: weaves context via The Loom, assembles the
   * inter-turn message, and calls The Animator to run a session. Returns
   * the session result. For human participants: records the message as
   * context for the next turn (no session launched).
   *
   * Throws if the conversation is not active or the turn limit is reached.
   */
  takeTurn(request: TakeTurnRequest): Promise<TurnResult>

  /**
   * Take a turn with streaming output.
   *
   * Same as takeTurn(), but yields ConversationChunks as the session
   * produces output. Includes a turn_complete chunk at the end.
   */
  takeTurnStreaming(request: TakeTurnRequest): {
    chunks: AsyncIterable<ConversationChunk>
    result: Promise<TurnResult>
  }

  /**
   * Get the next participant in a conversation.
   *
   * For convene: returns the next anima in round-robin order.
   * For consult: returns the anima participant (human turns are implicit).
   * Returns null if the conversation is not active or the turn limit is reached.
   */
  nextParticipant(conversationId: string): Promise<Participant | null>

  /**
   * End a conversation.
   *
   * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
   * disconnect). Idempotent — no error if already ended.
   */
  end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>

  /**
   * List conversations with optional filters.
   */
  list(options?: ListConversationsOptions): Promise<ConversationSummary[]>

  /**
   * Show full detail for a conversation.
   */
  show(conversationId: string): Promise<ConversationDetail | null>
}
```

### Supporting Types

```typescript
interface CreateConversationRequest {
  /** Conversation kind. */
  kind: 'consult' | 'convene'
  /** Seed topic or prompt. Used as the initial message for the first turn. */
  topic?: string
  /** Maximum allowed turns. Null = unlimited. */
  turnLimit?: number
  /** Participants in the conversation. */
  participants: ParticipantDeclaration[]
  /** Triggering event id, for conversations started by clockworks. */
  eventId?: string
}

interface ParticipantDeclaration {
  kind: 'anima' | 'human'
  /** Display name. For anima participants, this is the anima name
   *  used to resolve identity via The Loom at turn time. */
  name: string
}

interface CreateConversationResult {
  conversationId: string
  participants: Participant[]
}

interface Participant {
  id: string
  name: string
  kind: 'anima' | 'human'
}

interface TakeTurnRequest {
  conversationId: string
  participantId: string
  /** The message for this turn. For consult: the human's message.
   *  For convene: typically assembled by the caller via formatMessage(),
   *  or omitted to let The Parlour assemble it automatically. */
  message?: string
}

interface TurnResult {
  /** The Animator's session result for this turn. Null for human turns. */
  sessionResult: SessionResult | null
  /** Turn number within the conversation (1-indexed). */
  turnNumber: number
  /** Whether the conversation is still active after this turn. */
  conversationActive: boolean
}

/** A chunk of output from a conversation turn. */
type ConversationChunk =
  | SessionChunk
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number }

interface ConversationSummary {
  id: string
  status: 'active' | 'concluded' | 'abandoned'
  kind: 'consult' | 'convene'
  topic: string | null
  turnLimit: number | null
  createdAt: string
  endedAt: string | null
  participants: Participant[]
  /** Computed from session records. */
  turnCount: number
  /** Aggregate cost across all turns. */
  totalCostUsd: number
}

interface ConversationDetail extends ConversationSummary {
  turns: TurnSummary[]
}

interface TurnSummary {
  sessionId: string
  turnNumber: number
  participant: string
  prompt: string | null
  exitCode: number | null
  costUsd: number | null
  durationMs: number | null
  startedAt: string
  endedAt: string | null
}

interface ListConversationsOptions {
  status?: 'active' | 'concluded' | 'abandoned'
  kind?: 'consult' | 'convene'
  limit?: number
}
```

---

## Conversation Lifecycle

### Create

```
create(request)
  │
  ├─ 1. Generate conversation id
  ├─ 2. For each participant declaration:
  │     ├─ Generate participant id
  │     └─ Resolve animaId (for anima participants)
  ├─ 3. Write conversation document to The Stacks
  │     (status: 'active', participants nested inline)
  └─ 4. Return conversationId + participants
```

No session is launched at creation time. The first turn is a separate call.

### Take Turn (anima participant)

```
takeTurn(request)
  │
  ├─ 1. Read conversation state from The Stacks
  │     ├─ Verify status is 'active'
  │     └─ Verify turn limit not reached
  │
  ├─ 2. Determine turn number (count existing turns + 1)
  │
  ├─ 3. Assemble inter-turn message:
  │     ├─ First turn for this participant → use conversation topic
  │     └─ Subsequent turns → assemble messages from other participants
  │       since this participant's last turn (see § Inter-Turn Context)
  │
  ├─ 4. Weave context via The Loom (participant's anima name)
  │
  ├─ 5. Call The Animator:
  │     ├─ animate() or animateStreaming()
  │     ├─ conversationId for --resume
  │     └─ metadata: { trigger, conversationId, turnNumber, participantId }
  │
  ├─ 6. Update participant's providerSessionId in conversation doc
  │     (read-modify-write; enables --resume on next turn)
  │
  ├─ 7. If turn limit reached → auto-conclude conversation
  │
  └─ 8. Return TurnResult
```

### Take Turn (human participant)

Human turns do not launch sessions. The human's message is passed as context to the next anima turn via the inter-turn context assembly. The Parlour records that a human turn occurred (for turn counting and turn limit enforcement) but no Animator call is made.

### End

```
end(conversationId, reason)
  │
  ├─ 1. Read conversation from The Stacks
  ├─ 2. If already ended → no-op (idempotent)
  └─ 3. Update status to reason, set endedAt
```

---

## Inter-Turn Context

For convene conversations, each anima participant maintains their own session context via `--resume` (the provider's `conversationId`). Their session already contains their own prior messages and responses. When it's their turn again, The Parlour assembles only what happened *since their last turn* — the contributions of other participants.

```
Participant A's turn 3:
  - Read all turns since A's last turn (turn 1)
  - For each intervening turn (B's turn 2):
    - Read the session record artifact (if available)
    - Extract the assistant's text response from the transcript
  - Format as: "[B]: {response text}"
  - Pass as the message to A's session
```

On a participant's first turn, the conversation topic is used as the initial message.

For consult conversations, the pattern is simpler: the human's message is passed directly as the prompt to the anima's next turn.

**Dependency note:** Extracting responses from session transcripts requires access to session record artifacts (the JSON files written by The Animator). At MVP, this depends on The Animator writing artifacts to disk — see [Animator: Future: Session Record Artifacts](animator.md#future-session-record-artifacts). If artifacts are not available, the inter-turn message falls back to a placeholder (`[participant]: [response not available]`).

---

## Provider Session Continuity

Each anima participant in a conversation maintains session continuity across turns via the provider's `--resume` mechanism. The Parlour:

1. Passes `conversationId` to The Animator on each turn
2. Captures `providerSessionId` from the Animator's `SessionResult`
3. Stores it in the participant's `providerSessionId` field (in the conversation document)
4. Passes it back to The Animator on the participant's next turn

This allows the underlying AI process to maintain its full context window across turns without re-sending the entire conversation history.

### Workspace Persistence Constraint

The `--resume` mechanism depends on provider-specific session data stored on the local filesystem (e.g. Claude Code's `.claude/` directory). This creates a hard constraint: **all turns in a conversation must run in the same working directory**, or the session data needed for `--resume` will not be present.

This means:
- **Fresh temp worktrees per turn will not work.** The session data from turn 1 would be gone by turn 2.
- **A persistent workspace is required** — either the guildhall itself or a long-lived worktree that survives across turns.
- If a persistent workspace is not available, the fallback is to abandon `--resume` and re-send the full conversation context each turn. This works but costs more tokens and loses the provider's internal state (tool use history, reasoning context, etc.).

The Parlour must pass the same `cwd` to The Animator for every turn in a given conversation. The caller that creates the conversation is responsible for providing a workspace that will persist for the conversation's lifetime.

---

## Open Questions

- **Turn counting for human turns.** Do human turns count toward the turn limit? The legacy system counts only anima turns (sessions). For convene conversations this is clear (all turns are anima turns). For consult, should a turn limit of 10 mean 10 anima responses or 10 total exchanges (5 human + 5 anima)?
- **Conversation-level workspace.** Provider session continuity requires a persistent workspace across turns (see § Workspace Persistence Constraint). Should the `cwd` be set once at conversation creation and stored in the conversation document? Or is it the caller's responsibility to pass a consistent `cwd` on each `takeTurn()` call? Storing it on the conversation is safer (can't accidentally use different directories) but means the Parlour owns workspace lifecycle awareness.
- **Participant ordering.** The legacy uses insertion order for round-robin. Should The Parlour support explicit ordering or custom turn-order strategies?

---

## Future: Event Signalling

When Clockworks integration is available, The Parlour will signal conversation lifecycle events:

- **`conversation.started`** — fired after create(). Payload includes `conversationId`, `kind`, `topic`, participant names.
- **`conversation.turn-taken`** — fired after each turn. Payload includes `conversationId`, `turnNumber`, `participantName`, `sessionId`, `costUsd`.
- **`conversation.ended`** — fired after end() or auto-conclude. Payload includes `conversationId`, `reason`, `turnCount`, `totalCostUsd`.

These events enable clockworks standing orders to react to conversation activity (e.g. auto-summarize on conclusion, alert on high cost).

Blocked on: Clockworks apparatus spec finalization, Animator event signalling.

---

## Future: Conversation Cost Budgets

A `maxBudgetUsd` field on `CreateConversationRequest` that caps aggregate cost across all turns. The Parlour checks cumulative cost before each turn and auto-concludes if the budget would be exceeded.

---

## Future: Pluggable Turn-Order Strategies

The MVP uses round-robin for convene and simple alternation for consult. Future strategies might include:

- **Priority-based** — participants with higher priority speak more frequently
- **Facilitator-directed** — a designated facilitator anima decides who speaks next
- **Reactive** — participants speak when they have something to say (event-driven rather than scheduled)

This would require a `TurnOrderStrategy` interface and a configuration field on `CreateConversationRequest`.

---

## Implementation Notes

- **Cross-book queries.** The Parlour reads from both its own `conversations` book and The Animator's `sessions` book (for turn counts, cost aggregation, transcript extraction). This cross-apparatus read is via The Stacks' query API — no direct DB access.
- **Single-document access pattern.** With participants nested in the conversation document, most operations are single-document reads or read-modify-writes. The `takeTurn()` hot path reads one conversation doc, calls The Animator, then writes back the updated `providerSessionId`. No multi-book coordination needed.
- **No in-memory state.** All conversation state is persisted in The Stacks. The Parlour reads state fresh on each `takeTurn()` call. This makes it safe for concurrent callers and process restarts between turns.
- **Legacy migration.** The legacy `nexus-sessions` package combines session and conversation management in a single rig with separate `conversations` and `participants` books. The new architecture splits sessions (Animator) from conversations (Parlour) and nests participants inline. The Parlour's `conversations` book supersedes both legacy books.

=== CONTEXT FILE: docs/architecture/apparatus/claude-code.md ===
# Claude Code Session Provider — API Contract

Status: **Draft — MVP**

Package: `@shardworks/claude-code-apparatus` · Plugin id: `claude-code`

> **⚠️ MVP scope.** This spec covers the session provider implementation: launching Claude Code CLI processes in autonomous mode, parsing stream-json telemetry, and reporting structured results back to The Animator. The MCP tool server module exists but is not yet wired into the session lifecycle — see [Future: Tool-Equipped Sessions](#future-tool-equipped-sessions).

---

## Purpose

The Claude Code apparatus is a **session provider** — a pluggable backend that The Animator delegates to for launching and communicating with a specific AI system. It implements `AnimatorSessionProvider` from `@shardworks/animator-apparatus` and is discovered via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The apparatus handles the mechanics of the Claude Code CLI: process spawning, argument assembly, system prompt file management, stream-json NDJSON parsing, and telemetry extraction (cost, token usage, session id). It does not handle session lifecycle, recording, or identity composition — those belong to The Animator and The Loom respectively.

The provider also injects environment variables from `SessionProviderConfig.environment` into the spawned process. This is how anima git identity (set by The Loom and optionally overridden per-task by the orchestrator) reaches the `claude` child process. The provider does not interpret these variables — it spreads them into the spawn environment alongside `process.env`.

The package also contains the **MCP tool server** — a module that creates an MCP server from resolved tool definitions, serving guild tools to Claude during sessions. This module is not yet integrated into the session lifecycle but is the designated home for MCP server functionality.

---

## Dependencies

```
requires: []
```

The Claude Code apparatus has no apparatus dependencies. It implements `AnimatorSessionProvider` (imported as a type from `@shardworks/animator-apparatus`) but does not call The Animator at runtime — the relationship is reversed: The Animator calls the provider.

The MCP server module imports types from `@shardworks/tools-apparatus` (`ToolDefinition`, `isToolDefinition`) and uses `@modelcontextprotocol/sdk` for the MCP protocol implementation. These are compile-time dependencies, not runtime apparatus dependencies.

---

## `AnimatorSessionProvider` Implementation (`provides`)

The apparatus provides a stateless implementation of `AnimatorSessionProvider`:

```typescript
interface AnimatorSessionProvider {
  name: string;
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}
```

A single `launch()` method handles both streaming and non-streaming sessions. When `config.streaming` is true, the provider spawns Claude and yields `SessionChunk` objects as they arrive via an async iterable. When false, it accumulates all output internally and returns empty chunks. The return shape is always `{ chunks, result }` — the Animator does not branch on streaming capability.

Internally, the provider delegates to one of two spawn helpers based on the streaming flag:
- **`spawnClaudeStreamJson()`** — accumulates all stream-json output, resolves when the process exits. Used for non-streaming sessions.
- **`spawnClaudeStreamingJson()`** — yields chunks in real time via an async iterable while accumulating the full result. Used for streaming sessions.

The apparatus has no startup logic — `start()` is a no-op. The provider is stateless and safe for concurrent use.

---

## Session Preparation

Both launch methods share a `prepareSession()` step that writes temporary files and assembles CLI arguments:

```
prepareSession(config)
  │
  ├─ 1. Create temp directory (nsg-session-XXXXX)
  ├─ 2. Build base args:
  │     --setting-sources user
  │     --dangerously-skip-permissions
  │     --model <config.model>
  ├─ 3. If systemPrompt provided:
  │     Write to temp/system-prompt.md
  │     --system-prompt-file <path>
  ├─ 4. If conversationId provided:
  │     --resume <conversationId>
  └─ 5. Return { tmpDir, args }
```

The caller adds the final arguments (`--print`, `--output-format stream-json`, `--verbose`) and the initial prompt, then spawns the `claude` process. The temp directory is cleaned up in a `finally` block after the process exits.

### CLI Flags

| Flag | Purpose |
|------|---------|
| `--setting-sources user` | Use only user-level settings, not project-level |
| `--dangerously-skip-permissions` | Bypass interactive permission prompts (autonomous mode) |
| `--model` | Model selection from guild settings |
| `--print` | Autonomous mode — no interactive input, prompt via argument |
| `--output-format stream-json` | Structured NDJSON output on stdout |
| `--verbose` | Include detailed telemetry in stream-json output |
| `--system-prompt-file` | System prompt from file (composed by The Loom) |
| `--resume` | Resume an existing conversation by provider session id |

### Bare Mode (Future)

When sessions are fully composed by The Loom (system prompt, tools, CLAUDE.md), the provider should use `--bare` mode:

```
--bare    Skip hooks, LSP, plugin sync, attribution, auto-memory, background
          prefetches, keychain reads, and CLAUDE.md auto-discovery.
          Context is explicitly provided via:
          --system-prompt[-file], --mcp-config, --settings, --add-dir, etc.
```

This ensures the session context is entirely what The Loom wove — no ambient CLAUDE.md or project settings leak in. Not yet implemented; current sessions may pick up ambient project configuration.

---

## Stream-JSON Parsing

The `claude` CLI with `--output-format stream-json` emits NDJSON (newline-delimited JSON) on stdout. Each line is a message with a `type` field:

| Message type | Content | Extracted data |
|-------------|---------|----------------|
| `assistant` | Model response with content blocks | Transcript entry; text chunks → stderr + `SessionChunk` |
| `user` | User messages including tool results | Transcript entry; tool_result chunks → `SessionChunk` |
| `result` | Final summary after session completes | `costUsd`, `tokenUsage`, `providerSessionId` |

### Content Block Types (within `assistant` messages)

| Block type | Action |
|-----------|--------|
| `text` | Written to stderr (real-time visibility); emitted as `{ type: 'text', text }` chunk |
| `tool_use` | Emitted as `{ type: 'tool_use', tool: name }` chunk |

### Parsing Architecture

Two internal functions handle the parsing pipeline:

- **`processNdjsonBuffer(buffer, handler)`** — splits an incoming buffer on newlines, parses each complete JSON line, and calls the handler. Returns the remaining incomplete buffer. Gracefully skips non-JSON lines.

- **`parseStreamJsonMessage(msg, accumulator)`** — processes a single parsed message, accumulating transcript entries and telemetry into the accumulator object, and returning any `SessionChunk` objects for streaming consumers.

The stderr write of assistant text content is a deliberate side effect — it provides real-time session output visibility in the terminal. See [The Animator § CLI streaming behavior](./animator.md#cli-streaming-behavior) for the rationale.

---

## MCP Tool Server

The package contains a module (`mcp-server.ts`) that creates an MCP server from `ToolDefinition` objects, and an HTTP server helper (`startMcpHttpServer()`) that serves it over Streamable HTTP on an ephemeral localhost port. Each anima session gets its own MCP server instance serving that session's permission-gated tool set.

### `createMcpServer(tools)`

```typescript
async function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>
```

Creates an MCP server instance with the given tools registered. Each tool is registered with the MCP SDK using:
- Tool name and description from the definition
- Zod param schema (the SDK handles JSON Schema conversion)
- Handler wrapped with Zod validation and error formatting

Tools with `callableBy` set that does not include `'anima'` are filtered out. Tools without `callableBy` are included (available to all callers by default).

### `startMcpHttpServer(tools)`

```typescript
async function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>

interface McpHttpHandle {
  /** URL for --mcp-config (e.g. "http://localhost:PORT/mcp") */
  url: string;
  /** Shut down the HTTP server and MCP transport. */
  close(): Promise<void>;
}
```

Starts an in-process HTTP server serving the MCP tool set via the Streamable HTTP transport. The server:

1. Calls `createMcpServer(tools)` to build the MCP server instance
2. Creates a `StreamableHTTPServerTransport` in stateless mode (one session per server — no session tracking needed)
3. Connects the MCP server to the transport
4. Starts a Node.js `http.createServer()` listening on `127.0.0.1` with port `0` (OS-assigned ephemeral port)
5. Routes all requests to the transport's `handleRequest()`
6. Returns a handle with the URL and a `close()` function

The HTTP server binds to localhost only — it is not network-accessible. The ephemeral port avoids conflicts when multiple sessions run concurrently.

### Transport Choice: HTTP vs Stdio

The MCP SDK supports multiple transports. We chose in-process HTTP over the more common stdio child-process approach:

| Concern | Stdio (child process) | HTTP (in-process) |
|---------|----------------------|-------------------|
| Guild instances | Two (SQLite contention risk) | One (shared) |
| Tool resolution | Must re-resolve in child | Already resolved by Loom |
| Boot latency | Guild boot per session | ~0 (just start HTTP listener) |
| Lifecycle | Claude manages | Provider manages |
| Entry point | Needs runnable script file | No extra file |
| Permissions | Must serialize & re-resolve | Not needed — tools in memory |

The in-process approach eliminates the need for a separate MCP server process entry point, avoids duplicate guild boot, and removes the SQLite concurrent-writer concern entirely. Tool definitions (including Zod schemas and handler functions) are passed directly — no serialization boundary.

### MCP Config Format

The provider writes a temporary `--mcp-config` JSON file:

```json
{
  "mcpServers": {
    "nexus-guild": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp"
    }
  }
}
```

Claude connects to the HTTP server as an MCP client using the Streamable HTTP transport. From Claude's perspective, this is no different from any remote MCP server.

### Server Lifecycle

The provider owns the MCP server lifecycle — it starts the server before launching the Claude session and stops it after the session exits:

```
prepareSession(config)
  │
  ├─ ... existing steps (temp dir, args, system prompt, resume) ...
  │
  └─ If config.tools has entries:
      ├─ startMcpHttpServer(tools) → { url, close }
      ├─ Write --mcp-config JSON to temp dir (pointing at url)
      ├─ Add --mcp-config <path> to args
      ├─ Add --strict-mcp-config to args
      └─ Return close() in PreparedSession for cleanup
```

Cleanup happens in the same `finally` block that removes the temp directory:

```
launch(config)
  ├─ prepareSession() → { tmpDir, args, mcpClose? }
  ├─ spawn claude process
  └─ on exit:
      ├─ mcpClose?.() — shut down HTTP server + transport
      └─ rmSync(tmpDir) — remove temp files
```

The `close()` function:
1. Closes the `StreamableHTTPServerTransport` (terminates any active SSE connections)
2. Closes the `http.Server` (stops accepting new connections)

If the Claude process crashes or is killed, the cleanup still runs — the `close` handler on the child process fires regardless of exit reason.

### Concurrency

Each session gets its own MCP server on its own ephemeral port. Multiple concurrent sessions each have independent HTTP servers, all sharing the same in-process guild instance. This is safe because:
- Tool handlers access guild infrastructure via `guild()`, which is process-global
- Read operations (stacks queries, config reads) are naturally concurrent
- Write operations (stacks puts) go through SQLite, which handles concurrency in WAL mode

---

## Configuration

The Claude Code apparatus reads no direct configuration from `guild.json`. It is selected as a session provider via The Animator's config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `claude-code` value is the default when `sessionProvider` is not specified. The model comes from `guild.json["settings"]["model"]`, resolved by The Animator before being passed in `SessionProviderConfig`.

---

## Open Questions

- **`--bare` mode.** When should the provider switch from the current `--setting-sources user` to full `--bare` mode? Likely when The Loom produces real system prompts and MCP config is attached. Need to verify that `--bare` + `--mcp-config` + `--system-prompt-file` gives us full control with no ambient leakage.

---

## Future: Server Reuse

Currently each session gets its own MCP HTTP server, even when consecutive sessions have identical tool sets (same role, same permissions). A future optimization could pool and reuse MCP servers:

- **Key by tool set** — hash the sorted list of tool names to produce a cache key
- **Reference counting** — track active sessions per server; close when count drops to zero
- **Idle timeout** — close unused servers after a configurable idle period
- **Stale detection** — invalidate the cache when tool registrations change (plugin reload, guild restart)

This would eliminate per-session HTTP server startup for batch operations (e.g., dispatching multiple artificer sessions). The savings are modest — HTTP server start is fast — but it reduces port churn and simplifies cleanup in high-throughput scenarios.

Not implemented; revisit if session launch latency becomes a concern.

=== CONTEXT FILE: docs/architecture/apparatus/stacks.md ===
# The Stacks — API Contract

Status: **Draft — under review**

Package: `@shardworks/stacks` · Plugin id: `stacks`

---

## Purpose

The Stacks is the guild's persistence layer — a JSON document store backed by SQLite, with change data capture (CDC) as its primary integration mechanism. Every piece of guild state that needs to survive process restarts lives here: writs, sessions, anima records, event logs.

The Stacks owns the write path exclusively. There is no raw SQL escape hatch, no bypass. This is what makes CDC reliable — if the API is the only write path, the event stream is complete. The Stacks does not know what the documents mean; it stores them, indexes them, watches them, and stays out of the way.

---

## Dependencies

```
requires: []
consumes: ['books']    — scans kit contributions for book declarations
```

The Stacks has no apparatus dependencies — it is the foundation layer that everything else builds on.

---

## Kit Interface

When The Stacks is installed, kits gain the ability to declare a `books` field — a record of named book declarations with index schemas. The Stacks reads these at startup and creates or reconciles the backing tables. Schema changes are additive only — new books and new indexes are always safe; nothing is ever dropped automatically.

```typescript
// Example: a kit declaring two books
export default {
  kit: {
    requires: ['stacks'],
    books: {
      writs:    { indexes: ['status', 'createdAt', 'parent.id', ['status', 'createdAt']] },
      sessions: { indexes: ['writId', 'startedAt', 'animaId'] },
    },
  },
} satisfies Plugin
```

```typescript
interface BookSchema {
  /**
   * Fields or field tuples to index for efficient querying.
   * - A `string` creates a single-field index (e.g. `'status'`)
   * - A `string[]` creates a compound index (e.g. `['status', 'createdAt']`)
   *
   * Dot-notation for nested fields ('parent.id') is supported.
   */
  indexes?: (string | string[])[]
}
```

> **Index policy:** Only declared indexes are guaranteed to be efficient. Querying on a non-indexed field works but may scan the full table.

---

## `StacksApi` Interface (`provides`)

```typescript
interface StacksApi {
  /**
   * Get a writable Book handle for the given owner and book name.
   *
   * `ownerId` is the plugin id of the declaring kit — this is the write
   * boundary. Trust-based: not validated at runtime against the caller's
   * identity. `readBook()` enforces the boundary at the type level.
   */
  book<T extends BookEntry>(ownerId: string, name: string): Book<T>

  /**
   * Get a read-only Book handle scoped to another plugin's book.
   * Exposes `get`, `find`, `list`, and `count` only.
   */
  readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>

  /**
   * Register a CDC handler for a book.
   *
   * Must be called during startup before any writes occur.
   * The `failOnError` option controls execution phase — see
   * "Change Data Capture" below.
   */
  watch<T extends BookEntry>(
    ownerId: string,
    bookName: string,
    handler: ChangeHandler<T>,
    options?: WatchOptions,
  ): void

  /**
   * Execute a function within an atomic transaction.
   *
   * All writes inside `fn` commit or roll back together. Reads see
   * uncommitted writes (read-your-writes). CDC events are buffered
   * and fired (coalesced per-document) after commit.
   */
  transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>
}

interface TransactionContext {
  book<T extends BookEntry>(ownerId: string, name: string): Book<T>
  readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>
}
```

---

## Configuration

```json
{
  "stacks": {
    "autoMigrate": true,
    "maxCascadeDepth": 16
  }
}
```

- **`autoMigrate`** — whether to apply database migrations automatically on startup.
- **`maxCascadeDepth`** — maximum CDC cascade depth before the transaction is aborted (default: 16).

---

## Document Model

A **book** is a named collection of documents. Every document must include an `id: string` field. The framework puts nothing else in the envelope — no `_rev`, no `_createdAt`, no `_type`. Domain types own their own fields.

```typescript
type BookEntry = { id: string } & Record<string, unknown>
```

IDs are author-generated. Plugins own ID generation (ULIDs recommended). The Stacks has no opinion on format beyond requiring a non-empty string. Documents are stored as plain JSON objects; nested objects are fully supported. Field names in query predicates use dot-notation for nested access (`'parent.id'`).

---

## Read and Write API

```typescript
interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
  /** Upsert a document. Fires a `create` or `update` CDC event. */
  put(entry: T): Promise<void>

  /**
   * Partially update a document (top-level field merge).
   * Throws if the document does not exist. Returns the full document after merge.
   * Fires an `update` CDC event with the pre-patch document as `prev`.
   */
  patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>

  /** Delete by id. Silent no-op if the document does not exist. */
  delete(id: string): Promise<void>
}

interface ReadOnlyBook<T extends BookEntry> {
  get(id: string): Promise<T | null>
  find(query: BookQuery<T>): Promise<T[]>
  list(options?: ListOptions): Promise<T[]>
  count(where?: WhereClause<T> | { or: WhereClause<T>[] }): Promise<number>
}
```

---

## Query Language

Where conditions are expressed as tuples — `[field, operator, value?]`. All conditions within a single `WhereClause` are AND-ed.

```typescript
type WhereCondition<T> =
  | [string, '=' | '!=', Scalar]
  | [string, '>' | '>=' | '<' | '<=', number | string]
  | [string, 'LIKE', string]       // % and _ wildcards
  | [string, 'IN', Scalar[]]
  | [string, 'IS NULL' | 'IS NOT NULL']

type Scalar = string | number | boolean | null
type WhereClause<T> = WhereCondition<T>[]
```

**OR support:** The `where` field accepts `{ or: WhereClause<T>[] }` — each element is an AND-clause; results are unioned and deduplicated by `id`.

**Sorting:** Multi-field ordering via `orderBy: [field, 'asc' | 'desc']` or an array of such tuples.

**Pagination:** `{ limit: number; offset?: number }`. Offset requires limit.

```typescript
type BookQuery<T extends BookEntry> = {
  where?:   WhereClause<T> | { or: WhereClause<T>[] }
  orderBy?: OrderBy
} & Pagination
```

---

## Change Data Capture

All writes go through the Stacks API — this is the guarantee that makes CDC complete. CDC handlers fire on every write to a watched book.

### Event shapes

```typescript
type ChangeEvent<T extends BookEntry> =
  | CreateEvent<T>
  | UpdateEvent<T>
  | DeleteEvent<T>

interface CreateEvent<T> {
  type: 'create'; ownerId: string; book: string; entry: T
}
interface UpdateEvent<T> {
  type: 'update'; ownerId: string; book: string; entry: T; prev: T
}
interface DeleteEvent<T> {
  type: 'delete'; ownerId: string; book: string; id: string; prev: T
}
```

`prev` is always populated for `update` and `delete` events. The pre-read cost is only paid when handlers are registered for the book.

### Two-phase execution

```typescript
type ChangeHandler<T extends BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void

interface WatchOptions {
  /**
   * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
   *   join the same atomic unit. If the handler throws, everything rolls back.
   * false — Phase 2: runs AFTER commit. Data is persisted. Handler failures
   *   are logged as warnings.
   */
  failOnError?: boolean
}
```

**Phase 1 — Cascade** (`failOnError: true`, the default). Runs inside the transaction, before commit. The handler's writes join the same atomic unit. If the handler throws, everything rolls back — the triggering write, the handler's writes, and all nested cascades. This is the correct phase for referential integrity (e.g. cancelling child writs when a parent is cancelled).

**Phase 2 — Notification** (`failOnError: false`). Runs after the transaction commits. Data is already persisted. This is the correct phase for Clockworks event emission, telemetry, and audit logging. If your Phase 1 handler produces effects outside the Stacks, it probably belongs in Phase 2 — transaction rollback cannot undo non-database side effects.

### Transaction binding

Handlers access the Stacks through the normal `guild().apparatus<StacksApi>('stacks')` path. Transaction binding is transparent via `AsyncLocalStorage` — Phase 1 handlers automatically route their book operations through the active transaction. No special API, no transaction-aware handles. The transaction context is ambient.

**All book operations inside a Phase 1 handler must be `await`-ed.** A non-awaited write inherits the transaction context but may execute after commit or rollback, producing undefined behavior.

### Cascade depth limiting

A depth counter prevents infinite recursion from accidental handler cycles. Default limit is 16, configurable via `"stacks": { "maxCascadeDepth": 32 }` in `guild.json`. Exceeding the limit throws and rolls back the entire transaction.

### CDC event coalescing

Within a transaction, multiple writes to the same document produce a single CDC event reflecting the net change:

| Mutations | Coalesced event |
|---|---|
| create | `create` (final state) |
| create → update(s) | `create` (final state) |
| create → delete | *(no event)* |
| update(s) | `update` (pre-transaction → final) |
| update → delete | `delete` (pre-transaction state) |
| delete | `delete` (pre-transaction state) |

Phase 2 handlers see exactly one event per document. They never see intermediate states.

---

## Transaction Model

Every write participates in a transaction. There are two ways they're created:

**Implicit.** Every `put()`, `patch()`, or `delete()` outside a transaction opens one implicitly. It spans the write plus all Phase 1 handlers (and their cascades). Commits after all Phase 1 handlers succeed; rolls back if any throw.

**Explicit.** `stacks.transaction()` groups multiple writes into a single atomic unit. Phase 1 handlers within an explicit transaction join the same transaction. Commit is deferred until the callback completes.

Reads within a transaction see uncommitted writes from the same transaction (read-your-writes).

---

## Backend Interface

The Stacks depends on a `StacksBackend` interface, not SQLite directly. The default implementation uses SQLite via `better-sqlite3`; alternative backends implement the same interface. No SQLite types leak into the public API.

```typescript
interface StacksBackend {
  open(options: BackendOptions): Promise<void>
  close(): Promise<void>
  ensureBook(ref: BookRef, schema: BookSchema): Promise<void>
  beginTransaction(): Promise<BackendTransaction>
}

interface BackendTransaction {
  put(ref: BookRef, entry: BookEntry, opts?: { withPrev: boolean }): Promise<PutResult>
  patch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<PatchResult>
  delete(ref: BookRef, id: string, opts?: { withPrev: boolean }): Promise<DeleteResult>
  get(ref: BookRef, id: string): Promise<BookEntry | null>
  find(ref: BookRef, query: InternalQuery): Promise<BookEntry[]>
  count(ref: BookRef, where?: InternalCondition[]): Promise<number>
  commit(): Promise<void>
  rollback(): Promise<void>
}
```

For v1, the backend is an internal implementation detail — not a public extension point. To use a different persistence backend, install a different apparatus that provides `StacksApi`. The in-memory backend for tests ships inside `@shardworks/stacks` as a test utility export.

---

## Implementation Notes

- **Migration from existing code.** The existing `arbor/src/db/` (`BookStore`, `sqlite-adapter`, `reconcile-books`) moves into `@shardworks/stacks` as the SQLite backend. `Arbor.getDatabase()` (already `@deprecated`) is removed when The Stacks ships. The `core/src/book.ts` types are superseded by this spec's types. Direct database access in `nexus-clockworks` and `nexus-sessions` is replaced with `guild().apparatus<StacksApi>('stacks')` calls.
- **Plugin id ownership.** Each plugin hardcodes its own id as a constant (e.g. `const PLUGIN_ID = 'nexus-ledger'`). The framework does not inject it.

See [the full Stacks specification](../../../packages/stacks/docs/stacks.md) for complete type signatures, use case coverage matrix, resolved design questions, and the detailed cascade walkthrough.

=== CONTEXT FILE: packages/plugins/codexes/src/types.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */

// ── Codex Registry ──────────────────────────────────────────────────

export interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

export interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

// ── Draft Bindings ──────────────────────────────────────────────────

export interface DraftRecord {
  /** Unique draft id (ULID). */
  id: string
  /** Codex this draft belongs to. */
  codexName: string
  /** Git branch name for this draft. */
  branch: string
  /** Absolute filesystem path to the draft's working directory (git worktree). */
  path: string
  /** When the draft was opened. */
  createdAt: string
  /** Optional association — e.g. a writ id. */
  associatedWith?: string
}

// ── Request / Result Types ──────────────────────────────────────────

export interface OpenDraftRequest {
  /** Codex to open the draft for. */
  codexName: string
  /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
  branch?: string
  /**
   * Starting point — branch, tag, or commit to branch from.
   * Default: remote HEAD (the codex's default branch).
   */
  startPoint?: string
  /** Optional association metadata (e.g. writ id). */
  associatedWith?: string
}

export interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

export interface SealRequest {
  /** Codex name. */
  codexName: string
  /** Git branch to seal (the draft's branch). */
  sourceBranch: string
  /** Target branch (the sealed binding). Default: codex's default branch. */
  targetBranch?: string
  /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
  maxRetries?: number
  /** Keep the draft after successful sealing. Default: false. */
  keepDraft?: boolean
}

export interface SealResult {
  /** Whether sealing succeeded. */
  success: boolean
  /** Strategy used: 'fast-forward' or 'rebase'. */
  strategy: 'fast-forward' | 'rebase'
  /** Number of retry attempts needed (0 = first try). */
  retries: number
  /** The commit SHA at head of target after sealing. */
  sealedCommit: string
  /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
  inscriptionsSealed: number
}

export interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}

// ── Configuration ───────────────────────────────────────────────────

export interface CodexesConfig {
  settings?: CodexesSettings
  registered?: Record<string, CodexConfigEntry>
}

export interface CodexesSettings {
  /** Max rebase-retry attempts during sealing under contention. Default: 3. */
  maxMergeRetries?: number
  /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
  draftRoot?: string
}

export interface CodexConfigEntry {
  /** The remote URL of the codex's git repository. */
  remoteUrl: string
}

// ── API ─────────────────────────────────────────────────────────────

export interface ScriptoriumApi {
  // ── Codex Registry ──────────────────────────────────────────

  /**
   * Register an existing repository as a codex.
   * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
   * entry to the `codexes` config section in `guild.json`.
   * Blocks until the clone completes.
   */
  add(name: string, remoteUrl: string): Promise<CodexRecord>

  /**
   * List all registered codexes with their status.
   */
  list(): Promise<CodexRecord[]>

  /**
   * Show details for a single codex, including active drafts.
   */
  show(name: string): Promise<CodexDetail>

  /**
   * Remove a codex from the guild. Abandons all active drafts,
   * removes the bare clone from `.nexus/codexes/`, and removes the
   * entry from `guild.json`. Does NOT delete the remote repository.
   */
  remove(name: string): Promise<void>

  /**
   * Fetch latest refs from the remote for a codex's bare clone.
   * Called automatically before draft creation and sealing; can
   * also be invoked manually.
   */
  fetch(name: string): Promise<void>

  /**
   * Push a branch to the codex's remote.
   * Pushes the specified branch (default: codex's default branch)
   * to the bare clone's configured remote. Does not force-push.
   */
  push(request: PushRequest): Promise<void>

  // ── Draft Binding Lifecycle ─────────────────────────────────

  /**
   * Open a draft binding on a codex.
   *
   * Creates a new git branch from `startPoint` (default: the codex's
   * sealed binding) and checks it out as an isolated worktree under
   * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
   * before branching to ensure freshness.
   *
   * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
   * Rejects with a clear error if a draft with the same branch name
   * already exists for this codex.
   */
  openDraft(request: OpenDraftRequest): Promise<DraftRecord>

  /**
   * List active drafts, optionally filtered by codex.
   */
  listDrafts(codexName?: string): Promise<DraftRecord[]>

  /**
   * Abandon a draft — remove the draft's worktree and git branch.
   * Fails if the draft has unsealed inscriptions unless `force: true`.
   * The inscriptions persist in the git reflog but the draft is no
   * longer active.
   */
  abandonDraft(request: AbandonDraftRequest): Promise<void>

  /**
   * Seal a draft — incorporate its inscriptions into the sealed binding.
   *
   * Git strategy: fast-forward merge only. If ff is not possible,
   * rebases the draft branch onto the target and retries. Retries up
   * to `maxRetries` times (default: from settings.maxMergeRetries)
   * to handle contention from concurrent sealing. Fails hard if the
   * rebase produces conflicts — no auto-resolution, no merge commits.
   *
   * On success, abandons the draft (unless `keepDraft: true`).
   */
  seal(request: SealRequest): Promise<SealResult>
}

=== CONTEXT FILE: packages/plugins/codexes/src/git.test.ts ===
/**
 * Tests for the git helper module.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { git, resolveDefaultBranch, resolveRef, commitsAhead, GitError } from './git.ts';

// ── Test infrastructure ─────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nsg-git-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function gitSync(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function createTestRepo(): string {
  const dir = makeTmpDir('repo');
  gitSync(['init', '-b', 'main'], dir);
  gitSync(['config', 'user.email', 'test@test.com'], dir);
  gitSync(['config', 'user.name', 'Test'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  gitSync(['add', 'README.md'], dir);
  gitSync(['commit', '-m', 'Initial commit'], dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
  tmpDirs = [];
});

// ── Tests ───────────────────────────────────────────────────────────

describe('git()', () => {
  it('runs a git command and returns stdout', async () => {
    const repo = createTestRepo();
    const result = await git(['rev-parse', 'HEAD'], repo);
    assert.ok(result.stdout.length === 40); // SHA-1 hash
  });

  it('throws GitError on failure', async () => {
    const repo = createTestRepo();
    try {
      await git(['rev-parse', 'nonexistent-ref'], repo);
      assert.fail('Expected GitError');
    } catch (err) {
      assert.ok(err instanceof GitError);
      assert.ok(err.message.includes('rev-parse failed'));
      assert.deepEqual(err.command[0], 'git');
    }
  });
});

describe('resolveDefaultBranch()', () => {
  it('returns the default branch name', async () => {
    const repo = createTestRepo();
    const branch = await resolveDefaultBranch(repo);
    assert.equal(branch, 'main');
  });
});

describe('resolveRef()', () => {
  it('returns the commit SHA for a branch', async () => {
    const repo = createTestRepo();
    const sha = await resolveRef(repo, 'main');
    assert.ok(sha.length === 40);

    // Should match what git rev-parse gives us directly
    const expected = gitSync(['rev-parse', 'main'], repo);
    assert.equal(sha, expected);
  });
});

describe('commitsAhead()', () => {
  it('returns 0 when branches are at the same commit', async () => {
    const repo = createTestRepo();
    gitSync(['branch', 'feature'], repo);
    const ahead = await commitsAhead(repo, 'feature', 'main');
    assert.equal(ahead, 0);
  });

  it('returns the number of commits ahead', async () => {
    const repo = createTestRepo();
    gitSync(['checkout', '-b', 'feature'], repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    gitSync(['add', 'a.txt'], repo);
    gitSync(['commit', '-m', 'first'], repo);
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
    gitSync(['add', 'b.txt'], repo);
    gitSync(['commit', '-m', 'second'], repo);

    const ahead = await commitsAhead(repo, 'feature', 'main');
    assert.equal(ahead, 2);
  });
});

=== CONTEXT FILE: packages/plugins/codexes/src/git.ts ===
/**
 * Lightweight git helper — typed wrapper around child_process.execFile.
 *
 * All git operations in the Scriptorium go through this module for
 * safety (no shell injection) and consistent error handling.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export interface GitResult {
  stdout: string
  stderr: string
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly command: string[],
    readonly stderr: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * Run a git command with typed error handling.
 *
 * @param args - git subcommand and arguments (e.g. ['clone', '--bare', url])
 * @param cwd - working directory for the command
 */
export async function git(args: string[], cwd?: string): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFile('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; code?: number | null; message?: string };
    throw new GitError(
      `git ${args[0]} failed: ${e.stderr || e.message || 'unknown error'}`,
      ['git', ...args],
      e.stderr ?? '',
      e.code ?? null,
    );
  }
}

/**
 * Resolve the default branch of a bare clone by reading HEAD.
 *
 * Returns the branch name (e.g. 'main'), not the full ref.
 */
export async function resolveDefaultBranch(bareClonePath: string): Promise<string> {
  const { stdout } = await git(['symbolic-ref', 'HEAD'], bareClonePath);
  // stdout is e.g. 'refs/heads/main'
  return stdout.replace('refs/heads/', '');
}

/**
 * Get the commit SHA at the tip of a branch in a bare clone.
 */
export async function resolveRef(bareClonePath: string, ref: string): Promise<string> {
  const { stdout } = await git(['rev-parse', ref], bareClonePath);
  return stdout;
}

/**
 * Check if a branch has commits ahead of another branch.
 * Returns the number of commits ahead.
 */
export async function commitsAhead(
  bareClonePath: string,
  branch: string,
  base: string,
): Promise<number> {
  const { stdout } = await git(
    ['rev-list', '--count', `${base}..${branch}`],
    bareClonePath,
  );
  return parseInt(stdout, 10);
}



## Codebase Structure (surrounding directories)

```
=== TREE: ./ ===
.claude
.gitattributes
.github
.gitignore
.nvmrc
LICENSE
README.md
bin
docs
package.json
packages
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json

=== TREE: docs/architecture/apparatus/ ===
_template.md
animator.md
claude-code.md
clerk.md
fabricator.md
instrumentarium.md
loom.md
parlour.md
review-loop.md
scriptorium.md
spider.md
stacks.md

=== TREE: packages/plugins/codexes/src/ ===
git.test.ts
git.ts
index.ts
scriptorium-core.test.ts
scriptorium-core.ts
scriptorium.ts
tools
types.ts


```

## Codebase API Surface (declarations available before this commission)

Scope: all 15 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +132
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 132, reused 132, downloaded 0, added 132, done

devDependencies:
+ @tsconfig/node24 24.0.4
+ typescript 5.9.3

Done in 507ms using pnpm v10.32.1
=== packages/framework/arbor/dist/arbor.d.ts ===
/**
 * Arbor — the guild runtime.
 *
 * `createGuild()` is the single entry point. It reads guild.json, loads all
 * declared plugins, validates dependencies, starts apparatus in order, wires
 * the guild() singleton, and returns the Guild object.
 *
 * The full plugin lifecycle:
 *   1. Load    — imports all declared plugin packages, discriminates kit vs apparatus
 *   2. Validate — checks `requires` declarations, detects circular dependencies
 *   3. Start   — calls start(ctx) on each apparatus in dependency-resolved order
 *   4. Events  — fires `plugin:initialized` after each plugin loads
 *   5. Warn    — advisory warnings for mismatched kit contributions / recommends
 *
 * Pure logic (validation, ordering, events) lives in guild-lifecycle.ts.
 * This file handles I/O and orchestration.
 */
import type { Guild } from '@shardworks/nexus-core';
/**
 * Create and start a guild.
 *
 * Reads guild.json, loads all declared plugins, validates dependencies,
 * starts apparatus in dependency order, and returns the Guild object.
 * Also sets the guild() singleton so apparatus code can access it.
 *
 * @param root - Absolute path to the guild root. Defaults to auto-detection
 *               by walking up from cwd until guild.json is found.
 * @returns The initialized Guild — the same object guild() returns.
 */
export declare function createGuild(root?: string): Promise<Guild>;
//# sourceMappingURL=arbor.d.ts.map
=== packages/framework/arbor/dist/guild-lifecycle.d.ts ===
/**
 * Guild lifecycle — pure logic for plugin validation, ordering, and events.
 *
 * All functions here operate on in-memory data structures (LoadedKit[],
 * LoadedApparatus[], Maps) with no I/O. This makes them independently
 * testable with synthetic fixtures.
 *
 * `createGuild()` in arbor.ts is the orchestrator that performs I/O
 * (config reading, dynamic imports) then delegates to these functions.
 */
import type { StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Throws with a descriptive error on the first problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export declare function validateRequires(kits: LoadedKit[], apparatuses: LoadedApparatus[]): void;
/**
 * Sort apparatuses in dependency-resolved order using topological sort.
 * validateRequires() must be called first to ensure the graph is acyclic.
 */
export declare function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[];
/**
 * Collect advisory warnings for kit contributions that no apparatus
 * consumes, and for missing recommended apparatuses.
 *
 * Returns an array of warning strings. The caller decides how to emit
 * them (console.warn, logger, etc.).
 */
export declare function collectStartupWarnings(kits: LoadedKit[], apparatuses: LoadedApparatus[]): string[];
/**
 * Build a StartupContext for an apparatus's start() call.
 * The context provides event subscription; handlers are stored in the
 * shared eventHandlers map so fireEvent can invoke them later.
 */
export declare function buildStartupContext(eventHandlers: EventHandlerMap): StartupContext;
/**
 * Fire a lifecycle event, awaiting each handler sequentially.
 */
export declare function fireEvent(eventHandlers: EventHandlerMap, event: string, ...args: unknown[]): Promise<void>;
//# sourceMappingURL=guild-lifecycle.d.ts.map
=== packages/framework/arbor/dist/index.d.ts ===
/**
 * @shardworks/nexus-arbor — guild runtime
 *
 * The arbor is the guild host: plugin loading, dependency validation,
 * apparatus lifecycle management. It does NOT own tool discovery — that
 * belongs to The Instrumentarium (tools-apparatus).
 *
 * Plugin authors never import from arbor — they import from @shardworks/nexus-core.
 * The CLI imports from arbor to create the guild runtime and trigger startup.
 *
 * Package dependency graph:
 *   core   — public SDK, types, tool() factory
 *   arbor  — guild host, createGuild()
 *   cli    — nsg binary, Commander.js, framework commands + Instrumentarium tools
 *   plugins — import from core only
 */
export { createGuild } from './arbor.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/cli.d.ts ===
#!/usr/bin/env node
/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */
export {};
//# sourceMappingURL=cli.d.ts.map
=== packages/framework/cli/dist/commands/index.d.ts ===
/**
 * Framework commands — hardcoded CLI commands that work with or without a guild.
 *
 * These are guild lifecycle and plugin management commands that the CLI
 * registers directly, bypassing plugin discovery. They are the CLI's own
 * commands, not tools contributed by kits or apparatus.
 *
 * Plugin-contributed tools are discovered at runtime via The Instrumentarium
 * when a guild is present and the tools apparatus is installed.
 */
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/** All framework commands, typed as the base ToolDefinition for uniform handling. */
export declare const frameworkCommands: ToolDefinition[];
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/commands/init.d.ts ===
/**
 * nsg init — create a new guild.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Writes the minimum viable guild: directory structure, guild.json,
 * package.json, .gitignore. Does NOT git init, install bundles, create
 * the database, or instantiate animas — those are separate steps.
 *
 * After init, the user runs `nsg plugin install` to add capabilities.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=init.d.ts.map
=== packages/framework/cli/dist/commands/plugin.d.ts ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */
import { z } from 'zod';
/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export declare function detectPackageManager(guildRoot: string): 'npm' | 'pnpm';
export declare const pluginList: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export declare const pluginInstall: import("@shardworks/tools-apparatus").ToolDefinition<{
    source: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<{
        link: "link";
        registry: "registry";
    }>>;
}>;
export declare const pluginRemove: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export declare const pluginUpgrade: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/cli/dist/commands/status.d.ts ===
/**
 * nsg status — guild status.
 *
 * A framework command. Shows guild identity, framework version, and installed plugins
 * separated into apparatuses (running infrastructure) and kits (passive capabilities).
 * Domain-specific status (writ counts, session history, clock state) belongs
 * to plugins, not here.
 *
 * Requires a booted guild — prints a friendly error if run outside one.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=status.d.ts.map
=== packages/framework/cli/dist/commands/test-helpers.d.ts ===
/**
 * Shared test helpers for CLI command tests.
 *
 * Provides guild accessor setup, temp directory management, and minimal
 * guild.json scaffolding. Extracted from status.test.ts, version.test.ts,
 * and plugin.test.ts where these were copy-pasted identically.
 */
/** Set up a minimal guild accessor pointing at the given directory. */
export declare function setupGuildAccessor(home: string): void;
/** Create a temp directory and register it for cleanup. */
export declare function makeTmpDir(prefix: string): string;
/** Write a minimal guild.json to dir, with optional overrides. */
export declare function makeGuild(dir: string, overrides?: Record<string, unknown>): void;
/** Write a guild-root package.json declaring the given npm dependencies. */
export declare function makeGuildPackageJson(dir: string, deps: Record<string, string>): void;
/** Clean up guild state and temp directories. Call from afterEach(). */
export declare function cleanupTestState(): void;
//# sourceMappingURL=test-helpers.d.ts.map
=== packages/framework/cli/dist/commands/upgrade.d.ts ===
/**
 * nsg upgrade — upgrade the guild framework.
 *
 * Stub — upgrade lifecycle not yet designed. Will handle framework version
 * bumps, guild.json schema reconciliation, and plugin-specific upgrade
 * hooks when implemented.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    dryRun: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=upgrade.d.ts.map
=== packages/framework/cli/dist/commands/version.d.ts ===
/**
 * nsg version — show framework and plugin version info.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Always shows framework and Node versions. When run inside a guild,
 * additionally shows installed plugin versions. Gracefully degrades
 * when run outside a guild (no error, just less info).
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=version.d.ts.map
=== packages/framework/cli/dist/helpers.d.ts ===
/**
 * Pure helper functions for CLI command generation.
 *
 * Extracted from program.ts so they can be tested independently
 * without pulling in heavy runtime dependencies (Arbor, Instrumentarium).
 */
import { z } from 'zod';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Convert camelCase key to kebab-case CLI flag.
 * e.g. 'writId' → '--writ-id'
 */
export declare function toFlag(key: string): string;
/**
 * Detect whether a Zod schema accepts booleans (and only booleans).
 * Used to register Commander flags without <value> for boolean params.
 */
export declare function isBooleanSchema(schema: z.ZodTypeAny): boolean;
/**
 * Determine which hyphen prefixes have enough tools to warrant a group.
 *
 * Returns a Set of prefixes that have 2+ tools sharing them.
 * 'plugin-list' + 'plugin-install' → 'plugin' is a group.
 * 'show-writ' alone → 'show' is NOT a group.
 */
export declare function findGroupPrefixes(tools: ToolDefinition[]): Set<string>;
//# sourceMappingURL=helpers.d.ts.map
=== packages/framework/cli/dist/index.d.ts ===
export { VERSION } from '@shardworks/nexus-core';
export { main } from './program.ts';
export { frameworkCommands } from './commands/index.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/program.d.ts ===
/**
 * nsg program — dynamic Commander setup.
 *
 * Two command sources:
 *
 * 1. **Framework commands** — hardcoded in the CLI package (init, status,
 *    version, upgrade, plugin management). Always available, even without
 *    a guild.
 *
 * 2. **Plugin tools** — discovered at runtime via The Instrumentarium
 *    (tools apparatus). Only available when a guild is present and the
 *    tools apparatus is installed.
 *
 * Tool names are auto-grouped when multiple tools share a hyphen prefix:
 * 'plugin-list' + 'plugin-install' → 'nsg plugin list' / 'nsg plugin install'.
 * A tool like 'show-writ' stays flat ('nsg show-writ') since no other tool
 * starts with 'show-'.
 */
export declare function main(): Promise<void>;
//# sourceMappingURL=program.d.ts.map
=== packages/framework/core/dist/guild-config.d.ts ===
/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
    /** Human-readable description of what this event means. */
    description?: string;
    /** Optional payload schema hint (not enforced in Phase 1). */
    schema?: Record<string, string>;
}
/** A standing order — a registered response to an event. */
export type StandingOrder = {
    on: string;
    run: string;
} | {
    on: string;
    summon: string;
    prompt?: string;
} | {
    on: string;
    brief: string;
};
/** The clockworks configuration block in guild.json. */
export interface ClockworksConfig {
    /** Custom event declarations. */
    events?: Record<string, EventDeclaration>;
    /** Standing orders — event → action mappings. */
    standingOrders?: StandingOrder[];
}
/** Guild-level settings — operational flags and preferences. */
export interface GuildSettings {
    /**
     * Default LLM model for anima sessions (e.g. 'sonnet', 'opus').
     * Replaces the top-level `model` field from GuildConfig V1.
     */
    model?: string;
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified. Set to `false` to require explicit
     * migration via `nsg guild upgrade-books`.
     */
    autoMigrate?: boolean;
}
/**
 * Guild configuration.
 *
 * The plugin-centric model: plugins are npm packages; capabilities (tools, engines,
 * training content) are declared by plugins and discovered dynamically at runtime.
 * Framework-level keys (`name`, `nexus`, `plugins`, `settings`) are defined here;
 * all other top-level keys are plugin configuration sections, keyed by plugin id.
 */
export interface GuildConfig {
    /** Guild name — used as the guildhall npm package name. */
    name: string;
    /** Installed Nexus framework version. */
    nexus: string;
    /** Installed plugin ids (derived from npm package names). Always present; starts empty. */
    plugins: string[];
    /** Clockworks configuration — events, standing orders. */
    clockworks?: ClockworksConfig;
    /** Guild-level settings — operational flags and preferences. Includes default model. */
    settings?: GuildSettings;
}
/**
 * Create the default guild.json content for a new guild.
 * All collections start empty. The default model is stored in settings.
 */
export declare function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig;
/** Read and parse guild.json from the guild root. */
export declare function readGuildConfig(home: string): GuildConfig;
/** Write guild.json to the guild root. */
export declare function writeGuildConfig(home: string, config: GuildConfig): void;
/** Resolve the path to guild.json in the guild root. */
export declare function guildConfigPath(home: string): string;
//# sourceMappingURL=guild-config.d.ts.map
=== packages/framework/core/dist/guild.d.ts ===
/**
 * Guild — the process-level singleton for accessing guild infrastructure.
 *
 * All plugin code — apparatus start(), tool handlers, engine handlers,
 * relay handlers, CDC handlers — imports `guild()` to access apparatus APIs,
 * plugin config, the guild root path, and the loaded plugin graph.
 *
 * Arbor creates the Guild instance before starting apparatus and registers
 * it via `setGuild()`. The instance is backed by live data structures
 * (e.g. the provides Map) that are populated progressively as apparatus start.
 *
 * See: docs/architecture/plugins.md
 */
import type { GuildConfig } from './guild-config.ts';
import type { LoadedKit, LoadedApparatus } from './plugin.ts';
/**
 * Runtime access to guild infrastructure.
 *
 * Available after Arbor creates the instance (before apparatus start).
 * One instance per process.
 */
export interface Guild {
    /** Absolute path to the guild root (contains guild.json). */
    readonly home: string;
    /**
     * Retrieve a started apparatus's provides object by plugin id.
     *
     * Throws if the apparatus is not installed or has no `provides`.
     * During startup, only apparatus that have already started are visible
     * (dependency ordering guarantees declared deps are started first).
     */
    apparatus<T>(name: string): T;
    /**
     * Read a plugin's configuration section from guild.json.
     *
     * Returns `guild.json[pluginId]` cast to `T`. Returns `{}` if no
     * section exists. The generic parameter is a cast — the framework
     * does not validate config shape.
     */
    config<T = Record<string, unknown>>(pluginId: string): T;
    /**
     * Write a plugin's configuration section to guild.json.
     *
     * Updates `guild.json[pluginId]` with `value` and writes the file
     * to disk. Also updates the in-memory config so subsequent reads
     * reflect the change.
     *
     * For framework-level keys (name, nexus, plugins, settings), use
     * the standalone `writeGuildConfig()` function instead.
     */
    writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void;
    /**
     * Read the full parsed guild.json.
     *
     * Escape hatch for framework-level fields (name, nexus, plugins,
     * settings) that don't belong to any specific plugin.
     */
    guildConfig(): GuildConfig;
    /** Snapshot of all loaded kits (including apparatus supportKits). */
    kits(): LoadedKit[];
    /** Snapshot of all started apparatuses. */
    apparatuses(): LoadedApparatus[];
}
/**
 * Get the active guild instance.
 *
 * Throws with a clear message if called before Arbor has initialized
 * the guild (e.g. at module import time, before startup begins).
 */
export declare function guild(): Guild;
/**
 * Set the guild instance. Called by Arbor before starting apparatus.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function setGuild(g: Guild): void;
/**
 * Clear the guild instance. Called by Arbor at shutdown or in tests.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function clearGuild(): void;
//# sourceMappingURL=guild.d.ts.map
=== packages/framework/core/dist/id.d.ts ===
/**
 * Generate a sortable, prefixed ID.
 *
 * Format: `{prefix}-{base36_timestamp}-{hex_random}`
 *
 * The timestamp component (Date.now() in base36) gives lexicographic sort
 * order by creation time. The random suffix prevents collisions without
 * coordination.
 *
 * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
 * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
 */
export declare function generateId(prefix: string, randomByteCount?: number): string;
//# sourceMappingURL=id.d.ts.map
=== packages/framework/core/dist/index.d.ts ===
export declare const VERSION: string;
export { type Kit, type Apparatus, type Plugin, type LoadedKit, type LoadedApparatus, type LoadedPlugin, type StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus, } from './plugin.ts';
export { type Guild, guild, setGuild, clearGuild, } from './guild.ts';
export { findGuildRoot, nexusDir, worktreesPath, clockPidPath, clockLogPath, } from './nexus-home.ts';
export { derivePluginId, readGuildPackageJson, resolvePackageNameForPluginId, resolveGuildPackageEntry, } from './resolve-package.ts';
export { type GuildConfig, createInitialGuildConfig, readGuildConfig, writeGuildConfig, type EventDeclaration, type StandingOrder, type ClockworksConfig, type GuildSettings, guildConfigPath, } from './guild-config.ts';
export { generateId } from './id.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/core/dist/nexus-home.d.ts ===
/**
 * Find the guild root by walking up from a starting directory looking for guild.json.
 *
 * This replaces the old NEXUS_HOME env var approach. The guild root IS the
 * guildhall — a regular git clone with guild.json at the root.
 *
 * @param startDir - Directory to start searching from (defaults to cwd).
 * @throws If no guild.json is found before reaching the filesystem root.
 */
export declare function findGuildRoot(startDir?: string): string;
/** Path to the .nexus framework-managed directory. */
export declare function nexusDir(home: string): string;
/** Path to the top-level worktrees directory (for writ worktrees). */
export declare function worktreesPath(home: string): string;
/** Path to the clockworks daemon PID file. */
export declare function clockPidPath(home: string): string;
/** Path to the clockworks daemon log file. */
export declare function clockLogPath(home: string): string;
//# sourceMappingURL=nexus-home.d.ts.map
=== packages/framework/core/dist/plugin.d.ts ===
/**
 * Plugin system — core types for the Kit/Apparatus model.
 *
 * Plugins come in two kinds:
 * - Kit:       passive package contributing capabilities to consuming apparatuses.
 *              No lifecycle, no running state. Read at load time.
 * - Apparatus: package contributing persistent running infrastructure.
 *              Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * See: docs/architecture/plugins.md
 */
/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly kit: Kit;
}
/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly apparatus: Apparatus;
}
/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus;
/**
 * Startup context passed to an apparatus's start(ctx).
 *
 * Provides lifecycle-event subscription — the only capability that is
 * meaningful only during startup. All other guild access (apparatus APIs,
 * config, home path, loaded plugins) goes through the `guild()` singleton,
 * which is available during start() and in all handlers.
 *
 * See: docs/architecture/plugins.md
 */
export interface StartupContext {
    /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
}
/**
 * A kit — passive package contributing capabilities to consuming apparatuses.
 * Open record: contribution fields (engines, relays, tools, etc.) are defined
 * by the apparatus packages that consume them. `requires` and `recommends` are
 * the only framework-level fields.
 *
 * `requires`: apparatus names whose runtime APIs this kit's contributions depend
 *   on at handler invocation time. Hard startup validation failure if a declared
 *   apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced.
 */
export type Kit = {
    requires?: string[];
    recommends?: string[];
    [key: string]: unknown;
};
/**
 * An apparatus — package contributing persistent running infrastructure.
 * Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * `requires`: apparatus names that must be started before this apparatus's
 *   start() runs. Determines start ordering. Hard startup validation failure
 *   if a declared apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced — the apparatus starts
 *   regardless. Use for soft dependencies needed by optional API methods
 *   (e.g. The Animator recommends The Loom for summon(), but animate()
 *   works without it).
 *
 * `provides`: the runtime API object this apparatus exposes to other plugins.
 *   Retrieved via guild().apparatus<T>(name). Created at manifest-definition time,
 *   populated during start.
 *
 * `supportKit`: kit contributions this apparatus exposes to consuming apparatuses.
 *   Treated identically to standalone kit contributions by consumers.
 *
 * `consumes`: kit contribution field types this apparatus scans for and registers.
 *   Enables framework startup warnings when kits contribute types with no consumer.
 */
export type Apparatus = {
    requires?: string[];
    recommends?: string[];
    provides?: unknown;
    start: (ctx: StartupContext) => void | Promise<void>;
    stop?: () => void | Promise<void>;
    supportKit?: Kit;
    consumes?: string[];
};
/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin = {
    kit: Kit;
} | {
    apparatus: Apparatus;
};
/** Type guard: is this value a kit plugin export? */
export declare function isKit(obj: unknown): obj is {
    kit: Kit;
};
/** Type guard: is this value an apparatus plugin export? */
export declare function isApparatus(obj: unknown): obj is {
    apparatus: Apparatus;
};
/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export declare function isLoadedKit(p: LoadedPlugin): p is LoadedKit;
/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export declare function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/core/dist/resolve-package.d.ts ===
/**
 * Package resolution utilities for guild-installed npm packages.
 *
 * Resolves entry points from the guild's node_modules by reading package.json
 * exports maps directly. Needed because guild plugins are ESM-only packages
 * and createRequire() can't resolve their exports.
 *
 * Also owns:
 * - derivePluginId — canonical npm package name → plugin id derivation
 */
/**
 * Derive the guild-facing plugin id from an npm package name.
 *
 * Convention:
 * - `@shardworks/nexus-ledger`      → `nexus-ledger`   (official scope stripped)
 * - `@shardworks/books-apparatus`   → `books`           (descriptor suffix stripped)
 * - `@acme/my-plugin`               → `acme/my-plugin`  (third-party: drop @ only)
 * - `my-relay-kit`                  → `my-relay`        (descriptor suffix stripped)
 * - `my-plugin`                     → `my-plugin`       (unscoped: unchanged)
 *
 * The `@shardworks` scope is the official Nexus namespace — its plugins are
 * referenced by bare name in guild.json, CLI commands, and config keys.
 * Third-party scoped packages retain the scope as a prefix (without @) to
 * prevent collisions between `@acme/foo` and `@other/foo`.
 *
 * Descriptor suffixes (`-plugin`, `-apparatus`, `-kit`) are stripped after
 * scope resolution so that package naming conventions don't leak into ids.
 */
export declare function derivePluginId(packageName: string): string;
/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export declare function readGuildPackageJson(guildRoot: string, pkgName: string): {
    version: string;
    pkgJson: Record<string, unknown> | null;
};
/**
 * Resolve the npm package name for a plugin id by consulting the guild's root package.json.
 *
 * Scans all dependencies and runs `derivePluginId()` on each to find the
 * package whose derived id matches. This correctly handles descriptor
 * suffixes (-kit, -apparatus, -plugin) that derivePluginId strips.
 *
 * When multiple packages derive to the same id (unlikely but possible),
 * prefers @shardworks-scoped packages over third-party ones.
 *
 * Returns null if no matching dependency is found.
 */
export declare function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null;
/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export declare function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string;
//# sourceMappingURL=resolve-package.d.ts.map
=== packages/plugins/animator/dist/animator.d.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export declare function createAnimator(): Plugin;
//# sourceMappingURL=animator.d.ts.map
=== packages/plugins/animator/dist/index.d.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */
export { type AnimatorApi, type AnimateHandle, type AnimateRequest, type SummonRequest, type SessionResult, type SessionChunk, type TokenUsage, type SessionDoc, type AnimatorConfig, type AnimatorSessionProvider, type SessionProviderConfig, type SessionProviderResult, } from './types.ts';
export { createAnimator } from './animator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/index.d.ts ===
/**
 * Animator tool re-exports.
 */
export { default as sessionList } from './session-list.ts';
export { default as sessionShow } from './session-show.ts';
export { default as summon } from './summon.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/session-list.d.ts ===
/**
 * session-list tool — list recent sessions with optional filters.
 *
 * Queries The Animator's `sessions` book in The Stacks.
 * Returns session summaries ordered by startedAt descending (newest first).
 *
 * See: docs/specification.md (animator § session-list tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        timeout: "timeout";
        running: "running";
    }>>;
    provider: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=session-list.d.ts.map
=== packages/plugins/animator/dist/tools/session-show.d.ts ===
/**
 * session-show tool — show full detail for a single session by id.
 *
 * Reads the complete session record from The Animator's `sessions` book
 * in The Stacks, including tokenUsage, metadata, and all indexed fields.
 *
 * See: docs/specification.md (animator § session-show tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=session-show.d.ts.map
=== packages/plugins/animator/dist/tools/summon.d.ts ===
/**
 * summon tool — dispatch an anima session from the CLI.
 *
 * High-level entry point: composes context via The Loom (passing the
 * role for system prompt composition), then launches a session via
 * The Animator. The work prompt goes directly to the provider.
 *
 * Usage:
 *   nsg summon --prompt "Build the frobnicator" --role artificer
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    prompt: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=summon.d.ts.map
=== packages/plugins/animator/dist/types.d.ts ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */
import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
/** A chunk of output from a running session. */
export type SessionChunk = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    tool: string;
} | {
    type: 'tool_result';
    tool: string;
};
export interface AnimateRequest {
    /**
     * Optional pre-generated session id. When provided, the Animator uses
     * this id instead of generating a new one. Used by summon() to make the
     * session id available on the handle before the Loom weave resolves.
     */
    sessionId?: string;
    /** The anima weave from The Loom (composed identity context). */
    context: AnimaWeave;
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     * This bypasses The Loom — it is not a composition concern.
     */
    prompt?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     * If provided, the session provider resumes the existing conversation
     * rather than starting a new one.
     */
    conversationId?: string;
    /**
     * Caller-supplied metadata recorded alongside the session.
     * The Animator stores this as-is — it does not interpret the contents.
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     *
     * Either way, the return shape is the same: `{ chunks, result }`.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
export interface SessionResult {
    /** Unique session id (generated by The Animator). */
    id: string;
    /** Terminal status. */
    status: 'completed' | 'failed' | 'timeout';
    /** When the session started (ISO-8601). */
    startedAt: string;
    /** When the session ended (ISO-8601). */
    endedAt: string;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    /** Provider name (e.g. 'claude-code'). */
    provider: string;
    /** Numeric exit code from the provider process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Conversation id (for multi-turn resume). */
    conversationId?: string;
    /** Session id from the provider (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage from the provider, if available. */
    tokenUsage?: TokenUsage;
    /** Cost in USD from the provider, if available. */
    costUsd?: number;
    /** Caller-supplied metadata, recorded as-is. */
    metadata?: Record<string, unknown>;
    /**
     * The final assistant text from the session.
     * Extracted by the Animator from the provider's transcript.
     * Useful for programmatic consumers that need the session's conclusion
     * without parsing the full transcript (e.g. the Spider's review collect step).
     */
    output?: string;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface SummonRequest {
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     */
    prompt: string;
    /**
     * The role to summon (e.g. 'artificer', 'scribe').
     * Passed to The Loom for context composition and recorded in session metadata.
     */
    role?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     */
    conversationId?: string;
    /**
     * Additional metadata to record alongside the session.
     * Merged with auto-generated metadata (trigger: 'summon', role).
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
/** The return value from animate() and summon(). */
export interface AnimateHandle {
    /**
     * Session ID, available immediately after launch — before the session
     * completes. Callers that only need to know the session was launched
     * (e.g. quick engines returning `{ status: 'launched', sessionId }`)
     * can return without awaiting `result`.
     */
    sessionId: string;
    /**
     * Async iterable of output chunks from the session. When streaming is
     * disabled (the default), this iterable completes immediately with no
     * items. When streaming is enabled, it yields chunks as the session
     * produces output.
     */
    chunks: AsyncIterable<SessionChunk>;
    /**
     * Promise that resolves to the final SessionResult after the session
     * completes (or fails/times out) and the result is recorded to The Stacks.
     */
    result: Promise<SessionResult>;
}
export interface AnimatorApi {
    /**
     * Summon an anima — compose context via The Loom and launch a session.
     *
     * This is the high-level "make an anima do a thing" entry point.
     * Internally calls The Loom for context composition (passing the role),
     * then animate() for session launch and recording. The work prompt
     * bypasses the Loom and goes directly to the provider.
     *
     * Requires The Loom apparatus to be installed. Throws if not available.
     *
     * Auto-populates session metadata with `trigger: 'summon'` and `role`.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    summon(request: SummonRequest): AnimateHandle;
    /**
     * Animate a session — launch an AI process with the given context.
     *
     * This is the low-level entry point for callers that compose their own
     * AnimaWeave (e.g. The Parlour for multi-turn conversations).
     *
     * Records the session result to The Stacks before `result` resolves.
     *
     * Set `streaming: true` on the request to receive output chunks as the
     * session runs. When streaming is disabled (default), the `chunks`
     * iterable completes immediately with no items.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    animate(request: AnimateRequest): AnimateHandle;
}
/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
    /** Human-readable name (e.g. 'claude-code'). */
    name: string;
    /**
     * Launch a session. Returns `{ chunks, result }` synchronously.
     *
     * The `result` promise resolves when the AI process exits.
     * The `chunks` async iterable yields output when `config.streaming`
     * is true and the provider supports streaming; otherwise it completes
     * immediately with no items.
     *
     * Providers that don't support streaming simply ignore the flag and
     * return empty chunks — no separate method needed.
     */
    launch(config: SessionProviderConfig): {
        chunks: AsyncIterable<SessionChunk>;
        result: Promise<SessionProviderResult>;
    };
}
export interface SessionProviderConfig {
    /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
    systemPrompt?: string;
    /** Initial user message (e.g. writ description). */
    initialPrompt?: string;
    /** Model to use (from guild settings). */
    model: string;
    /** Optional conversation id for resume. */
    conversationId?: string;
    /** Working directory for the session. */
    cwd: string;
    /**
     * Enable streaming output. When true, the provider should yield output
     * chunks as the session produces them. When false (default), the chunks
     * iterable should complete immediately with no items.
     *
     * Providers that don't support streaming may ignore this flag.
     */
    streaming?: boolean;
    /**
     * Resolved tools for this session. When present, the provider should
     * configure an MCP server with these tool definitions.
     *
     * The Loom resolves role → permissions → tools via the Instrumentarium.
     * The Animator passes them through from the AnimaWeave.
     */
    tools?: ResolvedTool[];
    /**
     * Merged environment variables to spread into the spawned process.
     * The Animator merges identity-layer (weave) and task-layer (request)
     * variables before passing them here — task layer wins on collision.
     */
    environment?: Record<string, string>;
}
/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;
export interface SessionProviderResult {
    /** Exit status. */
    status: 'completed' | 'failed' | 'timeout';
    /** Numeric exit code from the process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Provider's session id (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage, if the provider can report it. */
    tokenUsage?: TokenUsage;
    /** Cost in USD, if the provider can report it. */
    costUsd?: number;
    /** The session's full transcript — array of NDJSON message objects. */
    transcript?: TranscriptMessage[];
    /**
     * The final assistant text from the session.
     * Extracted from the last assistant message's text content blocks.
     * Undefined if the session produced no assistant output.
     */
    output?: string;
}
/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
    id: string;
    /**
     * Session status. Initially written as `'running'` when the session is
     * launched (Step 2), then updated to a terminal status (`'completed'`,
     * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
     * The `'running'` state is transient — it only exists between Steps 2 and 5.
     * `SessionResult.status` only includes terminal states.
     */
    status: 'running' | 'completed' | 'failed' | 'timeout';
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    provider: string;
    exitCode?: number;
    error?: string;
    conversationId?: string;
    providerSessionId?: string;
    tokenUsage?: TokenUsage;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    /** The final assistant text from the session. */
    output?: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
    /** Same as the session id. */
    id: string;
    /** Full NDJSON transcript from the session. */
    messages: TranscriptMessage[];
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
    /**
     * Plugin id of the apparatus that implements AnimatorSessionProvider.
     * The Animator looks this up via guild().apparatus() at animate-time.
     * Defaults to 'claude-code' if not specified.
     */
    sessionProvider?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        animator?: AnimatorConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/claude-code/dist/index.d.ts ===
/**
 * Claude Code Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider for the
 * Claude Code CLI. The Animator discovers this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "claude-code"
 *
 * Launches sessions via the `claude` CLI in autonomous mode (--print)
 * with --output-format stream-json for structured telemetry.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { SessionChunk } from '@shardworks/animator-apparatus';
/**
 * Extract the final assistant text from a transcript.
 *
 * Walks the transcript backwards to find the last `assistant` message
 * and concatenates its text content blocks.
 *
 * @internal Exported for testing only.
 */
export declare function extractFinalAssistantText(transcript: Record<string, unknown>[]): string | undefined;
/**
 * Create the Claude Code session provider apparatus.
 *
 * The apparatus has no startup logic — it just provides the
 * AnimatorSessionProvider implementation. The Animator looks it up
 * via guild().apparatus('claude-code').
 */
export declare function createClaudeCodeProvider(): Plugin;
declare const _default: Plugin;
export default _default;
export { createMcpServer, startMcpHttpServer } from './mcp-server.ts';
export type { McpHttpHandle } from './mcp-server.ts';
/** Parsed result from stream-json output. @internal */
export interface StreamJsonResult {
    exitCode: number;
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    providerSessionId?: string;
}
/**
 * Parse a single NDJSON message from stream-json output.
 *
 * Returns parsed chunks for streaming and accumulates data into the
 * provided accumulators (transcript, metrics).
 *
 * @internal Exported for testing only.
 */
export declare function parseStreamJsonMessage(msg: Record<string, unknown>, acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
}): SessionChunk[];
/**
 * Process NDJSON buffer, calling handler for each complete line.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export declare function processNdjsonBuffer(buffer: string, handler: (msg: Record<string, unknown>) => void): string;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/claude-code/dist/mcp-server.d.ts ===
/**
 * MCP Tool Server — serves guild tools as typed MCP tools during anima sessions.
 *
 * Two entry points:
 *
 * 1. **`createMcpServer(tools)`** — library function. Takes an array of
 *    ToolDefinitions (already resolved by the Instrumentarium) and returns
 *    a configured McpServer.
 *
 * 2. **`startMcpHttpServer(tools)`** — starts an in-process HTTP server
 *    serving the MCP tool set via Streamable HTTP on an ephemeral localhost
 *    port. Returns a handle with the URL (for --mcp-config) and a close()
 *    function for cleanup.
 *
 * The MCP server is one-per-session. The claude-code provider owns the
 * lifecycle — starts before the Claude process, stops after it exits.
 *
 * See: docs/architecture/apparatus/claude-code.md
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Handle returned by startMcpHttpServer().
 *
 * Provides the URL for --mcp-config and a close() function for cleanup.
 */
export interface McpHttpHandle {
    /** URL for --mcp-config (e.g. "http://127.0.0.1:PORT/mcp"). */
    url: string;
    /** Shut down the HTTP server and MCP transport. */
    close(): Promise<void>;
}
/**
 * Create and configure an MCP server with the given tools.
 *
 * Each tool's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to
 * validate params via Zod and format the result as MCP tool output.
 *
 * Tools with `callableBy` set that does not include `'anima'` are
 * filtered out. Tools without `callableBy` are included (available
 * to all callers by default).
 */
export declare function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>;
/**
 * Start an in-process HTTP server serving the MCP tool set via SSE.
 *
 * Uses the MCP SDK's SSE transport: the client GETs /sse to establish
 * the event stream, then POSTs messages to /message. Claude Code's
 * --mcp-config expects `type: "sse"` for HTTP-based MCP servers.
 *
 * The server binds to 127.0.0.1 only — not network-accessible.
 *
 * Returns a handle with the URL (for --mcp-config) and a close() function.
 * The caller is responsible for calling close() after the session exits.
 *
 * Each session gets its own server instance. Concurrent sessions get
 * independent servers on different ports.
 */
export declare function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>;
//# sourceMappingURL=mcp-server.d.ts.map
=== packages/plugins/clerk/dist/clerk.d.ts ===
/**
 * The Clerk — writ lifecycle management apparatus.
 *
 * The Clerk manages the lifecycle of writs: lightweight work orders that flow
 * through a fixed status machine (ready → active → completed/failed, or
 * ready/active → cancelled). Each writ has a type, a title, a body, and
 * optional codex and resolution fields.
 *
 * Writ types are validated against the guild config's writTypes field plus the
 * built-in type ('mandate'). An unknown type is rejected at post time.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createClerk(): Plugin;
//# sourceMappingURL=clerk.d.ts.map
=== packages/plugins/clerk/dist/index.d.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
export { type ClerkApi, type ClerkConfig, type WritTypeEntry, type WritDoc, type WritLinkDoc, type WritLinks, type WritStatus, type PostCommissionRequest, type WritFilters, } from './types.ts';
export { createClerk } from './clerk.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/commission-post.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    title: z.ZodString;
    body: z.ZodString;
    type: z.ZodOptional<z.ZodString>;
    codex: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=commission-post.d.ts.map
=== packages/plugins/clerk/dist/tools/index.d.ts ===
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
export { default as writLink } from './writ-link.ts';
export { default as writUnlink } from './writ-unlink.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-accept.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-accept.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-cancel.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=writ-cancel.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-complete.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-complete.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-fail.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-fail.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-link.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-link.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-list.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        ready: "ready";
        active: "active";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>>;
    type: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=writ-list.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-show.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-show.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-unlink.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-unlink.d.ts.map
=== packages/plugins/clerk/dist/types.d.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */
/**
 * A writ's position in its lifecycle.
 *
 * Transitions:
 *   ready → active (accept)
 *   active → completed (complete)
 *   active → failed (fail)
 *   ready | active → cancelled (cancel)
 *
 * completed, failed, cancelled are terminal — no further transitions.
 */
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
/**
 * A writ document as stored in The Stacks.
 */
export interface WritDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique writ id (`w-{base36_timestamp}{hex_random}`). Sortable by creation time. */
    id: string;
    /** Writ type — must be a type declared in guild config, or a built-in type. */
    type: string;
    /** Current lifecycle status. */
    status: WritStatus;
    /** Short human-readable title. */
    title: string;
    /** Detail text. */
    body: string;
    /** Target codex name. */
    codex?: string;
    /** ISO timestamp when the writ was created. */
    createdAt: string;
    /** ISO timestamp of the last mutation. */
    updatedAt: string;
    /** ISO timestamp when the writ was accepted (transitioned to active). */
    acceptedAt?: string;
    /** ISO timestamp when the writ reached a terminal state. */
    resolvedAt?: string;
    /** Summary of how the writ resolved (set on any terminal transition). */
    resolution?: string;
}
/**
 * Request to post a new commission (create a writ).
 */
export interface PostCommissionRequest {
    /**
     * Writ type. Defaults to the guild's configured defaultType, or "mandate"
     * if no default is configured. Must be a valid declared type.
     */
    type?: string;
    /** Short human-readable title describing the work. */
    title: string;
    /** Detail text. */
    body: string;
    /** Optional target codex name. */
    codex?: string;
}
/**
 * Filters for listing writs.
 */
export interface WritFilters {
    /** Filter by status. */
    status?: WritStatus;
    /** Filter by writ type. */
    type?: string;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * A writ type entry declared in clerk config.
 */
export interface WritTypeEntry {
    /** The writ type name (e.g. "mandate", "task", "bug"). */
    name: string;
    /** Optional human-readable description of this writ type. */
    description?: string;
}
/**
 * Clerk apparatus configuration — lives under the `clerk` key in guild.json.
 */
export interface ClerkConfig {
    /** Additional writ type declarations. The built-in type "mandate" is always valid. */
    writTypes?: WritTypeEntry[];
    /** Default writ type when commission-post is called without a type (default: "mandate"). */
    defaultType?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        clerk?: ClerkConfig;
    }
}
/**
 * A link document as stored in The Stacks (clerk/links book).
 */
export interface WritLinkDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Deterministic composite key: `{sourceId}:{targetId}:{type}`. */
    id: string;
    /** The writ that is the origin of this relationship. */
    sourceId: string;
    /** The writ that is the target of this relationship. */
    targetId: string;
    /** Relationship type — an open string (e.g. "fixes", "retries", "supersedes", "duplicates"). */
    type: string;
    /** ISO timestamp when the link was created. */
    createdAt: string;
}
/**
 * Result of querying links for a writ — both directions in one response.
 */
export interface WritLinks {
    /** Links where this writ is the source (this writ → other writ). */
    outbound: WritLinkDoc[];
    /** Links where this writ is the target (other writ → this writ). */
    inbound: WritLinkDoc[];
}
/**
 * The Clerk's runtime API — retrieved via guild().apparatus<ClerkApi>('clerk').
 */
export interface ClerkApi {
    /**
     * Post a new commission, creating a writ in 'ready' status.
     * Validates the writ type against declared types in guild config.
     */
    post(request: PostCommissionRequest): Promise<WritDoc>;
    /**
     * Show a writ by id. Throws if not found.
     */
    show(id: string): Promise<WritDoc>;
    /**
     * List writs with optional filters, ordered by createdAt descending.
     */
    list(filters?: WritFilters): Promise<WritDoc[]>;
    /**
     * Count writs matching optional filters.
     */
    count(filters?: WritFilters): Promise<number>;
    /**
     * Transition a writ to a new status, optionally setting additional fields.
     * Validates that the transition is legal.
     */
    transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
    /**
     * Create a typed directional link from one writ to another.
     * Both writs must exist. Self-links are rejected. Idempotent — returns
     * the existing link if the (sourceId, targetId, type) triple already exists.
     */
    link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
    /**
     * Query all links for a writ — both outbound (this writ is the source)
     * and inbound (this writ is the target).
     */
    links(writId: string): Promise<WritLinks>;
    /**
     * Remove a link. Idempotent — no error if the link does not exist.
     */
    unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/codexes/dist/git.d.ts ===
/**
 * Lightweight git helper — typed wrapper around child_process.execFile.
 *
 * All git operations in the Scriptorium go through this module for
 * safety (no shell injection) and consistent error handling.
 */
export interface GitResult {
    stdout: string;
    stderr: string;
}
export declare class GitError extends Error {
    readonly command: string[];
    readonly stderr: string;
    readonly exitCode: number | null;
    constructor(message: string, command: string[], stderr: string, exitCode: number | null);
}
/**
 * Run a git command with typed error handling.
 *
 * @param args - git subcommand and arguments (e.g. ['clone', '--bare', url])
 * @param cwd - working directory for the command
 */
export declare function git(args: string[], cwd?: string): Promise<GitResult>;
/**
 * Resolve the default branch of a bare clone by reading HEAD.
 *
 * Returns the branch name (e.g. 'main'), not the full ref.
 */
export declare function resolveDefaultBranch(bareClonePath: string): Promise<string>;
/**
 * Get the commit SHA at the tip of a branch in a bare clone.
 */
export declare function resolveRef(bareClonePath: string, ref: string): Promise<string>;
/**
 * Check if a branch has commits ahead of another branch.
 * Returns the number of commits ahead.
 */
export declare function commitsAhead(bareClonePath: string, branch: string, base: string): Promise<number>;
//# sourceMappingURL=git.d.ts.map
=== packages/plugins/codexes/dist/index.d.ts ===
/**
 * @shardworks/codexes-apparatus — The Scriptorium.
 *
 * Guild codex management: bare clone registry, draft binding lifecycle
 * (git worktrees), sealing (ff-only merge or rebase+ff), and push.
 * Default export is the apparatus plugin.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export type { ScriptoriumApi, CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, PushRequest, SealResult, CodexesConfig, CodexesSettings, CodexConfigEntry, } from './types.ts';
export { createScriptorium } from './scriptorium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/scriptorium-core.d.ts ===
/**
 * The Scriptorium — core logic.
 *
 * Manages the codex registry (bare clones), draft binding lifecycle
 * (worktrees), and sealing (ff-only merge or rebase+ff). All git
 * operations go through the git helper for safety.
 *
 * Draft tracking is in-memory — drafts are reconstructed from
 * filesystem state at startup and maintained in memory during the
 * process lifetime.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, SealResult, PushRequest, ScriptoriumApi } from './types.ts';
export declare class ScriptoriumCore {
    private codexes;
    private drafts;
    private maxMergeRetries;
    private draftRoot;
    private get home();
    private codexesDir;
    private bareClonePath;
    private draftWorktreePath;
    start(): void;
    /**
     * Load a codex from config. Checks for existing bare clone;
     * initiates background clone if missing.
     */
    private loadCodex;
    /**
     * Reconcile in-memory draft tracking with filesystem state.
     * Scans the worktree directories and rebuilds the draft map.
     */
    private reconcileDrafts;
    /**
     * Ensure a codex's bare clone is ready. Blocks if a background
     * clone is in progress. Throws if the codex is unknown or clone failed.
     */
    private ensureReady;
    private performClone;
    /**
     * Advance refs/heads/<branch> to the remote's position if the remote is
     * strictly ahead of the local sealed binding.
     *
     * This handles commits pushed to the remote outside the Scriptorium:
     * if the remote has advanced past the local sealed binding, sealing must
     * rebase the draft onto the remote position — not the stale local one.
     *
     * If the local sealed binding is already ahead of (or equal to) the remote
     * (e.g. contains unpushed seals from contention scenarios), it is kept.
     */
    private advanceToRemote;
    private performFetch;
    createApi(): ScriptoriumApi;
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    list(): Promise<CodexRecord[]>;
    show(name: string): Promise<CodexDetail>;
    remove(name: string): Promise<void>;
    fetchCodex(name: string): Promise<void>;
    push(request: PushRequest): Promise<void>;
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    seal(request: SealRequest): Promise<SealResult>;
    private draftsForCodex;
    private toCodexRecord;
}
//# sourceMappingURL=scriptorium-core.d.ts.map
=== packages/plugins/codexes/dist/scriptorium.d.ts ===
/**
 * The Scriptorium — apparatus implementation.
 *
 * Wires together the ScriptoriumCore (git operations, draft lifecycle)
 * and exposes the ScriptoriumApi as the `provides` object. Tools are
 * contributed via supportKit.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createScriptorium(): Plugin;
//# sourceMappingURL=scriptorium.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-add.d.ts ===
/**
 * codex-add tool — register an existing git repository as a guild codex.
 *
 * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the entry
 * to guild.json. Blocks until the clone completes.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    remoteUrl: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-add.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-list.d.ts ===
/**
 * codex-list tool — list all registered codexes.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=codex-list.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-push.d.ts ===
/**
 * codex-push tool — push a branch to the codex's remote.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=codex-push.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-remove.d.ts ===
/**
 * codex-remove tool — remove a codex from the guild.
 *
 * Abandons all active drafts, removes the bare clone, and removes
 * the entry from guild.json. Does NOT delete the remote repository.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-remove.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-show.d.ts ===
/**
 * codex-show tool — show details of a specific codex including active drafts.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-show.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-abandon.d.ts ===
/**
 * draft-abandon tool — abandon a draft binding.
 *
 * Removes the git worktree and branch. Fails if the draft has
 * unsealed inscriptions unless force: true.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-abandon.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-list.d.ts ===
/**
 * draft-list tool — list active draft bindings.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-list.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-open.d.ts ===
/**
 * draft-open tool — open a draft binding on a codex.
 *
 * Creates an isolated git worktree for concurrent work. Fetches from
 * the remote before branching to ensure freshness.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
    startPoint: z.ZodOptional<z.ZodString>;
    associatedWith: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-open.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-seal.d.ts ===
/**
 * draft-seal tool — seal a draft into the codex.
 *
 * Incorporates the draft's inscriptions into the sealed binding via
 * ff-only merge. If ff is not possible, rebases and retries. Fails
 * hard on conflicts — no merge commits, no auto-resolution.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    sourceBranch: z.ZodString;
    targetBranch: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    keepDraft: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-seal.d.ts.map
=== packages/plugins/codexes/dist/tools/index.d.ts ===
/**
 * Scriptorium tool re-exports.
 */
export { default as codexAdd } from './codex-add.ts';
export { default as codexList } from './codex-list.ts';
export { default as codexShow } from './codex-show.ts';
export { default as codexRemove } from './codex-remove.ts';
export { default as codexPush } from './codex-push.ts';
export { default as draftOpen } from './draft-open.ts';
export { default as draftList } from './draft-list.ts';
export { default as draftAbandon } from './draft-abandon.ts';
export { default as draftSeal } from './draft-seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/types.d.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export interface CodexRecord {
    /** Codex name — unique within the guild. */
    name: string;
    /** Remote repository URL. */
    remoteUrl: string;
    /** Whether the bare clone exists and is healthy. */
    cloneStatus: 'ready' | 'cloning' | 'error';
    /** Number of active drafts for this codex. */
    activeDrafts: number;
}
export interface CodexDetail extends CodexRecord {
    /** Default branch name on the remote (e.g. 'main'). */
    defaultBranch: string;
    /** Timestamp of last fetch. */
    lastFetched: string | null;
    /** Active drafts for this codex. */
    drafts: DraftRecord[];
}
export interface DraftRecord {
    /** Unique draft id (ULID). */
    id: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for this draft. */
    branch: string;
    /** Absolute filesystem path to the draft's working directory (git worktree). */
    path: string;
    /** When the draft was opened. */
    createdAt: string;
    /** Optional association — e.g. a writ id. */
    associatedWith?: string;
}
export interface OpenDraftRequest {
    /** Codex to open the draft for. */
    codexName: string;
    /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
    branch?: string;
    /**
     * Starting point — branch, tag, or commit to branch from.
     * Default: remote HEAD (the codex's default branch).
     */
    startPoint?: string;
    /** Optional association metadata (e.g. writ id). */
    associatedWith?: string;
}
export interface AbandonDraftRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch name of the draft to abandon. */
    branch: string;
    /** Force abandonment even if the draft has unsealed inscriptions. */
    force?: boolean;
}
export interface SealRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch to seal (the draft's branch). */
    sourceBranch: string;
    /** Target branch (the sealed binding). Default: codex's default branch. */
    targetBranch?: string;
    /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
    maxRetries?: number;
    /** Keep the draft after successful sealing. Default: false. */
    keepDraft?: boolean;
}
export interface SealResult {
    /** Whether sealing succeeded. */
    success: boolean;
    /** Strategy used: 'fast-forward' or 'rebase'. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts needed (0 = first try). */
    retries: number;
    /** The commit SHA at head of target after sealing. */
    sealedCommit: string;
    /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
    inscriptionsSealed: number;
}
export interface PushRequest {
    /** Codex name. */
    codexName: string;
    /**
     * Branch to push. Default: codex's default branch.
     */
    branch?: string;
}
export interface CodexesConfig {
    settings?: CodexesSettings;
    registered?: Record<string, CodexConfigEntry>;
}
export interface CodexesSettings {
    /** Max rebase-retry attempts during sealing under contention. Default: 3. */
    maxMergeRetries?: number;
    /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
    draftRoot?: string;
}
export interface CodexConfigEntry {
    /** The remote URL of the codex's git repository. */
    remoteUrl: string;
}
export interface ScriptoriumApi {
    /**
     * Register an existing repository as a codex.
     * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
     * entry to the `codexes` config section in `guild.json`.
     * Blocks until the clone completes.
     */
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    /**
     * List all registered codexes with their status.
     */
    list(): Promise<CodexRecord[]>;
    /**
     * Show details for a single codex, including active drafts.
     */
    show(name: string): Promise<CodexDetail>;
    /**
     * Remove a codex from the guild. Abandons all active drafts,
     * removes the bare clone from `.nexus/codexes/`, and removes the
     * entry from `guild.json`. Does NOT delete the remote repository.
     */
    remove(name: string): Promise<void>;
    /**
     * Fetch latest refs from the remote for a codex's bare clone.
     * Called automatically before draft creation and sealing; can
     * also be invoked manually.
     */
    fetch(name: string): Promise<void>;
    /**
     * Push a branch to the codex's remote.
     * Pushes the specified branch (default: codex's default branch)
     * to the bare clone's configured remote. Does not force-push.
     */
    push(request: PushRequest): Promise<void>;
    /**
     * Open a draft binding on a codex.
     *
     * Creates a new git branch from `startPoint` (default: the codex's
     * sealed binding) and checks it out as an isolated worktree under
     * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
     * before branching to ensure freshness.
     *
     * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
     * Rejects with a clear error if a draft with the same branch name
     * already exists for this codex.
     */
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    /**
     * List active drafts, optionally filtered by codex.
     */
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    /**
     * Abandon a draft — remove the draft's worktree and git branch.
     * Fails if the draft has unsealed inscriptions unless `force: true`.
     * The inscriptions persist in the git reflog but the draft is no
     * longer active.
     */
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    /**
     * Seal a draft — incorporate its inscriptions into the sealed binding.
     *
     * Git strategy: fast-forward merge only. If ff is not possible,
     * rebases the draft branch onto the target and retries. Retries up
     * to `maxRetries` times (default: from settings.maxMergeRetries)
     * to handle contention from concurrent sealing. Fails hard if the
     * rebase produces conflicts — no auto-resolution, no merge commits.
     *
     * On success, abandons the draft (unless `keepDraft: true`).
     */
    seal(request: SealRequest): Promise<SealResult>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/dispatch/dist/dispatch.d.ts ===
/**
 * The Dispatch — interim work runner.
 *
 * Bridges the Clerk (which tracks obligations) and the session machinery
 * (which runs animas). Finds the oldest ready writ and executes it:
 * opens a draft binding, composes context, launches a session, and handles
 * the aftermath (seal the draft, transition the writ).
 *
 * This apparatus is temporary rigging — designed to be retired when the
 * full rigging system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Dispatch apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['clerk', 'codexes', 'animator']`
 * - `recommends: ['loom']` — used indirectly via Animator.summon()
 * - `provides: DispatchApi` — the dispatch API
 * - `supportKit` — contributes the `dispatch-next` tool
 */
export declare function createDispatch(): Plugin;
//# sourceMappingURL=dispatch.d.ts.map
=== packages/plugins/dispatch/dist/index.d.ts ===
/**
 * @shardworks/dispatch-apparatus — The Dispatch.
 *
 * Interim work runner: finds the oldest ready writ and executes it through
 * the guild's session machinery. Opens a draft binding on the target codex,
 * summons an anima via The Animator, and handles the aftermath (seal the
 * draft, transition the writ). Disposable — retired when the full rigging
 * system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export { type DispatchApi, type DispatchRequest, type DispatchResult, } from './types.ts';
export { createDispatch } from './dispatch.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/tools/dispatch-next.d.ts ===
/**
 * dispatch-next tool — find the oldest ready writ and dispatch it.
 *
 * The primary entry point for running guild work. Picks the oldest ready
 * writ (FIFO order), opens a draft on its codex (if any), summons an anima
 * to fulfill it, and transitions the writ to completed or failed based on
 * the session outcome.
 *
 * Usage:
 *   nsg dispatch-next
 *   nsg dispatch-next --role scribe
 *   nsg dispatch-next --dry-run
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    role: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export default _default;
//# sourceMappingURL=dispatch-next.d.ts.map
=== packages/plugins/dispatch/dist/tools/index.d.ts ===
/**
 * Dispatch tool re-exports.
 */
export { default as dispatchNext } from './dispatch-next.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/types.d.ts ===
/**
 * The Dispatch — public types.
 *
 * These types form the contract between The Dispatch apparatus and all
 * callers (CLI, clockworks). No implementation details.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export interface DispatchApi {
    /**
     * Find the oldest ready writ and execute it.
     *
     * The full dispatch lifecycle:
     *   1. Query the Clerk for the oldest ready writ
     *   2. Transition the writ to active
     *   3. Open a draft binding on the writ's codex (if specified)
     *   4. Summon an anima session with the writ context as prompt
     *   5. Wait for session completion
     *   6. On success: seal the draft, push, transition writ to completed
     *   7. On failure: abandon the draft, transition writ to failed
     *
     * Returns null if no ready writs exist.
     *
     * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
     * skipped — the session runs in the guild home directory with
     * no codex binding.
     */
    next(request?: DispatchRequest): Promise<DispatchResult | null>;
}
export interface DispatchRequest {
    /** Role to summon. Default: 'artificer'. */
    role?: string;
    /** If true, find and report the writ but don't dispatch. */
    dryRun?: boolean;
}
export interface DispatchResult {
    /** The writ that was dispatched. */
    writId: string;
    /** The session id (from the Animator). Absent if dryRun. */
    sessionId?: string;
    /** Terminal writ status after dispatch. Absent if dryRun. */
    outcome?: 'completed' | 'failed';
    /** Resolution text set on the writ. Absent if dryRun. */
    resolution?: string;
    /** Whether this was a dry run. */
    dryRun: boolean;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/fabricator/dist/fabricator.d.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Spider on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */
import type { Plugin } from '@shardworks/nexus-core';
/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
    /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
    engineId: string;
    /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
    upstream: Record<string, unknown>;
}
/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 */
export type EngineRunResult = {
    status: 'completed';
    yields: unknown;
} | {
    status: 'launched';
    sessionId: string;
};
/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
    /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
    id: string;
    /**
     * Execute this engine.
     *
     * @param givens   — the engine's declared inputs, assembled by the Spider.
     * @param context  — minimal execution context: engine id and upstream yields.
     */
    run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
    /**
     * Assemble yields from a completed session.
     *
     * Called by the Spider's collect step when a quick engine's session
     * reaches a terminal state. The engine looks up whatever it needs
     * via guild() — same dependency pattern as run().
     *
     * @param sessionId — the session to collect yields from (primary input).
     * @param givens    — same givens that were passed to run().
     * @param context   — same execution context that was passed to run().
     *
     * If not defined, the Spider uses a generic default:
     *   { sessionId, sessionStatus, output? }
     *
     * Only relevant for quick engines (those that return { status: 'launched' }).
     * Clockwork engines return yields directly from run().
     */
    collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
    /**
     * Look up an engine design by ID.
     * Returns the design if registered, undefined otherwise.
     */
    getEngineDesign(id: string): EngineDesign | undefined;
}
/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export declare function createFabricator(): Plugin;
//# sourceMappingURL=fabricator.d.ts.map
=== packages/plugins/fabricator/dist/index.d.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */
export type { EngineDesign, EngineRunContext, EngineRunResult, } from './fabricator.ts';
export type { FabricatorApi } from './fabricator.ts';
export { createFabricator } from './fabricator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/index.d.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */
export { type LoomApi, type WeaveRequest, type AnimaWeave, type LoomConfig, type RoleDefinition, createLoom, } from './loom.ts';
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        loom?: LoomConfig;
    }
}
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/loom.d.ts ===
/**
 * The Loom — session context composition apparatus.
 *
 * The Loom owns system prompt assembly. Given a role name, it produces
 * an AnimaWeave — the composed identity context that The Animator uses
 * to launch a session. The work prompt (what the anima should do) is
 * not the Loom's concern; it bypasses the Loom and goes directly to
 * the Animator.
 *
 * The Loom resolves the role's permission grants from guild.json, then
 * calls the Instrumentarium to resolve the permission-gated tool set.
 * Tools are returned on the AnimaWeave so the Animator can pass them
 * to the session provider for MCP server configuration.
 *
 * See: docs/specification.md (loom)
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
export interface WeaveRequest {
    /**
     * The role to weave context for (e.g. 'artificer', 'scribe').
     *
     * When provided, the Loom resolves role → permissions from guild.json,
     * then calls the Instrumentarium to resolve the permission-gated tool set.
     * Tools are returned on the AnimaWeave.
     *
     * When omitted, no tool resolution occurs — the AnimaWeave has no tools.
     */
    role?: string;
}
/**
 * The output of The Loom's weave() — the composed anima identity context.
 *
 * Contains the system prompt (produced by the Loom from the anima's
 * identity layers) and the resolved tool set for the role. The work
 * prompt is not part of the weave — it goes directly to the Animator.
 */
export interface AnimaWeave {
    /**
     * The system prompt for the AI process. Composed from guild charter,
     * tool instructions, and role instructions. Undefined when no
     * composition layers produce content.
     */
    systemPrompt?: string;
    /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
    tools?: ResolvedTool[];
    /** Environment variables derived from role identity (e.g. git author/committer). */
    environment?: Record<string, string>;
}
/** The Loom's public API, exposed via `provides`. */
export interface LoomApi {
    /**
     * Weave an anima's session context.
     *
     * Given a role name, produces an AnimaWeave containing the composed
     * system prompt and the resolved tool set. The system prompt is assembled
     * from the guild charter, tool instructions (for the resolved tool set),
     * and role instructions — in that order.
     *
     * Tool resolution is active: if a role is provided and the Instrumentarium
     * is installed, the Loom resolves role → permissions → tools.
     */
    weave(request: WeaveRequest): Promise<AnimaWeave>;
}
/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
    /** Permission grants in `plugin:level` format. */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. Default: false.
     */
    strict?: boolean;
}
/** Loom configuration from guild.json. */
export interface LoomConfig {
    /** Role definitions keyed by role name. */
    roles?: Record<string, RoleDefinition>;
}
/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export declare function createLoom(): Plugin;
//# sourceMappingURL=loom.d.ts.map
=== packages/plugins/parlour/dist/index.d.ts ===
/**
 * @shardworks/parlour-apparatus — The Parlour.
 *
 * Multi-turn conversation management: creates conversations, registers
 * participants, orchestrates turns (with streaming), enforces turn limits,
 * and ends conversations. Delegates session launch to The Animator and
 * context composition to The Loom.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
export { type ParlourApi, type ConversationDoc, type TurnDoc, type ParticipantRecord, type Participant, type CreateConversationRequest, type CreateConversationResult, type ParticipantDeclaration, type TakeTurnRequest, type TurnResult, type ConversationChunk, type ConversationSummary, type ConversationDetail, type TurnSummary, type ListConversationsOptions, } from './types.ts';
export { createParlour } from './parlour.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/parlour.d.ts ===
/**
 * The Parlour — multi-turn conversation management apparatus.
 *
 * Manages two kinds of conversation:
 * - consult: a human talks to an anima
 * - convene: multiple animas hold a structured dialogue
 *
 * The Parlour orchestrates turns — it decides when and for whom to call
 * The Animator, and tracks conversation state in The Stacks. It does not
 * launch sessions itself (delegates to The Animator) or assemble prompts
 * (delegates to The Loom).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Parlour apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks', 'animator', 'loom']` — conversation orchestration
 * - `provides: ParlourApi` — the conversation management API
 * - `supportKit` — contributes `conversations` + `turns` books + management tools
 */
export declare function createParlour(): Plugin;
//# sourceMappingURL=parlour.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-end.d.ts ===
/**
 * conversation-end tool — end an active conversation.
 *
 * Sets conversation status to 'concluded' or 'abandoned'.
 * Idempotent — no error if the conversation is already ended.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    reason: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        concluded: "concluded";
        abandoned: "abandoned";
    }>>>;
}>;
export default _default;
//# sourceMappingURL=conversation-end.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-list.d.ts ===
/**
 * conversation-list tool — list conversations with optional filters.
 *
 * Queries The Parlour's conversations via the ParlourApi.
 * Returns conversation summaries ordered by createdAt descending (newest first).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        concluded: "concluded";
        abandoned: "abandoned";
    }>>;
    kind: z.ZodOptional<z.ZodEnum<{
        consult: "consult";
        convene: "convene";
    }>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=conversation-list.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-show.d.ts ===
/**
 * conversation-show tool — show full detail for a conversation.
 *
 * Returns the complete conversation record including all turns,
 * participant list, and aggregate cost.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=conversation-show.d.ts.map
=== packages/plugins/parlour/dist/tools/index.d.ts ===
/**
 * Parlour tool re-exports.
 */
export { default as conversationList } from './conversation-list.ts';
export { default as conversationShow } from './conversation-show.ts';
export { default as conversationEnd } from './conversation-end.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/types.d.ts ===
/**
 * The Parlour — public types.
 *
 * These types form the contract between The Parlour apparatus and all
 * callers (CLI consult command, clockworks convene handlers, etc.).
 * No implementation details.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { SessionResult, SessionChunk } from '@shardworks/animator-apparatus';
export interface ConversationDoc {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    eventId: string | null;
    participants: ParticipantRecord[];
    /** Stored once at creation — all turns must use the same cwd for --resume. */
    cwd: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface ParticipantRecord {
    /** Stable participant id (generated at creation). */
    id: string;
    kind: 'anima' | 'human';
    name: string;
    /** Anima id, resolved at creation time. Null for human participants. */
    animaId: string | null;
    /**
     * Provider session id for --resume. Updated after each turn so
     * the next turn can continue the provider's conversation context.
     */
    providerSessionId: string | null;
}
/**
 * Internal turn record stored in the turns book.
 * One entry per takeTurn() call — both human and anima turns.
 */
export interface TurnDoc {
    id: string;
    conversationId: string;
    turnNumber: number;
    participantId: string;
    participantName: string;
    participantKind: 'anima' | 'human';
    /** The message passed to this turn (human message or inter-turn context). */
    message: string | null;
    /** Session id from The Animator (null for human turns). */
    sessionId: string | null;
    startedAt: string;
    endedAt: string | null;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface CreateConversationRequest {
    /** Conversation kind. */
    kind: 'consult' | 'convene';
    /** Seed topic or prompt. Used as the initial message for the first turn. */
    topic?: string;
    /** Maximum allowed turns (anima turns only). Null = unlimited. */
    turnLimit?: number;
    /** Participants in the conversation. */
    participants: ParticipantDeclaration[];
    /** Working directory — persists for the conversation's lifetime. */
    cwd: string;
    /** Triggering event id, for conversations started by clockworks. */
    eventId?: string;
}
export interface ParticipantDeclaration {
    kind: 'anima' | 'human';
    /** Display name. For anima participants, this is the anima name
     *  used to resolve identity via The Loom at turn time. */
    name: string;
}
export interface CreateConversationResult {
    conversationId: string;
    participants: Participant[];
}
export interface Participant {
    id: string;
    name: string;
    kind: 'anima' | 'human';
}
export interface TakeTurnRequest {
    conversationId: string;
    participantId: string;
    /** The message for this turn. For consult: the human's message.
     *  For convene: typically assembled by the caller, or omitted to
     *  let The Parlour assemble it automatically. */
    message?: string;
}
export interface TurnResult {
    /** The Animator's session result for this turn. Null for human turns. */
    sessionResult: SessionResult | null;
    /** Turn number within the conversation (1-indexed). */
    turnNumber: number;
    /** Whether the conversation is still active after this turn. */
    conversationActive: boolean;
}
/** A chunk of output from a conversation turn. */
export type ConversationChunk = SessionChunk | {
    type: 'turn_complete';
    turnNumber: number;
    costUsd?: number;
};
export interface ConversationSummary {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    participants: Participant[];
    /** Computed from turn records. */
    turnCount: number;
    /** Aggregate cost across all turns. */
    totalCostUsd: number;
}
export interface ConversationDetail extends ConversationSummary {
    turns: TurnSummary[];
}
export interface TurnSummary {
    sessionId: string | null;
    turnNumber: number;
    participant: string;
    message: string | null;
    startedAt: string;
    endedAt: string | null;
}
export interface ListConversationsOptions {
    status?: 'active' | 'concluded' | 'abandoned';
    kind?: 'consult' | 'convene';
    limit?: number;
}
export interface ParlourApi {
    /**
     * Create a new conversation.
     *
     * Sets up conversation and participant records. Does NOT take a first
     * turn — that's a separate call to takeTurn().
     */
    create(request: CreateConversationRequest): Promise<CreateConversationResult>;
    /**
     * Take a turn in a conversation.
     *
     * For anima participants: weaves context via The Loom, assembles the
     * inter-turn message, and calls The Animator to run a session. Returns
     * the session result. For human participants: records the message as
     * context for the next turn (no session launched).
     *
     * Throws if the conversation is not active or the turn limit is reached.
     */
    takeTurn(request: TakeTurnRequest): Promise<TurnResult>;
    /**
     * Take a turn with streaming output.
     *
     * Same as takeTurn(), but yields ConversationChunks as the session
     * produces output. Includes a turn_complete chunk at the end.
     */
    takeTurnStreaming(request: TakeTurnRequest): {
        chunks: AsyncIterable<ConversationChunk>;
        result: Promise<TurnResult>;
    };
    /**
     * Get the next participant in a conversation.
     *
     * For convene: returns the next anima in round-robin order.
     * For consult: returns the anima participant (human turns are implicit).
     * Returns null if the conversation is not active or the turn limit is reached.
     */
    nextParticipant(conversationId: string): Promise<Participant | null>;
    /**
     * End a conversation.
     *
     * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
     * disconnect). Idempotent — no error if already ended.
     */
    end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;
    /**
     * List conversations with optional filters.
     */
    list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
    /**
     * Show full detail for a conversation.
     */
    show(conversationId: string): Promise<ConversationDetail | null>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/spider/dist/engines/draft.d.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const draftEngine: EngineDesign;
export default draftEngine;
//# sourceMappingURL=draft.d.ts.map
=== packages/plugins/spider/dist/engines/implement.d.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Spider's collect step can poll for completion on subsequent walks.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const implementEngine: EngineDesign;
export default implementEngine;
//# sourceMappingURL=implement.d.ts.map
=== packages/plugins/spider/dist/engines/index.d.ts ===
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/engines/review.d.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can call this engine's collect() method on subsequent crawls.
 *
 * Collect method:
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviewEngine: EngineDesign;
export default reviewEngine;
//# sourceMappingURL=review.d.ts.map
=== packages/plugins/spider/dist/engines/revise.d.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can store ReviseYields on completion.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviseEngine: EngineDesign;
export default reviseEngine;
//# sourceMappingURL=revise.d.ts.map
=== packages/plugins/spider/dist/engines/seal.d.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const sealEngine: EngineDesign;
export default sealEngine;
//# sourceMappingURL=seal.d.ts.map
=== packages/plugins/spider/dist/index.d.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */
export type { EngineStatus, EngineInstance, RigStatus, RigDoc, RigFilters, CrawlResult, SpiderApi, SpiderConfig, DraftYields, SealYields, } from './types.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/spider.d.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
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
 * See: docs/architecture/apparatus/spider.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createSpider(): Plugin;
//# sourceMappingURL=spider.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-continual.d.ts ===
/**
 * crawl-continual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval. By default the loop runs
 * indefinitely; pass a positive maxIdleCycles to enable auto-stop after
 * that many consecutive idle cycles.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    maxIdleCycles: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pollIntervalMs: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=crawl-continual.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-one.d.ts ===
/**
 * crawl-one tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=crawl-one.d.ts.map
=== packages/plugins/spider/dist/tools/index.d.ts ===
export { default as crawlOneTool } from './crawl-one.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
export { default as rigShowTool } from './rig-show.ts';
export { default as rigListTool } from './rig-list.ts';
export { default as rigForWritTool } from './rig-for-writ.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/tools/rig-for-writ.d.ts ===
/**
 * rig-for-writ tool — find the rig for a given writ.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    writId: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-for-writ.d.ts.map
=== packages/plugins/spider/dist/tools/rig-list.d.ts ===
/**
 * rig-list tool — list rigs with optional filters.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        running: "running";
    }>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=rig-list.d.ts.map
=== packages/plugins/spider/dist/tools/rig-show.d.ts ===
/**
 * rig-show tool — retrieve a rig by id.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-show.d.ts.map
=== packages/plugins/spider/dist/types.d.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
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
export type RigStatus = 'running' | 'completed' | 'failed';
/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
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
    /** ISO timestamp when the rig was created. */
    createdAt: string;
}
/**
 * Filters for listing rigs.
 */
export interface RigFilters {
    /** Filter by rig status. */
    status?: RigStatus;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult = {
    action: 'engine-completed';
    rigId: string;
    engineId: string;
} | {
    action: 'engine-started';
    rigId: string;
    engineId: string;
} | {
    action: 'rig-spawned';
    rigId: string;
    writId: string;
} | {
    action: 'rig-completed';
    rigId: string;
    writId: string;
    outcome: 'completed' | 'failed';
};
/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
    /**
     * Execute one step of the crawl loop.
     *
     * Priority ordering: collect > run > spawn.
     * Returns null when no work is available.
     */
    crawl(): Promise<CrawlResult | null>;
    /**
     * Show a rig by id. Throws if not found.
     */
    show(id: string): Promise<RigDoc>;
    /**
     * List rigs with optional filters, ordered by createdAt descending.
     */
    list(filters?: RigFilters): Promise<RigDoc[]>;
    /**
     * Find the rig for a given writ. Returns null if no rig exists.
     */
    forWrit(writId: string): Promise<RigDoc | null>;
}
/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
    /**
     * Role to summon for quick engine sessions.
     * Default: 'artificer'.
     */
    role?: string;
    /**
     * Polling interval for crawlContinual tool (milliseconds).
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
/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
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
 * Set by the Spider's collect step when the Animator session completes.
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
 * Assembled by the Spider's collect step from session.output and session.metadata.
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
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        spider?: SpiderConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/stacks/dist/backend.d.ts ===
/**
 * StacksBackend — persistence abstraction for The Stacks.
 *
 * All SQLite-specific types stay behind this interface. The apparatus
 * and all consuming plugins depend only on these types. Backend
 * implementations (SQLite, in-memory) implement this interface.
 *
 * See: docs/specification.md §8
 */
import type { BookEntry, BookSchema, Scalar } from './types.ts';
export interface BookRef {
    ownerId: string;
    book: string;
}
export interface BackendOptions {
    home: string;
}
export interface PutResult {
    created: boolean;
    prev?: BookEntry;
}
export interface PatchResult {
    entry: BookEntry;
    prev: BookEntry;
}
export interface DeleteResult {
    found: boolean;
    prev?: BookEntry;
}
export type InternalCondition = {
    field: string;
    op: 'eq' | 'neq';
    value: Scalar;
} | {
    field: string;
    op: 'gt' | 'gte' | 'lt' | 'lte';
    value: number | string;
} | {
    field: string;
    op: 'like';
    value: string;
} | {
    field: string;
    op: 'in';
    values: Scalar[];
} | {
    field: string;
    op: 'isNull' | 'isNotNull';
};
export interface InternalQuery {
    where?: InternalCondition[];
    orderBy?: Array<{
        field: string;
        dir: 'asc' | 'desc';
    }>;
    limit?: number;
    offset?: number;
}
/** Narrowed query type for count() — conditions only, no pagination. */
export interface CountQuery {
    where?: InternalCondition[];
}
export interface BackendTransaction {
    put(ref: BookRef, entry: BookEntry, opts?: {
        withPrev: boolean;
    }): PutResult;
    patch(ref: BookRef, id: string, fields: Record<string, unknown>): PatchResult;
    delete(ref: BookRef, id: string, opts?: {
        withPrev: boolean;
    }): DeleteResult;
    get(ref: BookRef, id: string): BookEntry | null;
    find(ref: BookRef, query: InternalQuery): BookEntry[];
    count(ref: BookRef, query: CountQuery): number;
    commit(): void;
    rollback(): void;
}
export interface StacksBackend {
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=backend.d.ts.map
=== packages/plugins/stacks/dist/cdc.d.ts ===
/**
 * CDC registry — handler registration, event buffering, and coalescing.
 *
 * Two-phase execution model:
 * - Phase 1 (failOnError: true):  runs INSIDE the transaction
 * - Phase 2 (failOnError: false): runs AFTER commit with coalesced events
 *
 * See: docs/specification.md (stacks § CDC)
 */
import type { BookEntry, ChangeEvent, ChangeHandler, WatchOptions } from './types.ts';
interface WatcherEntry {
    handler: ChangeHandler;
    failOnError: boolean;
}
export interface BufferedEvent {
    ref: string;
    ownerId: string;
    book: string;
    docId: string;
    type: 'create' | 'update' | 'delete';
    entry?: BookEntry;
    prev?: BookEntry;
}
/**
 * Coalesce buffered events per-document.
 *
 * Rules:
 *   create                    → create (final state)
 *   create → update(s)        → create (final state)
 *   create → delete           → (no event)
 *   update(s)                 → update (first prev, final state)
 *   update(s) → delete        → delete (first prev)
 *   delete                    → delete (prev)
 */
export declare function coalesceEvents(buffer: BufferedEvent[]): ChangeEvent<BookEntry>[];
export declare class CdcRegistry {
    private readonly watchers;
    private locked;
    /**
     * Register a CDC handler for a book.
     * Must be called before any writes (enforced by `locked` flag).
     */
    watch(ownerId: string, bookName: string, handler: ChangeHandler, options?: WatchOptions): void;
    /** Mark the registry as locked — called on first write. */
    lock(): void;
    /** Check if any handlers are registered for a book (controls pre-read). */
    hasWatchers(ownerId: string, bookName: string): boolean;
    /** Get Phase 1 handlers (failOnError: true) for a book. */
    getPhase1Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /** Get Phase 2 handlers (failOnError: false) for a book. */
    getPhase2Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /**
     * Fire Phase 1 handlers for a single event. Throws on handler error
     * (caller is responsible for rolling back the transaction).
     */
    firePhase1(ownerId: string, bookName: string, event: ChangeEvent<BookEntry>): Promise<void>;
    /**
     * Fire Phase 2 handlers for coalesced events. Errors are logged, not thrown.
     */
    firePhase2(events: ChangeEvent<BookEntry>[]): Promise<void>;
}
export {};
//# sourceMappingURL=cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/helpers.d.ts ===
/**
 * Conformance test helpers — create a StacksApi from a bare backend,
 * bypassing the guild startup machinery.
 *
 * Each test gets a fresh backend + API instance. No state leaks.
 */
import type { StacksBackend, BookRef } from '../backend.ts';
import type { BookEntry, StacksApi, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, WatchOptions } from '../types.ts';
export interface TestStacks {
    stacks: StacksApi;
    backend: StacksBackend;
    /** Ensure a book exists (bypasses kit contribution flow). */
    ensureBook(ownerId: string, bookName: string, schema?: {
        indexes?: (string | string[])[];
    }): void;
}
export declare function createTestStacks(backendFactory: () => StacksBackend): TestStacks;
export declare function seedDocument(backend: StacksBackend, ref: BookRef, entry: BookEntry): void;
export declare function collectEvents<T extends BookEntry = BookEntry>(stacks: StacksApi, ownerId: string, bookName: string, options?: WatchOptions): ChangeEvent<T>[];
export interface PutCall {
    ref: BookRef;
    entry: BookEntry;
    withPrev: boolean;
}
/**
 * Wraps a backend factory to record put() calls on transactions,
 * so tests can verify whether withPrev was requested.
 */
export declare function spyingBackendFactory(factory: () => StacksBackend): {
    factory: () => StacksBackend;
    putCalls: PutCall[];
};
/** Assert the event is a `create` and check its fields. */
export declare function assertCreateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is CreateEvent<BookEntry>;
/** Assert the event is an `update` and check its fields. */
export declare function assertUpdateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is UpdateEvent<BookEntry>;
/** Assert the event is a `delete` and check its fields. */
export declare function assertDeleteEvent(event: ChangeEvent<BookEntry>, expected: {
    id: string;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is DeleteEvent<BookEntry>;
export declare const OWNER = "test-owner";
export declare const BOOK = "testbook";
export declare const REF: BookRef;
//# sourceMappingURL=helpers.d.ts.map
=== packages/plugins/stacks/dist/conformance/suite.d.ts ===
/**
 * Stacks conformance test suite — parametric registration.
 *
 * Exports a single function that registers all conformance tiers
 * against a given backend factory. Each backend test file calls
 * this with its own factory function.
 */
import type { StacksBackend } from '../backend.ts';
export declare function runConformanceSuite(suiteName: string, backendFactory: () => StacksBackend): void;
//# sourceMappingURL=suite.d.ts.map
=== packages/plugins/stacks/dist/conformance/testable-stacks.d.ts ===
/**
 * Testable Stacks — a minimal StacksApi wired directly to a backend,
 * without requiring the guild startup machinery.
 *
 * Uses the same StacksCore as the production apparatus, ensuring
 * behavioral identity by construction.
 */
import type { StacksBackend } from '../backend.ts';
import type { StacksApi } from '../types.ts';
export declare function createTestableStacks(backend: StacksBackend): StacksApi;
//# sourceMappingURL=testable-stacks.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier1-data-integrity.d.ts ===
/**
 * Tier 1 — Data Integrity conformance tests.
 *
 * Failures here mean data loss or corruption. Non-negotiable.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier1DataIntegrity(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier1-data-integrity.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2-cdc.d.ts ===
/**
 * Tier 2 — CDC Behavioral Correctness conformance tests.
 *
 * Failures here mean the CDC contract is violated.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier2Cdc(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2-cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2.5-transactions.d.ts ===
/**
 * Tier 2.5 — Transaction Semantics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier25Transactions(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2.5-transactions.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier3-queries.d.ts ===
/**
 * Tier 3 — Query Correctness conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier3Queries(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier3-queries.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier4-edge-cases.d.ts ===
/**
 * Tier 4 — Edge Cases and Ergonomics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier4EdgeCases(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier4-edge-cases.d.ts.map
=== packages/plugins/stacks/dist/field-utils.d.ts ===
/**
 * Shared field access and order-by utilities.
 *
 * Used by both the apparatus-level logic (stacks-core.ts) and the
 * memory backend (memory-backend.ts). Kept in a minimal module with
 * no heavy dependencies.
 */
import type { BookEntry, OrderBy } from './types.ts';
/**
 * Access a potentially nested field via dot-notation (e.g. "parent.id").
 */
export declare function getNestedField(obj: BookEntry | Record<string, unknown>, field: string): unknown;
/**
 * Normalize the public OrderBy type into a uniform array of { field, dir }.
 *
 * Does NOT validate field names — callers are responsible for ensuring
 * fields have already been validated (e.g. via translateQuery) before
 * reaching this point. translateQuery calls validateFieldName after
 * normalizing because it sits at the untrusted-input boundary.
 */
export declare function normalizeOrderBy(orderBy: OrderBy): Array<{
    field: string;
    dir: 'asc' | 'desc';
}>;
/**
 * Compare two entries by a list of order-by entries.
 *
 * Shared by the memory backend's sortEntries and the apparatus-level
 * OR query re-sort in stacks-core.ts. Null values sort before non-null
 * in ascending order, after non-null in descending order.
 */
export declare function compareByOrderEntries(a: BookEntry | Record<string, unknown>, b: BookEntry | Record<string, unknown>, orderEntries: Array<{
    field: string;
    dir: 'asc' | 'desc';
}>): number;
//# sourceMappingURL=field-utils.d.ts.map
=== packages/plugins/stacks/dist/index.d.ts ===
/**
 * @shardworks/stacks-apparatus — The Stacks apparatus.
 *
 * Guild persistence layer: NoSQL document store with CDC, transactions,
 * and swappable backend. Default export is the apparatus plugin.
 *
 * See: docs/specification.md
 */
export type { StacksConfig, BookEntry, BookSchema, Book, ReadOnlyBook, Scalar, WhereCondition, WhereClause, OrderEntry, OrderBy, Pagination, BookQuery, ListOptions, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, ChangeHandler, WatchOptions, StacksApi, TransactionContext, } from './types.ts';
export type { StacksBackend, BackendTransaction, BackendOptions, BookRef, InternalQuery, InternalCondition, CountQuery, PutResult, PatchResult, DeleteResult, } from './backend.ts';
export { createStacksApparatus } from './stacks.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/stacks/dist/memory-backend.d.ts ===
/**
 * In-memory StacksBackend for tests.
 *
 * Exported via `@shardworks/stacks-apparatus/testing`. No SQLite dependency.
 * Implements the same contract as the SQLite backend.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare class MemoryBackend implements StacksBackend {
    private store;
    open(_options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, _schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=memory-backend.d.ts.map
=== packages/plugins/stacks/dist/query.d.ts ===
/**
 * Query translation — public WhereClause tuples → InternalQuery.
 *
 * Validates field names against a safe allowlist, then maps the
 * user-facing operator strings to the backend's internal enum.
 */
import type { BookQuery, WhereClause } from './types.ts';
import type { InternalCondition, InternalQuery } from './backend.ts';
export declare function validateFieldName(field: string): string;
export declare function translateQuery(query: BookQuery): InternalQuery;
/**
 * Translate a WhereClause into conditions only (no pagination fields).
 * OR clauses are handled at the apparatus level — this only handles AND.
 */
export declare function translateWhereClause(where?: WhereClause | {
    or: WhereClause[];
}): {
    where?: InternalCondition[];
};
//# sourceMappingURL=query.d.ts.map
=== packages/plugins/stacks/dist/sqlite-backend.d.ts ===
/**
 * SQLite backend for The Stacks — backed by better-sqlite3.
 *
 * Implements the StacksBackend interface. All SQLite-specific details
 * (json_extract, table naming, WAL mode) are encapsulated here.
 *
 * Documents are stored as JSON blobs in a `content` TEXT column.
 * Field queries use json_extract() against declared indexes.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare function tableName(ref: BookRef): string;
export declare class SqliteBackend implements StacksBackend {
    private db;
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
    private requireDb;
}
//# sourceMappingURL=sqlite-backend.d.ts.map
=== packages/plugins/stacks/dist/stacks-core.d.ts ===
/**
 * Stacks core — shared implementation logic for both the production
 * apparatus (stacks.ts) and the testable harness (testable-stacks.ts).
 *
 * This module contains ALL read/write/transaction/CDC logic. The two
 * consumer modules only add their own wiring: the apparatus adds guild()
 * startup and plugin schema reconciliation; the testable harness adds
 * nothing (just exposes createApi() directly).
 *
 * This ensures behavioral identity by construction, not by copy-paste.
 */
import type { BookRef, StacksBackend } from './backend.ts';
import type { BookEntry, BookQuery, StacksApi, TransactionContext, WhereClause } from './types.ts';
export declare class StacksCore {
    readonly backend: StacksBackend;
    private readonly cdc;
    private activeTx;
    constructor(backend: StacksBackend);
    createApi(): StacksApi;
    runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
    private createTransactionContext;
    doPut(ref: BookRef, entry: BookEntry): Promise<void>;
    private doPutInTx;
    doPatch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<BookEntry>;
    private doPatchInTx;
    doDelete(ref: BookRef, id: string): Promise<void>;
    private doDeleteInTx;
    doGet(ref: BookRef, id: string): BookEntry | null;
    doFind(ref: BookRef, query: BookQuery): Promise<BookEntry[]>;
    /**
     * OR queries: run each branch as a separate backend query, deduplicate
     * by id, re-sort, and paginate the merged result set.
     *
     * V1 trade-off: when called outside an active transaction, each branch
     * opens its own throwaway read transaction. For synchronous backends
     * like better-sqlite3, the data can't change between branches so this
     * is safe. A hypothetical async backend could see different snapshots
     * per branch, producing inconsistent results — a known limitation
     * documented in the spec's implementation notes.
     *
     * Performance note: each branch is a separate backend query. count()
     * with OR cannot use the backend's efficient count path since
     * deduplication requires knowing which IDs overlap. Acceptable for v1.
     */
    private doFindOr;
    doCount(ref: BookRef, where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
    private requireTx;
}
//# sourceMappingURL=stacks-core.d.ts.map
=== packages/plugins/stacks/dist/stacks.d.ts ===
/**
 * The Stacks — apparatus implementation.
 *
 * Wires together the backend, CDC registry, and transaction model
 * to provide the StacksApi `provides` object. All core read/write/
 * transaction logic lives in stacks-core.ts.
 *
 * See: docs/specification.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { StacksBackend } from './backend.ts';
export declare function createStacksApparatus(backend?: StacksBackend): Plugin;
//# sourceMappingURL=stacks.d.ts.map
=== packages/plugins/stacks/dist/types.d.ts ===
/**
 * The Stacks — public API types.
 *
 * These types form the contract between The Stacks apparatus and all
 * consuming plugins. No SQLite types, no implementation details.
 *
 * See: docs/specification.md
 */
/** Plugin configuration stored at guild.json["stacks"]. */
export interface StacksConfig {
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified.
     */
    autoMigrate?: boolean;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        stacks?: StacksConfig;
    }
}
/** Every document stored in a book must satisfy this constraint. */
export type BookEntry = {
    id: string;
} & Record<string, unknown>;
/**
 * Schema declaration for a single book in a kit's `books` contribution.
 *
 * `indexes` is a list of fields to create efficient query indexes for.
 * Field names use plain notation ('status') or dot-notation for nested
 * fields ('parent.id'). The Stacks translates internally.
 */
export interface BookSchema {
    indexes?: (string | string[])[];
}
export type Scalar = string | number | boolean | null;
export type WhereCondition = [field: string, op: '=' | '!=', value: Scalar] | [field: string, op: '>' | '>=' | '<' | '<=', value: number | string] | [field: string, op: 'LIKE', value: string] | [field: string, op: 'IN', value: Scalar[]] | [field: string, op: 'IS NULL' | 'IS NOT NULL'];
export type WhereClause = WhereCondition[];
export type OrderEntry = [field: string, direction: 'asc' | 'desc'];
export type OrderBy = OrderEntry | OrderEntry[];
export type Pagination = {
    limit: number;
    offset?: number;
} | {
    limit?: never;
    offset?: never;
};
export type BookQuery = {
    where?: WhereClause | {
        or: WhereClause[];
    };
    orderBy?: OrderBy;
} & Pagination;
export type ListOptions = {
    orderBy?: OrderBy;
} & Pagination;
/** Read-only view of a book — returned by `readBook()` for cross-plugin access. */
export interface ReadOnlyBook<T extends BookEntry> {
    get(id: string): Promise<T | null>;
    find(query: BookQuery): Promise<T[]>;
    list(options?: ListOptions): Promise<T[]>;
    count(where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
}
/** Writable book handle — returned by `book()` for own-plugin access. */
export interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
    /**
     * Upsert a document. Creates if `entry.id` is new; replaces entirely
     * if it already exists. Fires a `create` or `update` CDC event.
     */
    put(entry: T): Promise<void>;
    /**
     * Partially update a document. Merges top-level fields into the existing
     * document. Throws if the document does not exist. Returns the updated
     * document. Fires an `update` CDC event.
     */
    patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
    /**
     * Delete a document by id. Silent no-op if it does not exist.
     * Fires a `delete` CDC event only if the document existed.
     */
    delete(id: string): Promise<void>;
}
export interface CreateEvent<T extends BookEntry> {
    type: 'create';
    ownerId: string;
    book: string;
    entry: T;
}
export interface UpdateEvent<T extends BookEntry> {
    type: 'update';
    ownerId: string;
    book: string;
    entry: T;
    prev: T;
}
export interface DeleteEvent<T extends BookEntry> {
    type: 'delete';
    ownerId: string;
    book: string;
    id: string;
    prev: T;
}
export type ChangeEvent<T extends BookEntry> = CreateEvent<T> | UpdateEvent<T> | DeleteEvent<T>;
export type ChangeHandler<T extends BookEntry = BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void;
export interface WatchOptions {
    /**
     * Controls when the handler runs relative to the transaction commit.
     *
     * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
     *   join the same transaction. If the handler throws, everything rolls back.
     *
     * false — Phase 2: runs AFTER the transaction commits. Errors are logged
     *   as warnings but do not affect committed data.
     *
     * @default true
     */
    failOnError?: boolean;
}
export interface TransactionContext {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
}
export interface StacksApi {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
    watch<T extends BookEntry>(ownerId: string, bookName: string, handler: ChangeHandler<T>, options?: WatchOptions): void;
    transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/tools/dist/index.d.ts ===
/**
 * @shardworks/tools-apparatus — The Instrumentarium.
 *
 * Guild tool registry: scans kit contributions, resolves permission-gated
 * tool sets, and provides the InstrumentariumApi for tool lookup and resolution.
 *
 * The tool() factory and ToolDefinition type live here canonically.
 *
 * See: docs/specification.md (instrumentarium)
 */
export { type ToolCaller, type ToolDefinition, tool, isToolDefinition, } from './tool.ts';
export { type InstrumentariumApi, type ResolvedTool, type ResolveOptions, } from './instrumentarium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/tools/dist/instrumentarium.d.ts ===
/**
 * The Instrumentarium — guild tool registry apparatus.
 *
 * Scans installed tools from kit contributions and apparatus supportKits,
 * resolves permission-gated tool sets on demand, and serves as the single
 * source of truth for "what tools exist and who can use them."
 *
 * The Instrumentarium is role-agnostic — it receives an already-resolved
 * permissions array from the Loom and returns the matching tool set.
 * Role definitions and permission grants are owned by the Loom.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ToolDefinition, ToolCaller } from './tool.ts';
/** A resolved tool with provenance metadata. */
export interface ResolvedTool {
    /** The tool definition (name, description, params schema, handler). */
    definition: ToolDefinition;
    /** Plugin id of the kit or apparatus that contributed this tool. */
    pluginId: string;
}
/** Options for resolving a permission-gated tool set. */
export interface ResolveOptions {
    /**
     * Permission grants in `plugin:level` format.
     * Supports wildcards: `plugin:*`, `*:level`, `*:*`.
     */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. When false (default),
     * permissionless tools are included unconditionally.
     */
    strict?: boolean;
    /** Filter by invocation caller. Tools with no callableBy pass all callers. */
    caller?: ToolCaller;
}
/** The Instrumentarium's public API, exposed via `provides`. */
export interface InstrumentariumApi {
    /**
     * Resolve the tool set for a given set of permissions.
     *
     * Evaluates each registered tool against the permission grants:
     * - Tools with a `permission` field: included if any grant matches
     * - Permissionless tools: always included (default) or gated by `strict`
     * - Caller filtering applied last
     */
    resolve(options: ResolveOptions): ResolvedTool[];
    /**
     * Find a single tool by name. Returns null if not installed.
     */
    find(name: string): ResolvedTool | null;
    /**
     * List all installed tools, regardless of permissions.
     */
    list(): ResolvedTool[];
}
/**
 * Create the Instrumentarium apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['tools']` — scans kit/supportKit contributions
 * - `provides: InstrumentariumApi` — the tool registry API
 */
export declare function createInstrumentarium(): Plugin;
//# sourceMappingURL=instrumentarium.d.ts.map
=== packages/plugins/tools/dist/tool.d.ts ===
/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * A package can export a single tool or an array of tools:
 *
 * @example Single tool
 * ```typescript
 * import { tool } from '@shardworks/tools-apparatus';
 * import { z } from 'zod';
 *
 * export default tool({
 *   name: 'lookup',
 *   description: 'Look up an anima by name',
 *   instructionsFile: './instructions.md',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }) => {
 *     const { home } = guild();
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 *
 * @example Tool collection
 * ```typescript
 * export default [
 *   tool({ name: 'commission', description: '...', params: {...}, handler: ... }),
 *   tool({ name: 'signal', description: '...', params: {...}, handler: ... }),
 * ];
 * ```
 */
import { z } from 'zod';
type ZodShape = Record<string, z.ZodType>;
/**
 * The caller types a tool can be invoked by.
 * - `'cli'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'cli' | 'anima' | 'library';
/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
    /** Tool name — used for resolution when a package exports multiple tools. */
    readonly name: string;
    readonly description: string;
    /** Per-tool instructions injected into the anima's session context (inline text). */
    readonly instructions?: string;
    /**
     * Path to an instructions file, relative to the package root.
     * Resolved by the manifest engine at session time.
     * Mutually exclusive with `instructions`.
     */
    readonly instructionsFile?: string;
    /**
     * Caller types this tool is available to.
     * Always a normalized array. Absent means available to all callers.
     */
    readonly callableBy?: ToolCaller[];
    /**
     * Permission level required to invoke this tool. Matched against role grants.
     *
     * Format: a freeform string chosen by the tool author. Conventional names:
     * - `'read'` — query/inspect operations
     * - `'write'` — create/update operations
     * - `'delete'` — destructive operations
     * - `'admin'` — configuration and lifecycle operations
     *
     * Plugins are free to define their own levels.
     * If omitted, the tool is permissionless — included by default in non-strict
     * mode, excluded in strict mode unless the role grants `plugin:*` or `*:*`.
     */
    readonly permission?: string;
    readonly params: z.ZodObject<TShape>;
    readonly handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
}
/** Input to `tool()` — instructions are either inline text or a file path, not both. */
type ToolInput<TShape extends ZodShape> = {
    name: string;
    description: string;
    params: TShape;
    handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
    /**
     * Caller types this tool is available to.
     * Accepts a single caller or an array. Normalized to an array in the returned definition.
     */
    callableBy?: ToolCaller | ToolCaller[];
    /**
     * Permission level required to invoke this tool.
     * See ToolDefinition.permission for details.
     */
    permission?: string;
} & ({
    instructions?: string;
    instructionsFile?: never;
} | {
    instructions?: never;
    instructionsFile?: string;
});
/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * name, description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives one argument:
 * - `params` — the validated input, typed from your Zod schemas
 *
 * To access guild infrastructure (apparatus, config, home path), import
 * `guild` from `@shardworks/nexus-core` and call `guild()` inside the handler.
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 *
 * Instructions can be provided inline or as a file path:
 * - `instructions: 'Use this tool when...'` — inline text
 * - `instructionsFile: './instructions.md'` — resolved at manifest time
 */
export declare function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape>;
/** Type guard: is this value a ToolDefinition? */
export declare function isToolDefinition(obj: unknown): obj is ToolDefinition;
export {};
//# sourceMappingURL=tool.d.ts.map
=== packages/plugins/tools/dist/tools/tools-list.d.ts ===
/**
 * tools-list — administrative view of all tools installed in the guild.
 *
 * Lists the full registry with optional filters for caller type, permission
 * level, and contributing plugin. This is an inventory tool, not a
 * permission-resolved view — use MCP native tool listing for that.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Summary returned for each tool in the list. */
export interface ToolSummary {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
}
export declare function createToolsList(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    caller: z.ZodOptional<z.ZodEnum<{
        cli: "cli";
        anima: "anima";
        library: "library";
    }>>;
    permission: z.ZodOptional<z.ZodString>;
    plugin: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=tools-list.d.ts.map
=== packages/plugins/tools/dist/tools/tools-show.d.ts ===
/**
 * tools-show — show full details for a single tool.
 *
 * Returns name, description, plugin, permission, callableBy, parameter
 * schema, and instructions for the named tool. Returns null if not found.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Parameter info derived from the Zod schema. */
export interface ParamInfo {
    type: string;
    description: string | null;
    optional: boolean;
}
/** Full detail returned for a single tool. */
export interface ToolDetail {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
    params: Record<string, ParamInfo>;
    instructions: string | null;
}
export declare function createToolsShow(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    name: z.ZodString;
}>;
//# sourceMappingURL=tools-show.d.ts.map

