import { tool } from '@shardworks/nexus-core';
import { createWork } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'work-create',
  description: 'Create a new work item',
  instructions: 'Creates a top-level work item. Optionally link to a commission.',
  params: {
    title: z.string().describe('Work title'),
    description: z.string().optional().describe('Work description'),
    commissionId: z.string().optional().describe('Parent commission ID'),
  },
  handler: (params, { home }) => createWork(home, params),
});
