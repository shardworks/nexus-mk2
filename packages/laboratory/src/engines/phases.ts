/**
 * The Laboratory's phase orchestrator engines.
 *
 * The post-and-collect-default rig template enumerates five phases as
 * a backbone (setup → scenario → probes → archive → teardown), one
 * engine per phase. Each phase engine is a clockwork orchestrator: it
 * reads `writ.ext.laboratory.config`, computes the per-phase graft,
 * and returns immediately with `{ status: 'completed', graft, ...}`.
 * The grafted engines do the real work; phase orchestrators are
 * organizational.
 *
 * Phase orchestrators do not isolate data — all grafted engines
 * share a single namespace, so cross-phase upstream refs work
 * naturally. Engine ids follow stable naming conventions
 * (`fixture-<id>-setup`, `scenario`, `probe-<id>`, `archive`,
 * `fixture-<id>-teardown`); each phase derives the ids it needs
 * from the trial config without going through prior phases' yields.
 *
 * Why staged phases instead of one god orchestrator:
 *
 *   - Template documents the trial flow as the user-facing shape
 *     (the template is no longer a one-engine no-op).
 *   - Per-phase failure visibility: oculus shows
 *     `lab.probes-phase` failed, not "the orchestrator failed
 *     somewhere".
 *   - Each phase has cohesive logic (DAG sort, parallel scatter,
 *     reverse-sequential chain) — splitting them avoids one big
 *     function with phase-mode flags.
 *   - Sets up the extension point: a future plugin contributing a
 *     `lab.warmup-phase` slots into a custom template alongside
 *     existing phases without forking a god engine.
 *
 * graftTail is set only on `lab.teardown-phase` (the rig's true end
 * for completion gating). Intermediate phase orchestrators omit
 * graftTail so each next phase fires immediately when the prior
 * orchestrator returns — real work-engines wait via their explicit
 * upstream refs, not graftTail propagation.
 */

import { dirname } from 'node:path';

import type { EngineDesign, EngineRunResult } from '@shardworks/fabricator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { RigTemplateEngine, SpiderEngineRunResult } from '@shardworks/spider-apparatus';
import type { LaboratoryTrialConfig, TrialFixtureDecl } from '../types.ts';

// ── Shared helpers ─────────────────────────────────────────────────

/**
 * Stable engine-id naming conventions. Every phase derives the ids
 * it needs from the trial config using these helpers — no
 * cross-phase data flow is required for naming.
 */
export const SETUP_ID = (fixtureId: string): string => `fixture-${fixtureId}-setup`;
export const TEARDOWN_ID = (fixtureId: string): string => `fixture-${fixtureId}-teardown`;
export const SCENARIO_ID = 'scenario';
export const PROBE_ID = (probeId: string): string => `probe-${probeId}`;
export const ARCHIVE_ID = 'archive';

/**
 * Convention: derive a fixture's teardown engine id from its setup
 * engine id when no explicit override is provided. Replaces a
 * trailing `-setup` with `-teardown`. If the setup id does not end
 * in `-setup`, appends `-teardown`.
 */
export function deriveTeardownEngineId(fixture: TrialFixtureDecl): string {
  if (fixture.teardownEngineId !== undefined) return fixture.teardownEngineId;
  if (fixture.engineId.endsWith('-setup')) {
    return fixture.engineId.replace(/-setup$/, '-teardown');
  }
  return `${fixture.engineId}-teardown`;
}

/**
 * Topologically sort fixtures by dependsOn. Every fixture appears
 * after all of its dependencies. Stable: among fixtures whose
 * dependencies are all already placed, declaration order is
 * preserved.
 *
 * Throws on cycles, unknown dependsOn references, or duplicate ids.
 */
