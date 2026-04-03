/**
 * Instrument review trigger.
 *
 * When a writ reaches a terminal state (completed or failed), fire off
 * the instrument review suite (instrument-review.sh), which delegates to
 * the generic instrument runner for each instrument. Fire-and-forget —
 * the review takes minutes and writes its own artifacts.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { ResolvedConfig, WritLike } from './types.ts';

/**
 * Trigger instrument review suite for a completed/failed writ.
 *
 * Shells out to bin/instrument-review.sh, which runs the spec-blind
 * quality scorer, spec-aware quality scorer, and codebase integration
 * scorer via the generic runner.
 * Fire-and-forget — we don't await the result.
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
  const scriptPath = path.join(config.sanctumHome, 'bin', 'instrument-review.sh');

  if (!fs.existsSync(scriptPath)) {
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
  const outputDir = path.join(config.commissionsDataDir, writ.id);
  const args: string[] = [
    '--commission', writ.id,
    '--repo', bareClone,
    '--output-dir', outputDir,
  ];

  if (hasSpec) {
    args.push('--spec-file', specFile);
  }

  // Fire and forget
  const child = execFile(scriptPath, args, {
    cwd: config.sanctumHome,
    timeout: 900_000, // 15 minute timeout (integration scorer needs clone+build)
  });

  // Detach — don't hold the process
  child.unref();
}
