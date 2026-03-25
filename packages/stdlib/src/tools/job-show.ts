import { tool } from '@shardworks/nexus-core';
import { showJob } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'job-show',
  description: 'Show details of a specific job',
  instructions: 'Returns the full job record including assignment, status, and parent piece.',
  params: {
    id: z.string().describe('Job ID'),
  },
  handler: (params, { home }) => {
    const result = showJob(home, params.id);
    if (!result) throw new Error(`Job "${params.id}" not found.`);
    return result;
  },
});
