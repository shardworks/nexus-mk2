/**
 * lab.probe-trial-context — captures rig + framework + plugin context
 * for a trial. Summary-only: no bulk book; the summary IS the data.
 *
 * What it captures (in `yields`, persisted into the archive row's
 * `probes[].summary`):
 *
 *   - rigId                    — the rig executing this trial.
 *   - rigTemplate              — the template the rig was instantiated from.
 *   - labHostFrameworkVersion  — the `nexus` field from the LAB-HOST's
 *                                guild.json. Tells you what apparatus
 *                                orchestrated the trial. Distinct from
 *                                the trial-pinned version (which lives
 *                                in `manifestSnapshot.frameworkVersion`
 *                                and is what the TEST GUILD was
 *                                bootstrapped against).
 *   - labHostPluginsInstalled  — the LAB-HOST's plugin list. Same
 *                                lab-host-side scope.
 *   - manifestSnapshot         — the trial writ's `ext.laboratory.config`
 *                                verbatim (preserved against future
 *                                writ edits). The trial-pinned
 *                                framework version is here at
 *                                `manifestSnapshot.frameworkVersion`.
 *   - capturedAt               — ISO timestamp.
 *
 * The two-version pattern is deliberate: a trial captures both the
 * orchestration version (lab-host) and the execution version (test
 * guild's bootstrap pin). Cross-version trials may run a v0.5 lab-host
 * orchestrating a v0.7 test guild; analysis queries that filter by
 * "what version was tested" should use the manifest snapshot.
 *
 * GIVENS
 * ──────
 *   trialId : string?  — Optional. The trial writ id. When omitted,
 *                        falls back to the framework-injected
 *                        `_trial.writId`. Throws when neither is
 *                        available.
 *
 * EXTRACT
 * ───────
 *   Materializes the captured summary as `<targetDir>/trial-context.yaml`.
 *   Reads the summary back from `lab-trial-archives.probes[].summary`
 *   so the on-disk extract matches what queries see.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { guild } from '@shardworks/nexus-core';
import type {
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { SpiderApi, RigDoc } from '@shardworks/spider-apparatus';
import type { ReadOnlyBook, StacksApi } from '@shardworks/stacks-apparatus';
import type { LaboratoryTrialConfig } from '../types.ts';
import type { InjectedTrialContext } from '../engines/phases.ts';
import {
  LAB_TRIAL_ARCHIVES_BOOK,
  type LabTrialArchive,
} from '../archive/book.ts';
import type {
  ProbeEngineDesign,
  ProbeExtractArgs,
  ProbeExtractResult,
} from './types.ts';

const DESIGN_ID = 'lab.probe-trial-context';
const RELATIVE_OUTPUT_PATH = 'trial-context.yaml';

interface ResolvedGivens {
  trialId: string;
}

function validateGivens(rawGivens: Record<string, unknown>): ResolvedGivens {
  let trialId = rawGivens.trialId;
  if (trialId === undefined || trialId === null) {
    const trial = rawGivens._trial as InjectedTrialContext | undefined;
    if (trial && typeof trial.writId === 'string' && trial.writId.length > 0) {
      trialId = trial.writId;
    }
  }
  if (typeof trialId !== 'string' || trialId.length === 0) {
    throw new Error(
      `[${DESIGN_ID}] trialId is required (givens.trialId or framework-injected _trial.writId).`,
    );
  }
  return { trialId };
}

export interface TrialContextSummary {
  /** Trial writ id this context describes. */
  trialId: string;
  /** Rig id executing the trial. */
  rigId: string;
  /**
   * Rig template name (the unqualified key used in supportKit
   * contributions). Null when the rig metadata doesn't carry it.
   */
  rigTemplate: string | null;
  /**
   * `nexus` field from the LAB-HOST's guild.json — the framework
   * version of the apparatus orchestrating the trial. Distinct from
   * the trial-pinned version that bootstrapped the test guild
   * (`manifestSnapshot.frameworkVersion`).
   */
  labHostFrameworkVersion: string;
  /** The LAB-HOST's installed plugin list (`guildConfig.plugins`). */
  labHostPluginsInstalled: string[];
  /** The trial writ's `ext.laboratory.config` verbatim. */
  manifestSnapshot: LaboratoryTrialConfig;
  /** ISO timestamp when this context was captured. */
  capturedAt: string;
}

