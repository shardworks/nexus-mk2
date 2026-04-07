# Observations: oculus-enhance-landing-page

## Startup Warnings Not Persisted on Guild (S3 prerequisite)

The `Guild` interface has `failedPlugins()` but no `startupWarnings()`. Warnings are computed in `arbor.ts` via `collectStartupWarnings()` and immediately emitted via `console.warn` — then discarded. Decision D5 recommends adding `Guild.startupWarnings()`. This is a framework-level change (core + arbor), not just an oculus change. If this is considered too invasive for this commission, S3 could be deferred — but the change is small (~5 lines across 2 files).

## `collectStartupWarnings` Could Move to Core

The `collectStartupWarnings` function in `guild-lifecycle.ts` takes only `LoadedKit[]` and `LoadedApparatus[]` — types that are defined in `nexus-core`. The function has no arbor-specific dependencies. It could be moved to core if other packages need to compute warnings independently. Not needed for this commission (D5 stores warnings on the Guild object instead), but worth noting for future refactoring.

## No Existing Oculus Architecture Doc

There is no `docs/architecture/apparatus/oculus.md`. Other apparatus have architecture docs (instrumentarium, loom, etc.). The oculus is undocumented in the architecture index. Future commission opportunity.

## Home Page Test Will Break

The "Oculus home page" test suite (oculus.test.ts ~lines 449-494) asserts that `GET /` includes page links (`/pages/dash/`). Removing the pages widget means this test must be rewritten to assert the new content instead. The test pattern (spin up a real server, fetch, assert on HTML text) is unchanged — just the assertions.

## GuildConfig Type Doesn't Model Plugin Config Sections

`GuildConfig` types only `name`, `nexus`, `plugins`, `settings`, `clockworks`. Plugin-specific config sections (e.g., `oculus: { port: 7470 }`, `animator: {...}`) are untyped extra keys in the JSON file. The runtime object does carry them (arbor.ts parses the full JSON), but the TypeScript type doesn't declare them. `JSON.stringify(g.guildConfig())` at runtime will include all keys, but IDE tooling / type checking won't see them. This is by design (plugins use module augmentation for typed access), but it's a gotcha when rendering "the full guild.json".

## The Oculus Status Tool Blocks Forever

The `oculus` tool in the supportKit (lines 539-558) blocks until SIGINT/SIGTERM. This is intentional (it's a "keep dashboard running" command for CLI use), but it means the oculus tool can't be used programmatically. Not related to this commission, but notable.

## No Client-side JavaScript Infrastructure

The oculus has zero client-side JS files, no bundler, no build step for frontend assets. The `static/` directory contains only `style.css`. Any future interactivity (editable config, live-updating status) would need to establish a JS delivery pattern. This commission stays server-rendered (D14), deferring that complexity.
