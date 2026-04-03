# Rename Walker to Spider

Codex: nexus

## Background

The apparatus formerly known as "The Walker" is being renamed to "The Spider." The Spider is the rig execution engine — it spawns rigs for ready writs, drives engine pipelines to completion, and transitions writs via the Clerk on rig completion or failure. The mental image: a huge mechanical spider in the guild's workshop, with long articulated arms that move engines and rig pieces into position.

This is a pure rename — no behavioral changes, no API changes, no new features. Every instance of "walker" (as an apparatus identity, type name, config key, doc reference, tool name, etc.) becomes "spider." Every instance of "walk" (as a verb for the step function) becomes "crawl."

## Naming Map

| Old | New |
|-----|-----|
| `walker` (plugin id, config key, book owner) | `spider` |
| `Walker` (class/type prefix) | `Spider` |
| `walk()` (step function) | `crawl()` |
| `WalkResult` | `CrawlResult` |
| `WalkerApi` | `SpiderApi` |
| `WalkerConfig` | `SpiderConfig` |
| `walkTool` / `walkContinualTool` | `crawlTool` / `crawlContinualTool` |
| `walk` (tool name) | `crawl` |
| `walkContinual` (tool name) | `crawlContinual` |
| `createWalker()` | `createSpider()` |
| `@shardworks/walker-apparatus` | `@shardworks/spider-apparatus` |
| `walkerConfig` (local variable) | `spiderConfig` |

The verb shift from "walk" to "crawl" preserves the convention that the apparatus name implies the verb: the Walker walks, the Spider crawls.

## What to change

### 1. Rename directory

```
packages/plugins/walker/ → packages/plugins/spider/
```

### 2. Rename source files

Within the new `packages/plugins/spider/src/` directory:

- `walker.ts` → `spider.ts`
- `walker.test.ts` → `spider.test.ts`

All other filenames (engines, tools, types, index) stay the same.

### 3. Package identity (`package.json`)

```json
{
  "name": "@shardworks/spider-apparatus",
  "description": "The Spider — rig execution engine apparatus",
  "repository": {
    "directory": "packages/plugins/spider"
  }
}
```

No other changes to package.json fields. Dependencies stay the same.

### 4. Internal source (6 files, ~157 occurrences)

Apply the naming map above across all source files in the spider package:

**`index.ts`:**
- Module doc: `@shardworks/walker-apparatus` → `@shardworks/spider-apparatus`, "The Walker" → "The Spider"
- Import: `'./walker.ts'` → `'./spider.ts'`
- Export names: `WalkerApi`, `WalkerConfig`, `WalkResult` → `SpiderApi`, `SpiderConfig`, `CrawlResult`
- Default export: `createWalker()` → `createSpider()`

**`spider.ts` (renamed from `walker.ts`):**
- All doc comments: "The Walker" → "The Spider", "walk()" → "crawl()", etc.
- Spec reference: `docs/architecture/apparatus/walker.md` → `docs/architecture/apparatus/spider.md`
- Function: `createWalker()` → `createSpider()`
- Local variable: `walkerConfig` → `spiderConfig`
- Config access: `g.guildConfig().walker` → `g.guildConfig().spider`
- Book owner strings: `stacks.book('walker', ...)` → `stacks.book('spider', ...)`
- `stacks.readBook('walker', ...)` → `stacks.readBook('spider', ...)`
- `stacks.watch('walker', ...)` → `stacks.watch('spider', ...)`
- API object: `walk()` → `crawl()` method name
- Apparatus metadata: `requires` array unchanged (still `['stacks', 'clerk', 'fabricator']`)
- Comment: "another walker got here first" → "another spider got here first"

**`types.ts`:**
- All doc comments: "The Walker" → "The Spider"
- Type names: `WalkResult` → `CrawlResult`, `WalkerApi` → `SpiderApi`, `WalkerConfig` → `SpiderConfig`
- Method: `walk()` → `crawl()`
- RigDoc comment: `walker/rigs` → `spider/rigs`
- GuildConfig augmentation: `walker?: WalkerConfig` → `spider?: SpiderConfig`

**`tools/walk.ts` → `tools/crawl.ts`:**
- Rename the file
- Tool name: `'walk'` → `'crawl'`
- Description: "Execute one step of the Walker loop" → "Execute one step of the Spider's crawl loop"
- Instructions: update all "walk" → "crawl", "Walker" → "Spider"
- Permission: `'walker:write'` → `'spider:write'`
- Apparatus lookup: `guild().apparatus<WalkerApi>('walker')` → `guild().apparatus<SpiderApi>('spider')`
- Method call: `walker.walk()` → `spider.crawl()`

