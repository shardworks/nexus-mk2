import { tool } from '@shardworks/nexus-core';
import { listJobs } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'job-list',
  description: 'List jobs, optionally filtered by piece, status, or assignee',
  instructions: 'Returns jobs from the Ledger. Use --pieceId, --status, --assignee to filter.',
  params: {
    status: z.string().optional().describe('Filter by status (open, active, completed, failed, cancelled)'),
    pieceId: z.string().optional().describe('Filter by parent piece ID'),
    assignee: z.string().optional().describe('Filter by assigned anima name'),
  },
  handler: (params, { home }) => listJobs(home, params),
});
