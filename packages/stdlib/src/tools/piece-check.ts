import { tool, checkPieceCompletion } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  name: 'piece-check',
  description: 'Check job completion status for a piece',
  instructions: 'Returns a completion summary: total jobs, how many are done/pending/failed, and whether the piece is ready to complete. A piece with failed jobs stays active until manually resolved. Read-only — does not change any status.',
  params: {
    id: z.string().describe('Piece ID'),
  },
  handler: (params, { home }) => {
    return checkPieceCompletion(home, params.id);
  },
});
