import { tool } from '@shardworks/nexus-core';
import { listWorks } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'work-list',
  description: 'List work items, optionally filtered by status or commission',
  instructions: 'Returns work items from the Ledger. Use --status and --commissionId to filter.',
  params: {
    status: z.string().optional().describe('Filter by status (open, active, completed, cancelled)'),
    commissionId: z.string().optional().describe('Filter by parent commission ID'),
  },
  handler: (params, { home }) => listWorks(home, params),
});
