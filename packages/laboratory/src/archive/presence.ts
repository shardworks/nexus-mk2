/**
 * Archive-presence safety check — used by teardown engines to refuse
 * to teardown a fixture before the trial's archive row has landed.
 *
 * Tightening from the prior "context.upstream.archive defined" check:
 * we now read directly from `lab-trial-archives` and require a row
 * with the trial's id. This is robust against rig assembly mistakes
 * (a teardown chain that bypasses the archive engine) AND against
 * future scenarios where archive yields might be re-shaped without
 * the teardowns noticing.
 *
 * The check requires a `trialId` — the engines pull it from their
 * framework-injected `_trial.writId`.
 *
 * Tracked at click c-momkqtn5.
 */

import { guild } from '@shardworks/nexus-core';
import type { ReadOnlyBook, StacksApi } from '@shardworks/stacks-apparatus';
import type { InjectedTrialContext } from '../engines/phases.ts';
import { LAB_TRIAL_ARCHIVES_BOOK, type LabTrialArchive } from './book.ts';

/**
 * Resolve the trial id from a fixture engine's givens. Mirrors the
 * `_trial`-fallback pattern used by codexName / guildName resolution
 * in the fixture engines.
 */
export function resolveTrialIdForTeardown(
  rawGivens: Record<string, unknown>,
  designId: string,
): string {
  const trial = rawGivens._trial as InjectedTrialContext | undefined;
  if (trial && typeof trial.writId === 'string' && trial.writId.length > 0) {
    return trial.writId;
  }
  if (typeof rawGivens.trialId === 'string' && rawGivens.trialId.length > 0) {
    return rawGivens.trialId;
  }
  throw new Error(
    `[${designId}] cannot resolve trialId for archive-presence check: framework-injected ` +
      `_trial.writId is missing and no explicit givens.trialId was supplied.`,
  );
}

/**
 * Throw if no `lab-trial-archives` row exists for `trialId`. The
 * archive engine writes its row atomically once it completes; absence
 * of a row means archive hasn't run (or failed before persisting),
 * and the teardown must not proceed.
 */
export async function assertArchiveRowExists(
  trialId: string,
  designId: string,
  fixtureLabel: string,
): Promise<void> {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const archives: ReadOnlyBook<LabTrialArchive> = stacks.readBook<LabTrialArchive>(
    'laboratory',
    LAB_TRIAL_ARCHIVES_BOOK,
  );
  const count = await archives.count([['trialId', '=', trialId]]);
  if (count === 0) {
    throw new Error(
      `[${designId}] refusing to teardown ${fixtureLabel}: no archive row exists for ` +
        `trialId=${trialId}. The archive engine must complete (write its row to ` +
        `${LAB_TRIAL_ARCHIVES_BOOK}) before fixture teardown can run.`,
    );
  }
}
