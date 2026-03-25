import { createCommand } from 'commander';
import { createJob, listJobs, showJob, updateJob, checkJobCompletion } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeJobCommand() {
  const job = createCommand('job')
    .description('Manage jobs (assignable units of work)');

  job.addCommand(
    createCommand('create')
      .description('Create a new job')
      .argument('<title>', 'Job title')
      .option('--description <desc>', 'Job description')
      .option('--piece <id>', 'Parent piece ID')
      .option('--assignee <name>', 'Anima name to assign')
      .action((title: string, options: { description?: string; piece?: string; assignee?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = createJob(home, { title, description: options.description, pieceId: options.piece, assignee: options.assignee });
          console.log(`Job ${result.id} created: ${result.title}`);
          if (result.assignee) console.log(`  Assigned to: ${result.assignee}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  job.addCommand(
    createCommand('list')
      .description('List jobs')
      .option('--status <status>', 'Filter by status')
      .option('--piece <id>', 'Filter by parent piece ID')
      .option('--assignee <name>', 'Filter by assigned anima')
      .action((options: { status?: string; piece?: string; assignee?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const items = listJobs(home, { status: options.status, pieceId: options.piece, assignee: options.assignee });
          if (items.length === 0) { console.log('No jobs found.'); return; }
          for (const j of items) {
            const assignLabel = j.assignee ? ` → ${j.assignee}` : '';
            console.log(`  ${j.id}  [${j.status}]  ${j.title}${assignLabel}`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  job.addCommand(
    createCommand('show')
      .description('Show details of a job')
      .argument('<id>', 'Job ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = showJob(home, id);
          if (!result) { console.error(`Job "${id}" not found.`); process.exitCode = 1; return; }
          console.log(`${result.id}  [${result.status}]  ${result.title}`);
          if (result.description) console.log(`  ${result.description}`);
          if (result.pieceId) console.log(`  Piece: ${result.pieceId}`);
          if (result.assignee) console.log(`  Assignee: ${result.assignee}`);
          console.log(`  Created: ${result.createdAt}  Updated: ${result.updatedAt}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  job.addCommand(
    createCommand('update')
      .description('Update a job')
      .argument('<id>', 'Job ID')
      .option('--title <title>', 'New title')
      .option('--description <desc>', 'New description')
      .option('--status <status>', 'New status')
      .option('--assignee <name>', 'Assign to anima')
      .action((id: string, options: { title?: string; description?: string; status?: string; assignee?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = updateJob(home, id, options);
          console.log(`Job ${result.id} updated [${result.status}]: ${result.title}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg job check <id>
  job.addCommand(
    createCommand('check')
      .description('Check stroke completion for a job')
      .argument('<id>', 'Job ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const check = checkJobCompletion(home, id);
          console.log(`Job ${id} — stroke completion:`);
          console.log(`  Total:   ${check.total}`);
          console.log(`  Done:    ${check.done}`);
          console.log(`  Pending: ${check.pending}`);
          console.log(`  Failed:  ${check.failed}`);
          console.log(`  Complete: ${check.complete ? 'yes' : 'no'}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  return job;
}
