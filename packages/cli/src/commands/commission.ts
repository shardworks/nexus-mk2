import { createCommand } from 'commander';
import {
  commission, readCommission, updateCommissionStatus, listCommissions,
} from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeCommissionCommand() {
  const cmd = createCommand('commission')
    .description('Manage commissions');

  // nsg commission create <spec> --workshop <name>
  const createCmd = createCommand('create')
    .description('Post a commission to the guild')
    .argument('<spec>', 'Commission specification — what needs to be done')
    .requiredOption('--workshop <workshop>', 'Target workshop')
    .action((spec: string, options: { workshop: string }, cmd) => {
      const home = resolveHome(cmd);
      try {
        const result = commission({ home, spec, workshop: options.workshop });
        console.log(`Commission ${result.commissionId} posted to workshop "${options.workshop}"`);
        console.log(`  Run \`nsg clock run\` to process through Clockworks.`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
  cmd.addCommand(createCmd);

  // nsg commission list [--status <status>] [--workshop <workshop>]
  cmd.addCommand(
    createCommand('list')
      .description('List commissions')
      .option('--status <status>', 'Filter by status')
      .option('--workshop <workshop>', 'Filter by workshop')
      .action((options: { status?: string; workshop?: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          const items = listCommissions(home, options);

          if (items.length === 0) {
            console.log('No commissions found.');
            return;
          }

          console.log(`${items.length} commission${items.length === 1 ? '' : 's'}:\n`);
          for (const c of items) {
            const summary = c.content.length > 60 ? c.content.slice(0, 60) + '...' : c.content;
            console.log(`  ${c.id}  [${c.status}]  ${c.workshop}`);
            console.log(`    ${summary}`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg commission show <id>
  cmd.addCommand(
    createCommand('show')
      .description('Show details of a commission')
      .argument('<id>', 'Commission ID')
      .action((id: string, _, cmd) => {
        const home = resolveHome(cmd);
        try {
          const result = readCommission(home, id);
          if (!result) {
            console.error(`Commission "${id}" not found.`);
            process.exitCode = 1;
            return;
          }

          console.log(`Commission ${result.id}`);
          console.log(`  Status: ${result.status}`);
          if (result.statusReason) console.log(`  Reason: ${result.statusReason}`);
          console.log(`  Workshop: ${result.workshop}`);
          console.log(`  Content: ${result.content}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg commission update <id> --status <status> --reason <reason>
  cmd.addCommand(
    createCommand('update')
      .description('Update a commission\'s status')
      .argument('<id>', 'Commission ID')
      .requiredOption('--status <status>', 'New status')
      .requiredOption('--reason <reason>', 'Reason for status change')
      .action((id: string, options: { status: string; reason: string }, cmd) => {
        const home = resolveHome(cmd);
        try {
          updateCommissionStatus(home, id, options.status, options.reason);
          console.log(`Commission ${id} updated to "${options.status}".`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // Alias: `nsg commission <spec>` (bare, without subcommand) → create
  // Commander doesn't natively support this. We use .argument() on the group
  // command itself with .passthrough() as a fallback. Instead, we'll set
  // the default subcommand explicitly.
  cmd.action((...args) => {
    // If called without a known subcommand, treat first positional as spec
    // and delegate to the create subcommand.
    const rawArgs = cmd.args;
    if (rawArgs.length > 0) {
      createCmd.parseAsync(rawArgs, { from: 'user' });
    }
  });

  return cmd;
}
