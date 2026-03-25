import { tool, checkJobCompletion } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'job-check',
  description: 'Check stroke completion status for a job',
  instructions: 'Returns a completion summary: total strokes, how many are done/pending/failed, and whether the job is ready to complete. Read-only — does not change any status.',
  params: {
    id: z.string().describe('Job ID'),
  },
  handler: (params, { home }) => {
    return checkJobCompletion(home, params.id);
  },
});
