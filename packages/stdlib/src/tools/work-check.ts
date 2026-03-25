import { tool, checkWorkCompletion } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'work-check',
  description: 'Check piece completion status for a work item',
  instructions: 'Returns a completion summary: total pieces, how many are done/pending/failed, and whether the work is ready to complete. Read-only — does not change any status.',
  params: {
    id: z.string().describe('Work ID'),
  },
  handler: (params, { home }) => {
    return checkWorkCompletion(home, params.id);
  },
});
