import { createCommand } from 'commander';
import { validateCustomEvent, signalEvent } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeSignalCommand() {
  return createCommand('signal')
    .description('Signal a custom guild event')
    .argument('<name>', 'Event name (must be declared in guild.json clockworks.events)')
    .option('--payload <json>', 'Event payload as JSON')
    .action((name: string, options: { payload?: string }, cmd) => {
      const home = resolveHome(cmd);

      let payload: unknown = null;
      if (options.payload) {
        try {
          payload = JSON.parse(options.payload);
        } catch {
          console.error(`Error: --payload must be valid JSON.`);
          process.exitCode = 1;
          return;
        }
      }

      try {
        validateCustomEvent(home, name);
        const eventId = signalEvent(home, name, payload, 'operator');
        console.log(`Event #${eventId} signaled: ${name}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