**`tools/walk-continual.ts` → `tools/crawl-continual.ts`:**
- Rename the file
- Tool name: `'walkContinual'` → `'crawlContinual'`
- Description/instructions: "Walker" → "Spider", "walk" → "crawl"
- Permission: `'walker:write'` → `'spider:write'`
- Config access: `g.guildConfig().walker` → `g.guildConfig().spider`
- Type: `WalkerApi`, `WalkerConfig` → `SpiderApi`, `SpiderConfig`
- Apparatus lookup: `g.apparatus<WalkerApi>('walker')` → `g.apparatus<SpiderApi>('spider')`
- Error log: `[walkContinual]` → `[crawlContinual]`

**`tools/index.ts`:**
- Update imports and export names to match renamed tool files

**Engine files** (`engines/draft.ts`, `implement.ts`, `review.ts`, `revise.ts`, `seal.ts`):
- These import from `'../types.ts'` — type names change per the naming map
- Any doc comments referencing "The Walker" → "The Spider"
- No behavioral changes

### 5. Consumers in other plugins

**`@shardworks/dashboard-apparatus`** (5 files):
- `server.ts`: `stacks.readBook('walker', 'rigs')` → `stacks.readBook('spider', 'rigs')`, comment "walker not installed" → "spider not installed"
- `html.ts`: all HTML element IDs `walker-*` → `spider-*`, tab label "Walker" → "Spider", JS function/variable names, section comment headers
- `dashboard.ts`: recommends array `'walker'` → `'spider'`
- `index.ts`: doc comment "Walker" → "Spider"
- `rig-types.ts`: doc comment "Walker" → "Spider"

**`@shardworks/dispatch-apparatus`** (3 files):
- `dispatch.ts`, `index.ts`, `README.md`: update comments that reference "Walker" as the system that replaces Dispatch. These are documentation-only changes — no code behavior.

**`@shardworks/fabricator-apparatus`** (1 file):
- `fabricator.ts`: doc comments referencing "the Walker" → "the Spider"

**`@shardworks/animator-apparatus`** (1 file):
- `types.ts`: doc comment referencing "the Walker's review collect step" → "the Spider's review collect step"

### 6. Documentation (`docs/`)

**Rename:** `docs/architecture/apparatus/walker.md` → `docs/architecture/apparatus/spider.md`

**Update content in `spider.md`:** global rename of Walker → Spider, walk → crawl per the naming map. This is the authoritative spec — every type name, config key, tool name, code example, and prose reference must match the new names.

**Update references in other docs** (12 files):
- `docs/architecture/index.md` — apparatus table, prose references, ASCII diagram, code examples
- `docs/architecture/rigging.md` — prose references
- `docs/architecture/plugins.md` — kit interface name `WalkerKit` → `SpiderKit`, code examples
- `docs/architecture/kit-components.md` — prose references
- `docs/architecture/_agent-context.md` — apparatus table, prose references
- `docs/architecture/apparatus/dispatch.md` — prose reference
- `docs/architecture/apparatus/fabricator.md` — prose references
- `docs/architecture/apparatus/animator.md` — prose reference
- `docs/architecture/apparatus/clerk.md` — prose references
- `docs/architecture/apparatus/scriptorium.md` — prose reference
- `docs/architecture/apparatus/review-loop.md` — prose references
- `docs/guild-metaphor.md` — prose references

### 7. Guild configuration key

The guild config key changes from `"walker"` to `"spider"`. Any existing `guild.json` files referencing `"walker": { ... }` must be updated. The GuildConfig module augmentation in `types.ts` changes accordingly (covered in §4).

**Note for live guilds:** After this rename, any running guild that references `walker` in its `guild.json` config or plugin list will need to update to `spider`. This is a breaking change for guild configurations.

### 8. pnpm workspace

After the directory rename, run `pnpm install` to regenerate the lockfile. No manual lockfile edits.

---

## What to validate

- `pnpm build` passes across all packages (no broken imports)
- `pnpm test` passes in the spider package (all existing walker tests, renamed)
- `pnpm test` passes in the dashboard package (if it has tests)
- `tsc --noEmit` clean across the full workspace
- No remaining references to "walker" in any `.ts` file under `packages/plugins/` (case-insensitive search)
- No remaining references to "walker" in any `.md` file under `docs/` (case-insensitive search), except the Dispatch docs which may mention "Walker" in a historical context explaining what Dispatch was replaced by — use judgment
- The `guild-metaphor.md` references are updated
- Tool names `crawl` and `crawlContinual` appear in the tool registry (verify via the support kit's `tools` array)

## What is NOT in scope

- Behavioral changes of any kind — this is purely a rename
- Renaming the `rigs` Stacks book (it stays `rigs` — "rigs" is its own concept, not walker-specific)
- Renaming engine design IDs (`draft`, `implement`, `review`, `revise`, `seal`) — these are engine names, not walker/spider names
- Updating historical data in the sanctum (commission logs, experiment artifacts, session notes) — those reflect what the apparatus was called at the time
- Updating `docs/future/` files in the sanctum — those are handled separately
- Migration tooling for existing guild configs — out of scope for the code change; documented as a breaking change
