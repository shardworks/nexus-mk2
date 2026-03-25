import { tool } from '@shardworks/nexus-core';
import { listAnimas } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'anima-list',
  description: 'List animas in the guild, optionally filtered by status or role',
  instructions: 'Returns animas from the Register with their roles. Use --status to filter by lifecycle status, --role to filter by role.',
  params: {
    status: z.string().optional().describe('Filter by status (aspirant, active, retired)'),
    role: z.string().optional().describe('Filter by role name'),
  },
  handler: (params, { home }) => listAnimas(home, params),
});
