/**
 * lab.archive — write the archive index row for a trial.
 *
 * Reads probe summaries from `context.upstream` and writes one atomic
 * row to `lab-trial-archives` describing which probes ran in this
 * trial and what each yielded as a summary.
 *
 * Per-engine atomicity: the rig grafts probes ahead of the archive
 * engine; each probe writes its bulk data atomically inside its own
 * SQLite transaction. The archive engine writes its index row
 * atomically once. Trials whose rigs failed before reaching archive
 * simply have no matching row; orphan probe rows are tolerated and
 * filtered out by every analytical query (joins start from
 * `lab-trial-archives` outward).
 *
 * Probe discovery: walks `context.upstream` for entries keyed
 * `probe-<id>` (the engine-id naming convention from
 * engines/phases.ts → PROBE_ID). Pairing the probe id back to its
 * engineId requires reading the trial config off the writ — same
 * `writ` given the phase orchestrators receive.
 *
 * GIVENS
 * ──────
 *   writ : WritDoc   — the trial writ (passed by the archive-phase
 *                      orchestrator). Its `ext.laboratory.config.probes`
 *                      provides the {probeId → engineId} mapping.
 *
 * SUMMARY (yields)
 * ────────────────
 *   {
 *     archiveId       : string,
 *     trialId         : string,
 *     probeCount      : number,
 *     archivedAt      : string,
 *   }
 */

import { guild, generateId } from '@shardworks/nexus-core';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { Book, StacksApi } from '@shardworks/stacks-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';
import type { LaboratoryTrialConfig } from '../types.ts';
import { PROBE_ID } from '../engines/phases.ts';
import {
  LAB_TRIAL_ARCHIVES_BOOK,
  type ArchivedProbeEntry,
  type LabTrialArchive,
} from './book.ts';

const DESIGN_ID = 'lab.archive';

interface ResolvedGivens {
  writ: WritDoc;
  config: LaboratoryTrialConfig;
}

function validateGivens(rawGivens: Record<string, unknown>): ResolvedGivens {
  const writ = rawGivens.writ as WritDoc | undefined;
  if (!writ || typeof writ.id !== 'string') {
    throw new Error(
      `[${DESIGN_ID}] missing required given "writ" — the rig template must pass \${writ}.`,
    );
  }
  const config = (writ.ext as { laboratory?: { config?: LaboratoryTrialConfig } } | undefined)
    ?.laboratory?.config;
  if (!config) {
    throw new Error(
      `[${DESIGN_ID}] trial writ ${writ.id} missing ext.laboratory.config.`,
    );
  }
  return { writ, config };
}

/**
 * Pair each probe declaration with the matching upstream yield. Built
 * from the trial config (`probes[]`) so the archive sees probes
 * exactly in declaration order regardless of crawl-completion order.
 *
 * Probes whose engines yielded nothing useful (e.g. failed but the
 * upstream chain still propagated) appear as empty-summary entries —
 * the archive captures the engineId for diagnostic reach without
 * fabricating fields. Probes whose upstream key is missing entirely
 * are an orchestration bug; we throw to surface it.
 */
export function buildProbeEntries(
  config: LaboratoryTrialConfig,
  upstream: Record<string, unknown>,
): ArchivedProbeEntry[] {
  const entries: ArchivedProbeEntry[] = [];
  for (const probe of config.probes) {
    const key = PROBE_ID(probe.id);
    const yields = upstream[key];
    if (yields === undefined) {
      throw new Error(
        `[${DESIGN_ID}] probe "${probe.id}" (engine ${probe.engineId}) has no upstream yields ` +
          `— archive engine should run after every probe (PROBE_ID="${key}" missing from context.upstream).`,
      );
    }
    const summary =
      yields !== null && typeof yields === 'object' && !Array.isArray(yields)
        ? (yields as Record<string, unknown>)
        : { value: yields };
    entries.push({
      id: probe.id,
      engineId: probe.engineId,
      summary,
    });
  }
  return entries;
}

export const archiveEngine: EngineDesign = {
  id: DESIGN_ID,
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const { writ, config } = validateGivens(rawGivens);
    const probes = buildProbeEntries(config, context.upstream);

    const labHost = guild();
    const stacks = labHost.apparatus<StacksApi>('stacks');
    const archives: Book<LabTrialArchive> = stacks.book<LabTrialArchive>(
      'laboratory',
      LAB_TRIAL_ARCHIVES_BOOK,
    );

    const archive: LabTrialArchive = {
      id: generateId('lar', 6),
      trialId: writ.id,
      archivedAt: new Date().toISOString(),
      probes,
    };

    // Atomicity: a single put() runs in its own transaction. The row
    // either lands in full or not at all — orphan probe rows from a
    // mid-archive failure are impossible because the put hasn't
    // happened.
    await archives.put(archive);

    return {
      status: 'completed',
      yields: {
        archiveId: archive.id,
        trialId: archive.trialId,
        probeCount: probes.length,
        archivedAt: archive.archivedAt,
      },
    };
  },
};
