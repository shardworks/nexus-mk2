/**
 * Event signalling — persists events to the Clockworks event queue.
 *
 * signalEvent() is the write path. It records an immutable fact in the events
 * table. It does NOT process the event — the Clockworks runner handles that
 * separately via `nsg clock`.
 */
import Database from 'better-sqlite3';
import { ledgerPath } from './nexus-home.ts';
import { readGuildConfig } from './guild-config.ts';
import type { GuildEvent } from './engine.ts';

/** Reserved framework event namespaces. Animas cannot signal these. */
const FRAMEWORK_NAMESPACES = [
  'anima.',
  'commission.',
  'tool.',
  'migration.',
  'guild.',
  'standing-order.',
  'session.',
];

/**
 * Check if an event name is in a reserved framework namespace.
 */
export function isFrameworkEvent(name: string): boolean {
  return FRAMEWORK_NAMESPACES.some(ns => name.startsWith(ns));
}

/**
 * Validate that a custom event name is declared in guild.json clockworks.events.
 * Throws if the name is in a reserved namespace or not declared.
 */
export function validateCustomEvent(home: string, name: string): void {
  if (isFrameworkEvent(name)) {
    throw new Error(
      `Event "${name}" is in a reserved framework namespace. ` +
      `Animas and operators can only signal custom events declared in guild.json.`,
    );
  }

  const config = readGuildConfig(home);
  const declaredEvents = config.clockworks?.events ?? {};
  if (!Object.hasOwn(declaredEvents, name)) {
    const available = Object.keys(declaredEvents);
    throw new Error(
      `Event "${name}" is not declared in guild.json clockworks.events. ` +
      `Declared events: ${available.length > 0 ? available.join(', ') : '(none)'}`,
    );
  }
}

/**
 * Signal an event — persist it to the Clockworks events table.
 *
 * Does not process the event. The Clockworks runner processes separately.
 *
 * @param home - Absolute path to the guild root.
 * @param name - Event name (e.g. "commission.sealed", "code.reviewed").
 * @param payload - Event-specific data (JSON-serializable).
 * @param emitter - Who signaled it: anima name, engine name, or "framework".
 * @returns The event id.
 */
export function signalEvent(
  home: string,
  name: string,
  payload: unknown,
  emitter: string,
): number {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const result = db.prepare(
      `INSERT INTO events (name, payload, emitter) VALUES (?, ?, ?)`,
    ).run(name, payload != null ? JSON.stringify(payload) : null, emitter);

    return Number(result.lastInsertRowid);
  } finally {
    db.close();
  }
}

/**
 * Read pending (unprocessed) events from the Clockworks event queue, ordered by fired_at.
 */
export function readPendingEvents(home: string): GuildEvent[] {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const rows = db.prepare(
      `SELECT id, name, payload, emitter, fired_at FROM events WHERE processed = 0 ORDER BY fired_at, id`,
    ).all() as { id: number; name: string; payload: string | null; emitter: string; fired_at: string }[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      payload: row.payload ? JSON.parse(row.payload) : null,
      emitter: row.emitter,
      firedAt: row.fired_at,
    }));
  } finally {
    db.close();
  }
}

/**
 * Read a single event by id.
 */
export function readEvent(home: string, id: number): GuildEvent | null {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const row = db.prepare(
      `SELECT id, name, payload, emitter, fired_at FROM events WHERE id = ?`,
    ).get(id) as { id: number; name: string; payload: string | null; emitter: string; fired_at: string } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      payload: row.payload ? JSON.parse(row.payload) : null,
      emitter: row.emitter,
      firedAt: row.fired_at,
    };
  } finally {
    db.close();
  }
}

/**
 * Mark an event as processed.
 */
export function markEventProcessed(home: string, eventId: number): void {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    db.prepare(`UPDATE events SET processed = 1 WHERE id = ?`).run(eventId);
  } finally {
    db.close();
  }
}

/**
 * Record an event dispatch in the event_dispatches table.
 */
export function recordDispatch(
  home: string,
  opts: {
    eventId: number;
    handlerType: 'engine' | 'anima';
    handlerName: string;
    targetRole?: string;
    noticeType?: 'summon' | 'brief';
    startedAt: string;
    endedAt: string;
    status: 'success' | 'error';
    error?: string;
  },
): void {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    db.prepare(
      `INSERT INTO event_dispatches (event_id, handler_type, handler_name, target_role, notice_type, started_at, ended_at, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      opts.eventId,
      opts.handlerType,
      opts.handlerName,
      opts.targetRole ?? null,
      opts.noticeType ?? null,
      opts.startedAt,
      opts.endedAt,
      opts.status,
      opts.error ?? null,
    );
  } finally {
    db.close();
  }
}
