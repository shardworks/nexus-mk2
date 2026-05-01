/**
 * lab.orchestrate — clockwork (graft-emitting) engine.
 *
 * Head engine of the `post-and-collect-default` rig template. Reads the
 * trial config from `writ.ext.laboratory.config`, builds a dynamic
 * graft chain of fixture-setup → scenario → probes → archive →
 * fixture-teardown engines, and returns immediately with the chain
 * grafted onto the rig.
 *
 * Same pattern as `spider.implement-loop`: one head engine in the
 * template; the actual work is a runtime graft built from per-writ
 * configuration.
 *
 * Graft shape:
 *
 *   1. fixture-<id>-setup            (one per fixture, topo-ordered by dependsOn)
 *      upstream: dependsOn fixtures' setup engines
 *                — or this engine for fixtures with no deps
 *
 *   2. scenario                       (one)
 *      upstream: every fixture-setup (or this engine if no fixtures)
 *
 *   3. probe-<id>                     (one per probe; parallel siblings)
 *      upstream: scenario
 *
 *   4. archive                        (one)
 *      upstream: every probe (or scenario if no probes)
 *
 *   5. fixture-<id>-teardown          (one per fixture, REVERSE topo order, sequential chain)
 *      upstream: prior teardown — or archive for the first
 *
 * Givens flow through unchanged from the trial config: each grafted
 * engine receives the fixture/scenario/probe/archive's `givens` block
 * verbatim. Engines that need cross-engine data (e.g. probe-stacks-dump
 * needing the guild path produced by guild-setup) read it from
 * `context.upstream` at run time, same as anywhere else in the spider.
 */

import type { EngineDesign, EngineRunResult } from '@shardworks/fabricator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { RigTemplateEngine, SpiderEngineRunResult } from '@shardworks/spider-apparatus';
import type { LaboratoryTrialConfig, TrialFixtureDecl } from '../types.ts';

/**
 * Convention: derive a fixture's teardown engine id from its setup
 * engine id when no explicit override is provided. Replaces a
 * trailing `-setup` with `-teardown`. If the setup id does not end in
 * `-setup`, appends `-teardown`.
 */
function deriveTeardownEngineId(fixture: TrialFixtureDecl): string {
  if (fixture.teardownEngineId !== undefined) return fixture.teardownEngineId;
  if (fixture.engineId.endsWith('-setup')) {
    return fixture.engineId.replace(/-setup$/, '-teardown');
  }
  return `${fixture.engineId}-teardown`;
}

/**
 * Topologically sort fixtures by dependsOn. Returns an order in which
 * every fixture appears after all of its dependencies. Fails loud on
 * cycles or unknown dependsOn references.
 *
 * Stable ordering: among fixtures whose dependencies are all already
 * placed, the order matches their declaration order in the manifest.
 */
export function topoSortFixtures(fixtures: TrialFixtureDecl[]): TrialFixtureDecl[] {
  const byId = new Map<string, TrialFixtureDecl>();
  for (const fixture of fixtures) {
    if (byId.has(fixture.id)) {
      throw new Error(`[lab.orchestrate] duplicate fixture id: "${fixture.id}"`);
    }
    byId.set(fixture.id, fixture);
  }

  for (const fixture of fixtures) {
    for (const dep of fixture.dependsOn ?? []) {
      if (!byId.has(dep)) {
        throw new Error(
          `[lab.orchestrate] fixture "${fixture.id}" dependsOn unknown fixture "${dep}"`,
        );
      }
    }
  }

  const result: TrialFixtureDecl[] = [];
  const placed = new Set<string>();
  const remaining = [...fixtures];

  while (remaining.length > 0) {
    const before = remaining.length;
    for (let i = 0; i < remaining.length; i += 1) {
      const fixture = remaining[i]!;
      const deps = fixture.dependsOn ?? [];
      if (deps.every((d) => placed.has(d))) {
        result.push(fixture);
        placed.add(fixture.id);
        remaining.splice(i, 1);
        i -= 1;
      }
    }
    if (remaining.length === before) {
      const ids = remaining.map((f) => f.id).join(', ');
      throw new Error(`[lab.orchestrate] fixture dependsOn cycle among: ${ids}`);
    }
  }

  return result;
}

