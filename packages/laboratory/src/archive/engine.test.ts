/**
 * Tests for the archive engine.
 *
 * Strategy:
 *   - `buildProbeEntries` is pure — tested directly with a synthetic
 *     trial config and upstream map.
 *   - The engine's run() is exercised against a StacksTestStub so we
 *     can confirm the row lands in lab-trial-archives with the
 *     expected shape.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';

import { archiveEngine, buildProbeEntries } from './engine.ts';
import { LAB_TRIAL_ARCHIVES_BOOK, type LabTrialArchive } from './book.ts';
import { StacksTestStub } from './test-stacks-stub.ts';
import type { LaboratoryTrialConfig } from '../types.ts';

let stacks: StacksTestStub;

function installFakeGuild(): void {
  stacks = new StacksTestStub();
  const fake: Guild = {
    home: '/tmp/lab-host',
    apparatus<T>(name: string): T {
      if (name === 'stacks') return stacks.asApi() as T;
      throw new Error(`fake guild: apparatus "${name}" not provided`);
    },
    tryApparatus<T>(name: string): T | null {
      if (name === 'stacks') return stacks.asApi() as T;
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

beforeEach(() => {
  installFakeGuild();
});

afterEach(() => {
  clearGuild();
});

function makeContext(upstream: Record<string, unknown> = {}): EngineRunContext {
  return {
    rigId: 'rig-test-archive',
    engineId: 'archive',
    upstream,
  };
}

function makeConfig(probes: LaboratoryTrialConfig['probes']): LaboratoryTrialConfig {
  return {
    slug: 'archive-test',
    fixtures: [],
    scenario: { engineId: 'lab.commission-post-xguild', givens: {} },
    probes,
    archive: { engineId: 'lab.archive', givens: {} },
  };
}

function makeWrit(config: LaboratoryTrialConfig, id = 'w-archive-test'): WritDoc {
  return {
    id,
    type: 'trial',
    title: 'Test trial',
    body: '',
    phase: 'open',
    classification: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ext: { laboratory: { config } },
  } as unknown as WritDoc;
}

// ── buildProbeEntries ─────────────────────────────────────────────────

describe('buildProbeEntries', () => {
  it('pairs each probe declaration with its upstream yield', () => {
    const config = makeConfig([
      { id: 'context', engineId: 'lab.probe-trial-context', givens: {} },
      { id: 'stacks', engineId: 'lab.probe-stacks-dump', givens: {} },
    ]);
    const upstream = {
      'probe-context': { trialId: 'w-x', frameworkVersion: '0.1.0' },
      'probe-stacks': { totalRows: 42 },
    };
    const entries = buildProbeEntries(config, upstream);
    assert.deepEqual(entries, [
      {
        id: 'context',
        engineId: 'lab.probe-trial-context',
        summary: { trialId: 'w-x', frameworkVersion: '0.1.0' },
      },
      {
        id: 'stacks',
        engineId: 'lab.probe-stacks-dump',
        summary: { totalRows: 42 },
      },
    ]);
  });

  it('preserves probe declaration order regardless of upstream map order', () => {
    const config = makeConfig([
      { id: 'a', engineId: 'engine-a', givens: {} },
      { id: 'b', engineId: 'engine-b', givens: {} },
      { id: 'c', engineId: 'engine-c', givens: {} },
    ]);
    const upstream = {
      'probe-c': { v: 3 },
      'probe-a': { v: 1 },
      'probe-b': { v: 2 },
    };
    const entries = buildProbeEntries(config, upstream);
    assert.deepEqual(
      entries.map((e) => e.id),
      ['a', 'b', 'c'],
    );
  });

  it('throws when a probe has no matching upstream key', () => {
    const config = makeConfig([
      { id: 'orphan', engineId: 'lab.probe-orphan', givens: {} },
    ]);
    assert.throws(
      () => buildProbeEntries(config, {}),
      /probe "orphan".*has no upstream yields/,
    );
  });

  it('wraps a non-object yield in { value: ... } so the summary is always an object', () => {
    const config = makeConfig([
      { id: 'scalar', engineId: 'lab.probe-scalar', givens: {} },
    ]);
    const upstream = { 'probe-scalar': 'hello' };
    const entries = buildProbeEntries(config, upstream);
    assert.deepEqual(entries[0]!.summary, { value: 'hello' });
  });

  it('returns empty entries when the trial has no probes', () => {
    const config = makeConfig([]);
    assert.deepEqual(buildProbeEntries(config, {}), []);
  });
});

// ── archive engine run() ──────────────────────────────────────────────

describe('archive engine run()', () => {
  it('writes a single row to lab-trial-archives with the expected shape', async () => {
    const config = makeConfig([
      { id: 'context', engineId: 'lab.probe-trial-context', givens: {} },
    ]);
    const writ = makeWrit(config, 'w-archive-shape');

    const result = await archiveEngine.run(
      { writ },
      makeContext({
        'probe-context': { rigId: 'rig-x', frameworkVersion: '0.1.0' },
      }),
    );

    assert.equal(result.status, 'completed');
    const yields = (result as { yields: Record<string, unknown> }).yields;
    assert.equal(yields.trialId, 'w-archive-shape');
    assert.equal(yields.probeCount, 1);
    assert.match(yields.archivedAt as string, /^\d{4}-\d{2}-\d{2}T/);

    const rows = stacks.rows('laboratory', LAB_TRIAL_ARCHIVES_BOOK) as LabTrialArchive[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.trialId, 'w-archive-shape');
    assert.deepEqual(rows[0]!.probes, [
      {
        id: 'context',
        engineId: 'lab.probe-trial-context',
        summary: { rigId: 'rig-x', frameworkVersion: '0.1.0' },
      },
    ]);
  });

  it('writes a row even when there are zero probes', async () => {
    const config = makeConfig([]);
    const writ = makeWrit(config, 'w-archive-noprobe');

    const result = await archiveEngine.run({ writ }, makeContext());
    assert.equal(result.status, 'completed');
    const rows = stacks.rows('laboratory', LAB_TRIAL_ARCHIVES_BOOK) as LabTrialArchive[];
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0]!.probes, []);
  });

  it('throws when the writ has no ext.laboratory.config', async () => {
    const writ = {
      id: 'w-noconfig',
      type: 'trial',
      ext: {},
    } as unknown as WritDoc;

    await assert.rejects(
      () => archiveEngine.run({ writ }, makeContext()),
      /missing ext.laboratory.config/,
    );
  });

  it('throws when "writ" given is missing', async () => {
    await assert.rejects(
      () => archiveEngine.run({}, makeContext()),
      /missing required given "writ"/,
    );
  });
});
