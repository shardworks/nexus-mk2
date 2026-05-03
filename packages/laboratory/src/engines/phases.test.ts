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
const WRIT_ID = 'w-momen904-e8cd1359f754';

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
    const { graft, ordered } = buildSetupGraft(trialConfig(), HEAD, WRIT_ID);
    assert.deepEqual(graft, []);
    assert.deepEqual(ordered, []);
  });

  it('first wave of fixture-setups upstreams the head engine', () => {
    const { graft } = buildSetupGraft(
      trialConfig({ fixtures: [fixture('codex'), fixture('test-guild')] }),
      HEAD,
      WRIT_ID,
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
      WRIT_ID,
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
      WRIT_ID,
    );
    assert.deepEqual(ordered.map((f) => f.id), ['parent', 'child']);
  });

  it('passes fixture givens through and injects _trial context', () => {
    const givens = { name: 'codex', remoteUrl: 'git@github.com:foo/bar' };
    const { graft } = buildSetupGraft(
      trialConfig({ slug: 'demo', fixtures: [fixture('codex', { givens })] }),
      HEAD,
      WRIT_ID,
    );
    const setup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    assert.deepEqual(setup.givens, {
      ...givens,
      _trial: { slug: 'demo', writId: WRIT_ID, fixtureId: 'codex' },
    });
  });
});

// ── buildScenarioGraft ─────────────────────────────────────────────

describe('buildScenarioGraft', () => {
  it('upstreams the head engine when no fixtures', () => {
    const graft = buildScenarioGraft(trialConfig(), HEAD, WRIT_ID);
    assert.equal(graft.length, 1);
    assert.equal(graft[0]!.id, 'scenario');
    assert.deepEqual(graft[0]!.upstream, [HEAD]);
  });

  it('upstreams every fixture-setup', () => {
    const graft = buildScenarioGraft(
      trialConfig({ fixtures: [fixture('codex'), fixture('test-guild')] }),
      HEAD,
      WRIT_ID,
    );
    assert.deepEqual(
      [...graft[0]!.upstream!].sort(),
      ['fixture-codex-setup', 'fixture-test-guild-setup'].sort(),
    );
  });

  it('passes scenario givens through and injects _trial context', () => {
    const graft = buildScenarioGraft(
      trialConfig({
        slug: 'demo',
        scenario: {
          engineId: 'lab.commission-post-xguild',
          givens: { briefPath: 'files/brief.md' },
        },
      }),
      HEAD,
      WRIT_ID,
    );
    assert.deepEqual(graft[0]!.givens, {
      briefPath: 'files/brief.md',
      _trial: { slug: 'demo', writId: WRIT_ID },
    });
  });

  it('uses the scenario engine id from config', () => {
    const graft = buildScenarioGraft(
      trialConfig({
        scenario: { engineId: 'custom.scenario', givens: {} },
      }),
      HEAD,
      WRIT_ID,
    );
    assert.equal(graft[0]!.designId, 'custom.scenario');
  });
});

// ── buildProbesGraft ───────────────────────────────────────────────

describe('buildProbesGraft', () => {
  it('produces empty graft for no probes', () => {
    const graft = buildProbesGraft(trialConfig(), WRIT_ID);
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
      WRIT_ID,
    );
    const stacks = graft.find((e) => e.id === 'probe-stacks')!;
    const git = graft.find((e) => e.id === 'probe-git')!;
    assert.deepEqual(stacks.upstream, ['scenario']);
    assert.deepEqual(git.upstream, ['scenario']);
  });

  it('passes probe givens through and injects _trial context', () => {
    const graft = buildProbesGraft(
      trialConfig({
        slug: 'demo',
        probes: [
          {
            id: 'stacks',
            engineId: 'lab.probe-stacks-dump',
            givens: { outputPath: 'stacks-export/' },
          },
        ],
      }),
      WRIT_ID,
    );
    assert.deepEqual(graft[0]!.givens, {
      outputPath: 'stacks-export/',
      _trial: { slug: 'demo', writId: WRIT_ID },
    });
  });
});

// ── buildArchiveGraft ──────────────────────────────────────────────

describe('buildArchiveGraft', () => {
  it('upstreams scenario when no probes', () => {
    const graft = buildArchiveGraft(trialConfig(), WRIT_ID);
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
      WRIT_ID,
    );
    assert.deepEqual(
      [...graft[0]!.upstream!].sort(),
      ['probe-git', 'probe-stacks'],
    );
  });

  it('passes archive givens through and injects _trial context + ${writ}', () => {
    const graft = buildArchiveGraft(
      trialConfig({
        slug: 'demo',
        archive: { engineId: 'lab.archive', givens: { target: 'sanctum' } },
      }),
      WRIT_ID,
    );
    // The archive engine reads the writ via givens.writ; the orchestrator
    // injects the Spider's `${writ}` substitution placeholder so
    // resolveGivens (in spider.ts) substitutes the writ doc at graft-
    // spawn time. Same mechanism the static template uses for its
    // pre-graft engines.
    assert.deepEqual(graft[0]!.givens, {
      writ: '${writ}',
      target: 'sanctum',
      _trial: { slug: 'demo', writId: WRIT_ID },
    });
  });

  it('lets author-supplied givens.writ override the framework injection', () => {
    // Defensive — manifest authors who explicitly set a writ field
    // override the default. The test pins this so a future spread-order
    // change doesn't silently flip the precedence.
    const graft = buildArchiveGraft(
      trialConfig({
        slug: 'demo',
        archive: { engineId: 'lab.archive', givens: { writ: 'custom' } },
      }),
      WRIT_ID,
    );
    assert.equal(graft[0]!.givens!.writ, 'custom');
  });
});

