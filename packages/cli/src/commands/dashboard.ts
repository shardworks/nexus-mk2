import { createCommand } from 'commander';
import { startMonitor } from '@shardworks/guild-monitor';
import { resolveHome } from '../resolve-home.ts';

export function makeDashboardCommand() {
  return createCommand('dashboard')
    .description('Start the guild monitor web dashboard')
    .option('-p, --port <number>', 'Port to serve on', '4200')
    .action(async (opts, cmd) => {
      let home: string;
      try {
        home = resolveHome(cmd);
      } catch {
        console.error('Not inside a guild. Run `nsg init` to create one, or use --guild-root.');
        process.exit(1);
      }

      const port = parseInt(opts.port, 10);
      if (isNaN(port)) {
        console.error(`Invalid port: ${opts.port}`);
        process.exit(1);
      }

      await startMonitor({ home, port });
    });
}
