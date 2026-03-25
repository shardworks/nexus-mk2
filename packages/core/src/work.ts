/**
 * Work — top-level unit of the work decomposition hierarchy.
 *
 * A work groups pieces that collectively fulfill a commission or standalone goal.
 * Work items are historical records — no delete, only status transitions.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { generateId } from './id.ts';

export interface WorkRecord {
  id: string;
  commissionId: string | null;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkOptions {
  title: string;
  description?: string;
  commissionId?: string;
}

export interface ListWorksOptions {
  status?: string;
  commissionId?: string;
}

export interface UpdateWorkOptions {
  title?: string;
  description?: string;
  status?: string;
}

export function createWork(home: string, opts: CreateWorkOptions): WorkRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const id = generateId('w');
    db.prepare(
      `INSERT INTO works (id, commission_id, title, description) VALUES (?, ?, ?, ?)`,
    ).run(id, opts.commissionId ?? null, opts.title, opts.description ?? null);

    return db.prepare(`SELECT * FROM works WHERE id = ?`).get(id) as WorkRecord;
  } finally {
    db.close();
  }
}

export function listWorks(home: string, opts: ListWorksOptions = {}): WorkRecord[] {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    let query = `SELECT id, commission_id, title, description, status, created_at, updated_at FROM works`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.status) { conditions.push(`status = ?`); params.push(opts.status); }
    if (opts.commissionId) { conditions.push(`commission_id = ?`); params.push(opts.commissionId); }

    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY created_at DESC`;

    return (db.prepare(query).all(...params) as Array<{
      id: string; commission_id: string | null; title: string; description: string | null;
      status: string; created_at: string; updated_at: string;
    }>).map(r => ({
      id: r.id, commissionId: r.commission_id, title: r.title, description: r.description,
      status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  } finally {
    db.close();
  }
}

export function showWork(home: string, workId: string): WorkRecord | null {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const row = db.prepare(
      `SELECT id, commission_id, title, description, status, created_at, updated_at FROM works WHERE id = ?`,
    ).get(workId) as {
      id: string; commission_id: string | null; title: string; description: string | null;
      status: string; created_at: string; updated_at: string;
    } | undefined;

    if (!row) return null;
    return {
      id: row.id, commissionId: row.commission_id, title: row.title, description: row.description,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  } finally {
    db.close();
  }
}

export function updateWork(home: string, workId: string, opts: UpdateWorkOptions): WorkRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (opts.title !== undefined) { sets.push(`title = ?`); params.push(opts.title); }
    if (opts.description !== undefined) { sets.push(`description = ?`); params.push(opts.description); }
    if (opts.status !== undefined) { sets.push(`status = ?`); params.push(opts.status); }

    if (sets.length === 0) throw new Error('No fields to update.');

    sets.push(`updated_at = datetime('now')`);
    params.push(workId);

    db.prepare(`UPDATE works SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    const result = showWork(home, workId);
    if (!result) throw new Error(`Work "${workId}" not found.`);
    return result;
  } finally {
    db.close();
  }
}
