/**
 * Piece — a subdivision of work, grouping related jobs.
 *
 * Pieces are historical records — no delete, only status transitions.
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

export interface PieceRecord {
  id: string;
  workId: string | null;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePieceOptions {
  title: string;
  description?: string;
  workId?: string;
}

export interface ListPiecesOptions {
  status?: string;
  workId?: string;
}

export interface UpdatePieceOptions {
  title?: string;
  description?: string;
  status?: string;
}

export function createPiece(home: string, opts: CreatePieceOptions): PieceRecord {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const id = generateId('p');
    db.prepare(
      `INSERT INTO pieces (id, work_id, title, description) VALUES (?, ?, ?, ?)`,
    ).run(id, opts.workId ?? null, opts.title, opts.description ?? null);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'operator', 'piece_created', 'piece', id, JSON.stringify(opts));

    const row = db.prepare(
      `SELECT id, work_id, title, description, status, created_at, updated_at FROM pieces WHERE id = ?`,
    ).get(id) as { id: string; work_id: string | null; title: string; description: string | null; status: string; created_at: string; updated_at: string };
    const record = {
      id: row.id, workId: row.work_id, title: row.title, description: row.description,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    };

    signalEvent(home, 'piece.created', { pieceId: id, workId: opts.workId ?? null }, 'framework');

    return record;
  } finally {
    db.close();
  }
}

export function listPieces(home: string, opts: ListPiecesOptions = {}): PieceRecord[] {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    let query = `SELECT id, work_id, title, description, status, created_at, updated_at FROM pieces`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.status) { conditions.push(`status = ?`); params.push(opts.status); }
    if (opts.workId) { conditions.push(`work_id = ?`); params.push(opts.workId); }

    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ` ORDER BY created_at DESC`;

    return (db.prepare(query).all(...params) as Array<{
      id: string; work_id: string | null; title: string; description: string | null;
      status: string; created_at: string; updated_at: string;
    }>).map(r => ({
      id: r.id, workId: r.work_id, title: r.title, description: r.description,
      status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  } finally {
    db.close();
  }
}

export function showPiece(home: string, pieceId: string): PieceRecord | null {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const row = db.prepare(
      `SELECT id, work_id, title, description, status, created_at, updated_at FROM pieces WHERE id = ?`,
    ).get(pieceId) as {
      id: string; work_id: string | null; title: string; description: string | null;
      status: string; created_at: string; updated_at: string;
    } | undefined;

    if (!row) return null;
    return {
      id: row.id, workId: row.work_id, title: row.title, description: row.description,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  } finally {
    db.close();
  }
}

export function updatePiece(home: string, pieceId: string, opts: UpdatePieceOptions): PieceRecord {
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
    params.push(pieceId);

    db.prepare(`UPDATE pieces SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'operator', 'piece_updated', 'piece', pieceId, JSON.stringify(opts));

    const result = showPiece(home, pieceId);
    if (!result) throw new Error(`Piece "${pieceId}" not found.`);

    if (opts.status === 'active') {
      signalEvent(home, 'piece.ready', { pieceId }, 'framework');
    } else if (opts.status === 'completed') {
      signalEvent(home, 'piece.completed', { pieceId }, 'framework');
    }

    return result;
  } finally {
    db.close();
  }
}

/**
 * Check piece completion — counts child jobs.
 * Per policy: a piece with failed jobs stays active (manual resolution needed).
 */
export function checkPieceCompletion(home: string, pieceId: string): CompletionCheck {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const rows = db.prepare(
      `SELECT status, COUNT(*) as cnt FROM jobs WHERE piece_id = ? GROUP BY status`,
    ).all(pieceId) as Array<{ status: string; cnt: number }>;

    let total = 0, done = 0, pending = 0, failed = 0;
    for (const r of rows) {
      total += r.cnt;
      if (r.status === 'completed' || r.status === 'cancelled') done += r.cnt;
      else if (r.status === 'open' || r.status === 'active') pending += r.cnt;
      else if (r.status === 'failed') failed += r.cnt;
    }

    // A piece is only auto-completable when all jobs are completed/cancelled and none failed.
    // If any job failed, the piece stays active until manual resolution.
    return { complete: total > 0 && pending === 0 && failed === 0, total, done, pending, failed };
  } finally {
    db.close();
  }
}

/**
 * Complete a piece if all jobs are completed/cancelled (none failed, none pending).
 * Signals piece.completed on transition.
 */
export function completePieceIfReady(home: string, pieceId: string): CompletionResult {
  const check = checkPieceCompletion(home, pieceId);
  if (!check.complete || check.total === 0) {
    const current = showPiece(home, pieceId);
    return { changed: false, newStatus: current?.status ?? 'unknown' };
  }

  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const current = db.prepare(`SELECT status FROM pieces WHERE id = ?`).get(pieceId) as { status: string } | undefined;
    if (!current || current.status === 'completed') {
      return { changed: false, newStatus: current?.status ?? 'unknown' };
    }

    db.prepare(
      `UPDATE pieces SET status = 'completed', updated_at = datetime('now') WHERE id = ?`,
    ).run(pieceId);

    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(generateId('aud'), 'framework', 'piece_completed', 'piece', pieceId, JSON.stringify(check));

    signalEvent(home, 'piece.completed', { pieceId }, 'framework');

    return { changed: true, newStatus: 'completed' };
  } finally {
    db.close();
  }
}
