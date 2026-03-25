# Event Catalog

The Clockworks event system — every framework event, custom event rules, and standing order wiring.

---

## Framework Events

Framework events are signaled by core modules and the Clockworks runner. They use reserved namespaces (`commission.`, `session.`, `work.`, `piece.`, `job.`, `stroke.`, `standing-order.`) and **cannot** be signaled by animas or operators.

### Commission Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `commission.posted` | `{ commissionId, workshop }` | `framework` | A new commission is posted via `commission()` |
| `commission.session.ended` | `{ commissionId, workshop?, exitCode }` | `framework` | A session launched for a commission completes (success or failure) |
| `commission.completed` | `{ commissionId }` | `framework` | `completeCommissionIfReady()` transitions status to `completed` |

**`commission.posted`** is the primary entry point for the commission pipeline. Standing orders typically wire this to summon an anima (e.g. `{ on: "commission.posted", summon: "artificer" }`).

**`commission.session.ended`** fires when any session associated with a commission finishes. Useful for post-session automation (merge worktrees, check completion, notify).

**`commission.completed`** fires when the auto-completion rollup determines all works are done. This is a terminal event — no further work expected.

### Session Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `session.started` | `{ sessionId, anima, trigger, workshop, workspaceKind }` | `framework` | A session begins (after Daybook row is inserted) |
| `session.ended` | `{ sessionId, anima, trigger, workshop, exitCode, durationMs, costUsd, error }` | `framework` | A session completes (even if the provider threw) |
| `session.record-failed` | `{ sessionId?, error, phase, anima? }` | `framework` | Failed to write session record to Daybook or disk |

**`session.ended`** fires **guaranteed** — the session funnel wraps the provider call in try/finally. The `error` field is non-null if the provider threw. The `costUsd` field may be null if the provider doesn't report cost.

**`session.record-failed`** is a diagnostic event. The `phase` field indicates where the failure occurred: `"insert"` (initial row), `"write-record"` (JSON to disk), or `"update-row"` (final metrics).

### Work Decomposition Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `work.created` | `{ workId, commissionId }` | `framework` | `createWork()` |
| `work.completed` | `{ workId }` | `framework` | `updateWork()` with status `"completed"` OR `completeWorkIfReady()` transitions |
| `piece.created` | `{ pieceId, workId }` | `framework` | `createPiece()` |
| `piece.ready` | `{ pieceId }` | `framework` | `updatePiece()` with status `"active"` |
| `piece.completed` | `{ pieceId }` | `framework` | `updatePiece()` with status `"completed"` OR `completePieceIfReady()` transitions |
| `job.created` | `{ jobId, pieceId }` | `framework` | `createJob()` |
| `job.ready` | `{ jobId }` | `framework` | `updateJob()` with status `"active"` |
| `job.completed` | `{ jobId }` | `framework` | `updateJob()` with status `"completed"` OR `completeJobIfReady()` transitions |
| `job.failed` | `{ jobId }` | `framework` | `updateJob()` with status `"failed"` OR `completeJobIfReady()` when any stroke failed |
| `stroke.recorded` | `{ strokeId, jobId }` | `framework` | `createStroke()` |

**`piece.ready`** and **`job.ready`** fire on status transition to `"active"`. These are the "work is available" signals — standing orders can wire them to summon animas for dispatch.

**Completion rollup pattern:** `session.ended` → engine calls `completeJobIfReady()` → if job completes, engine calls `completePieceIfReady()` → if piece completes, engine calls `completeWorkIfReady()` → and so on up the hierarchy.

### Clockworks Events

| Event | Payload | Emitter | When |
|-------|---------|---------|------|
| `standing-order.failed` | `{ standingOrder, triggeringEvent: { id, name }, error }` | `framework` | A standing order execution fails (engine throws or anima session fails) |

**Loop guard:** If a `standing-order.failed` event was itself triggered by another `standing-order.failed` event, the Clockworks runner skips processing to prevent infinite cascades.

### Reserved Namespaces

The following namespaces are reserved for framework events. Animas cannot signal events in these namespaces via the `signal` tool — `validateCustomEvent()` will throw.

```
anima.
commission.
work.
piece.
job.
stroke.
tool.
migration.
guild.
standing-order.
session.
```

---

## Custom Events

Custom events are declared in `guild.json` and can be signaled by animas (via the `signal` MCP tool) or by engines.

### Declaring Custom Events

