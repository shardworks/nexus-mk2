import { createCommand } from 'commander';
import { resolveNexusHome, publish } from '@shardworks/nexus-core';

export function makePublishCommand() {
  return createCommand('publish')
    .description('Publish a completed commission')
    .argument('<commissionId>', 'Commission ID to publish')
    .option('--summary <summary>', 'Brief summary of what was accomplished')
    .action((commissionIdStr: string, options: { summary?: string }) => {
      const home = resolveNexusHome();
      const commissionId = parseInt(commissionIdStr, 10);

      if (isNaN(commissionId)) {
        console.error('Error: commission ID must be a number');
        process.exitCode = 1;
        return;
      }

      try {
        const result = publish({ home, commissionId, summary: options.summary });
        console.log(`Commission #${result.commissionId} published (was: ${result.previousStatus})`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
