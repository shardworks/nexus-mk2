**Where:** `packages/plugins/reckoner/src/reckoner.ts:1112-1131` (the CDC re-firing gate at `handleWritsChange`).

**What:** The Reckoner's CDC handler only fires when the watched writ's own `phase` or `ext.reckoner` changes (lines 1124-1128):

```typescript
const phaseChanged = entry.phase !== prev.phase;
const extChanged = JSON.stringify(extPrev) !== JSON.stringify(extNext);
if (!phaseChanged && !extChanged) return;
```

A dependent writ deferred for `dependency_pending` waits for one of its `depends-on` targets to change phase. The TARGET's phase change fires CDC on the TARGET, not on the dependent — the dependent's CDC handler never runs. The dependent stays in `new` until either the dependent itself updates (manual re-petition) or the apparatus restarts (catch-up scan).

**Why this is load-bearing:** This commission's brief promises 'Worst-case latency between a dependency clearing and a dependent being accepted is one tick (60s default).' That promise is broken under CDC alone — worst case is until-update-or-restart. Decision D7 in this plan addresses the coordination concern by adding a `depends-on` link to the tick-relay writ, but the underlying gap in the CDC re-firing gate is real and will surface in any future scenario where the Reckoner needs to re-evaluate a writ in response to graph-neighbour changes (priority re-weights, queue-depth holds resolving, etc.).

**Suggested follow-up:** Either (a) confirm the tick relay covers this entirely (and the CDC handler stays writ-self-only), or (b) add a CDC-on-dependencies subscription pattern — watch `clerk/writs.updated` for writs that appear as `depends-on` targets of currently-held petitions, and re-fire `considerWrit` for the dependent. Option (b) is rejected by c-mof657j4 (no-cross-layer-coordination), so the practical answer is option (a) and watchful follow-up if the tick design proves insufficient.