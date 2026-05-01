/**
 * lab-trial-show — print archive metadata + probe summaries for a trial.
 *
 * CLI surface (auto-grouped once two `lab-` tools exist):
 *
 *     nsg lab trial-show <trialId>
 *
 * Reads from `lab-trial-archives` and pretty-prints the row plus its
 * probe summaries. Returns the row as a JSON-serializable object so
 * `--format json` (handled by the framework's tool surface) returns
 * the raw data.
 *
 * Errors loud when no archive row exists for the trial — keeps the
 * "trial failed before archive" case visible rather than returning
 * an empty result that looks like success.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import {
  LAB_TRIAL_ARCHIVES_BOOK,
  type LabTrialArchive,
} from '../archive/book.ts';

export default tool({
  name: 'lab-trial-show',
  description: 'Show the archive metadata and probe summaries for a trial.',
  instructions:
    'Reads lab-trial-archives for the given trialId and returns the archive row ' +
    '({id, trialId, archivedAt, probes:[{id, engineId, summary}]}). Errors when no archive ' +
    'row exists — that means the trial failed before reaching its archive engine.',
  params: {
    trialId: z
      .string()
      .min(1)
      .describe('The trial writ id (or any unambiguous prefix).'),
  },
  permission: 'read',
  handler: async ({ trialId }) => {
    const labHost = guild();

    // Resolve a possibly-prefixed trialId via Clerk's id-resolver — same
    // affordance commission-post and friends offer.
    const clerk = labHost.apparatus<ClerkApi>('clerk');
    const fullId = await clerk.resolveId(trialId);

    const stacks = labHost.apparatus<StacksApi>('stacks');
    const archives = stacks.readBook<LabTrialArchive>(
      'laboratory',
      LAB_TRIAL_ARCHIVES_BOOK,
    );
    const rows = await archives.find({
      where: [['trialId', '=', fullId]],
    });
    if (rows.length === 0) {
      throw new Error(
        `lab-trial-show: no archive row for trialId=${fullId}. The trial may have ` +
          `failed before reaching its archive engine, or the trial id is not a ` +
          `laboratory trial. Run \`nsg writ-show ${fullId}\` to inspect the writ itself.`,
      );
    }
    if (rows.length > 1) {
      throw new Error(
        `lab-trial-show: found ${rows.length} archive rows for trialId=${fullId} — ` +
          `expected exactly one. This is an apparatus invariant violation; please report.`,
      );
    }
    return rows[0]!;
  },
});
