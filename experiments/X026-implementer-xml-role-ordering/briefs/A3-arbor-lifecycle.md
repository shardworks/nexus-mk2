# Add `shutdown()` lifecycle to Arbor

## Intent

Add a symmetric teardown path to the framework: a `shutdown()` method on the Guild instance returned by `createGuild()` that invokes every started apparatus's optional `stop()` in reverse topological order. Wire the long-lived daemons (`nsg start --foreground`, `nsg clock start --foreground`) and one-shot CLI helpers to call it, and reconcile the architecture docs that already promise this contract.

## Rationale

The `Apparatus.stop()` hook has been part of the contract for some time, yet Arbor never invokes it. Stacks declares a real `stop()` (closes the sqlite handle); Oculus declares one (closes the HTTP server); Clockworks declares a no-op placeholder explicitly waiting on this work. Daemons today rely on OS-level process exit to release handles, which works but leaks the abstraction and means apparatus authors who add cleanup logic have no guarantee it will run. The forcing function is a forthcoming long-lived Clockworks daemon that needs real teardown — landing the lifecycle plumbing now means that work, and every subsequent apparatus needing real shutdown, lands cleanly against an established contract.

## Scope & Blast Radius

This change spans three layers:

- **Framework core (`@shardworks/nexus-core`)** — the public `Guild` interface stays unchanged. A new `StartedGuild` type extends `Guild` with a required `shutdown()` method; `createGuild()` returns this richer type. The Guild JSDoc is reconciled with the new contract (in particular, the `clearGuild()` JSDoc that today claims it is "called by Arbor at shutdown" must finally describe a real flow).
- **Arbor (`@shardworks/nexus-arbor`)** — `createGuild()` builds an instance carrying `shutdown()`. The reverse-topo iteration, error-collection, and event-firing logic is extracted into the existing pure `guild-lifecycle.ts` helper module, matching that file's stated convention. A new `guild:shutdown` lifecycle event is fired before any `stop()` runs.
- **Daemon and CLI callers** — the SIGTERM/SIGINT handlers in the guild daemon (`packages/framework/cli/src/commands/start.ts`) and the Clockworks daemon (`packages/plugins/clockworks/src/daemon.ts`) call `await guildInstance.shutdown()` and then `process.exit(0)`. The one-shot helper `bootstrapEmitToolEvent` (and any sibling helpers carrying the same TODO) calls `shutdown()` after its work.

Cross-cutting concerns the implementer must verify independently:

- **`Guild` interface stability.** Approximately 70 test fixtures hand-build `Guild` literals via `setGuild({...})`. The chosen design (a return-type-only `StartedGuild` extension) is intended to leave these fixtures untouched. Verify with a grep across `packages/` for `setGuild(` that no existing fixture has to grow a new field.
- **`createGuild()` return-value threading.** The daemon needs the `StartedGuild` reference to call `shutdown()`, but `program.ts` today discards `createGuild()`'s return value (`packages/framework/cli/src/program.ts:246`). Trace every code path that must propagate the started instance from `program.ts` into the daemon's signal handler.
- **Doc/code coherence.** `docs/architecture/plugins.md`, `docs/architecture/index.md`, `packages/framework/arbor/README.md`, and the JSDoc on `Guild` and `clearGuild()` already describe a shutdown contract that doesn't exist. Audit every doc surface for stale references — the implementation must match what the docs now say (and vice versa). The doc also documents `ctx.on("guild:shutdown", …)` as a real subscribable event; the implementation must actually fire it.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Where does `shutdown()` live in the type system? | `started-extension` — `StartedGuild extends Guild { shutdown(): Promise<void> }`, returned by `createGuild()` | Plugin code has no legitimate reason to call shutdown; the type system enforces that. Avoids churn across ~70 test fixtures. |
| D2 | What order does `shutdown()` invoke `stop()`? | `reverse-topo` — iterate `startedApparatuses` in reverse | Dependents stop before dependencies (Oculus closes its HTTP server before Stacks closes the sqlite handle that route handlers might query). |
| D3 | How does `shutdown()` handle a `stop()` that throws? | `continue-collect` — catch each throw, continue iterating, surface a single aggregate error with all per-apparatus failures attached | Maximises released handles (the whole point); preserves fail-loud behavior for the daemon's signal handler and test assertions. Mirrors the codebase's existing `validateRequires` "collect failures, then act" pattern. |
| D4 | Is `shutdown()` idempotent? | `idempotent` — second and subsequent calls return immediately via an internal `shuttingDown` flag | Aligns with sibling patterns (`Oculus.stopServer`, Clockworks `triggerShutdown`). Daemons can drop their own guards. The boolean belongs in the framework, not on every caller. |
| D5 | Does `shutdown()` fire lifecycle events? | `guild-shutdown-only` — fire one `guild:shutdown` event before iterating stops | `docs/architecture/plugins.md:482` already promises `guild:shutdown`; implementing it retires that discrepancy. Per-apparatus `apparatus:stopped` / `phase:stopped` are speculative until something subscribes. |
| D6 | Does `shutdown()` automatically call `clearGuild()`? | `auto-clear` — `shutdown()` calls `clearGuild()` as its last act | Matches the existing `clearGuild()` JSDoc. Post-shutdown access via `guild()` fails loudly with the existing "Guild not initialized" error rather than handing out stale references to apparatus whose handles are gone. |
| D7 | What happens to the daemon's existing ad-hoc teardown? | `shutdown-plus-handle` — keep the explicit `toolServer.close()` (the daemon owns the handle returned by `tools.startToolServer()`), drop the redundant `oculus.stopServer()` (covered by Oculus's `stop()`), then call `await guildInstance.shutdown()` | The tool server handle is genuinely owned by the daemon caller, not the apparatus. Honoring that ownership avoids expanding scope into an Instrumentarium refactor. |
| D8 | Where does the daemon get its `StartedGuild` reference? | `thread-from-program` — `program.ts` keeps the `createGuild()` return value and threads it through to the start tool's handler (and any other tool that needs it) | Explicit threading matches the singleton-of-singletons design. No new Arbor module state. Matches the brief's `guildInstance.shutdown()` wording. |
| D9 | Does `shutdown()` invoke `stop()` on apparatus that *failed* to start? | `started-only` — iterate only `startedApparatuses` | Symmetric with start's invariant: `stop()` runs only for apparatus whose `start()` resolved. Avoids calling `stop()` on objects that never initialised internal state. |
| D10 | Where does the reverse-topo iteration logic live? | `extract-pure-helper` — into `guild-lifecycle.ts` as a pure helper alongside `topoSort` and friends; `arbor.ts` orchestrates I/O and calls the helper | Matches `arbor.ts`'s stated convention (pure logic in `guild-lifecycle.ts`, I/O orchestration in `arbor.ts`). Synthetic fixtures in `guild-lifecycle.test.ts` give faster, more focused error-policy and ordering tests. |
| D11 | Should existing per-apparatus `stop()` tests migrate to use `shutdown()`? | `leave-direct-add-arbor` — leave per-apparatus tests alone (they test the hook contract directly); additionally add at least one integration test in `arbor.test.ts` that proves Stacks's backend is closed via the shutdown path | Per-apparatus tests have a separate purpose. The Arbor test pins the orchestration. Both stay; no churn. |
| D12 | Which doc surfaces are updated? | `all-of-them` — `docs/architecture/plugins.md`, `docs/architecture/index.md`, `packages/framework/arbor/README.md`, the Guild and `clearGuild()` JSDoc, and the inline TODO in `plugin-bootstrap-emit.ts` | Every listed surface already references the missing contract. Landing the implementation without updating them rotates the discrepancy from "no implementation" to "docs underspecify the implementation that exists." |
| D13 | Does the daemon signal handler still call `process.exit(0)`? | `explicit-exit` — keep `process.exit(0)` after `await shutdown()` | The spider crawl loop and other in-flight timers may keep the event loop alive even after apparatus stops. Matches today's daemon behavior; avoids hangs from non-`unref()`'d timers. |
| D14 | Is `shutdown()` exposed as a standalone Arbor export, or only as a method? | `method-only` — only `guildInstance.shutdown()` | Brief-aligned. One way to do it. Free-function symmetry can be added later if a second consumer asks. |

## Acceptance Signal

