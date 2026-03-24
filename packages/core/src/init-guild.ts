import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { VERSION } from './index.ts';
import { guildhallBarePath, guildhallWorktreePath } from './nexus-home.ts';
import { createInitialGuildConfig } from './guild-config.ts';
import { INITIAL_SCHEMA } from './ledger.ts';

function git(args: string[], cwd?: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/**
 * Create a new guild skeleton at the given path.
 *
 * Sets up the NEXUS_HOME directory structure: bare guildhall repo,
 * standing worktree with scaffolded directories, empty guild.json,
 * the initial migration file, and an initial git commit.
 *
 * This is the first step of guild creation. After this, the caller
 * should bootstrap base tools and apply migrations:
 *
 *   initGuild(home, model)        // skeleton
 *   bootstrapBaseTools(home, ...)  // install framework tools via installTool
 *   applyMigrations(home)          // create ledger via migration engine
 *
 * @param home - Absolute path for the new NEXUS_HOME directory.
 * @param model - Default model identifier for anima sessions.
 * @throws If `home` exists and is not empty.
 */
export function initGuild(home: string, model: string): void {
  // Validate target
  if (fs.existsSync(home)) {
    const entries = fs.readdirSync(home);
    if (entries.length > 0) {
      throw new Error(`${home} exists and is not empty.`);
    }
  }

  // Create NEXUS_HOME skeleton
  const ghWorktree = guildhallWorktreePath(home);
  fs.mkdirSync(path.dirname(ghWorktree), { recursive: true });

  // Create guildhall bare repo
  const ghBare = guildhallBarePath(home);
  git(['init', '--bare', ghBare]);

  // Create standing worktree
  git(['-C', ghBare, 'worktree', 'add', '-b', 'main', ghWorktree]);

  // Scaffold guildhall directory structure
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
    const full = path.join(ghWorktree, dir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, '.gitkeep'), '');
  }

  // Write initial migration
  fs.writeFileSync(
    path.join(ghWorktree, 'nexus/migrations/001-initial-schema.sql'),
    INITIAL_SCHEMA.trimStart(),
  );
  // Remove .gitkeep from migrations since it now has a real file
  const migrationsGitkeep = path.join(ghWorktree, 'nexus/migrations/.gitkeep');
  if (fs.existsSync(migrationsGitkeep)) {
    fs.unlinkSync(migrationsGitkeep);
  }

  // Write codex placeholder
  fs.writeFileSync(path.join(ghWorktree, 'codex/all.md'), '');

  // Write guild.json — empty registries, tools will be installed via bootstrapBaseTools
  const config = createInitialGuildConfig(VERSION, model);
  fs.writeFileSync(
    path.join(ghWorktree, 'guild.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // Initial commit
  git(['add', '-A'], ghWorktree);
  git(['commit', '-m', 'Initialize guild'], ghWorktree);
}
