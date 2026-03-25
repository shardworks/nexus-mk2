/**
 * Piece — a subdivision of work, grouping related jobs.
 *
 * Pieces are historical records — no delete, only status transitions.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { generateId } from './id.ts';

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

    return db.prepare(
      `SELECT id, work_id, title, description, status, created_at, updated_at FROM pieces WHERE id = ?`,
    ).get(id) as PieceRecord;
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

    const result = showPiece(home, pieceId);
    if (!result) throw new Error(`Piece "${pieceId}" not found.`);
    return result;
  } finally {
    db.close();
  }
}