/**
 * Look up the rig template name from a rig doc. The Spider stamps the
 * template name on the rig under varying field names depending on
 * version — try the conventional `templateId` and `template` slots
 * defensively.
 */
function readRigTemplate(rig: RigDoc | null | undefined): string | null {
  if (!rig) return null;
  const candidate =
    (rig as { templateId?: unknown }).templateId ??
    (rig as { template?: unknown }).template ??
    null;
  return typeof candidate === 'string' ? candidate : null;
}

async function runTrialContext(
  rawGivens: Record<string, unknown>,
  context: EngineRunContext,
): Promise<EngineRunResult> {
  const { trialId } = validateGivens(rawGivens);

  const labHost = guild();
  const cfg = labHost.guildConfig();

  // Read trial writ for manifest snapshot.
  const clerk = labHost.apparatus<ClerkApi>('clerk');
  let writ: WritDoc;
  try {
    writ = await clerk.show(trialId);
  } catch (err) {
    throw new Error(
      `[${DESIGN_ID}] failed to read trial writ ${trialId}: ${(err as Error).message}`,
    );
  }
  const manifestSnapshot = (writ.ext as { laboratory?: { config?: LaboratoryTrialConfig } } | undefined)
    ?.laboratory?.config;
  if (!manifestSnapshot) {
    throw new Error(
      `[${DESIGN_ID}] trial writ ${trialId} has no ext.laboratory.config — ` +
        `cannot snapshot a missing manifest.`,
    );
  }

  // Best-effort rig template lookup via Spider.
  let rigTemplate: string | null = null;
  const spider = labHost.tryApparatus<SpiderApi>('spider');
  if (spider) {
    try {
      const rig = await spider.show(context.rigId);
      rigTemplate = readRigTemplate(rig);
    } catch {
      // Rig may not be available (e.g. test fixtures); leave as null.
    }
  }

  const summary: TrialContextSummary = {
    trialId,
    rigId: context.rigId,
    rigTemplate,
    labHostFrameworkVersion: cfg.nexus,
    labHostPluginsInstalled: [...cfg.plugins],
    manifestSnapshot,
    capturedAt: new Date().toISOString(),
  };

  return {
    status: 'completed',
    yields: summary,
  };
}

async function extractTrialContext(args: ProbeExtractArgs): Promise<ProbeExtractResult> {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const archives: ReadOnlyBook<LabTrialArchive> = stacks.readBook<LabTrialArchive>(
    'laboratory',
    LAB_TRIAL_ARCHIVES_BOOK,
  );
  const rows = await archives.find({ where: [['trialId', '=', args.trialId]] });
  if (rows.length === 0) {
    throw new Error(
      `[${DESIGN_ID} extractor] no archive row for trialId=${args.trialId}; ` +
        `the trial may have failed before reaching the archive engine.`,
    );
  }
  const probe = rows[0]!.probes.find((p) => p.engineId === DESIGN_ID);
  if (!probe) {
    // Probe wasn't part of this trial — silent no-op.
    return { files: [] };
  }

  await mkdir(args.targetDir, { recursive: true });
  const fullPath = path.join(args.targetDir, RELATIVE_OUTPUT_PATH);
  const yamlText = yamlStringify(probe.summary);
  await writeFile(fullPath, yamlText, 'utf8');
  return {
    files: [
      { path: RELATIVE_OUTPUT_PATH, bytes: Buffer.byteLength(yamlText, 'utf8') },
    ],
  };
}

export const trialContextEngine: ProbeEngineDesign = {
  id: DESIGN_ID,
  run: runTrialContext,
  extract: extractTrialContext,
};
