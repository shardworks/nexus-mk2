# Fix Babysitter MCP Handshake Race

## Summary

Eliminate a race condition in the babysitter and attached-mode MCP/SSE servers where a POST /message arriving before the GET /sse handler finishes connecting the transport causes a 400/500 error, resulting in Claude seeing zero guild tools for the session.

## Current State

Both `createProxyMcpHttpServer()` in `packages/plugins/claude-code/src/babysitter.ts` (lines 224-315) and `startMcpHttpServer()` in `packages/plugins/claude-code/src/mcp-server.ts` (lines 114-166) use the same SSE handler pattern:

```typescript
let transport: SSEServerTransport | null = null;

const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/sse') {
    transport = new SSEServerTransport('/message', res);
    await server.connect(transport);
  } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
    if (!transport) {
      res.writeHead(400).end('No active SSE connection');
      return;
    }
    await transport.handlePostMessage(req, res);
  }
});
```

The `Protocol.connect()` method (MCP SDK `@modelcontextprotocol/sdk@1.27.1`, `shared/protocol.js:219-251`) sets `transport.onmessage` before calling `transport.start()`. `SSEServerTransport.start()` synchronously writes SSE headers and the `endpoint` event to the response (`res.writeHead(200, ...)` + `res.write('event: endpoint\ndata: /message?sessionId=...')`). Once the endpoint event is written to the TCP socket, Claude's SSE client sees the endpoint URL and may immediately POST an `initialize` message.

In Node.js, incoming HTTP requests are dispatched on separate event loop turns. The GET /sse handler runs as an async function. Although `server.connect(transport)` has no real async work (the `start()` method is synchronous), the `await` creates a microtask boundary. If the event loop is congested (cold-boot babysitter process with `--experimental-transform-types`, dynamic `import('better-sqlite3')`, MCP SDK loading), a POST /message request can be dispatched between the TCP write of the SSE endpoint event and the GET handler's async completion.

When this happens:
- The POST handler checks `if (!transport)` — but `transport` was assigned before `connect()`, so it's non-null.
- However, `handlePostMessage` calls `this.onmessage?.(...)`. The `onmessage` IS set (Protocol.connect sets it before start), so the message is dispatched.
- The real failure mode is more likely: `handlePostMessage` checks `if (!this._sseResponse)` — this IS set by `start()` — but if the POST arrives before the GET handler's `await server.connect(transport)` has resolved and the Node.js event loop has returned to servicing the response write buffers, the response to the POST may interleave with the SSE stream setup. Alternatively, if `server.connect(transport)` throws (SDK internal error during cold boot), the catch block writes a 500, and `transport` is left in a partially-initialized state — subsequent POSTs get a 500 from `handlePostMessage` trying to write to a broken response.
- Combined with `--strict-mcp-config`, Claude records the server as having zero tools and proceeds.

The babysitter has no logging for the MCP handshake, making this failure mode invisible.

Existing tests in `babysitter.test.ts` and `mcp-server.test.ts` test server creation, lifecycle, and tool registration but do not exercise a rapid SSE→POST sequence (the actual MCP client handshake).

## Requirements

- R1: When a POST /message request arrives at the babysitter's MCP proxy server before the SSE transport is fully connected, the POST must wait until the connection is ready rather than failing with 400 or 500.
- R2: When a POST /message request arrives at the attached-mode MCP HTTP server before the SSE transport is fully connected, the POST must wait until the connection is ready rather than failing with 400 or 500.
- R3: The babysitter must log to stderr when its MCP proxy server is ready and listening, including the port number.
- R4: The babysitter must log a warning to stderr if a POST /message arrives while the transport is not yet connected (before the promise resolves), as a diagnostic signal that the race window was entered.
- R5: An automated test must verify that the babysitter's MCP proxy server returns the correct tool list when an MCP client connects and calls tools/list immediately after SSE connection.
- R6: An automated test must verify that the attached-mode MCP HTTP server returns the correct tool list when an MCP client connects and calls tools/list immediately after SSE connection.
- R7: The promise-gate pattern must not change the public API signatures of `createProxyMcpHttpServer()` or `startMcpHttpServer()` — the `McpProxyHandle` and `McpHttpHandle` interfaces remain unchanged.
- R8: The `close()` method on both handles must still cleanly shut down the transport and HTTP server, including when close is called before any SSE connection is established.

## Design

### Type Changes

