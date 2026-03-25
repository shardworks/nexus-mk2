import { tool } from '@shardworks/nexus-core';
import { createPiece } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'piece-create',
  description: 'Create a new piece (under a work or standalone)',
  instructions: 'Creates a piece. Optionally link to a parent work.',
  params: {
    title: z.string().describe('Piece title'),
    description: z.string().optional().describe('Piece description'),
    workId: z.string().optional().describe('Parent work ID'),
  },
  handler: (params, { home }) => createPiece(home, params),
});
