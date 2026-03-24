/**
 * rehydrate — reconstruct node_modules from git-tracked guild state.
 *
 * After a fresh clone, the guild's node_modules is empty. This function:
 * 1. Runs `npm install` to resolve registry/git-url deps from package.json
 * 2. For each tool with full source in its slot (workshop/tarball), runs
 *    `npm install --no-save <slot-path>` to install from the tracked source
 * 3. Reports any linked tools that need to be re-linked manually
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readGuildConfig } from './guild-config.ts';
import type { ToolEntry } from './guild-config.ts';

/** Map category -> on-disk parent directory (relative to guild root). */
const DIR_MAP: Record<string, string> = {
  implements: 'implements',
  engines: 'engines',
  curricula: 'training/curricula',
  temperaments: 'training/temperaments',
};

export interface RehydrateResult {
  /** Tools restored from package.json (registry/git-url). */
  fromPackageJson: number;
  /** Tools restored from slot source (workshop/tarball). */
  fromSlotSource: string[];
  /** Tools that need manual re-linking. */
  needsRelink: string[];
}

/**
 * Rehydrate a guild's node_modules from tracked state.
 *
 * Idempotent and safe to run at any time.
 */
export function rehydrate(home: string): RehydrateResult {
  const result: RehydrateResult = {
    fromPackageJson: 0,
    fromSlotSource: [],
    needsRelink: [],
  };

  // 1. Run npm install to resolve registry/git-url deps from package.json
  const pkgPath = path.join(home, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const depCount = Object.keys(pkg.dependencies ?? {}).length;
    if (depCount > 0) {
      execFileSync('npm', ['install'], { cwd: home, stdio: 'pipe' });
      result.fromPackageJson = depCount;
    }
  }

  // 2. Scan guild.json for tools that have full source in their slot
  const config = readGuildConfig(home);

  for (const [category, registry] of Object.entries({
    implements: config.implements,
    engines: config.engines,
  })) {
    for (const [name, entry] of Object.entries(registry)) {
      const toolEntry = entry as ToolEntry;
      if (toolEntry.source === 'nexus') continue; // Framework tools don't need rehydration

      const upstream = toolEntry.upstream;
      const parentDir = DIR_MAP[category]!;
      const slotDir = path.join(home, parentDir, name, toolEntry.slot);

      // Check if this is a workshop/tarball tool with full source in slot
      if (upstream === null || (upstream && upstream.startsWith('workshop:'))) {
        // Check if slot has a package.json (indicating full source)
        const slotPkgPath = path.join(slotDir, 'package.json');
        if (fs.existsSync(slotPkgPath)) {
          // Install from slot source
          try {
            execFileSync('npm', ['install', '--no-save', slotDir], {
              cwd: home,
              stdio: 'pipe',
            });
            result.fromSlotSource.push(name);
          } catch {
            // If install fails, the tool may need manual intervention
          }
        }
      }

      // Check if this was a linked tool (no upstream, no full source in slot,
      // but has a package field in the descriptor)
      if (upstream === null) {
        const hasFullSource = fs.existsSync(path.join(slotDir, 'package.json'));
        if (!hasFullSource) {
          // This was likely a linked tool — needs manual re-linking
          result.needsRelink.push(name);
        }
      }
    }
  }

  return result;
}
