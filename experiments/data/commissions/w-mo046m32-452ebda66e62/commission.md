# Detached Sessions Cleanup — Idempotency, Ordering, and Manifest Consolidation

## Summary

Harden the detached session lifecycle with three focused changes: make the `session-running` handler idempotent against duplicate and late ready reports, pin the DLQ-before-reconciler startup ordering with a test and comment, and consolidate the tool manifest computation into a single `computeToolManifest` function that applies `callableBy` filtering and infrastructure tool injection.

## Current State

### session-running handler (`packages/plugins/animator/src/tools/session-running.ts`)

The handler unconditionally merges the incoming payload and sets `status: 'running'` on every call. It does not check whether the session is already in a terminal state (`completed`, `failed`, `timeout`, `cancelled`) or already running. A late or duplicate ready report can regress a terminal session back to `running`.

Current handler (lines 39–68):
```ts
handler: async (params) => {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const sessions = stacks.book<SessionDoc>('animator', 'sessions');
  const existing = await sessions.get(params.sessionId);
  const doc: SessionDoc = {
    ...(existing ?? {}),
    id: params.sessionId,
    status: 'running',
    startedAt: existing?.startedAt ?? params.startedAt,
    provider: existing?.provider ?? params.provider,
    lastActivityAt: new Date().toISOString(),
    ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    ...(params.metadata ? { metadata: { ...(existing?.metadata ?? {}), ...params.metadata } } : {}),
    ...(params.cancelHandle
      ? { cancelHandle: { ...(existing?.cancelHandle ?? {}), ...params.cancelHandle } }
      : {}),
  };
  await sessions.put(doc);
  return { ok: true, sessionId: params.sessionId };
},
```

The sibling handlers (`session-record-handler.ts` line 39–55, `session-heartbeat.ts`) both implement terminal-state immutability using:
```ts
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);
if (currentDoc && TERMINAL_STATUSES.has(currentDoc.status)) {
  return { ok: true, sessionId: params.sessionId, status: currentDoc.status };
}
```

### DLQ drain and reconciler ordering (`packages/plugins/animator/src/animator.ts`)

In `start()` (lines 679–716), the startup sequence calls `drainDlq(g.home)` followed by `recoverOrphans(sessions, downtimeCredit)`. This ordering is load-bearing: DLQ files contain real terminal results that must be applied before the reconciler runs, otherwise the reconciler would incorrectly mark those sessions as failed due to staleness. The ordering has no inline comment explaining the invariant and no test pinning it.

### Tool manifest computation (`packages/plugins/claude-code/src/detached.ts`)

The tool manifest is computed in two separate, unsynchronized locations:

1. `buildBabysitterConfig` (line 174): `tools: serializeTools(config.tools ?? [])` — no `callableBy` filter.
2. `launchDetached` (lines 315–320): `authorizedTools` built by mapping tool names and appending infrastructure tools (`session-running`, `session-record`, `session-heartbeat`) — no `callableBy` filter.

Neither location filters tools by `callableBy`. The infrastructure tool names are hardcoded inline in `launchDetached`.

Key types:
```ts
// packages/plugins/tools/src/instrumentarium.ts
export interface ResolvedTool {
  definition: ToolDefinition;
  pluginId: string;
}

// packages/plugins/tools/src/tool.ts
export type ToolCaller = 'patron' | 'anima' | 'library';
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly callableBy?: ToolCaller[];
  readonly permission?: string;
  readonly params: z.ZodObject<any>;
  readonly handler: (params: any) => any;
  // ...
}

// packages/plugins/claude-code/src/babysitter.ts
export interface SerializedTool {
  name: string;
  description: string;
  params: Record<string, unknown>;
  method: 'GET' | 'POST' | 'DELETE';
}
```

## Requirements

