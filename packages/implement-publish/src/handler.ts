/**
 * publish implement.
 *
 * This is the canonical implementation — called by the MCP engine (for animas),
 * the CLI (for humans), and importable by engines. All access paths execute
 * the same logic.
 */
import { implement, publish } from '@shardworks/nexus-core';
import { z } from 'zod';

export default implement({
  description: 'Publish a completed commission — mark it as done in the Ledger',
  params: {
    commissionId: z.number().describe('ID of the commission being published'),
    summary: z.string().optional().describe('Brief summary of what was accomplished'),
  },
  handler: (params, { home }) => {
    return publish({ home, ...params });
  },
});
