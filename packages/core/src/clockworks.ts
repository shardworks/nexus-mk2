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
import Database from 'better-sqlite3';
import { readGuildConfig } from './guild-config.ts';
import type { GuildConfig, StandingOrder } from './guild-config.ts';
import {
  readPendingEvents,
  readEvent,
  markEventProcessed,
  recordDispatch,
  signalEvent,
} from './events.ts';
import { isClockworkEngine, resolveEngineFromExport } from './engine.ts';
import type { GuildEvent } from './engine.ts';
import { ledgerPath } from './nexus-home.ts';
import { updateCommissionStatus } from './commission.ts';

/**
 * Callback for launching anima sessions. Provided by the CLI layer since
 * the core package cannot depend on the CLI or engine-manifest directly.
 *
 * The Clockworks runner calls this when processing a `summon` standing order.
 * The callback should: resolve the role to an anima, manifest it, launch
 * a claude session, wait for exit, and return the result.
 *
 * If no handler is registered, summon orders are recorded but skipped.
 */
export type SummonHandler = (
  home: string,
  event: GuildEvent,
  roleName: string,
  noticeType: 'summon' | 'brief',
) => Promise<{ animaName: string; exitCode: number }>;

let _summonHandler: SummonHandler | null = null;

/**
 * Register a summon handler. Called once at CLI startup to wire in the
 * session launcher without creating a circular dependency.
 */
export function registerSummonHandler(handler: SummonHandler): void {
  _summonHandler = handler;
}

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

    // Import the engine module — handles both single and array exports
    const mod = await import(enginePkg);
    const engineDef = resolveEngineFromExport(mod.default, engineName);

    if (!engineDef) {
      throw new Error(
        `Engine "${engineName}" could not be resolved from "${enginePkg}". ` +
        `Module must export an engine() definition or an array of engine() definitions with matching names.`,
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
 * If a summon handler is registered (by the CLI layer), delegates to it
 * for full session lifecycle: resolve anima, manifest, launch claude,
 * wait for exit, signal session ended.
 *
 * If no handler is registered, records the dispatch as skipped.
 */
async function executeAnimaOrder(
  home: string,
  event: GuildEvent,
  roleName: string,
  noticeType: 'summon' | 'brief',
): Promise<DispatchSummary> {
  const startedAt = new Date().toISOString();

  if (!_summonHandler) {
    // No handler registered — record intent but skip execution.
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
      error: 'No summon handler registered — anima session not launched.',
    };
  }

  try {
    const result = await _summonHandler(home, event, roleName, noticeType);
    const endedAt = new Date().toISOString();

    recordDispatch(home, {
      eventId: event.id,
      handlerType: 'anima',
      handlerName: result.animaName,
      targetRole: roleName,
      noticeType,
      startedAt,
      endedAt,
      status: 'success',
    });

    return {
      handlerType: 'anima',
      handlerName: result.animaName,
      status: 'success',
    };
  } catch (err) {
    const endedAt = new Date().toISOString();
    const errorMsg = err instanceof Error ? err.message : String(err);

    recordDispatch(home, {
      eventId: event.id,
      handlerType: 'anima',
      handlerName: `(role: ${roleName})`,
      targetRole: roleName,
      noticeType,
      startedAt,
      endedAt,
      status: 'error',
      error: errorMsg,
    });

    return {
      handlerType: 'anima',
      handlerName: `(role: ${roleName})`,
      status: 'error',
      error: errorMsg,
    };
  }
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
