/**
 * Ledger Migration Engine
 *
 * Applies pending SQL migrations from the guildhall's nexus/migrations/
 * directory to the Ledger database. Runs at guild bootstrap, before dispatch,
 * and on demand after framework upgrades.
 *
 * Migrations are numbered sequentially (001-initial-schema.sql, etc.) and
 * applied in order. The engine tracks which migrations have been applied in
 * a `_migrations` table and only runs new ones.
 *
 * ## Migration file naming
 *
 * Files must match the pattern: NNN-description.sql
 * where NNN is a zero-padded sequence number.
 *
 * Examples:
 *   001-initial-schema.sql
 *   002-add-priority-to-commissions.sql
 *   003-add-sessions-table.sql
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ledgerPath, guildhallWorktreePath } from '@shardworks/nexus-core';

/** A migration file discovered on disk. */
export interface MigrationFile {
  /** Sequence number (e.g. 1, 2, 3). */
  sequence: number;
  /** Full filename (e.g. '001-initial-schema.sql'). */
  filename: string;
  /** Absolute path to the file. */
  path: string;
}

/** Result of applying migrations. */
export interface MigrateResult {
  /** Migrations that were applied in this run. */
  applied: string[];
  /** Migrations that were already applied (skipped). */
  skipped: string[];
  /** Total number of migrations on disk. */
  total: number;
}

/** Pattern for migration filenames: NNN-description.sql */
const MIGRATION_PATTERN = /^(\d{3})-(.+)\.sql$/;

/**
 * Ensure the _migrations tracking table exists.
 *
 * This table is NOT part of the regular schema migrations — it's the
 * engine's own bookkeeping, created on first use.
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      sequence    INTEGER PRIMARY KEY,
      filename    TEXT    NOT NULL,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Discover migration files in the migrations directory, sorted by sequence.
 */
export function discoverMigrations(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) return [];

  const files = fs.readdirSync(migrationsDir);
  const migrations: MigrationFile[] = [];

  for (const file of files) {
    const match = file.match(MIGRATION_PATTERN);
    if (!match) continue;

    migrations.push({
      sequence: parseInt(match[1]!, 10),
      filename: file,
      path: path.join(migrationsDir, file),
    });
  }

  // Sort by sequence number
  migrations.sort((a, b) => a.sequence - b.sequence);
  return migrations;
}

/**
 * Get the set of already-applied migration sequence numbers.
 */
function getAppliedSequences(db: Database.Database): Set<number> {
  const rows = db.prepare(
    `SELECT sequence FROM _migrations ORDER BY sequence`,
  ).all() as { sequence: number }[];
  return new Set(rows.map(r => r.sequence));
}

/**
 * Apply pending migrations to the Ledger.
 *
 * Reads migration files from nexus/migrations/ in the guildhall worktree,
 * compares against the _migrations tracking table, and applies any that
 * haven't been run yet. Each migration runs in its own transaction.
 *
 * @param home - Absolute path to NEXUS_HOME.
 * @returns Summary of what was applied and skipped.
 */
export function applyMigrations(home: string): MigrateResult {
  const worktree = guildhallWorktreePath(home);
  const migrationsDir = path.join(worktree, 'nexus', 'migrations');
  const dbPath = ledgerPath(home);

  // Discover available migrations
  const migrations = discoverMigrations(migrationsDir);

  if (migrations.length === 0) {
    return { applied: [], skipped: [], total: 0 };
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    ensureMigrationsTable(db);
    const applied = getAppliedSequences(db);

    const result: MigrateResult = {
      applied: [],
      skipped: [],
      total: migrations.length,
    };

    for (const migration of migrations) {
      if (applied.has(migration.sequence)) {
        result.skipped.push(migration.filename);
        continue;
      }

      // Read and apply the migration.
      // PRAGMAs can't run inside transactions, so extract them and run separately.
      const sql = fs.readFileSync(migration.path, 'utf-8');
      const pragmaPattern = /^\s*PRAGMA\s+[^;]+;\s*$/gmi;
      const pragmas = sql.match(pragmaPattern) || [];
      const body = sql.replace(pragmaPattern, '').trim();

      for (const pragma of pragmas) {
        db.exec(pragma);
      }

      db.transaction(() => {
        if (body) db.exec(body);
        db.prepare(
          `INSERT INTO _migrations (sequence, filename) VALUES (?, ?)`,
        ).run(migration.sequence, migration.filename);
      })();

      result.applied.push(migration.filename);
    }

    return result;
  } finally {
    db.close();
  }
}
