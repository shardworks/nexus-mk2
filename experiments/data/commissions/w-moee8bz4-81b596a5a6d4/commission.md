`const TERMINAL_STATUSES: ReadonlySet<SessionDoc['status']>` is independently defined in four files:

- `packages/plugins/animator/src/animator.ts:411`
- `packages/plugins/animator/src/tools/session-running.ts:52`
- `packages/plugins/animator/src/tools/session-heartbeat.ts:18`
- `packages/plugins/animator/src/session-record-handler.ts:122`

All four list the same five values: `'completed', 'failed', 'timeout', 'cancelled', 'rate-limited'`. Adding a sixth terminal status (e.g. a future `'aborted'`) requires editing all four; missing one re-introduces the regression-to-running bug `session-running` already gates against.

Lift to a single export in `types.ts` (or a new `lifecycle.ts`) and import everywhere. Tiny refactor; pure DRY. Worth doing as preparatory work before refactor candidate (A) lands the SessionDoc-writeback reducer (which would naturally absorb this, but pulling it forward saves a rebase).