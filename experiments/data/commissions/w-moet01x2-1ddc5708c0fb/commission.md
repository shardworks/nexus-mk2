The standing-order validator (`packages/plugins/clockworks/src/standing-order-validator.ts`) rejects `summon:` and `brief:` keys at guild.json load time today — they were dropped in favor of the canonical `{ on | schedule, run, with? }` shape with the stdlib `summon-relay`. The parent commission updates the in-doc examples in `docs/reference/event-catalog.md` per its D6, but other in-tree references to the dropped sugar remain:

- `docs/architecture/apparatus/clerk.md:991-996` — standing-order example uses `summon: 'artificer'`.
- Test fixtures in `packages/` may reference the sugar; the plan doesn't enumerate them but the validator-test files explicitly assert rejection.
- Any in-codex `guild.json` examples in user-facing guides or quickstarts.

Fix: grep for `"summon":` and `"brief":` across `docs/`, `packages/*/README.md`, and any sample `guild.json` files. Replace with the canonical shape using `summon-relay` and `with: { role, prompt, ... }`. This is doc-only; no code changes required (the validator already rejects the sugar).