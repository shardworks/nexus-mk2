# Cancellable Quick Engines

## Summary

Add the ability to cancel a running or blocked rig via a new `SpiderApi.cancel()` method and `rig-cancel` tool, with a Cancel button in the Oculus Spider engine detail panel. The cancellation cascades: the Animator session is killed, the triggering engine is marked `cancelled`, all pending/blocked downstream engines are cancelled, pending input requests are rejected, the rig transitions to a new `cancelled` status, and the CDC handler transitions the writ to `cancelled`.

## Current State

The Animator already supports session cancellation via `AnimatorApi.cancel(sessionId, options?)` and the `session-cancel` tool (`packages/plugins/animator/src/tools/session-cancel.ts`). This patches `SessionDoc.status` to `'cancelled'`, sends a kill signal to the provider process via `cancelMetadata`, and resolves the session result as cancelled.

The Spider has no mechanism to cancel a rig or engine. The `EngineStatus` type already includes `'cancelled'`, but it is only set as collateral damage when `failEngine()` cancels pending/blocked siblings of a failed engine. `RigStatus` has no `'cancelled'` variant — only `'running' | 'completed' | 'failed' | 'blocked'`.

The Spider's `tryCollect()` phase (spider.ts line 1247) checks for `session.status === 'failed' || session.status === 'timeout'` and routes those to `failEngine()`. All other terminal statuses — including `'cancelled'` — fall through to the completed-session path, which attempts to collect yields from a session that may have been interrupted mid-flight.

The Clerk already supports `active → cancelled` writ transitions via `ClerkApi.transition()`, and the `writ-cancel` tool exists.

The Oculus Spider dashboard (`packages/plugins/spider/src/static/spider.js`) renders an engine detail panel when a pipeline node is clicked, showing status, timestamps, session log via SSE, and cost data. There is no cancel button. The `badgeClass()` function maps `'cancelled'` to the empty string (plain grey badge, same as `'pending'`). The rig list status filter dropdown has options for running, completed, failed, and blocked — but not cancelled.

Key files and current signatures:

```typescript
// packages/plugins/spider/src/types.ts
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'skipped';
export type RigStatus = 'running' | 'completed' | 'failed' | 'blocked';

export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'engine-skipped'; rigId: string; engineId: string; cascadeSkipped?: string[] }
  | { action: 'engine-grafted'; rigId: string; engineId: string; graftedEngineIds: string[] }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
  | { action: 'rig-blocked'; rigId: string; writId: string };

export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
  show(id: string): Promise<RigDoc>;
  list(filters?: RigFilters): Promise<RigDoc[]>;
  forWrit(writId: string): Promise<RigDoc | null>;
  resume(rigId: string, engineId: string): Promise<void>;
  getBlockType(id: string): BlockType | undefined;
  listBlockTypes(): BlockTypeInfo[];
  listTemplates(): RigTemplateInfo[];
  listTemplateMappings(): Record<string, string>;
}
```

```typescript
// packages/plugins/spider/src/spider.ts (line 1204)
async function failEngine(
  rig: RigDoc,
  engineId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();
  const updatedEngines = rig.engines.map((e) => {
    if (e.id === engineId) {
      return { ...e, status: 'failed' as const, error: errorMessage, completedAt: now };
    }
    if (e.status === 'pending' || e.status === 'blocked') {
      return { ...e, status: 'cancelled' as const, block: undefined };
    }
    return e;
  });
  await rigsBook.patch(rig.id, {
    engines: updatedEngines,
    status: 'failed',
  });
}
```

## Requirements