export function topoSortFixtures(fixtures: TrialFixtureDecl[]): TrialFixtureDecl[] {
  const byId = new Map<string, TrialFixtureDecl>();
  for (const fixture of fixtures) {
    if (byId.has(fixture.id)) {
      throw new Error(`[lab] duplicate fixture id: "${fixture.id}"`);
    }
    byId.set(fixture.id, fixture);
  }

  for (const fixture of fixtures) {
    for (const dep of fixture.dependsOn ?? []) {
      if (!byId.has(dep)) {
        throw new Error(
          `[lab] fixture "${fixture.id}" dependsOn unknown fixture "${dep}"`,
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
      throw new Error(`[lab] fixture dependsOn cycle among: ${ids}`);
    }
  }

  return result;
}

/**
 * Read and validate the trial config from a writ. All phase
 * orchestrators share this entry path — fail-loud on missing
 * config so the manifest CLI's validation contract is the only
 * gate.
 */
function readTrialConfig(givens: Record<string, unknown>, phaseEngineId: string): {
  writ: WritDoc;
  config: LaboratoryTrialConfig;
} {
  const writ = givens.writ as WritDoc | undefined;
  if (!writ) {
    throw new Error(
      `[${phaseEngineId}] missing required given "writ" — the rig template must pass \${writ}.`,
    );
  }
  const config = (writ.ext as { laboratory?: { config?: LaboratoryTrialConfig } } | undefined)
    ?.laboratory?.config;
  if (!config) {
    throw new Error(
      `[${phaseEngineId}] trial writ ${writ.id} missing ext.laboratory.config — manifest CLI should reject this at post time.`,
    );
  }
  return { writ, config };
}

// ── Trial-context injection ────────────────────────────────────────

/**
 * Trial-level context auto-injected into every grafted work engine's
 * givens under the `_trial` key. Engines read this for trial-aware
 * defaulting (e.g. codex-setup deriving its codexName from slug+writId
 * when the manifest doesn't supply one explicitly).
 *
 * The underscore prefix marks the key as framework-injected; manifest
 * authors should not set `_trial` themselves. Author-supplied `_trial`
 * (if any) is overwritten — the orchestrator's view of trial context
 * is authoritative.
 */
export interface InjectedTrialContext {
  /** The trial slug. */
  slug: string;
  /** The trial writ id (the canonical id for this trial). */
  writId: string;
  /** The fixture's id within the trial — only present on fixture engines. */
  fixtureId?: string;
  /**
   * Resolved framework-version pin (from `config.frameworkVersion` —
   * trial-post.ts resolves an undefined manifest value from the
   * lab-host's VERSION before stamping the writ, so this is always
   * set on a posted trial). lab.guild-setup uses this for the
   * `npx -p @shardworks/nexus@<spec> nsg init …` bootstrap.
   */
  frameworkVersion?: string;
  /**
   * Absolute directory containing the manifest file. Engines resolve
   * relative path givens (e.g. `files[].sourcePath`, `briefPath`)
   * against this. Derived at injection time from the writ's stamped
   * `config.manifestPath` (set by `lab-trial-post`). Absent when
   * `manifestPath` is missing from the writ's config — engines fall
   * back to absolute-only validation in that case.
   */
  manifestDir?: string;
}

function withTrialContext(
  givens: Record<string, unknown>,
  trial: InjectedTrialContext,
): Record<string, unknown> {
  // Strip undefined fields so engines can use plain `if (trial.x)` checks
  // and tests can deep-equal against the minimal shape they expect.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(trial)) {
    if (v !== undefined) clean[k] = v;
  }
  return { ...givens, _trial: clean };
}

/**
 * Derive `manifestDir` from a config's stamped `manifestPath`. The
 * dir is the canonical anchor for resolving manifest-relative path
 * givens at engine-execution time. Returns undefined when the writ
 * lacks `manifestPath` (legacy writs posted before the field was
 * introduced, or writs posted via paths that bypass `lab-trial-post`).
 */
function manifestDirFromConfig(config: LaboratoryTrialConfig): string | undefined {
  return config.manifestPath !== undefined ? dirname(config.manifestPath) : undefined;
}

// ── Per-phase graft builders (pure; tested directly) ───────────────

/**
 * Build the setup phase's graft: one engine per fixture, in topo
 * order. A fixture's setup engine upstreams its dependsOn fixtures'
 * setup engines (or the head — `headEngineId` — when it has no
 * deps).
 *
 * Each fixture engine's givens get an injected `_trial` block carrying
 * the trial slug, writ id, and fixture id (see InjectedTrialContext).
 */
export function buildSetupGraft(
  config: LaboratoryTrialConfig,
  headEngineId: string,
  writId: string,
): { graft: RigTemplateEngine[]; ordered: TrialFixtureDecl[] } {
  const ordered = topoSortFixtures(config.fixtures);
  const graft: RigTemplateEngine[] = [];
  for (const fixture of ordered) {
    const deps = fixture.dependsOn ?? [];
    const upstream = deps.length > 0 ? deps.map(SETUP_ID) : [headEngineId];
    graft.push({
      id: SETUP_ID(fixture.id),
      designId: fixture.engineId,
      upstream,
      givens: withTrialContext(fixture.givens, {
        slug: config.slug,
        writId,
        fixtureId: fixture.id,
        frameworkVersion: config.frameworkVersion,
        manifestDir: manifestDirFromConfig(config),
      }),
    });
  }
  return { graft, ordered };
}

/**
 * Build the scenario phase's graft: one engine for the scenario.
 * Upstreams every fixture's setup engine, so it waits for the full
 * setup wave to complete. When there are no fixtures, upstreams
 * the head (the scenario phase orchestrator's own id).
 */
export function buildScenarioGraft(
  config: LaboratoryTrialConfig,
  headEngineId: string,
  writId: string,
): RigTemplateEngine[] {
  const upstream =
    config.fixtures.length > 0
      ? topoSortFixtures(config.fixtures).map((f) => SETUP_ID(f.id))
      : [headEngineId];
  return [
    {
      id: SCENARIO_ID,
      designId: config.scenario.engineId,
      upstream,
      givens: withTrialContext(config.scenario.givens, {
        slug: config.slug,
        writId,
        frameworkVersion: config.frameworkVersion,
        manifestDir: manifestDirFromConfig(config),
      }),
    },
  ];
}

/**
 * Build the probes phase's graft: one engine per probe. Each probe
 * upstreams the scenario engine; probes themselves run in parallel.
 */
export function buildProbesGraft(
  config: LaboratoryTrialConfig,
  writId: string,
): RigTemplateEngine[] {
  return config.probes.map((probe) => ({
    id: PROBE_ID(probe.id),
    designId: probe.engineId,
    upstream: [SCENARIO_ID],
    givens: withTrialContext(probe.givens, {
      slug: config.slug,
      writId,
      frameworkVersion: config.frameworkVersion,
      manifestDir: manifestDirFromConfig(config),
    }),
  }));
}

/**
 * Build the archive phase's graft: one archive engine. Upstreams
 * every probe engine; or the scenario engine when there are no
 * probes.
 */
export function buildArchiveGraft(
  config: LaboratoryTrialConfig,
  writId: string,
): RigTemplateEngine[] {
  const upstream =
    config.probes.length > 0
      ? config.probes.map((p) => PROBE_ID(p.id))
      : [SCENARIO_ID];
  return [
    {
      id: ARCHIVE_ID,
      designId: config.archive.engineId,
      upstream,
      givens: withTrialContext(
        {
          // Pass the trial writ explicitly through Spider's
          // ${writ} substitution — the static template uses the
          // same mechanism for the five phase orchestrators, so
          // grafted engines that need the writ doc get it the
          // same way. Spider's resolveGivens substitutes at
          // graft-spawn time (see plugins/spider/src/spider.ts
          // around the processGrafts handler).
          writ: '${writ}',
          ...config.archive.givens,
        },
        {
          slug: config.slug,
          writId,
          frameworkVersion: config.frameworkVersion,
          manifestDir: manifestDirFromConfig(config),
        },
      ),
    },
  ];
}

/**
 * Build the teardown phase's graft: one engine per fixture, REVERSE
 * topo order, sequential chain rooted at archive. Sequential (not
 * parallel) so a teardown failure stops the chain rather than
 * shredding sibling teardowns concurrently.
 *
 * Returns the graft and the tail engine id (the rig's true end —
 * teardown phase sets graftTail to this for completion gating).
 */
export function buildTeardownGraft(
  config: LaboratoryTrialConfig,
  writId: string,
): { graft: RigTemplateEngine[]; tail: string } {
  const ordered = topoSortFixtures(config.fixtures);
  const graft: RigTemplateEngine[] = [];
  let prevTail: string = ARCHIVE_ID;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const fixture = ordered[i]!;
    const id = TEARDOWN_ID(fixture.id);
    graft.push({
      id,
      designId: deriveTeardownEngineId(fixture),
      upstream: [prevTail],
      givens: withTrialContext(fixture.givens, {
        slug: config.slug,
        writId,
        fixtureId: fixture.id,
        frameworkVersion: config.frameworkVersion,
        manifestDir: manifestDirFromConfig(config),
      }),
    });
    prevTail = id;
  }
  return { graft, tail: prevTail };
}

