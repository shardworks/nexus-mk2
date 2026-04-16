# Click CLI Commands — Ratchet P2

## Intent

Complete the Ratchet plugin's CLI surface by backfilling API methods and tools that the architecture spec defined but P1 deferred: a `click-tree` command for hierarchy visualization, `rootId` filtering on `click-list`, goals-only default on `click-extract`, and positional ID support in the CLI framework. All 12 click commands should work as `nsg click <subcommand>` via auto-discovery.

## Rationale

The Ratchet P1 commission landed the data layer, core API, and 11 MCP tools. These tools auto-register as CLI commands, but the CLI experience has gaps: there's no tree visualization (the primary orientation command), `click-list` can't filter by subtree, `click-extract` always dumps conclusions, and `click-show` requires the `--id` flag. This commission closes those gaps so the click system is usable as a day-to-day CLI workflow tool.

## Scope & Blast Radius

**Ratchet plugin** (`packages/plugins/ratchet/`):
- **Types**: `RatchetApi` interface gains a `tree()` method. `ClickFilters` gains `rootId`. `ExtractClickRequest` gains `full`.
- **API implementation** (`ratchet.ts`): The internal `buildTree()` must be generalized to support depth limiting, status filtering, and multi-root (forest) mode. `list()` must support recursive descendant lookup via `rootId`. `extract()`/`renderMarkdown()` must respect the `full` flag, defaulting to goals-only.
- **New tool**: `click-tree` tool file, registered in `supportKit.tools` and exported from `tools/index.ts`.
- **Modified tools**: `click-extract` (add `full` param), `click-list` (add `rootId` param).

**CLI framework** (`packages/framework/cli/`):
- `buildToolCommand()` in `program.ts` must detect tools with a single required string param named `id` or ending in `Id` and auto-register that param as a positional argument in addition to the flag. This is a convention-based heuristic — no tool metadata changes needed.

**Breaking change**: `click-extract` currently includes conclusions by default. After this change, the default is goals-only (`full=false`). Existing consumers that relied on seeing conclusions in extract output will need to pass `--full`.

**Cross-cutting concerns**:
- The positional ID convention in the CLI framework affects every tool matching the heuristic (param named `id` or ending `Id` that is the sole required string param). Verify with a grep across all tool definitions to understand the full blast radius.
- The `supportKit.tools` array in the plugin registration must include the new `clickTree` tool.

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Should the Ratchet plugin be modified? | Yes — extend the API and types for tree(), rootId, and full. | The architecture spec already defines these surfaces. P1 deferred them; this commission completes them. |
| D2 | Where does tree rendering logic live? | `tree()` API method returns `ClickTree[]`; the tool handles rendering. | Matches the extract pattern: API returns data, tool formats presentation. |
| D3 | tree() method signature? | `tree(params?: { rootId?, status?, depth? }): Promise<ClickTree[]>` | Filtering and depth limiting in the API is more efficient — avoids fetching subtrees that will be discarded. |
| D4 | Tree status indicator format? | Unicode indicator prefix only (●, ◇, ○, ✕). No `[status]` bracket suffix. | Reduces noise; the indicator alone is sufficient. |
| D5 | rootId on click-list implementation? | Add `rootId` to `ClickFilters`. API recursively collects descendant IDs, queries with `parentId IN (...)`, then applies remaining filters. | Keeps tool handler thin, consistent with other tools. |
| D6 | --full flag on click-extract? | Add `full?: boolean` to `ExtractClickRequest`, handle in the API. Default `false` (goals only). | Cleaner than post-processing in the tool; regex-stripping conclusions from markdown is fragile. |
| D7 | Positional ID on click-show? | **Patron directive**: Convention — if a tool has exactly one required string param named `id` or ending with `Id`, the CLI auto-registers it as a positional argument. No metadata needed. | Covers click-show, writ-show, and similar tools automatically. |
| D8 | Tree status filtering behavior? | Prune — remove filtered-out nodes AND their entire subtrees. | Simpler, matches common tree-filter UX. Users can omit `--status` for the full tree. |
| D9 | callableBy on Ratchet tools? | Leave unset. Tools remain available to all callers. | Matches the Clerk plugin tools pattern. Click tools serve both CLI and MCP. |
| D10 | Empty tree handling? | Return a human-readable message ("No clicks found." / "No clicks match the given filters."). | More helpful than silent empty output for CLI users. |
| D11 | JSON extract with full=false — conclusion field? | Omit the `conclusion` field entirely from JSON output. | Cleaner for JSON consumers; matches the semantic intent of "goals only." |
| D12 | Tree column alignment? | Right-pad lines to align status indicators to a consistent column. Truncate very long goals with ellipsis if needed. | Visual alignment is key to readability as the primary orientation command. |

