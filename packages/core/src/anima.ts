/**
 * Anima CRUD — list, show, update, and remove operations for guild animas.
 *
 * Create is handled by instantiate.ts (complex composition logic).
 * Read-by-name is handled by manifest.ts's readAnima() (used at manifest time).
 * This module provides the remaining CRUD surface.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { generateId } from './id.ts';

// ── Types ──────────────────────────────────────────────────────────────

export interface AnimaSummary {
  id: string;
  name: string;
  status: string;
  roles: string[];
  createdAt: string;
}

export interface AnimaDetail {
  id: string;
  name: string;
  status: string;
  roles: string[];
  curriculumName: string;
  curriculumVersion: string;
  temperamentName: string;
  temperamentVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListAnimasOptions {
  status?: string;
  role?: string;
}

export interface UpdateAnimaOptions {
  status?: string;
  roles?: string[];
}

// ── Functions ──────────────────────────────────────────────────────────

/**
 * List animas with optional filters.
 */
export function listAnimas(home: string, opts: ListAnimasOptions = {}): AnimaSummary[] {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    let query = `SELECT a.id, a.name, a.status, a.created_at FROM animas a`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.role) {
      query += ` JOIN roster r ON r.anima_id = a.id`;
      conditions.push(`r.role = ?`);
      params.push(opts.role);
    }

    if (opts.status) {
      conditions.push(`a.status = ?`);
      params.push(opts.status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY a.id ORDER BY a.created_at`;

    const rows = db.prepare(query).all(...params) as {
      id: string; name: string; status: string; created_at: string;
    }[];

    // Fetch roles for each anima
    const getRoles = db.prepare(`SELECT role FROM roster WHERE anima_id = ? ORDER BY role`);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      roles: (getRoles.all(row.id) as { role: string }[]).map(r => r.role),
      createdAt: row.created_at,
    }));
  } finally {
    db.close();
  }
}

/**
 * Show detailed information about a single anima by ID.
 */
export function showAnima(home: string, animaId: string): AnimaDetail | null {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const row = db.prepare(
      `SELECT a.id, a.name, a.status, a.created_at, a.updated_at,
              c.curriculum_name, c.curriculum_version,
              c.temperament_name, c.temperament_version
       FROM animas a
       LEFT JOIN anima_compositions c ON c.anima_id = a.id
       WHERE a.id = ? OR a.name = ?`,
    ).get(animaId, animaId) as {
      id: string; name: string; status: string; created_at: string; updated_at: string;
      curriculum_name: string | null; curriculum_version: string | null;
      temperament_name: string | null; temperament_version: string | null;
    } | undefined;

    if (!row) return null;

    const roles = (db.prepare(
      `SELECT role FROM roster WHERE anima_id = ? ORDER BY role`,
    ).all(row.id) as { role: string }[]).map(r => r.role);

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      roles,
      curriculumName: row.curriculum_name ?? '',
      curriculumVersion: row.curriculum_version ?? '',
      temperamentName: row.temperament_name ?? '',
      temperamentVersion: row.temperament_version ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    db.close();
  }
}

/**
 * Update an anima's status and/or roles.
 */
export function updateAnima(
  home: string,
  animaId: string,
  opts: UpdateAnimaOptions,
): AnimaDetail {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    return db.transaction(() => {
      // Resolve by id or name
      const existing = db.prepare(
        `SELECT id, name FROM animas WHERE id = ? OR name = ?`,
      ).get(animaId, animaId) as { id: string; name: string } | undefined;

      if (!existing) {
        throw new Error(`Anima "${animaId}" not found.`);
      }

      if (opts.status) {
        db.prepare(
          `UPDATE animas SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(opts.status, existing.id);
      }

      if (opts.roles) {
        // Replace all roles
        db.prepare(`DELETE FROM roster WHERE anima_id = ?`).run(existing.id);
        const insertRole = db.prepare(
          `INSERT INTO roster (id, anima_id, role) VALUES (?, ?, ?)`,
        );
        for (const role of opts.roles) {
          insertRole.run(generateId('r'), existing.id, role);
        }
      }

      // Audit
      db.prepare(
        `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('aud'), 'operator', 'anima_updated', 'anima', existing.id,
        JSON.stringify(opts),
      );

      // Return updated record
      return showAnima(home, existing.id)!;
    })();
  } finally {
    db.close();
  }
}

/**
 * Remove (retire) an anima. Sets status to 'retired' and removes roster entries.
 */
export function removeAnima(home: string, animaId: string): void {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    db.transaction(() => {
      const existing = db.prepare(
        `SELECT id, name FROM animas WHERE id = ? OR name = ?`,
      ).get(animaId, animaId) as { id: string; name: string } | undefined;

      if (!existing) {
        throw new Error(`Anima "${animaId}" not found.`);
      }

      db.prepare(
        `UPDATE animas SET status = 'retired', updated_at = datetime('now') WHERE id = ?`,
      ).run(existing.id);

      db.prepare(`DELETE FROM roster WHERE anima_id = ?`).run(existing.id);

      db.prepare(
        `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        generateId('aud'), 'operator', 'anima_removed', 'anima', existing.id,
        JSON.stringify({ name: existing.name }),
      );
    })();
  } finally {
    db.close();
  }
}
