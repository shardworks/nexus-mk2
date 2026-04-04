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

## Codebase API Surface (declarations available before this commission)

Scope: all 14 workspace projects
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

