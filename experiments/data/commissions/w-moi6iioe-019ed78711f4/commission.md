Multiple lifted observations flag docs/reference/core-api.md as substantially out of date relative to the v2 plugin/apparatus model:
- Top-level helpers (`isFrameworkEvent`, `validateCustomEvent`, `signalEvent`, `readEvent`, `listEvents`) are documented as `@shardworks/nexus-core` exports but no longer exist there — the equivalent surface lives on `ClockworksApi.emit`.
- `launchSession()` description references a `Daybook` (no such book in code) and obsolete `session.started`/`session.ended` events.
- `pending`-phase auto-routing for parent completion is described but does not exist.
- Built-in writ-type list still names `summon` (only `mandate` is registered today).
- `commission()`, `instantiate()`, `manifest()`, `_migrations` table — all v1 surface that no longer exists.

Decide: deep refresh, or carve out the broken sections and rewrite from the live code surface. Several of these stale sections were lifted as separate observation writs across at least 6 different planning runs.

DO NOT DISPATCH until the C1–C5 events ladder fully lands (touches the same surface). Sweep writs are intentionally drafts.