No type changes. The `McpProxyHandle`, `McpHttpHandle`, `SerializedTool`, `BabysitterConfig`, and `TranscriptDb` interfaces remain unchanged.

### Behavior

#### Promise-gate pattern (babysitter.ts — `createProxyMcpHttpServer`)

Replace the bare `let transport` variable with a promise-gated approach:

```typescript
let transportReady: Promise<SSEServerTransport>;
let resolveTransport: (t: SSEServerTransport) => void;
let rejectTransport: (err: Error) => void;

// Create the gate promise. It resolves when GET /sse completes server.connect().
transportReady = new Promise<SSEServerTransport>((resolve, reject) => {
  resolveTransport = resolve;
  rejectTransport = reject;
});

// Keep a direct reference for close() — null until connected.
let transport: SSEServerTransport | null = null;

const httpServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/sse') {
      const t = new SSEServerTransport('/message', res);
      try {
        await server.connect(t);
        transport = t;
        resolveTransport(t);
      } catch (err) {
        rejectTransport(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
      let t: SSEServerTransport;
      try {
        t = await transportReady;
      } catch {
        res.writeHead(503).end('SSE transport failed to initialize');
        return;
      }
      await t.handlePostMessage(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  } catch {
    if (!res.headersSent) {
      res.writeHead(500).end('Internal Server Error');
    }
  }
});
```

Key behavioral rules:
- When a POST /message arrives before GET /sse has completed, the POST handler awaits `transportReady`, which blocks until the GET handler resolves or rejects it.
- When GET /sse's `server.connect()` succeeds, `resolveTransport(t)` is called, unblocking any waiting POST handlers.
- When GET /sse's `server.connect()` fails, `rejectTransport(err)` is called, and waiting POST handlers respond with 503.
- The `transport` variable is still set for `close()` cleanup. `close()` checks `transport` (not the promise).
- The `transportReady` promise is created once at server construction time, not per-request. This is correct because the SSE server model is one-transport-per-server (single client session).

#### Promise-gate pattern (mcp-server.ts — `startMcpHttpServer`)

Apply the identical pattern to `startMcpHttpServer()`. The only difference is the server variable name (`mcpServer` instead of `server`) and that it uses the high-level `McpServer` class. The promise-gate logic is the same.

```typescript
let transportReady: Promise<SSEServerTransport>;
let resolveTransport: (t: SSEServerTransport) => void;
let rejectTransport: (err: Error) => void;

transportReady = new Promise<SSEServerTransport>((resolve, reject) => {
  resolveTransport = resolve;
  rejectTransport = reject;
});

let transport: SSEServerTransport | null = null;

const httpServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/sse') {
      const t = new SSEServerTransport('/message', res);
      try {
        await mcpServer.connect(t);
        transport = t;
        resolveTransport(t);
      } catch (err) {
        rejectTransport(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
      let t: SSEServerTransport;
      try {
        t = await transportReady;
      } catch {
        res.writeHead(503).end('SSE transport failed to initialize');
        return;
      }
      await t.handlePostMessage(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  } catch {
    if (!res.headersSent) {
      res.writeHead(500).end('Internal Server Error');
    }
  }
});
```

No logging is added to mcp-server.ts (D8: babysitter-only logging).

#### Diagnostic logging (babysitter.ts only)

Add two permanent stderr log lines to `createProxyMcpHttpServer()`:

1. **MCP server ready** — after `httpServer.listen()` resolves, before returning the handle:
   ```typescript
   process.stderr.write(`[babysitter] MCP proxy server listening on port ${addr.port}\n`);
   ```

2. **Race-window warning** — inside the POST /message handler, when `transportReady` is awaited (meaning the POST arrived before the GET completed). Add a log before the `await`:
   ```typescript
   } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
     if (!transport) {
       process.stderr.write(`[babysitter] POST /message arrived before SSE transport ready — waiting\n`);
     }
     let t: SSEServerTransport;
     try {
       t = await transportReady;
     } catch {
   ```
   The `if (!transport)` check before awaiting the promise detects the race condition: if `transport` is already set, the promise resolves immediately and no log is emitted. If `transport` is null, the POST arrived before the GET handler finished, which is the race we're diagnosing.

#### close() behavior

The `close()` method on both handles uses the direct `transport` variable (not the promise):

```typescript
async close() {
  if (transport) {
    await transport.close();
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}
```

This is unchanged from the current implementation. When `close()` is called before any SSE connection (transport is null), it skips the transport close and just shuts down the HTTP server. This is correct.

