# Observations: core-api.md pre-Stacks Clockworks API

## Out-of-scope items noticed during analysis

### 1. core-api.md documents functions that don't exist in nexus-core
The vast majority of functions documented in core-api.md — Register (`instantiate`, `listAnimas`, etc.), Ledger (`commission`, `createWrit`, etc.), Daybook (`listSessions`, `launchSession`, etc.), Conversations (`createConversation`, `takeTurn`, etc.), and Clockworks (`clockTick`, `clockRun`, etc.) — are not exported from `@shardworks/nexus-core`. The actual exports are limited to the plugin model, guild singleton, path helpers, guild config, and ID generation. The doc is aspirational, describing the intended API surface. A full reconciliation of the doc against actual exports would be a significant effort — potentially the doc should be restructured to distinguish between core exports and apparatus-provided APIs.

### 2. Clockworks architecture doc also has raw SQL schemas
`docs/architecture/clockworks.md` contains `CREATE TABLE events` and `CREATE TABLE event_dispatches` SQL in its "Clockworks Schema" section. If the Clockworks moves to Stacks books, this schema section will need updating. However, the architecture doc is a design document, and the question of whether Clockworks events should be Stacks books or remain as raw SQL tables (they are described as "internal operational state" separate from the guild's Books) is a design decision that hasn't been made yet.

### 3. schema.md documents event_dispatches with pre-Stacks column types
`docs/reference/schema.md` documents the `events` and `event_dispatches` tables with full column definitions. This is currently accurate (the tables exist in the SQL migrations). When/if these tables are replaced by Stacks books, schema.md will need updating — but that should happen alongside the implementation change, not ahead of it.

### 4. Authoring section engine() handler uses EngineContext not RelayContext
The `engine()` factory in the Authoring section shows `EngineContext` as `{ home: string }`. The Clockworks architecture doc describes relays receiving `{ home, params }` via `RelayContext`. There may be a naming/context mismatch between what the core-api.md documents and what the Clockworks relay contract specifies. The `relay()` factory is not documented in core-api.md at all, despite being mentioned in the Clockworks architecture doc as a `nexus-core` export.

### 5. Infrastructure Paths table lists deprecated ledgerPath but not clockPidPath/clockLogPath
The Infrastructure Paths table includes `ledgerPath` (deprecated alias for `booksPath`) but does not list `clockPidPath` or `clockLogPath`, which are actually exported from `@shardworks/nexus-core` (confirmed in `index.ts`). Minor omission.
