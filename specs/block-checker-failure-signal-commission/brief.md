# Block Checker Failure Signal — Commission Brief

## Problem

The `BlockType.check()` interface returns `Promise<boolean>` — it can signal "cleared" or "not yet cleared," but it cannot signal "this will never clear; fail the engine." When a blocking condition becomes permanently unresolvable (patron rejects an input request, a dependency writ is cancelled, an external resource is deleted or fails), the only recourse is manual intervention via `rig-resume`, followed by the engine having to detect and handle the failure itself on re-run.

The checker is the component with the knowledge that the condition is unrecoverable. It should be able to say so.

## Goal

A block type checker can signal permanent failure, causing the Spider to fail the blocked engine (and propagate rig failure) without requiring manual intervention or engine-side workarounds.

## Solution

### Replace the checker return type

Change `BlockType.check()` from:

```typescript
check: (condition: unknown) => Promise<boolean>
```

to:

```typescript
type CheckResult = 'cleared' | 'pending' | 'failed' | { failed: string }

check: (condition: unknown) => Promise<CheckResult>
```

- `'cleared'` — condition met, unblock the engine
- `'pending'` — condition not yet met, keep polling
- `'failed'` — condition is permanently unresolvable, fail the engine
- `{ failed: string }` — permanent failure with a human-readable reason

This is a **breaking change** to the `BlockType` interface. All three existing built-in checkers (`writ-status`, `scheduled-time`, `book-updated`) must be updated to return string literals instead of booleans. None of these block types are in use by any shipped engine yet, so there are no external consumers to migrate.

### Spider handling in `tryCheckBlocked()`

Update the result handling to match on the new string literals:

- `'cleared'` — existing unblock path (was `true`)
- `'pending'` — existing keep-polling path (was `false`)
- `'failed'` or `{ failed: string }` — new failure path:
  1. Call `failEngine(rig, engine.id, message)`
  2. Return `{ action: 'rig-completed', rigId, writId, outcome: 'failed' }`

This slots into the existing `tryCheckBlocked()` flow. No new CrawlResult variants needed — engine failure during block checking produces the same `rig-completed/failed` result as any other engine failure.

The Spider constructs the engine error message:
- For `'failed'`: `Block "${blockType}" failed permanently`
- For `{ failed: reason }`: `Block "${blockType}" failed: ${reason}`

### Updated BlockType interface

```typescript
export type CheckResult = 'cleared' | 'pending' | 'failed' | { failed: string }

export interface BlockType {
  id: string;
  check: (condition: unknown) => Promise<CheckResult>;
  conditionSchema: ZodSchema;
  pollIntervalMs?: number;
}
```

### Built-in block type updates

All three existing built-in checkers must be updated from `boolean` returns to `CheckResult` string literals. Additionally, add failure detection where appropriate:

- **`writ-status`**: `true` → `'cleared'`, `false` → `'pending'`. Add: if the writ doesn't exist, return `{ failed: 'Writ not found' }`. If the writ is in a terminal status that isn't the target (e.g., target is `completed` but writ is `failed`), return `{ failed: 'Writ reached terminal status "${actual}" instead of "${target}"' }`.
- **`scheduled-time`**: `true` → `'cleared'`, `false` → `'pending'`. No failure case — time always arrives.
- **`book-updated`**: `true` → `'cleared'`, `false` → `'pending'`. No obvious permanent failure case.

## Out of Scope

- **Retry/recovery on checker failure.** A failed engine fails the rig. Recovery chains are a future Spider feature.
- **Checker-provided yields on failure.** The failure only produces an error message, not structured data. Engines that need to handle failure gracefully should use the unblock-and-inspect pattern (checker returns `true`, engine reads state and decides).
- **CrawlResult variants for checker failure.** Engine failure during block checking reuses the existing `rig-completed/failed` result. No new variants.
