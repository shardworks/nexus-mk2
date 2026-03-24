import fs from 'node:fs';
import path from 'node:path';
import { guildhallWorktreePath } from './nexus-home.ts';

/** A reference to an implement or engine registered in guild.json. */
export interface ToolEntry {
  /** Whether the tool is provided by the Nexus framework or authored by the guild. */
  source: 'nexus' | 'guild';
  /** Guild-local version slot — the directory name under {implements|engines}/{name}/. */
  slot: string;
  /** Upstream package identifier, e.g. "@shardworks/implement-dispatch@1.11.3". Null for locally-built tools. */
  upstream: string | null;
  /** ISO-8601 timestamp of when the tool was installed into this slot. */
  installedAt: string;
  /** Which roles have access (implements only). ["*"] means all roles. */
  roles?: string[];
}

/** A reference to a curriculum or temperament registered in guild.json. */
export interface TrainingEntry {
  /** Guild-local version slot — the directory name under training/{curricula|temperaments}/{name}/. */
  slot: string;
  /** Upstream package identifier, or null for locally-authored content. */
  upstream: string | null;
  /** ISO-8601 timestamp of when the content was installed into this slot. */
  installedAt: string;
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
 * All registries (implements, engines, curricula, temperaments) start empty.
 */
export function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig {
  return {
    name,
    nexus: nexusVersion,
    model,
    workshops: [],
    implements: {},
    engines: {},
    curricula: {},
    temperaments: {},
  };
}

/** Resolve the path to guild.json in the standing worktree. */
export function guildConfigPath(home: string): string {
  return path.join(guildhallWorktreePath(home), 'guild.json');
}

/** Read and parse guild.json from the standing worktree. */
export function readGuildConfig(home: string): GuildConfig {
  const configFile = guildConfigPath(home);
  return JSON.parse(fs.readFileSync(configFile, 'utf-8')) as GuildConfig;
}

/** Write guild.json to the standing worktree. */
export function writeGuildConfig(home: string, config: GuildConfig): void {
  const configFile = guildConfigPath(home);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}
