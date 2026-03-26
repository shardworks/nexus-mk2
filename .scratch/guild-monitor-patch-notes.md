# Guild Monitor Patch Notes — Session ID & Circuit Breaker

## Context

`@shardworks/nexus-core` now exposes two new APIs that replace the raw SQL
patterns guild-monitor was using. These ship in the next core release (the
publish is in-flight now).

## What changed in core

### 1. Pre-generated session IDs

`SessionLaunchOptions` now accepts an optional `sessionId` field. If provided,
`launchSession` uses it as the session row's primary key instead of generating
one internally.

This lets callers bind a writ to a real session ID *before* the provider
launches — no more `'pending'` placeholder, no post-launch SQL swap.

**Pattern:**

```typescript
import { generateId, activateWrit, launchSession } from '@shardworks/nexus-core';

const sessionId = generateId('ses');
activateWrit(home, writId, sessionId);   // real ID, not 'pending'

await launchSession({
  ...opts,
  sessionId,                              // launchSession uses this ID
});
```

### 2. `countSessionsForWrit(home, writId)`

Returns the number of sessions bound to a given writ. Purpose-built for
circuit breaker checks.

```typescript
import { countSessionsForWrit } from '@shardworks/nexus-core';

const count = countSessionsForWrit(home, writId);
if (count >= maxSessions) {
  failWrit(home, writId);
  return;
}
```

### 3. `writId` filter on `listSessions`

`ListSessionsOptions` now accepts an optional `writId` field for filtering
sessions by their bound writ.

```typescript
const sessions = listSessions(home, { writId: 'wrt_abc123' });
```

## What to patch in guild-monitor

If guild-monitor has any of these patterns, replace them:

### A. The `'pending'` placeholder dance

**Before:**
```typescript
activateWrit(home, writId, 'pending');
const result = await launchSession({ ... });
// raw SQL: UPDATE writs SET session_id = ? WHERE id = ? AND session_id = 'pending'
```

**After:**
```typescript
const sessionId = generateId('ses');
activateWrit(home, writId, sessionId);
await launchSession({ ...opts, sessionId });
// No post-launch fixup needed
```

### B. Raw SQL session counting for circuit breaker

**Before:**
```typescript
import Database from 'better-sqlite3';
const db = new Database(booksPath(home));
const row = db.prepare('SELECT COUNT(*) as n FROM sessions WHERE writ_id = ?').get(writId);
```

**After:**
```typescript
import { countSessionsForWrit } from '@shardworks/nexus-core';
const count = countSessionsForWrit(home, writId);
```

### C. Drop `better-sqlite3` dependency

If the only reason guild-monitor depends on `better-sqlite3` directly was for
these raw queries, remove it from `dependencies` and `@types/better-sqlite3`
from `devDependencies`. All DB access should go through core APIs.

## Minimum core version

These APIs require `@shardworks/nexus-core` at whatever version publishes from
commit `7197cdd`. Check npm for the exact version once the publish completes.
nsg signal mandate.ready --payload 
  '{"writId":"wrt-7a033e26","type":"mandate","parentId":null}' --force     