import fs from 'node:fs';
import path from 'node:path';

/** Definition of a guild role — a structural position in the guild. */
export interface RoleDefinition {
  /**
   * Maximum number of animas that can hold this role simultaneously.
   * `null` means unbounded.
   */
  seats: number | null;
  /** Implements available to animas in this role (additive with baseImplements). */
  implements: string[];
  /**
   * Path to role-specific instructions markdown, relative to guild root.
   * Read fresh at manifest time and delivered to animas holding this role.
   */
  instructions?: string;
}

/** A reference to an implement or engine registered in guild.json. */
export interface ToolEntry {
  /** Upstream package identifier, e.g. "@shardworks/implement-dispatch@1.11.3". Null for locally-built tools. */
  upstream: string | null;
  /** ISO-8601 timestamp of when the tool was installed. */
  installedAt: string;
  /** npm package name for runtime resolution via node_modules. Omitted for script-only tools. */
  package?: string;
  /** Bundle that delivered this artifact, e.g. "@shardworks/guild-starter-kit@0.1.0". */
  bundle?: string;
}

/** A reference to a curriculum or temperament registered in guild.json. */
export interface TrainingEntry {
  /** Upstream package identifier, or null for locally-authored content. */
  upstream: string | null;
  /** ISO-8601 timestamp of when the content was installed. */
  installedAt: string;
  /** Bundle that delivered this artifact, e.g. "@shardworks/guild-starter-kit@0.1.0". */
  bundle?: string;
}

/** The guild's central configuration file shape (`guild.json`). */
export interface GuildConfig {
  /** Guild name — used as the guildhall npm package name. */
  name: string;
  /** Installed Nexus framework version. */
  nexus: string;
  /** Default model for anima sessions. */
  model: string;
  /** Registered workshop names. */
  workshops: string[];
  /** Guild roles — structural positions that animas fill. */
  roles: Record<string, RoleDefinition>;
  /** Implements available to all animas regardless of role. */
  baseImplements: string[];
  /** Active implements indexed by name. */
  implements: Record<string, ToolEntry>;
  /** Active engines indexed by name. */
  engines: Record<string, ToolEntry>;
  /** Available curricula indexed by name. */
  curricula: Record<string, TrainingEntry>;
  /** Available temperaments indexed by name. */
  temperaments: Record<string, TrainingEntry>;
}

/**
 * Create the default guild.json content for a new guild.
 * All registries start empty. Roles and baseImplements populated by the init sequence.
 */
export function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig {
  return {
    name,
    nexus: nexusVersion,
    model,
    workshops: [],
    roles: {},
    baseImplements: [],
    implements: {},
    engines: {},
    curricula: {},
    temperaments: {},
  };
}

/** Resolve the path to guild.json in the guild root. */
export function guildConfigPath(home: string): string {
  return path.join(home, 'guild.json');
}

/** Read and parse guild.json from the guild root. */
export function readGuildConfig(home: string): GuildConfig {
  const configFile = guildConfigPath(home);
  return JSON.parse(fs.readFileSync(configFile, 'utf-8')) as GuildConfig;
}

/** Write guild.json to the guild root. */
export function writeGuildConfig(home: string, config: GuildConfig): void {
  const configFile = guildConfigPath(home);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}

