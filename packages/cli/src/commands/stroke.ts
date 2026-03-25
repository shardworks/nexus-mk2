import { createCommand } from 'commander';
import { createStroke, listStrokes, showStroke, updateStroke } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeStrokeCommand() {
  const stroke = createCommand('stroke')
    .description('Manage strokes (atomic records of work)');

  stroke.addCommand(
    createCommand('create')
      .description('Record a new stroke against a job')
      .argument('<kind>', 'Stroke kind (e.g. commit, review, test, deploy)')
      .requiredOption('--job <id>', 'Parent job ID')
      .option('--content <content>', 'Stroke content or description')
      .action((kind: string, options: { job: string; content?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = createStroke(home, { jobId: options.job, kind, content: options.content });
          console.log(`Stroke ${result.id} recorded: ${result.kind}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  stroke.addCommand(
    createCommand('list')
      .description('List strokes')
      .option('--job <id>', 'Filter by parent job ID')
      .option('--status <status>', 'Filter by status (pending, complete, failed)')
      .action((options: { job?: string; status?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const items = listStrokes(home, { jobId: options.job, status: options.status });
          if (items.length === 0) { console.log('No strokes found.'); return; }
          for (const s of items) {
            console.log(`  ${s.id}  [${s.status}]  ${s.kind}`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  stroke.addCommand(
    createCommand('show')
      .description('Show details of a stroke')
      .argument('<id>', 'Stroke ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = showStroke(home, id);
          if (!result) { console.error(`Stroke "${id}" not found.`); process.exitCode = 1; return; }
          console.log(`${result.id}  [${result.status}]  ${result.kind}`);
          if (result.content) console.log(`  ${result.content}`);
          console.log(`  Job: ${result.jobId}`);
          console.log(`  Created: ${result.createdAt}  Updated: ${result.updatedAt}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  stroke.addCommand(
    createCommand('update')
      .description('Update a stroke')
      .argument('<id>', 'Stroke ID')
      .option('--status <status>', 'New status (pending, complete, failed)')
      .option('--content <content>', 'Updated content')
      .action((id: string, options: { status?: string; content?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = updateStroke(home, id, options);
          console.log(`Stroke ${result.id} updated [${result.status}]: ${result.kind}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  return stroke;
}
