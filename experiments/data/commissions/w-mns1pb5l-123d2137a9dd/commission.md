## Context

The Detached Sessions architecture (see design doc in the sanctum at .scratch/detached-sessions-design.md) requires guild tools to be accessible over HTTP so that out-of-process session babysitters can proxy tool calls to the guild. Today, the Oculus has a tool→HTTP mapping pattern that exposes patron-callable tools as REST endpoints. This commission extracts and generalizes that pattern into the Instrumentarium as a first-class capability.

This is the foundation layer — the Session Babysitter (future commission) depends on this HTTP API to proxy tool calls from detached claude sessions back to the guild.

## What to Build

Add a Tool HTTP API server to the Instrumentarium apparatus (`packages/plugins/tools/`). The server:

1. **Serves all registered tools over HTTP.** Use the Oculus's existing mapping conventions:
   - `toolNameToRoute(name)` — tool name → HTTP route path (e.g., `writ-list` → `/api/writ/list`)
   - `permissionToMethod(permission)` — permission level → HTTP method (read→GET, write→POST, delete→DELETE)
   - Zod param validation on each request, tool handler execution, JSON response

2. **Serves all caller types.** Unlike the Oculus (which only registers patron-callable tools), this server registers tools for all `callableBy` values: patron, anima, and any future caller types. Every tool in the Instrumentarium should be reachable.

3. **Supports session-scoped authorization.** Requests from session babysitters include a session ID header (e.g., `X-Session-Id`). The server validates that the session is authorized to call the requested tool. Authorization data (session ID → allowed tool names) is maintained in an in-memory registry, populated via a registration API.

4. **Session registration API.** An HTTP endpoint (e.g., `POST /sessions`) that registers a session's authorized tool set. Called by the Animator at session dispatch time. Also an endpoint to deregister sessions on completion.

5. **Exposes a `startToolServer()` method on the InstrumentariumApi** so the guild can start the server programmatically:
   ```typescript
   interface InstrumentariumApi {
     // existing methods unchanged
     startToolServer(opts?: { port?: number }): Promise<ToolServerHandle>;
   }
   
   interface ToolServerHandle {
     port: number;
     url: string;
     close(): Promise<void>;
   }
   ```

6. **Well-known port.** Default port configurable via guild.json under `tools.serverPort` (e.g., 7471). The server binds to `127.0.0.1` by default.

## Relationship to Oculus

The Oculus currently implements its own tool→HTTP mapping (lines 317-384 in oculus.ts). After this commission, the Oculus should be refactored to delegate to the Instrumentarium's tool server rather than reimplementing the pattern. However, that refactoring is NOT part of this commission — keep the Oculus working as-is. The two can coexist temporarily.

The utility functions `toolNameToRoute()` and `permissionToMethod()` should move to the Instrumentarium (or a shared location) so both can use them. The Oculus can import them from the new location.

## Technical Notes

- Use Hono for the HTTP server (same as Oculus, already a dependency)
- The tool server should start when `startToolServer()` is called, not automatically at apparatus startup. The caller controls lifecycle.
- Session authorization is enforced on anima-callable tool routes. Patron-callable tools do not require session authorization (they're accessible to any authenticated caller). A request without a session ID header can still call patron tools.
- The Instrumentarium's `resolve()` method already handles permission-based tool filtering. Session registration stores the pre-resolved tool names (resolved by the Loom at dispatch time), so the server just checks membership, not re-resolves permissions.

## Test Expectations

- Tool route mapping (unit): tool names map to correct routes and methods
- Session registration and authorization (unit): registered sessions can call their tools, unregistered sessions are rejected
- HTTP server lifecycle (integration): start, serve requests, close cleanly
- Param validation (integration): invalid params return 400 with Zod error details
- Tool execution (integration): tool handlers are called with validated params, results returned as JSON