## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/detached-sessions-review.md`:

---

# Detached Sessions — Commission Review

Review of commits `ab916f8..a93e144` on `origin/main` (four commissions implementing the detached sessions architecture).

## TL;DR

**Code quality: strong.** Clean structure, comprehensive tests (~3,000 lines of test code), good separation of concerns, thorough error handling with retry + DLQ.

**Integration: broken.** The tool server is never started. Session registration is never called. The babysitter cannot successfully proxy *any* tool call, and cannot even report its own lifecycle events.

**Bottom line:** Cannot ship a smoke test yet. Need one more commission (or direct patch) to wire the tool server into guild boot and have the provider register sessions before spawning babysitters.

---

## Commissions Shipped

| # | Writ | Commit | LoC (prod/test) |
|---|---|---|---|
| C1 | w-mns1wmnr | `ab916f8`, `1ad2bdd` | ~350 / 754 |
| C2 | w-mns1xdy2 | `afd173b` | ~350 / 576 |
| C3 | w-mns1y9da | `67b620d` | ~650 / 850 |
| C4 | w-mns1yzrc | `a93e144` | ~360 / 762 |

Total: ~1,700 production lines, ~2,942 test lines. Test-to-code ratio ~1.7x.

---

## What Works ✓

### C1 — Tool HTTP Server (Instrumentarium)

- `toolNameToRoute()` / `permissionToMethod()` extracted cleanly. Correct conventions: `writ-list` → `POST /api/writ/list`, `tools-list` → `GET /api/tools/list`.
- `SessionRegistry` — simple, correct in-memory Map-of-Sets. Register, deregister, isAuthorized.
- `createToolServerApp()` — serves all tool caller types via `api.list()` (not filtered to patron-only like Oculus).
- **Session-scoped authorization**: patron-callable tools bypass session auth; anima-only tools require valid `X-Session-Id`. Logic in `requiresSessionAuth()` is correct.
- Session management endpoints: `POST /sessions` (register), `DELETE /sessions/:id` (deregister), `GET /sessions/:id` (introspect).
- `coerceParams()` for GET query strings (numbers, booleans, arrays).
- Binds to `127.0.0.1`. Port from `guild.json["tools"]["serverPort"]` with default 7471.
- `startToolServer()` exposed on `InstrumentariumApi`.

### C2 — Session Lifecycle Tools + DLQ Drain + Orphan Recovery

- `session-running` tool — writes initial SessionDoc with status `running`, includes `cancelMetadata.pid`.
- `session-record` tool — delegates to shared `handleSessionRecord()`. Respects pre-existing `cancelled` status (doesn't overwrite). Writes transcript if provided.
- `drainDlq()` — scans `.nexus/dlq/*.json`, processes each through `handleSessionRecord`, deletes on success, logs on failure.
- `recoverOrphans()` — queries sessions with `status = 'running'`, checks `cancelMetadata.pid` liveness via `process.kill(pid, 0)`, marks dead ones as failed with "orphaned" error.
- Both wired into Animator `start()` — fire-and-forget after book init.
- `isProcessAlive()` correctly handles ESRCH (dead) and EPERM (alive but not ours).

### C3 — Session Babysitter

- **Standalone architecture.** `babysitter.ts` has a clean `runBabysitter(config, deps)` function with injectable deps (db, spawn, retry timeout) — makes it fully unit-testable without real subprocesses or SQLite.
- **stdin config reading.** `readConfigFromStdin()` reads to EOF, validates required fields.
- **Retry + backoff.** `callGuildHttpApi()` with exponential backoff (1s → 8s) and 60s total timeout. Correctly identifies retryable errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, plus `cause.code` for fetch wrapping).
- **MCP proxy server.** Uses low-level `@modelcontextprotocol/sdk` `Server` class. Registers tools/list with full JSON Schema, tools/call forwards to guild HTTP. SSE transport matches the provider's existing pattern.
- **Direct SQLite transcript streaming.** `openTranscriptDb()` uses dynamic `import('better-sqlite3')` (test-friendly). WAL mode. `INSERT OR REPLACE INTO books_animator_transcripts`.
- **Transcript flush on each buffer.** Writes the full accumulated transcript on each new NDJSON batch with new messages. Simple, correct.
- **Lifecycle reporting with DLQ fallback.** `reportRunning()` and `reportResult()` both try HTTP → fall back to `writeToDlq()`.
- **Top-level try/catch/finally.** Even a spawn failure gets session-record attempted, then DLQ fallback, then cleanup runs.
- **Entry point detection.** `isEntryPoint` check allows the file to be both a library (imported by `detached.ts`) and a standalone script.

