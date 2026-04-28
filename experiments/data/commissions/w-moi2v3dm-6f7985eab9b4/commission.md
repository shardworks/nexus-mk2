docs/guides/building-engines.md and adjacent docs reference an `engine()` factory exported from `@shardworks/nexus-core` that does not exist:
- Code samples import `{ engine }` from `@shardworks/nexus-core`.
- The actual primitive is `EngineDesign` registered via Fabricator + `relay()` for Clockworks runners.
- Doc conflates two senses of "engine" (Clockworks runner / EngineDesign).

A kit-author guide for EngineDesign authoring is also missing — fabricator.md and spider.md describe the type and execution model, but those are reference-shaped, not tutorial-shaped.

DO NOT DISPATCH until the relay/engine factory surface settles.