Claude-code apparatus had two complexity-diagnosis commissions and a babysitter-runtime extraction that lifted ~16 observations. Real refactor candidates:
- runBabysitter orchestrator decomposition (init / steady-state / terminal phases)
- MCP/SSE proxy as its own module
- Source-mode (.ts vs .js) detection consolidated in 3 places
- Hand-rolled required-field validation → Zod schema in readConfigFromStdin
- Logging style standardization (console.warn vs process.stderr.write)
- Per-NDJSON-message full-transcript SQLite rewrites (O(n²))
- `removeAllListeners(SIGTERM)` → targeted removal
- README rate-limit-detector drift against single-branch code
- 200-character STDERR_DIAGNOSTIC_TAIL_LIMIT may be too small

These are real medium-effort refactors. DO NOT DISPATCH yet — let claude-code complexity diagnosis follow-on commissions land first.