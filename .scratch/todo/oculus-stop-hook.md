# TODO — Oculus stop() hook for graceful daemon shutdown

## Context

The new `nsg start --foreground` daemon (nexus@e16cd02) installs SIGTERM/SIGINT handlers that gracefully tear down the Tool HTTP Server via `toolServer.close()`, but the Oculus has no documented stop hook. Today the daemon shutdown path leaves the Oculus HTTP server to be torn down by `process.exit(0)` — abrupt, possibly mid-request.

`OculusApi` exposes `port()` and `startServer()`, but no `stopServer()` or `close()`. The implementation in `packages/plugins/oculus/src/oculus.ts` holds a Hono server handle internally that could be closed.

## What needs to happen

1. Add `stopServer(): Promise<void>` to `OculusApi` in `packages/plugins/oculus/src/types.ts`.
2. Implement it in `oculus.ts` — close the Hono `Server` and clear the held reference. Idempotent (no-op if not started).
3. Update the inline `nsg oculus` tool's signal handler in `oculus.ts` to call `api.stopServer()` instead of just resolving the promise.
4. Update `nsg start`'s shutdown handler in `packages/framework/cli/src/commands/start.ts`:
   ```typescript
   try {
     const oculus = g.apparatus<OculusApiLike>('oculus');
     await oculus.stopServer();
   } catch { /* not installed or already stopped */ }
   ```
   And add `stopServer(): Promise<void>` to the local `OculusApiLike` shim.

## Tests

- Oculus: "stopServer() closes the listening socket and is idempotent"
- Oculus: "after stopServer() the previously bound port is reusable" (the strong signal that it actually closed)
- Daemon (when integration tests exist): "SIGTERM gracefully closes oculus before exit"

## Files

- `/workspace/nexus/packages/plugins/oculus/src/types.ts`
- `/workspace/nexus/packages/plugins/oculus/src/oculus.ts`
- `/workspace/nexus/packages/plugins/oculus/src/oculus.test.ts`
- `/workspace/nexus/packages/framework/cli/src/commands/start.ts` — TODO comment in `shutdown()` marks the spot
