# more-doc-updates

## Scriptorium doc shows `requires: ['stacks']` but code shows `requires: []`

The Scriptorium architecture doc (scriptorium.md, Dependencies section) says `requires: ['stacks']`. The actual implementation in `scriptorium.ts` line 39 has `requires: []`. The Scriptorium currently tracks drafts in-memory and uses `guild().config()` / `guild().writeConfig()` for the registry — it does not depend on the Stacks apparatus. The doc is aspirational (matching the "Future State: Draft Persistence via Stacks" section) rather than accurate. This predates this commission.

## Spider doc note about seal+push is a comment, not a spec requirement

The spider.md note "Push is a separate Scriptorium operation — the seal engine seals but does not push" (line 284) reads as a documentation observation, not a design constraint. It was likely written to explain the current behavior, not to prescribe it. Updating it is straightforward.
