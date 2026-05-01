/**
 * `lab-trial-stacks-dumps` — probe-stacks-dump's per-row capture book.
 *
 * Generic JSON-bodied storage for every source row across every book
 * in the test guild. Querying happens via SQLite JSON1 expressions —
 * indexes are added per hot query, not pre-declared per source field.
 *
 * The probe writes one row per source-row. The archive engine has no
 * schema opinions about this book; it only records the probe's
 * summary (book counts) in `lab-trial-archives.probes[].summary`.
 *
 * See packages/laboratory/README.md → "Archive design" → "Books".
 */

import type { BookEntry, BookSchema } from '@shardworks/stacks-apparatus';

export const LAB_TRIAL_STACKS_DUMPS_BOOK = 'lab-trial-stacks-dumps';

export const labTrialStacksDumpsSchema: BookSchema = {
  // Hot lookup paths: by-trial (extract / show), by-trial+source-book
  // (per-book export). Composite index prefers (trialId, sourceBook)
  // ordering because both filters are usually applied together.
  indexes: ['trialId', 'sourceBook', ['trialId', 'sourceBook']],
};

/**
 * One captured source-row in a lab trial. Body is the source row
 * verbatim; sourceBook is the human-readable `<owner>/<book>` form
 * when resolvable, otherwise the raw SQLite table name.
 */
export interface LabTrialStacksDump extends BookEntry {
  id: string;
  /** FK → clerk/writs.id. */
  trialId: string;
  /**
   * Source-book identifier. `<ownerId>/<bookName>` when the
   * underlying table name parses cleanly against the test guild's
   * installed plugin list; otherwise the raw `books_…` table name.
   */
  sourceBook: string;
  /** The source row's `id` field, surfaced for trivial joins. */
  sourceRowId: string;
  /** ISO timestamp the probe captured this row. */
  capturedAt: string;
  /** The source row, verbatim. */
  body: Record<string, unknown>;
}
