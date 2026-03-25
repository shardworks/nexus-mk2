import { createCommand } from 'commander';
import { createWork, listWorks, showWork, updateWork } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeWorkCommand() {
  const work = createCommand('work')
    .description('Manage work items (top-level work decomposition)');

  work.addCommand(
    createCommand('create')
      .description('Create a new work item')
      .argument('<title>', 'Work title')
      .option('--description <desc>', 'Work description')
      .option('--commission <id>', 'Parent commission ID')
      .action((title: string, options: { description?: string; commission?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = createWork(home, { title, description: options.description, commissionId: options.commission });
          console.log(`Work ${result.id} created: ${result.title}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  work.addCommand(
    createCommand('list')
      .description('List work items')
      .option('--status <status>', 'Filter by status (open, active, completed, cancelled)')
      .option('--commission <id>', 'Filter by commission ID')
      .action((options: { status?: string; commission?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const items = listWorks(home, { status: options.status, commissionId: options.commission });
          if (items.length === 0) { console.log('No work items found.'); return; }
          for (const w of items) {
            console.log(`  ${w.id}  [${w.status}]  ${w.title}`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  work.addCommand(
    createCommand('show')
      .description('Show details of a work item')
      .argument('<id>', 'Work ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = showWork(home, id);
          if (!result) { console.error(`Work "${id}" not found.`); process.exitCode = 1; return; }
          console.log(`${result.id}  [${result.status}]  ${result.title}`);
          if (result.description) console.log(`  ${result.description}`);
          if (result.commissionId) console.log(`  Commission: ${result.commissionId}`);
          console.log(`  Created: ${result.createdAt}  Updated: ${result.updatedAt}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  work.addCommand(
    createCommand('update')
      .description('Update a work item')
      .argument('<id>', 'Work ID')
      .option('--title <title>', 'New title')
      .option('--description <desc>', 'New description')
      .option('--status <status>', 'New status (open, active, completed, cancelled)')
      .action((id: string, options: { title?: string; description?: string; status?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = updateWork(home, id, options);
          console.log(`Work ${result.id} updated [${result.status}]: ${result.title}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  return work;
}