- R1: When `session-running` is called for a session already in a terminal state (`completed`, `failed`, `timeout`, `cancelled`), the handler must not modify the `SessionDoc` and must return `{ ok: true, sessionId, status: currentDoc.status }`.
- R2: When `session-running` is called for a session already in `running` state, the handler must only update `lastActivityAt` (guild wall-clock) and `cancelHandle` (if present in payload), leaving all other existing fields untouched.
- R3: When `session-running` rejects a call due to terminal state, it must log a warning via `console.warn` including the session ID and current status.
- R4: The `session-running` handler's return type for the normal (pending→running) path remains `{ ok: true, sessionId }` (no `status` field) — unchanged from current behavior.
- R5: An inline comment must be added in `animator.ts` `start()` above the `drainDlq`/`recoverOrphans` calls explaining that DLQ drain must complete before orphan recovery runs, because DLQ files contain real terminal results that would otherwise be incorrectly marked as failed by the reconciler.
- R6: A test in `session-lifecycle.test.ts` must verify the DLQ-before-reconciler ordering invariant: seed a stale running session and a DLQ completed report for that session, call `drainDlq()` then `recoverOrphans()`, and assert the session status is `completed` (not `failed`).
- R7: A new exported function `computeToolManifest(tools)` in `detached.ts` must accept `ResolvedTool[] | undefined`, filter out tools whose `callableBy` is defined and does not include `'anima'`, and return `{ tools: ResolvedTool[], authorizedToolNames: string[] }` where `tools` is the filtered array and `authorizedToolNames` is the filtered tool names plus the infrastructure tool names.
- R8: The infrastructure tool names must be defined as a module-level constant `INFRASTRUCTURE_TOOLS = ['session-running', 'session-record', 'session-heartbeat']` in `detached.ts`.
- R9: Tools with no `callableBy` field (undefined) must pass the filter and be included in the manifest.
- R10: `buildBabysitterConfig` must use `computeToolManifest` to get the filtered `ResolvedTool[]` and then call `serializeTools` on that result, replacing the current unfiltered `serializeTools(config.tools ?? [])`.
- R11: `launchDetached` must use `computeToolManifest` to get `authorizedToolNames`, replacing the current inline construction of the `authorizedTools` array.
- R12: The non-infrastructure subset of `authorizedToolNames` (from `computeToolManifest`) must match the names derived from the tools in `BabysitterConfig.tools` exactly — same names, same order.

## Design

### S1: session-running handler idempotency

Modify the handler in `packages/plugins/animator/src/tools/session-running.ts` to add two checks after fetching the existing doc:

**Terminal-state guard:** After `const existing = await sessions.get(params.sessionId)`, check if the existing doc is in a terminal state. When it is, log a warning and return early:

```ts
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);
if (existing && TERMINAL_STATUSES.has(existing.status)) {
  console.warn(
    `[animator] Ignoring session-running for ${params.sessionId} (already ${existing.status})`,
  );
  return { ok: true, sessionId: params.sessionId, status: existing.status };
}
```

**Already-running guard:** When the existing doc has `status: 'running'`, perform a selective update — only refresh `lastActivityAt` and `cancelHandle` (if present in payload), then return without touching other fields:

```ts
if (existing && existing.status === 'running') {
  const update: SessionDoc = {
    ...existing,
    lastActivityAt: new Date().toISOString(),
    ...(params.cancelHandle
      ? { cancelHandle: { ...(existing.cancelHandle ?? {}), ...params.cancelHandle } }
      : {}),
  };
  await sessions.put(update);
  return { ok: true, sessionId: params.sessionId };
}
```

The remaining code (the current full-merge path) handles the normal `pending → running` transition and the cold-start case (no existing doc). This path is unchanged.

### Behavior

- When `existing` is `null` or `undefined`: full merge, set `status: 'running'`, write doc, return `{ ok: true, sessionId }`. (Unchanged — cold start.)
- When `existing.status` is `'pending'`: full merge, set `status: 'running'`, write doc, return `{ ok: true, sessionId }`. (Unchanged — normal flow.)
- When `existing.status` is `'running'`: selective update of `lastActivityAt` and `cancelHandle` only, return `{ ok: true, sessionId }`. (New — D2.)
- When `existing.status` is terminal: `console.warn`, return `{ ok: true, sessionId, status: existing.status }`, no write. (New — D1, D3.)

### S2: DLQ-before-reconciler ordering

**Comment:** Add an inline comment in `packages/plugins/animator/src/animator.ts` `start()`, immediately above the IIFE at line 680, explaining the ordering invariant:

