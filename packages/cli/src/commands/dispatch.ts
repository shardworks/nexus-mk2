import { createCommand } from 'commander';
import { resolveNexusHome, dispatch } from '@shardworks/nexus-core';

export function makeDispatchCommand() {
  return createCommand('dispatch')
    .description('Post a commission to the guild')
    .argument('<spec>', 'Commission specification — what needs to be done')
    .requiredOption('--workshop <workshop>', 'Target workshop')
    .option('--anima <anima>', 'Target anima name')
    .action((spec: string, options: { workshop: string; anima?: string }) => {
      const home = resolveNexusHome();

      try {
        const result = dispatch({
          home,
          spec,
          workshop: options.workshop,
          anima: options.anima,
        });

        console.log(`Commission #${result.commissionId} posted to workshop "${options.workshop}"`);
        if (result.assigned) {
          console.log(`  Assigned to: ${result.assignedTo}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
