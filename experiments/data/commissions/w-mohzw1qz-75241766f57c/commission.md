`docs/architecture/reckonings-book.md` lines 624-643 (the “Validator namespace observation” block) describes the events-validator using two identifiers that C1 deleted:

- `RESERVED_EVENT_NAMESPACES` — the const was removed when the validator collapsed to the merged-set + framework-owned check.
- `packages/plugins/clockworks/src/signal-validator.ts` — the module was inlined into the apparatus closure during the C1 refactor; the path no longer exists.

The block still reads as if the operator can patch a hardcoded list to reserve `reckoner.` / `reckoning.`. Under the C1 model, prefix reservation is a side-effect of plugin contributions (a plugin's `events` kit claims names; the merged set marks them `pluginDeclared`). The Reckoner can declare its own events via `supportKit.events` if it wants the names framework-owned.

Fix shape: rewrite the “Validator namespace observation” block (or strike it entirely) to describe the kit-contribution model, and drop the now-incorrect “if a future commission earns the named-events surface, it must extend the validator's RESERVED_EVENT_NAMESPACES list at the same time” guidance — there is no list to extend; the prescription is to add an `events` kit contribution.

Out of scope for this commission (C5) because the staleness predates the C5 brief; recorded here so a doc-cleanup commission can pick it up.