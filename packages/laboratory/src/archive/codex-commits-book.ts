/**
 * `lab-trial-codex-commits` — probe-git-range's per-commit capture book.
 *
 * One row per captured codex commit. Body holds the patch text. The
 * probe fails loud if any single diff exceeds 10MB — a tripwire, not
 * a constraint we expect to hit in practice (typical diffs are well
 * under 500KB).
 *
 * See packages/laboratory/README.md → "Archive design" → "Books".
 */

import type { BookEntry, BookSchema } from '@shardworks/stacks-apparatus';

export const LAB_TRIAL_CODEX_COMMITS_BOOK = 'lab-trial-codex-commits';

export const labTrialCodexCommitsSchema: BookSchema = {
  // Hot paths: by-trial (extract), by-trial + sequence (ordered scan
  // for patch-set reconstruction).
  indexes: ['trialId', ['trialId', 'sequence']],
};

/**
 * Big-diff tripwire — capped at 10MB per commit. The archive engine
 * fails loud at probe time when a commit's diff exceeds this; we'll
 * design blob storage if it ever bites.
 */
export const PER_DIFF_BYTE_CAP = 10 * 1024 * 1024;

/** A captured codex commit. */
export interface LabTrialCodexCommit extends BookEntry {
  id: string;
  /** FK → clerk/writs.id. */
  trialId: string;
  /** Ordinal within the trial — 0 for the commit at base+1, etc. */
  sequence: number;
  /** 40-char SHA. */
  sha: string;
  /** Commit message (subject + body, full). */
  message: string;
  /** Number of files changed. */
  filesChanged: number;
  /** Sum of inserted lines. */
  insertions: number;
  /** Sum of deleted lines. */
  deletions: number;
  /** Patch text (`git diff` output for this single commit). */
  diff: string;
}
