/**
 * Codified pipeline smoke test (c-momaa75l).
 *
 * Exercises the laboratory's engine pipeline end-to-end at the
 * orchestrator-and-engine layer — without spinning up the full
 * Spider/Animator stack and without subprocess shell-out. The aim is
 * fast regression coverage of the *interactions* between engines:
 *
 *   - probe-trial-context reads the writ + guildConfig + (optionally)
 *     spider, yields a summary.
 *   - lab.archive reads probe yields from upstream and writes one
 *     atomic row to lab-trial-archives.
 *   - The teardown engines' tightened archive-presence safety check
 *     refuses-then-allows based on archive row presence.
 *   - The trial-extract tool dispatches via Fabricator + type guard
 *     and writes the expected files.
 *
 * What this test does NOT cover:
 *   - Real `nsg`-shellout fixture engines (codex-setup / guild-setup /
 *     commission-post-xguild). Those run subprocesses and are
 *     exercised by live verifies + the eventual ported real-world
 *     trial.
 *   - Spider's crawl-loop dispatch. Engines are run sequentially in
 *     their dependency order to mirror what Spider would do; the
 *     Spider's own integration tests cover its loop.
 *   - probe-stacks-dump and probe-git-range — they require a real
 *     test guild on disk and a real bare repo. The pure helpers are
 *     unit-tested; the run() is exercised by live verifies.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import type {
  EngineDesign,
  EngineRunContext,
  FabricatorApi,
} from '@shardworks/fabricator-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';

import { archiveEngine } from './archive/engine.ts';
import {
  LAB_TRIAL_ARCHIVES_BOOK,
  type LabTrialArchive,
} from './archive/book.ts';
import { StacksTestStub } from './archive/test-stacks-stub.ts';
import { trialContextEngine } from './probes/trial-context.ts';
import { codexTeardownEngine } from './engines/codex-fixture.ts';
import { guildTeardownEngine } from './engines/guild-fixture.ts';
import trialShowTool from './tools/trial-show.ts';
import trialExtractTool from './tools/trial-extract.ts';
import type { LaboratoryTrialConfig } from './types.ts';
import { engines as labEngines } from './engines/index.ts';

// ── Test bootstrap ────────────────────────────────────────────────────

let tmpDirs: string[] = [];
let stacks: StacksTestStub;

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lab-integ-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Stub Clerk — minimal surface (`show`, `resolveId`) needed by
 * trial-context, trial-show, and trial-extract.
 */
function createStubClerk(writ: WritDoc): ClerkApi {
  return {
    show: async (id: string) => {
      if (id !== writ.id) throw new Error(`stub-clerk: writ "${id}" not found`);
      return writ;
    },
    resolveId: async (prefix: string) => {
      if (writ.id.startsWith(prefix)) return writ.id;
      throw new Error(`stub-clerk: no writ resolves prefix "${prefix}"`);
    },
    // Other methods unused by these tests — throw if called to surface gaps.
    post: async () => {
      throw new Error('stub-clerk: post() not implemented');
    },
    list: async () => [],
    count: async () => 0,
    countActive: async () => 0,
    tree: async () => [],
    countDescendantsByPhase: async () => ({} as Record<string, never>),
    transition: async () => writ,
    setWritStatus: async () => writ,
    setWritExt: async () => writ,
    link: async () => {
      throw new Error('stub-clerk: link() not implemented');
    },
    links: async () => ({ outbound: [], inbound: [] }),
    unlink: async () => undefined,
    edit: async () => writ,
    listWritTypes: () => [],
    listKinds: async () => [],
  } as unknown as ClerkApi;
}

/**
 * Stub Fabricator — exposes the laboratory engine bag so trial-extract
 * can resolve probe engines via `getEngineDesign`.
 */
function createStubFabricator(): FabricatorApi {
  return {
    getEngineDesign: (id: string): EngineDesign | undefined => labEngines[id],
    listEngineDesigns: () =>
      Object.entries(labEngines).map(([id, design]) => ({
        id,
        pluginId: 'laboratory',
        hasCollect: typeof design.collect === 'function',
      })),
  };
}