- R1: The `RigStatus` type must include `'cancelled'` as a valid status, producing: `'running' | 'completed' | 'failed' | 'cancelled' | 'blocked'`.
- R2: The `CrawlResult` `rig-completed` variant's `outcome` discriminator must include `'cancelled'`, producing: `outcome: 'completed' | 'failed' | 'cancelled'`.
- R3: `SpiderApi` must expose a `cancel(rigId: string, options?: { reason?: string }): Promise<RigDoc>` method that cancels a rig in `'running'` or `'blocked'` status.
- R4: When `SpiderApi.cancel()` is called on a rig with a running engine that has a `sessionId`, the system must call `AnimatorApi.cancel()` for that session before updating rig state.
- R5: When `SpiderApi.cancel()` is called, the active engine (running or blocked) must be set to `status: 'cancelled'` with its `completedAt` timestamp set and the optional reason stored in the `error` field.
- R6: When `SpiderApi.cancel()` is called, all engines in `'pending'` or `'blocked'` status must be set to `status: 'cancelled'` with their `block` records cleared.
- R7: When `SpiderApi.cancel()` is called, the rig status must transition to `'cancelled'`.
- R8: When `SpiderApi.cancel()` is called on a rig that has pending `InputRequestDoc` entries (status `'pending'`), those documents must be patched to `status: 'rejected'` with `rejectionReason: 'Rig cancelled'`.
- R9: When `SpiderApi.cancel()` is called on a rig that is already in a terminal status (`'completed'`, `'failed'`, or `'cancelled'`), the method must return the existing rig document without modification (idempotent for terminal rigs).
- R10: A `rig-cancel` tool must be registered with `name: 'rig-cancel'`, `permission: 'spider:write'`, accepting `rigId: string` and optional `reason: string` parameters, delegating to `SpiderApi.cancel()`.
- R11: The Spider's `tryCollect()` must explicitly handle `session.status === 'cancelled'` by calling `cancelEngine()` on the engine and returning `{ action: 'rig-completed', outcome: 'cancelled' }`.
- R12: The CDC handler on the `spider/rigs` book must handle `rig.status === 'cancelled'` by calling `clerk.transition(rig.writId, 'cancelled', { resolution })`, where resolution is the cancelled engine's error message or `'Rig cancelled'`.
- R13: The Oculus Spider engine detail panel must display a Cancel button when the currently selected engine has `status === 'running'` and a `sessionId`, or when the rig has `status === 'running'` or `'blocked'`.
- R14: The Cancel button must call `DELETE /api/rig/cancel` with the current rig's ID, and on success must re-fetch the rig and re-render the detail view.
- R15: The `badgeClass()` function in `spider.js` must return a distinct class for `'cancelled'` status that visually differentiates it from `'pending'`.
- R16: The rig list status filter dropdown must include a `'cancelled'` option.

## Design

### Type Changes

```typescript
// packages/plugins/spider/src/types.ts

// Changed: add 'cancelled'
export type RigStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';

// Changed: widen outcome discriminator
export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'engine-skipped'; rigId: string; engineId: string; cascadeSkipped?: string[] }
  | { action: 'engine-grafted'; rigId: string; engineId: string; graftedEngineIds: string[] }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' | 'cancelled' }
  | { action: 'rig-blocked'; rigId: string; writId: string };

// Changed: add cancel() method
export interface SpiderApi {
  crawl(): Promise<CrawlResult | null>;
  show(id: string): Promise<RigDoc>;
  list(filters?: RigFilters): Promise<RigDoc[]>;
  forWrit(writId: string): Promise<RigDoc | null>;
  resume(rigId: string, engineId: string): Promise<void>;

  /**
   * Cancel a running or blocked rig. Cancels the active session (if any),
   * marks all non-terminal engines as cancelled, rejects pending input
   * requests, and transitions the rig to cancelled status.
   *
   * Idempotent: returns the rig unchanged if it is already in a terminal state.
   * Throws if the rig is not found.
   */
  cancel(rigId: string, options?: { reason?: string }): Promise<RigDoc>;

  getBlockType(id: string): BlockType | undefined;
  listBlockTypes(): BlockTypeInfo[];
  listTemplates(): RigTemplateInfo[];
  listTemplateMappings(): Record<string, string>;
}
```

### Behavior

#### `cancelEngine()` — new internal function (spider.ts)

Parallel to `failEngine()`. Structurally similar but uses `'cancelled'` status for both the triggering engine and the rig.

When called with `(rig, engineId, reason?)`:

1. Build updated engines array:
   - The engine matching `engineId`: set `status: 'cancelled'`, `completedAt: now`, `error: reason ?? undefined`, `block: undefined`.
   - Any engine with `status === 'pending'` or `status === 'blocked'`: set `status: 'cancelled'`, `block: undefined`.
   - All other engines: unchanged.
2. Patch the rig: `{ engines: updatedEngines, status: 'cancelled' }`.

This function does NOT call `Animator.cancel()` — that is the caller's responsibility. This keeps `cancelEngine()` as a pure state-update function, symmetric with `failEngine()`.

