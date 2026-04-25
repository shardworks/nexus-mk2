Lifted from the planning run of "Update Spider architecture docs to reflect six-state engine and four-state rig enums" (w-mod4z7t3-4f3f713abb39). Each numbered observation below is a draft mandate ready for curator promotion.

1. Document Spider's BlockType registry as a first-class concept in spider.md
2. Document rig templates, kit contributions, and template precedence in spider.md
3. Document grafts and the SpiderEngineRunResult shape in spider.md
4. Document the operator-facing tool surface (`nsg rig`, `nsg writ-rescue-stuck`, etc.) in spider.md
5. Document concurrency throttles (maxConcurrentEngines, per-rig caps) in spider.md Configuration section
6. Refresh the MVP-scope banner on spider.md to reflect realised capabilities
7. Update Scriptorium spec's Spider seal/recovery cross-reference to match new state machine
8. Drop or wire up the unused `priorBlock` field on EngineRunContext to remove documentation drift surface