// ── Phase orchestrator engines ─────────────────────────────────────

const setupPhaseEngine: EngineDesign = {
  id: 'lab.setup-phase',
  async run(givens, context): Promise<EngineRunResult> {
    const { writ, config } = readTrialConfig(givens, 'lab.setup-phase');
    const { graft, ordered } = buildSetupGraft(config, context.engineId, writ.id);
    const result: SpiderEngineRunResult = {
      status: 'completed',
      yields: {
        fixtureCount: ordered.length,
        fixtureIds: ordered.map((f) => f.id),
      },
      graft,
      // graftTail intentionally unset: the scenario engine has
      //   explicit upstream refs into each fixture-setup, so the
      //   scenario phase can fire immediately upon this engine's
      //   return without waiting for fixtures to complete first.
    };
    return result as EngineRunResult;
  },
};

const scenarioPhaseEngine: EngineDesign = {
  id: 'lab.scenario-phase',
  async run(givens, context): Promise<EngineRunResult> {
    const { writ, config } = readTrialConfig(givens, 'lab.scenario-phase');
    const graft = buildScenarioGraft(config, context.engineId, writ.id);
    const result: SpiderEngineRunResult = {
      status: 'completed',
      yields: { scenarioEngine: config.scenario.engineId },
      graft,
    };
    return result as EngineRunResult;
  },
};

