/**
 * Job — an assignable unit of work, belonging to a piece.
 *
 * Jobs are historical records — no delete, only status transitions.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { generateId } from './id.ts';

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

    return db.prepare(
      `SELECT id, piece_id, title, description, status, assignee, created_at, updated_at FROM jobs WHERE id = ?`,
    ).get(id) as JobRecord;
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

    const result = showJob(home, jobId);
    if (!result) throw new Error(`Job "${jobId}" not found.`);
    return result;
  } finally {
    db.close();
  }
}