/**
 * Build the graft chain for a trial. Pure function — no guild access,
 * no side effects. Tested directly by the engine's tests.
 *
 * `headEngineId` is the orchestrate engine's runtime id (passed in as
 * `context.engineId` when called from `run()`). Used as the upstream
 * pointer for the first wave of graft engines (those with no
 * fixture-or-scenario predecessors in the chain).
 */
export function buildGraft(
  config: LaboratoryTrialConfig,
  headEngineId: string,
): { graft: RigTemplateEngine[]; tail: string } {
  const ordered = topoSortFixtures(config.fixtures);
  const graft: RigTemplateEngine[] = [];

  // ── 1. Fixture setups (topo order; deps drive upstream) ────
  const setupId = (fixtureId: string) => `fixture-${fixtureId}-setup`;
  const teardownId = (fixtureId: string) => `fixture-${fixtureId}-teardown`;

  for (const fixture of ordered) {
    const deps = fixture.dependsOn ?? [];
    const upstream = deps.length > 0 ? deps.map(setupId) : [headEngineId];
    graft.push({
      id: setupId(fixture.id),
      designId: fixture.engineId,
      upstream,
      givens: fixture.givens,
    });
  }

  // ── 2. Scenario (waits on every fixture setup) ──────────────
  const scenarioUpstream =
    ordered.length > 0 ? ordered.map((f) => setupId(f.id)) : [headEngineId];
  graft.push({
    id: 'scenario',
    designId: config.scenario.engineId,
    upstream: scenarioUpstream,
    givens: config.scenario.givens,
  });

  // ── 3. Probes (parallel; each waits on scenario) ────────────
  for (const probe of config.probes) {
    graft.push({
      id: `probe-${probe.id}`,
      designId: probe.engineId,
      upstream: ['scenario'],
      givens: probe.givens,
    });
  }

  // ── 4. Archive (waits on every probe; or scenario if no probes) ──
  const archiveUpstream =
    config.probes.length > 0
      ? config.probes.map((p) => `probe-${p.id}`)
      : ['scenario'];
  graft.push({
    id: 'archive',
    designId: config.archive.engineId,
    upstream: archiveUpstream,
    givens: config.archive.givens,
  });

  // ── 5. Fixture teardowns (REVERSE topo order; sequential chain) ──
  // Sequential so the rig is fail-safe — if a teardown errors, the
  // rig stops without shredding sibling teardowns concurrently.
  let prevTail = 'archive';
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const fixture = ordered[i]!;
    const id = teardownId(fixture.id);
    graft.push({
      id,
      designId: deriveTeardownEngineId(fixture),
      upstream: [prevTail],
      givens: fixture.givens,
    });
    prevTail = id;
  }

  return { graft, tail: prevTail };
}

const orchestrateEngine: EngineDesign = {
  id: 'lab.orchestrate',

  async run(givens, context): Promise<EngineRunResult> {
    const writ = givens.writ as WritDoc | undefined;
    if (!writ) {
      throw new Error(
        '[lab.orchestrate] missing required given "writ" — the rig template must pass ${writ}.',
      );
    }

    const config = (writ.ext as { laboratory?: { config?: LaboratoryTrialConfig } } | undefined)
      ?.laboratory?.config;
    if (!config) {
      throw new Error(
        `[lab.orchestrate] trial writ ${writ.id} missing ext.laboratory.config — manifest CLI should reject this at post time.`,
      );
    }

    const { graft, tail } = buildGraft(config, context.engineId);

    const result: SpiderEngineRunResult = {
      status: 'completed',
      yields: {
        fixtureCount: config.fixtures.length,
        probeCount: config.probes.length,
        graftedEngineCount: graft.length,
      },
      graft,
      graftTail: tail,
    };

    return result as EngineRunResult;
  },
};

export default orchestrateEngine;
