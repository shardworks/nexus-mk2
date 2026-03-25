import { createCommand } from 'commander';
import { readPendingEvents, clockTick, clockRun } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeClockCommand() {
  const clock = createCommand('clock')
    .description('Clockworks — process the guild event queue');

  // nsg clock list
  clock.addCommand(
    createCommand('list')
      .description('Show all pending (unprocessed) events')
      .action((_, cmd) => {
        const home = resolveHome(cmd);

        try {
          const events = readPendingEvents(home);

          if (events.length === 0) {
            console.log('No pending events.');
            return;
          }

          console.log(`${events.length} pending event${events.length === 1 ? '' : 's'}:\n`);
          for (const event of events) {
            const payloadSummary = event.payload
              ? ` — ${JSON.stringify(event.payload).slice(0, 80)}`
              : '';
            console.log(`  #${event.id}  ${event.name}  (${event.emitter}, ${event.firedAt})${payloadSummary}`);
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg clock tick [id]
  clock.addCommand(
    createCommand('tick')
      .description('Process the next pending event, or a specific event by id')
      .argument('[id]', 'Specific event id to process')
      .action(async (id: string | undefined, _, cmd) => {
        const home = resolveHome(cmd);

        try {
          const result = await clockTick(home, id);

          if (!result) {
            console.log('No pending events to process.');
            return;
          }

          console.log(`Processed event #${result.eventId}: ${result.eventName}`);
          if (result.dispatches.length === 0) {
            console.log('  No matching standing orders.');
          } else {
            for (const d of result.dispatches) {
              const statusIcon = d.status === 'success' ? '✓' : d.status === 'skipped' ? '⊘' : '✗';
              console.log(`  ${statusIcon} ${d.handlerType}: ${d.handlerName}${d.error ? ` — ${d.error}` : ''}`);
            }
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg clock run
  clock.addCommand(
    createCommand('run')
      .description('Process all pending events until the queue is empty')
      .action(async (_, cmd) => {
        const home = resolveHome(cmd);

        try {
          const result = await clockRun(home);

          if (result.processed.length === 0) {
            console.log('No pending events to process.');
            return;
          }

          console.log(`Processed ${result.processed.length} event${result.processed.length === 1 ? '' : 's'}:\n`);
          for (const tick of result.processed) {
            console.log(`  #${tick.eventId}  ${tick.eventName}`);
            if (tick.dispatches.length === 0) {
              console.log('    No matching standing orders.');
            } else {
              for (const d of tick.dispatches) {
                const statusIcon = d.status === 'success' ? '✓' : d.status === 'skipped' ? '⊘' : '✗';
                console.log(`    ${statusIcon} ${d.handlerType}: ${d.handlerName}${d.error ? ` — ${d.error}` : ''}`);
              }
            }
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  return clock;
}
