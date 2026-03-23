import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { guildhallWorktreePath } from './nexus-home.ts';
import { readGuildConfig, writeGuildConfig } from './guild-config.ts';

const DIR_MAP: Record<string, string> = {
  implements: 'implements',
  engines: 'engines',
  curricula: 'training/curricula',
  temperaments: 'training/temperaments',
};

/** The registries in guild.json that can contain tools, in search order. */
const REGISTRIES = ['implements', 'engines', 'curricula', 'temperaments'] as const;

export interface RemoveToolOptions {
  home: string;
  name: string;
  /** Restrict to a specific category. If omitted, searches all registries. */
  category?: 'implements' | 'engines' | 'curricula' | 'temperaments';
}

export interface RemoveResult {
  category: 'implements' | 'engines' | 'curricula' | 'temperaments';
  name: string;
  slot: string;
  removedFrom: string;
}

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/**
 * Remove a tool from the guild — deregister from guild.json and delete from disk.
 *
 * Only guild-managed tools can be removed. Framework (nexus) tools are managed
 * by `nexus repair` / `nexus install`.
 */
export function removeTool(opts: RemoveToolOptions): RemoveResult {
  const { home, name } = opts;
  const worktree = guildhallWorktreePath(home);
  const config = readGuildConfig(home);

  // Find the tool in guild.json
  const searchIn = opts.category ? [opts.category] : REGISTRIES;
  let foundCategory: typeof REGISTRIES[number] | undefined;

  for (const cat of searchIn) {
    if (config[cat][name]) {
      foundCategory = cat;
      break;
    }
  }

  if (!foundCategory) {
    throw new Error(`Tool "${name}" not found in guild.json.`);
  }

  const entry = config[foundCategory][name];
  const slot = 'slot' in entry ? entry.slot : '';

  // Prevent removal of framework tools
  if ('source' in entry && entry.source === 'nexus') {
    throw new Error(
      `"${name}" is a framework tool (source: nexus). Use "nexus repair" to manage framework tools.`,
    );
  }

  // Remove on-disk directory (the specific slot)
  const parentDir = DIR_MAP[foundCategory];
  const toolDir = path.join(worktree, parentDir, name, slot);
  const toolParent = path.join(worktree, parentDir, name);

  if (fs.existsSync(toolDir)) {
    fs.rmSync(toolDir, { recursive: true });
  }
  // Remove the parent name directory if now empty
  if (fs.existsSync(toolParent) && fs.readdirSync(toolParent).length === 0) {
    fs.rmdirSync(toolParent);
  }

  // Deregister from guild.json
  delete config[foundCategory][name];
  writeGuildConfig(home, config);

  // Commit
  git(['add', '-A'], worktree);
  git(['commit', '-m', `Remove ${foundCategory.slice(0, -1)} ${name}`], worktree);

  return { category: foundCategory, name, slot, removedFrom: toolDir };
}
