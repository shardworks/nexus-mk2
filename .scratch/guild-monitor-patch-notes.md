# Guild Monitor Patch Notes — Core API Updates

## Summary

`@shardworks/nexus-core` ≥ 0.1.72 exposes new APIs for session counting and
pre-generated session IDs. Guild-monitor should bump its core dependency to
pick these up.

Guild-monitor's `package.json` (commission-c-30757435 worktree) currently
declares only one dependency:

```json
"@shardworks/nexus-core": "^0.1.69"
```

No `better-sqlite3` dependency was found — guild-monitor was not using raw SQL
patterns. The notes below describe what changed in core for awareness, plus the
one concrete action required.

---

## What changed in core (≥ 0.1.72)

### 1. Pre-generated session IDs

`SessionLaunchOptions` now accepts an optional `sessionId` field. If provided,
`launchSession` uses it as the session row's primary key instead of generating
one internally.

This lets callers bind a writ to a real session ID *before* the provider
launches — no more `'pending'` placeholder, no post-launch SQL swap.

**New pattern (summon-engine uses this):**

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

### 4. `failWrit` now cascades to linked commission (≥ 0.1.77)

When a mandate writ fails, the linked commission is now automatically marked
`failed` (status_reason: `'mandate failed'`) and a `commission.failed` event
fires. Previously the commission stayed `in_progress` indefinitely when an
anima called `fail-writ`. If guild-monitor listens for `commission.failed`,
this new event will start arriving.

---

## Action required

**Bump `@shardworks/nexus-core` to `>=0.1.72`** (or latest) in `package.json`.

That's it — no patterns to replace, no dependencies to remove.

```json
"@shardworks/nexus-core": ">=0.1.72"
```

After bumping, run `pnpm install` and verify the build passes.

---

## Minimum core version reference

| Feature                        | Minimum version |
|-------------------------------|-----------------|
| `sessionId` on `launchSession` | 0.1.72          |
| `countSessionsForWrit`         | 0.1.72          |
| `writId` filter on `listSessions` | 0.1.72       |
| `failWrit` cascades commission | 0.1.77          |
