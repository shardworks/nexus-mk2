import { tool } from '@shardworks/nexus-core';
import { listStrokes } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'stroke-list',
  description: 'List strokes, optionally filtered by job or status',
  instructions: 'Returns strokes from the Ledger. Use --jobId and --status to filter.',
  params: {
    jobId: z.string().optional().describe('Filter by parent job ID'),
    status: z.string().optional().describe('Filter by status (pending, complete, failed)'),
  },
  handler: (params, { home }) => listStrokes(home, params),
});
