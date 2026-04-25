`docs/architecture/apparatus/clerk.md` lines 977–1015 contain an obsolete 'Lifecycle Events' table:

| Transition | Event | Payload |
|-----------|-------|---------|
| Commission posted | `commission.posted` | `{ writId, title, type, codex }` |
| Writ signaled open | `{type}.open` | `{ writId, title, type, codex }` |
| `open → completed` | `{type}.completed` | `{ writId, resolution }` |
| `open → failed` | `{type}.failed` | `{ writId, resolution }` |
| `* → cancelled` | `{type}.cancelled` | `{ writId, resolution }` |

Problems: (1) the event name is `{type}.ready`, not `{type}.open` (the `lifecycleSuffix` mapping in `writ-lifecycle-observer.ts:67-81` maps `phase: 'open'` to suffix `'ready'`); (2) `{type}.cancelled` is not emitted at all (cancelled phase is silent per D3 of the prior commission); (3) the payloads are wrong (`{ writId, writType, phase, commissionId, title, parentId? }` is the actual shipped shape); (4) the example standing order at line 995 uses dropped `summon:` sugar; (5) the `signal()` method described at lines 1001–1015 references `{type}.open` and is itself stale.

Fix: replace the lifecycle events table with a one-line pointer to the canonical event-catalog.md (per the parent commission's D1). Replace the obsolete `signal()` method description and the dropped-sugar example with current canonical wiring. Drop the entire 'Future: Clockworks Integration' framing because the integration shipped.