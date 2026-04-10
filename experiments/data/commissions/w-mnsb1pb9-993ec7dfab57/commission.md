# Add `OculusApi.stopServer()` for graceful daemon shutdown

## Problem

The new `nsg start --foreground` daemon installs SIGTERM/SIGINT handlers and gracefully tears down the Tool HTTP Server via `toolServer.close()`, but the Oculus has no documented stop hook. Today the daemon shutdown path leaves the Oculus HTTP server to be torn down by `process.exit(0)` — abrupt, possibly mid-request.

`OculusApi` exposes `port()` and `startServer()`, but no `stopServer()` or `close()`. The implementation in `packages/plugins/oculus/src/oculus.ts` holds a Hono server handle internally that could be closed.

## Scope

1. Add `stopServer(): Promise<void>` to `OculusApi` in `packages/plugins/oculus/src/types.ts`.
2. Implement it in `oculus.ts` — close the Hono `Server` and clear the held reference. Idempotent (no-op if not started).
3. Update the inline `nsg oculus` tool's signal handler in `oculus.ts` to call `api.stopServer()` instead of just resolving the promise.
4. Update `nsg start`'s shutdown handler in `packages/framework/cli/src/commands/start.ts` to call `oculus.stopServer()`:
   ```typescript
   try {
     const oculus = g.apparatus<OculusApiLike>('oculus');
     await oculus.stopServer();
   } catch { /* not installed or already stopped */ }
   ```
   Add `stopServer(): Promise<void>` to the local `OculusApiLike` shim in `start.ts`.

## Tests

- Oculus: `stopServer()` closes the listening socket and is idempotent (calling twice does not throw).
- Oculus: after `stopServer()` the previously bound port is reusable. This is the strong signal that the socket actually released.
- `nsg oculus` tool: SIGTERM in foreground mode triggers `stopServer()` before exit (can be a unit test on the handler if extracted, or just verify the wiring).

## Files

- `/workspace/nexus/packages/plugins/oculus/src/types.ts`
- `/workspace/nexus/packages/plugins/oculus/src/oculus.ts`
- `/workspace/nexus/packages/plugins/oculus/src/oculus.test.ts`
- `/workspace/nexus/packages/framework/cli/src/commands/start.ts` — there's already a TODO comment in `shutdown()` marking the spot

## Out of scope

- Any changes to the Hono routing layer or page contributions.
- The full daemon end-to-end integration test that would exercise the SIGTERM-closes-oculus path is a separate parked TODO; do not pull it in here.