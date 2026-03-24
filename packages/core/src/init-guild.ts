import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { VERSION } from './index.ts';
import { createInitialGuildConfig } from './guild-config.ts';

function git(args: string[], cwd?: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/**
 * Create a new guild at the given path.
 *
 * Sets up a regular git repo at `home` with the guild directory structure:
 * guild.json, package.json, .gitignore, scaffolded directories, and an
 * initial git commit.
 *
 * The .nexus/ directory (gitignored) holds framework-managed state: the Ledger,
 * workshop bare clones, and commission worktrees.
 *
 * This creates only the skeleton. After this, the caller should install a
 * bundle (which delivers tools, training, and migrations) and apply migrations:
 *
 *   initGuild(home, name, model)           // skeleton
 *   installBundle({ home, bundleDir })      // tools, training, migrations
 *   applyMigrations(home)                  // create ledger
 *
 * @param home - Absolute path for the new guild directory.
 * @param name - Guild name (used in guild.json and as the npm package name).
 * @param model - Default model identifier for anima sessions.
 * @throws If `home` exists and is not empty.
 */
export function initGuild(home: string, name: string, model: string): void {
  // Validate target
  if (fs.existsSync(home)) {
    const entries = fs.readdirSync(home);
    if (entries.length > 0) {
      throw new Error(`${home} exists and is not empty.`);
    }
  }

  // Create guild root and initialize git repo
  fs.mkdirSync(home, { recursive: true });
  git(['init'], home);

  // Create .nexus infrastructure directory
  fs.mkdirSync(path.join(home, '.nexus', 'workshops'), { recursive: true });
  fs.mkdirSync(path.join(home, '.nexus', 'worktrees'), { recursive: true });

  // Scaffold guild directory structure
  const dirs = [
    'nexus/migrations',
    'implements',
    'engines',
    'roles',
    'codex',
    'training/curricula',
    'training/temperaments',
  ];

  for (const dir of dirs) {
    const full = path.join(home, dir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, '.gitkeep'), '');
  }

  // Write codex placeholder
  fs.writeFileSync(path.join(home, 'codex/all.md'), '');

  // Write default role instruction files
  fs.writeFileSync(path.join(home, 'roles/advisor.md'),
    '# Advisor\n\nYou are a guild advisor — a standing member who helps the patron understand and operate the guild.\n',
  );

  // Write guild.json — with default advisor role, empty registries
  const config = createInitialGuildConfig(name, VERSION, model);
  config.roles = {
    advisor: {
      seats: 1,
      implements: [],
      instructions: 'roles/advisor.md',
    },
  };
  fs.writeFileSync(
    path.join(home, 'guild.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // Make the guildhall an npm package so guild tools can be installed as
  // npm dependencies with proper dependency resolution.
  // @shardworks/nexus is pinned here so `nsg` is available in package scripts
  // even when the CLI is not globally installed.
  fs.writeFileSync(
    path.join(home, 'package.json'),
    JSON.stringify(
      {
        name: `guild-${name}`,
        private: true,
        version: '0.0.0',
        scripts: {
          help: 'nsg consult advisor',
        },
        dependencies: {
          '@shardworks/nexus': `^${VERSION}`,
        },
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(path.join(home, '.gitignore'), 'node_modules/\n.nexus/\n');

  // Initial commit
  git(['add', '-A'], home);
  git(['commit', '-m', 'Initialize guild'], home);
}
