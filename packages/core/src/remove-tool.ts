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
 * Read a JSON file.
 */
function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Determine the npm package name for a tool from its slot descriptor's `package` field.
 * Returns null if the tool was not npm-installed.
 */
function getPackageName(worktree: string, category: string, name: string, slot: string): string | null {
  const parentDir = DIR_MAP[category];
  const slotDir = path.join(worktree, parentDir, name, slot);

  // Check all possible descriptor files
  const descriptorFiles = ['nexus-implement.json', 'nexus-engine.json', 'nexus-curriculum.json', 'nexus-temperament.json'];
  for (const descriptorFile of descriptorFiles) {
    const descriptorPath = path.join(slotDir, descriptorFile);
    if (fs.existsSync(descriptorPath)) {
      const descriptor = readJson(descriptorPath);
      return (descriptor['package'] as string) ?? null;
    }
  }
  return null;
}

/**
 * Remove a tool from the guild — deregister from guild.json and delete from disk.
 *
 * For npm-installed tools, also runs `npm uninstall` to clean up node_modules.
 * For linked tools, removes the symlink from node_modules.
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

  // Clean up npm-installed packages from node_modules
  const packageName = getPackageName(worktree, foundCategory, name, slot);
  if (packageName) {
    const linkPath = path.join(worktree, 'node_modules', packageName);
    if (fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink()) {
      // Linked tool: just remove the symlink
      fs.unlinkSync(linkPath);
      // Clean up empty scoped directory if needed
      const scopeDir = path.dirname(linkPath);
      if (scopeDir !== path.join(worktree, 'node_modules') &&
          fs.existsSync(scopeDir) && fs.readdirSync(scopeDir).length === 0) {
        fs.rmdirSync(scopeDir);
      }
    } else {
      // npm-installed tool: use npm uninstall
      try {
        execFileSync('npm', ['uninstall', packageName], { cwd: worktree, stdio: 'pipe' });
      } catch {
        // If npm uninstall fails (e.g. package already gone), continue with cleanup
      }
    }
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
