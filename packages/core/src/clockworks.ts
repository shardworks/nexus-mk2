/**
 * Clockworks runner — processes the event queue by matching pending events
 * to standing orders in guild.json and executing them.
 *
 * This is the core of Pillar 5. It reads unprocessed events from the
 * Clockworks event queue, finds matching standing orders, and dispatches
 * them (run engines, or summon/brief animas). Each event is marked as
 * processed after all its standing orders have been dispatched.
 *
 * Anima orders (summon/brief) are handled directly via the session funnel —
 * no callback hack needed. The clockworks resolves roles to animas,
 * manifests them, and calls launchSession().
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
import { booksPath, clockPidPath, clockLogPath } from './nexus-home.ts';
import { generateId } from './id.ts';
import { manifest } from './manifest.ts';
import { launchSession, resolveWorkspace, getSessionProvider } from './session.ts';
import {
  createWrit,
  readWrit,
  activateWrit,
  interruptWrit,
  hydratePromptTemplate,
  buildProgressAppendix,
} from './writ.ts';

/** Result of processing a single event. */
export interface TickResult {
  eventId: string;
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
      const promptTpl = 'prompt' in order ? (order as { prompt?: string }).prompt : undefined;
      const summary = await executeAnimaOrder(home, event, order.summon, 'summon', promptTpl);
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
 * Resolve the name of the first active anima holding a given role.
 *
 * If multiple animas share the role, one is selected arbitrarily (lowest id).
 * Throws if no active anima holds the role.
 */
function resolveAnimaByRole(home: string, role: string): string {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const row = db.prepare(`
      SELECT a.name FROM animas a
      JOIN roster r ON r.anima_id = a.id
      WHERE r.role = ? AND a.status = 'active'
      ORDER BY a.id ASC
      LIMIT 1
    `).get(role) as { name: string } | undefined;

    if (!row) {
      throw new Error(`No active anima found for role "${role}".`);
    }
    return row.name;
  } finally {
    db.close();
  }
}

/**
 * Execute a `summon:` standing order.
 *
 * Resolves the role to an anima, binds or synthesizes a writ, hydrates
 * the prompt template, manifests the anima, and launches a session.
 * On session end, handles writ lifecycle (completion, pending, interruption).
 *
 * If no session provider is registered, records the dispatch as skipped.
 */