## Acceptance Signal

1. **All 12 click commands register**: `nsg click --help` shows subcommands for create, show, list, park, resume, conclude, drop, reparent, link, unlink, extract, and tree.
2. **Tree renders correctly**: `nsg click tree` outputs a forest with `├──`/`└──` connectors, Unicode status indicators (● ◇ ○ ✕), and right-aligned indicator column. `--status`, `--root-id`, and `--depth` flags filter and constrain output. Empty results produce a human-readable message.
3. **Extract defaults to goals-only**: `nsg click extract --id <id>` omits conclusions in both markdown and JSON. `--full` includes them. JSON output with `full=false` has no `conclusion` field on nodes.
4. **List supports rootId**: `nsg click list --root-id <id>` returns all descendants of the given click, not just direct children.
5. **Positional ID works**: `nsg click show <id>` works without the `--id` flag. The `--id` flag still works too.
6. **Tests pass**: All new and modified tools have test coverage. `pnpm -w test` passes. `pnpm -w typecheck` passes.

## Existing Patterns

- **Tool definition pattern**: Every tool in `packages/plugins/ratchet/src/tools/` follows the same structure — `tool()` factory with Zod params, permission, handler calling `guild().apparatus<RatchetApi>('ratchet')`. Follow this exactly for `click-tree`.
- **Repeatable flag pattern**: `click-list.ts` uses `z.union([z.enum([...]), z.array(z.enum([...]))])` for the `status` param, which the CLI detects as repeatable via `isRepeatableSchema()`. Use the same pattern for `click-tree`'s `status` param.
- **ID resolution**: All tools that accept an ID call `ratchet.resolveId(params.id)` to handle prefix matching. `click-tree` should do the same for its optional `rootId`.
- **Extract data/render split**: `click-extract` calls the API's `extract()` which returns structured data or rendered markdown. `click-tree` should follow the same split — API returns `ClickTree[]`, tool renders.
- **CLI buildToolCommand**: `packages/framework/cli/src/program.ts` lines 40–87 show how Zod schemas are converted to Commander options. The positional argument enhancement goes here.
- **Test harness**: `packages/plugins/ratchet/src/ratchet.test.ts` uses `node:test` with in-memory Stacks via `MemoryBackend` and `setGuild()`. Add new tests in the same style.
- **Tool index exports**: `packages/plugins/ratchet/src/tools/index.ts` re-exports all tools as named exports. Add `clickTree` here.
- **Plugin registration**: `ratchet.ts` lines 349–388 show `supportKit.tools` array — add `clickTree` to it.

## What NOT To Do

- **Do not change existing tool behavior** beyond what's specified. The 11 existing tools work correctly — this commission adds to them, it doesn't refactor them.
- **Do not set `callableBy`** on any Ratchet tool. Leave it unset per D9.
- **Do not add `[status]` bracket labels** to tree output. D4 chose indicators only.
- **Do not promote children of filtered-out nodes** in tree rendering. D8 chose prune semantics — filtered nodes and their entire subtrees are removed.
- **Do not add depth control to `click-extract`**. Only `click-tree` gets `--depth`.
- **Do not refactor the `resolveId` boilerplate** across tools. That's a future framework concern.
- **Do not add fallback ASCII characters** for Unicode status indicators. Modern terminals handle ● ◇ ○ ✕ fine.

