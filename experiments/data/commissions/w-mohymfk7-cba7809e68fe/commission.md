`docs/reference/core-api.md` lines 281–293 describe a `launchSession()` core-API helper that:
- writes to a `Daybook` (no such book in the codebase — the Animator uses Stacks `sessions`/`transcripts` books).
- signals `session.started` and `session.ended` events from steps 2–7.

The entire `launchSession()` description is a pre-MVP relic that does not match `nexus-core`'s actual export surface, and its references to `session.started` / `session.ended` will be doubly wrong after C4 (the names are renamed *and* the function does not exist anyway). Out of scope for the C4 brief; surfaced as a separate observation so a future doc-sweep can decide whether to delete the section, rewrite it to point at `AnimatorApi.animate()`, or move the description into the apparatus doc.

Core concern: the `core-api.md` doc still purports to document a session-launching helper that lives in `nexus-core`; the actual session-launch surface is `AnimatorApi.animate()` / `AnimatorApi.summon()` in `@shardworks/animator-apparatus`.