/**
 * Quality assessment trigger.
 *
 * When a writ reaches a terminal state (completed or failed), fire off
 * the quality review script. This is fire-and-forget — the review takes
 * minutes (6 parallel API calls) and writes its own artifacts.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { ResolvedConfig, WritLike } from './types.ts';

/**
 * Trigger quality assessment for a completed/failed writ.
 *
 * Shells out to bin/quality-review-full.sh. Fire-and-forget — we don't
 * await the result. The script writes quality-blind.yaml and
 * quality-aware.yaml directly to the commission data directory.
 *
 * @param config - Resolved Laboratory config
 * @param guildHome - Absolute path to the guild root
 * @param writ - The writ document
 */
export function triggerQualityReview(
  config: ResolvedConfig,
  guildHome: string,
  writ: WritLike,
): void {
  const reviewScript = path.join(config.sanctumHome, 'bin', 'quality-review-full.sh');

  if (!fs.existsSync(reviewScript)) {
    // Script not present — silently skip
    return;
  }

  // Resolve the spec file — convention: commission.md in the data directory
  const specFile = path.join(config.commissionsDataDir, writ.id, 'commission.md');
  const hasSpec = fs.existsSync(specFile);

  // Repo path — use the guild's bare clone for the codex.
  // This matches what inscribe.sh does.
  if (!writ.codex) return; // No codex — can't determine repo

  const bareClone = path.join(guildHome, '.nexus', 'codexes', `${writ.codex}.git`);
  if (!fs.existsSync(bareClone)) return; // No bare clone — can't run

  // Build arguments
  const args: string[] = [
    '--commission', writ.id,
    '--repo', bareClone,
    '--output-dir', config.commissionsDataDir,
  ];

  if (hasSpec) {
    args.push('--spec-file', specFile);
  }

  // We don't have base/head commits from the CDC event — the writ document
  // doesn't carry them. The quality review script will auto-detect from
  // git log. This is less precise than inscribe.sh's explicit tracking,
  // but works for the common case of single-session commissions.

  // Fire and forget
  const child = execFile(reviewScript, args, {
    cwd: config.sanctumHome,
    timeout: 600_000, // 10 minute timeout as safety valve
  });

  // Detach — don't hold the process
  child.unref();
}
