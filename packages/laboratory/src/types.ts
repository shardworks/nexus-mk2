/**
 * The Laboratory — configuration and data types.
 */

export type {
  ChangeEvent,
  ChangeHandler,
  StacksApi,
  BookEntry,
} from '@shardworks/stacks-apparatus';

// ── Plugin config ────────────────────────────────────────────────────

export interface LaboratoryConfig {
  /**
   * Path to the sanctum root directory. When provided, other paths
   * default relative to it.
   */
  sanctumHome: string;

  /**
   * Path to the commissions data directory.
   * Default (relative to sanctumHome): experiments/data/commissions
   */
  commissionsDataDir?: string;

  /**
   * Path to the commission log YAML file.
   * Default (relative to sanctumHome): experiments/data/commission-log.yaml
   */
  commissionLogPath?: string;
}

// Augment GuildConfig so `guild().guildConfig().laboratory` is typed.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    laboratory?: LaboratoryConfig;
  }
}

// ── Resolved config (all paths absolute) ─────────────────────────────

export interface ResolvedConfig {
  sanctumHome: string;
  commissionsDataDir: string;
  commissionLogPath: string;
}

// ── Writ document shape (mirrors clerk WritDoc, fields we use) ───────

export interface WritLike {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

// ── Session document shape (mirrors animator SessionDoc, fields we use)

export interface SessionLike {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  costUsd?: number;
  metadata?: Record<string, unknown>;
}
