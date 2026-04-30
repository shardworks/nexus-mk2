/**
 * The Laboratory — configuration types (retired plugin).
 *
 * This file retains only the GuildConfig augmentation so that existing
 * guild.json files with a `laboratory` config block continue to typecheck.
 * The plugin itself is a no-op (see ./index.ts).
 */

// ── Plugin config (no-op; retained for guild.json compatibility) ─────

export interface LaboratoryConfig {
  /**
   * Path to the sanctum root directory. No longer used — the plugin is
   * retired. Field retained for backward-compatible guild.json parsing.
   */
  sanctumHome?: string;

  /**
   * Path to the commissions data directory (no longer used).
   */
  commissionsDataDir?: string;

  /**
   * Path to the commission log YAML file (no longer used).
   */
  commissionLogPath?: string;
}

// Augment GuildConfig so `guild().guildConfig().laboratory` is typed.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    laboratory?: LaboratoryConfig;
  }
}
