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