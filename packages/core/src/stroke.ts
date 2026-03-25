/**
 * Stroke — an atomic record of work performed against a job.
 *
 * Strokes are historical records — no delete, only status transitions.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { generateId } from './id.ts';
import { signalEvent } from './events.ts';

export interface StrokeRecord {
  id: string;
  jobId: string;
  kind: string;
  content: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStrokeOptions {
  jobId: string;
  kind: string;
  content?: string;
}

export interface ListStrokesOptions {
  jobId?: string;
  status?: string;
}

export interface UpdateStrokeOptions {
  status?: string;
  content?: string;
}

export function createStroke(home: string, opts: CreateStrokeOptions): StrokeRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const id = generateId('s');
    db.prepare(
      `INSERT INTO strokes (id, job_id, kind, content) VALUES (?, ?, ?, ?)`,
    ).run(id, opts.jobId, opts.kind, opts.content ?? null);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'operator', 'stroke_created', 'stroke', id, JSON.stringify(opts));

    const row = db.prepare(
      `SELECT id, job_id, kind, content, status, created_at, updated_at FROM strokes WHERE id = ?`,
    ).get(id) as { id: string; job_id: string; kind: string; content: string | null; status: string; created_at: string; updated_at: string };
    const record = {
      id: row.id, jobId: row.job_id, kind: row.kind, content: row.content,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    };

    signalEvent(home, 'stroke.recorded', { strokeId: id, jobId: opts.jobId }, 'framework');

    return record;
  } finally {
    db.close();
  }
}

export function listStrokes(home: string, opts: ListStrokesOptions = {}): StrokeRecord[] {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    let query = `SELECT id, job_id, kind, content, status, created_at, updated_at FROM strokes`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.jobId) { conditions.push(`job_id = ?`); params.push(opts.jobId); }
    if (opts.status) { conditions.push(`status = ?`); params.push(opts.status); }

    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY created_at DESC`;

    return (db.prepare(query).all(...params) as Array<{
      id: string; job_id: string; kind: string; content: string | null;
      status: string; created_at: string; updated_at: string;
    }>).map(r => ({
      id: r.id, jobId: r.job_id, kind: r.kind, content: r.content,
      status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  } finally {
    db.close();
  }
}

export function showStroke(home: string, strokeId: string): StrokeRecord | null {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const row = db.prepare(
      `SELECT id, job_id, kind, content, status, created_at, updated_at FROM strokes WHERE id = ?`,
    ).get(strokeId) as {
      id: string; job_id: string; kind: string; content: string | null;
      status: string; created_at: string; updated_at: string;
    } | undefined;

    if (!row) return null;
    return {
      id: row.id, jobId: row.job_id, kind: row.kind, content: row.content,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  } finally {
    db.close();
  }
}

export function updateStroke(home: string, strokeId: string, opts: UpdateStrokeOptions): StrokeRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (opts.status !== undefined) { sets.push(`status = ?`); params.push(opts.status); }
    if (opts.content !== undefined) { sets.push(`content = ?`); params.push(opts.content); }

    if (sets.length === 0) throw new Error('No fields to update.');

    sets.push(`updated_at = datetime('now')`);
    params.push(strokeId);

    db.prepare(`UPDATE strokes SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'operator', 'stroke_updated', 'stroke', strokeId, JSON.stringify(opts));

    const result = showStroke(home, strokeId);
    if (!result) throw new Error(`Stroke "${strokeId}" not found.`);
    return result;
  } finally {
    db.close();
  }
}
