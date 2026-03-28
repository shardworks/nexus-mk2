# Core + Mainspring Type Analysis

## Table 1: All Types

### Package: `@shardworks/nexus-core` (non-legacy)

| Type | Kind | Source File | Summary |
|------|------|-------------|---------|
| `BookSchema` | interface | `rig.ts` | Schema declaration for a single Book: `indexes?: string[]`. Declared in `Rig.books` |
| `Rig` | interface | `rig.ts` | Author-facing rig export: `tools?: ToolDefinition[]`, `books?: Record<string, BookSchema>` |
| `BookQuery` | interface | `book.ts` | Query options: `where`, `orderBy`, `order`, `limit`, `offset` |
| `ListOptions` | type alias | `book.ts` | `Pick<BookQuery, 'orderBy' \| 'order' \| 'limit' \| 'offset'>` — list() without where |
| `Book<T>` | interface | `book.ts` | Writable doc-collection API: `put`, `get`, `delete`, `find`, `list`, `count` |
| `ReadOnlyBook<T>` | type alias | `book.ts` | `Pick<Book<T>, 'get' \| 'find' \| 'list' \| 'count'>` — cross-rig read access |
| `RigContext` | interface | `rig-context.ts` | Handler injection context: `home`, `book<T>()`, `rigBook<T>()` |
| `ToolChannel` | type alias | `tool.ts` | `'cli' \| 'mcp'` — deployment channels |
| `ToolDefinition<TShape>` | interface | `tool.ts` | Fully-defined tool: `name`, `description`, `params`, `handler`, `allowedContexts`, instructions |
| `RigDependency` | interface | `rig-descriptor.ts` | Declared rig dependency: `rig: string` (the required rig key) |
| `RigDescriptor` | interface | `rig-descriptor.ts` | `rig.json` shape: `description?`, `dependencies?: RigDependency[]` |
| `RoleDefinition` | interface | `guild-config.ts` | Guild role: `seats`, `tools: string[]`, `instructions?` |
| `ToolEntry` | interface | `guild-config.ts` | Installed artifact record: `upstream`, `installedAt`, `package?`, `bundle?` |
| `TrainingEntry` | interface | `guild-config.ts` | Installed training artifact: `upstream`, `installedAt`, `bundle?` |
| `WorkshopEntry` | interface | `guild-config.ts` | Registered workshop: `remoteUrl`, `addedAt` |
| `EventDeclaration` | interface | `guild-config.ts` | Custom event in clockworks: `description?`, `schema?` |
| `WritTypeDeclaration` | interface | `guild-config.ts` | Writ type entry: `description: string` |
| `StandingOrder` | type alias | `guild-config.ts` | Union: `{ on, run }` \| `{ on, summon, prompt? }` \| `{ on, brief }` |
| `ClockworksConfig` | interface | `guild-config.ts` | Clockworks block: `events?`, `standingOrders?` |
| `GuildSettings` | interface | `guild-config.ts` | Operational flags: `autoMigrate?` |
| `GuildConfig` | interface | `guild-config.ts` | Full `guild.json` shape — the guild's central config document |

### Package: `@shardworks/nexus-mainspring`

| Type | Kind | Source File | Summary |
|------|------|-------------|---------|
| `LoadedRig` | interface | `mainspring.ts` | Runtime rig: `packageName`, `key`, `version`, `instance: Rig`, `tools: Tool[]` |
| `Tool` | interface | `mainspring.ts` | `ToolDefinition` + `rigName: string` — tool with provenance |
| `ListToolsOptions` | interface | `mainspring.ts` | Filter options for `listTools()`: `channel?`, `roles?` |
| `Mainspring` | interface | `mainspring.ts` | Guild runtime: home, config, rigs, tools, database, context factory |
| `SqlRow` | type alias | `db/sqlite-adapter.ts` | `Record<string, unknown>` — a row from a SELECT |
| `SqlResult` | interface | `db/sqlite-adapter.ts` | SQL execution result: `rows`, `columns`, `rowsAffected`, `lastInsertRowid` |
| `BooksDatabase` | interface | `db/sqlite-adapter.ts` | Abstract SQL layer: `execute(sql, args?) → Promise<SqlResult>` |
| `BookStore<T>` | class | `db/book-store.ts` | Concrete SQLite implementation of `Book<T>`. Constructed by `createRigContext()` |

---

## Table 2: Type Dependencies

