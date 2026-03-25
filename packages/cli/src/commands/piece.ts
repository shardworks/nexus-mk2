import { createCommand } from 'commander';
import { createPiece, listPieces, showPiece, updatePiece, checkPieceCompletion } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makePieceCommand() {
  const piece = createCommand('piece')
    .description('Manage pieces (subdivisions of work)');

  piece.addCommand(
    createCommand('create')
      .description('Create a new piece')
      .argument('<title>', 'Piece title')
      .option('--description <desc>', 'Piece description')
      .option('--work <id>', 'Parent work ID')
      .action((title: string, options: { description?: string; work?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = createPiece(home, { title, description: options.description, workId: options.work });
          console.log(`Piece ${result.id} created: ${result.title}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  piece.addCommand(
    createCommand('list')
      .description('List pieces')
      .option('--status <status>', 'Filter by status')
      .option('--work <id>', 'Filter by parent work ID')
      .action((options: { status?: string; work?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const items = listPieces(home, { status: options.status, workId: options.work });
          if (items.length === 0) { console.log('No pieces found.'); return; }
          for (const p of items) {
            console.log(`  ${p.id}  [${p.status}]  ${p.title}`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  piece.addCommand(
    createCommand('show')
      .description('Show details of a piece')
      .argument('<id>', 'Piece ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = showPiece(home, id);
          if (!result) { console.error(`Piece "${id}" not found.`); process.exitCode = 1; return; }
          console.log(`${result.id}  [${result.status}]  ${result.title}`);
          if (result.description) console.log(`  ${result.description}`);
          if (result.workId) console.log(`  Work: ${result.workId}`);
          console.log(`  Created: ${result.createdAt}  Updated: ${result.updatedAt}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  piece.addCommand(
    createCommand('update')
      .description('Update a piece')
      .argument('<id>', 'Piece ID')
      .option('--title <title>', 'New title')
      .option('--description <desc>', 'New description')
      .option('--status <status>', 'New status')
      .action((id: string, options: { title?: string; description?: string; status?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = updatePiece(home, id, options);
          console.log(`Piece ${result.id} updated [${result.status}]: ${result.title}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg piece check <id>
  piece.addCommand(
    createCommand('check')
      .description('Check job completion for a piece')
      .argument('<id>', 'Piece ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const check = checkPieceCompletion(home, id);
          console.log(`Piece ${id} — job completion:`);
          console.log(`  Total:   ${check.total}`);
          console.log(`  Done:    ${check.done}`);
          console.log(`  Pending: ${check.pending}`);
          console.log(`  Failed:  ${check.failed}`);
          console.log(`  Complete: ${check.complete ? 'yes' : 'no'}`);
          if (check.failed > 0) {
            console.log(`  Note: piece has failed jobs — stays active until manually resolved.`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  return piece;
}
