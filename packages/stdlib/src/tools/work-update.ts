import { tool } from '@shardworks/nexus-core';
import { updateWork } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'work-update',
  description: 'Update a work item\'s fields or status',
  instructions: 'Updates a work item. Status transitions: open → active → completed/cancelled.',
  params: {
    id: z.string().describe('Work ID'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    status: z.string().optional().describe('New status (open, active, completed, cancelled)'),
  },
  handler: (params, { home }) => updateWork(home, params.id, {
    title: params.title, description: params.description, status: params.status,
  }),
});
