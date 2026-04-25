`packages/plugins/astrolabe/src/astrolabe.ts:368–393` registers `PIECE_CONFIG` and `OBSERVATION_SET_CONFIG` as mandate-shaped six-state machines but neither declares a `childrenBehavior` block. Today this is a no-op (no engine to consume it), but once T3 ships:

* A `piece` writ that gains children (rare today — pieces are usually leaves) will not lift them.
* An `observation-set` writ that aggregates lifted draft mandates will never auto-complete or auto-fail based on its draft mandates' outcomes; an operator must manually transition it.

The astrolabe team should decide deliberately whether each type wants `allSuccess` / `anyFailure` triggers. The observation-set case is the more interesting one — the lift engine batches related observations and the parent set has natural completion semantics ('all drafts have been promoted, dropped, or completed'). Out of scope for T3 per the brief's mandate-only framing; recorded so a follow-up commission has a starting point.