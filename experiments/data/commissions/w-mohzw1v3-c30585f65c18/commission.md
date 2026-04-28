`docs/architecture/clockworks.md` line 49 still reads:

> “Bundles may also declare events they introduce; these are merged into `guild.json` on installation.”

This describes a never-built install-time merge of bundle-supplied events into `guild.json`. The current truth is plugins declare events via `supportKit.events`; the merged set is built at apparatus `start()` and consulted per-call by `validateSignal`. The line should be replaced with prose describing the kit-contribution + start-time merge model.

Narrowly scoped doc fix — one sentence — but out of this commission's brief scope (the brief targets `tool.installed` / `tool.removed` references, not the broader events documentation). Records the discrepancy for follow-up.