<task-manifest>
  <task id="t1">
    <name>Extend Ratchet types</name>
    <files>packages/plugins/ratchet/src/types.ts</files>
    <action>Add the tree() method to the RatchetApi interface with the signature from D3. Add rootId to ClickFilters. Add full (boolean, optional) to ExtractClickRequest.</action>
    <verify>pnpm -w typecheck</verify>
    <done>RatchetApi interface declares tree(), ClickFilters includes rootId, ExtractClickRequest includes full. Typecheck fails only because the implementation doesn't satisfy the new interface yet — that's expected.</done>
  </task>

  <task id="t2">
    <name>Implement tree() API method</name>
    <files>packages/plugins/ratchet/src/ratchet.ts</files>
    <action>Generalize the internal buildTree() to support depth limiting and status filtering (prune semantics per D8). Expose a tree() method on the API that returns ClickTree[] — a forest of all roots when no rootId is given, or a single-element array for a specific subtree. When status filtering is applied, exclude non-matching nodes and their entire subtrees. When no clicks match, return an empty array (the tool layer handles the user-facing message per D10).</action>
    <verify>pnpm -w typecheck</verify>
    <done>The RatchetApi implementation satisfies the new tree() signature. buildTree() supports depth and status params.</done>
  </task>

  <task id="t3">
    <name>Implement rootId on list and full on extract</name>
    <files>packages/plugins/ratchet/src/ratchet.ts</files>
    <action>Extend list() to handle rootId in ClickFilters — recursively collect all descendant IDs starting from rootId, then apply other filters (status, limit, offset) to the result set per D5. Extend extract()/renderMarkdown() to respect the full flag per D6 — when full is false (the default), omit conclusions from markdown output and strip the conclusion field from JSON output per D11. Note: this changes existing extract behavior (conclusions were always included before).</action>
    <verify>pnpm -w typecheck</verify>
    <done>list() handles rootId filter. extract() respects full flag with goals-only default. Typecheck passes.</done>
  </task>

  <task id="t4">
    <name>Create click-tree tool</name>
    <files>packages/plugins/ratchet/src/tools/click-tree.ts, packages/plugins/ratchet/src/tools/index.ts, packages/plugins/ratchet/src/ratchet.ts</files>
    <action>Create the click-tree tool following the existing tool pattern. Params: optional rootId (string), optional status (repeatable enum, same union pattern as click-list), optional depth (number). The handler calls the API's tree() method, then renders the result as a text tree with ├──/└── connectors and Unicode status indicators (● live, ◇ parked, ○ concluded, ✕ dropped). Right-pad lines to align indicators to a consistent column per D12, truncating long goals with ellipsis if needed. Use indicator prefix only, no [status] brackets per D4. When the tree is empty, return a human-readable message per D10. Register the tool in the tools/index.ts exports and in supportKit.tools in the plugin registration.</action>
    <verify>pnpm -w typecheck</verify>
    <done>click-tree tool exists, is exported, is registered in supportKit.tools, and typechecks.</done>
  </task>

  <task id="t5">
    <name>Add full param to click-extract tool</name>
    <files>packages/plugins/ratchet/src/tools/click-extract.ts</files>
    <action>Add a full boolean param (optional, default false) to click-extract's Zod schema. Pass it through to the API's extract() call. Update the tool's description/instructions to document that the default is goals-only and --full includes conclusions.</action>
    <verify>pnpm -w typecheck</verify>
    <done>click-extract accepts --full flag and passes it to the API.</done>
  </task>

  <task id="t6">
    <name>Add rootId param to click-list tool</name>
    <files>packages/plugins/ratchet/src/tools/click-list.ts</files>
    <action>Add a rootId string param (optional) to click-list's Zod schema. Pass it through to the API's list() call via ClickFilters. Update instructions to document that --root-id filters to descendants of the given click.</action>
    <verify>pnpm -w typecheck</verify>
    <done>click-list accepts --root-id flag and passes it to the API.</done>
  </task>

  <task id="t7">
    <name>Positional ID convention in CLI framework</name>
    <files>packages/framework/cli/src/program.ts</files>
    <action>Modify buildToolCommand() to detect when a tool has exactly one required string param named 'id' or whose name ends with 'Id'. When detected, register that param as a Commander positional argument (optional, since the flag still works) in addition to the existing --flag option. The handler must merge the positional value into opts if present. This is the patron directive from D7 — the heuristic should be generic, not click-show-specific. Verify the blast radius by checking which existing tools match the heuristic across the codebase.</action>
    <verify>pnpm -w typecheck && grep -r "id: z.string()" packages/plugins/*/src/tools/ to audit which tools gain positional support</verify>
    <done>Tools with a single required string id/Id param accept positional arguments. nsg click show &lt;id&gt; works alongside nsg click show --id &lt;id&gt;.</done>
  </task>

  <task id="t8">
    <name>Test coverage for new and modified functionality</name>
    <files>packages/plugins/ratchet/src/ratchet.test.ts, packages/framework/cli/src/</files>
    <action>Add tests for: (1) tree() API method — forest mode, subtree mode, status filtering with prune semantics, depth limiting, empty tree. (2) click-tree tool — rendering output format, connector characters, status indicators, column alignment, empty message. (3) list() with rootId — returns all descendants, combines with status/limit filters. (4) extract() with full flag — goals-only default for both md and json formats, full mode includes conclusions, JSON omits conclusion field when full=false. (5) Positional ID convention in the CLI framework — verify the heuristic detects matching tools and the positional arg works. Follow the existing test style in ratchet.test.ts (node:test, MemoryBackend, setGuild).</action>
    <verify>pnpm -w test</verify>
    <done>All new and modified functionality has test coverage. Test suite passes.</done>
  </task>
</task-manifest>