- `pnpm -w typecheck` and `pnpm -w test` pass with the new contract in place across all packages.
- New tests in `packages/framework/arbor/src/guild-lifecycle.test.ts` demonstrate, against synthetic apparatus fixtures: (a) reverse-topo invocation order across a multi-apparatus dependency chain, (b) idempotency under double-call, (c) error containment — every apparatus's `stop()` is attempted even when an earlier one throws, with errors surfaced as a single aggregate, (d) apparatus that omit `stop()` are skipped silently, (e) apparatus that failed to `start()` are not stopped, (f) the `guild:shutdown` event fires before any `stop()` runs.
- A new integration test in `packages/framework/arbor/src/arbor.test.ts` proves Stacks's sqlite backend is actually closed via the shutdown path (the close call must be observable from the test fixture).
- After a SIGTERM to `nsg start --foreground`, the daemon's signal handler invokes `guildInstance.shutdown()`, the apparatus stops complete, and the process exits 0. Running `grep -r "stopGuild" packages/` returns no remaining TODO references.
- After a SIGTERM to `nsg clock start --foreground`, the daemon's shutdown path calls `guildInstance.shutdown()` and exits 0.
- Doc surfaces are coherent: `docs/architecture/plugins.md`, `docs/architecture/index.md`, `packages/framework/arbor/README.md`, and the Guild interface JSDoc all describe the same `shutdown()` contract that the code implements. The `guild:shutdown` event referenced in `plugins.md` is now actually fired by the framework, not just documented.

## Existing Patterns

- **Topological start ordering** — `packages/framework/arbor/src/guild-lifecycle.ts` (the `topoSort` helper) and `packages/framework/arbor/src/arbor.ts` (the start loop populating `startedApparatuses` in topo order). The reverse-topo helper should sit alongside `topoSort` in `guild-lifecycle.ts`.
- **Pure-logic-vs-orchestration split** — `packages/framework/arbor/src/arbor.ts:17-19` documents the convention; `guild-lifecycle.ts` is the home for pure logic. Read `validateRequires` in that file for an example of the "collect failures, return aggregate" pattern that D3 mirrors.
- **Idempotent close pattern** — `Oculus.stopServer()` (`packages/plugins/oculus/src/oculus.ts:299-309`) and the Clockworks daemon's `triggerShutdown` (`packages/plugins/clockworks/src/daemon.ts:476-481`). Both demonstrate the "guard, await, no-op on second call" shape that D4 adopts.
- **Lifecycle event firing** — `fireEvent` in `guild-lifecycle.ts` is the existing mechanism Arbor uses to fire `apparatus:started` / `phase:started`. Use the same mechanism to fire `guild:shutdown`.
- **Existing `stop()` implementations** — Stacks (`packages/plugins/stacks/src/stacks.ts`), Oculus (`packages/plugins/oculus/src/oculus.ts`), and Clockworks (`packages/plugins/clockworks/src/clockworks.ts`) are the three apparatus that already declare `stop()`. Read them to understand what the contract looks like in practice; the third is a documented no-op placeholder explicitly waiting on this work.
- **Existing daemon SIGTERM handlers** — `packages/framework/cli/src/commands/start.ts` (the guild daemon's ad-hoc teardown) and `packages/plugins/clockworks/src/daemon.ts` (the Clockworks daemon's `triggerShutdown` deferred). Both are the call sites being refactored.

## What NOT To Do

- **Do not add `stop()` bodies to apparatus that don't already have one.** Spider, Animator, Loom, Tools (Instrumentarium), Lattice, Astrolabe, Reckoner, Clerk, Ratchet, Codexes, Fabricator, and Parlour declare `start` but not `stop`. The contract stays "optional, called if present." Per-apparatus teardown is each apparatus's own future work.
- **Do not migrate Instrumentarium to own its tool-server handle.** D7 explicitly keeps the daemon as the handle owner. The asymmetry is acknowledged; resist the refactor.
- **Do not rewrite existing per-apparatus `stop()` tests** in `oculus.test.ts`, `clockworks.test.ts`, or elsewhere. D11 keeps them as-is; new orchestration tests live in the Arbor test suite.
- **Do not add `apparatus:stopped` or `phase:stopped` lifecycle events.** D5 limits the event surface to `guild:shutdown`. More events can be added when an apparatus actually subscribes.
- **Do not add a free `shutdownGuild(g)` export from `@shardworks/nexus-arbor`.** D14 is method-only; symmetry with `createGuild()` is deferred until a second consumer asks for it.
- **Do not change `nsg stop` (the CLI command in `packages/framework/cli/src/commands/stop.ts`).** It still sends SIGTERM and waits. The behavior change is in the daemon's signal handler, not the stopper.
- **Do not extend `clearGuild()`'s behavior.** It still just clears the singleton. The new flow is that `shutdown()` calls it as its last act (D6); `clearGuild()` itself does not grow logic.
- **Do not change `Apparatus.stop`'s signature.** It stays optional, sync-or-async, no arguments.
- **Do not require the `Guild` interface to grow `shutdown()`.** D1 deliberately keeps `Guild` narrow and puts `shutdown()` on a `StartedGuild` extension so plugin code cannot reach it through the singleton.

