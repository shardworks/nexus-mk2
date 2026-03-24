/**
 * Worktree Setup Engine
 *
 * Creates isolated git worktrees for commission sessions. When an anima is
 * dispatched to work on a commission, this engine:
 *
 * 1. Creates a new git branch for the commission
 * 2. Sets up a git worktree pointing at that branch
 * 3. Returns the worktree path so the manifest engine can launch the
 *    session in the correct working directory
 *
 * Worktrees provide isolation — each commission gets its own working copy
 * of the repo, so multiple animas can work concurrently without conflicts
 * in the working directory.
 *
 * ## Directory layout
 *
 * Worktrees are created under NEXUS_HOME/worktrees/commissions/:
 *
 *   NEXUS_HOME/
 *     worktrees/
 *       guildhall/main/     ← standing guildhall worktree
 *       commissions/
 *         commission-42/    ← worktree for commission #42
 *         commission-57/    ← worktree for commission #57
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { guildhallBarePath, worktreesPath } from '@shardworks/nexus-core';

export interface WorktreeConfig {
  /** Absolute path to NEXUS_HOME. */
  home: string;
  /** Commission ID — used to derive branch name and worktree directory. */
  commissionId: number;
  /** Base branch to create the worktree from (default: 'main'). */
  baseBranch?: string;
}

export interface WorktreeResult {
  /** Absolute path to the created worktree. */
  path: string;
  /** Branch name created for the worktree. */
  branch: string;
  /** Commission ID this worktree serves. */
  commissionId: number;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/**
 * Create a git worktree for a commission session.
 *
 * Creates a new branch from the base branch and sets up a worktree in
 * NEXUS_HOME/worktrees/commissions/commission-{id}/.
 *
 * @throws If the worktree or branch already exists.
 */
export function setupWorktree(config: WorktreeConfig): WorktreeResult {
  const { home, commissionId, baseBranch = 'main' } = config;
  const bareRepo = guildhallBarePath(home);
  const branch = `commission-${commissionId}`;
  const worktreeDir = path.join(worktreesPath(home), 'commissions', branch);

  if (fs.existsSync(worktreeDir)) {
    throw new Error(
      `Worktree directory already exists: ${worktreeDir}. ` +
      `Commission ${commissionId} may already have an active worktree.`,
    );
  }

  // Create parent directory
  fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });

  // Create branch and worktree in one operation
  // git worktree add -b <branch> <path> <base>
  git(['worktree', 'add', '-b', branch, worktreeDir, baseBranch], bareRepo);

  return { path: worktreeDir, branch, commissionId };
}

/**
 * Remove a worktree after a commission session completes.
 *
 * Removes the worktree directory and prunes it from git's tracking.
 * Does NOT delete the branch — the branch should be kept for history
 * until explicitly merged or pruned.
 */
export function teardownWorktree(home: string, commissionId: number): void {
  const bareRepo = guildhallBarePath(home);
  const branch = `commission-${commissionId}`;
  const worktreeDir = path.join(worktreesPath(home), 'commissions', branch);

  if (!fs.existsSync(worktreeDir)) {
    throw new Error(
      `Worktree not found: ${worktreeDir}. Commission ${commissionId} may not have an active worktree.`,
    );
  }

  // Remove the worktree
  git(['worktree', 'remove', worktreeDir], bareRepo);

  // Clean up the commissions/ directory if empty
  const commissionsDir = path.join(worktreesPath(home), 'commissions');
  if (fs.existsSync(commissionsDir) && fs.readdirSync(commissionsDir).length === 0) {
    fs.rmdirSync(commissionsDir);
  }
}

/**
 * List active commission worktrees.
 */
export function listWorktrees(home: string): WorktreeResult[] {
  const commissionsDir = path.join(worktreesPath(home), 'commissions');

  if (!fs.existsSync(commissionsDir)) return [];

  const entries = fs.readdirSync(commissionsDir, { withFileTypes: true });
  const results: WorktreeResult[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const match = entry.name.match(/^commission-(\d+)$/);
    if (!match) continue;

    results.push({
      path: path.join(commissionsDir, entry.name),
      branch: entry.name,
      commissionId: parseInt(match[1]!, 10),
    });
  }

  return results;
}