### C4 — Provider Rewire

- **`serializeTool()` uses `z.toJSONSchema()`** (Zod 4 native) — correct modern approach.
- **`buildBabysitterConfig()`** — handles system prompt file, `--resume`, tool serialization, metadata passthrough.
- **`launchDetached()`**: spawns `node [babysitterPath]` with `detached: true`, writes config to stdin, closes it, calls `proc.unref()` — guild doesn't wait.
- **`pollForTerminalStatus()`** — polls sessions book, returns when status != 'running', 24h timeout.
- **`pollForProcessInfo()`** — polls for `cancelMetadata.pid` (claude's PID from babysitter), falls back to babysitter PID for cancel.
- **`chunks`** returns empty async iterable (real-time output now in transcripts book).
- **`launch()` now unconditionally calls `launchDetached()`** — attached mode is dead code preserved as `launchAttached()` for debugging.
- **`resolveBabysitterPath()`** — sibling file resolution via `import.meta.dirname`, works in both compiled and (with caveats) source modes.

---

## Critical Issues ✗

### 1. Tool HTTP Server is never started

**Severity: blocker**

`startToolServer()` is exposed on `InstrumentariumApi` and is only called in test files. No production code path invokes it. The guild CLI (`nsg start`, `nsg crawl`, etc.) does not boot the tool server.

**Impact:** Any babysitter launched today will hit `ECONNREFUSED` on every single tool call, including `session-running`. The session will fail before it starts producing work.

**Fix:** Something needs to call `guild().apparatus<InstrumentariumApi>('tools').startToolServer()` at guild boot. Candidates:
- CLI `nsg start` command (see Daemon Brief below — this is the natural home).
- The Instrumentarium's own `start()` hook (simple, but conflates "registry" with "server").
- A dedicated bootstrap hook elsewhere.

Preferred: the new daemon mode (`nsg start`) starts it alongside Oculus and the Spider.

### 2. Session registration is never called

**Severity: blocker**

`POST /sessions` exists on the tool server, but nothing in the guild calls it. `launchDetached()` serializes the tool set into the babysitter config but does not register it with the tool server.

**Impact:** Even if the server were started, every non-patron tool call from the babysitter would return `403 Session not authorized to call this tool`.

**Fix:** Before spawning the babysitter, `launchDetached()` must:

```typescript
await fetch(`${guildToolUrl}/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: config.sessionId,
    tools: config.tools.map(rt => rt.definition.name),
  }),
});
```

And on session completion (in the `reportResult` path or `recoverOrphans`), `DELETE /sessions/:id` to clean up. Otherwise the session registry accumulates dead entries forever.

### 3. Chicken-and-egg: session-running is `callableBy: 'anima'`

**Severity: blocker (interacts with #2)**

`session-running` and `session-record` are marked `callableBy: 'anima'`. The tool server's `requiresSessionAuth()` treats any tool without `'patron'` in its callableBy list as requiring session authorization.

**Impact:** The babysitter's first HTTP call is `session-running`, which will be rejected with 403 unless the session is already registered AND its registration includes `session-running` in the allowed tool list. That contradicts the purpose of the tool (reporting that a session exists).

**Fix options:**
- **(a) Preferred — Add `session-running` and `session-record` to the session's registered tool list in `launchDetached()` before spawning.** This is the cleanest fix: they're infrastructure tools the session is authorized to call about itself.
- **(b) Mark these two tools as unauthenticated** — but this weakens the auth boundary and allows any process that can reach `127.0.0.1:7471` to spoof session lifecycle events.
- **(c) Introduce an `'infrastructure'` caller type** in the Instrumentarium and have the tool server treat it as pre-authorized — matches the original commission brief's intent but is a bigger change.

Recommend (a) for the smoke test, (c) as a follow-up refinement.

### 4. `launchDetached()` has no fallback to attached mode

**Severity: medium**

`launch()` now unconditionally delegates to `launchDetached()`. There's no guild.json flag to opt out, and no automatic fallback if the tool server is unreachable at dispatch time.

**Impact:** Once this code ships, there's no way to run a session in-process. If detached mode is broken (e.g., during the fixes for #1–#3), every session fails.

**Fix:** Add a `guild.json["animator"]["detached"]` flag (default `false` until the integration is proven), or make `launch()` check tool server reachability and fall back to `launchAttached()` with a warning.

---

## Medium Issues ⚠

### 5. System prompt tmpDir leak in `buildBabysitterConfig()`

`buildBabysitterConfig()` creates a tmpDir via `fs.mkdtempSync()` for the system prompt file, but **nothing cleans it up**. The babysitter's own tmpDir cleanup is a *different* tmpDir (for the mcp-config.json). The system prompt tmpDir is orphaned.

Comment acknowledges it: *"The file persists for the session duration — acceptable for detached sessions."* But "the session duration" is indefinite, and on a busy guild these will accumulate until OS tmp cleanup runs (could be weeks on Linux).

**Fix:** Write the system prompt file into the babysitter's own tmpDir (after it's created) rather than pre-creating one in the provider. Requires passing the system prompt as config content, not a path.

### 6. No session registration deregistration on completion

Even after fix #2, `launchDetached()` doesn't DELETE the session registration when the session completes. Over a long-running guild, the `SessionRegistry` Map grows unboundedly.

**Fix:** In the result promise chain, after `pollForTerminalStatus()` resolves, fire-and-forget a `DELETE /sessions/:sessionId`.

### 7. `pollForTerminalStatus()` polls every 5s

For a ~10-minute session that's fine, but it means session transitions propagate to the Animator's `AnimateHandle` with up to 5s of latency. The Spider's rig engines wait on this.

**Mitigation:** Subscribe to Stacks CDC for the session doc instead of polling. Or drop poll interval to 1s for detached mode (still a lot of polling over 24h max).

Not a blocker for smoke test — just a perf note for later.

### 8. `isEntryPoint` check won't fire in source mode

```typescript
const isEntryPoint = process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
   process.argv[1].endsWith('/babysitter.js'));