interface FakeGuildArgs {
  home: string;
  writ: WritDoc;
}

function installFakeGuild(args: FakeGuildArgs): void {
  const clerk = createStubClerk(args.writ);
  const fabricator = createStubFabricator();
  const fake: Guild = {
    home: args.home,
    apparatus<T>(name: string): T {
      if (name === 'stacks') return stacks.asApi() as T;
      if (name === 'clerk') return clerk as unknown as T;
      if (name === 'fabricator') return fabricator as unknown as T;
      throw new Error(`fake guild: apparatus "${name}" not provided`);
    },
    tryApparatus<T>(name: string): T | null {
      if (name === 'stacks') return stacks.asApi() as T;
      if (name === 'clerk') return clerk as unknown as T;
      if (name === 'fabricator') return fabricator as unknown as T;
      return null;
    },
    config: () => ({}),
    writeConfig: () => undefined,
    guildConfig: () => ({
      name: 'test-lab-host',
      nexus: '0.0.0-test',
      plugins: ['laboratory', 'clerk', 'stacks'],
    }),
    kits: () => [],
    apparatuses: () => [],
    failedPlugins: () => [],
    startupWarnings: () => [],
  };
  setGuild(fake);
}

beforeEach(() => {
  stacks = new StacksTestStub();
});

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

// ── Fixture builders ──────────────────────────────────────────────────

function makeTrialConfig(): LaboratoryTrialConfig {
  return {
    slug: 'integ-trial',
    fixtures: [
      { id: 'codex', engineId: 'lab.codex-setup', givens: {} },
      {
        id: 'test-guild',
        engineId: 'lab.guild-setup',
        dependsOn: ['codex'],
        givens: {},
      },
    ],
    scenario: { engineId: 'lab.commission-post-xguild', givens: {} },
    probes: [
      { id: 'context', engineId: 'lab.probe-trial-context', givens: {} },
    ],
    archive: { engineId: 'lab.archive', givens: {} },
  };
}

function makeTrialWrit(config: LaboratoryTrialConfig, id = 'w-integ-trial'): WritDoc {
  return {
    id,
    type: 'trial',
    title: 'Integration test trial',
    body: '',
    phase: 'open',
    classification: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ext: { laboratory: { config } },
  } as unknown as WritDoc;
}

function makeContext(over: Partial<EngineRunContext> = {}): EngineRunContext {
  return {
    rigId: 'rig-integ-test',
    engineId: 'engine',
    upstream: {},
    ...over,
  };
}

const TRIAL_INJECTED = {
  slug: 'integ-trial',
  writId: 'w-integ-trial',
};

// ── Pipeline test ─────────────────────────────────────────────────────

