Lifted from the planning run of "Rate-limit detection and scheduling — retro-review fixup" (w-mod4ujnp-895e327ae8fd). Each numbered observation below is a draft mandate ready for curator promotion.

1. Verify branch-3 direct patch is actually landed before this commission
2. README and architecture docs still describe three-branch detection cascade and separate status book
3. The `state` book type drift creates a cross-plugin constraint the type system cannot express
4. Spider's isAnimatorPaused() and animator-paused block type duplicate the isDispatchable() predicate
5. Investigate whether the direct patch also addressed the base NDJSON detector scope correctness
6. Historical false-positive session records remain with misleading status
7. Back-off machine cache warm-up is fire-and-forget today; animate() can dispatch during startup race
8. Tool-contributed REST routes lose response-shape validation once the auto-route replaces a custom one
