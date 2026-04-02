/**
 * Git auto-commit for sanctum changes.
 *
 * After writing experiment data to the sanctum, the Laboratory commits
 * the changes to the sanctum git repo. Commits are best-effort — if a
 * commit fails (merge conflict, dirty index, etc.) we log and move on.
 */

import { execFileSync } from 'node:child_process';

/**
 * Stage and commit changes in the sanctum repo.
 *
 * @param sanctumHome - Absolute path to the sanctum root
 * @param message - Commit message
 * @param paths - Specific paths to stage (relative to sanctumHome)
 */
export function autoCommit(
  sanctumHome: string,
  message: string,
  paths: string[],
): void {
  if (paths.length === 0) return;

  try {
    // Stage specific paths
    execFileSync('git', ['add', ...paths], { cwd: sanctumHome, stdio: 'pipe' });
    // Commit — will fail silently if nothing staged (e.g. file unchanged)
    execFileSync('git', ['commit', '-m', message, '--no-verify'], { cwd: sanctumHome, stdio: 'pipe' });
  } catch {
    // Best-effort — don't throw on commit failure
  }
}
