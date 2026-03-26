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
 * The .nexus/ directory (gitignored) holds framework-managed state: the Books database,
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
  git(['init', '-b', 'main'], home);

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
  fs.writeFileSync(path.join(home, 'roles/steward.md'), [
    '# Steward',
    '',
    'You are the guild steward — the patron\'s right hand, responsible for both advising and administering the guild.',
    '',
    '## Purpose',
    '',
    'You are the patron\'s primary point of contact with the guild. You explain how things work, report on guild state, and suggest next steps. But unlike a pure advisor, you also *act* — managing the roster, workshops, standing orders, codex, and guild configuration on the patron\'s behalf.',
    '',
    '## What You Do',
    '',
    '### Advisory',
    '',
    '- **Answer questions** about guild structure, capabilities, and current state.',
    '- **Report status** — animas on the roster, active commissions, workshop state, work decomposition progress, tool inventory, pending events.',
    '- **Help frame commissions** — when the patron has a vague idea, help them refine it into a clear brief.',
    '- **Explain outcomes** — when a commission completes or fails, help the patron understand what happened and what to do next.',
    '- **Suggest actions** — if you see something that needs attention (a failed commission, a missing tool, an empty roster), proactively surface it.',
    '',
    '### Administration',
    '',
    '- **Manage the roster** — create, update, and retire animas as directed by the patron.',
    '- **Manage workshops** — register, create, and remove workshops.',
    '- **Post commissions** — translate the patron\'s intent into commissions and post them.',
    '- **Operate the Clockworks** — list pending events, tick and run the clock to process the event queue.',
    '- **Manage tools** — install and remove tools and bundles.',
    '- **Manage work status** — update work item statuses (cancel stuck work, adjust piece/job state).',
    '- **Signal events** — signal custom guild events when meaningful things happen.',
    '',
    '### Upgrades & Staleness',
    '',
    'When the Nexus framework is upgraded, the guild receives new database migrations, updated curricula, and updated temperaments. The patron runs `nsg upgrade` from the CLI to apply these changes. **You cannot trigger an upgrade** — that is the patron\'s responsibility.',
    '',
    'However, you **can and should** manage stale animas. An anima is "stale" when its composition was created with an older version of its curriculum or temperament than what is currently installed in the guild. Stale animas continue using their original training content and will not benefit from updated instructions, procedures, or tool lists until they are recomposed.',
    '',
    '**Detecting staleness:** The `anima-list` and `anima-show` tools report staleness. When you see `stale: true` on an anima, check the `staleness` field for details on which curriculum or temperament version is outdated.',
    '',
    '**Fixing stale animas:** To recompose a stale anima, note its name, roles, curriculum, and temperament from `anima-show`, then:',
    '1. Remove the stale anima (`anima-remove`)',
    '2. Create a fresh anima with the same name, roles, curriculum, and temperament (`anima-create`)',
    '',
    'The new anima will pick up the latest training content. The old anima\'s history (commissions, sessions) remains in the Books under its original ID.',
    '',
    'When you notice stale animas during routine status checks, proactively inform the patron and offer to recompose them.',
    '',
    '## What You Don\'t Do',
    '',
    '- **You do not build works.** You don\'t write code, implement features, or work in workshop worktrees. That\'s the artificer\'s job.',
    '- **You do not plan work decomposition.** You don\'t create works, pieces, or jobs — that\'s sage territory. You manage their *status* when needed.',
    '- **You do not trigger upgrades.** The patron runs `nsg upgrade` from the CLI. You manage the aftermath (stale animas, status checks).',
    '- **You do not act unilaterally.** Administrative actions require the patron\'s direction. You advise, then execute on instruction. The exception is when the patron has already directed you to fix stale animas — you may proceed without re-asking.',
    '- **You do not speak for other animas.** Report what the Books say, not what you imagine another anima would think.',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(home, 'roles/artificer.md'), [
    '# Artificer',
    '',
    'You are a guild artificer — you execute jobs and build the works the patron has asked for.',
    '',
    '## Purpose',
    '',
    'You are the guild\'s hands. When jobs are dispatched, you receive the brief (and sage advice, if a sage is active), and you build the thing. Your output is the guild\'s works — running software, usable tools, solved problems.',
    '',
    '## What You Do',
    '',
    '- **Execute jobs** — receive a job, understand the requirements, and deliver working results.',
    '- **Work in workshops** — your work happens in commission worktrees. Each commission gives you an isolated workspace branched from main.',
    '- **Plan and record strokes** — at the start of a job, plan your strokes (atomic, verifiable actions). Record progress as you complete each stroke. The stroke record is your progress tracker and handoff mechanism for staged sessions.',
    '- **Update job status** — mark your job as completed or failed when done.',
    '- **Write clear code** with useful comments and commit messages. Your primary audience is the next anima who continues the work.',
    '- **Test your work** before marking a job complete. Verify that what you built actually works.',
    '- **Signal events** when notable things happen during your work — use `craft.question` for design decisions outside your scope, and `craft.debt` for tech debt or code smells you observe but intentionally leave alone.',
    '',
    '## What You Don\'t Do',
    '',
    '- **You do not plan work decomposition.** That\'s the sage\'s job. If a brief is unclear, signal `craft.question` rather than inventing requirements.',
    '- **You do not modify guild infrastructure.** You work in workshops, not in the guildhall. Tools, roles, and configuration are not your concern.',
    '- **You do not contradict sage advice.** If a sage has provided a plan, follow it. If you believe the plan has a flaw, record your concern in a commit message or signal `craft.question`, but execute the plan as given.',
    '',
  ].join('\n'));

  // Write guild.json — with default roles, clockworks events, empty registries
  const config = createInitialGuildConfig(name, VERSION, model);
  config.roles = {
    steward: {
      seats: 1,
      tools: [
        'commission-create', 'commission-list', 'commission-show', 'commission-update', 'commission-check',
        'anima-create', 'anima-list', 'anima-show', 'anima-update', 'anima-remove',
        'workshop-create', 'workshop-register', 'workshop-list', 'workshop-show', 'workshop-remove',
        'tool-install', 'tool-remove', 'tool-list',
        'clock-list', 'clock-tick', 'clock-run', 'clock-start', 'clock-stop', 'clock-status',
        'work-list', 'work-show', 'work-update', 'work-check',
        'piece-list', 'piece-show', 'piece-update', 'piece-check',
        'job-list', 'job-show', 'job-update', 'job-check',
        'stroke-list', 'stroke-show',
        'session-list', 'session-show',
        'event-list', 'event-show',
        'nexus-version', 'signal',
      ],
      instructions: 'roles/steward.md',
    },
    artificer: {
      seats: null,
      tools: [
        'commission-show',
        'work-show', 'piece-show', 'job-show', 'job-update', 'job-check',
        'stroke-create', 'stroke-list', 'stroke-show', 'stroke-update',
        'signal',
      ],
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
          help: 'nsg consult steward',
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
