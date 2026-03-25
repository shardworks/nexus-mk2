/**
 * Database migration — applies pending SQL migrations to the guild's Books.
 *
 * Runs at guild bootstrap, before dispatch, and on demand after framework
 * upgrades. Absorbed from the former `engine-ledger-migrate` package.
 *
 * Migrations are numbered sequentially (001-initial-schema.sql, etc.) and
 * applied in order. The module tracks which migrations have been applied in
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
import { ledgerPath } from './nexus-home.ts';

/** A migration file discovered on disk. */
export interface MigrationFile {
  /** Sequence number (e.g. 1, 2, 3). */
  sequence: number;
  /** Full filename (e.g. '001-initial-schema.sql'). */
  filename: string;
  /** Absolute path to the file. */
  path: string;
}

/** Provenance metadata for migrations installed via bundles. */
export interface MigrationProvenance {
  /** Bundle that delivered this migration (e.g. "@shardworks/guild-starter-kit@0.1.5"). */
  bundle: string;
  /** Original filename in the bundle before renumbering (e.g. "001-initial-schema.sql"). */
  originalName: string;
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
 * module's own bookkeeping, created on first use.
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      sequence        INTEGER PRIMARY KEY,
      filename        TEXT    NOT NULL,
      applied_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      bundle          TEXT,
      original_name   TEXT
    );
  `);

  // Add provenance columns if upgrading from an older schema.
  // SQLite errors on duplicate ADD COLUMN, so check first.
  const cols = db.pragma('table_info(_migrations)') as { name: string }[];
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('bundle')) {
    db.exec(`ALTER TABLE _migrations ADD COLUMN bundle TEXT;`);
  }
  if (!colNames.has('original_name')) {
    db.exec(`ALTER TABLE _migrations ADD COLUMN original_name TEXT;`);
  }
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
 * Apply pending migrations to the guild's Books database.
 *
 * Reads migration files from the guild's nexus/migrations/ directory, compares
 * against the _migrations tracking table, and applies any that haven't been
 * run yet. Each migration runs in its own transaction.
 *
 * @param home - Absolute path to the guild root.
 * @param provenance - Optional map of guild filename → bundle provenance,
 *   supplied by the bundle installer for migrations it copied into the guild.
 * @returns Summary of what was applied and skipped.
 */
export function applyMigrations(
  home: string,
  provenance?: Record<string, MigrationProvenance>,
): MigrateResult {
  const migrationsDir = path.join(home, 'nexus', 'migrations');
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

      const prov = provenance?.[migration.filename];

      db.transaction(() => {
        if (body) db.exec(body);
        db.prepare(
          `INSERT INTO _migrations (sequence, filename, bundle, original_name) VALUES (?, ?, ?, ?)`,
        ).run(
          migration.sequence,
          migration.filename,
          prov?.bundle ?? null,
          prov?.originalName ?? null,
        );
      })();

      result.applied.push(migration.filename);
    }

    return result;
  } finally {
    db.close();
  }
}