async function executeAnimaOrder(
  home: string,
  event: GuildEvent,
  roleName: string,
  noticeType: 'summon' | 'brief',
  promptTemplate?: string,
): Promise<DispatchSummary> {
  const startedAt = new Date().toISOString();

  if (!getSessionProvider()) {
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
      error: 'No session provider registered — anima session not launched.',
    };
  }

  try {
    const payload = (event.payload as Record<string, unknown>) ?? {};

    // Resolve role to a specific anima
    const animaName = resolveAnimaByRole(home, roleName);

    // Step 1: Bind or synthesize writ
    const existingWritId = payload.writId as string | undefined;
    let writId: string;

    if (existingWritId) {
      writId = existingWritId;
    } else {
      // Synthesize a summon writ for non-writ events
      const writ = createWrit(home, {
        type: 'summon',
        title: `Summon ${roleName}: ${event.name}`,
        description: JSON.stringify(event.payload),
      });
      writId = writ.id;
    }

    // Step 2: Manifest the anima
    const manifestResult = await manifest(home, animaName);

    // Step 3: Resolve workspace from event payload
    const workspace = resolveWorkspace(payload);

    // Step 4: Hydrate prompt template
    let userPrompt = hydratePromptTemplate(home, promptTemplate, payload, writId);

    // Append progress appendix for resumed sessions
    const appendix = buildProgressAppendix(home, writId);
    if (appendix && userPrompt) {
      userPrompt = `${userPrompt}\n\n---\n${appendix}`;
    } else if (appendix) {
      userPrompt = appendix;
    }

    // Step 5: Activate writ before launch
    // We don't have the session ID yet (launchSession creates it internally),
    // so we activate with a placeholder. The session row has the writ_id
    // reference for the authoritative link.
    activateWrit(home, writId, 'pending');

    // Set NEXUS_WRIT_ID for tools to read during the session
    const prevWritId = process.env.NEXUS_WRIT_ID;
    process.env.NEXUS_WRIT_ID = writId;

    let sessionResult;
    try {
      sessionResult = await launchSession({
        home,
        manifest: manifestResult,
        prompt: userPrompt,
        interactive: false,
        workspace,
        trigger: 'summon',
        writId,
      });
    } finally {
      if (prevWritId !== undefined) {
        process.env.NEXUS_WRIT_ID = prevWritId;
      } else {
        delete process.env.NEXUS_WRIT_ID;
      }
    }

    // Update writ with actual session ID (best effort)
    try {
      const db = new Database(booksPath(home));
      db.pragma('foreign_keys = ON');
      try {
        db.prepare(
          `UPDATE writs SET session_id = ? WHERE id = ? AND session_id = 'pending'`,
        ).run(sessionResult.sessionId, writId);
      } finally {
        db.close();
      }
    } catch { /* best effort */ }

    // Step 6: Handle session end — check writ status
    const finalWrit = readWrit(home, writId);
    if (finalWrit && finalWrit.status === 'active') {
      // Session ended without complete-session or fail-writ → interrupted
      interruptWrit(home, writId);
    }
    // If status is completed, pending, or failed — the tool already handled it

    const endedAt = new Date().toISOString();

    recordDispatch(home, {
      eventId: event.id,
      handlerType: 'anima',
      handlerName: animaName,
      targetRole: roleName,
      noticeType,
      startedAt,
      endedAt,
      status: 'success',
    });

    return {
      handlerType: 'anima',
      handlerName: animaName,
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
export async function clockTick(home: string, eventId?: string): Promise<TickResult | null> {
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

// ── Daemon lifecycle ──────────────────────────────────────────────────

/** Options for starting the clockworks daemon. */
export interface ClockStartOptions {
  /** Polling interval in milliseconds. Default: 2000. */
  interval?: number;
}

/** Result of starting the clockworks daemon. */
export interface ClockStartResult {
  pid: number;
  logFile: string;
}

/** Result of stopping the clockworks daemon. */
export interface ClockStopResult {
  pid: number;
  stopped: boolean;
}

/** Current status of the clockworks daemon. */
export interface ClockStatus {
  running: boolean;
  pid?: number;
  logFile?: string;
  uptime?: number;
}

/**
 * Check if a process is alive by sending signal 0.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the PID file. Returns { pid, startedAt } or null if no file.
 */
function readPidFile(home: string): { pid: number; startedAt: string } | null {
  const pidFile = clockPidPath(home);
  if (!fs.existsSync(pidFile)) return null;
  try {
    const content = fs.readFileSync(pidFile, 'utf-8').trim();
    const lines = content.split('\n');
    const pid = parseInt(lines[0]!, 10);
    const startedAt = lines[1] ?? new Date().toISOString();
    if (isNaN(pid)) return null;
    return { pid, startedAt };
  } catch {
    return null;
  }
}

/**
 * Clean up a stale PID file (process is dead).
 */
function cleanStalePid(home: string): void {
  const pidFile = clockPidPath(home);
  try { fs.unlinkSync(pidFile); } catch { /* already gone */ }
}

/**
 * Start the clockworks daemon as a detached background process.
 *
 * Spawns a child process that polls the event queue at the given interval.
 * Returns immediately after the child is spawned.
 *
 * @param home - Guild root path.
 * @param options - Daemon options (interval).
 * @returns PID and log file path.
 */
export function clockStart(home: string, options?: ClockStartOptions): ClockStartResult {
  const interval = options?.interval ?? 2000;

  // Check if daemon is already running
  const existing = readPidFile(home);
  if (existing && isProcessAlive(existing.pid)) {
    throw new Error(`Clockworks daemon is already running (PID ${existing.pid}).`);
  }

  // Clean up stale PID file if needed
  if (existing) cleanStalePid(home);

  const logFile = clockLogPath(home);

  // Open log file for append
  const logFd = fs.openSync(logFile, 'a');

  // Resolve the daemon script from this module's directory.
  // clock-daemon lives alongside clockworks in the same package.
  // When running from source it's .ts; when running from dist it's .js.
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const daemonScript = fs.existsSync(path.join(thisDir, 'clock-daemon.ts'))
    ? path.join(thisDir, 'clock-daemon.ts')
    : path.join(thisDir, 'clock-daemon.js');

  // Use --experimental-transform-types for .ts, not needed for .js
  const nodeArgs = daemonScript.endsWith('.ts')
    ? ['--disable-warning=ExperimentalWarning', '--experimental-transform-types']
    : [];

  const child = spawn(
    process.execPath,
    [
      ...nodeArgs,
      daemonScript,
      home,
      String(interval),
    ],
    {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
    },
  );

  const pid = child.pid!;

  // Write PID file: line 1 = PID, line 2 = start timestamp
  const pidFile = clockPidPath(home);
  fs.writeFileSync(pidFile, `${pid}\n${new Date().toISOString()}\n`);

  // Detach from parent
  child.unref();
  fs.closeSync(logFd);

  return { pid, logFile };
}

/**
 * Stop the running clockworks daemon.
 *
 * @param home - Guild root path.
 * @returns PID that was stopped and whether the process was still alive.
 */
export function clockStop(home: string): ClockStopResult {
  const pidInfo = readPidFile(home);
  if (!pidInfo) {
    throw new Error('Clockworks daemon is not running (no PID file).');
  }

  const alive = isProcessAlive(pidInfo.pid);
  if (alive) {
    process.kill(pidInfo.pid, 'SIGTERM');
  }

  cleanStalePid(home);

  return { pid: pidInfo.pid, stopped: alive };
}

/**
 * Get the current status of the clockworks daemon.
 *
 * @param home - Guild root path.
 * @returns Daemon status including PID, log file, and uptime if running.
 */
export function clockStatus(home: string): ClockStatus {
  const pidInfo = readPidFile(home);
  if (!pidInfo) {
    return { running: false };
  }

  const alive = isProcessAlive(pidInfo.pid);
  if (!alive) {
    cleanStalePid(home);
    return { running: false };
  }

  const logFile = clockLogPath(home);
  const uptime = Date.now() - new Date(pidInfo.startedAt).getTime();

  return {
    running: true,
    pid: pidInfo.pid,
    logFile,
    uptime,
  };
}
