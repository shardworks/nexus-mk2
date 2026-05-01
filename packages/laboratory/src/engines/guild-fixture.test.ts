/**
 * Tests for the guild-fixture engines (lab.guild-setup / lab.guild-teardown).
 *
 * Strategy:
 *   - Pure helpers (deepMerge, discoverCodexes, defaultGuildPath) tested
 *     directly with controlled inputs.
 *   - The engines themselves are end-to-end-shaped — they shell out to
 *     `nsg init`, `nsg plugin install`, `nsg codex add`. Unit tests don't
 *     spin up the full nsg toolchain (would be slow and require network
 *     resolution for plugin installs); we test the validation and the
 *     pure-function building blocks here, and rely on the live smoke
 *     test (codified later under c-momaa75l) for full-integration
 *     coverage.
 *
 * The engines' filesystem orchestration (existsSync guard, archive
 * safety check, rm-rf teardown, validation) IS testable without
 * subprocesses — those branches live in this file.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';

import {
  defaultGuildPath,
  deepMerge,
  discoverCodexes,
  guildSetupEngine,
  guildTeardownEngine,
} from './guild-fixture.ts';
import { StacksTestStub } from '../archive/test-stacks-stub.ts';
import { LAB_TRIAL_ARCHIVES_BOOK, type LabTrialArchive } from '../archive/book.ts';

// ── Test infrastructure ─────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lab-guild-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Module-scope stacks stub — installed alongside the fake guild so
 * the teardown engine's archive-presence check (which calls
 * `guild().apparatus<StacksApi>('stacks')`) finds a working surface.
 * `installFakeGuild` resets it; tests opt into archive-row presence
 * by calling `seedArchive(...)`.
 */
let stacksStub = new StacksTestStub();

function installFakeGuild(home: string): void {
  stacksStub = new StacksTestStub();
  const fake: Guild = {
    home,
    apparatus<T>(name: string): T {
      if (name === 'stacks') return stacksStub.asApi() as T;
      throw new Error(`fake guild: apparatus "${name}" not provided in test`);
    },
    tryApparatus<T>(name: string): T | null {
      if (name === 'stacks') return stacksStub.asApi() as T;
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

function seedArchive(trialId: string): void {
  const row: LabTrialArchive = {
    id: 'lar-test-0001',
    trialId,
    archivedAt: new Date().toISOString(),
    probes: [],
  };
  stacksStub.seed({ ownerId: 'laboratory', bookName: LAB_TRIAL_ARCHIVES_BOOK }, row);
}

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

const TRIAL = {
  slug: 'test-guild-trial',
  writId: 'w-momen904-e8cd1359f754',
};
const DEFAULT_GUILD_NAME = 'test-guild-trial-e8cd1359';

function makeContext(over: Partial<EngineRunContext> = {}): EngineRunContext {
  return {
    rigId: 'rig-test-0001',
    engineId: 'fixture-test-guild-setup',
    upstream: {},
    ...over,
  };
}

// ── deepMerge ────────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('merges flat object — source wins on key collision', () => {
    assert.deepEqual(
      deepMerge({ a: 1, b: 2 }, { b: 99, c: 3 }),
      { a: 1, b: 99, c: 3 },
    );
  });

  it('recurses into plain object values', () => {
    assert.deepEqual(
      deepMerge(
        { plugins: { astrolabe: { patronRole: 'patron' } } },
        { plugins: { astrolabe: { model: 'sonnet' }, animator: {} } },
      ),
      {
        plugins: {
          astrolabe: { patronRole: 'patron', model: 'sonnet' },
          animator: {},
        },
      },
    );
  });

  it('replaces arrays outright (does not concat)', () => {
    assert.deepEqual(
      deepMerge({ list: [1, 2, 3] }, { list: [9] }),
      { list: [9] },
    );
  });

  it('source array overrides target object (different shape)', () => {
    assert.deepEqual(
      deepMerge({ x: { a: 1 } }, { x: [1, 2] }),
      { x: [1, 2] },
    );
  });

  it('does not mutate inputs', () => {
    const t = { a: { b: 1 } };
    const s = { a: { c: 2 } };
    deepMerge(t, s);
    assert.deepEqual(t, { a: { b: 1 } });
    assert.deepEqual(s, { a: { c: 2 } });
  });

  it('handles deeply-nested keys', () => {
    assert.deepEqual(
      deepMerge(
        { a: { b: { c: { d: 1 } } } },
        { a: { b: { c: { e: 2 } } } },
      ),
      { a: { b: { c: { d: 1, e: 2 } } } },
    );
  });
});

