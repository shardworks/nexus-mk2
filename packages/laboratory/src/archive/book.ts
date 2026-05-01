/**
 * `lab-trial-archives` — the archive engine's index book.
 *
 * One row per archived trial. Tiny. Written-once at archive time.
 * Row existence is the success signal; trials whose rigs failed
 * before reaching archive simply have no matching row.
 *
 * The archive engine has no schema opinions about probe data — it
 * records which probes ran and what each yielded as a summary.
 * Bulk probe data lives in per-probe books.
 *
 * Trial-level facts (manifest body, codex base SHA, plugin
 * specifications) are NOT duplicated here — they live on the trial
 * writ at `ext.laboratory.config`. Reproducibility-relevant runtime
 * facts (resolved plugin pins, framework version, rig template name)
 * are captured by `lab.probe-trial-context` and live in that probe's
 * summary.
 *
 * See packages/laboratory/README.md → "Archive design" → "Books".
 */

import type { BookEntry, BookSchema } from '@shardworks/stacks-apparatus';

/** The book name within the laboratory plugin's namespace. */
export const LAB_TRIAL_ARCHIVES_BOOK = 'lab-trial-archives';

/** Schema for `lab-trial-archives` — index by trialId for FK lookup. */
export const labTrialArchivesSchema: BookSchema = {
  indexes: ['trialId', 'archivedAt'],
};

/**
 * Per-probe entry in an archive row. The summary shape is opaque to
 * the archive engine — every probe defines its own.
 */
export interface ArchivedProbeEntry {
  /** The probe's id within the trial config (e.g. `'stacks'`). */
  id: string;
  /** The engine design id (e.g. `'lab.probe-stacks-dump'`). */
  engineId: string;
  /** Probe-defined summary. */
  summary: Record<string, unknown>;
}

/** A row in `lab-trial-archives`. */
export interface LabTrialArchive extends BookEntry {
  /** Generated archive-row id. */
  id: string;
  /** FK → clerk/writs.id. */
  trialId: string;
  /** ISO timestamp the archive engine wrote this row. */
  archivedAt: string;
  /** Per-probe records — one entry per probe that ran in the trial. */
  probes: ArchivedProbeEntry[];
}
