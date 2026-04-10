## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/detached-sessions-design.md`:

---

# Detached Sessions — Architecture

## Problem

Guild restarts (frequent during active framework development) kill all running anima sessions. Sessions are child processes, MCP servers are in-process, result recording is in-process. A guild restart means lost work, wasted tokens, and an operational bottleneck where Sean must pause all work and wait for sessions to finish before restarting.

## Design Constraints

- Sessions must have **full tool access** across guild restarts (no degraded mode)
- Guild restart is a **normal event**, not a failure mode
- Architecture must extend to **Docker-hosted sessions** in the future
- **SSE transport required** — Streamable HTTP does not work with Claude Code
- Tool API logic moves from Oculus to **Instrumentarium** (sessions shouldn't depend on the dashboard)

---

## Process Topology

Two process types. No relay, no shared daemon.

```
┌──────────────────────────────────────────────────────────┐
│  GUILD PROCESS  (restartable)                            │
│                                                          │
│  Full Arbor boot, all apparatuses, plus:                 │
│  ├── Tool HTTP API  (Instrumentarium, well-known port)   │
│  └── session-record, session-running tools (Animator)    │
│                                                          │
│  CDC fires for: tool handler writes, session lifecycle   │
└──────────────────────────────────────────────────────────┘
         ▲                              │
         │ HTTP (tool calls + session   │ spawn (detached)
         │ lifecycle, retry+DLQ)        │ config via stdin
         │                              ▼
┌────────┴─────────────────────────────────────────────────┐
│  SESSION BABYSITTER  (per-session, detached)             │
│                                                          │
│  ├── MCP/SSE server (handlers proxy to guild Tool API)   │
│  ├── Claude child process                                │
│  ├── NDJSON stdout → transcript streaming (direct SQLite)│
│  ├── Session lifecycle (HTTP tools: session-running,     │
│  │   session-record)                                     │
│  │   └── retry + DLQ (.nexus/dlq/) on guild unavailable  │
│  └── tmpDir cleanup                                      │
└──────────┬───────────────────────────────────────────────┘
           │ child
           ▼
┌──────────────────────────────────────────────────────────┐
│  CLAUDE PROCESS                                          │
│  --mcp-config → babysitter's MCP/SSE endpoint            │
└──────────────────────────────────────────────────────────┘
```

### Lifecycles

| Process | Started by | Lifetime | Restart impact |
|---|---|---|---|
| **Guild** | Operator | Minutes–hours | Tool calls retry; sessions unaffected |
| **Babysitter** | Guild (detached spawn) | One session | That session only |
| **Claude** | Babysitter (child) | One session | Session ends |

---

## Babysitter Lifecycle

### 1. Receive config via stdin

Guild spawns babysitter with `{ detached: true, stdio: ['pipe', 'ignore', 'inherit'] }` and writes JSON config to stdin, then closes it. Babysitter reads stdin to completion before proceeding.

Config shape:
```typescript
interface BabysitterConfig {
  sessionId: string;
  guildToolUrl: string;       // e.g. "http://127.0.0.1:7471"
  dbPath: string;             // path to .nexus/nexus.db
  claudeArgs: string[];       // pre-built CLI args (model, system-prompt-file, --resume, etc.)
  cwd: string;                // working directory for claude
  env: Record<string, string>; // environment variables
  prompt: string;             // initial prompt (piped to claude's stdin)
  tools: SerializedTool[];    // full tool definitions (name, description, params JSON schema)
  startedAt: string;          // ISO timestamp (set by guild at dispatch time)
  provider: string;           // provider name (e.g. "claude-code")
  metadata?: Record<string, unknown>; // session metadata (writId, engineId, etc.)
}
```

The guild passes full tool definitions so the babysitter can register them on its MCP server without needing to contact the guild. The babysitter works even if the guild goes down between spawn and claude startup.

### 2. Open SQLite (direct, for transcript streaming)

Opens the guild's `nexus.db` with better-sqlite3 in WAL mode. Used only for writing transcript chunks. Read-modify-write of the transcript doc on each stdout buffer flush.

### 3. Start MCP/SSE server

Same `createMcpServer()` pattern as today, but each tool handler is:

```typescript
async (params) => {
  const response = await httpCallWithRetry(guildToolUrl, toolName, params);
  return response;
}
```

Retry with backoff on connection errors. If retry exhausts (guild down too long), return error to claude (claude handles tool errors).

### 4. Prepare session files

Creates tmpDir. Writes system prompt file, mcp-config.json pointing to its own MCP server. Same as today's `prepareSession()`.

### 5. Report "running" status

Calls `session-running` tool on guild via HTTP. This writes the initial SessionDoc to Stacks (fires CDC). Includes cancelMetadata with claude's PID once spawned.

Uses retry + DLQ. If guild is down at session start, the running status is DLQ'd and reported when guild comes back.

### 6. Spawn claude, consume stdout

Spawns claude with args + mcp-config. Pipes prompt to stdin.

Consumes stdout NDJSON. On each buffer of parsed messages:
- Accumulates transcript in memory
- Flushes current transcript to `books_animator_transcripts` via direct SQLite write
- Extracts streaming chunks for real-time visibility

This makes the full conversation content available in real-time to anyone querying the transcripts book — Oculus, CLI, other agents. No in-memory broadcaster needed.

### 7. On claude exit: report result

Builds SessionProviderResult from accumulated data (exit code, transcript, cost, tokens, output). Calls `session-record` tool on guild via HTTP.

If guild is unreachable: writes result to `.nexus/dlq/{sessionId}.json`. Guild drains DLQ on startup.

### 8. Cleanup

Closes MCP server. Closes SQLite. Removes tmpDir. Process exits.

---

## Guild-Side Changes

### Tool HTTP API (Instrumentarium)

The Oculus's tool→HTTP mapping pattern (`toolNameToRoute`, `permissionToMethod`, param validation) moves to the Instrumentarium as a first-class capability. The Instrumentarium gains:

```typescript
interface InstrumentariumApi {
  // existing
  resolve(opts): ResolvedTool[];
  list(): ResolvedTool[];

  // new
  startToolServer(opts?: { port?: number }): Promise<ToolServerHandle>;
}
```

The tool server:
- Hono-based HTTP server on a well-known port
- Registers routes for all tools (patron + anima + infrastructure)
- Session-scoped authorization: requests include session ID header, server checks session → role → tool whitelist
- The Oculus can delegate to this server (or mount it) rather than reimplementing

### Session Lifecycle Tools (Animator)

Two new tools registered by the Animator:

**`session-running`** — Records initial "running" SessionDoc. Called by babysitter at session start.
```
{ sessionId, startedAt, provider, metadata, cancelMetadata }
→ writes SessionDoc with status: 'running'
→ fires CDC
```

**`session-record`** — Records terminal session result. Called by babysitter on claude exit.
```
{ sessionId, status, exitCode, error?, costUsd?, tokenUsage?,
  transcript?, output?, providerSessionId?, conversationId? }
→ writes SessionDoc + TranscriptDoc
→ fires CDC (Laboratory observes session completion)
→ Spider collects on next crawl
```

### DLQ Drain

On guild startup, scan `.nexus/dlq/` for pending session results. Process each through `session-record` handler (fires CDC). Delete processed files.

### Orphan Recovery

On Animator startup, query sessions with `status = 'running'`. For each, check if `cancelMetadata.pid` is alive (`process.kill(pid, 0)`). If dead (ESRCH), mark as failed with `error: 'Session process died unexpectedly (orphaned)'`.

---

## What Stays the Same

- **Spider `tryCollect()`** — already reads session status from Stacks by polling. No changes.
- **Session cancel** — `process.kill(pid, 'SIGTERM')` works cross-process. PID stored in cancelMetadata. Babysitter's claude child dies, babysitter records the result. No changes to cancel flow.
- **Loom** — still resolves role → tools at dispatch time. Tool set passed to babysitter in config.
- **Codexes** — draft worktrees are on the filesystem, independent of process topology.
- **Laboratory CDC** — fires on Stacks writes from tool handlers and session-record. Same observation surface.

## What Changes

| Component | Today | Detached |
|---|---|---|
| Claude spawn | In-process child | Babysitter child (detached from guild) |
| MCP server | In-process, direct tool handlers | In babysitter, proxy handlers via HTTP |
| Transcript recording | End-of-session bulk write | Real-time streaming to SQLite |
| Session status ("running") | In-process `recordRunning()` | `session-running` tool call via HTTP |
| Session result | In-process `recordSession()` | `session-record` tool call via HTTP |
| Real-time output | In-memory broadcaster (broken) | Direct transcript book query |
| Config delivery | In-process function args | JSON via stdin to babysitter |

## Docker Extension Path

Docker sessions replace the babysitter's `spawn('claude', ...)` with a Docker container launch. The babysitter runs on the host (or in a sidecar container) and:
- Serves MCP over a network-accessible port (bind 0.0.0.0 instead of 127.0.0.1)
- Claude inside the Docker container connects to babysitter's MCP via container networking
- Tool calls still proxy to guild HTTP API
- Transcript streaming still writes to host SQLite

The architecture is the same — only the claude spawn mechanism changes.

---

## Commission Decomposition (Rough)

### Commission 1: Tool HTTP API (Instrumentarium)
Extract the Oculus tool→HTTP pattern into the Instrumentarium. Well-known port. Session-scoped auth. All tool types (patron, anima, infrastructure).

### Commission 2: Session Lifecycle Tools
`session-running` and `session-record` tools on the Animator. DLQ drain on startup. Orphan recovery.

### Commission 3: Session Babysitter
The babysitter script in the claude-code package. MCP proxy server, NDJSON capture, transcript streaming, result reporting, stdin config, detached spawn integration.

### Commission 4: Provider Rewire
Update the claude-code provider's `launch()` to spawn babysitters instead of claude directly. Transparent to the Animator (same AnimatorSessionProvider interface).

Dependencies: 1 → 3 (babysitter needs Tool API), 2 → 3 (babysitter needs lifecycle tools), 3 → 4 (provider uses babysitter).

---

## Summary

Work shipped via writ w-mns1y9da-140be98187cb. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/detached-sessions-design.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mns1y9da-140be98187cb.