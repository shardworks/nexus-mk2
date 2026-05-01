/**
 * Tests for the per-phase graft builders and the topo sort helper.
 *
 * The graft builders are pure functions — given a trial config (and
 * the head engine id for setup/scenario), each returns the
 * RigTemplateEngine[] its phase contributes to the rig. Together the
 * five graft builders produce a flat engine list equivalent to what
 * the previous one-engine orchestrator produced; they're tested
 * piece-wise here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArchiveGraft,
  buildProbesGraft,
  buildScenarioGraft,
  buildSetupGraft,
  buildTeardownGraft,
  topoSortFixtures,
} from './phases.ts';
import type { LaboratoryTrialConfig, TrialFixtureDecl } from '../types.ts';

const HEAD = 'phase-head';

function trialConfig(over: Partial<LaboratoryTrialConfig> = {}): LaboratoryTrialConfig {
  return {
    slug: 'test',
    fixtures: [],
    scenario: { engineId: 'lab.commission-post-xguild', givens: {} },
    probes: [],
    archive: { engineId: 'lab.archive', givens: {} },
    ...over,
  };
}

function fixture(id: string, over: Partial<TrialFixtureDecl> = {}): TrialFixtureDecl {
  return {
    id,
    engineId: `lab.${id}-setup`,
    givens: {},
    ...over,
  };
}

// ── topoSortFixtures ────────────────────────────────────────────────

describe('topoSortFixtures', () => {
  it('preserves declaration order when there are no deps', () => {
    const fixtures = [fixture('a'), fixture('b'), fixture('c')];
    const sorted = topoSortFixtures(fixtures);
    assert.deepEqual(
      sorted.map((f) => f.id),
      ['a', 'b', 'c'],
    );
  });

  it('places dependencies before dependents', () => {
    const fixtures = [
      fixture('child', { dependsOn: ['parent'] }),
      fixture('parent'),
    ];
    const sorted = topoSortFixtures(fixtures);
    assert.deepEqual(
      sorted.map((f) => f.id),
      ['parent', 'child'],
    );
  });

  it('handles a deep chain', () => {
    const fixtures = [
      fixture('d', { dependsOn: ['c'] }),
      fixture('c', { dependsOn: ['b'] }),
      fixture('b', { dependsOn: ['a'] }),
      fixture('a'),
    ];
    const sorted = topoSortFixtures(fixtures);
    assert.deepEqual(
      sorted.map((f) => f.id),
      ['a', 'b', 'c', 'd'],
    );
  });

  it('handles diamond dependencies', () => {
    const fixtures = [
      fixture('top'),
      fixture('left', { dependsOn: ['top'] }),
      fixture('right', { dependsOn: ['top'] }),
      fixture('bottom', { dependsOn: ['left', 'right'] }),
    ];
    const sorted = topoSortFixtures(fixtures);
    const positionOf = (id: string) => sorted.findIndex((f) => f.id === id);
    assert.ok(positionOf('top') < positionOf('left'));
    assert.ok(positionOf('top') < positionOf('right'));
    assert.ok(positionOf('left') < positionOf('bottom'));
    assert.ok(positionOf('right') < positionOf('bottom'));
  });

  it('throws on a cycle', () => {
    const fixtures = [
      fixture('a', { dependsOn: ['b'] }),
      fixture('b', { dependsOn: ['a'] }),
    ];
    assert.throws(() => topoSortFixtures(fixtures), /cycle/i);
  });

  it('throws on unknown dependsOn reference', () => {
    const fixtures = [fixture('a', { dependsOn: ['ghost'] })];
    assert.throws(() => topoSortFixtures(fixtures), /unknown fixture "ghost"/);
  });

  it('throws on duplicate fixture ids', () => {
    const fixtures = [fixture('a'), fixture('a')];
    assert.throws(() => topoSortFixtures(fixtures), /duplicate fixture id/);
  });
});

// ── buildSetupGraft ────────────────────────────────────────────────

describe('buildSetupGraft', () => {
  it('produces empty graft for no fixtures', () => {
    const { graft, ordered } = buildSetupGraft(trialConfig(), HEAD);
    assert.deepEqual(graft, []);
    assert.deepEqual(ordered, []);
  });

  it('first wave of fixture-setups upstreams the head engine', () => {
    const { graft } = buildSetupGraft(
      trialConfig({ fixtures: [fixture('codex'), fixture('test-guild')] }),
      HEAD,
    );
    const codexSetup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    const guildSetup = graft.find((e) => e.id === 'fixture-test-guild-setup')!;
    assert.deepEqual(codexSetup.upstream, [HEAD]);
    assert.deepEqual(guildSetup.upstream, [HEAD]);
  });

  it('dependent fixture upstreams its dependency', () => {
    const { graft } = buildSetupGraft(
      trialConfig({
        fixtures: [
          fixture('codex'),
          fixture('test-guild', { dependsOn: ['codex'] }),
        ],
      }),
      HEAD,
    );
    const guildSetup = graft.find((e) => e.id === 'fixture-test-guild-setup')!;
    assert.deepEqual(guildSetup.upstream, ['fixture-codex-setup']);
  });

  it('returns ordered fixtures matching topo sort', () => {
    const { ordered } = buildSetupGraft(
      trialConfig({
        fixtures: [
          fixture('child', { dependsOn: ['parent'] }),
          fixture('parent'),
        ],
      }),
      HEAD,
    );
    assert.deepEqual(ordered.map((f) => f.id), ['parent', 'child']);
  });

  it('passes fixture givens to the setup engine', () => {
    const givens = { name: 'codex', remoteUrl: 'git@github.com:foo/bar' };
    const { graft } = buildSetupGraft(
      trialConfig({ fixtures: [fixture('codex', { givens })] }),
      HEAD,
    );
    const setup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    assert.deepEqual(setup.givens, givens);
  });
});

// ── buildScenarioGraft ─────────────────────────────────────────────

describe('buildScenarioGraft', () => {
  it('upstreams the head engine when no fixtures', () => {
    const graft = buildScenarioGraft(trialConfig(), HEAD);
    assert.equal(graft.length, 1);
    assert.equal(graft[0]!.id, 'scenario');
    assert.deepEqual(graft[0]!.upstream, [HEAD]);
  });

  it('upstreams every fixture-setup', () => {
    const graft = buildScenarioGraft(
      trialConfig({ fixtures: [fixture('codex'), fixture('test-guild')] }),
      HEAD,
    );
    assert.deepEqual(
      [...graft[0]!.upstream!].sort(),
      ['fixture-codex-setup', 'fixture-test-guild-setup'].sort(),
    );
  });

  it('passes scenario givens through unchanged', () => {
    const graft = buildScenarioGraft(
      trialConfig({
        scenario: {
          engineId: 'lab.commission-post-xguild',
          givens: { briefPath: 'files/brief.md' },
        },
      }),
      HEAD,
    );
    assert.deepEqual(graft[0]!.givens, { briefPath: 'files/brief.md' });
  });

  it('uses the scenario engine id from config', () => {
    const graft = buildScenarioGraft(
      trialConfig({
        scenario: { engineId: 'custom.scenario', givens: {} },
      }),
      HEAD,
    );
    assert.equal(graft[0]!.designId, 'custom.scenario');
  });
});

// ── buildProbesGraft ───────────────────────────────────────────────

describe('buildProbesGraft', () => {
  it('produces empty graft for no probes', () => {
    const graft = buildProbesGraft(trialConfig());
    assert.deepEqual(graft, []);
  });

  it('every probe upstreams scenario; probes run parallel to each other', () => {
    const graft = buildProbesGraft(
      trialConfig({
        probes: [
          { id: 'stacks', engineId: 'lab.probe-stacks-dump', givens: {} },
          { id: 'git', engineId: 'lab.probe-git-range', givens: {} },
        ],
      }),
    );
    const stacks = graft.find((e) => e.id === 'probe-stacks')!;
    const git = graft.find((e) => e.id === 'probe-git')!;
    assert.deepEqual(stacks.upstream, ['scenario']);
    assert.deepEqual(git.upstream, ['scenario']);
  });

  it('passes probe givens through unchanged', () => {
    const graft = buildProbesGraft(
      trialConfig({
        probes: [
          {
            id: 'stacks',
            engineId: 'lab.probe-stacks-dump',
            givens: { outputPath: 'stacks-export/' },
          },
        ],
      }),
    );
    assert.deepEqual(graft[0]!.givens, { outputPath: 'stacks-export/' });
  });
});

// ── buildArchiveGraft ──────────────────────────────────────────────

describe('buildArchiveGraft', () => {
  it('upstreams scenario when no probes', () => {
    const graft = buildArchiveGraft(trialConfig());
    assert.equal(graft.length, 1);
    assert.equal(graft[0]!.id, 'archive');
    assert.deepEqual(graft[0]!.upstream, ['scenario']);
  });

  it('upstreams every probe when probes exist', () => {
    const graft = buildArchiveGraft(
      trialConfig({
        probes: [
          { id: 'stacks', engineId: 'lab.probe-stacks-dump', givens: {} },
          { id: 'git', engineId: 'lab.probe-git-range', givens: {} },
        ],
      }),
    );
    assert.deepEqual(
      [...graft[0]!.upstream!].sort(),
      ['probe-git', 'probe-stacks'],
    );
  });

  it('passes archive givens through unchanged', () => {
    const graft = buildArchiveGraft(
      trialConfig({
        archive: { engineId: 'lab.archive', givens: { target: 'sanctum' } },
      }),
    );
    assert.deepEqual(graft[0]!.givens, { target: 'sanctum' });
  });
});

// ── buildTeardownGraft ─────────────────────────────────────────────

describe('buildTeardownGraft', () => {
  it('returns archive as tail when there are no fixtures', () => {
    const { graft, tail } = buildTeardownGraft(trialConfig());
    assert.deepEqual(graft, []);
    assert.equal(tail, 'archive');
  });

  it('teardowns run in reverse topo order, sequential chain rooted at archive', () => {
    const { graft, tail } = buildTeardownGraft(
      trialConfig({
        fixtures: [
          fixture('codex'),
          fixture('test-guild', { dependsOn: ['codex'] }),
        ],
      }),
    );
    const guildTeardown = graft.find((e) => e.id === 'fixture-test-guild-teardown')!;
    const codexTeardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.deepEqual(guildTeardown.upstream, ['archive']);
    assert.deepEqual(codexTeardown.upstream, ['fixture-test-guild-teardown']);
    assert.equal(tail, 'fixture-codex-teardown');
  });

  it('derives teardown engine id by replacing -setup with -teardown', () => {
    const { graft } = buildTeardownGraft(
      trialConfig({ fixtures: [fixture('codex')] }),
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.equal(teardown.designId, 'lab.codex-teardown');
  });

  it('falls back to "<engineId>-teardown" when setup id does not end in -setup', () => {
    const { graft } = buildTeardownGraft(
      trialConfig({
        fixtures: [fixture('weird', { engineId: 'lab.bootstrap' })],
      }),
    );
    const teardown = graft.find((e) => e.id === 'fixture-weird-teardown')!;
    assert.equal(teardown.designId, 'lab.bootstrap-teardown');
  });

  it('honors an explicit teardownEngineId override', () => {
    const { graft } = buildTeardownGraft(
      trialConfig({
        fixtures: [
          fixture('codex', {
            engineId: 'lab.custom-setup',
            teardownEngineId: 'lab.completely-different',
          }),
        ],
      }),
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.equal(teardown.designId, 'lab.completely-different');
  });

  it('passes fixture givens to teardown engines (same as setup)', () => {
    const givens = { name: 'codex', remoteUrl: 'git@github.com:foo/bar' };
    const { graft } = buildTeardownGraft(
      trialConfig({ fixtures: [fixture('codex', { givens })] }),
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.deepEqual(teardown.givens, givens);
  });
});

// ── End-to-end shape — five phases yield the same flat graph ───────

describe('staged-phase composition matches the unified flat graph', () => {
  it('two-fixture trial composes setup → scenario → probes → archive → teardown correctly', () => {
    const config = trialConfig({
      fixtures: [
        fixture('codex'),
        fixture('test-guild', { dependsOn: ['codex'] }),
      ],
      probes: [
        { id: 'stacks', engineId: 'lab.probe-stacks-dump', givens: {} },
      ],
    });

    // What each phase orchestrator would graft:
    const { graft: setupGraft } = buildSetupGraft(config, 'lab.setup-phase');
    const scenarioGraft = buildScenarioGraft(config, 'lab.scenario-phase');
    const probesGraft = buildProbesGraft(config);
    const archiveGraft = buildArchiveGraft(config);
    const { graft: teardownGraft, tail } = buildTeardownGraft(config);

    // Combined runtime engine list (ignoring the orchestrators
    // themselves; those live in the static template).
    const allWorkEngines = [
      ...setupGraft,
      ...scenarioGraft,
      ...probesGraft,
      ...archiveGraft,
      ...teardownGraft,
    ];

    const ids = allWorkEngines.map((e) => e.id);
    assert.deepEqual(ids, [
      'fixture-codex-setup',
      'fixture-test-guild-setup',
      'scenario',
      'probe-stacks',
      'archive',
      'fixture-test-guild-teardown',
      'fixture-codex-teardown',
    ]);

    // Cross-phase wiring: scenario waits on both fixture-setups,
    // probe waits on scenario, archive waits on probe, teardowns
    // chain back from archive in reverse topo.
    const scenario = allWorkEngines.find((e) => e.id === 'scenario')!;
    const probe = allWorkEngines.find((e) => e.id === 'probe-stacks')!;
    const archive = allWorkEngines.find((e) => e.id === 'archive')!;
    assert.deepEqual(
      [...scenario.upstream!].sort(),
      ['fixture-codex-setup', 'fixture-test-guild-setup'],
    );
    assert.deepEqual(probe.upstream, ['scenario']);
    assert.deepEqual(archive.upstream, ['probe-stacks']);
    assert.equal(tail, 'fixture-codex-teardown');
  });
});
