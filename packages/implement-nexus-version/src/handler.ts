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
    verbose: z.boolean().optional().describe('Include full guild.json tool entries with slots and timestamps'),
  },
  handler: (params, { home }) => {
    const config = readGuildConfig(home);

    // Collect base (framework) implements
    const baseImplements: Record<string, string> = {};
    for (const [name, entry] of Object.entries(config.implements)) {
      if (entry.source === 'nexus') {
        baseImplements[name] = entry.slot;
      }
    }

    // Collect base (framework) engines
    const baseEngines: Record<string, string> = {};
    for (const [name, entry] of Object.entries(config.engines)) {
      if (entry.source === 'nexus') {
        baseEngines[name] = entry.slot;
      }
    }

    if (params.verbose) {
      return {
        nexus: VERSION,
        model: config.model,
        implements: Object.fromEntries(
          Object.entries(config.implements)
            .filter(([, e]) => e.source === 'nexus')
        ),
        engines: Object.fromEntries(
          Object.entries(config.engines)
            .filter(([, e]) => e.source === 'nexus')
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
