Multiple lifted observations flag docs/reference/schema.md as out of sync with the shipped book documents:
- ID prefix conventions list `evt-`, `ed-`, `wrt-` — code uses `e-<base36_ts>-<hex>`, `d-<base36_ts>-<hex>`, `w-<base36_ts>-<hex>`.
- Writs table uses legacy `status` column with five-value vocabulary; shipped uses `phase` with six values including `stuck`.
- `event_dispatches.handler_type` shape mismatches `EventDispatchDoc` columns.
- Multiple Clockworks tables drifted from shipped EventDoc / EventDispatchDoc.

Worth a comprehensive sweep against `packages/plugins/*/src/types.ts` shipped book documents.

DO NOT DISPATCH until the schema settles around the C1–C5 events ladder.