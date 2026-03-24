import { createCommand } from 'commander';
import { rehydrate } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeRehydrateCommand() {
  return createCommand('rehydrate')
    .description('Restore node_modules from git-tracked guild state (after fresh clone)')
    .action((_options: Record<string, unknown>, cmd) => {
      const home = resolveHome(cmd);

      try {
        const result = rehydrate(home);

        if (result.fromPackageJson > 0) {
          console.log(`Restored ${result.fromPackageJson} package(s) from package.json`);
        }
        for (const name of result.fromSlotSource) {
          console.log(`Restored "${name}" from on-disk source`);
        }
        if (result.needsRelink.length > 0) {
          console.log('\nThe following linked tools need manual re-linking:');
          for (const name of result.needsRelink) {
            console.log(`  - ${name}`);
          }
        }
        if (result.fromPackageJson === 0 && result.fromSlotSource.length === 0 && result.needsRelink.length === 0) {
          console.log('Nothing to rehydrate.');
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