const probesPhaseEngine: EngineDesign = {
  id: 'lab.probes-phase',
  async run(givens): Promise<EngineRunResult> {
    const { writ, config } = readTrialConfig(givens, 'lab.probes-phase');
    const graft = buildProbesGraft(config, writ.id);
    const result: SpiderEngineRunResult = {
      status: 'completed',
      yields: {
        probeCount: config.probes.length,
        probeIds: config.probes.map((p) => p.id),
      },
      graft,
    };
    return result as EngineRunResult;
  },
};

const archivePhaseEngine: EngineDesign = {
  id: 'lab.archive-phase',
  async run(givens): Promise<EngineRunResult> {
    const { writ, config } = readTrialConfig(givens, 'lab.archive-phase');
    const graft = buildArchiveGraft(config, writ.id);
    const result: SpiderEngineRunResult = {
      status: 'completed',
      yields: { archiveEngine: config.archive.engineId },
      graft,
    };
    return result as EngineRunResult;
  },
};

const teardownPhaseEngine: EngineDesign = {
  id: 'lab.teardown-phase',
  async run(givens): Promise<EngineRunResult> {
    const { writ, config } = readTrialConfig(givens, 'lab.teardown-phase');
    const { graft, tail } = buildTeardownGraft(config, writ.id);
    const result: SpiderEngineRunResult = {
      status: 'completed',
      yields: { teardownCount: config.fixtures.length },
      graft,
      // graftTail set: this is the rig's true end. Spider waits
      //   for `tail` to complete before considering the rig done.
      //   When there are no fixtures, tail equals ARCHIVE_ID — the
      //   archive engine is the last real work in that case.
      graftTail: tail,
    };
    return result as EngineRunResult;
  },
};

export const phaseEngines = {
  'lab.setup-phase': setupPhaseEngine,
  'lab.scenario-phase': scenarioPhaseEngine,
  'lab.probes-phase': probesPhaseEngine,
  'lab.archive-phase': archivePhaseEngine,
  'lab.teardown-phase': teardownPhaseEngine,
} as const;
