Lifted from the planning run of "Clockworks daemon — `nsg clock start/stop/status`" (w-modf680u-59da30f9e6b3). Each numbered observation below is a draft mandate ready for curator promotion.

1. Refactor PID-file / process-liveness helpers into nexus-core for reuse
2. Update clockworks README status block once daemon ships
3. Reconcile architecture-doc Phase 2 daemon section with shipped behavior
4. Consider auto-starting the Clockworks daemon from `nsg start` (the guild daemon)
5. Daemon log file format should be machine-parseable from day one
6. Daemon should expose a stop-via-MCP-tool surface for animas
7. Concurrent `nsg clock run` + daemon may produce duplicate dispatch rows under certain races
8. Daemon's `processEvents` exception handling should distinguish transient from terminal errors
9. `clock-status` MCP tool's stale-pidfile-cleanup side effect may surprise observability tooling
10. Daemon's start-time banner should record the daemon's own ID for cross-restart correlation
11. Test the daemon's foreground entry without spawning a real child process
12. Daemon coexistence warning in `nsg clock run` may cause noisy stderr in CI / scripted use
