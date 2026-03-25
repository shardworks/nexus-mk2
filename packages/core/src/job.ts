/**
 * Job — an assignable unit of work, belonging to a piece.
 *
 * Jobs are historical records — no delete, only status transitions.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { generateId } from './id.ts';
import { signalEvent } from './events.ts';

export interface CompletionCheck {
  complete: boolean;
  total: number;
  done: number;
  pending: number;
  failed: number;
}

export interface CompletionResult {
  changed: boolean;
  newStatus: string;
}

export interface JobRecord {
  id: string;
  pieceId: string | null;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobOptions {
  title: string;
  description?: string;
  pieceId?: string;
  assignee?: string;
}

export interface ListJobsOptions {
  status?: string;
  pieceId?: string;
  assignee?: string;
}

export interface UpdateJobOptions {
  title?: string;
  description?: string;
  status?: string;
  assignee?: string;
}

export function createJob(home: string, opts: CreateJobOptions): JobRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const id = generateId('j');
    db.prepare(
      `INSERT INTO jobs (id, piece_id, title, description, assignee) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, opts.pieceId ?? null, opts.title, opts.description ?? null, opts.assignee ?? null);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'operator', 'job_created', 'job', id, JSON.stringify(opts));

    const row = db.prepare(
      `SELECT id, piece_id, title, description, status, assignee, created_at, updated_at FROM jobs WHERE id = ?`,
    ).get(id) as { id: string; piece_id: string | null; title: string; description: string | null; status: string; assignee: string | null; created_at: string; updated_at: string };
    const record = {
      id: row.id, pieceId: row.piece_id, title: row.title, description: row.description,
      status: row.status, assignee: row.assignee, createdAt: row.created_at, updatedAt: row.updated_at,
    };

    signalEvent(home, 'job.created', { jobId: id, pieceId: opts.pieceId ?? null }, 'framework');

    return record;
  } finally {
    db.close();
  }
}

export function listJobs(home: string, opts: ListJobsOptions = {}): JobRecord[] {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    let query = `SELECT id, piece_id, title, description, status, assignee, created_at, updated_at FROM jobs`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.status) { conditions.push(`status = ?`); params.push(opts.status); }
    if (opts.pieceId) { conditions.push(`piece_id = ?`); params.push(opts.pieceId); }
    if (opts.assignee) { conditions.push(`assignee = ?`); params.push(opts.assignee); }

    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY created_at DESC`;

    return (db.prepare(query).all(...params) as Array<{
      id: string; piece_id: string | null; title: string; description: string | null;
      status: string; assignee: string | null; created_at: string; updated_at: string;
    }>).map(r => ({
      id: r.id, pieceId: r.piece_id, title: r.title, description: r.description,
      status: r.status, assignee: r.assignee, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  } finally {
    db.close();
  }
}

export function showJob(home: string, jobId: string): JobRecord | null {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const row = db.prepare(
      `SELECT id, piece_id, title, description, status, assignee, created_at, updated_at FROM jobs WHERE id = ?`,
    ).get(jobId) as {
      id: string; piece_id: string | null; title: string; description: string | null;
      status: string; assignee: string | null; created_at: string; updated_at: string;
    } | undefined;

    if (!row) return null;
    return {
      id: row.id, pieceId: row.piece_id, title: row.title, description: row.description,
      status: row.status, assignee: row.assignee, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  } finally {
    db.close();
  }
}

export function updateJob(home: string, jobId: string, opts: UpdateJobOptions): JobRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (opts.title !== undefined) { sets.push(`title = ?`); params.push(opts.title); }
    if (opts.description !== undefined) { sets.push(`description = ?`); params.push(opts.description); }
    if (opts.status !== undefined) { sets.push(`status = ?`); params.push(opts.status); }
    if (opts.assignee !== undefined) { sets.push(`assignee = ?`); params.push(opts.assignee); }

    if (sets.length === 0) throw new Error('No fields to update.');

    sets.push(`updated_at = datetime('now')`);
    params.push(jobId);

    db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'operator', 'job_updated', 'job', jobId, JSON.stringify(opts));

    const result = showJob(home, jobId);
    if (!result) throw new Error(`Job "${jobId}" not found.`);

    if (opts.status === 'active') {
      signalEvent(home, 'job.ready', { jobId }, 'framework');
    } else if (opts.status === 'completed') {
      signalEvent(home, 'job.completed', { jobId }, 'framework');
    } else if (opts.status === 'failed') {
      signalEvent(home, 'job.failed', { jobId }, 'framework');
    }

    return result;
  } finally {
    db.close();
  }
}

/**
 * Check job completion — counts child strokes.
 */
export function checkJobCompletion(home: string, jobId: string): CompletionCheck {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const rows = db.prepare(
      `SELECT status, COUNT(*) as cnt FROM strokes WHERE job_id = ? GROUP BY status`,
    ).all(jobId) as Array<{ status: string; cnt: number }>;

    let total = 0, done = 0, pending = 0, failed = 0;
    for (const r of rows) {
      total += r.cnt;
      if (r.status === 'complete') done += r.cnt;
      else if (r.status === 'pending') pending += r.cnt;
      else if (r.status === 'failed') failed += r.cnt;
    }

    return { complete: total > 0 && pending === 0, total, done, pending, failed };
  } finally {
    db.close();
  }
}

/**
 * Complete a job if all strokes are done (complete or failed, none pending).
 * Sets job to 'completed' if no strokes failed, 'failed' if any failed.
 * Signals job.completed or job.failed on transition.
 */
export function completeJobIfReady(home: string, jobId: string): CompletionResult {
  const check = checkJobCompletion(home, jobId);
  if (!check.complete || check.total === 0) {
    const current = showJob(home, jobId);
    return { changed: false, newStatus: current?.status ?? 'unknown' };
  }

  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const current = db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(jobId) as { status: string } | undefined;
    if (!current || current.status === 'completed' || current.status === 'failed') {
      return { changed: false, newStatus: current?.status ?? 'unknown' };
    }

    const newStatus = check.failed > 0 ? 'failed' : 'completed';

    db.prepare(
      `UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(newStatus, jobId);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'framework', `job_${newStatus}`, 'job', jobId, JSON.stringify(check));

    const eventName = newStatus === 'completed' ? 'job.completed' : 'job.failed';
    signalEvent(home, eventName, { jobId }, 'framework');

    return { changed: true, newStatus };
  } finally {
    db.close();
  }
}
