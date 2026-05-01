/**
 * Tests for the codex-fixture engines (lab.codex-setup / lab.codex-teardown).
 *
 * Strategy:
 *   - Real git operations against a real upstream repo (on-disk temp dir).
 *   - Real bare-repo creation; we want to verify the `clone → checkout →
 *     init bare → push` chain produces a bare with the expected state.
 *   - Mock ScriptoriumApi via a fake guild — the engine's contract with
 *     Scriptorium is narrow (list/add/remove), so a stub captures intent
 *     without spinning up the real plugin.
 *
 * The real codex-setup engine, run end-to-end against a real Scriptorium,
 * is exercised by the live smoke test in vibers and (later) by the
 * codified package smoke test under click c-momaa75l.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import type {
  CodexRecord,
  ScriptoriumApi,
} from '@shardworks/codexes-apparatus';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';

import {
  bareRepoPath,
  codexSetupEngine,
  codexTeardownEngine,
} from './codex-fixture.ts';
import { StacksTestStub } from '../archive/test-stacks-stub.ts';
import { LAB_TRIAL_ARCHIVES_BOOK, type LabTrialArchive } from '../archive/book.ts';

// ── Test infrastructure ─────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lab-codex-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function gitSync(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/**
 * Build an upstream repo with two commits on `main`. Returns the path
 * (usable as `upstreamRepo` directly) and the two commit SHAs.
 */
function createUpstreamRepo(): {
  path: string;
  baseSha: string;
  headSha: string;
} {
  const dir = makeTmpDir('upstream');
  gitSync(['init', '-b', 'main'], dir);
  gitSync(['config', 'user.email', 'test@test.com'], dir);
  gitSync(['config', 'user.name', 'Test'], dir);

  fs.writeFileSync(path.join(dir, 'README.md'), '# Test Repo (base)\n');
  gitSync(['add', 'README.md'], dir);
  gitSync(['commit', '-m', 'base commit'], dir);
  const baseSha = gitSync(['rev-parse', 'HEAD'], dir);

  fs.writeFileSync(path.join(dir, 'README.md'), '# Test Repo (head)\n');
  gitSync(['commit', '-am', 'head commit'], dir);
  const headSha = gitSync(['rev-parse', 'HEAD'], dir);

  return { path: dir, baseSha, headSha };
}

// ── Stub Scriptorium ────────────────────────────────────────────────

interface StubScriptoriumState {
  registered: Set<string>;
  addCalls: Array<{ name: string; remoteUrl: string }>;
  removeCalls: string[];
  /** When true, scriptorium.add throws — used to test rollback. */
  failAdd?: boolean;
}

function createStubScriptorium(state: StubScriptoriumState): ScriptoriumApi {
  return {
    add: async (name: string, remoteUrl: string): Promise<CodexRecord> => {
      state.addCalls.push({ name, remoteUrl });
      if (state.failAdd) {
        throw new Error('stub: scriptorium.add forced failure');
      }
      state.registered.add(name);
      return {
        name,
        remoteUrl,
        cloneStatus: 'ready',
        activeDrafts: 0,
      };
    },
    remove: async (name: string): Promise<void> => {
      state.removeCalls.push(name);
      state.registered.delete(name);
    },
    list: async (): Promise<CodexRecord[]> =>
      [...state.registered].map((name) => ({
        name,
        remoteUrl: `stub-url-for-${name}`,
        cloneStatus: 'ready' as const,
        activeDrafts: 0,
      })),
    // Methods unused by the engines under test.
    show: async () => { throw new Error('not implemented in stub'); },
    fetch: async () => { throw new Error('not implemented in stub'); },
    push: async () => { throw new Error('not implemented in stub'); },
    openDraft: async () => { throw new Error('not implemented in stub'); },
    listDrafts: async () => { throw new Error('not implemented in stub'); },
    abandonDraft: async () => { throw new Error('not implemented in stub'); },
    seal: async () => { throw new Error('not implemented in stub'); },
  };
}