Add events to `guild.json` under `clockworks.events`:

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "A code review has been completed",
        "schema": { "prUrl": "string", "approved": "boolean" }
      },
      "deploy.requested": {
        "description": "A deployment was requested"
      }
    }
  }
}
```

- `description` — human-readable purpose (optional but recommended)
- `schema` — payload schema hint (informational only, not enforced at runtime)

### Validation Rules

1. The event name must **not** start with a reserved namespace prefix
2. The event name **must** be declared in `guild.json` `clockworks.events`
3. Both rules are enforced by `validateCustomEvent()`, which is called by the `signal` MCP tool

### Signaling Custom Events

From an anima (via the `signal` tool):
```
signal code.reviewed { "prUrl": "https://...", "approved": true }
```

From an engine:
```typescript
import { signalEvent } from '@shardworks/nexus-core';
signalEvent(home, 'code.reviewed', { prUrl: '...', approved: true }, 'my-engine');
```

Framework events bypass `validateCustomEvent()` — they call `signalEvent()` directly.

---

## Standing Order Wiring

Standing orders connect events to actions. They are declared in `guild.json` under `clockworks.standingOrders`.

### Order Types

#### `run` — Execute an engine

```json
{ "on": "session.ended", "run": "completion-rollup" }
```

The Clockworks runner imports the engine by name from `guild.json.engines`, calls its handler with the triggering event, and records a dispatch.

#### `summon` — Launch an anima session

```json
{ "on": "commission.posted", "summon": "artificer" }
```

Resolves the role to an active anima, manifests it, and launches a full session through the session funnel. For commission events, also writes commission assignments and updates commission status to `"in_progress"`.

The `prompt` for the session comes from the commission content (for commission events) or the event payload's `brief` field.

#### `brief` — Launch an anima session (lightweight)

```json
{ "on": "code.reviewed", "brief": "steward" }
```

Same as `summon` but semantically lighter — no commission lifecycle updates.

### Dispatch Lifecycle

When the Clockworks runner processes an event:

1. Find all standing orders where `on` matches the event name
2. For each matching order:
   a. Execute the action (`run` engine, or `summon`/`brief` anima)
   b. Record a dispatch in `event_dispatches` (started_at, ended_at, status, error)
   c. If the action failed, signal `standing-order.failed`
3. Mark the event as processed

### Role Resolution

For `summon` and `brief` orders, the role name is resolved to a specific anima:
- Query the roster for active animas holding the role
- If multiple animas share the role, the one with the lowest ID is selected
- If no active anima holds the role, the dispatch fails with an error

### No-Provider Behavior

If no session provider is registered (e.g. during testing or CLI-only operation), `summon` and `brief` orders are recorded as **skipped** — the intent is logged but no session is launched.

---

## Cookbook

Common patterns for wiring events to actions.

### Commission Pipeline

The standard commission flow: patron posts → anima dispatched → session runs.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.posted", "summon": "artificer" }
    ]
  }
}
```

### Session End → Job Completion Rollup

When a session ends, check if the job's strokes are all done and roll up completion through the hierarchy.

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "session.ended", "run": "completion-rollup" }
    ],
    "events": {}
  }
}
```

The `completion-rollup` engine would:

```typescript
import { engine, checkJobCompletion, completeJobIfReady,
         completePieceIfReady, completeWorkIfReady,
         completeCommissionIfReady } from '@shardworks/nexus-core';

export default engine({
  name: 'completion-rollup',
  handler: async (event, { home }) => {
    // Find the job associated with this session's work...
    // Then roll up:
    const jobResult = completeJobIfReady(home, jobId);
    if (jobResult.changed && jobResult.newStatus === 'completed') {
      const pieceResult = completePieceIfReady(home, pieceId);
      if (pieceResult.changed) {
        const workResult = completeWorkIfReady(home, workId);
        if (workResult.changed) {
          completeCommissionIfReady(home, commissionId);
        }
      }
    }
  }
});
```

### When Job Completes → Roll Up Piece Status

React specifically to job completion events:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "job.completed", "run": "piece-rollup" }
    ]
  }
}
```

### When Commission Posts → Auto-Assign to Workshop

A custom engine that sets up worktrees and dispatches work:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "commission.posted", "run": "commission-dispatcher" },
      { "on": "commission.posted", "summon": "artificer" }
    ]
  }
}
```

Multiple standing orders can match the same event — they execute in declaration order.