```

If the CLI runs source via `node --experimental-transform-types babysitter.ts`, `import.meta.url` points to `.ts` and `process.argv[1]` ends with `.ts`. The first check handles this. The second check (`.js`) only hits when running compiled output. Fine, but worth documenting.

### 9. `detached.ts` default `pollTimeoutMs = 24h`

24 hours is the hard cap on any detached session. Fine for nearly all cases, but longer research sessions (or stuck sessions) will be marked failed after 24h of polling even if the babysitter is still alive. Consider making this configurable per-session via `AnimateRequest`.

---

## Minor Issues

- **`StartupContext` import unused in animator.ts** — Compiler warning, not runtime impact.
- **`TranscriptDoc` import in animator.ts** — probably leftover after refactor. Harmless.
- **No integration test for babysitter → tool server** end-to-end. Each side is unit-tested, but the wire between them was never exercised. (This is what the smoke test is for.)
- **Babysitter's `writeTranscript()` rewrites full transcript on every buffer.** For a session with 500 messages and ~10 NDJSON batches at the end, this is 500 writes (not 10). Each is small, but the n² growth is a latent perf issue. Not a blocker.
- **`serializeTool()` comment says "extract inner properties"** but the code strips `type` and `$schema` and spreads the rest. The JSON Schema generated by `z.toJSONSchema(def.params)` has the object type shape; the babysitter then wraps with `{ type: 'object', ...params }`. The result is correct but the logic is subtle and the comment is slightly misleading.

---

## Summary of Required Fixes Before Smoke Test

1. **Start the tool server at guild boot** (→ daemon mode).
2. **Register sessions with the tool server in `launchDetached()`** before spawning.
3. **Include `session-running` and `session-record` in the registered tool list** (fix #3 option a).
4. **Add a detached-mode opt-out flag** (`guild.json["animator"]["detached"] = true` to opt in, false by default).

Fixes 1–3 are non-negotiable for the smoke test. Fix 4 is highly recommended for safe rollout.

Estimated effort: 1 small commission (~200 lines, ~400 test lines). Could also be a direct patch if we want to keep it fast.

---

## Summary

Work shipped via writ w-mns1y9da-140be98187cb. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/detached-sessions-review.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mns1y9da-140be98187cb.