// ── discoverCodexes ──────────────────────────────────────────────────

describe('discoverCodexes', () => {
  it('returns empty when upstream is empty', () => {
    assert.deepEqual(discoverCodexes({}), []);
  });

  it('finds a single codex from a codex-fixture-shaped upstream entry', () => {
    const upstream = {
      'fixture-codex-setup': {
        codexName: 'trial-x-codex',
        remoteUrl: '/path/to/bare.git',
        baseSha: 'abc',
        headSha: 'abc',
      },
    };
    assert.deepEqual(discoverCodexes(upstream), [
      { codexName: 'trial-x-codex', remoteUrl: '/path/to/bare.git' },
    ]);
  });

  it('finds multiple codexes', () => {
    const upstream = {
      'fixture-a-setup': { codexName: 'a', remoteUrl: '/a.git' },
      'fixture-b-setup': { codexName: 'b', remoteUrl: '/b.git' },
    };
    const found = discoverCodexes(upstream);
    assert.equal(found.length, 2);
    const names = found.map((c) => c.codexName).sort();
    assert.deepEqual(names, ['a', 'b']);
  });

  it('skips upstream entries that lack codexName/remoteUrl', () => {
    const upstream = {
      'fixture-codex-setup': {
        codexName: 'real',
        remoteUrl: '/real.git',
      },
      'scenario': { stub: true, designId: 'lab.scenario' },
      'archive': { archived: true },
    };
    assert.deepEqual(discoverCodexes(upstream), [
      { codexName: 'real', remoteUrl: '/real.git' },
    ]);
  });

  it('skips entries where codexName or remoteUrl are not strings', () => {
    const upstream = {
      'wrong-type': { codexName: 123, remoteUrl: '/foo.git' },
      'partial': { codexName: 'partial' }, // no remoteUrl
    };
    assert.deepEqual(discoverCodexes(upstream), []);
  });

  it('tolerates null and non-object values', () => {
    const upstream = {
      'null-yield': null,
      'string-yield': 'oops',
      'array-yield': [1, 2, 3],
      'real': { codexName: 'real', remoteUrl: '/r.git' },
    };
    assert.deepEqual(discoverCodexes(upstream), [
      { codexName: 'real', remoteUrl: '/r.git' },
    ]);
  });
});

// ── defaultGuildPath ─────────────────────────────────────────────────

describe('defaultGuildPath', () => {
  it('namespaces under <home>/.nexus/laboratory/guilds/<name>', () => {
    assert.equal(
      defaultGuildPath('/lab/host', 'my-trial-guild'),
      '/lab/host/.nexus/laboratory/guilds/my-trial-guild',
    );
  });
});

// ── guild-setup: validation & guard branches ────────────────────────

describe('lab.guild-setup — validation', () => {
  beforeEach(() => {
    const home = makeTmpDir('lab-host');
    installFakeGuild(home);
  });

  it('errors clearly when guildName missing AND _trial absent', async () => {
    await assert.rejects(
      () => guildSetupEngine.run({}, makeContext()),
      /guildName is missing and no _trial context/,
    );
  });

  it('rejects malformed guildName', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run({ guildName: 'Bad Name' }, makeContext()),
      /guildName must be kebab-case/,
    );
  });

  it('rejects relative guildPath override', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run(
          { guildName: 'g', guildPath: 'relative/dir' },
          makeContext(),
        ),
      /guildPath must be an absolute path/,
    );
  });

  it('rejects malformed plugin entries', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run(
          {
            guildName: 'g',
            plugins: [{ name: 'foo' }], // missing version
          },
          makeContext(),
        ),
      /plugins\[0\] must be \{name: string, version: string\}/,
    );
  });

  it('rejects non-array plugins', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run(
          { guildName: 'g', plugins: 'not-an-array' },
          makeContext(),
        ),
      /plugins must be an array/,
    );
  });

  it('rejects relative sourcePath in files entries', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run(
          {
            guildName: 'g',
            files: [{ sourcePath: 'relative/path.md', guildPath: 'a.md' }],
          },
          makeContext(),
        ),
      /sourcePath must be absolute/,
    );
  });

  it('rejects absolute guildPath in files entries', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run(
          {
            guildName: 'g',
            files: [{ sourcePath: '/abs/src.md', guildPath: '/abs/dst.md' }],
          },
          makeContext(),
        ),
      /guildPath must be relative/,
    );
  });

  it('rejects non-plain-object config', async () => {
    await assert.rejects(
      () =>
        guildSetupEngine.run(
          { guildName: 'g', config: [1, 2, 3] },
          makeContext(),
        ),
      /config must be a plain object/,
    );
  });

  it('refuses when target guild dir already exists', async () => {
    const home = (setGuild as unknown as { _: never }) ; // unused alias
    void home;
    // Pre-create the default guild dir at <labHost>/.nexus/laboratory/guilds/<name>
    // The fake guild's home is the most recently makeTmpDir-ed lab-host. Re-resolve.
    const labHost = (() => {
      // Re-install with a known home so we can pre-create the conflict.
      const h = makeTmpDir('conflict-host');
      installFakeGuild(h);
      return h;
    })();
    const willClobber = path.join(
      labHost,
      '.nexus',
      'laboratory',
      'guilds',
      DEFAULT_GUILD_NAME,
    );
    fs.mkdirSync(willClobber, { recursive: true });

    await assert.rejects(
      () =>
        guildSetupEngine.run(
          { _trial: TRIAL },
          makeContext(),
        ),
      /already exists/,
    );
  });
});

