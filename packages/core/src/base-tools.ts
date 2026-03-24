/**
 * Base tools — the framework implements and engines that ship with Nexus.
 *
 * Each entry maps a tool name to the workspace package that contains it.
 * The actual descriptors and instructions live in the packages themselves
 * (nexus-implement.json / nexus-engine.json / instructions.md).
 *
 * During `nexus init`, these are installed into the guildhall via
 * `installTool({ framework: true })` — the same code path used for all
 * tool installation.
 */

/** Reference to a framework tool package. */
export interface BaseToolRef {
  /** Tool name — becomes the directory name in nexus/{implements,engines}/. */
  name: string;
  /** Workspace package that contains the tool. */
  packageName: string;
  /** Roles for implements (omit for engines or all-role implements). */
  roles?: string[];
}

/** Base implements that ship with the framework. */
export const BASE_IMPLEMENTS: BaseToolRef[] = [
  { name: 'install-tool',    packageName: '@shardworks/implement-install-tool' },
  { name: 'remove-tool',     packageName: '@shardworks/implement-remove-tool' },
  { name: 'dispatch',        packageName: '@shardworks/implement-dispatch' },
  { name: 'instantiate',     packageName: '@shardworks/implement-instantiate' },
  { name: 'publish',         packageName: '@shardworks/implement-publish' },
  { name: 'nexus-version',   packageName: '@shardworks/implement-nexus-version' },
];

/** Base engines that ship with the framework. */
export const BASE_ENGINES: BaseToolRef[] = [
  { name: 'manifest',        packageName: '@shardworks/engine-manifest' },
  { name: 'mcp-server',      packageName: '@shardworks/engine-mcp-server' },
  { name: 'worktree-setup',  packageName: '@shardworks/engine-worktree-setup' },
  { name: 'ledger-migrate',  packageName: '@shardworks/engine-ledger-migrate' },
];

/** All base tools (implements + engines). */
export const BASE_TOOLS: BaseToolRef[] = [...BASE_IMPLEMENTS, ...BASE_ENGINES];
