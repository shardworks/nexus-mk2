**Site:** `packages/plugins/animator/src/animator.ts` and `packages/plugins/clerk/src/clerk.ts` will both gain emission helpers that call `guild().apparatus<ClockworksApi>('clockworks')` per emit. For high-frequency emitters (e.g. session.started + session.ended on every dispatch) this is a per-emit lookup.

**Why this matters now:** The guild().apparatus() lookup is a Map.get on a small map — it's not actually slow. But the lazy-resolve-with-try-catch pattern ends up wrapped around every emit, adding noise.

**Suggested follow-up:** Once emission has shipped and proven stable, consider memoizing the ClockworksApi reference at apparatus start (with a fallback to lazy-resolve if it wasn't available at start). Marginal cleanup, low priority.