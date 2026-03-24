import { createCommand } from 'commander';

export function makeStatusCommand() {
  return createCommand('status')
    .description('Show system status')
    .action(() => {
      console.log('Nexus Mk 2.1 — operational');
    });
}
