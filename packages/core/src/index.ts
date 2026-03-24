// @shardworks/nexus-core — shared infrastructure for the guild system

export const VERSION = '0.1.0';

export {
  type ImplementContext,
  type ImplementDefinition,
  implement,
} from './implement.ts';

export { createLedger, INITIAL_SCHEMA } from './ledger.ts';
export {
  type GuildConfig,
  type ToolEntry,
  type TrainingEntry,
  createInitialGuildConfig,
  guildConfigPath,
  readGuildConfig,
  writeGuildConfig,
} from './guild-config.ts';
export {
  resolveNexusHome,
  guildhallBarePath,
  guildhallWorktreePath,
  ledgerPath,
  worktreesPath,
} from './nexus-home.ts';
export {
  type InstallToolOptions,
  type InstallResult,
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
  type PublishOptions,
  type PublishResult,
  publish,
} from './publish.ts';
export {
  type InstantiateOptions,
  type InstantiateResult,
  instantiate,
} from './instantiate.ts';
export {
  type ImplementTemplate,
  type EngineTemplate,
  BASE_IMPLEMENTS,
  BASE_ENGINES,
  renderImplementDescriptor,
  renderEngineDescriptor,
} from './base-tools.ts';
export { initGuild } from './init-guild.ts';
