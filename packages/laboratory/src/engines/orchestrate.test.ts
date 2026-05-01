/**
 * Tests for lab.orchestrate's pure graft-building logic.
 *
 * The graft builder takes a LaboratoryTrialConfig and returns the
 * RigTemplateEngine[] chain the rig executes. These tests cover the
 * shape contracts the spider's graft-handling logic depends on:
 *
 *   - fixture topo sort
 *   - upstream wiring (head → setups → scenario → probes → archive
 *     → teardowns in reverse)
 *   - cycle detection
 *   - unknown-dependency rejection
 *   - tail identification (graftTail must match the last engine in
 *     the chain so spider knows when the rig is done)
 *   - teardown engine id derivation (convention vs. override)
 *   - empty-fixtures, empty-probes, single-fixture variants
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraft, topoSortFixtures } from './orchestrate.ts';
import type { LaboratoryTrialConfig, TrialFixtureDecl } from '../types.ts';

const HEAD = 'orchestrate';

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
    assert.throws(
      () => topoSortFixtures(fixtures),
      /cycle/i,
    );
  });

  it('throws on unknown dependsOn reference', () => {
    const fixtures = [fixture('a', { dependsOn: ['ghost'] })];
    assert.throws(
      () => topoSortFixtures(fixtures),
      /unknown fixture "ghost"/,
    );
  });

  it('throws on duplicate fixture ids', () => {
    const fixtures = [fixture('a'), fixture('a')];
    assert.throws(
      () => topoSortFixtures(fixtures),
      /duplicate fixture id/,
    );
  });
});

// ── buildGraft: shape ───────────────────────────────────────────────

describe('buildGraft — empty fixtures & probes', () => {
  it('produces scenario + archive only when no fixtures or probes', () => {
    const { graft, tail } = buildGraft(trialConfig(), HEAD);
    assert.equal(graft.length, 2);
    assert.deepEqual(
      graft.map((e) => e.id),
      ['scenario', 'archive'],
    );
    assert.equal(tail, 'archive');
  });

  it('scenario upstream is the head engine when no fixtures', () => {
    const { graft } = buildGraft(trialConfig(), HEAD);
    const scenario = graft.find((e) => e.id === 'scenario')!;
    assert.deepEqual(scenario.upstream, [HEAD]);
  });

  it('archive upstream is scenario when no probes', () => {
    const { graft } = buildGraft(trialConfig(), HEAD);
    const archive = graft.find((e) => e.id === 'archive')!;
    assert.deepEqual(archive.upstream, ['scenario']);
  });
});

describe('buildGraft — fixture wiring', () => {
  it('first wave of fixture-setups upstreams the head engine', () => {
    const { graft } = buildGraft(
      trialConfig({ fixtures: [fixture('codex'), fixture('test-guild')] }),
      HEAD,
    );
    const codexSetup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    const guildSetup = graft.find((e) => e.id === 'fixture-test-guild-setup')!;
    assert.deepEqual(codexSetup.upstream, [HEAD]);
    assert.deepEqual(guildSetup.upstream, [HEAD]);
  });

  it('dependent fixture upstreams its dependency', () => {
    const { graft } = buildGraft(
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

  it('scenario waits on every fixture-setup', () => {
    const { graft } = buildGraft(
      trialConfig({ fixtures: [fixture('codex'), fixture('test-guild')] }),
      HEAD,
    );
    const scenario = graft.find((e) => e.id === 'scenario')!;
    assert.deepEqual(
      scenario.upstream!.sort(),
      ['fixture-codex-setup', 'fixture-test-guild-setup'].sort(),
    );
  });
});

describe('buildGraft — probe wiring', () => {
  it('every probe upstreams scenario; archive upstreams every probe', () => {
    const { graft } = buildGraft(
      trialConfig({
        probes: [
          { id: 'stacks', engineId: 'lab.probe-stacks-dump', givens: {} },
          { id: 'git', engineId: 'lab.probe-git-range', givens: {} },
        ],
      }),
      HEAD,
    );
    const stacks = graft.find((e) => e.id === 'probe-stacks')!;
    const git = graft.find((e) => e.id === 'probe-git')!;
    const archive = graft.find((e) => e.id === 'archive')!;
    assert.deepEqual(stacks.upstream, ['scenario']);
    assert.deepEqual(git.upstream, ['scenario']);
    assert.deepEqual(archive.upstream!.sort(), ['probe-git', 'probe-stacks']);
  });
});

describe('buildGraft — teardown wiring', () => {
  it('teardowns run in reverse topo order, sequential chain rooted at archive', () => {
    const { graft, tail } = buildGraft(
      trialConfig({
        fixtures: [
          fixture('codex'),
          fixture('test-guild', { dependsOn: ['codex'] }),
        ],
      }),
      HEAD,
    );
    const guildTeardown = graft.find((e) => e.id === 'fixture-test-guild-teardown')!;
    const codexTeardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.deepEqual(guildTeardown.upstream, ['archive']);
    assert.deepEqual(codexTeardown.upstream, ['fixture-test-guild-teardown']);
    assert.equal(tail, 'fixture-codex-teardown');
  });

  it('derives teardown engine id by replacing -setup with -teardown', () => {
    const { graft } = buildGraft(
      trialConfig({ fixtures: [fixture('codex')] }),
      HEAD,
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.equal(teardown.designId, 'lab.codex-teardown');
  });

  it('falls back to "<engineId>-teardown" when setup id does not end in -setup', () => {
    const { graft } = buildGraft(
      trialConfig({
        fixtures: [
          fixture('weird', { engineId: 'lab.bootstrap' }),
        ],
      }),
      HEAD,
    );
    const teardown = graft.find((e) => e.id === 'fixture-weird-teardown')!;
    assert.equal(teardown.designId, 'lab.bootstrap-teardown');
  });

  it('honors an explicit teardownEngineId override', () => {
    const { graft } = buildGraft(
      trialConfig({
        fixtures: [
          fixture('codex', {
            engineId: 'lab.custom-setup',
            teardownEngineId: 'lab.completely-different',
          }),
        ],
      }),
      HEAD,
    );
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.equal(teardown.designId, 'lab.completely-different');
  });

  it('tail equals archive when no fixtures', () => {
    const { tail } = buildGraft(trialConfig(), HEAD);
    assert.equal(tail, 'archive');
  });
});

describe('buildGraft — given pass-through', () => {
  it('passes fixture givens to setup AND teardown engines', () => {
    const givens = { name: 'codex', remoteUrl: 'git@github.com:foo/bar' };
    const { graft } = buildGraft(
      trialConfig({
        fixtures: [fixture('codex', { givens })],
      }),
      HEAD,
    );
    const setup = graft.find((e) => e.id === 'fixture-codex-setup')!;
    const teardown = graft.find((e) => e.id === 'fixture-codex-teardown')!;
    assert.deepEqual(setup.givens, givens);
    assert.deepEqual(teardown.givens, givens);
  });

  it('passes scenario, probe, archive givens through unchanged', () => {
    const { graft } = buildGraft(
      trialConfig({
        scenario: {
          engineId: 'lab.commission-post-xguild',
          givens: { briefPath: 'files/brief.md' },
        },
        probes: [
          {
            id: 'stacks',
            engineId: 'lab.probe-stacks-dump',
            givens: { outputPath: 'stacks-export/' },
          },
        ],
        archive: { engineId: 'lab.archive', givens: { target: 'sanctum' } },
      }),
      HEAD,
    );
    const scenario = graft.find((e) => e.id === 'scenario')!;
    const probe = graft.find((e) => e.id === 'probe-stacks')!;
    const archive = graft.find((e) => e.id === 'archive')!;
    assert.deepEqual(scenario.givens, { briefPath: 'files/brief.md' });
    assert.deepEqual(probe.givens, { outputPath: 'stacks-export/' });
    assert.deepEqual(archive.givens, { target: 'sanctum' });
  });
});
