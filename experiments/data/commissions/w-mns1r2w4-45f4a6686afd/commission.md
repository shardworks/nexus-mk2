## Context

The Detached Sessions architecture decouples anima sessions from the guild process so they survive guild restarts. The Session Babysitter is the per-session detached process that hosts a claude session, proxies its tool calls to the guild over HTTP, streams transcript data to SQLite in real-time, and reports session lifecycle events via guild tools.

Depends on:
- "Tool HTTP API on the Instrumentarium" — the HTTP server the babysitter proxies tool calls to
- "Session Lifecycle Tools on the Animator" — the session-running and session-record tools the babysitter calls

## What to Build

A new module in the claude-code package (`packages/plugins/claude-code/src/`) — a standalone Node.js script that runs as a detached process. It is compiled as part of the claude-code package (TypeScript, same build pipeline).

### Babysitter Lifecycle

#### 1. Read config from stdin

The babysitter reads stdin to completion on startup, parses the JSON config, then closes stdin. The spawning process (the claude-code provider in the guild) writes config and closes the write end.

Config shape:
```typescript
interface BabysitterConfig {
  sessionId: string;
  guildToolUrl: string;       // e.g. "http://127.0.0.1:7471"
  dbPath: string;             // path to nexus.db (relative to guild home in .nexus/)
  claudeArgs: string[];       // pre-built CLI args (model, system-prompt-file, --resume, etc.)
  cwd: string;                // working directory for claude
  env: Record<string, string>; // environment variables for claude process
  prompt: string;             // initial prompt (piped to claude's stdin)
  tools: SerializedTool[];    // tool definitions (name, description, params as JSON Schema)
  startedAt: string;          // ISO timestamp
  provider: string;           // e.g. "claude-code"
  metadata?: Record<string, unknown>;
}

interface SerializedTool {
  name: string;
  description: string;
  paramsSchema: object;       // JSON Schema (converted from Zod at serialization time)
}
```

#### 2. Open SQLite

Open the guild's database with better-sqlite3 in WAL mode. Used exclusively for writing transcript data in real-time. The babysitter does NOT read from or write to any other Stacks books — all other communication goes through the guild's Tool HTTP API.

#### 3. Start MCP/SSE server

Use the existing `createMcpServer()` pattern from the claude-code package's mcp-server.ts, but with proxy tool handlers instead of direct handlers.

For each tool in the config, register an MCP tool whose handler:
1. Makes an HTTP POST to `{guildToolUrl}/api/{toolRoute}` with the validated params as JSON body
2. Includes the session ID in an `X-Session-Id` header
3. Retries on connection errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT) with exponential backoff
4. If retries exhaust (e.g., 60 seconds of trying), returns an error result to claude — don't crash, let claude handle the tool error
5. On success, returns the guild's response as the MCP tool result

The tool name → route mapping should use the same `toolNameToRoute()` convention used by the Instrumentarium's Tool HTTP API.

Start the MCP server on an ephemeral localhost port (same as today's `startMcpHttpServer()`).

#### 4. Prepare session files

Create tmpDir via `fs.mkdtempSync`. Write system prompt file (extracted from claudeArgs if present, or a separate config field). Write mcp-config.json pointing to the babysitter's MCP server URL. Add --mcp-config and --strict-mcp-config to claude args.

This mirrors the existing `prepareSession()` logic in the claude-code provider.

#### 5. Spawn claude

Spawn `claude` with the prepared args. Pipe prompt to claude's stdin, close stdin. Capture stdout (NDJSON stream-json format). Stderr inherited to babysitter's stderr.

#### 6. Report "running" status

Call the `session-running` tool on the guild via HTTP with the session details + cancelMetadata containing claude's PID. Use retry + DLQ: if guild is unreachable, write the payload to `.nexus/dlq/{sessionId}-running.json` relative to the guild home (derivable from dbPath).

#### 7. Consume stdout, stream transcript

Parse NDJSON from claude's stdout using the existing `processNdjsonBuffer()` and `parseStreamJsonMessage()` functions (import from the claude-code package).

On each batch of parsed messages:
- Accumulate the full transcript in memory
- Write the current transcript to `books_animator_transcripts` table in SQLite: `INSERT OR REPLACE INTO books_animator_transcripts (id, content) VALUES (?, ?)` where content is JSON `{ id, messages }`.

This makes transcript content available in real-time to any consumer reading the transcripts book (Oculus, CLI queries, other agents).

Also accumulate cost, tokenUsage, and providerSessionId from result-type messages (same as existing parseStreamJsonMessage logic).

#### 8. On claude exit: report result

Build the session result from accumulated data:
- status: completed (exitCode 0) or failed (non-zero)
- exitCode, costUsd, tokenUsage, providerSessionId
- output: extract final assistant text from transcript (existing extractFinalAssistantText())
- conversationId: from config or providerSessionId

Call `session-record` tool on guild via HTTP. If unreachable, write to `.nexus/dlq/{sessionId}.json`.

#### 9. Cleanup

Close MCP server. Close SQLite connection. Remove tmpDir. Process exits.

### Error Handling

Wrap the entire babysitter in a top-level try/catch. On any unexpected error:
1. Attempt to call session-record with status: 'failed' and the error message
2. If that fails, write to DLQ
3. Clean up and exit with non-zero code

### Dependencies

The babysitter needs:
- `better-sqlite3` — for transcript streaming (add as a dependency of the claude-code package)
- `@modelcontextprotocol/sdk` — for MCP server (already a dependency)
- NDJSON parsing functions — import from the claude-code package's own exports
- `toolNameToRoute()` — import from the Instrumentarium package (or wherever it lands after Commission 1)

### Entry Point

The babysitter script should have a clear entry point that can be resolved at runtime by the claude-code provider. For example, if the compiled output is at `dist/babysitter.js`, the provider resolves it via `import.meta.dirname` or `__dirname`. The script should be executable via `node path/to/babysitter.js` (reads config from stdin, runs to completion, exits).

## Test Expectations

- Config parsing from stdin (unit): valid JSON parsed correctly, invalid JSON errors gracefully
- MCP proxy handlers (unit): tool calls forwarded to HTTP, retry on connection errors, timeout after max retries
- Transcript streaming (integration): NDJSON parsed, transcript written to SQLite incrementally, readable by external process
- Session lifecycle reporting (integration): session-running and session-record called via HTTP
- DLQ behavior (integration): writes to DLQ directory when guild HTTP is unreachable
- End-to-end (integration): spawn babysitter with mock guild HTTP server, verify tool proxying, transcript streaming, and result reporting