// ── Fake guild ──────────────────────────────────────────────────────

interface FakeGuildContext {
  home: string;
  scriptorium: ScriptoriumApi;
  stacks: StacksTestStub;
}

function installFakeGuild(ctx: FakeGuildContext): void {
  const fake: Guild = {
    home: ctx.home,
    apparatus<T>(name: string): T {
      if (name === 'codexes') return ctx.scriptorium as T;
      if (name === 'stacks') return ctx.stacks.asApi() as T;
      throw new Error(`fake guild: apparatus "${name}" not provided in test`);
    },
    tryApparatus<T>(name: string): T | null {
      if (name === 'codexes') return ctx.scriptorium as T;
      if (name === 'stacks') return ctx.stacks.asApi() as T;
      return null;
    },
    config: () => ({}),
    writeConfig: () => undefined,
    guildConfig: () => ({ name: 'fake', nexus: '0.0.0', plugins: [] }),
    kits: () => [],
    apparatuses: () => [],
    failedPlugins: () => [],
    startupWarnings: () => [],
  };
  setGuild(fake);
}

// ── Cleanup ─────────────────────────────────────────────────────────

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

// ── Helpers ─────────────────────────────────────────────────────────

function setupTestEnv(): {
  guildHome: string;
  upstream: ReturnType<typeof createUpstreamRepo>;
  scriptoriumState: StubScriptoriumState;
  stacks: StacksTestStub;
} {
  const guildHome = makeTmpDir('lab-host-guild');
  const upstream = createUpstreamRepo();
  const scriptoriumState: StubScriptoriumState = {
    registered: new Set(),
    addCalls: [],
    removeCalls: [],
  };
  const stacks = new StacksTestStub();
  installFakeGuild({
    home: guildHome,
    scriptorium: createStubScriptorium(scriptoriumState),
    stacks,
  });
  return { guildHome, upstream, scriptoriumState, stacks };
}

/**
 * Seed an archive row for the trial — required to satisfy the
 * teardown engines' archive-presence check (resolveTrialIdForTeardown
 * + assertArchiveRowExists).
 */
function seedArchive(stacks: StacksTestStub, trialId: string): void {
  const row: LabTrialArchive = {
    id: 'lar-test-0001',
    trialId,
    archivedAt: new Date().toISOString(),
    probes: [],
  };
  stacks.seed({ ownerId: 'laboratory', bookName: LAB_TRIAL_ARCHIVES_BOOK }, row);
}

function makeContext(over: Partial<EngineRunContext> = {}): EngineRunContext {
  return {
    rigId: 'rig-test-0001',
    engineId: 'fixture-codex-setup',
    upstream: {},
    ...over,
  };
}

// ── Tests: setup ────────────────────────────────────────────────────

// Shared trial context for the test cases below — mirrors what the
// phase orchestrators would inject in real usage.
const TRIAL = {
  slug: 'test-trial',
  writId: 'w-momen904-e8cd1359f754',
  fixtureId: 'codex',
};

// Auto-derived codex name when no explicit codexName is supplied:
// `<slug>-<writId-tail-8>` → `test-trial-e8cd1359`.
const DEFAULT_CODEX_NAME = 'test-trial-e8cd1359';