// ── guild-teardown: validation, safety, tolerance ────────────────────

describe('lab.guild-teardown', () => {
  beforeEach(() => {
    const home = makeTmpDir('lab-host');
    installFakeGuild(home);
  });

  it('refuses when no archive row exists for the trial', async () => {
    await assert.rejects(
      () =>
        guildTeardownEngine.run(
          { _trial: TRIAL },
          makeContext({
            engineId: 'fixture-test-guild-teardown',
            upstream: {},
          }),
        ),
      /no archive row exists for trialId/,
    );
  });

  it('removes the guild dir when an archive row is present', async () => {
    // Create a fake guild dir at the default location.
    const labHost = makeTmpDir('teardown-host');
    installFakeGuild(labHost);
    seedArchive(TRIAL.writId);
    const guildDir = path.join(
      labHost,
      '.nexus',
      'laboratory',
      'guilds',
      DEFAULT_GUILD_NAME,
    );
    fs.mkdirSync(guildDir, { recursive: true });
    fs.writeFileSync(path.join(guildDir, 'guild.json'), '{}');

    const result = await guildTeardownEngine.run(
      { _trial: TRIAL },
      makeContext({
        engineId: 'fixture-test-guild-teardown',
        upstream: {},
      }),
    );

    assert.equal(result.status, 'completed');
    const yields = (result as { yields: Record<string, unknown> }).yields;
    assert.deepEqual(yields, {
      removed: true,
      guildName: DEFAULT_GUILD_NAME,
      guildPath: guildDir,
    });
    assert.ok(!fs.existsSync(guildDir), 'guild dir should have been removed');
  });

  it('tolerates a missing guild dir (e.g. setup never ran)', async () => {
    seedArchive(TRIAL.writId);
    const result = await guildTeardownEngine.run(
      { _trial: TRIAL },
      makeContext({
        engineId: 'fixture-test-guild-teardown',
        upstream: {},
      }),
    );

    assert.equal(result.status, 'completed');
  });

  it('rejects malformed guildName at validation time', async () => {
    seedArchive(TRIAL.writId);
    await assert.rejects(
      () =>
        guildTeardownEngine.run(
          { guildName: 'Bad Name', _trial: TRIAL },
          makeContext({
            engineId: 'fixture-test-guild-teardown',
            upstream: {},
          }),
        ),
      /guildName must be kebab-case/,
    );
  });

  it('honors explicit guildPath override', async () => {
    const labHost = makeTmpDir('override-host');
    installFakeGuild(labHost);
    seedArchive(TRIAL.writId);
    const customPath = makeTmpDir('custom-guild');
    fs.writeFileSync(path.join(customPath, 'guild.json'), '{}');

    const result = await guildTeardownEngine.run(
      { guildName: 'whatever', guildPath: customPath, _trial: TRIAL },
      makeContext({
        engineId: 'fixture-test-guild-teardown',
        upstream: {},
      }),
    );

    assert.equal(result.status, 'completed');
    assert.ok(!fs.existsSync(customPath), 'custom guild path should have been removed');
  });
});
