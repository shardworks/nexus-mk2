import { VERSION } from '../index.ts';

/**
 * Template for a base implement wrapper.
 * Each base implement is a shell script that delegates to a `nexus` CLI subcommand,
 * paired with a descriptor and instructions document.
 */
export interface ImplementTemplate {
  name: string;
  command: string;
  description: string;
  instructions: string;
}

/**
 * Template for a base engine.
 * Engines are internal to the CLI — no shell wrapper, just a descriptor for registration.
 */
export interface EngineTemplate {
  name: string;
  description: string;
}

/** Base implements that ship with the framework. */
export const BASE_IMPLEMENTS: ImplementTemplate[] = [
  {
    name: 'install-tool',
    command: 'install-tool',
    description: 'Install an implement, engine, curriculum, or temperament into the guild',
    instructions: `# install-tool

Install a new tool into the guild from a local directory, tarball, or npm package.

## Usage

\`\`\`
install-tool <source> [--name <name>] [--slot <slot>] [--roles <roles>]
\`\`\`

## Arguments

- \`<source>\` — Path to a local directory containing a nexus descriptor
- \`--name <name>\` — Override the tool name (defaults to directory name)
- \`--slot <slot>\` — Override the version slot (defaults to version from descriptor)
- \`--roles <roles>\` — Comma-separated roles for implement access gating

## Examples

Install a locally-built implement:
\`\`\`
install-tool ./path/to/my-tool
\`\`\`

Install with explicit slot and roles:
\`\`\`
install-tool ./my-tool --slot 0.1.0 --roles artificer,sage
\`\`\`

The tool will detect the descriptor type (implement, engine, curriculum, or temperament), copy it to the correct location, and register it in guild.json.
`,
  },
  {
    name: 'remove-tool',
    command: 'remove-tool',
    description: 'Remove an implement, engine, curriculum, or temperament from the guild',
    instructions: `# remove-tool

Remove a tool from the guild — deregisters from guild.json and deletes files from disk.

## Usage

\`\`\`
remove-tool <name> [--type <type>]
\`\`\`

## Arguments

- \`<name>\` — Name of the tool to remove
- \`--type <type>\` — Restrict to a specific category (implements, engines, curricula, temperaments)

## Notes

- Only guild-managed tools can be removed. Framework (nexus) tools cannot be removed — use \`nexus repair\` to manage them.
- The tool's on-disk directory and guild.json entry are both removed.
- A git commit is created for the removal.
`,
  },
  {
    name: 'dispatch',
    command: 'dispatch',
    description: 'Post commissions targeting a workshop and trigger the manifest engine',
    instructions: `# dispatch

Post a commission to the guild, assigning it to an anima in a target workshop.

## Usage

\`\`\`
dispatch <spec> --workshop <workshop> --anima <anima>
\`\`\`

*(Not yet implemented — this is a placeholder for the dispatch pipeline.)*
`,
  },
  {
    name: 'instantiate',
    command: 'instantiate',
    description: 'Create a new anima from curriculum and temperament',
    instructions: `# instantiate

Create a new anima by composing a curriculum and temperament.

## Usage

\`\`\`
instantiate <name> --curriculum <curriculum> --temperament <temperament> --role <role>
\`\`\`

*(Not yet implemented — this is a placeholder for anima creation.)*
`,
  },
  {
    name: 'publish',
    command: 'publish',
    description: 'Move artifacts from workshops into the guildhall',
    instructions: `# publish

Publish completed artifacts from a workshop into the guildhall.

## Usage

\`\`\`
publish <path> --to <category>/<name> [--slot <slot>]
\`\`\`

*(Not yet implemented — this is a placeholder for the publish pipeline.)*
`,
  },
];

/** Base engines that ship with the framework. */
export const BASE_ENGINES: EngineTemplate[] = [
  {
    name: 'manifest',
    description: 'Prepare animas for sessions — resolve composition, assemble instructions, launch session',
  },
  {
    name: 'worktree-setup',
    description: 'Prepare isolated work environments for commissions',
  },
  {
    name: 'ledger-migrate',
    description: 'Manage Ledger schema — apply pending migrations',
  },
];

/** Generate the shell wrapper script for a base implement. */
export function renderWrapper(template: ImplementTemplate): string {
  return `#!/usr/bin/env bash
# ${template.name} — ${template.description}
# Framework implement — delegates to nexus CLI (v${VERSION})
exec nexus ${template.command} "$@"
`;
}

/** Generate the nexus-implement.json descriptor for a base implement. */
export function renderImplementDescriptor(template: ImplementTemplate): string {
  return JSON.stringify({
    entry: 'run.sh',
    kind: 'executable',
    instructions: 'instructions.md',
    version: VERSION,
    description: template.description,
  }, null, 2) + '\n';
}

/** Generate the nexus-engine.json descriptor for a base engine. */
export function renderEngineDescriptor(template: EngineTemplate): string {
  return JSON.stringify({
    entry: 'engine.sh',
    kind: 'executable',
    version: VERSION,
    description: template.description,
  }, null, 2) + '\n';
}