describe('lab.codex-setup', () => {
  describe('happy path', () => {
    it('creates a bare repo at the expected path with HEAD = baseSha', async () => {
      const { guildHome, upstream } = setupTestEnv();

      const result = await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext(),
      );

      assert.equal(result.status, 'completed');
      const expectedBare = bareRepoPath(guildHome, 'trial-test-codex');
      assert.ok(fs.existsSync(expectedBare), `bare repo missing at ${expectedBare}`);

      // Bare's main should resolve to baseSha — not headSha.
      const mainSha = gitSync(['rev-parse', 'main'], expectedBare);
      assert.equal(mainSha, upstream.baseSha);
    });

    it('yields the expected shape', async () => {
      const { guildHome, upstream } = setupTestEnv();

      const result = await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext(),
      );

      assert.equal(result.status, 'completed');
      const yields = (result as { yields: Record<string, unknown> }).yields;
      const expectedBare = bareRepoPath(guildHome, 'trial-test-codex');
      assert.deepEqual(yields, {
        codexName: 'trial-test-codex',
        remoteUrl: expectedBare,
        bareLocalPath: expectedBare,
        baseSha: upstream.baseSha,
        headSha: upstream.baseSha,
      });
    });

    it('registers the codex with the lab-host Scriptorium', async () => {
      const { guildHome, upstream, scriptoriumState } = setupTestEnv();

      await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext(),
      );

      const expectedBare = bareRepoPath(guildHome, 'trial-test-codex');
      assert.deepEqual(scriptoriumState.addCalls, [
        { name: 'trial-test-codex', remoteUrl: expectedBare },
      ]);
      assert.ok(scriptoriumState.registered.has('trial-test-codex'));
    });
  });

  describe('codex name auto-default', () => {
    it('defaults codexName from _trial when not given explicitly', async () => {
      const { guildHome, upstream, scriptoriumState } = setupTestEnv();

      const result = await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          // codexName omitted — should default to <slug>-<writId-tail>
          _trial: TRIAL,
        },
        makeContext(),
      );

      assert.equal(result.status, 'completed');
      const expectedBare = bareRepoPath(guildHome, DEFAULT_CODEX_NAME);
      assert.ok(fs.existsSync(expectedBare), `bare repo missing at ${expectedBare}`);
      assert.deepEqual(scriptoriumState.addCalls, [
        { name: DEFAULT_CODEX_NAME, remoteUrl: expectedBare },
      ]);
    });

    it('errors clearly when both codexName and _trial are missing', async () => {
      const { upstream } = setupTestEnv();

      await assert.rejects(
        () =>
          codexSetupEngine.run(
            {
              upstreamRepo: upstream.path,
              baseSha: upstream.baseSha,
              // No codexName, no _trial — engine cannot derive a name.
            },
            makeContext(),
          ),
        /codexName is missing and no _trial context/,
      );
    });
  });

  describe('refusals', () => {
    it('refuses when the bare path already exists', async () => {
      const { guildHome, upstream } = setupTestEnv();
      const barePath = bareRepoPath(guildHome, 'trial-test-codex');
      fs.mkdirSync(barePath, { recursive: true });

      await assert.rejects(
        () =>
          codexSetupEngine.run(
            {
              upstreamRepo: upstream.path,
              baseSha: upstream.baseSha,
              codexName: 'trial-test-codex',
              _trial: TRIAL,
            },
            makeContext(),
          ),
        /already exists/,
      );
    });

    it('refuses when the codex name is already registered', async () => {
      const { upstream, scriptoriumState } = setupTestEnv();
      scriptoriumState.registered.add('trial-test-codex');

      await assert.rejects(
        () =>
          codexSetupEngine.run(
            {
              upstreamRepo: upstream.path,
              baseSha: upstream.baseSha,
              codexName: 'trial-test-codex',
              _trial: TRIAL,
            },
            makeContext(),
          ),
        /already registered/,
      );
    });
  });

  describe('rollback on failure', () => {
    it('rolls back the bare repo when scriptorium.add fails', async () => {
      const { guildHome, upstream, scriptoriumState } = setupTestEnv();
      scriptoriumState.failAdd = true;

      await assert.rejects(() =>
        codexSetupEngine.run(
          {
            upstreamRepo: upstream.path,
            baseSha: upstream.baseSha,
            codexName: 'trial-test-codex',
            _trial: TRIAL,
          },
          makeContext(),
        ),
      );

      const expectedBare = bareRepoPath(guildHome, 'trial-test-codex');
      assert.ok(!fs.existsSync(expectedBare), 'bare repo should have been rolled back');
    });

    it('rolls back when baseSha does not exist in upstream', async () => {
      const { guildHome, upstream } = setupTestEnv();

      await assert.rejects(() =>
        codexSetupEngine.run(
          {
            upstreamRepo: upstream.path,
            baseSha: '0000000000000000000000000000000000000000',
            codexName: 'trial-test-codex',
            _trial: TRIAL,
          },
          makeContext(),
        ),
      );

      const expectedBare = bareRepoPath(guildHome, 'trial-test-codex');
      // The bare may have been created before the checkout failed, but
      // rollback should remove it.
      assert.ok(!fs.existsSync(expectedBare), 'bare repo should have been rolled back');
    });
  });

  describe('givens validation', () => {
    it('rejects missing upstreamRepo', async () => {
      setupTestEnv();
      await assert.rejects(
        () =>
          codexSetupEngine.run(
            { baseSha: 'a'.repeat(40), codexName: 'trial-test-codex', _trial: TRIAL },
            makeContext(),
          ),
        /upstreamRepo is required/,
      );
    });

    it('rejects malformed baseSha', async () => {
      setupTestEnv();
      await assert.rejects(
        () =>
          codexSetupEngine.run(
            {
              upstreamRepo: '/some/path',
              baseSha: 'not-a-sha',
              codexName: 'trial-test-codex',
              _trial: TRIAL,
            },
            makeContext(),
          ),
        /baseSha must be a 40-char hex SHA/,
      );
    });

    it('rejects malformed codexName', async () => {
      setupTestEnv();
      await assert.rejects(
        () =>
          codexSetupEngine.run(
            {
              upstreamRepo: '/some/path',
              baseSha: 'a'.repeat(40),
              codexName: 'Bad Name With Spaces',
              _trial: TRIAL,
            },
            makeContext(),
          ),
        /codexName must be kebab-case/,
      );
    });
  });
});

