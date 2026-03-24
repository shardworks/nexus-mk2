import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { VERSION } from './index.ts';
import { createInitialGuildConfig } from './guild-config.ts';
import { INITIAL_SCHEMA } from './ledger.ts';

function git(args: string[], cwd?: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/**
 * Create a new guild at the given path.
 *
 * Sets up a regular git repo at `home` with the guild directory structure:
 * guild.json, package.json, .gitignore, scaffolded directories, the initial
 * migration file, and an initial git commit.
 *
 * The .nexus/ directory (gitignored) holds framework-managed state: the Ledger,
 * workshop bare clones, and commission worktrees.
 *
 * This is the first step of guild creation. After this, the caller
 * should bootstrap base tools and apply migrations:
 *
 *   initGuild(home, name, model)    // skeleton
 *   bootstrapBaseTools(home, ...)    // install framework tools via installTool
 *   applyMigrations(home)           // create ledger via migration engine
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
    'nexus/implements',
    'nexus/engines',
    'nexus/migrations',
    'implements',
    'engines',
    'codex/roles',
    'training/curricula',
    'training/temperaments',
  ];

  for (const dir of dirs) {
    const full = path.join(home, dir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, '.gitkeep'), '');
  }

  // Write initial migration
  fs.writeFileSync(
    path.join(home, 'nexus/migrations/001-initial-schema.sql'),
    INITIAL_SCHEMA.trimStart(),
  );
  // Remove .gitkeep from migrations since it now has a real file
  const migrationsGitkeep = path.join(home, 'nexus/migrations/.gitkeep');
  if (fs.existsSync(migrationsGitkeep)) {
    fs.unlinkSync(migrationsGitkeep);
  }

  // Write codex placeholder
  fs.writeFileSync(path.join(home, 'codex/all.md'), '');

  // Write guild.json — empty registries, tools will be installed via bootstrapBaseTools
  const config = createInitialGuildConfig(name, VERSION, model);
  fs.writeFileSync(
    path.join(home, 'guild.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // Make the guildhall an npm package so guild tools can be installed as
  // npm dependencies with proper dependency resolution.
  fs.writeFileSync(
    path.join(home, 'package.json'),
    JSON.stringify({ name: `guild-${name}`, private: true, version: '0.0.0' }, null, 2) + '\n',
  );
  fs.writeFileSync(path.join(home, '.gitignore'), 'node_modules/\n.nexus/\n');

  // Initial commit
  git(['add', '-A'], home);
  git(['commit', '-m', 'Initialize guild'], home);
}
