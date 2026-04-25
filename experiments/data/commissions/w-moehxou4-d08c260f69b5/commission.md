The rescue tool's matcher loads every `phase=stuck` writ then filters in JS by `status.spider.stuckCause`. For small guilds this is fine; for larger ones the load could grow. The Stacks `find` API does not currently index nested object fields (`stacks/src/types.ts` and the `MemoryBackend` / `SqliteBackend` index lists). If rescue or other tools needing `status.spider.*` queries get slow, consider either:

  - Adding a derived top-level field on writs (e.g. `spiderStuckCause`) maintained by the Spider CDC.
  - Extending Stacks' index support to nested paths.

This is speculative — file as observation now so we don't forget if the rescue tool's runtime becomes operator-visible.