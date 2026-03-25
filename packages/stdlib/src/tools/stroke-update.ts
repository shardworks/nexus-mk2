import { tool } from '@shardworks/nexus-core';
import { updateStroke } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'stroke-update',
  description: 'Update a stroke\'s status or content',
  instructions: 'Updates a stroke. Status transitions: pending → complete/failed.',
  params: {
    id: z.string().describe('Stroke ID'),
    status: z.string().optional().describe('New status (pending, complete, failed)'),
    content: z.string().optional().describe('Updated content'),
  },
  handler: (params, { home }) => updateStroke(home, params.id, {
    status: params.status, content: params.content,
  }),
});
