import path from 'node:path';

/**
 * Resolve NEXUS_HOME from the environment.
 * @throws If `NEXUS_HOME` is not set.
 */
export function resolveNexusHome(): string {
  const home = process.env['NEXUS_HOME'];
  if (!home) {
    throw new Error('NEXUS_HOME is not set. Run `nexus init <path>` to create a guild, then set NEXUS_HOME to that path.');
  }
  return path.resolve(home);
}

/** Path to the guildhall bare git repo. */
export function guildhallBarePath(home: string): string {
  return path.join(home, 'guildhall');
}

/** Path to the guildhall's standing worktree (`worktrees/guildhall/main`). */
export function guildhallWorktreePath(home: string): string {
  return path.join(home, 'worktrees', 'guildhall', 'main');
}

/** Path to the Ledger SQLite database. */
export function ledgerPath(home: string): string {
  return path.join(home, 'nexus.db');
}

/** Path to the top-level worktrees directory. */
export function worktreesPath(home: string): string {
  return path.join(home, 'worktrees');
}
