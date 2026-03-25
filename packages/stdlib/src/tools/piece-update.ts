import { tool } from '@shardworks/nexus-core';
import { updatePiece } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'piece-update',
  description: 'Update a piece\'s fields or status',
  instructions: 'Updates a piece. Status transitions: open → active → completed/cancelled.',
  params: {
    id: z.string().describe('Piece ID'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    status: z.string().optional().describe('New status (open, active, completed, cancelled)'),
  },
  handler: (params, { home }) => updatePiece(home, params.id, {
    title: params.title, description: params.description, status: params.status,
  }),
});
