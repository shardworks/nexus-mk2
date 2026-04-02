# Commission: Dispatch apparatus — align implementation with spec

Fix the Dispatch apparatus at packages/plugins/dispatch/ to match the API contract spec at docs/architecture/apparatus/dispatch.md. Two deviations need correction.

## Important: Clerk API has changed

The Clerk apparatus (packages/plugins/clerk/) has been updated to match its spec. The ClerkApi interface now uses:
- `clerk.post()` instead of `clerk.postCommission()`
- `clerk.transition(id, toStatus, fields?)` instead of separate `accept()`/`complete()`/`fail()`/`cancel()` methods
- `clerk.show(id)` now throws if not found (instead of returning null)
- `clerk.list(filters?)` and `clerk.count(filters?)` for queries

WritDoc fields have also changed:
- `createdAt` (was `postedAt`)
- `updatedAt` (new)
- `resolvedAt` (was `closedAt`)
- `resolution` (was `failReason`)
- `codex?: string` (new)
- `body: string` (required, was nullable)
- `assignee` has been removed

Read the current source at packages/plugins/clerk/src/types.ts for the exact interface.

## Changes required

### 1. Use Clerk API instead of direct book read (src/dispatch.ts)

The current implementation reads the Clerk's writs book directly:
```typescript
// Current (wrong):
const stacks = guild().apparatus<StacksApi>('stacks');
readWrits = stacks.readBook<WritDoc>('clerk', 'writs');
```

The spec says: "The Dispatch queries the Clerk's writs book via `clerk.list({ status: 'ready' })` with a limit of 1 and ordered by `createdAt` asc."

Change `next()` to use the Clerk API for the query:
```typescript
const clerk = guild().apparatus<ClerkApi>('clerk');
const readyWrits = await clerk.list({ status: 'ready', limit: 1 });
const writ = readyWrits[0] ?? null;
```

This means:
- Remove the `readWrits` field from the closure
- Remove `stacks` from `requires` (Dispatch doesn't need it directly)
- Remove the `start()` method body (no book to open)
- Move `clerk` resolution to the top of `next()` instead of after the query

Note: The Clerk's `list()` orders by `createdAt` descending. The Dispatch needs the *oldest* ready writ. Either:
- Pass the results as-is and take the last element, OR
- If the Clerk supports an ordering option, use it

Check the Clerk's current `list()` implementation to see how it orders results. The spec says "ordered by createdAt asc" for the Dispatch query — the Dispatch should get the oldest writ. If the Clerk only returns desc order, take the last element from the results or request a higher limit and pick the oldest.

### 2. Use Clerk API for transitions (src/dispatch.ts)

Update all writ transition calls to use the new `transition()` method:

```typescript
// Accept:
await clerk.transition(writ.id, 'active');

// Complete (with resolution):
await clerk.transition(writ.id, 'completed', { resolution: `Session ${session.id} completed` });

// Fail (with resolution):
await clerk.transition(writ.id, 'failed', { resolution: reason });
```

### 3. Update imports (src/dispatch.ts)

- Remove `import type { StacksApi, ReadOnlyBook } from '@shardworks/stacks-apparatus'`
- Remove `import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus'` if types have changed, and re-import to match new shape
- The `WritDoc` type no longer has `assignee` or `failReason` — verify no code references those fields

### 4. Update requires (src/dispatch.ts)

```typescript
requires: ['clerk', 'codexes', 'animator'],
```

Remove `stacks` — the Dispatch no longer accesses the Stacks directly.

### 5. Update types if needed (src/types.ts)

The `DispatchResult.resolution` field should still work. Verify it's compatible.

### 6. Update tests (src/dispatch.test.ts)

- Tests that set up a writs book directly via Stacks need to change: post writs via `clerk.post()` instead
- Remove any direct book reads
- Update transition assertions to use `clerk.transition()` calls
- Update WritDoc field references (createdAt, resolution, codex, etc.)
- The test harness may need to boot the Clerk apparatus in the fake guild setup

### 7. Update package.json dependencies

- Remove `@shardworks/stacks-apparatus` from dependencies if it's no longer imported
- Ensure `@shardworks/clerk-apparatus` is listed

### 8. Update README.md

Update the dependencies section to remove Stacks from the direct dependency list and note that the Dispatch queries writs through the Clerk API.

## Reference

- Spec: docs/architecture/apparatus/dispatch.md
- Clerk API: packages/plugins/clerk/src/types.ts (read the current version — it has just been updated)
- Pattern reference: packages/plugins/parlour/ for apparatus structure

IMPORTANT: Commit your work. Make small, atomic commits as you complete each piece. Do not leave uncommitted files. Run tests before your final commit to ensure everything passes.
