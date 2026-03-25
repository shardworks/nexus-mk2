import { tool } from '@shardworks/nexus-core';
import { showStroke } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'stroke-show',
  description: 'Show details of a specific stroke',
  instructions: 'Returns the full stroke record including kind, content, status, and parent job.',
  params: {
    id: z.string().describe('Stroke ID'),
  },
  handler: (params, { home }) => {
    const result = showStroke(home, params.id);
    if (!result) throw new Error(`Stroke "${params.id}" not found.`);
    return result;
  },
});
