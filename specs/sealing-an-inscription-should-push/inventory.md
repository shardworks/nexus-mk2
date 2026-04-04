# Inventory: sealing-an-inscription-should-push

## Brief Summary

The seal engine (Spider's clockwork engine for sealing drafts) calls `scriptorium.seal()` but never calls `scriptorium.push()`. This means after the seal engine completes, the sealed commits exist only in the local bare clone — they're never pushed to the remote. Downstream consumers that expect commits to be on the remote (e.g. quality review) can't see them.

The brief asks to update the Scriptorium's `seal` method to also push the main branch to the remote after sealing.

## Affected Code

### Primary: `ScriptoriumCore.seal()` — the method to modify

**File:** `/workspace/nexus/packages/plugins/codexes/src/scriptorium-core.ts`
**Method:** `async seal(request: SealRequest): Promise<SealResult>` (line 488–610)

Current behavior: fetches, advances local ref, attempts ff-merge (with rebase retry loop), optionally abandons the draft. Does NOT call `this.push()` anywhere.

The existing `push()` method (line 361–367):
```typescript
async push(request: PushRequest): Promise<void> {
  const state = await this.ensureReady(request.codexName);
  const clonePath = this.bareClonePath(state.name);
  const branch = request.branch ?? await resolveDefaultBranch(clonePath);
  await git(['push', 'origin', branch], clonePath);
}
```

The seal method has multiple success return points:
1. **No-op seal** (line 528–529): `targetRef === sourceRef` — returns early. Push may still be needed here if there are previously-sealed-but-unpushed commits, though this is debatable.
2. **FF success** (line 546–559): After `update-ref`, returns with `sealedCommit`. **This is the main insertion point for push.**
3. The rebase path loops back to retry ff, so all successful seals exit through path 1 or 2.

### Secondary: Seal Engine (Spider) — the caller that motivated this change

**File:** `/workspace/nexus/packages/plugins/spider/src/engines/seal.ts`

```typescript
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
```

Currently does NOT call `scriptorium.push()`. If we add push to `seal()`, this engine gets push for free without code changes.

### Types

**File:** `/workspace/nexus/packages/plugins/codexes/src/types.ts`

`SealRequest` (line 75–86): No push-related fields.
`SealResult` (line 88–99): No push-related fields.
`PushRequest` (line 101–108): Separate type for push operations.
`ScriptoriumApi` (line 131–214): `seal()` and `push()` are separate methods.

**File:** `/workspace/nexus/packages/plugins/spider/src/types.ts`

`SealYields` (line 185–195): No push-related fields. Spider doc (line 284) explicitly notes: "Push is a separate Scriptorium operation — the seal engine seals but does not push."

### Test Files

**File:** `/workspace/nexus/packages/plugins/codexes/src/scriptorium-core.test.ts`

Relevant test sections:
- `describe('seal()')` (line 601–767): Tests ff, abandon-after-seal, keepDraft, no-op seal, ref update, inscriptionsSealed count. None of these tests currently verify push behavior after seal.
- `describe('seal() rebase contention')` (line 771–920): Tests rebase scenarios. No push verification.
- `describe('seal() diverged remote')` (line 923–1020): Tests seal against diverged remotes. `push succeeds after sealing against a diverged remote` (line 988) explicitly calls `api.push()` SEPARATELY after `api.seal()` — this test will need updating if seal auto-pushes.
- `describe('push()')` (line 1067–1102): Separate push tests. `pushes sealed commits to the remote` (line 1070) explicitly calls `api.seal()` then `api.push()` — will need updating.

**File:** `/workspace/nexus/packages/plugins/spider/src/spider.test.ts`

Tests use a stub seal engine (line 1021–1024) that doesn't call the real Scriptorium, so these tests won't be directly affected. But the `stubSealEngine` documentation may need updating.

**File:** `/workspace/nexus/packages/plugins/dispatch/src/dispatch.test.ts`

The Dispatch tests (line 339+) test the separate seal-then-push flow. These tests use a fake Scriptorium and verify that both `seal()` and `push()` are called separately. If seal now auto-pushes, the Dispatch's explicit `push()` call becomes redundant (but harmless — push of already-pushed commits is a no-op).

### Tools

**File:** `/workspace/nexus/packages/plugins/codexes/src/tools/draft-seal.ts`
The `draft-seal` tool delegates directly to `api.seal(params)`. If seal auto-pushes, this tool gains push behavior with no code change. Users of the tool would need to know that seal now pushes.

**File:** `/workspace/nexus/packages/plugins/codexes/src/tools/codex-push.ts`
The `codex-push` tool remains relevant for manual push of branches other than the default, or for re-pushing after a push failure.

### Git Helper

**File:** `/workspace/nexus/packages/plugins/codexes/src/git.ts`
The `git()` function, `resolveDefaultBranch()`, and other helpers. No changes needed — `seal()` will just call the existing `push()` method internally.

## Adjacent Patterns: How Dispatch handles seal + push

**File:** `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts` (line 123–141)

The Dispatch (interim work runner, predates Spider) handles seal and push as separate sequential steps with individual error handling:

```typescript
// Seal
try {
  await scriptorium.seal({ codexName, sourceBranch: draft.branch });
} catch (err) {
  const reason = `Seal failed: ${String(err)}`;
  await clerk.transition(writ.id, 'failed', { resolution: reason });
  return { ... outcome: 'failed' ... };
}
// Push
try {
  await scriptorium.push({ codexName });
} catch (err) {
  const reason = `Push failed: ${String(err)}`;
  await clerk.transition(writ.id, 'failed', { resolution: reason });
  return { ... outcome: 'failed' ... };
}
```

This is the pattern the brief wants to eliminate — seal and push should be a single atomic operation in the Scriptorium itself.

## Adjacent Patterns: Spider rig pipeline

**File:** `/workspace/nexus/packages/plugins/spider/src/spider.ts`

The static pipeline is: `draft → implement → review → revise → seal` (line 104–110). The seal engine is the terminal engine in the rig. After seal completes, the rig CDC handler transitions the writ to completed (line 446–452). There is NO push step in the pipeline — the seal engine was supposed to be the point where commits reach the remote.

## Doc / Code Discrepancies

1. **Spider doc explicitly says seal doesn't push** (`/workspace/nexus/docs/architecture/apparatus/spider.md`, line 284): "Push is a separate Scriptorium operation — the seal engine seals but does not push." This will need updating.

2. **Scriptorium doc shows seal and push as separate steps** (`/workspace/nexus/docs/architecture/apparatus/scriptorium.md`):
   - Session integration section (line 496–507) shows a 4-step flow: openDraft → summon → seal → push
   - Interim dispatch pattern (line 531–567) shows separate shell commands for seal and push
   - Bare clone lifecycle (line 608–620) documents seal and push as separate operations
   
   These docs describe the current (separate) behavior. If seal absorbs push, the docs would need updating to reflect the simplified flow.

3. **Dispatch types doc says "seal the draft, push"** (`/workspace/nexus/packages/plugins/dispatch/src/types.ts`, line 22): Documents the current 2-step approach. If seal auto-pushes, the Dispatch's explicit push call becomes redundant.

## Existing Context

- No scratch notes, TODOs, or future docs specifically about merging seal+push.
- The Scriptorium doc's "Future State" section doesn't mention this.
- The commission log and experiment data reference this specific bug (the brief itself was filed because the seal engine doesn't push).
- No feature locks relevant to this area.
