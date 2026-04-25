Lifted from the planning run of "Arbor never calls `apparatus.stop()` — the lifecycle hook is declared but ignored" (w-modgu1s1-7952ebde213e). Each numbered observation below is a draft mandate ready for curator promotion.

1. Reconcile `clearGuild()` JSDoc with the actual shutdown contract
2. Add `stop()` hook to The Instrumentarium for tool-server lifecycle
3. Migrate Clockworks `stop()` no-op to honor the apparatus contract
4. Audit standing SIGTERM/SIGINT signal-handling sites for guild-aware shutdown
5. Apparatus `stop()` is never tested at the guild level today
6. Remove the `clockwork.stop` is-function smoke assertion when a real teardown lands
