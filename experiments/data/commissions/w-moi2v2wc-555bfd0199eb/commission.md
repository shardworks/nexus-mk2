docs/guides/adding-writ-types.md is meaningfully stale relative to the Clerk T2 refactor:
- Describes `ClerkKit.writTypes` array contributed via a kit — channel deleted in commit f4da4ec.
- Describes guild-config `clerk.writTypes` — also deleted.
- The only surviving registration path is `ClerkApi.registerWritType(config)` from a plugin start().
- "Clerk downward cascade" reference predates T2.
- Multiple sections on writ-type configuration need a registerWritType-only rewrite.

This is a guide-shaped doc, not a reference; probably wants a full rewrite from scratch using mandate as the worked example.

DO NOT DISPATCH until classification-based migration (T5/T6) fully lands.