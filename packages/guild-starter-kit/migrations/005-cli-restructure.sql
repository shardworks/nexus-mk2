-- CLI restructure migration: prefixed hex IDs + work decomposition tables.
--
-- Part 1: Migrate all existing entity IDs from INTEGER AUTOINCREMENT to TEXT
-- (prefixed hex format). SQLite doesn't support ALTER COLUMN, so we use the
-- rename-recreate pattern for each table.
--
-- Part 2: Create work decomposition tables (works, pieces, jobs, strokes)
-- with TEXT IDs from the start.

-- ════════════════════════════════════════════════════════════════════════
-- Part 1: ID migration — existing tables
-- ════════════════════════════════════════════════════════════════════════

-- We need to drop foreign key constraints temporarily by recreating
-- dependent tables. Process order matters: leaf tables first, then parents.

-- ── 1a. audit_log — no foreign keys point to it ────────────────────────

ALTER TABLE audit_log RENAME TO _old_audit_log;

CREATE TABLE audit_log (
    id          TEXT PRIMARY KEY,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    detail      TEXT,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO audit_log (id, actor, action, target_type, target_id, detail, timestamp)
  SELECT 'aud-' || lower(hex(randomblob(4))), actor, action, target_type,
         CASE
           WHEN target_type = 'anima' THEN 'a-' || lower(hex(zeroblob(4 - length(hex(target_id))/2)) || hex(target_id))
           WHEN target_type = 'commission' THEN 'c-' || lower(hex(zeroblob(4 - length(hex(target_id))/2)) || hex(target_id))
           ELSE CAST(target_id AS TEXT)
         END,
         detail, timestamp
  FROM _old_audit_log;

DROP TABLE _old_audit_log;

-- ── 1b. event_dispatches — references events(id) ──────────────────────

ALTER TABLE event_dispatches RENAME TO _old_event_dispatches;

-- ── 1c. commission_sessions — references commissions(id), sessions(id) ─

ALTER TABLE commission_sessions RENAME TO _old_commission_sessions;

-- ── 1d. commission_assignments — references commissions(id), animas(id)

ALTER TABLE commission_assignments RENAME TO _old_commission_assignments;

-- ── 1e. roster — references animas(id) ─────────────────────────────────

ALTER TABLE roster RENAME TO _old_roster;

-- ── 1f. anima_compositions — references animas(id) ─────────────────────

ALTER TABLE anima_compositions RENAME TO _old_anima_compositions;

-- ── 1g. sessions — references animas(id) ───────────────────────────────

ALTER TABLE sessions RENAME TO _old_sessions;

-- ── Now recreate parent tables with TEXT ids ────────────────────────────

-- animas
ALTER TABLE animas RENAME TO _old_animas;

CREATE TABLE animas (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL CHECK(status IN ('aspirant', 'active', 'retired')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO animas (id, name, status, created_at, updated_at)
  SELECT 'a-' || lower(hex(randomblob(4))), name, status, created_at, updated_at
  FROM _old_animas;

-- commissions
ALTER TABLE commissions RENAME TO _old_commissions;

CREATE TABLE commissions (
    id            TEXT PRIMARY KEY,
    content       TEXT NOT NULL,
    status        TEXT NOT NULL CHECK(status IN ('posted', 'assigned', 'in_progress', 'completed', 'failed')),
    workshop      TEXT NOT NULL,
    status_reason TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO commissions (id, content, status, workshop, status_reason, created_at, updated_at)
  SELECT 'c-' || lower(hex(randomblob(4))), content, status, workshop, status_reason, created_at, updated_at
  FROM _old_commissions;

-- events
ALTER TABLE events RENAME TO _old_events;

CREATE TABLE events (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    payload    TEXT,
    emitter    TEXT NOT NULL,
    fired_at   TEXT NOT NULL DEFAULT (datetime('now')),
    processed  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO events (id, name, payload, emitter, fired_at, processed)
  SELECT 'evt-' || lower(hex(randomblob(4))), name, payload, emitter, fired_at, processed
  FROM _old_events;

-- sessions
CREATE TABLE sessions (
    id                  TEXT PRIMARY KEY,
    anima_id            TEXT NOT NULL REFERENCES animas(id),
    provider            TEXT NOT NULL,
    model               TEXT,
    trigger             TEXT NOT NULL,
    workshop            TEXT,
    workspace_kind      TEXT NOT NULL,
    curriculum_name     TEXT,
    curriculum_version  TEXT,
    temperament_name    TEXT,
    temperament_version TEXT,
    roles               TEXT,
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    exit_code           INTEGER,
    input_tokens        INTEGER,
    output_tokens       INTEGER,
    cache_read_tokens   INTEGER,
    cache_write_tokens  INTEGER,
    cost_usd            REAL,
    duration_ms         INTEGER,
    provider_session_id TEXT,
    record_path         TEXT
);

-- Migrate sessions with new anima IDs (join on old anima integer id → new text id)
INSERT INTO sessions (id, anima_id, provider, model, trigger, workshop, workspace_kind,
    curriculum_name, curriculum_version, temperament_name, temperament_version, roles,
    started_at, ended_at, exit_code, input_tokens, output_tokens, cache_read_tokens,
    cache_write_tokens, cost_usd, duration_ms, provider_session_id, record_path)
  SELECT 'ses-' || lower(hex(randomblob(4))), a_new.id, s.provider, s.model, s.trigger,
    s.workshop, s.workspace_kind, s.curriculum_name, s.curriculum_version,
    s.temperament_name, s.temperament_version, s.roles, s.started_at, s.ended_at,
    s.exit_code, s.input_tokens, s.output_tokens, s.cache_read_tokens,
    s.cache_write_tokens, s.cost_usd, s.duration_ms, s.provider_session_id, s.record_path
  FROM _old_sessions s
  JOIN _old_animas a_old ON a_old.id = s.anima_id
  JOIN animas a_new ON a_new.name = a_old.name;

-- ── Recreate dependent tables ──────────────────────────────────────────

-- anima_compositions
CREATE TABLE anima_compositions (
    id                    TEXT PRIMARY KEY,
    anima_id              TEXT NOT NULL UNIQUE REFERENCES animas(id),
    curriculum_name       TEXT NOT NULL,
    curriculum_version    TEXT NOT NULL,
    temperament_name      TEXT NOT NULL,
    temperament_version   TEXT NOT NULL,
    curriculum_snapshot   TEXT NOT NULL,
    temperament_snapshot  TEXT NOT NULL,
    composed_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO anima_compositions (id, anima_id, curriculum_name, curriculum_version,
    temperament_name, temperament_version, curriculum_snapshot, temperament_snapshot, composed_at)
  SELECT 'ac-' || lower(hex(randomblob(4))), a_new.id,
    c.curriculum_name, c.curriculum_version, c.temperament_name, c.temperament_version,
    c.curriculum_snapshot, c.temperament_snapshot, c.composed_at
  FROM _old_anima_compositions c
  JOIN _old_animas a_old ON a_old.id = c.anima_id
  JOIN animas a_new ON a_new.name = a_old.name;

-- roster
CREATE TABLE roster (
    id          TEXT PRIMARY KEY,
    anima_id    TEXT NOT NULL REFERENCES animas(id),
    role        TEXT NOT NULL,
    standing    INTEGER NOT NULL DEFAULT 0,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO roster (id, anima_id, role, standing, assigned_at)
  SELECT 'r-' || lower(hex(randomblob(4))), a_new.id, r.role, r.standing, r.assigned_at
  FROM _old_roster r
  JOIN _old_animas a_old ON a_old.id = r.anima_id
  JOIN animas a_new ON a_new.name = a_old.name;

-- commission_assignments
CREATE TABLE commission_assignments (
    id              TEXT PRIMARY KEY,
    commission_id   TEXT NOT NULL REFERENCES commissions(id),
    anima_id        TEXT NOT NULL REFERENCES animas(id),
    assigned_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(commission_id, anima_id)
);

INSERT INTO commission_assignments (id, commission_id, anima_id, assigned_at)
  SELECT 'ca-' || lower(hex(randomblob(4))), c_new.id, a_new.id, ca.assigned_at
  FROM _old_commission_assignments ca
  JOIN _old_commissions c_old ON c_old.id = ca.commission_id
  JOIN commissions c_new ON c_new.content = c_old.content AND c_new.created_at = c_old.created_at
  JOIN _old_animas a_old ON a_old.id = ca.anima_id
  JOIN animas a_new ON a_new.name = a_old.name;

-- event_dispatches
CREATE TABLE event_dispatches (
    id           TEXT PRIMARY KEY,
    event_id     TEXT NOT NULL REFERENCES events(id),
    handler_type TEXT NOT NULL,
    handler_name TEXT NOT NULL,
    target_role  TEXT,
    notice_type  TEXT,
    started_at   TEXT,
    ended_at     TEXT,
    status       TEXT,
    error        TEXT
);

INSERT INTO event_dispatches (id, event_id, handler_type, handler_name, target_role,
    notice_type, started_at, ended_at, status, error)
  SELECT 'ed-' || lower(hex(randomblob(4))), e_new.id,
    d.handler_type, d.handler_name, d.target_role, d.notice_type,
    d.started_at, d.ended_at, d.status, d.error
  FROM _old_event_dispatches d
  JOIN _old_events e_old ON e_old.id = d.event_id
  JOIN events e_new ON e_new.name = e_old.name AND e_new.fired_at = e_old.fired_at;

-- commission_sessions
CREATE TABLE commission_sessions (
    commission_id TEXT NOT NULL REFERENCES commissions(id),
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    PRIMARY KEY (commission_id, session_id)
);

-- Note: commission_sessions migration uses content+created_at join for commissions
-- and started_at join for sessions since those are the stable identifiers.
INSERT INTO commission_sessions (commission_id, session_id)
  SELECT c_new.id, s_new.id
  FROM _old_commission_sessions cs
  JOIN _old_commissions c_old ON c_old.id = cs.commission_id
  JOIN commissions c_new ON c_new.content = c_old.content AND c_new.created_at = c_old.created_at
  JOIN _old_sessions s_old ON s_old.id = cs.session_id
  JOIN _old_animas a_old ON a_old.id = s_old.anima_id
  JOIN animas a_new ON a_new.name = a_old.name
  JOIN sessions s_new ON s_new.anima_id = a_new.id AND s_new.started_at = s_old.started_at;

-- ── Drop old tables ────────────────────────────────────────────────────

DROP TABLE _old_commission_sessions;
DROP TABLE _old_event_dispatches;
DROP TABLE _old_commission_assignments;
DROP TABLE _old_sessions;
DROP TABLE _old_anima_compositions;
DROP TABLE _old_roster;
DROP TABLE _old_animas;
DROP TABLE _old_commissions;
DROP TABLE _old_events;

-- ════════════════════════════════════════════════════════════════════════
-- Part 2: Work decomposition tables
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE works (
    id            TEXT PRIMARY KEY,
    commission_id TEXT REFERENCES commissions(id),
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'active', 'completed', 'cancelled')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pieces (
    id          TEXT PRIMARY KEY,
    work_id     TEXT REFERENCES works(id),
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'active', 'completed', 'cancelled')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE jobs (
    id          TEXT PRIMARY KEY,
    piece_id    TEXT REFERENCES pieces(id),
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'active', 'completed', 'failed', 'cancelled')),
    assignee    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE strokes (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id),
    kind       TEXT NOT NULL,
    content    TEXT,
    status     TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'complete', 'failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
