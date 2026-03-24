/**
 * Clockworks runner — processes the event queue by matching pending events
 * to standing orders in guild.json and executing them.
 *
 * This is the core of Pillar 5. It reads unprocessed events from the Ledger,
 * finds matching standing orders, and dispatches them (run engines, or
 * summon/brief animas). Each event is marked as processed after all its
 * standing orders have been dispatched.
 */
import path from 'node:path';
import { readGuildConfig } from './guild-config.ts';
import type { GuildConfig, StandingOrder } from './guild-config.ts';
import {
  readPendingEvents,
  readEvent,
  markEventProcessed,
  recordDispatch,
  signalEvent,
} from './events.ts';
import { isClockworkEngine } from './engine.ts';
import type { GuildEvent } from './engine.ts';

/** Result of processing a single event. */
export interface TickResult {
  eventId: number;
  eventName: string;
  dispatches: DispatchSummary[];
}

/** Summary of one standing order execution. */
export interface DispatchSummary {
  handlerType: 'engine' | 'anima';
  handlerName: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

/** Result of a full clock run. */
export interface ClockRunResult {
  processed: TickResult[];
  totalEvents: number;
}

/**
 * Process a single event: find matching standing orders and execute them.
 *
 * @param home - Absolute path to the guild root.
 * @param event - The event to process.
 * @returns Summary of what was dispatched.
 */
async function processEvent(home: string, event: GuildEvent): Promise<TickResult> {
  const config = readGuildConfig(home);
  const standingOrders = config.clockworks?.standingOrders ?? [];
  const matching = standingOrders.filter(so => so.on === event.name);
  const dispatches: DispatchSummary[] = [];

  // Check loop guard: don't process standing-order.failed events triggered
  // by other standing-order.failed events.
  const isFailureEvent = event.name === 'standing-order.failed';
  const isNestedFailure = isFailureEvent &&
    typeof event.payload === 'object' &&
    event.payload !== null &&
    'triggeringEvent' in event.payload &&
    typeof (event.payload as Record<string, unknown>).triggeringEvent === 'object' &&
    (event.payload as Record<string, unknown>).triggeringEvent !== null &&
    ((event.payload as Record<string, unknown>).triggeringEvent as Record<string, unknown>).name === 'standing-order.failed';

  if (isNestedFailure) {
    // Loop guard: skip processing to prevent cascade.
    markEventProcessed(home, event.id);
    return { eventId: event.id, eventName: event.name, dispatches: [] };
  }

  for (const order of matching) {
    if ('run' in order && order.run) {
      const summary = await executeEngineOrder(home, event, order.run, config);
      dispatches.push(summary);

      // On failure, signal standing-order.failed
      if (summary.status === 'error') {
        signalStandingOrderFailed(home, order, event, summary.error!);
      }
    } else if ('summon' in order && order.summon) {
      const summary = await executeAnimaOrder(home, event, order.summon, 'summon');
      dispatches.push(summary);

      if (summary.status === 'error') {
        signalStandingOrderFailed(home, order, event, summary.error!);
      }
    } else if ('brief' in order && order.brief) {
      const summary = await executeAnimaOrder(home, event, order.brief, 'brief');
      dispatches.push(summary);

      if (summary.status === 'error') {
        signalStandingOrderFailed(home, order, event, summary.error!);
      }
    }
  }

  markEventProcessed(home, event.id);
  return { eventId: event.id, eventName: event.name, dispatches };
}

/**
 * Execute a `run:` standing order — load and call a clockwork engine.
 */
async function executeEngineOrder(
  home: string,
  event: GuildEvent,
  engineName: string,
  config: GuildConfig,
): Promise<DispatchSummary> {
  const startedAt = new Date().toISOString();

  try {
    // Resolve engine entry point from guild.json
    const engineEntry = config.engines?.[engineName];
    if (!engineEntry) {
      throw new Error(`Engine "${engineName}" not found in guild.json engines registry.`);
    }

    // Resolve the engine module path
    const enginePkg = engineEntry.package;
    if (!enginePkg) {
      throw new Error(`Engine "${engineName}" has no package field — cannot resolve module.`);
    }

    // Import the engine module
    const mod = await import(enginePkg);
    const engineDef = mod.default;

    if (!isClockworkEngine(engineDef)) {
      throw new Error(
        `Engine "${engineName}" does not export a clockwork engine (engine() factory). ` +
        `Only clockwork engines can be used in "run:" standing orders.`,
      );
    }

    await engineDef.handler(event, { home });

    const endedAt = new Date().toISOString();
    recordDispatch(home, {
      eventId: event.id,
      handlerType: 'engine',
      handlerName: engineName,
      startedAt,
      endedAt,
      status: 'success',
    });

    return { handlerType: 'engine', handlerName: engineName, status: 'success' };
  } catch (err) {
    const endedAt = new Date().toISOString();
    const errorMsg = err instanceof Error ? err.message : String(err);

    recordDispatch(home, {
      eventId: event.id,
      handlerType: 'engine',
      handlerName: engineName,
      startedAt,
      endedAt,
      status: 'error',
      error: errorMsg,
    });

    return { handlerType: 'engine', handlerName: engineName, status: 'error', error: errorMsg };
  }
}

/**
 * Execute a `summon:` or `brief:` standing order.
 *
 * Phase 1: records the dispatch but does NOT actually manifest the anima.
 * Anima manifestation requires the manifest engine, which needs extension
 * to accept event context. For now, we record the intent and mark it as
 * skipped so the system is auditable.
 */
async function executeAnimaOrder(
  home: string,
  event: GuildEvent,
  roleName: string,
  noticeType: 'summon' | 'brief',
): Promise<DispatchSummary> {
  const startedAt = new Date().toISOString();

  // Phase 1: record the dispatch intent but don't actually manifest.
  // The manifest engine needs extension to accept event context.
  const endedAt = new Date().toISOString();

  recordDispatch(home, {
    eventId: event.id,
    handlerType: 'anima',
    handlerName: `(role: ${roleName})`,
    targetRole: roleName,
    noticeType,
    startedAt,
    endedAt,
    status: 'success',
  });

  return {
    handlerType: 'anima',
    handlerName: `(role: ${roleName})`,
    status: 'skipped',
    error: 'Anima manifestation via standing orders not yet implemented (Phase 1)',
  };
}

/**
 * Signal standing-order.failed when a standing order execution fails.
 */
function signalStandingOrderFailed(
  home: string,
  order: StandingOrder,
  triggeringEvent: GuildEvent,
  error: string,
): void {
  signalEvent(home, 'standing-order.failed', {
    standingOrder: order,
    triggeringEvent: {
      id: triggeringEvent.id,
      name: triggeringEvent.name,
    },
    error,
  }, 'framework');
}

/**
 * Process the next pending event (or a specific event by id).
 *
 * @param home - Guild root path.
 * @param eventId - Specific event id to process, or undefined for next pending.
 * @returns Processing result, or null if no events to process.
 */
export async function clockTick(home: string, eventId?: number): Promise<TickResult | null> {
  if (eventId != null) {
    const event = readEvent(home, eventId);
    if (!event) {
      throw new Error(`Event #${eventId} not found.`);
    }
    return processEvent(home, event);
  }

  const pending = readPendingEvents(home);
  if (pending.length === 0) return null;

  return processEvent(home, pending[0]!);
}

/**
 * Process all pending events until the queue is empty.
 *
 * @param home - Guild root path.
 * @returns Summary of all processing.
 */
export async function clockRun(home: string): Promise<ClockRunResult> {
  const processed: TickResult[] = [];
  let totalEvents = 0;

  // Process in a loop because standing order failures may generate new events
  while (true) {
    const pending = readPendingEvents(home);
    if (pending.length === 0) break;

    totalEvents += pending.length;

    for (const event of pending) {
      const result = await processEvent(home, event);
      processed.push(result);
    }
  }

  return { processed, totalEvents };
}
