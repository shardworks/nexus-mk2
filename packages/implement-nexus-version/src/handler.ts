/**
 * nexus-version implement.
 *
 * Reports the guild's Nexus framework version and the registered versions
 * of all base implements and engines. Reads from guild.json to reflect
 * what's actually installed, not just what the framework ships with.
 */
import { implement, VERSION, readGuildConfig } from '@shardworks/nexus-core';
import { z } from 'zod';

export default implement({
  description: 'Report version information for the guild\'s Nexus installation and base implements',
  params: {
    verbose: z.boolean().optional().describe('Include full guild.json tool entries with timestamps'),
  },
  handler: (params, { home }) => {
    const config = readGuildConfig(home);

    /** Tools delivered by a @shardworks bundle are considered "base" (framework) tools. */
    const isBase = (entry: { bundle?: string }) =>
      entry.bundle != null && entry.bundle.startsWith('@shardworks/');

    // Collect base (framework) implement names
    const baseImplements = Object.keys(config.implements).filter(
      name => isBase(config.implements[name]),
    );

    // Collect base (framework) engine names
    const baseEngines = Object.keys(config.engines).filter(
      name => isBase(config.engines[name]),
    );

    if (params.verbose) {
      return {
        nexus: VERSION,
        model: config.model,
        implements: Object.fromEntries(
          Object.entries(config.implements)
            .filter(([, e]) => isBase(e))
        ),
        engines: Object.fromEntries(
          Object.entries(config.engines)
            .filter(([, e]) => isBase(e))
        ),
      };
    }

    return {
      nexus: VERSION,
      implements: baseImplements,
      engines: baseEngines,
    };
  },
});
