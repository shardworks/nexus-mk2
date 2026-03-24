/**
 * install-tool implement.
 *
 * This is the canonical implementation — called by the MCP engine (for animas),
 * the CLI (for humans), and importable by engines. All access paths execute
 * the same logic.
 */
import { implement, installTool } from '@shardworks/nexus-core';
import { z } from 'zod';

export default implement({
  description: 'Install an implement, engine, curriculum, or temperament into the guild',
  params: {
    source: z.string().describe('Path to a local directory containing a nexus descriptor'),
    name: z.string().optional().describe('Override the tool name (defaults to directory name)'),
    slot: z.string().optional().describe('Override the version slot (defaults to version from descriptor)'),
    roles: z.array(z.string()).optional().describe('Roles for implement access gating'),
  },
  handler: (params, { home }) => {
    return installTool({ home, ...params });
  },
});