```ts
// IMPORTANT: DLQ drain MUST complete before orphan recovery.
// DLQ files contain real terminal results from babysitters that couldn't
// reach the guild. If the reconciler runs first, it sees those sessions as
// stale (no recent heartbeat) and marks them failed — losing the real result.
// drainDlq() applies the correct terminal status; recoverOrphans() then
// correctly skips them as already-terminal.
```

**Test:** Add a new `describe` block in `packages/plugins/animator/src/tools/session-lifecycle.test.ts` titled `'DLQ-before-reconciler ordering'`. The test:

1. Seeds a running session with a stale `lastActivityAt` (120s ago).
2. Writes a DLQ file for that session with `status: 'completed'`.
3. Calls `await drainDlq(tmpDir)`.
4. Calls `await recoverOrphans(sessions, 0)`.
5. Asserts the session status is `'completed'` (DLQ result won, not `'failed'` from reconciler).

Also add a complementary assertion: `recoverOrphans` should return `0` (no sessions recovered), proving it correctly skipped the now-terminal session.

### S3: Tool manifest consolidation

**New constant and function in `packages/plugins/claude-code/src/detached.ts`:**

```ts
/** Infrastructure tools added to every detached session's authorized set. */
const INFRASTRUCTURE_TOOLS: readonly string[] = [
  'session-running',
  'session-record',
  'session-heartbeat',
];

/**
 * Compute the tool manifest for a detached session.
 *
 * Filters the resolved tools by callableBy (only tools callable by 'anima'
 * or unrestricted tools pass), then builds the authorized tool names list
 * by appending infrastructure tool names.
 *
 * Returns:
 * - tools: the filtered ResolvedTool[] (for serialization into BabysitterConfig)
 * - authorizedToolNames: filtered tool names + infrastructure tool names (for SessionDoc)
 */
export function computeToolManifest(
  tools: ResolvedTool[] | undefined,
): { tools: ResolvedTool[]; authorizedToolNames: string[] } {
  const input = tools ?? [];
  const filtered = input.filter(
    (rt) => !rt.definition.callableBy || rt.definition.callableBy.includes('anima'),
  );
  const authorizedToolNames = [
    ...filtered.map((rt) => rt.definition.name),
    ...INFRASTRUCTURE_TOOLS,
  ];
  return { tools: filtered, authorizedToolNames };
}
```

**Modify `buildBabysitterConfig`:** Replace line 174:
```ts
// Before:
tools: serializeTools(config.tools ?? []),

// After:
tools: serializeTools(computeToolManifest(config.tools).tools),
```

**Modify `launchDetached`:** Replace lines 315–320:
```ts
// Before:
const authorizedTools = [
  ...(config.tools?.map((rt) => rt.definition.name) ?? []),
  'session-running',
  'session-record',
  'session-heartbeat',
];

// After:
const { authorizedToolNames: authorizedTools } = computeToolManifest(config.tools);
```

**Both call sites now derive from `computeToolManifest`.** The `buildBabysitterConfig` call uses `.tools` (the filtered `ResolvedTool[]`), serializes them, and puts them in `BabysitterConfig.tools`. The `launchDetached` call uses `.authorizedToolNames` (filtered names + infrastructure) and puts them in `SessionDoc.authorizedTools`.

The non-infrastructure names in `authorizedToolNames` match the names in `BabysitterConfig.tools` by construction: both derive from the same `filtered` array, in the same order.

### Type Changes

No new TypeScript types or interfaces are added to the codebase. The `computeToolManifest` function's return type is an inline object type `{ tools: ResolvedTool[]; authorizedToolNames: string[] }`.

### Non-obvious Touchpoints

- `packages/plugins/claude-code/src/detached.test.ts`: The `makeResolvedTool` helper (lines 49–63) does not set `callableBy` on the definition. New tests for `computeToolManifest` that need `callableBy` must construct `ResolvedTool` objects directly or extend the helper. The `ToolDefinition` interface requires `name`, `description`, `params`, and `handler` — `callableBy` is optional.
- The existing test `'pre-writes pending record with lastActivityAt before spawning'` in `detached.test.ts` (line 696) asserts `pendingDoc.authorizedTools.includes('session-heartbeat')`. This test will continue to pass because `computeToolManifest` appends infrastructure tools including `session-heartbeat`.