| Depender | Depends On | Package | Nature |
|----------|------------|---------|--------|
| `Rig` | `ToolDefinition` | core→core | `tools?: ToolDefinition[]` |
| `Rig` | `BookSchema` | core→core | `books?: Record<string, BookSchema>` |
| `ListOptions` | `BookQuery` | core→core | `Pick<BookQuery, ...>` — structural reuse |
| `Book<T>` | `BookQuery` | core→core | `find(query: BookQuery)` parameter |
| `Book<T>` | `ListOptions` | core→core | `list(options?: ListOptions)` parameter |
| `ReadOnlyBook<T>` | `Book<T>` | core→core | `Pick<Book<T>, 'get'\|'find'\|'list'\|'count'>` |
| `RigContext` | `Book<T>` | core→core | `book<T>()` return type |
| `RigContext` | `ReadOnlyBook<T>` | core→core | `rigBook<T>()` return type |
| `ToolDefinition` | `RigContext` | core→core | `handler(params, context: RigContext)` |
| `ToolDefinition` | `ToolChannel` | core→core | `allowedContexts?: ToolChannel[]` |
| `RigDescriptor` | `RigDependency` | core→core | `dependencies?: RigDependency[]` |
| `ClockworksConfig` | `EventDeclaration` | core→core | `events?: Record<string, EventDeclaration>` |
| `ClockworksConfig` | `StandingOrder` | core→core | `standingOrders?: StandingOrder[]` |
| `GuildConfig` | `WorkshopEntry` | core→core | `workshops: Record<string, WorkshopEntry>` |
| `GuildConfig` | `RoleDefinition` | core→core | `roles: Record<string, RoleDefinition>` |
| `GuildConfig` | `ToolEntry` | core→core | `tools`, `engines` fields |
| `GuildConfig` | `TrainingEntry` | core→core | `curricula`, `temperaments` fields |
| `GuildConfig` | `ClockworksConfig` | core→core | `clockworks?: ClockworksConfig` |
| `GuildConfig` | `WritTypeDeclaration` | core→core | `writTypes?: Record<string, WritTypeDeclaration>` |
| `GuildConfig` | `GuildSettings` | core→core | `settings?: GuildSettings` |
| `SqlResult` | `SqlRow` | mainspring→mainspring | `rows: SqlRow[]` |
| `BooksDatabase` | `SqlResult` | mainspring→mainspring | `execute()` return type |
| `BookStore<T>` | `Book<T>` | mainspring→core | implements `Book<T>` |
| `BookStore<T>` | `BooksDatabase` | mainspring→mainspring | constructor arg; calls `db.execute()` |
| `BookStore<T>` | `BookQuery` | mainspring→core | `find(query: BookQuery)` parameter |
| `BookStore<T>` | `ListOptions` | mainspring→core | `list(options?: ListOptions)` parameter |
| `LoadedRig` | `Rig` | mainspring→core | `instance: Rig` |
| `LoadedRig` | `Tool` | mainspring→mainspring | `tools: Tool[]` |
| `Tool` | `ToolDefinition` | mainspring→core | `interface Tool extends ToolDefinition` |
| `ListToolsOptions` | `ToolChannel` | mainspring→core | `channel?: ToolChannel` |
| `Mainspring` | `GuildConfig` | mainspring→core | `getGuildConfig()` return |
| `Mainspring` | `LoadedRig` | mainspring→mainspring | `listRigs()` return |
| `Mainspring` | `Tool` | mainspring→mainspring | `listTools()`, `findTool()` return |
| `Mainspring` | `ListToolsOptions` | mainspring→mainspring | `listTools(options?)` parameter |
| `Mainspring` | `BooksDatabase` | mainspring→mainspring | `getDatabase()` return |
| `Mainspring` | `RigContext` | mainspring→core | `createRigContext()` return |
| `reconcileBooks()` | `BooksDatabase` | mainspring→mainspring | db parameter |
| `reconcileBooks()` | `LoadedRig` | mainspring→mainspring | rigs parameter; reads `rig.instance.books` |

---

## Analysis: Redundancy, Coupling, Streamlining Opportunities

### 1. 🔴 `GuildConfig.plugins` — stale field name

`GuildConfig.plugins?: string[]` is described as "installed plugin keys" — but the term "plugin" was renamed to "rig" across the codebase. The field name didn't follow. The guild.json schema now has `plugins` meaning "installed rigs." This is a vocabulary inconsistency that will persist in every live guild.json file. The field should be `rigs?: string[]`, with migration logic for existing files (or backward-compat reading of either).

### 2. 🟡 `ToolEntry` used for both `tools` and `engines` in `GuildConfig`

```ts
tools: Record<string, ToolEntry>;
engines: Record<string, ToolEntry>;
```

Engines and tools are distinct concepts (event handlers vs. invocable actions), but they share the same install-record shape. The type name `ToolEntry` bleeds tool-specific vocabulary into the engine registry. An `InstallRecord` or `ArtifactEntry` base type would be semantically neutral and could serve both, keeping `ToolEntry = ArtifactEntry` as an alias if needed. Low urgency, but it's a naming leakage.

