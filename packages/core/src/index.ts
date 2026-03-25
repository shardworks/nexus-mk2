// @shardworks/nexus-core — shared infrastructure for the guild system

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const _pkg = _require('../package.json');
export const VERSION: string = _pkg.version;

export {
  type ToolContext,
  type ToolDefinition,
  tool,
  isToolDefinition,
  resolveToolFromExport,
  resolveAllToolsFromExport,
} from './tool.ts';

export {
  type GuildEvent,
  type EngineContext,
  type EngineDefinition,
  engine,
  isClockworkEngine,
  resolveEngineFromExport,
} from './engine.ts';

export {
  signalEvent,
  validateCustomEvent,
  isFrameworkEvent,
  readPendingEvents,
  readEvent,
  markEventProcessed,
  recordDispatch,
} from './events.ts';

export {
  type TickResult,
  type DispatchSummary,
  type ClockRunResult,
  clockTick,
  clockRun,
} from './clockworks.ts';

export { createLedger } from './ledger.ts';
export {
  type GuildConfig,
  type RoleDefinition,
  type ToolEntry,
  type TrainingEntry,
  type WorkshopEntry,
  type EventDeclaration,
  type StandingOrder,
  type ClockworksConfig,
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
  type CommissionOptions,
  type CommissionResult,
  commission,
  updateCommissionStatus,
  readCommission,
} from './commission.ts';
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
  type AddWorkshopOptions,
  type AddWorkshopResult,
  type RemoveWorkshopOptions,
  type WorkshopInfo,
  type CreateWorkshopOptions,
  addWorkshop,
  removeWorkshop,
  listWorkshops,
  createWorkshop,
  checkGhAuth,
  deriveWorkshopName,
} from './workshop.ts';
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
export {
  type WorktreeConfig,
  type WorktreeResult,
  setupWorktree,
  teardownWorktree,
  listWorktrees,
} from './worktree.ts';
export {
  type MigrationFile,
  type MigrationProvenance,
  type MigrateResult,
  discoverMigrations,
  applyMigrations,
} from './migrate.ts';
export {
  type AnimaRecord,
  type ResolvedTool,
  type UnavailableTool,
  type ManifestResult,
  readAnima,
  resolveTools,
  readCodex,
  readRoleInstructions,
  assembleSystemPrompt,
  manifest,
} from './manifest.ts';
export {
  type SessionProvider,
  type SessionProviderLaunchOptions,
  type SessionProviderResult,
  type SessionLaunchOptions,
  type SessionResult,
  type WorkspaceContext,
  type ResolvedWorkspace,
  type SessionRecord,
  registerSessionProvider,
  getSessionProvider,
  resolveWorkspace,
  createTempWorktree,
  removeTempWorktree,
  launchSession,
} from './session.ts';
