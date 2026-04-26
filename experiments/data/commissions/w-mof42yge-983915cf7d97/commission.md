After this mandate replaces the SQL DDL with a Stacks-aware book description, the broader `clockworks.md` document still has three small terminology seams worth a separate cleanup pass:

- Line 24: `event and dispatch tables are internal Clockworks operational state` — D5 of this mandate touches this in scope; if D5 lands as `in-place`, the line stays.
- Line 272 (inside the `signal` tool docstring snippet): `// persist to Clockworks events table` — same pre-Stacks framing.
- Line 24 parenthetical: `not part of the guild's Books (Register, Ledger, Daybook)` — the human-curated trio is no longer the only meaning of "Books" in the codebase; the apparatus's internal books are also Stacks books. Worth a clarifying parenthetical.

None of these are load-bearing; bundling them into a single follow-up commission would let one editor sweep clockworks.md for terminological consistency without spreading edits across multiple commits.