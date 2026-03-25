import { tool } from '@shardworks/nexus-core';
import { createJob } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'job-create',
  description: 'Create a new job (under a piece or standalone)',
  instructions: 'Creates a job. Optionally link to a parent piece and assign to an anima.',
  params: {
    title: z.string().describe('Job title'),
    description: z.string().optional().describe('Job description'),
    pieceId: z.string().optional().describe('Parent piece ID'),
    assignee: z.string().optional().describe('Anima name to assign'),
  },
  handler: (params, { home }) => createJob(home, params),
});