describe('laboratory pipeline (probe → archive → teardown gating → extract)', () => {
  it('runs probe-trial-context, persists the archive row, gates teardowns, and extracts', async () => {
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });

    // ── Phase 1: probes ────────────────────────────────────────────────

    const probeResult = await trialContextEngine.run(
      { _trial: TRIAL_INJECTED },
      makeContext({ engineId: 'probe-context' }),
    );
    assert.equal(probeResult.status, 'completed');
    const probeYields = (probeResult as { yields: Record<string, unknown> }).yields;
    assert.equal(probeYields.trialId, 'w-integ-trial');
    assert.equal(probeYields.labHostFrameworkVersion, '0.0.0-test');
    assert.deepEqual(probeYields.labHostPluginsInstalled, ['laboratory', 'clerk', 'stacks']);
    assert.deepEqual(probeYields.manifestSnapshot, makeTrialConfig());

    // ── Phase 2: archive ──────────────────────────────────────────────

    const archiveResult = await archiveEngine.run(
      { writ, _trial: TRIAL_INJECTED },
      makeContext({
        engineId: 'archive',
        upstream: { 'probe-context': probeYields },
      }),
    );
    assert.equal(archiveResult.status, 'completed');
    const archiveRows = stacks.rows('laboratory', LAB_TRIAL_ARCHIVES_BOOK) as LabTrialArchive[];
    assert.equal(archiveRows.length, 1);
    const row = archiveRows[0]!;
    assert.equal(row.trialId, 'w-integ-trial');
    assert.equal(row.probes.length, 1);
    assert.equal(row.probes[0]!.id, 'context');
    assert.equal(row.probes[0]!.engineId, 'lab.probe-trial-context');
    assert.equal((row.probes[0]!.summary as { trialId: string }).trialId, 'w-integ-trial');

    // ── Phase 3: teardown gating ───────────────────────────────────────

    // Tear down both fixtures — archive row is in place, so the gate
    // permits both. The teardowns themselves no-op past the safety
    // check (no real codex/guild on disk to remove); they should yield
    // the expected shape and exit cleanly.
    const guildTeardownResult = await guildTeardownEngine.run(
      { _trial: TRIAL_INJECTED, guildName: 'integ-test-guild' },
      makeContext({ engineId: 'fixture-test-guild-teardown' }),
    );
    assert.equal(guildTeardownResult.status, 'completed');

    // Codex teardown still requires a Scriptorium — without it, the
    // engine throws when listing codexes. Skip that branch in this
    // synthetic pipeline; the codex-teardown gate is fully covered by
    // codex-fixture.test.ts (which provides a stub Scriptorium).

    // ── Phase 4: tools ────────────────────────────────────────────────

    // trial-show — find the row via the tool surface.
    const showResult = (await trialShowTool.handler({ trialId: 'w-integ-trial' })) as LabTrialArchive;
    assert.equal(showResult.id, row.id);
    assert.deepEqual(showResult.probes, row.probes);

    // trial-extract — write to a fresh dir, then assert the expected files.
    const extractDir = makeTmpDir('extract');
    const extractResult = (await trialExtractTool.handler({
      trialId: 'w-integ-trial',
      to: extractDir,
    })) as {
      filesWritten: number;
      files: Array<{ path: string }>;
      skippedProbes: Array<{ id: string; reason: string }>;
    };
    assert.ok(extractResult.filesWritten >= 3, 'expected at least manifest + readme + trial-context yaml');
    const filePaths = extractResult.files.map((f) => f.path);
    assert.ok(filePaths.includes('manifest.yaml'));
    assert.ok(filePaths.includes('README.md'));
    assert.ok(filePaths.includes('trial-context.yaml'));
    assert.deepEqual(extractResult.skippedProbes, []);

    // Files are actually present.
    assert.ok(fs.existsSync(path.join(extractDir, 'manifest.yaml')));
    assert.ok(fs.existsSync(path.join(extractDir, 'README.md')));
    assert.ok(fs.existsSync(path.join(extractDir, 'trial-context.yaml')));

    // README references the trial.
    const readme = fs.readFileSync(path.join(extractDir, 'README.md'), 'utf8');
    assert.ok(readme.includes('w-integ-trial'));
    assert.ok(readme.includes('lab.probe-trial-context'));
  });

  it('refuses extraction when no archive row exists', async () => {
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });
    // Note: no archive row seeded.

    const extractDir = makeTmpDir('extract');
    await assert.rejects(
      () => trialExtractTool.handler({ trialId: 'w-integ-trial', to: extractDir }) as Promise<unknown>,
      /no archive row for trialId/,
    );
  });

  it('refuses teardown when no archive row exists for the trial', async () => {
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });
    // Note: no archive row seeded.

    await assert.rejects(
      () =>
        guildTeardownEngine.run(
          { _trial: TRIAL_INJECTED, guildName: 'integ-test-guild' },
          makeContext({ engineId: 'fixture-test-guild-teardown' }),
        ),
      /no archive row exists for trialId/,
    );
  });

  it('refuses extraction into a non-empty target dir without --force', async () => {
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });

    // Seed an archive row so the trialId resolves.
    stacks.seed(
      { ownerId: 'laboratory', bookName: LAB_TRIAL_ARCHIVES_BOOK },
      {
        id: 'lar-test',
        trialId: 'w-integ-trial',
        archivedAt: new Date().toISOString(),
        probes: [],
      } as LabTrialArchive,
    );

    const extractDir = makeTmpDir('extract');
    fs.writeFileSync(path.join(extractDir, 'pre-existing.txt'), 'data');

    await assert.rejects(
      () => trialExtractTool.handler({ trialId: 'w-integ-trial', to: extractDir }) as Promise<unknown>,
      /not empty.*--force/,
    );

    // With --force, succeeds.
    const result = (await trialExtractTool.handler({
      trialId: 'w-integ-trial',
      to: extractDir,
      force: true,
    })) as { filesWritten: number };
    assert.ok(result.filesWritten >= 2);
  });

  it('reports skipped probes when an archived engineId has no extract handler', async () => {
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });

    // Seed an archive row referencing an engine that exists but has
    // no extract() — exercises the type guard's "skipped" path.
    stacks.seed(
      { ownerId: 'laboratory', bookName: LAB_TRIAL_ARCHIVES_BOOK },
      {
        id: 'lar-skip',
        trialId: 'w-integ-trial',
        archivedAt: new Date().toISOString(),
        probes: [
          {
            id: 'fake',
            engineId: 'lab.commission-post-xguild', // real engine, but not a probe
            summary: { hello: 'world' },
          },
        ],
      } as LabTrialArchive,
    );

    const extractDir = makeTmpDir('extract');
    const result = (await trialExtractTool.handler({
      trialId: 'w-integ-trial',
      to: extractDir,
    })) as {
      skippedProbes: Array<{ id: string; engineId: string; reason: string }>;
    };
    assert.equal(result.skippedProbes.length, 1);
    assert.equal(result.skippedProbes[0]!.engineId, 'lab.commission-post-xguild');
    assert.match(result.skippedProbes[0]!.reason, /no extract\(\) handler/);
  });

  it('reports skipped probes when an archived engineId is unregistered', async () => {
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });

    stacks.seed(
      { ownerId: 'laboratory', bookName: LAB_TRIAL_ARCHIVES_BOOK },
      {
        id: 'lar-unreg',
        trialId: 'w-integ-trial',
        archivedAt: new Date().toISOString(),
        probes: [
          {
            id: 'orphan',
            engineId: 'lab.probe-future-thing', // does not exist
            summary: {},
          },
        ],
      } as LabTrialArchive,
    );

    const extractDir = makeTmpDir('extract');
    const result = (await trialExtractTool.handler({
      trialId: 'w-integ-trial',
      to: extractDir,
    })) as {
      skippedProbes: Array<{ id: string; engineId: string; reason: string }>;
    };
    assert.equal(result.skippedProbes.length, 1);
    assert.match(result.skippedProbes[0]!.reason, /not registered/);
  });

  it('codexTeardownEngine no longer requires upstream.archive — only the persisted row', async () => {
    // Regression pin for c-momkqtn5: the old check (context.upstream.archive
    // defined) is gone; the new check queries lab-trial-archives directly.
    const home = makeTmpDir('lab-host');
    const writ = makeTrialWrit(makeTrialConfig());
    installFakeGuild({ home, writ });
    stacks.seed(
      { ownerId: 'laboratory', bookName: LAB_TRIAL_ARCHIVES_BOOK },
      {
        id: 'lar-tighten',
        trialId: 'w-integ-trial',
        archivedAt: new Date().toISOString(),
        probes: [],
      } as LabTrialArchive,
    );

    // Zero upstream entries — would have failed under the old check.
    // Codex teardown still needs Scriptorium — the test asserts the
    // archive-presence check passes, so the throw downstream is from
    // missing Scriptorium, NOT from the safety check.
    await assert.rejects(
      () =>
        codexTeardownEngine.run(
          {
            upstreamRepo: '/tmp/upstream',
            baseSha: 'a'.repeat(40),
            codexName: 'codex-test',
            _trial: TRIAL_INJECTED,
          },
          makeContext({ engineId: 'fixture-codex-teardown', upstream: {} }),
        ),
      // Specifically NOT /no archive row exists/ — the gate passed,
      // we threw on a downstream step (Scriptorium missing in the
      // fake guild). The error message identifies that.
      /apparatus "codexes" not provided/,
    );
  });
});
