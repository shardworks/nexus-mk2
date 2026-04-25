While auditing animator the Loom apparatus surfaces in two seams:

- `animator.ts:553 summon()` resolves The Loom lazily via `guild().apparatus<LoomApi>('loom')`, throwing if not installed. The pattern is duplicated for Clockworks (`session-emission.ts:60 tryResolveClockworks`) and Clerk (`session-emission.ts:71 tryResolveClerk`) — each writes its own try/catch wrapper.
- The Loom is in `recommends`, not `requires` — standard guild idiom — but the resolution-and-fallback boilerplate is hand-rolled per-consumer.

This isn't an animator issue per se, but the cost-density audit hints at a framework-level pattern: every `guild().apparatus<X>('y')` consumer with optional behavior re-implements the same try/catch+null-fallback pattern. A `guild().tryApparatus<X>('y'): X | null` helper would centralize it. Worth a separate inventory of optional-apparatus resolution sites across the framework (spider, parlour, astrolabe also use the pattern).

Not a refactor of animator. Surface as a candidate for cross-framework cleanup.