### Dependencies

None. All three scope items are self-contained changes within the existing `animator` and `claude-code` packages.

## Validation Checklist

- V1 [R1, R3]: Seed a session with `status: 'completed'`, call `sessionRunning.handler(...)` with that session ID, verify the return value is `{ ok: true, sessionId, status: 'completed' }` and the doc in the book is unchanged (still `completed`). Repeat for `failed`, `timeout`, `cancelled`.
- V2 [R2]: Seed a session with `status: 'running'`, specific `metadata`, `startedAt`, and `provider` values, and a known `lastActivityAt`. Call `sessionRunning.handler(...)` with a `cancelHandle` and different `metadata`/`startedAt`/`provider`. Verify `lastActivityAt` changed (refreshed to guild wall-clock), `cancelHandle` updated, but `metadata`, `startedAt`, and `provider` are unchanged from the seeded values.
- V3 [R4]: Call `sessionRunning.handler(...)` for a new session (no existing doc). Verify return value is `{ ok: true, sessionId }` (no `status` field). Verify the doc was written with `status: 'running'`.
- V4 [R5]: Read `packages/plugins/animator/src/animator.ts` and verify an inline comment exists above the `drainDlq`/`recoverOrphans` calls in `start()` explaining the ordering invariant.
- V5 [R6]: Run the DLQ-before-reconciler ordering test: `node --test --test-name-pattern='DLQ-before-reconciler' packages/plugins/animator/src/tools/session-lifecycle.test.ts`. Verify it passes.
- V6 [R7, R8, R9]: Call `computeToolManifest` with a mix of tools: one with `callableBy: ['anima']`, one with `callableBy: ['patron']`, one with no `callableBy`. Verify the result's `tools` includes the anima-callable and unrestricted tools but not the patron-only tool. Verify `authorizedToolNames` includes those tool names plus `'session-running'`, `'session-record'`, `'session-heartbeat'`.
- V7 [R10]: Call `buildBabysitterConfig` with a tool that has `callableBy: ['patron']`. Verify the resulting `BabysitterConfig.tools` does NOT contain that tool's name.
- V8 [R11]: Call `launchDetached` (via the existing test harness) with tools including a patron-only tool. Verify the pre-written `SessionDoc.authorizedTools` does NOT include the patron-only tool name but DOES include infrastructure tools.
- V9 [R12]: Call `computeToolManifest` with a list of tools. Extract the non-infrastructure names from `authorizedToolNames` (filter out the three infrastructure names). Serialize the returned `tools` via `serializeTools` and extract their names. Assert the two name lists are identical in content and order.

## Test Cases

### session-running idempotency (in `session-lifecycle.test.ts`, inside existing `'session-running tool'` describe block)

1. **Already-running session refreshes lastActivityAt and cancelHandle only:**
   - Seed: `sessions.put({ id: 'ses-idem-001', status: 'running', startedAt: '2026-04-01T10:00:00Z', provider: 'claude-code', lastActivityAt: '2026-04-01T10:00:00Z', metadata: { writId: 'wrt-orig' } })`
   - Call: `sessionRunning.handler({ sessionId: 'ses-idem-001', startedAt: '2026-04-01T11:00:00Z', provider: 'other-provider', metadata: { writId: 'wrt-new' }, cancelHandle: { kind: 'local-pgid', pgid: 55555 } })`
   - Assert: return value is `{ ok: true, sessionId: 'ses-idem-001' }` (no status field)
   - Assert: `doc.lastActivityAt` is different from `'2026-04-01T10:00:00Z'` (refreshed)
   - Assert: `doc.cancelHandle` is `{ kind: 'local-pgid', pgid: 55555 }`
   - Assert: `doc.metadata` is `{ writId: 'wrt-orig' }` (NOT overwritten)
   - Assert: `doc.startedAt` is `'2026-04-01T10:00:00Z'` (NOT overwritten)
   - Assert: `doc.provider` is `'claude-code'` (NOT overwritten)

