import { tool } from '@shardworks/nexus-core';
import { showPiece } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'piece-show',
  description: 'Show details of a specific piece',
  instructions: 'Returns the full piece record including status and parent work.',
  params: {
    id: z.string().describe('Piece ID'),
  },
  handler: (params, { home }) => {
    const result = showPiece(home, params.id);
    if (!result) throw new Error(`Piece "${params.id}" not found.`);
    return result;
  },
});
