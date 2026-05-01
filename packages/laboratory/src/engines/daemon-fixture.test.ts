/**
 * Tests for the daemon-fixture engines (lab.daemon-setup /
 * lab.daemon-teardown).
 *
 * Strategy:
 *   - Pure helpers (allocatePort, writePortConfig,
 *     resolveTestGuildForDaemon) tested directly.
 *   - Engine-level tests cover validation and the pre-flight pidfile
 *     check (refuses to start when one exists). The engines'
 *     `nsg start` / `nsg stop` shellouts are not exercised here —
 *     they require a real nsg toolchain inside a real test guild;
 *     that is integration-test territory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';

import {
  allocatePort,
  daemonSetupEngine,
  daemonTeardownEngine,
  resolveTestGuildForDaemon,
  writePortConfig,
} from './daemon-fixture.ts';
import { StacksTestStub } from '../archive/test-stacks-stub.ts';
import { LAB_TRIAL_ARCHIVES_BOOK, type LabTrialArchive } from '../archive/book.ts';

// ── Test infrastructure ─────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lab-daemon-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

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
  slug: 'test-daemon-trial',
  writId: 'w-modaem01-aaaa1111bbbb',
  frameworkVersion: '1.0.0',
};

function makeContext(over: Partial<EngineRunContext> = {}): EngineRunContext {
  return {
    rigId: 'rig-test-0001',
    engineId: 'fixture-daemon-setup',
    upstream: {},
    ...over,
  };
}

/**
 * Build a fake test-guild dir with a guild.json and a stub
 * node_modules/.bin/nsg binstub. The binstub is just a marker file
 * — engine tests that hit this path use the pidfile guard or
 * archive-row guard to reject before any subprocess is invoked.
 */
function makeFakeTestGuild(name: string): { guildName: string; guildPath: string } {
  const guildPath = makeTmpDir(`tg-${name}`);
  fs.writeFileSync(path.join(guildPath, 'guild.json'), '{}\n');
  fs.mkdirSync(path.join(guildPath, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(
    path.join(guildPath, 'node_modules', '.bin', 'nsg'),
    '#!/bin/sh\necho "stub" >&2\nexit 0\n',
    { mode: 0o755 },
  );
  return { guildName: name, guildPath };
}

// ── allocatePort ────────────────────────────────────────────────────

describe('allocatePort', () => {
  it('returns a free TCP port in the dynamic range', async () => {
    const port = await allocatePort();
    assert.ok(Number.isInteger(port), 'port should be an integer');
    assert.ok(port > 0 && port <= 65535, `port should be in (0, 65535]; got ${port}`);
  });

  it('returns a port that can immediately be bound', async () => {
    const port = await allocatePort();
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve());
      });
    });
  });

  it('returns different ports across calls', async () => {
    const a = await allocatePort();
    const b = await allocatePort();
    // Not guaranteed by POSIX but overwhelmingly likely on Linux.
    assert.notEqual(a, b);
  });
});

// ── writePortConfig ─────────────────────────────────────────────────

describe('writePortConfig', () => {
  it('writes both ports into a fresh guild.json', async () => {
    const dir = makeTmpDir('write-fresh');
    fs.writeFileSync(path.join(dir, 'guild.json'), '{}\n');

    await writePortConfig(dir, 7501, 7502);

    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'guild.json'), 'utf8'));
    assert.deepEqual(parsed, {
      tools: { serverPort: 7501 },
      oculus: { port: 7502 },
    });
  });

  it('preserves existing keys (deep-merge)', async () => {
    const dir = makeTmpDir('write-preserve');
    fs.writeFileSync(
      path.join(dir, 'guild.json'),
      JSON.stringify(
        {
          name: 'test',
          plugins: ['stacks', 'tools'],
          tools: { otherKey: 'keep-me' },
        },
        null,
        2,
      ) + '\n',
    );

    await writePortConfig(dir, 7600, 7601);

    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'guild.json'), 'utf8'));
    assert.equal(parsed.name, 'test');
    assert.deepEqual(parsed.plugins, ['stacks', 'tools']);
    assert.deepEqual(parsed.tools, { otherKey: 'keep-me', serverPort: 7600 });
    assert.deepEqual(parsed.oculus, { port: 7601 });
  });

  it('overrides existing port values when present', async () => {
    const dir = makeTmpDir('write-override');
    fs.writeFileSync(
      path.join(dir, 'guild.json'),
      JSON.stringify(
        { tools: { serverPort: 1111 }, oculus: { port: 2222 } },
        null,
        2,
      ) + '\n',
    );

    await writePortConfig(dir, 3333, 4444);

    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'guild.json'), 'utf8'));
    assert.deepEqual(parsed, {
      tools: { serverPort: 3333 },
      oculus: { port: 4444 },
    });
  });
});

// ── resolveTestGuildForDaemon ──────────────────────────────────────

