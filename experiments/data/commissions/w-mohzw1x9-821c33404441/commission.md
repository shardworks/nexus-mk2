`packages/plugins/clockworks/src/types.ts` lines 48-54 keeps `EventSpec.schema?: unknown` as a reserved-but-unused slot (commit 26f90b9 removed runtime enforcement). However, two doc surfaces still treat the field as if it were live:

- `docs/reference/event-catalog.md` lines 234-238 (worked example for Astrolabe) shows `schema: { planId: 'string', count: 'number', threshold: 'number' }`.
- `docs/reference/event-catalog.md` line 191 mentions “`schema` — reserved slot for structural payload validation” but readers may take the worked example as a recommendation to populate the field.

C5 chose `description`-only for Astrolabe's actual contribution (decision D5) on the grounds that an unused field invites payload/declared-shape drift. The doc example should either:

1. Drop the `schema` field from the worked example so the doc and the shipped contribution match exactly, or
2. Add a clarifying note next to the example saying the field is currently ignored at runtime.

Recorded as observation rather than included in S1/S2/S3 because it's a doc-style call distinct from this brief's two cleanups.