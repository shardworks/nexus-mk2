import { tool } from '@shardworks/nexus-core';
import { showWork } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'work-show',
  description: 'Show details of a specific work item',
  instructions: 'Returns the full work record including status, commission lineage, and timestamps.',
  params: {
    id: z.string().describe('Work ID'),
  },
  handler: (params, { home }) => {
    const result = showWork(home, params.id);
    if (!result) throw new Error(`Work "${params.id}" not found.`);
    return result;
  },
});
