import { tool } from '@shardworks/nexus-core';
import { updateJob } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'job-update',
  description: 'Update a job\'s fields, status, or assignment',
  instructions: 'Updates a job. Status transitions: open → active → completed/failed/cancelled. Use --assignee to reassign.',
  params: {
    id: z.string().describe('Job ID'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    status: z.string().optional().describe('New status (open, active, completed, failed, cancelled)'),
    assignee: z.string().optional().describe('Anima name to assign'),
  },
  handler: (params, { home }) => updateJob(home, params.id, {
    title: params.title, description: params.description,
    status: params.status, assignee: params.assignee,
  }),
});
