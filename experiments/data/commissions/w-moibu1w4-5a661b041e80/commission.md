`docs/reference/schema.md` opens with an ER diagram describing v1 ledger and identity tables that no longer exist:

- `commissions`, `commission_assignments`, `commission_sessions` — there is no commissions table; `commission-post` is a tool that creates a writ.
- `animas`, `anima_compositions` — there is no anima identity model in code today; the Loom's roles registry is the closest live structure.
- `audit_log` — no audit log book exists.
- The premise that the database is `.nexus/nexus.db` is correct, but every entity beyond writs/links/sessions/transcripts is wrong.

Today the database is composed of per-plugin `books` contributed via the Stacks apparatus's `books` kit type. Sample real books: `clerk/writs`, `clerk/links`, `clockworks/events`, `clockworks/event_dispatches`, `animator/sessions`, `animator/transcripts`, `animator/state`, `parlour/conversations`, `parlour/turns`, `astrolabe/plans`, `ratchet/clicks`, etc. There is no monolithic schema doc that will not bit-rot — each apparatus contract documents the books it owns.

Recommend either (a) a sweep that narrows `schema.md` to the cross-cutting Stacks substrate concepts (book contribution mechanism, indexes, CDC) and points at apparatus contracts for per-book schemas, or (b) deletion in favour of `docs/architecture/apparatus/stacks.md` plus per-apparatus contracts.