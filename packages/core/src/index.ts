// @shardworks/nexus-core — shared infrastructure for the guild system

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const _pkg = _require('../package.json');
export const VERSION: string = _pkg.version;

export {
  type ImplementContext,
  type ImplementDefinition,
  implement,
} from './implement.ts';

export { createLedger } from './ledger.ts';
export {
  type GuildConfig,
  type RoleDefinition,
  type ToolEntry,
  type TrainingEntry,
  createInitialGuildConfig,
  guildConfigPath,
  readGuildConfig,
  writeGuildConfig,
} from './guild-config.ts';
export {
  findGuildRoot,
  nexusDir,
  ledgerPath,
  worktreesPath,
  workshopsPath,
  workshopBarePath,
} from './nexus-home.ts';
export {
  type InstallToolOptions,
  type InstallResult,
  type SourceKind,
  classifySource,
  installTool,
} from './install-tool.ts';
export {
  type RemoveToolOptions,
  type RemoveResult,
  removeTool,
} from './remove-tool.ts';
export {
  type DispatchOptions,
  type DispatchResult,
  dispatch,
} from './dispatch.ts';
export {
  type InstantiateOptions,
  type InstantiateResult,
  instantiate,
} from './instantiate.ts';
export { initGuild } from './init-guild.ts';
export {
  type BundleManifest,
  type BundlePackageEntry,
  type BundleContentEntry,
  type BundleMigrationEntry,
  type InstallBundleOptions,
  type InstallBundleResult,
  readBundleManifest,
  installBundle,
  isBundleDir,
} from './bundle.ts';
export {
  type RehydrateResult,
  rehydrate,
} from './rehydrate.ts';
export {
  type Precondition,
  type CommandPrecondition,
  type CommandOutputPrecondition,
  type EnvPrecondition,
  type PreconditionCheckResult,
  type ToolPreconditionResult,
  readPreconditions,
  checkOne,
  checkPreconditions,
  checkAllPreconditions,
  checkToolPreconditions,
} from './preconditions.ts';
