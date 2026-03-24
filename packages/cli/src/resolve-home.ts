import path from 'node:path';
import { findGuildRoot } from '@shardworks/nexus-core';

/** Minimal interface for reading global options from any Commander command. */
interface CommandLike {
  optsWithGlobals(): Record<string, unknown>;
}

/**
 * Resolve the guild root from a command's parent options or auto-detection.
 *
 * Reads `--guild-root` from the root program's options. If not set, walks
 * up from cwd looking for guild.json.
 */
export function resolveHome(cmd: CommandLike): string {
  const rootOpts = cmd.optsWithGlobals() as { guildRoot?: string };
  if (rootOpts.guildRoot) return path.resolve(rootOpts.guildRoot);
  return findGuildRoot();
}
