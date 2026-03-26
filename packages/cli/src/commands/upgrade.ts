import { createCommand } from 'commander';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planUpgrade, applyUpgrade, readGuildConfig } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

const DEFAULT_BUNDLE = '@shardworks/guild-starter-kit';

/**
 * Fetch a bundle package into a temporary location and return the path.
 * Uses --no-save so it doesn't modify the guild's package.json.
 */
function fetchBundle(home: string, bundleSpec: string): string {
  execFileSync('npm', ['install', '--no-save', bundleSpec], { cwd: home, stdio: 'pipe' });

  // Resolve package name from the specifier
  let packageName = bundleSpec;
  if (packageName.startsWith('@') && packageName.lastIndexOf('@') > 0) {
    packageName = packageName.substring(0, packageName.lastIndexOf('@'));
  } else if (packageName.includes('@') && !packageName.startsWith('@')) {
    packageName = packageName.split('@')[0]!;
  }

  return path.join(home, 'node_modules', packageName);
}

export function makeUpgradeCommand() {
  return createCommand('upgrade')
    .description('Upgrade the guild to the latest framework version — migrations, training content, and stale anima detection')
    .option('--dry-run', 'Show what would change without applying')
    .option('--recompose', 'Retire and recreate stale animas with fresh compositions')
    .option('--bundle <spec>', 'Bundle to upgrade from (npm specifier)', DEFAULT_BUNDLE)
    .action(async (options: { dryRun?: boolean; recompose?: boolean; bundle: string }, cmd) => {
      const home = resolveHome(cmd);

      try {
        const config = readGuildConfig(home);
        console.log(`Guild: ${config.name}`);
        console.log(`Current nexus version: ${config.nexus}`);
        console.log();

        // Fetch the latest bundle
        console.log(`Fetching ${options.bundle}...`);
        const bundleDir = fetchBundle(home, options.bundle);
        console.log();

        // Plan the upgrade
        const plan = planUpgrade(home, bundleDir);

        // ── Report ────────────────────────────────────────────────────

        console.log(`Upgrade plan from ${plan.bundleSource}:`);
        console.log();

        // Migrations
        if (plan.migrations.length > 0) {
          console.log(`  Migrations (${plan.migrations.length} new):`);
          for (const m of plan.migrations) {
            console.log(`    + ${m.guildFilename}  (from ${m.bundleFilename})`);
          }
          console.log();
        }

        // Content updates
        if (plan.contentUpdates.length > 0) {
          console.log(`  Content updates (${plan.contentUpdates.length}):`);
          for (const c of plan.contentUpdates) {
            const label = c.category === 'curricula' ? 'curriculum' : 'temperament';
            console.log(`    ↑ ${label}/${c.name}: ${c.installedVersion} → ${c.bundleVersion}`);
          }
          console.log();
        }

        // Stale animas
        if (plan.staleAnimas.length > 0) {
          console.log(`  ⚠ Stale anima compositions (${plan.staleAnimas.length}):`);
          for (const a of plan.staleAnimas) {
            console.log(`    ${a.name} (${a.id}) — roles: ${a.roles.join(', ')}`);
            if (a.curriculum) {
              console.log(`      curriculum: ${a.curriculum.composedVersion} → ${a.curriculum.currentVersion} available`);
            }
            if (a.temperament) {
              console.log(`      temperament: ${a.temperament.composedVersion} → ${a.temperament.currentVersion} available`);
            }
          }
          console.log();

          if (options.recompose) {
            console.log(`  Stale animas will be retired and recreated with fresh compositions.`);
          } else {
            console.log(`  Stale animas will continue using their original training content.`);
            console.log(`  Use --recompose to retire and recreate them, or do it manually via the steward.`);
          }
          console.log();
        }

        // Nothing to do
        if (plan.isEmpty) {
          console.log('  Everything is up to date. Nothing to upgrade.');
          return;
        }

        // Dry run stops here
        if (options.dryRun) {
          console.log('Dry run — no changes applied.');
          return;
        }

        // ── Apply ───────────────────────────────────────────────────

        console.log('Applying upgrade...');
        const result = applyUpgrade(home, bundleDir, plan, {
          recompose: options.recompose,
        });

        if (result.migrationsApplied.length > 0) {
          console.log(`  ✓ Applied ${result.migrationsApplied.length} migration(s)`);
        }
        if (result.contentUpdated.length > 0) {
          console.log(`  ✓ Updated ${result.contentUpdated.length} content artifact(s)`);
        }
        if (result.recomposedAnimas.length > 0) {
          console.log(`  ✓ Recomposed ${result.recomposedAnimas.length} anima(s): ${result.recomposedAnimas.join(', ')}`);
        } else if (result.staleAnimaCount > 0) {
          console.log(`  ⚠ ${result.staleAnimaCount} anima(s) using outdated compositions`);
        }

        console.log();
        console.log('Upgrade complete.');

      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
