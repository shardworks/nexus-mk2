import { tool } from '@shardworks/nexus-core';
import { showAnima } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'anima-show',
  description: 'Show detailed information about a specific anima',
  instructions: 'Returns the full anima record including roles, curriculum, temperament, and composition metadata. Accepts ID or name.',
  params: {
    id: z.string().describe('Anima ID or name'),
  },
  handler: (params, { home }) => {
    const result = showAnima(home, params.id);
    if (!result) throw new Error(`Anima "${params.id}" not found.`);
    return result;
  },
});
