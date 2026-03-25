import { tool } from '@shardworks/nexus-core';
import { listPieces } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'piece-list',
  description: 'List pieces, optionally filtered by parent work or status',
  instructions: 'Returns pieces from the Ledger. Use --workId and --status to filter.',
  params: {
    status: z.string().optional().describe('Filter by status (open, active, completed, cancelled)'),
    workId: z.string().optional().describe('Filter by parent work ID'),
  },
  handler: (params, { home }) => listPieces(home, params),
});
