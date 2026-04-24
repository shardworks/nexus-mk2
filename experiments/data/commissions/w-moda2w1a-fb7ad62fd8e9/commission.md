Three places compose the "state === paused AND pausedUntil in the future" check by hand:

- `packages/plugins/spider/src/spider.ts:2441-2452` (`isAnimatorPaused()`)
- `packages/plugins/spider/src/block-types/animator-paused.ts:44-50` (block checker)
- `packages/plugins/spider/src/static/spider.js:1546-1554` (client-side banner)

The Animator already exports `isDispatchable()` in `rate-limit-backoff.ts`, which is the inverse predicate. The server-side consumers could import and invert it; the client-side banner could call a route that applies the predicate server-side.

Not load-bearing for this commission (all three implementations agree with the canonical predicate), but a natural refactor target once D24 is in place. A divergent implementation here could re-introduce stale-state bugs.