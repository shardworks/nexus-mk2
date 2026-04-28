Two notes in `docs/reference/event-catalog.md` flag the `book.` prefix as an as-is gap that lets animas signal spoofed CDC events:

- Line 144 (in 'Reserved Namespaces' section): "`book.` is intentionally absent. … closing it is a separate code-only follow-up."
- Lines 168–172 (in 'CDC Events' section): "Reserved-namespace gap. The `book.` prefix is **not** in `RESERVED_EVENT_NAMESPACES` — animas calling `signal('book.clerk.writs.updated', …)` are rejected only by Layer 3 … closing this gap is a separate follow-up."

The `docs/architecture/reckonings-book.md` doc (lines 623–642) carries a parallel observation about `reckoner.` and `reckoning.` prefixes.

C3 (the `clockworks-stacks-signals` bridge plugin, mandate `w-mohuoxgh`) declares CDC events via a function-form events kit; once C3 lands, those names become plugin-declared in the merged set, the framework-owned check rejects unprivileged emissions, and the gap closes structurally. C1 cannot land this fix (declarations are out of scope), but the doc notes become incorrect as soon as C3 ships and should be removed or updated then.

Addressed naturally inside C3's doc-update step. Surfaced as an observation so the C3 reviewer remembers to check.

**Files**: `docs/reference/event-catalog.md` (lines 144, 168–172), `docs/architecture/reckonings-book.md` (lines 623–642).
**Precondition**: C3 (`w-mohuoxgh`) lands.