import { createCommand } from 'commander';
import { commission } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeCommissionCommand() {
  return createCommand('commission')
    .description('Post a commission to the guild')
    .argument('<spec>', 'Commission specification — what needs to be done')
    .requiredOption('--workshop <workshop>', 'Target workshop')
    .action((spec: string, options: { workshop: string }, cmd) => {
      const home = resolveHome(cmd);

      try {
        const result = commission({
          home,
          spec,
          workshop: options.workshop,
        });

        console.log(`Commission #${result.commissionId} posted to workshop "${options.workshop}"`);
        console.log(`  Run \`nsg clock run\` to process through Clockworks.`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
