Decision D6 in this commission's plandoc recommends a plain-text per-dispatch log line shape: `<ISO timestamp> <eventId> <eventName> [<handlerName>] <status> <durationMs>ms[: <error>]`. That format is operator-friendly but only loosely machine-parseable.

A future commission may want to:

1. Add JSON-lines logging as an opt-in flag (`--log-format json`), OR
2. Write structured log entries to a separate book (e.g. `clockworks/daemon_log`) that operators can query via SQL.

This is the natural follow-up if/when external monitoring tooling appears. The plain-text default works for day-one operator workflows; the structured side is additive.

Tactical detail: the dispatcher already persists every dispatch outcome to `clockworks/event_dispatches`, so the log file's content is somewhat redundant with that table. The unique value of `clock.log` is timestamped startup/shutdown banners and the per-tick aggregate summaries (decision D7). A future structured log might focus on those signals instead.