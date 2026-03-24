import Database from 'better-sqlite3';

/** SQL for the initial Ledger schema (001). Creates all base tables with WAL mode and foreign keys. */
export const INITIAL_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE animas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    status      TEXT    NOT NULL CHECK(status IN ('aspirant', 'active', 'retired')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE anima_compositions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    anima_id              INTEGER NOT NULL UNIQUE REFERENCES animas(id),
    curriculum_name       TEXT    NOT NULL,
    curriculum_version    TEXT    NOT NULL,
    temperament_name      TEXT    NOT NULL,
    temperament_version   TEXT    NOT NULL,
    curriculum_snapshot   TEXT    NOT NULL,
    temperament_snapshot  TEXT    NOT NULL,
    composed_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roster (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    anima_id    INTEGER NOT NULL REFERENCES animas(id),
    role        TEXT    NOT NULL,
    standing    INTEGER NOT NULL DEFAULT 0,
    assigned_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE commissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK(status IN ('posted', 'assigned', 'in_progress', 'completed', 'failed')),
    workshop    TEXT    NOT NULL,
    priority    TEXT    NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'urgent')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE commission_assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    commission_id   INTEGER NOT NULL REFERENCES commissions(id),
    anima_id        INTEGER NOT NULL REFERENCES animas(id),
    assigned_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(commission_id, anima_id)
);

CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor       TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    target_type TEXT,
    target_id   INTEGER,
    detail      TEXT,
    timestamp   TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Create a new Ledger database at the given path and apply the initial schema.
 * @param dbPath - Absolute path where the SQLite file will be created.
 */
export function createLedger(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(INITIAL_SCHEMA);
  } finally {
    db.close();
  }
}
