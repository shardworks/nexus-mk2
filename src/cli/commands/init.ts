import { createCommand } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { VERSION } from '../../index.ts';
import { guildhallBarePath, guildhallWorktreePath, ledgerPath, worktreesPath } from '../../core/nexus-home.ts';
import { createInitialGuildConfig } from '../../core/guild-config.ts';
import type { ToolEntry } from '../../core/guild-config.ts';
import { createLedger, INITIAL_SCHEMA } from '../../core/ledger.ts';
import {
  BASE_IMPLEMENTS, BASE_ENGINES,
  renderWrapper, renderImplementDescriptor, renderEngineDescriptor,
} from '../../core/base-tools.ts';

const DEFAULT_MODEL = 'sonnet';

function git(args: string[], cwd?: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
  }
}

/**
 * Create a new guild at the given path.
 *
 * Sets up the full NEXUS_HOME directory structure: bare guildhall repo,
 * standing worktree with scaffolded directories, guild.json, Ledger,
 * and an initial git commit.
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

  // Write guild.json (with base tools pre-registered)
  const config = createInitialGuildConfig(VERSION, model);
  const now = new Date().toISOString();

  // Write base implements — wrapper scripts that delegate to `nexus` CLI
  for (const tmpl of BASE_IMPLEMENTS) {
    const implDir = path.join(ghWorktree, 'nexus', 'implements', tmpl.name, VERSION);
    fs.mkdirSync(implDir, { recursive: true });
    fs.writeFileSync(path.join(implDir, 'nexus-implement.json'), renderImplementDescriptor(tmpl));
    fs.writeFileSync(path.join(implDir, 'run.sh'), renderWrapper(tmpl), { mode: 0o755 });
    fs.writeFileSync(path.join(implDir, 'instructions.md'), tmpl.instructions);

    config.implements[tmpl.name] = {
      source: 'nexus',
      slot: VERSION,
      upstream: null,
      installedAt: now,
      roles: ['*'],
    } satisfies ToolEntry;
  }

  // Write base engine descriptors
  for (const tmpl of BASE_ENGINES) {
    const engDir = path.join(ghWorktree, 'nexus', 'engines', tmpl.name, VERSION);
    fs.mkdirSync(engDir, { recursive: true });
    fs.writeFileSync(path.join(engDir, 'nexus-engine.json'), renderEngineDescriptor(tmpl));

    config.engines[tmpl.name] = {
      source: 'nexus',
      slot: VERSION,
      upstream: null,
      installedAt: now,
    } satisfies ToolEntry;
  }

  // Remove .gitkeep from nexus/implements and nexus/engines since they now have real files
  for (const sub of ['nexus/implements', 'nexus/engines']) {
    const gk = path.join(ghWorktree, sub, '.gitkeep');
    if (fs.existsSync(gk)) fs.unlinkSync(gk);
  }

  fs.writeFileSync(
    path.join(ghWorktree, 'guild.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // Create Ledger
  createLedger(ledgerPath(home));

  // Initial commit
  git(['add', '-A'], ghWorktree);
  git(['commit', '-m', 'Initialize guild'], ghWorktree);
}

export function makeInitCommand() {
  return createCommand('init')
    .description('Create a new guild — guildhall, directory structure, guild.json, and Ledger')
    .action(async () => {
      const name = await prompt('Guild name');
      if (!name) {
        console.error('Error: guild name is required.');
        process.exitCode = 1;
        return;
      }

      const model = await prompt('Model', DEFAULT_MODEL);
      const home = path.resolve(name);

      try {
        initGuild(home, model);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`\nGuild created at ${home}`);
      console.log(`\n  export NEXUS_HOME=${home}\n`);
    });
}
