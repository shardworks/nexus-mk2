## Commission Spec

---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 3
---

# Seal auto-pushes to remote

## Summary

The Scriptorium's `seal()` method currently only updates the local bare clone's ref — it never pushes to the remote. This means the seal engine (terminal engine in the Spider's rig pipeline) leaves sealed commits stranded locally. This change adds an inline `git push` to `seal()` so that every successful seal pushes the target branch to the remote.

## Current State

**`ScriptoriumCore.seal()`** in `/workspace/nexus/packages/plugins/codexes/src/scriptorium-core.ts` (line 488–610):

The method fetches, advances the local ref to the remote position if needed, then attempts a fast-forward merge (with a rebase retry loop for contention). It has two success exit points:

1. **No-op seal** (line 519–529): When `targetRef === sourceRef`, it abandons the draft and returns immediately.
2. **FF success** (line 537–559): After `update-ref`, it abandons the draft and returns.

Neither exit point pushes to the remote.

The existing `push()` method (line 361–367) does:
```typescript
async push(request: PushRequest): Promise<void> {
  const state = await this.ensureReady(request.codexName);
  const clonePath = this.bareClonePath(state.name);
  const branch = request.branch ?? await resolveDefaultBranch(clonePath);
  await git(['push', 'origin', branch], clonePath);
}
```

**Callers affected:**
- The **seal engine** (`/workspace/nexus/packages/plugins/spider/src/engines/seal.ts`) calls `scriptorium.seal()` and never calls `push()`. This is the bug.
- The **Dispatch** (`/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts`, line 123–141) calls `seal()` then `push()` separately. Its explicit `push()` call will become redundant but is out of scope for this change (S4 excluded).
- The **draft-seal tool** (`/workspace/nexus/packages/plugins/codexes/src/tools/draft-seal.ts`) delegates to `api.seal()`. It will gain push behavior automatically.

**Types** (`/workspace/nexus/packages/plugins/codexes/src/types.ts`): `SealRequest` and `SealResult` have no push-related fields. No changes needed — a successful `SealResult` will imply push succeeded; push failure throws.

## Requirements

- R1: When `seal()` succeeds (both no-op and ff paths), the target branch must be pushed to the remote before the method returns.
- R2: The push must happen after the ref update but before draft cleanup (`abandonDraft`), so that if push fails the draft remains intact for inspection and retry.
- R3: When push fails, `seal()` must throw an error with a message that distinguishes push failure from seal failure. The message must contain the substring `"Push failed after successful seal"`.
- R4: The push must be an inline `git push origin <targetBranch>` against the bare clone — not a call to the existing `this.push()` method (which redundantly resolves the codex and default branch).
- R5: No changes to `SealRequest`, `SealResult`, `SealYields`, or the `ScriptoriumApi` interface. A successful return from `seal()` implies push succeeded.
- R6: Existing seal tests that call `push()` separately after `seal()` must be updated: remove the explicit `push()` call and verify the remote has the sealed commit after `seal()` alone.
- R7: A new test must verify that `seal()` pushes to the remote (remote HEAD matches `sealedCommit` after seal).
- R8: The Spider architecture doc (`docs/architecture/apparatus/spider.md`) must be updated to remove the note that says seal does not push.
- R9: The Scriptorium architecture doc (`docs/architecture/apparatus/scriptorium.md`) must be updated in: (a) the session integration composition pattern, (b) the interim dispatch pattern, and (c) the bare clone lifecycle section — all to reflect that seal now includes push.

## Design

### Type Changes

None. `SealRequest`, `SealResult`, `SealYields`, and `ScriptoriumApi` are unchanged.

### Behavior

**`ScriptoriumCore.seal()` — push on both success paths:**

When the no-op seal path returns (source and target at the same commit), the method must push the target branch before abandoning the draft and returning. This handles the edge case of previously-sealed-but-unpushed commits from contention scenarios. Git push of an already-pushed ref is a no-op, so this is always safe.

When the ff-merge path succeeds (after `update-ref`), the method must push the target branch before abandoning the draft and returning.

The push is a single inline call:
```typescript
await git(['push', 'origin', targetBranch], clonePath);
```

This uses `clonePath` and `targetBranch` which are already resolved in `seal()`. The existing `this.push()` method is not called because it would redundantly call `ensureReady()` and `resolveDefaultBranch()`.

**Push failure handling:**

When `git push` fails, the error must be caught and re-thrown with a distinct message:

```typescript
try {
  await git(['push', 'origin', targetBranch], clonePath);
} catch (pushErr) {
  throw new Error(
    `Push failed after successful seal: ${pushErr instanceof Error ? pushErr.message : pushErr}`,
  );
}
```

This wrapping ensures callers can distinguish push failure (local state is correct, remote is stale) from seal failure (local state may be inconsistent). The draft is NOT abandoned before the push — if push throws, the draft survives for manual inspection.

**Ordering within `seal()`:**

For the no-op path (line 519–529 currently), the sequence becomes:
1. Push target branch to remote
2. Abandon draft (unless `keepDraft`)
3. Return `SealResult`

For the ff-merge path (line 537–559 currently), the sequence becomes:
1. `update-ref` (advance target to source)
2. Push target branch to remote
3. Abandon draft (unless `keepDraft`)
4. Return `SealResult`

### Non-obvious Touchpoints

- **`codex-push` tool** (`/workspace/nexus/packages/plugins/codexes/src/tools/codex-push.ts`): Remains unchanged and still useful for manual push of non-default branches or re-pushing after a push failure.
- **`draft-seal` tool** (`/workspace/nexus/packages/plugins/codexes/src/tools/draft-seal.ts`): Unchanged code, but its behavior now includes push. The tool description ("Seal a draft binding into the codex") is still accurate since push is an implementation detail of sealing.
- **Dispatch** (`/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts`): Its explicit `push()` call (line 134–141) becomes a harmless no-op (pushing an already-pushed branch). Cleanup is excluded from this scope (S4 excluded).
- **Spider's seal engine** (`/workspace/nexus/packages/plugins/spider/src/engines/seal.ts`): Unchanged code — gets push for free via `scriptorium.seal()`.

### Doc Updates

**`/workspace/nexus/docs/architecture/apparatus/spider.md`** (line 284):

Remove the note: `> **Note:** Field names mirror the Scriptorium's \`SealResult\` type. Push is a separate Scriptorium operation — the seal engine seals but does not push.`

Replace with: `> **Note:** Field names mirror the Scriptorium's \`SealResult\` type. The Scriptorium's \`seal()\` method pushes the target branch to the remote after sealing.`

**`/workspace/nexus/docs/architecture/apparatus/scriptorium.md`** — three sections:

**(a) Session integration composition pattern** (line 493–508):

The 4-step flow becomes 3 steps. Replace the current diagram with:

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

Update the subsequent paragraph (line 510) to say "Infrastructure steps (open, seal) happen outside the session" — removing "push" from the list since it's now part of seal.

**(b) Interim dispatch pattern** (line 529–567):

Remove step 4 (`codex-push`) from the shell script and update the `echo` line. The script becomes a 3-step flow: open → session → seal. Update the paragraph after the script to reflect that seal now pushes — a failed seal that throws a push error leaves the sealed binding local, and re-running `draft-seal` is safe (seal will be a no-op, then push).

**(c) Bare clone lifecycle** (line 608–620):

The `draft-seal` lifecycle gains a step 5 for push. Update to:

```
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
```

The `codex-push` lifecycle entry remains unchanged — it's still a valid standalone operation.

## Validation Checklist

- V1 [R1, R4]: After a successful `seal()` call in the test suite, verify the remote bare repo's HEAD for the default branch matches `sealedCommit` — without any explicit `push()` call. Check this by running `git rev-parse main` in the remote bare repo path and comparing to `result.sealedCommit`.
- V2 [R2]: Write or adapt a test where the remote is unreachable or push is expected to fail. Verify the draft still exists in `listDrafts()` after the push failure, confirming push runs before `abandonDraft`.
- V3 [R3]: Trigger a push failure in a test (e.g. by making the remote read-only or pointing at an invalid path). Verify the thrown error message contains `"Push failed after successful seal"`. Verify the local bare clone's ref WAS updated (seal succeeded locally) even though the method threw.
- V4 [R5]: Verify `SealRequest`, `SealResult`, `SealYields`, and `ScriptoriumApi` interfaces are unchanged by inspecting `types.ts` in both `codexes` and `spider` packages — no new fields, no removed fields.
- V5 [R6]: Confirm the test `'push succeeds after sealing against a diverged remote'` (previously at line 988) no longer calls `api.push()` explicitly and instead verifies the remote head after `api.seal()` alone. Confirm the test `'pushes sealed commits to the remote'` (previously at line 1070) is similarly updated.
- V6 [R7]: Confirm a new test exists (e.g. `'seal pushes to remote'`) that opens a draft, makes an inscription, seals, and verifies the remote bare repo has the sealed commit — with no explicit `push()` call.
- V7 [R8]: Verify `docs/architecture/apparatus/spider.md` no longer contains the phrase "the seal engine seals but does not push".
- V8 [R9]: Verify `docs/architecture/apparatus/scriptorium.md` no longer contains the 4-step composition pattern with a separate `scriptorium.push()` step. Verify the interim dispatch script no longer has a separate `codex-push` step. Verify the bare clone lifecycle for `draft-seal` includes a push step.
- V9 [R1]: Run the full codexes test suite (`node --test` in the codexes package) and verify all tests pass.

## Test Cases

**New test — `'seal pushes to remote'`:**
- Open a draft, make a commit, call `seal()`. Verify `git rev-parse main` in the remote bare repo matches `result.sealedCommit`. No explicit `push()` call.
- Expected: remote HEAD equals `sealedCommit`.

**New test — `'seal pushes on no-op seal'`:**
- Open a draft (no commits), call `seal()`. Verify the remote bare repo's main matches the sealed commit (same as before, since no new inscriptions). Confirms push runs even for no-op seals.
- Expected: remote HEAD equals `result.sealedCommit`.

**New test — `'push failure after seal throws with distinct message'`:**
- Open a draft, make a commit. Before sealing, corrupt the remote (e.g. remove the remote bare repo directory, or change the remote URL to an invalid path via `git remote set-url origin <invalid>`). Call `seal()`.
- Expected: throws an error matching `/Push failed after successful seal/`. The local bare clone's main ref should be advanced (seal succeeded locally). The draft should still exist in `listDrafts()`.

**Updated test — `'push succeeds after sealing against a diverged remote'` (currently line 988):**
- Same setup as current test (push external commit, then seal). Remove the explicit `api.push()` call. After `seal()` alone, verify the remote has the sealed commit.
- Expected: `git rev-parse main` in remote equals `result.sealedCommit`.

**Updated test — `'pushes sealed commits to the remote'` (currently line 1070):**
- Same setup as current test. Remove the explicit `api.push()` call after `seal()`. Verify the remote has the sealed commit after `seal()` alone.
- Expected: remote HEAD equals `sealedCommit`.

**Existing tests — verify no regression:**
- All existing seal tests (ff, keepDraft, no-op, ref update, inscriptionsSealed count, rebase contention) should continue to pass. They use `file://` remote URLs, so the push will succeed silently.
- The standalone `push()` tests remain unchanged — `push()` is still a valid API for manual use.

## Referenced Files (from spec, pre-commission state)

=== REFERENCED FILE: docs/architecture/apparatus/scriptorium.md (pre-commission state) ===
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

=== REFERENCED FILE: docs/architecture/apparatus/spider.md (pre-commission state) ===
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



## Commission Diff

```
 .../plugins/codexes/src/scriptorium-core.test.ts   | 25 ++++++----------------
 1 file changed, 7 insertions(+), 18 deletions(-)

diff --git a/packages/plugins/codexes/src/scriptorium-core.test.ts b/packages/plugins/codexes/src/scriptorium-core.test.ts
index a55ee13..bb1bf0c 100644
--- a/packages/plugins/codexes/src/scriptorium-core.test.ts
+++ b/packages/plugins/codexes/src/scriptorium-core.test.ts
@@ -1069,24 +1069,15 @@ describe('ScriptoriumCore', () => {
       gitSync(['add', 'push-fail.txt'], draft.path);
       gitSync(['commit', '-m', 'Push fail test'], draft.path);
 
-      // Corrupt the remote by pointing origin at an invalid path
-      const { bareClonePath } = (() => {
-        // Access the bare clone path via the guild home
-        const guildState = (core as unknown as { guildState?: never })['guildState'];
-        return { bareClonePath: null };
-      })();
-
-      // Get the bare clone path by reading the guild home from the test setup
-      // We need to change the remote URL in the bare clone to an invalid location.
-      // The bare clone is at <home>/.nexus/codexes/test-codex.git
-      // Find it via the draft's gitdir
+      // Find the bare clone path via the draft's gitdir.
+      // The gitdir is something like /tmp/.../codexes/test-codex.git/worktrees/my-draft
+      // Go up two levels to get the bare clone root.
       const gitDir = gitSync(['rev-parse', '--git-dir'], draft.path);
-      // gitDir is something like /tmp/.../codexes/test-codex.git/worktrees/my-draft
-      // The bare clone is the worktrees' parent: go up to the .git directory of the bare clone
       const cloneGitDir = path.resolve(path.join(gitDir, '..', '..'));
 
-      // Point origin at an invalid URL so push fails
-      gitSync(['remote', 'set-url', 'origin', 'file:///nonexistent/path.git'], cloneGitDir);
+      // Set a push-only URL to an invalid location so fetch still works but push fails.
+      // git remote set-url --push only overrides the push URL, leaving fetch URL intact.
+      gitSync(['remote', 'set-url', '--push', 'origin', 'file:///nonexistent/path.git'], cloneGitDir);
 
       // seal() should fail with a push error, not a seal error
       await assert.rejects(
@@ -1100,14 +1091,12 @@ describe('ScriptoriumCore', () => {
       );
 
       // The local bare clone's ref should have been updated (seal succeeded locally)
-      // Restore the remote URL temporarily to check
-      gitSync(['remote', 'set-url', 'origin', remote.url], cloneGitDir);
       const localRef = gitSync(['rev-parse', 'main'], cloneGitDir);
       // The draft's HEAD should match the local sealed ref
       const draftHead = gitSync(['rev-parse', 'HEAD'], draft.path);
       assert.equal(localRef, draftHead);
 
-      // The draft must still exist (push ran before abandonDraft)
+      // The draft must still exist (push runs before abandonDraft)
       const drafts = await api.listDrafts();
       assert.equal(drafts.length, 1, 'Draft should still exist after push failure');
     });

```

## Full File Contents (for context)

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



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: packages/plugins/codexes/src/scriptorium-core.ts ===
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



## Codebase Structure (surrounding directories)

```
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