#### `SpiderApi.cancel()` — new API method (spider.ts)

When called with `(rigId, options?)`:

1. Fetch the rig via `rigsBook.get(rigId)`. Throw if not found.
2. If `rig.status` is `'completed'`, `'failed'`, or `'cancelled'`: return the rig unchanged (idempotent).
3. Find the active engine to cancel:
   - First, look for an engine with `status === 'running'` and a `sessionId`. If found, call `animator.cancel(engine.sessionId, { reason: options?.reason })`. This is a best-effort call — errors are logged but not propagated (consistent with the Animator's own error-swallowing contract on cancel).
   - If no running-with-session engine exists, look for a `'running'` engine without a sessionId (clockwork engine mid-execution — unlikely but possible).
   - If no running engine exists (rig is blocked), look for a `'blocked'` engine.
   - The engine found becomes the `targetEngineId` for `cancelEngine()`. If multiple blocked engines exist, use the first one in array order.
4. Call `cancelEngine(rig, targetEngineId, options?.reason)`.
5. Reject pending input requests: query `inputRequestsBook.find({ where: [['rigId', '=', rigId], ['status', '=', 'pending']] })`. For each result, call `inputRequestsBook.patch(doc.id, { status: 'rejected', rejectionReason: 'Rig cancelled', updatedAt: now })`.
6. Re-fetch and return the updated rig from the book. Re-fetching ensures the caller sees the state after the CDC handler has fired.

**Race condition note:** Between step 1 and step 4, the crawl loop could concurrently complete or fail the engine. The `cancelEngine()` call will still write `'cancelled'` over whatever state the crawl loop set. This is acceptable — the patron's explicit cancel intent takes priority. If the rig has already reached a terminal state between the idempotency check (step 2) and the mutation (step 4), the re-fetched rig in step 6 will reflect the actual final state.

#### `tryCollect()` — new cancelled branch (spider.ts)

In the `tryCollect()` function, after the existing `if (session.status === 'failed' || session.status === 'timeout')` block and before the completed-session path, add:

```
if (session.status === 'cancelled') {
  await cancelEngine(rig, engine.id, session.error ?? 'Session cancelled');
  return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'cancelled' };
}
```

This handles the case where the Animator session was cancelled externally (e.g., via `session-cancel` tool directly) and the Spider's crawl loop discovers it. The crawl phase also needs to reject pending input requests for the rig, using the same query as `SpiderApi.cancel()` step 5.

#### CDC handler — cancelled rig mapping (spider.ts)

Add a new branch in the CDC handler after the `rig.status === 'failed'` branch:

```
} else if (rig.status === 'cancelled') {
  const cancelledEngine = rig.engines.find((e) => e.status === 'cancelled' && e.error);
  const resolution = cancelledEngine?.error ?? 'Rig cancelled';
  await clerk.transition(rig.writId, 'cancelled', { resolution });
}
```

The resolution is the reason from the cancelled engine's `error` field, or `'Rig cancelled'` as fallback. The `'blocked'` status comment should be updated to also note that `'cancelled'` is now handled.

#### `rig-cancel` tool — new file (packages/plugins/spider/src/tools/rig-cancel.ts)

```typescript
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'rig-cancel',
  description: 'Cancel a running or blocked rig',
  instructions:
    'Cancels the rig: kills the active session (if any), marks all non-terminal engines ' +
    'as cancelled, rejects pending input requests, and transitions the rig to cancelled. ' +
    'Idempotent — returns the rig unchanged if already in a terminal state.',
  params: {
    rigId: z.string().describe('The rig id to cancel.'),
    reason: z.string().optional().describe('Optional reason for cancellation.'),
  },
  permission: 'spider:write',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.cancel(params.rigId, params.reason ? { reason: params.reason } : undefined);
  },
});
```

#### Oculus Spider UI — Cancel button (spider.js)

In `showEngineDetail()`, immediately after setting `title.textContent`, before the `<dl>` field list, conditionally render a Cancel button:

When the engine has `status === 'running'` and a `sessionId`, OR when `currentRig.status === 'running'` or `currentRig.status === 'blocked'`:

```html
<button class="btn btn--danger" id="cancel-engine-btn">Cancel Rig</button>
```

Wire the click handler:

1. Disable the button and change text to `'Cancelling…'`.
2. Call `fetch('/api/rig/cancel', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rigId: currentRig.id }) })`.
3. On success: re-fetch the rig via `fetch('/api/rig/show?id=' + currentRig.id)`, update `currentRig`, call `renderPipeline(currentRig)`, and call `showEngineDetail()` for the same engine (which will now show cancelled status and no cancel button).
4. On error: re-enable the button, show error text briefly.

The button is NOT rendered when:
- The rig is already terminal (`completed`, `failed`, `cancelled`).
- The engine is in a terminal state and the rig is also terminal.

#### Oculus Spider UI — Badge styling (spider.js + spider.css)

In `badgeClass()`, add a case for `'cancelled'`:

```javascript
case 'cancelled': return 'badge--cancelled';
```

In `spider.css`, add:

```css
.badge--cancelled {
  opacity: 0.6;
  text-decoration: line-through;
}
```

This uses the default grey badge color but adds a visual strikethrough and reduced opacity, clearly distinguishing it from the `pending` badge (which is plain grey).

#### Oculus Spider UI — Status filter (index.html)

Add a new option to the `#status-filter` select element:

```html
<option value="cancelled">cancelled</option>
```

Insert it after the `blocked` option, as the last status before the closing `</select>`.

### Non-obvious Touchpoints

- **packages/plugins/spider/src/tools/index.ts** — Must add `export { default as rigCancelTool } from './rig-cancel.ts';` to the barrel re-export file.
- **packages/plugins/spider/src/spider.ts** (supportKit.tools array, ~line 1844) — Must add `rigCancelTool` to the tools array alongside the other imported tools. Also add the import at the top of the file.
- **packages/plugins/spider/src/spider.ts** (module-level imports) — Must import `AnimatorApi` from `@shardworks/animator-apparatus` (currently only `SessionDoc` is imported). The `cancel()` method needs the Animator API. Also need to import the input-requests book type (`InputRequestDoc`) from `./types.ts`.
- **packages/plugins/spider/src/spider.ts** (start function) — Must store a reference to the Animator API: `animator = g.apparatus<AnimatorApi>('animator')`. Currently the Spider only reads sessions via `stacks.readBook<SessionDoc>('animator', 'sessions')` — it does not hold a reference to the Animator apparatus itself. A module-level `let animator: AnimatorApi;` variable is needed, parallel to `let clerk: ClerkApi;`.
- **packages/plugins/spider/src/spider.ts** (start function) — Must get a writable reference to the input-requests book: `inputRequestsBook = stacks.book<InputRequestDoc>('spider', 'input-requests')`. Currently the Spider only has `rigsBook` as a writable book reference. The cancel flow needs to patch input request documents.

## Validation Checklist

- V1 [R1]: Run `grep "RigStatus" packages/plugins/spider/src/types.ts` and confirm the type includes `'cancelled'`.
- V2 [R2]: Run `grep "outcome" packages/plugins/spider/src/types.ts` and confirm the CrawlResult outcome union includes `'cancelled'`.
- V3 [R3, R9]: Write a test that calls `SpiderApi.cancel()` on a running rig and verify it returns a rig with `status: 'cancelled'`. Call it again on the same rig and verify it returns the same rig unchanged (idempotent).
- V4 [R4]: Write a test that creates a rig with a running engine that has a sessionId, call `SpiderApi.cancel()`, and verify that `AnimatorApi.cancel()` was called with the session ID.
- V5 [R5, R6]: After calling `SpiderApi.cancel()`, verify: the running/blocked engine has `status: 'cancelled'` and a `completedAt` timestamp; all previously pending/blocked engines have `status: 'cancelled'` and their block records are cleared; the reason string (if provided) is in the target engine's `error` field.
- V6 [R7]: After calling `SpiderApi.cancel()`, verify `rig.status === 'cancelled'`.
- V7 [R8]: Create a rig with a blocked engine on `patron-input` with a pending `InputRequestDoc`. Call `SpiderApi.cancel()`. Verify the InputRequestDoc now has `status: 'rejected'` and `rejectionReason: 'Rig cancelled'`.
- V8 [R10]: Verify `rigCancelTool.name === 'rig-cancel'`, `rigCancelTool.permission === 'spider:write'`, and that calling its handler delegates to `SpiderApi.cancel()`.
- V9 [R11]: Write a test where a session reaches `'cancelled'` status externally, then call `crawl()` and verify the engine is marked `'cancelled'` (not failed, not completed) and the crawl returns `{ action: 'rig-completed', outcome: 'cancelled' }`.
- V10 [R12]: Write a test that patches a rig to `'cancelled'` status and verify the CDC handler calls `clerk.transition(writId, 'cancelled', ...)`.
- V11 [R13, R14]: In the spider-ui tests, verify that `showEngineDetail()` renders a cancel button when engine status is `'running'` with a sessionId, and does NOT render one when engine status is `'completed'`.
- V12 [R15]: In spider.js, verify `badgeClass('cancelled')` returns `'badge--cancelled'` and verify `spider.css` contains the `.badge--cancelled` rule.
- V13 [R16]: Verify `index.html` contains `<option value="cancelled">cancelled</option>` in the status filter select.

## Test Cases

### Spider core (spider.test.ts)

1. **Cancel running rig — happy path**: Spawn a rig, advance one engine to running with a sessionId. Call `cancel(rigId)`. Expect: rig status `'cancelled'`, running engine status `'cancelled'` with `completedAt`, pending engines status `'cancelled'`, `Animator.cancel()` called with sessionId.

2. **Cancel running rig with reason**: Same as above but pass `{ reason: 'No longer needed' }`. Expect: cancelled engine's `error` field is `'No longer needed'`.

3. **Cancel blocked rig**: Create a rig with a blocked engine (e.g., `patron-input`). Call `cancel(rigId)`. Expect: rig status `'cancelled'`, blocked engine status `'cancelled'` with block cleared, pending engines cancelled.

4. **Cancel blocked rig with pending input request**: Create a rig with a blocked engine and a pending InputRequestDoc. Call `cancel(rigId)`. Expect: InputRequestDoc status `'rejected'`, rejectionReason `'Rig cancelled'`.

5. **Cancel idempotent on terminal rig**: Complete a rig normally. Call `cancel(rigId)`. Expect: rig returned unchanged, no state mutation.

6. **Cancel idempotent on already-cancelled rig**: Cancel a rig. Call `cancel(rigId)` again. Expect: rig returned unchanged.

7. **Cancel non-existent rig throws**: Call `cancel('rig-nonexistent')`. Expect: error thrown.

8. **tryCollect detects cancelled session**: Launch a quick engine, externally cancel its session via `Animator.cancel()`, then call `crawl()`. Expect: `{ action: 'rig-completed', outcome: 'cancelled' }`, engine status `'cancelled'`, rig status `'cancelled'`.

9. **tryCollect cancelled session rejects input requests**: Set up a rig with a running engine AND a blocked engine with a pending InputRequestDoc. Cancel the running session externally. Call `crawl()`. Expect: InputRequestDoc is rejected.

10. **CDC handler transitions writ to cancelled**: Patch rig status to `'cancelled'` with a cancelled engine that has an error message. Expect: `clerk.transition(writId, 'cancelled', { resolution: errorMessage })` is called.

11. **CDC handler cancelled without error message**: Patch rig status to `'cancelled'` with a cancelled engine that has no error. Expect: `clerk.transition(writId, 'cancelled', { resolution: 'Rig cancelled' })`.

### Tool tests (tools.test.ts)

12. **rig-cancel tool properties**: Verify `name`, `permission`, `params` schema (rigId required, reason optional).

13. **rig-cancel tool handler delegates**: Mock `SpiderApi.cancel()`, call the tool handler, verify delegation.

### UI tests (spider-ui.test.ts)

14. **Cancel button rendered for running engine with sessionId**: Call `showEngineDetail()` with a running engine that has a sessionId on a running rig. Expect: `#cancel-engine-btn` exists in the DOM.

15. **Cancel button NOT rendered for completed engine**: Call `showEngineDetail()` with a completed engine on a completed rig. Expect: `#cancel-engine-btn` does NOT exist.

16. **Cancel button rendered for blocked rig**: Call `showEngineDetail()` with a blocked engine on a blocked rig. Expect: `#cancel-engine-btn` exists.

17. **Badge class for cancelled**: Verify `badgeClass('cancelled')` returns `'badge--cancelled'`.

18. **Status filter includes cancelled**: Verify the `#status-filter` select element contains an option with value `'cancelled'`.
