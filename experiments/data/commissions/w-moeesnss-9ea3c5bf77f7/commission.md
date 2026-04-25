Lifted from the planning run of "Claude-code complexity diagnosis" (w-moecr6yj-83af8cbdef71). Each numbered observation below is a draft mandate ready for curator promotion.

1. Refresh claude-code README to match the single-branch rate-limit detector
2. Replace removeAllListeners('SIGTERM') in babysitter cleanup with targeted removal
3. Consolidate duplicated source-mode (.ts vs .js) detection logic in claude-code
4. Investigate per-NDJSON-message full-transcript rewrite to SQLite (O(n²) total writes)
5. Reconsider 200-character STDERR_DIAGNOSTIC_TAIL_LIMIT for terminationDiagnostic excerpts
6. Standardize logging style across claude-code (mix of console.warn and process.stderr.write)
7. Replace hand-rolled required-field validation in readConfigFromStdin with a Zod schema
8. Clean up stale _plan directory at repo root (Clockworks scheduled-orders draft)
