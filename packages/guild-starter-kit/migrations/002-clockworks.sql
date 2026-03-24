-- Clockworks tables: event log and dispatch tracking.
-- Part of Pillar 5 — the guild's event-driven nervous system.

CREATE TABLE events (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    payload    TEXT,
    emitter    TEXT NOT NULL,
    fired_at   TEXT NOT NULL DEFAULT (datetime('now')),
    processed  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE event_dispatches (
    id           INTEGER PRIMARY KEY,
    event_id     INTEGER NOT NULL REFERENCES events(id),
    handler_type TEXT NOT NULL,
    handler_name TEXT NOT NULL,
    target_role  TEXT,
    notice_type  TEXT,
    started_at   TEXT,
    ended_at     TEXT,
    status       TEXT,
    error        TEXT
);
