/**
 * signal tool.
 *
 * Signals a custom guild event. The event is persisted to the Ledger's events
 * table and will be processed by the Clockworks runner. Validates that the
 * event name is declared in guild.json and is not in a reserved namespace.
 */
import { tool, validateCustomEvent, signalEvent } from '@shardworks/nexus-core';
import { z } from 'zod';

export default tool({
  description: 'Signal a custom guild event for the Clockworks',
  params: {
    name: z.string().describe('Event name (must be declared in guild.json clockworks.events)'),
    payload: z.record(z.string(), z.unknown()).optional().describe('Event payload (JSON object)'),
  },
  handler: (params, { home }) => {
    // Validate the event name is declared and not reserved
    validateCustomEvent(home, params.name);

    // Persist the event
    const eventId = signalEvent(home, params.name, params.payload ?? null, 'anima');

    return { eventId, name: params.name };
  },
});
