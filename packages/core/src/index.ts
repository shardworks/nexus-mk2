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
  type ListEventsOptions,
  type DispatchRecord,
  type ListDispatchesOptions,
  listEvents,
  listDispatches,
} from './events.ts';

export {
  type TickResult,
  type DispatchSummary,
  type ClockRunResult,
  type ClockStartOptions,
  type ClockStartResult,
  type ClockStopResult,
  type ClockStatus,
  clockTick,
  clockRun,
  clockStart,
  clockStop,
  clockStatus,
} from './clockworks.ts';

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
  booksPath,
  ledgerPath,
  worktreesPath,
  workshopsPath,
  workshopBarePath,
  clockPidPath,
  clockLogPath,
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
  type CommissionSummary,
  type CommissionDetail,
  type ListCommissionsOptions,
  commission,
  updateCommissionStatus,
  readCommission,
  showCommission,
  listCommissions,
  checkCommissionCompletion,
  completeCommissionIfReady,
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
  type WorkshopDetail,
  type CreateWorkshopOptions,
  addWorkshop,
  removeWorkshop,
  listWorkshops,
  showWorkshop,
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
  type SessionSummary,
  type SessionDetail,
  type ListSessionsOptions,
  registerSessionProvider,
  getSessionProvider,
  resolveWorkspace,
  createTempWorktree,
  removeTempWorktree,
  launchSession,
  listSessions,
  showSession,
} from './session.ts';
export { generateId } from './id.ts';
export {
  type AnimaSummary,
  type AnimaDetail,
  type ListAnimasOptions,
  type UpdateAnimaOptions,
  listAnimas,
  showAnima,
  updateAnima,
  removeAnima,
} from './anima.ts';
export {
  type ToolSummary,
  listTools,
} from './tool-registry.ts';
export {
  type WorkRecord,
  type CreateWorkOptions,
  type ListWorksOptions,
  type UpdateWorkOptions,
  createWork,
  listWorks,
  showWork,
  updateWork,
  checkWorkCompletion,
  completeWorkIfReady,
} from './work.ts';
export {
  type PieceRecord,
  type CreatePieceOptions,
  type ListPiecesOptions,
  type UpdatePieceOptions,
  createPiece,
  listPieces,
  showPiece,
  updatePiece,
  checkPieceCompletion,
  completePieceIfReady,
} from './piece.ts';
export {
  type JobRecord,
  type CreateJobOptions,
  type ListJobsOptions,
  type UpdateJobOptions,
  createJob,
  listJobs,
  showJob,
  updateJob,
  checkJobCompletion,
  completeJobIfReady,
} from './job.ts';
export {
  type AuditEntry,
  type ListAuditLogOptions,
  listAuditLog,
} from './audit.ts';
export {
  type StrokeRecord,
  type CreateStrokeOptions,
  type ListStrokesOptions,
  type UpdateStrokeOptions,
  createStroke,
  listStrokes,
  showStroke,
  updateStroke,
} from './stroke.ts';