2. **Ready report against completed session does not regress state:**
   - Seed: `sessions.put({ id: 'ses-term-run-001', status: 'completed', startedAt: '2026-04-01T10:00:00Z', provider: 'claude-code', exitCode: 0 })`
   - Call: `sessionRunning.handler({ sessionId: 'ses-term-run-001', startedAt: '2026-04-01T10:00:00Z', provider: 'claude-code' })`
   - Assert: return value is `{ ok: true, sessionId: 'ses-term-run-001', status: 'completed' }`
   - Assert: `doc.status` is still `'completed'`

3. **Ready report against failed session does not regress state:**
   - Same pattern as (2) with `status: 'failed'`, `exitCode: 1`, `error: 'reconciled'`
   - Assert return includes `status: 'failed'`, doc unchanged

4. **Ready report against cancelled session does not regress state:**
   - Same pattern with `status: 'cancelled'`, `error: 'User cancelled'`
   - Assert return includes `status: 'cancelled'`, doc unchanged

5. **Ready report against timeout session does not regress state:**
   - Same pattern with `status: 'timeout'`
   - Assert return includes `status: 'timeout'`, doc unchanged

### DLQ-before-reconciler ordering (new describe block in `session-lifecycle.test.ts`)

6. **DLQ drain result takes precedence over reconciler staleness detection:**
   - Seed: `sessions.put({ id: 'ses-order-001', status: 'running', startedAt: '2026-04-01T10:00:00Z', provider: 'claude-code', lastActivityAt: <120s ago> })`
   - Write DLQ file: `{ sessionId: 'ses-order-001', status: 'completed', exitCode: 0, costUsd: 1.23 }`
   - Call: `await drainDlq(tmpDir)` then `await recoverOrphans(sessions, 0)`
   - Assert: `doc.status === 'completed'` (not `'failed'`)
   - Assert: `doc.costUsd === 1.23` (DLQ payload applied)
   - Assert: `recoverOrphans` returned `0` (no sessions recovered)

### computeToolManifest (new describe block in `detached.test.ts`)

7. **Filters out tools not callable by anima:**
   - Input: tool with `callableBy: ['patron']`
   - Assert: not in `result.tools`, not in non-infrastructure portion of `result.authorizedToolNames`

8. **Includes tools callable by anima:**
   - Input: tool with `callableBy: ['anima']`
   - Assert: in `result.tools` and in `result.authorizedToolNames`

9. **Includes tools with no callableBy (unrestricted):**
   - Input: tool with no `callableBy` field
   - Assert: in `result.tools` and in `result.authorizedToolNames`

10. **Includes tools callable by multiple callers including anima:**
    - Input: tool with `callableBy: ['patron', 'anima']`
    - Assert: included in result

11. **Always appends infrastructure tool names to authorizedToolNames:**
    - Input: empty tools array
    - Assert: `result.authorizedToolNames` is `['session-running', 'session-record', 'session-heartbeat']`
    - Assert: `result.tools` is `[]`

12. **Handles undefined tools input:**
    - Input: `undefined`
    - Assert: `result.tools` is `[]`, `result.authorizedToolNames` is the three infrastructure tools

13. **Non-infrastructure authorizedToolNames match serialized tool names in order:**
    - Input: two anima-callable tools `['tool-a', 'tool-b']`
    - Assert: `result.authorizedToolNames` is `['tool-a', 'tool-b', 'session-running', 'session-record', 'session-heartbeat']`
    - Separately serialize `result.tools` via `serializeTools`, extract names
    - Assert: serialized names are `['tool-a', 'tool-b']` — matches the non-infrastructure prefix of `authorizedToolNames`

14. **buildBabysitterConfig filters tools via computeToolManifest:**
    - Input config with one anima-callable tool and one patron-only tool
    - Assert: `babysitterConfig.tools` contains only the anima-callable tool

15. **authorizedTools in pending doc excludes patron-only tools:**
    - Launch via `launchDetached` with one anima-callable tool and one patron-only tool
    - Assert: pre-written `SessionDoc.authorizedTools` does not include the patron-only tool name
    - Assert: `SessionDoc.authorizedTools` includes all three infrastructure tool names