// ── buildTeardownGraft ─────────────────────────────────────────────

describe('buildTeardownGraft', () => {
  it('returns archive as tail when there are no fixtures', () => {
    const { graft, tail } = buildTeardownGraft(trialConfig(), WRIT_ID);
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
      WRIT_ID,
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
      WRIT_ID,
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.equal(teardown.designId, 'lab.codex-teardown');
  });

  it('falls back to "<engineId>-teardown" when setup id does not end in -setup', () => {
    const { graft } = buildTeardownGraft(
      trialConfig({
        fixtures: [fixture('weird', { engineId: 'lab.bootstrap' })],
      }),
      WRIT_ID,
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
      WRIT_ID,
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.equal(teardown.designId, 'lab.completely-different');
  });

  it('passes fixture givens to teardown engines and injects _trial context', () => {
    const givens = { name: 'codex', remoteUrl: 'git@github.com:foo/bar' };
    const { graft } = buildTeardownGraft(
      trialConfig({ slug: 'demo', fixtures: [fixture('codex', { givens })] }),
      WRIT_ID,
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.deepEqual(teardown.givens, {
      ...givens,
      _trial: { slug: 'demo', writId: WRIT_ID, fixtureId: 'codex' },
    });
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
    const { graft: setupGraft } = buildSetupGraft(config, 'lab.setup-phase', WRIT_ID);
    const scenarioGraft = buildScenarioGraft(config, 'lab.scenario-phase', WRIT_ID);
    const probesGraft = buildProbesGraft(config, WRIT_ID);
    const archiveGraft = buildArchiveGraft(config, WRIT_ID);
    const { graft: teardownGraft, tail } = buildTeardownGraft(config, WRIT_ID);

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

// ── _trial.manifestDir injection (manifest-relative path support) ───

describe('_trial.manifestDir injection', () => {
  const MANIFEST_PATH = '/workspace/exp/X019/manifests/with-tool.yaml';
  const EXPECTED_DIR = '/workspace/exp/X019/manifests';

  it('injects manifestDir into setup graft engines when config.manifestPath is set', () => {
    const { graft } = buildSetupGraft(
      trialConfig({ manifestPath: MANIFEST_PATH, fixtures: [fixture('codex')] }),
      HEAD,
      WRIT_ID,
    );
    const setup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    const trial = (setup.givens as { _trial: Record<string, unknown> })._trial;
    assert.equal(trial.manifestDir, EXPECTED_DIR);
  });

  it('injects manifestDir into scenario graft when config.manifestPath is set', () => {
    const graft = buildScenarioGraft(
      trialConfig({ manifestPath: MANIFEST_PATH }),
      HEAD,
      WRIT_ID,
    );
    const trial = (graft[0]!.givens as { _trial: Record<string, unknown> })._trial;
    assert.equal(trial.manifestDir, EXPECTED_DIR);
  });

  it('injects manifestDir into probes graft when config.manifestPath is set', () => {
    const graft = buildProbesGraft(
      trialConfig({
        manifestPath: MANIFEST_PATH,
        probes: [{ id: 'p1', engineId: 'lab.probe-trial-context', givens: {} }],
      }),
      WRIT_ID,
    );
    const trial = (graft[0]!.givens as { _trial: Record<string, unknown> })._trial;
    assert.equal(trial.manifestDir, EXPECTED_DIR);
  });

  it('injects manifestDir into archive graft when config.manifestPath is set', () => {
    const graft = buildArchiveGraft(
      trialConfig({ manifestPath: MANIFEST_PATH }),
      WRIT_ID,
    );
    const trial = (graft[0]!.givens as { _trial: Record<string, unknown> })._trial;
    assert.equal(trial.manifestDir, EXPECTED_DIR);
  });

  it('injects manifestDir into teardown graft when config.manifestPath is set', () => {
    const { graft } = buildTeardownGraft(
      trialConfig({ manifestPath: MANIFEST_PATH, fixtures: [fixture('codex')] }),
      WRIT_ID,
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    const trial = (teardown.givens as { _trial: Record<string, unknown> })._trial;
    assert.equal(trial.manifestDir, EXPECTED_DIR);
  });

  it('omits manifestDir when config.manifestPath is undefined (legacy fallback)', () => {
    const { graft } = buildSetupGraft(
      trialConfig({ fixtures: [fixture('codex')] }),  // no manifestPath
      HEAD,
      WRIT_ID,
    );
    const setup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    const trial = (setup.givens as { _trial: Record<string, unknown> })._trial;
    assert.equal('manifestDir' in trial, false);
  });
});