<task-manifest>
  <task id="t1">
    <name>Introduce `StartedGuild` type and reconcile Guild JSDoc</name>
    <files>packages/framework/core/src/guild.ts and any barrel re-exports from `@shardworks/nexus-core`</files>
    <action>Define a `StartedGuild` type that extends `Guild` with a required `shutdown(): Promise&lt;void&gt;` method. Export it from the core package alongside `Guild`. Update the JSDoc on `Guild` and `clearGuild()` so they describe the actual contract — including the fact that `shutdown()` is the path that ultimately invokes `clearGuild()`. Do not modify the existing `Guild` interface members; this is purely additive.</action>
    <verify>pnpm -w typecheck</verify>
    <done>`StartedGuild` exists and is exported; `Guild` is unchanged; the JSDoc on `Guild`/`clearGuild()` no longer claims contracts that don't exist.</done>
  </task>

  <task id="t2">
    <name>Extract reverse-topo shutdown helper into `guild-lifecycle.ts` and add unit tests</name>
    <files>packages/framework/arbor/src/guild-lifecycle.ts, packages/framework/arbor/src/guild-lifecycle.test.ts</files>
    <action>Add a pure helper in `guild-lifecycle.ts` that, given the list of started apparatus and the event-handler map, walks the list in reverse, calls each apparatus's `stop()` (when present), collects errors instead of aborting on the first throw, and fires the `guild:shutdown` lifecycle event before any `stop()` runs. Mirror the file's existing "pure logic with synthetic fixtures" pattern (see `validateRequires`). Add `guild-lifecycle.test.ts` cases for: reverse-topo order, apparatus without `stop()` skipped, error from one apparatus does not skip later ones, aggregate error surfaced when one or more `stop()`s throw, `guild:shutdown` fires before any stop, no events fired when the started list is empty.</action>
    <verify>pnpm --filter @shardworks/nexus-arbor test</verify>
    <done>The pure helper exists and is exported from `guild-lifecycle.ts`; new unit tests cover ordering, idempotency-shape (helper is safe under double-call from a wrapping flag), error containment, optional-stop skipping, and event firing; the test file passes.</done>
  </task>

  <task id="t3">
    <name>Wire `shutdown()` into Arbor's `createGuild()` return value</name>
    <files>packages/framework/arbor/src/arbor.ts, packages/framework/arbor/src/arbor.test.ts, packages/framework/arbor/README.md</files>
    <action>Have `createGuild()` build a `StartedGuild` (the existing `guildInstance` plus `shutdown`). The `shutdown()` method must: guard against re-entry with an internal flag (D4 idempotent); call the pure helper from t2 against the closure's `startedApparatuses` and `eventHandlers`; call `clearGuild()` as the last act (D6 auto-clear); re-throw the aggregate error from the helper if one was produced (D3 fail-loud). Add an integration test in `arbor.test.ts` that boots a real Stacks-bearing guild, calls `shutdown()`, and asserts the sqlite backend was closed and `guild()` thereafter throws "Guild not initialized." Update `packages/framework/arbor/README.md`'s lifecycle enumeration to describe the symmetric shutdown path.</action>
    <verify>pnpm --filter @shardworks/nexus-arbor test &amp;&amp; pnpm -w typecheck</verify>
    <done>`createGuild()` returns a `StartedGuild`; `shutdown()` is idempotent, calls the helper, and clears the singleton; the integration test demonstrates Stacks's backend was closed; the Arbor README describes the shutdown step.</done>
  </task>

  <task id="t4">
    <name>Thread `StartedGuild` from `program.ts` and refactor the guild daemon's SIGTERM handler</name>
    <files>packages/framework/cli/src/program.ts, packages/framework/cli/src/commands/start.ts, related cli wiring that consumes the started guild</files>
    <action>Stop discarding `createGuild()`'s return value in `program.ts`. Thread the `StartedGuild` reference through to the `start` tool's handler so its SIGTERM/SIGINT path can reach `shutdown()`. In `start.ts`, replace the body of the existing signal handler with: keep the explicit `await toolServer.close()` (the daemon owns that handle — D7), drop the explicit `oculus.stopServer()` call (now covered by Oculus's apparatus `stop()`), then `await guildInstance.shutdown()`, then unlink the pidfile, then `process.exit(0)` (D13). Preserve the existing "first-signal-wins" guard or rely on `shutdown()`'s idempotency — pick whichever is cleaner once the framework guarantee exists.</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test</verify>
    <done>`program.ts` retains the started guild reference; `nsg start --foreground` uses `guildInstance.shutdown()` for teardown; the explicit `oculus.stopServer()` call is removed; the explicit `toolServer.close()` remains; `process.exit(0)` is called after shutdown resolves.</done>
  </task>

  <task id="t5">
    <name>Wire the Clockworks daemon's SIGTERM handler to call `shutdown()`</name>
    <files>packages/plugins/clockworks/src/daemon.ts</files>
    <action>The `runForegroundDaemon` path receives or can access the `StartedGuild` reference (via the same threading pattern from t4 — adjust the daemon's entrypoint signature if needed). When SIGTERM/SIGINT fires, after the existing `triggerShutdown` deferred resolves and the poll loop exits, call `await guildInstance.shutdown()` and then `process.exit(0)`. Preserve or remove the daemon's own `shuttingDown` guard depending on whether `shutdown()`'s idempotency makes it redundant.</action>
    <verify>pnpm --filter @shardworks/nexus-clockworks test &amp;&amp; pnpm -w typecheck</verify>
    <done>`nsg clock start --foreground`'s signal handler invokes `guildInstance.shutdown()` before exiting; the Clockworks daemon honors the same teardown contract as the guild daemon.</done>
  </task>

  <task id="t6">
    <name>Update one-shot CLI helpers to call `shutdown()`</name>
    <files>packages/framework/cli/src/commands/plugin-bootstrap-emit.ts and any sibling helpers carrying the same TODO (search for "stopGuild" across packages to find them)</files>
    <action>For each helper that today relies on process exit to release handles, capture the `StartedGuild` returned by `createGuild()`, do the helper's work, then `await guildInstance.shutdown()` before returning. Remove the inline TODO/comment that referenced the missing API. Verify with grep that no `stopGuild` references remain.</action>
    <verify>pnpm -w test &amp;&amp; grep -r "stopGuild" packages/ docs/ || true</verify>
    <done>One-shot helpers call `shutdown()` after their work; the "no sibling stopGuild API yet" TODO is gone from the codebase; grep finds no residual references.</done>
  </task>

  <task id="t7">
    <name>Reconcile the architecture docs with the new shutdown contract</name>
    <files>docs/architecture/plugins.md, docs/architecture/index.md (and any other doc surfaces that describe Arbor's lifecycle — audit by grepping for "shutdown", "guild:shutdown", and "stopGuild")</files>
    <action>Update the apparatus contract section in `plugins.md` to describe Arbor calling `stop()` in reverse-topo order via `guildInstance.shutdown()`, with the documented error policy (continue-collect, aggregate re-throw) and idempotency guarantee. Confirm the `ctx.on("guild:shutdown", ...)` reference points at a real fired event. Update `index.md`'s "Arbor's scope is deliberately narrow" sentence so the lifecycle description is no longer asymmetric (start-only). Make sure no doc surface still claims behavior the implementation does not provide.</action>
    <verify>grep -r "stopGuild\|guild:shutdown" docs/ packages/ &amp;&amp; pnpm -w build:docs 2&gt;/dev/null || true</verify>
    <done>Every architecture-doc surface that mentions shutdown describes the contract that t1–t6 actually implement; the `guild:shutdown` event reference is no longer aspirational.</done>
  </task>
</task-manifest>