// ── Tests: teardown ─────────────────────────────────────────────────

describe('lab.codex-teardown', () => {
  describe('archive-presence check', () => {
    it('refuses to teardown when no archive row exists for the trial', async () => {
      setupTestEnv();
      // Note: stacks is set up but no archive row is seeded — fail loud.
      await assert.rejects(
        () =>
          codexTeardownEngine.run(
            {
              upstreamRepo: '/some/path',
              baseSha: 'a'.repeat(40),
              codexName: 'trial-test-codex',
              _trial: TRIAL,
            },
            makeContext({ engineId: 'fixture-codex-teardown', upstream: {} }),
          ),
        /no archive row exists for trialId/,
      );
    });

    it('proceeds when an archive row exists for the trial', async () => {
      const { guildHome, upstream, scriptoriumState, stacks } = setupTestEnv();
      seedArchive(stacks, TRIAL.writId);

      // Seed: pretend setup ran.
      await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext(),
      );

      const result = await codexTeardownEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext({
          engineId: 'fixture-codex-teardown',
          upstream: {},
        }),
      );

      assert.equal(result.status, 'completed');
      assert.deepEqual(scriptoriumState.removeCalls, ['trial-test-codex']);
      assert.ok(!scriptoriumState.registered.has('trial-test-codex'));
      const barePath = bareRepoPath(guildHome, 'trial-test-codex');
      assert.ok(!fs.existsSync(barePath), 'bare repo should have been removed');
    });

    it('refuses to teardown when an archive row exists for a different trial', async () => {
      const { stacks } = setupTestEnv();
      seedArchive(stacks, 'w-some-other-trial-id');
      await assert.rejects(
        () =>
          codexTeardownEngine.run(
            {
              upstreamRepo: '/some/path',
              baseSha: 'a'.repeat(40),
              codexName: 'trial-test-codex',
              _trial: TRIAL,
            },
            makeContext({ engineId: 'fixture-codex-teardown', upstream: {} }),
          ),
        /no archive row exists for trialId/,
      );
    });
  });

  describe('happy path', () => {
    it('yields the expected shape', async () => {
      const { guildHome, upstream, stacks } = setupTestEnv();
      seedArchive(stacks, TRIAL.writId);

      await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext(),
      );

      const result = await codexTeardownEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          codexName: 'trial-test-codex',
          _trial: TRIAL,
        },
        makeContext({
          engineId: 'fixture-codex-teardown',
          upstream: {},
        }),
      );

      assert.equal(result.status, 'completed');
      const yields = (result as { yields: Record<string, unknown> }).yields;
      assert.deepEqual(yields, {
        removed: true,
        codexName: 'trial-test-codex',
        bareLocalPath: bareRepoPath(guildHome, 'trial-test-codex'),
      });
    });

    it('teardown derives the same default codexName as setup', async () => {
      // Setup with no explicit codexName — uses default.
      const { guildHome, upstream, scriptoriumState, stacks } = setupTestEnv();
      seedArchive(stacks, TRIAL.writId);

      await codexSetupEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          _trial: TRIAL,
        },
        makeContext(),
      );

      // Teardown also with no explicit codexName — must compute the
      // SAME default as setup, otherwise it'd target a different codex.
      const result = await codexTeardownEngine.run(
        {
          upstreamRepo: upstream.path,
          baseSha: upstream.baseSha,
          _trial: TRIAL,
        },
        makeContext({
          engineId: 'fixture-codex-teardown',
          upstream: {},
        }),
      );

      assert.equal(result.status, 'completed');
      assert.deepEqual(scriptoriumState.removeCalls, [DEFAULT_CODEX_NAME]);
      const barePath = bareRepoPath(guildHome, DEFAULT_CODEX_NAME);
      assert.ok(!fs.existsSync(barePath), 'default-named bare should have been removed');
    });
  });

  describe('tolerance', () => {
    it('tolerates a missing bare repo (e.g. setup never ran)', async () => {
      const { scriptoriumState, stacks } = setupTestEnv();
      seedArchive(stacks, TRIAL.writId);

      const result = await codexTeardownEngine.run(
        {
          upstreamRepo: '/some/path',
          baseSha: 'a'.repeat(40),
          codexName: 'never-existed',
          _trial: TRIAL,
        },
        makeContext({
          engineId: 'fixture-codex-teardown',
          upstream: {},
        }),
      );

      assert.equal(result.status, 'completed');
      // Codex was never registered, so remove should not have been called.
      assert.deepEqual(scriptoriumState.removeCalls, []);
    });

    it('tolerates an unregistered codex when bare exists', async () => {
      const { guildHome, scriptoriumState, stacks } = setupTestEnv();
      seedArchive(stacks, TRIAL.writId);
      // Manually create a bare path WITHOUT registering the codex —
      // simulates setup that crashed mid-flight after creating the bare
      // but before scriptorium.add.
      const barePath = bareRepoPath(guildHome, 'orphan-codex');
      fs.mkdirSync(barePath, { recursive: true });

      const result = await codexTeardownEngine.run(
        {
          upstreamRepo: '/some/path',
          baseSha: 'a'.repeat(40),
          codexName: 'orphan-codex',
          _trial: TRIAL,
        },
        makeContext({
          engineId: 'fixture-codex-teardown',
          upstream: {},
        }),
      );

      assert.equal(result.status, 'completed');
      assert.deepEqual(scriptoriumState.removeCalls, []);
      assert.ok(!fs.existsSync(barePath), 'bare repo should have been removed');
    });
  });

  describe('givens validation', () => {
    it('rejects malformed codexName', async () => {
      const { stacks } = setupTestEnv();
      seedArchive(stacks, TRIAL.writId);
      await assert.rejects(
        () =>
          codexTeardownEngine.run(
            {
              upstreamRepo: '/some/path',
              baseSha: 'a'.repeat(40),
              codexName: 'Bad Name',
              _trial: TRIAL,
            },
            makeContext({
              engineId: 'fixture-codex-teardown',
              upstream: {},
            }),
          ),
        /codexName must be kebab-case/,
      );
    });
  });
});