### 3. 🟡 `ToolEntry` and `TrainingEntry` are near-duplicates

```ts
interface ToolEntry    { upstream, installedAt, package?, bundle? }
interface TrainingEntry { upstream, installedAt, bundle? }
```

Same 3 fields, with `ToolEntry` adding `package?`. If these were collapsed into one `InstallRecord` type (with `package?` optional), both registries could use the same type. The distinction between them is only semantic (what category of artifact they represent), not structural. Whether to collapse them is a taste question — keeping them separate preserves the distinction at the type level, which aids discoverability. But they're worth tracking as the registries grow.

### 4. 🟡 `ToolDefinition.allowedContexts` vs. `ToolChannel`

The field is named `allowedContexts` but the type is `ToolChannel[]`. The term "context" is already heavily used in this codebase (`RigContext`, `ToolContext`) with a different meaning — the runtime injection object. Having `allowedContexts` mean "which deployment channels" is a naming collision with the broader concept. `allowedChannels?: ToolChannel[]` would match the type name and avoid the confusion. This affects the `ToolDefinition` interface and the `tool()` factory, so it's a public API change.

### 5. 🟡 `StandingOrder` — structural union, not tagged discriminant

```ts
type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string }
  | { on: string; brief: string };
```

TypeScript can discriminate this structurally (check `'run' in order`), but it requires callers to do duck-typing. A tagged discriminant union (`kind: 'run' | 'summon' | 'brief'`) would give better exhaustiveness checking and cleaner narrowing. Low urgency since clockworks is legacy code, but worth keeping in mind when that area is promoted.

### 6. 🟢 `ListOptions` as `Pick<BookQuery>` — good pattern, no issue

Clean structural reuse. If `BookQuery` grows new fields, `ListOptions` automatically excludes them (since it's a specific pick, not `Omit<>`). This is the right shape for the relationship.

### 7. 🟢 `ReadOnlyBook<T>` as `Pick<Book<T>>` — good pattern, no issue

Same as above — clean. The write operations (`put`, `delete`) are structurally absent rather than overridden. Correct.

### 8. 🟢 `Tool extends ToolDefinition` — thin but appropriate

Adding just `rigName: string` via interface extension is the right call. `interface extends` vs. `type &` is equivalent but interface is more idiomatic for augmentation. No issue.

### 9. 🟢 `BooksDatabase` in mainspring, not core — correct boundary

Confirmed by Sean's explicit direction. The raw SQL interface is internal plumbing; rig authors only touch `RigContext` / `Book<T>`. Good layering.

### 10. 🟢 `reconcileBooks` ← `LoadedRig` — internal cycle is type-only

`reconcile-books.ts` imports `LoadedRig` from `mainspring.ts`, while `mainspring.ts` imports `reconcileBooks` from `reconcile-books.ts`. This is a type-only import in one direction, so no runtime cycle. Fine.

### 11. 🔵 `BookSchema` — likely to grow

Currently `{ indexes?: string[] }`. Future candidates: unique indexes, full-text indexes, compound indexes. The interface is appropriately minimal now, but the name `BookSchema` sets an expectation of being a schema descriptor — the current content (just index hints) is arguably not a full "schema." A name like `BookConfig` or `BookOptions` might be more accurate to what it currently does. This is a naming question, not a structural one.

### 12. 🔵 `GuildConfig` is a large flat type with no sub-grouping

`GuildConfig` has 14 top-level fields. The clockworks config is already extracted (`ClockworksConfig`), and settings into `GuildSettings`. Other groupings could be considered: the four registries (`tools`, `engines`, `curricula`, `temperaments`) all follow a `Record<string, *Entry>` pattern. Whether to group them into a `Registries` sub-object is a matter of taste and backward compat with guild.json on disk.

---

## Summary of Actionable Issues

| Priority | Issue | Effort |
|----------|-------|--------|
| 🔴 High | `GuildConfig.plugins` should be `rigs` — stale name from rename | Medium (migration) |
| 🟡 Med | `allowedContexts` → `allowedChannels` — naming collision with RigContext | Low (API change) |
| 🟡 Med | `ToolEntry` used for engines — consider `ArtifactEntry` base type | Low |
| 🟡 Med | `ToolEntry` ≈ `TrainingEntry` — near-duplicate shapes | Low (cosmetic) |
| 🟡 Med | `StandingOrder` — consider tagged discriminant union | Low (when clockworks promoted) |
| 🔵 Low | `BookSchema` name implies more than it currently contains | Rename only |
