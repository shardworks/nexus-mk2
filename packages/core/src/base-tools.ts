import { VERSION } from './index.ts';

/**
 * Metadata for a base implement that ships with the framework.
 *
 * Base implements are separate workspace packages (@shardworks/implement-*) but
 * their metadata lives here so that `initGuild` can write descriptors and
 * instructions into guildhall slots without importing every implement package.
 */
export interface ImplementTemplate {
  /** Tool name — becomes the directory name in nexus/implements/. */
  name: string;
  /** Workspace package that contains the handler (for MCP engine resolution). */
  packageName: string;
  /** Brief description for the descriptor. */
  description: string;
  /** Full instructions document delivered to animas. */
  instructions: string;
}

/**
 * Metadata for a base engine that ships with the framework.
 */
export interface EngineTemplate {
  /** Engine name — becomes the directory name in nexus/engines/. */
  name: string;
  /** Workspace package that contains the engine entry point. */
  packageName: string;
  /** Brief description for the descriptor. */
  description: string;
}

/** Base implements that ship with the framework. */
export const BASE_IMPLEMENTS: ImplementTemplate[] = [
  {
    name: 'install-tool',
    packageName: '@shardworks/implement-install-tool',
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
    packageName: '@shardworks/implement-remove-tool',
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
    packageName: '@shardworks/implement-dispatch',
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
    packageName: '@shardworks/implement-instantiate',
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
    packageName: '@shardworks/implement-publish',
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
  {
    name: 'nexus-version',
    packageName: '@shardworks/implement-nexus-version',
    description: "Report version information for the guild's Nexus installation and base implements",
    instructions: `# nexus-version

Report version information about the guild's Nexus installation.

## Usage

\\\`\\\`\\\`
nexus-version
\\\`\\\`\\\`

No arguments required. Returns the framework version and a list of all base
implements and engines with their registered versions.

## When to use

- When diagnosing compatibility issues or unexpected behavior
- When reporting bugs or requesting support
- When verifying that a guild upgrade completed successfully
- Before installing a tool that declares a \\\`nexusVersion\\\` requirement
`,
  },
];

/** Base engines that ship with the framework. */
export const BASE_ENGINES: EngineTemplate[] = [
  {
    name: 'manifest',
    packageName: '@shardworks/engine-manifest',
    description: 'Prepare animas for sessions — resolve composition, assemble instructions, launch session',
  },
  {
    name: 'mcp-server',
    packageName: '@shardworks/engine-mcp-server',
    description: 'Serve guild implements as MCP tools during anima sessions',
  },
  {
    name: 'worktree-setup',
    packageName: '@shardworks/engine-worktree-setup',
    description: 'Prepare isolated work environments for commissions',
  },
  {
    name: 'ledger-migrate',
    packageName: '@shardworks/engine-ledger-migrate',
    description: 'Manage Ledger schema — apply pending migrations',
  },
];

/** Generate the nexus-implement.json descriptor for a base implement. */
export function renderImplementDescriptor(template: ImplementTemplate): string {
  return JSON.stringify({
    entry: 'src/handler.ts',
    kind: 'module',
    instructions: 'instructions.md',
    version: VERSION,
    description: template.description,
    package: template.packageName,
  }, null, 2) + '\n';
}

/** Generate the nexus-engine.json descriptor for a base engine. */
export function renderEngineDescriptor(template: EngineTemplate): string {
  return JSON.stringify({
    entry: 'src/index.ts',
    version: VERSION,
    description: template.description,
    package: template.packageName,
  }, null, 2) + '\n';
}