### Non-obvious Touchpoints

- The `catch {}` blocks at the outer level of both HTTP handlers (babysitter.ts line 286, mcp-server.ts line 136) remain bare catches. The spec does not change these — they're a pre-existing pattern. However, if the `server.connect()` call throws, the inner try/catch now calls `rejectTransport()` before re-throwing, ensuring the outer catch still fires and writes 500 to the response.

### Dependencies

The regression tests (R5, R6) require importing from the MCP SDK's client module:
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
```

The `@modelcontextprotocol/sdk` package is already a dependency of `@shardworks/claude-code-apparatus` (version 1.27.1 in package.json). The `SSEClientTransport` depends on the `eventsource` package, which is a transitive dependency of the SDK. No new package installations are needed.

## Validation Checklist

- V1 [R1, R2]: Start the MCP proxy server (babysitter) and the MCP HTTP server (attached) with a test tool registered. Connect an MCP `Client` via `SSEClientTransport`, call `client.listTools()`, and verify the response contains the test tool. This must succeed reliably, not flakily.
- V2 [R3]: Run the babysitter test suite. Verify that `createProxyMcpHttpServer()` writes `[babysitter] MCP proxy server listening on port <N>` to stderr. Check this by inspecting test output or by capturing stderr in the test.
- V3 [R4]: Verify the warning log `[babysitter] POST /message arrived before SSE transport ready` exists in the codebase at the correct location (inside the POST handler, conditioned on `!transport`). Run: `grep -n 'POST /message arrived before SSE transport ready' packages/plugins/claude-code/src/babysitter.ts` — must match exactly one line.
- V4 [R5]: Run `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/plugins/claude-code/src/babysitter.test.ts` — the new MCP handshake test must pass.
- V5 [R6]: Run `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/plugins/claude-code/src/mcp-server.test.ts` — the new MCP handshake test must pass.
- V6 [R7]: Verify no changes to the `McpProxyHandle` or `McpHttpHandle` interfaces. Run: `grep -A3 'export interface McpProxyHandle' packages/plugins/claude-code/src/babysitter.ts` and `grep -A3 'export interface McpHttpHandle' packages/plugins/claude-code/src/mcp-server.ts` — must match the current signatures (url: string, close(): Promise<void>).
- V7 [R8]: The existing `close()` tests in both test files must continue to pass. Verify specifically that `close()` shuts down the server (existing test: 'close() shuts down the server').
- V8 [R1, R2]: Verify the 400 response for 'No active SSE connection' is removed from both files. Run: `grep 'No active SSE connection' packages/plugins/claude-code/src/babysitter.ts packages/plugins/claude-code/src/mcp-server.ts` — must return no matches.

## Test Cases

### babysitter.test.ts — new test in `createProxyMcpHttpServer()` describe block

**MCP client can connect and list tools immediately after SSE connection:**
- Register 2 test tools (e.g. `writ-list` and `signal`) in the proxy server.
- Start a mock guild HTTP server (using existing `startMockServer` helper) to handle proxied tool calls.
- Create an MCP `Client` and `SSEClientTransport` pointing at the proxy server's URL.
- Call `await client.connect(transport)` (performs SSE connection + MCP initialize handshake).
- Call `await client.listTools()` immediately after connect.
- Assert the result contains exactly 2 tools with the correct names.
- Close the client transport and the proxy server handle in `afterEach`.

This exercises the full SSE→initialize→tools/list sequence that Claude performs on session start.

### mcp-server.test.ts — new test in `startMcpHttpServer()` describe block

**MCP client can connect and list tools via SSE handshake:**
- Create 2 ToolDefinitions using the existing `makeTool` helper.
- Start the MCP HTTP server via `startMcpHttpServer(tools)`.
- Create an MCP `Client` and `SSEClientTransport` pointing at the server's URL.
- Call `await client.connect(transport)` then `await client.listTools()`.
- Assert the result contains the expected tools.
- Close the client transport and server handle in cleanup.

### Edge cases covered by existing tests (no new tests needed)

- **close() before SSE connection:** Existing test 'close() shuts down the server' in both files covers this. The promise-gate does not affect close() behavior when no SSE connection was established.
- **404 for unknown routes:** Existing test 'returns 404 for unknown routes' covers this. Unchanged.
- **Server starts on ephemeral port:** Existing test 'starts an HTTP server on an ephemeral port' covers this. Unchanged.