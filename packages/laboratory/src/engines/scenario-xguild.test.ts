/**
 * Tests for the cross-guild scenario engines.
 *
 * Strategy:
 *   - Pure helpers (discoverTestGuilds, extractH1Title) tested directly.
 *   - Engine validation guards (briefPath absolute, writId required,
 *     timeout/poll positivity) tested without subprocesses.
 *   - The shell-out happy path (nsg commission-post + nsg writ show)
 *     is exercised by live smoke verification rather than unit tests
 *     — booting the full nsg toolchain is too expensive.
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
  commissionPostXguildEngine,
  discoverTestGuilds,
  extractH1Title,
  waitForWritTerminalXguildEngine,
} from './scenario-xguild.ts';

// ── Test infrastructure ─────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lab-scenario-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function installFakeGuild(home: string): void {
  const fake: Guild = {
    home,
    apparatus: () => { throw new Error('not provided in test'); },
    tryApparatus: () => null,
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

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

function makeContext(over: Partial<EngineRunContext> = {}): EngineRunContext {
  return {
    rigId: 'rig-test-0001',
    engineId: 'scenario',
    upstream: {},
    ...over,
  };
}

// ── discoverTestGuilds ────────────────────────────────────────────────

describe('discoverTestGuilds', () => {
  it('returns empty when upstream has no guild-shaped yields', () => {
    assert.deepEqual(discoverTestGuilds({}), []);
  });

  it('finds a single guild from a guild-fixture-shaped yield', () => {
    const upstream = {
      'fixture-test-guild-setup': {
        guildName: 'trial-x',
        guildPath: '/lab/host/.nexus/laboratory/guilds/trial-x',
        pluginsResolved: [],
        codexesAdded: [],
        filesCopied: [],
      },
    };
    assert.deepEqual(discoverTestGuilds(upstream), [
      { guildName: 'trial-x', guildPath: '/lab/host/.nexus/laboratory/guilds/trial-x' },
    ]);
  });

  it('finds multiple guilds', () => {
    const upstream = {
      'fixture-a-setup': { guildName: 'a', guildPath: '/path/a' },
      'fixture-b-setup': { guildName: 'b', guildPath: '/path/b' },
    };
    const found = discoverTestGuilds(upstream);
    assert.equal(found.length, 2);
  });

  it('skips entries that are not guild-shaped', () => {
    const upstream = {
      'fixture-codex-setup': { codexName: 'c', remoteUrl: '/r.git' },
      'fixture-test-guild-setup': { guildName: 'g', guildPath: '/p' },
      'archive': { archived: true },
      'scenario': { stub: true },
    };
    assert.deepEqual(discoverTestGuilds(upstream), [
      { guildName: 'g', guildPath: '/p' },
    ]);
  });

  it('tolerates null and non-object values', () => {
    const upstream = {
      'a': null,
      'b': 'string',
      'c': [1, 2, 3],
      'd': { guildName: 'real', guildPath: '/r' },
    };
    assert.deepEqual(discoverTestGuilds(upstream), [
      { guildName: 'real', guildPath: '/r' },
    ]);
  });
});

// ── extractH1Title ────────────────────────────────────────────────────

describe('extractH1Title', () => {
  it('returns the first H1 text', () => {
    assert.equal(extractH1Title('# Hello World\n\nbody'), 'Hello World');
  });

  it('trims trailing whitespace', () => {
    assert.equal(extractH1Title('#   Big Title   \n'), 'Big Title');
  });

  it('returns null when no H1 present', () => {
    assert.equal(extractH1Title('no heading here\n## H2 only'), null);
  });

  it('does not match H2 or deeper', () => {
    assert.equal(extractH1Title('## H2 first\n# H1 second'), 'H1 second');
  });

  it('matches the first H1 even if multiple present', () => {
    assert.equal(extractH1Title('# First\n# Second'), 'First');
  });

  it('returns null on empty input', () => {
    assert.equal(extractH1Title(''), null);
  });
});

// ── lab.commission-post-xguild — validation ─────────────────────────

describe('lab.commission-post-xguild — validation', () => {
  beforeEach(() => {
    installFakeGuild(makeTmpDir('lab-host'));
  });

  it('rejects missing briefPath', async () => {
    await assert.rejects(
      () => commissionPostXguildEngine.run({}, makeContext()),
      /briefPath must be an absolute path/,
    );
  });

  it('rejects relative briefPath', async () => {
    await assert.rejects(
      () =>
        commissionPostXguildEngine.run(
          { briefPath: 'relative/brief.md' },
          makeContext(),
        ),
      /briefPath must be an absolute path/,
    );
  });

  it('rejects when no test guild in upstream', async () => {
    await assert.rejects(
      () =>
        commissionPostXguildEngine.run(
          { briefPath: '/abs/brief.md' },
          makeContext({
            upstream: { 'fixture-codex-setup': { codexName: 'c', remoteUrl: '/r.git' } },
          }),
        ),
      /no test guild found in context\.upstream/,
    );
  });

  it('rejects when multiple test guilds in upstream (v1 limitation)', async () => {
    await assert.rejects(
      () =>
        commissionPostXguildEngine.run(
          { briefPath: '/abs/brief.md' },
          makeContext({
            upstream: {
              'fixture-a-setup': { guildName: 'a', guildPath: '/p/a' },
              'fixture-b-setup': { guildName: 'b', guildPath: '/p/b' },
            },
          }),
        ),
      /multiple test guilds/,
    );
  });

  it('rejects malformed pollIntervalMs', async () => {
    await assert.rejects(
      () =>
        commissionPostXguildEngine.run(
          {
            briefPath: '/abs/brief.md',
            pollIntervalMs: -100,
          },
          makeContext({
            upstream: { g: { guildName: 'g', guildPath: '/p' } },
          }),
        ),
      /pollIntervalMs must be a positive number/,
    );
  });

  it('rejects malformed timeoutMs', async () => {
    await assert.rejects(
      () =>
        commissionPostXguildEngine.run(
          {
            briefPath: '/abs/brief.md',
            timeoutMs: 'not-a-number',
          },
          makeContext({
            upstream: { g: { guildName: 'g', guildPath: '/p' } },
          }),
        ),
      /timeoutMs must be a positive number/,
    );
  });

  it('rejects when brief file does not exist', async () => {
    const briefPath = path.join(makeTmpDir('brief-dir'), 'missing.md');
    await assert.rejects(
      () =>
        commissionPostXguildEngine.run(
          { briefPath },
          makeContext({
            upstream: { g: { guildName: 'g', guildPath: '/some/path' } },
          }),
        ),
      /failed to read brief/,
    );
  });
});

// ── lab.wait-for-writ-terminal-xguild — validation ──────────────────

describe('lab.wait-for-writ-terminal-xguild — validation', () => {
  beforeEach(() => {
    installFakeGuild(makeTmpDir('lab-host'));
  });

  it('rejects missing writId', async () => {
    await assert.rejects(
      () =>
        waitForWritTerminalXguildEngine.run(
          {},
          makeContext({
            upstream: { g: { guildName: 'g', guildPath: '/p' } },
          }),
        ),
      /writId is required/,
    );
  });

  it('rejects empty writId', async () => {
    await assert.rejects(
      () =>
        waitForWritTerminalXguildEngine.run(
          { writId: '' },
          makeContext({
            upstream: { g: { guildName: 'g', guildPath: '/p' } },
          }),
        ),
      /writId is required/,
    );
  });

  it('rejects when no test guild in upstream', async () => {
    await assert.rejects(
      () =>
        waitForWritTerminalXguildEngine.run(
          { writId: 'w-foo-bar' },
          makeContext(),
        ),
      /no test guild found in context\.upstream/,
    );
  });

  it('rejects malformed pollIntervalMs', async () => {
    await assert.rejects(
      () =>
        waitForWritTerminalXguildEngine.run(
          { writId: 'w-foo', pollIntervalMs: 0 },
          makeContext({
            upstream: { g: { guildName: 'g', guildPath: '/p' } },
          }),
        ),
      /pollIntervalMs must be a positive number/,
    );
  });
});
