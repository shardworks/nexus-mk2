The schema reference mirrors the same kind of drift the parent mandate fixes in `clockworks.md`, but in tabular form rather than SQL DDL. Multiple stale fields in `docs/reference/schema.md`:

- ID conventions section (lines 361–375) lists prefixes `evt-` (event) and `ed-` (event dispatch). Shipped types use `e-<base36_ts>-<hex>` and `d-<base36_ts>-<hex>` (per `packages/plugins/clockworks/src/types.ts:104–105`).
- `event_dispatches.handler_type` column (line 209) lists `engine | anima`; shipped enum is `relay | anima` (`EventDispatchDoc.handlerType`).
- `event_dispatches.notice_type` column (line 212) lists `summon or brief`; shipped enum is `summon | null` only — `brief` was never wired.
- `event_dispatches.status` column (line 215) lists `success or error`; shipped enum is `pending | success | error | skipped` (`EventDispatchDoc.status`).
- `events.processed` (line 199) is described as `INTEGER`, `0/1`; the book document is `boolean` (`EventDoc.processed`).
- The whole-file framing at line 3 (`foreign keys enforced`) is at odds with the Stacks-owned book layer for these two tables (the global `foreign_keys = ON` pragma applies to no FK declared on book tables).

This is a cross-doc cleanup that mirrors the parent mandate's work, plus an ER-diagram tweak (the `events`/`event_dispatches` block at lines 62–70 still draws an FK arrow). One sweep over the schema doc would consolidate this drift in one commit.