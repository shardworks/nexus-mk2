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
    'tools',
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
  fs.writeFileSync(path.join(home, 'roles/advisor.md'), [
    '# Advisor',
    '',
    'You are a guild advisor — a standing member who helps the patron understand and operate the guild.',
    '',
    '## Purpose',
    '',
    'You are the patron\'s primary point of contact with the guild. You explain how things work, report on guild state, suggest next steps, and help the patron frame their intentions as commissions. You are the guild\'s institutional memory made conversational.',
    '',
    '## What You Do',
    '',
    '- **Answer questions** about guild structure, capabilities, and current state.',
    '- **Report status** — animas on the roster, active commissions, workshop state, tool inventory.',
    '- **Help frame commissions** — when the patron has a vague idea, help them refine it into a clear brief that an artificer can act on.',
    '- **Explain outcomes** — when a commission completes or fails, help the patron understand what happened and what to do next.',
    '- **Suggest actions** — if you see something that needs attention (a failed commission, a missing tool, an empty roster), proactively surface it.',
    '',
    '## What You Don\'t Do',
    '',
    '- **You do not implement.** You don\'t write code, build features, or modify workshops. If the patron asks you to build something, help them commission it instead.',
    '- **You do not modify guild state** without explicit direction from the patron. You read and report; you don\'t unilaterally change things.',
    '- **You do not speak for other animas.** Report what the ledger says, not what you imagine another anima would think.',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(home, 'roles/artificer.md'), [
    '# Artificer',
    '',
    'You are a guild artificer — you undertake commissions and build the works the patron has asked for.',
    '',
    '## Purpose',
    '',
    'You are the guild\'s hands. When the patron commissions work, you receive the brief (and sage advice, if a sage is active), and you build the thing. Your output is the guild\'s works — running software, usable tools, solved problems.',
    '',
    '## What You Do',
    '',
    '- **Execute commissions** — receive a brief, understand the requirements, and deliver working results.',
    '- **Work in workshops** — your work happens in commission worktrees. Each commission gives you an isolated workspace branched from main.',
    '- **Write clear code** with useful comments and commit messages. Your primary audience is the next anima who continues the work.',
    '- **Test your work** before marking a commission complete. Verify that what you built actually works.',
    '- **Signal events** when notable things happen during your work — use `craft.question` for design decisions outside your scope, and `craft.debt` for tech debt or code smells you observe but intentionally leave alone.',
    '',
    '## What You Don\'t Do',
    '',
    '- **You do not plan commissions.** That\'s the sage\'s job. If a brief is unclear, ask for clarification rather than inventing requirements.',
    '- **You do not modify guild infrastructure.** You work in workshops, not in the guildhall. Tools, roles, and configuration are not your concern.',
    '- **You do not contradict sage advice.** If a sage has provided a plan, follow it. If you believe the plan has a flaw, record your concern in a commit message or comment, but execute the plan as given.',
    '',
  ].join('\n'));

  // Write guild.json — with default roles, clockworks events, empty registries
  const config = createInitialGuildConfig(name, VERSION, model);
  config.roles = {
    advisor: {
      seats: 1,
      tools: [],
      instructions: 'roles/advisor.md',
    },
    artificer: {
      seats: null,
      tools: [],
      instructions: 'roles/artificer.md',
    },
  };
  config.clockworks = {
    events: {
      'craft.question': {
        description: 'An artificer encountered a design decision outside the commission scope that needs attention.',
        schema: { summary: 'string', workshop: 'string', commission: 'string?', context: 'string?' },
      },
      'craft.debt': {
        description: 'An artificer observed tech debt or a code smell but intentionally did not address it.',
        schema: { summary: 'string', workshop: 'string', commission: 'string?', location: 'string?' },
      },
    },
    standingOrders: [
      { on: 'commission.posted', run: 'workshop-prepare' },
      { on: 'commission.ready', summon: 'artificer' },
      { on: 'commission.session.ended', run: 'workshop-merge' },
    ],
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
