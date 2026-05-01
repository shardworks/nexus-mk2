/**
 * lab-trial-export-book — stream one source book for analysis pipelines.
 *
 * CLI surface:
 *
 *     nsg lab trial-export-book <trialId> --book <name> [--format jsonl|json]
 *
 * Reads `lab-trial-stacks-dumps` rows where `trialId == <id>` and
 * `sourceBook == <name>`, projects the row's `body` field, and writes
 * either JSONL (one row per line, default) or a JSON array to stdout.
 *
 * Defaults to `jsonl` because the typical consumer is an analysis
 * pipeline that streams records one at a time. JSON mode is provided
 * for callers that prefer a single parseable object.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import {
  LAB_TRIAL_STACKS_DUMPS_BOOK,
  type LabTrialStacksDump,
} from '../archive/stacks-dumps-book.ts';

export default tool({
  name: 'lab-trial-export-book',
  description: 'Export one source book\'s captured rows for a trial.',
  instructions:
    'Reads lab-trial-stacks-dumps for (trialId, sourceBook) and prints the body of each ' +
    'row as either JSONL (default — one row per line) or a JSON array. Useful for piping ' +
    'into analysis tools or `duckdb`.',
  params: {
    trialId: z.string().min(1).describe('The trial writ id (or any unambiguous prefix).'),
    book: z
      .string()
      .min(1)
      .describe(
        'Source book identifier. Use the form `<owner>/<book>` (e.g. `animator/sessions`) ' +
        'or the raw `books_…` table name. Run `lab-trial-show <trialId>` to see what was captured.',
      ),
    format: z
      .enum(['jsonl', 'json'])
      .optional()
      .describe('Output format. Defaults to `jsonl`.'),
  },
  permission: 'read',
  handler: async ({ trialId, book, format }) => {
    const labHost = guild();
    const fmt = format ?? 'jsonl';
    const clerk = labHost.apparatus<ClerkApi>('clerk');
    const fullId = await clerk.resolveId(trialId);

    const stacks = labHost.apparatus<StacksApi>('stacks');
    const dumps = stacks.readBook<LabTrialStacksDump>(
      'laboratory',
      LAB_TRIAL_STACKS_DUMPS_BOOK,
    );
    const rows = await dumps.find({
      where: [
        ['trialId', '=', fullId],
        ['sourceBook', '=', book],
      ],
      orderBy: [['sourceRowId', 'asc']],
    });

    if (rows.length === 0) {
      // Don't error — empty result is a valid signal. The caller can
      // verify via `lab-trial-show` whether the probe ran at all.
      // Returning `{ ok: true, rows: 0 }` for the structured caller;
      // streaming output is empty for the CLI consumer.
      return { ok: true, rows: 0, format: fmt };
    }

    if (fmt === 'json') {
      process.stdout.write(JSON.stringify(rows.map((r) => r.body), null, 2));
      process.stdout.write('\n');
    } else {
      // jsonl
      for (const row of rows) {
        process.stdout.write(JSON.stringify(row.body));
        process.stdout.write('\n');
      }
    }

    return { ok: true, rows: rows.length, format: fmt };
  },
});
