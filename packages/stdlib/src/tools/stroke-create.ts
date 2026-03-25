import { tool } from '@shardworks/nexus-core';
import { createStroke } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'stroke-create',
  description: 'Record a new stroke against a job',
  instructions: 'Creates a stroke — an atomic record of work performed. Must be linked to a job.',
  params: {
    jobId: z.string().describe('Parent job ID'),
    kind: z.string().describe('Stroke kind (e.g. commit, review, test, deploy)'),
    content: z.string().optional().describe('Stroke content or description'),
  },
  handler: (params, { home }) => createStroke(home, params),
});
