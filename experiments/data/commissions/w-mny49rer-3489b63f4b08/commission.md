# Engine-level MCP tool precondition checks

Design and implement a mechanism by which agent-backed engines declare the MCP tools their session requires, and the runtime verifies those tools are actually reachable before launching the session. Engines whose preconditions fail should refuse to start (transition directly `pending → failed` with a distinct precondition-failure reason) rather than spawning a session that will silently no-op its writes and still exit 0.

## Background

On 2026-04-14, the astrolabe reader stage on `rig-mnxy3qqq-4de722e1` ran a session for ~7.5 minutes against a dead guild daemon. Every `inventory-write` MCP call returned HTTP 500 because the guild daemon's PID was stale. The model diagnosed its own failure correctly in its output prose, produced a complete inventory as text in the final assistant message, and **exited 0 with status `completed`.** Downstream `inventory-check` then failed because no inventory row existed, cascading cancellation through the rest of the rig. Cost: ~7.5 minutes of reader time, one stalled rig, and a manual DB patch to recover.

The broader principle: an engine should only launch a session if the work the session is meant to do is *possible*. If a required tool's backing service is known-unreachable, don't burn tokens — fail fast.

## Deliverables

### 1. Engine-level `requiredMcpTools` declaration

Extend the engine design type to support an optional `requiredMcpTools?: string[]` field listing MCP tool names (e.g., `['inventory-write', 'plan-show']`) that the engine's session depends on. Engines that don't declare anything keep today's behavior (no precondition check).

Apply the declaration to the astrolabe anima-session engines (`reader`, `analyst`, `spec-writer` in the `planning` template, and their equivalents in `planning-ssr` and `planning-mra`). Use the set of MCP tools the engines currently call in their prompts as the declared set.

### 2. Precondition check in the engine-launch path

Before summoning a session, the runtime verifies:

1. **Plugin registration**: each declared tool is registered by some plugin in the current guild.
2. **Backing-service reachability**: for tools whose plugin opts in, a lightweight health probe confirms the service behind the tool is responsive. Concretely, for MCP tools served by the guild HTTP API, probe a cheap endpoint (e.g., `/healthz` or an equivalent the clerk apparatus already exposes).

Plugins opt into reachability probes via a new optional hook on their contribution (e.g., `mcpToolHealth: async (toolName) => boolean`). Plugins that don't implement the hook get only the registration check — no reachability probe. Astrolabe's clerk-backed tools (`inventory-write`, `plan-show`, etc.) should implement the hook so today's incident would have been caught.

Where the check runs: in the engine runner, before `design.run()` is called. Precondition failure transitions the engine directly from `pending` to `failed` with `error: 'precondition-failed: <tool> unreachable'`. No animator session is created. No tokens are burned.

### 3. Distinct failure signal (optional but recommended)

Consider adding a dedicated engine failure reason code (e.g., `precondition-failed`) distinct from generic `failed`, so operational dashboards and cost-tracking aggregates can filter these out. If the existing failure path can carry a structured reason, use that; if not, prefer a string prefix convention (`error: 'precondition-failed: ...'`) over schema changes.

### 4. Tests

- Unit tests for the precondition check: declared tool registered + reachable → check passes; declared tool missing → check fails with registration error; declared tool registered but unreachable → check fails with reachability error.
- An integration test that registers an engine with `requiredMcpTools`, stops the backing service, tries to run the engine, and asserts the engine transitions to `failed` with a precondition error — and that no animator session record is created.
- Astrolabe engine tests updated to confirm the declared tools match the tools actually referenced in each engine's prompt.

## Constraints

- **Do not modify existing engine prompts** beyond adding the declaration. The behavior change is entirely in the runner, not in the model's instructions.
- The check must be cheap enough to run on every session start without meaningfully affecting latency. A 100ms budget for the total probe set is a reasonable target.
- The `mcpToolHealth` hook is optional; plugins that don't implement it must not fail precondition checks by default.
- Don't introduce a new dependency on a global "daemon alive" check — the probe must be keyed to specific tools, not a global health gate.

## Success criteria

1. An engine declaring `requiredMcpTools` with a known-unreachable tool refuses to start and transitions to `failed` without launching a session.
2. Replaying the 2026-04-14 reader failure shape (dead guild daemon) against an astrolabe reader engine with the declaration in place produces a fast, clean precondition failure — zero tokens burned, zero session spawned.
3. All existing astrolabe tests pass unchanged.
4. New unit and integration tests for the precondition check pass.
5. Commit message documents the declaration format, probe design, and which plugins implement the health hook.

## Out of scope

- Broader precondition types (filesystem paths, env vars, upstream artifact presence) — this ships MCP reachability only. Other precondition classes can layer on later.
- Post-hoc tool-call trace verification — that's a separate quest (`w-mnt3r8al`) and the two defenses compose.
- Salvaging prose outputs from failed sessions into structured artifacts — noted in the source quest as adjacent but explicitly out of scope here.
- Changes to the guild daemon's own liveness/stale-PID detection — orthogonal concern.

## Reference

- Source quest: `w-mny2ltvy-e7016f61f768` — MCP tool preconditions.
- Sibling quest: `w-mnt3r8al-b36b42b253b2` — tool-call trace-based completion check (post-hoc defense).
- Incident evidence: `rig-mnxy3qqq-4de722e1`, session `ses-mnxy3rbw-fa6db8ac`.
- `packages/plugins/claude-code/src/babysitter.ts` — current MCP handshake location.
- `packages/plugins/claude-code/src/mcp-server.ts` — current `tools/list` source.