describe('resolveTestGuildForDaemon', () => {
  it('throws when no test guild is in upstream', () => {
    assert.throws(
      () => resolveTestGuildForDaemon({}, 'lab.daemon-setup'),
      /no test guild found in context.upstream/,
    );
  });

  it('throws when multiple test guilds are in upstream', () => {
    const upstream = {
      'fixture-a-setup': { guildName: 'g-a', guildPath: '/tmp/a' },
      'fixture-b-setup': { guildName: 'g-b', guildPath: '/tmp/b' },
    };
    assert.throws(
      () => resolveTestGuildForDaemon(upstream, 'lab.daemon-setup'),
      /multiple test guilds found/,
    );
  });

  it('returns the single guild from a guild-fixture-shaped upstream', () => {
    const upstream = {
      'fixture-test-guild-setup': {
        guildName: 'tg',
        guildPath: '/tmp/tg',
        pluginsResolved: [],
      },
      'fixture-codex-setup': { codexName: 'c', remoteUrl: '/tmp/c.git' },
    };
    const resolved = resolveTestGuildForDaemon(upstream, 'lab.daemon-setup');
    assert.deepEqual(resolved, { guildName: 'tg', guildPath: '/tmp/tg' });
  });
});

// ── lab.daemon-setup: validation & guard branches ──────────────────

describe('lab.daemon-setup — validation', () => {
  beforeEach(() => {
    const home = makeTmpDir('lab-host');
    installFakeGuild(home);
  });

  it('rejects non-integer toolServerPort', async () => {
    await assert.rejects(
      () => daemonSetupEngine.run({ toolServerPort: 'nope' }, makeContext()),
      /toolServerPort must be an integer/,
    );
  });

  it('rejects out-of-range toolServerPort', async () => {
    await assert.rejects(
      () => daemonSetupEngine.run({ toolServerPort: 70000 }, makeContext()),
      /toolServerPort must be an integer in \[1, 65535\]/,
    );
  });

  it('rejects fractional oculusPort', async () => {
    await assert.rejects(
      () => daemonSetupEngine.run({ oculusPort: 4.5 }, makeContext()),
      /oculusPort must be an integer/,
    );
  });

  it('rejects when no test guild is present in upstream', async () => {
    await assert.rejects(
      () => daemonSetupEngine.run({}, makeContext()),
      /no test guild found in context.upstream/,
    );
  });

  it('refuses when a pidfile already exists in the test guild', async () => {
    const tg = makeFakeTestGuild('preflight');
    fs.mkdirSync(path.join(tg.guildPath, '.nexus'), { recursive: true });
    fs.writeFileSync(path.join(tg.guildPath, '.nexus', 'daemon.pid'), '12345\n');

    const upstream = { 'fixture-test-guild-setup': tg };
    await assert.rejects(
      () => daemonSetupEngine.run({}, makeContext({ upstream })),
      /pidfile already exists/,
    );
  });
});

// ── lab.daemon-teardown: validation, safety, tolerance ────────────

describe('lab.daemon-teardown', () => {
  beforeEach(() => {
    const home = makeTmpDir('lab-host');
    installFakeGuild(home);
  });

  it('refuses when no archive row exists for the trial', async () => {
    const tg = makeFakeTestGuild('no-archive');
    const upstream = { 'fixture-test-guild-setup': tg };
    await assert.rejects(
      () =>
        daemonTeardownEngine.run(
          { _trial: TRIAL },
          makeContext({ upstream, engineId: 'fixture-daemon-teardown' }),
        ),
      /no archive row exists for trialId/,
    );
  });

  it('rejects when no test guild is present in upstream', async () => {
    seedArchive(TRIAL.writId);
    await assert.rejects(
      () =>
        daemonTeardownEngine.run(
          { _trial: TRIAL },
          makeContext({ engineId: 'fixture-daemon-teardown', upstream: {} }),
        ),
      /no test guild found in context.upstream/,
    );
  });

  it('tolerates missing local nsg binstub (no-op short-circuit)', async () => {
    seedArchive(TRIAL.writId);
    // Build a test-guild WITHOUT a node_modules/.bin/nsg binstub —
    // simulates the case where guild-teardown ran out of order or the
    // binstub got cleaned up early.
    const guildPath = makeTmpDir('no-binstub');
    fs.writeFileSync(path.join(guildPath, 'guild.json'), '{}\n');
    const upstream = {
      'fixture-test-guild-setup': { guildName: 'no-binstub', guildPath },
    };

    const result = await daemonTeardownEngine.run(
      { _trial: TRIAL },
      makeContext({ upstream, engineId: 'fixture-daemon-teardown' }),
    );
    assert.equal(result.status, 'completed');
    const yields = (result as { yields: Record<string, unknown> }).yields;
    assert.deepEqual(yields, { stopped: true, guildPath });
  });

  it('rejects out-of-range port values at teardown validation', async () => {
    seedArchive(TRIAL.writId);
    const tg = makeFakeTestGuild('teardown-validate');
    const upstream = { 'fixture-test-guild-setup': tg };
    await assert.rejects(
      () =>
        daemonTeardownEngine.run(
          { _trial: TRIAL, toolServerPort: -1 },
          makeContext({ upstream, engineId: 'fixture-daemon-teardown' }),
        ),
      /toolServerPort must be an integer/,
    );
  });
});
