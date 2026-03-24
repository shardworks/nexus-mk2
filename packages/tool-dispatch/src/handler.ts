/**
 * dispatch tool.
 *
 * This is the canonical implementation — called by the MCP engine (for animas),
 * the CLI (for humans), and importable by engines. All access paths execute
 * the same logic.
 */
import { tool, dispatch } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  description: 'Post a commission and assign it to a workshop for an anima to work on',
  params: {
    spec: z.string().describe('Commission specification — what needs to be done'),
    workshop: z.string().describe('Target workshop for the commission'),
    anima: z.string().optional().describe('Target anima name (if unspecified, commission is posted but unassigned)'),
  },
  handler: (params, { home }) => {
    return dispatch({ home, ...params });
  },
});
