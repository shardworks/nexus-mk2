-- Session tracking — records every session launched through the funnel.

CREATE TABLE sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  anima_id            INTEGER NOT NULL REFERENCES animas(id),
  provider            TEXT NOT NULL,            -- 'claude-code', 'claude-api', 'bedrock'
  model               TEXT,                     -- 'claude-sonnet-4-6', 'claude-opus-4-6', etc.
  trigger             TEXT NOT NULL,            -- 'consult', 'summon', 'brief'
  workshop            TEXT,                     -- workshop name, null for guildhall sessions
  workspace_kind      TEXT NOT NULL,            -- 'guildhall', 'workshop-temp', 'workshop-managed'
  curriculum_name     TEXT,                     -- curriculum used (null if none)
  curriculum_version  TEXT,                     -- curriculum version at session time
  temperament_name    TEXT,                     -- temperament used (null if none)
  temperament_version TEXT,                     -- temperament version at session time
  roles               TEXT,                     -- JSON array of role names
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  exit_code           INTEGER,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  cache_read_tokens   INTEGER,
  cache_write_tokens  INTEGER,
  cost_usd            REAL,
  duration_ms         INTEGER,
  provider_session_id TEXT,                     -- claude session ID, API request ID, etc.
  record_path         TEXT                      -- path to session record JSON, relative to guild root
);

-- Links commissions to the sessions used to complete them.
-- Separate table because: not all sessions are commissions,
-- and a commission may involve multiple sessions (retries, sub-tasks).
CREATE TABLE commission_sessions (
  commission_id INTEGER NOT NULL REFERENCES commissions(id),
  session_id    INTEGER NOT NULL REFERENCES sessions(id),
  PRIMARY KEY (commission_id, session_id)
);
