# Inventory: enhance-crawl-cli-behavior-improve

## Brief Summary

Three changes to spider crawl tools:
1. Rename tool `crawl` → `crawl-one`
2. Rename tool `crawlContinual` → `crawl-continual`
3. Change `crawl-continual` default `maxIdleCycles` from 3 to infinity (never stop)

---

## Affected Code

### Files to Modify

**`/workspace/nexus/packages/plugins/spider/src/tools/crawl.ts`**
- Current tool name: `name: 'crawl'`
- Rename to `name: 'crawl-one'`
- Description currently: `"Execute one step of the Spider's crawl loop"`
- Full file is 25 lines. Simple tool definition wrapping `spider.crawl()`.

**`/workspace/nexus/packages/plugins/spider/src/tools/crawl-continual.ts`**
- Current tool name: `name: 'crawlContinual'`
- Rename to `name: 'crawl-continual'`
- Description currently: `"Run the Spider's crawl loop continuously until idle"`
- `maxIdleCycles` param: `z.number().optional().default(3)` — change default so loop never stops.
- The loop condition is `while (idleCount < maxIdle)` (line 46). To make it run forever by default, the default must become `Infinity` or equivalent, or the loop logic must change to treat 0/undefined as "no limit".
- `pollIntervalMs` param unchanged.
- Console log references `[crawlContinual]` (line 52) — update to `[crawl-continual]`?

**`/workspace/nexus/packages/plugins/spider/src/tools/index.ts`**
- Current exports:
  ```ts
  export { default as crawlTool } from './crawl.ts';
  export { default as crawlContinualTool } from './crawl-continual.ts';
  ```
- Export names (`crawlTool`, `crawlContinualTool`) are internal identifiers consumed by `spider.ts`. These are code-level identifiers, not user-facing — renaming is optional but may improve clarity.

**`/workspace/nexus/packages/plugins/spider/src/spider.ts`**
- Imports: `import { crawlTool, crawlContinualTool } from './tools/index.ts';` (line 42)
- Used in `supportKit.tools`: `tools: [crawlTool, crawlContinualTool]` (line 382)
- Only changes needed if export names change in `tools/index.ts`.

### Files That May Need Filename Changes

- `crawl.ts` → consider renaming to `crawl-one.ts` for consistency with tool name
- `crawl-continual.ts` — filename already matches new tool name, no change needed

### Test Files

**`/workspace/nexus/packages/plugins/spider/src/spider.test.ts`**
- Large test file (18760 tokens). Tests the spider's crawl loop (rig lifecycle, walk priority, engine execution, failure propagation, CDC writ transitions).
- Tests call `spider.crawl()` directly on the SpiderApi, NOT via tool handlers. The API method name `crawl()` on `SpiderApi` is unchanged.
- No tests invoke tools by name (`crawl` or `crawlContinual`). The tools are thin wrappers around the API.
- **No test changes needed** unless we add tests for the renamed tools specifically or for the new default idle behavior.

### Types (no changes needed)

**`/workspace/nexus/packages/plugins/spider/src/types.ts`**
- `SpiderApi.crawl()` method name — unchanged (API method, not CLI tool name)
- `SpiderConfig` — no `maxIdleCycles` field here (it's a tool param, not config)
- `CrawlResult` type — unchanged

### Package index (no changes needed)

**`/workspace/nexus/packages/plugins/spider/src/index.ts`**
- Re-exports types and `createSpider()`. No tool names referenced.

---

## Adjacent Patterns — Tool Naming Conventions

Other tools in the codebase use **hyphenated names** consistently:
- `dispatch-next`, `writ-complete`, `writ-list`, `writ-fail`, `writ-accept`, `writ-show`, `writ-cancel`
- `commission-post`, `session-show`, `session-list`
- `codex-add`, `codex-remove`, `codex-list`, `codex-show`, `codex-push`
- `draft-list`, `draft-abandon`, `draft-seal`, `draft-open`
- `conversation-end`, `conversation-list`, `conversation-show`
- `tools-show`, `tools-list`
- `summon` (single word, no hyphen needed)

**The spider tools are the only ones using camelCase (`crawlContinual`) or bare single-word naming that's ambiguous (`crawl`).** This change brings them into line with the rest of the codebase.

The `tool()` function (from `@shardworks/tools-apparatus`) takes a `name` string that becomes both the MCP tool name and the CLI subcommand. The name is used as-is — no transformation from camelCase to kebab-case.

---

## Default Idle Behavior — Design Considerations

Current behavior:
```ts
maxIdleCycles: z.number().optional().default(3)
```
Loop: `while (idleCount < maxIdle)` — stops after 3 consecutive idle cycles.

To make the spider never stop by default:
- Option A: `.default(Infinity)` — `idleCount < Infinity` is always true. Zod `z.number()` accepts `Infinity`. Simple, loop logic unchanged.
- Option B: `.default(0)` with loop condition `while (maxIdle === 0 || idleCount < maxIdle)` — 0 means "no limit". More conventional but requires loop logic change.
- Option C: Make the param nullable, where `null`/`undefined` means "no limit". Similar to B.

The description string also needs updating: `'Number of consecutive idle crawl() calls before stopping (default: 3)'` → update to reflect new default.

---

## Doc/Code Discrepancies

1. **Spider doc (`docs/architecture/apparatus/spider.md`) line 63-64** references tool names as `walk` and `crawlContinual` in the kit contribution example. The code uses `crawlTool` and `crawlContinualTool` as export names. The doc also says `walk` instead of `crawl` — this is stale.

2. **Spider doc line 69** has a note: *"Tool naming note: Hyphenated tool names have known issues with CLI argument parsing..."* — this concern may no longer be relevant, and the rest of the codebase has moved to hyphenated names.

3. **Spider doc line 103-109** references `start-walking` tool and `nsg start-crawling` / `nsg crawl` commands. These don't match actual tool names in code (`crawl`, `crawlContinual`). The doc appears to be from an earlier design phase.

4. **Spider doc line 15-16** describes the operational model: *"The Spider's core is a single step function"* and describes polling behavior with *"When crawl() returns null, the loop doesn't stop — it keeps polling."* — This contradicts the actual `crawlContinual` implementation which DOES stop after idle cycles. The brief's change (never stop by default) would bring the code IN LINE with this doc description.

---

## Existing Context

- **Spider doc tool naming note (line 69)**: Explicitly flags tool naming as TBD — *"Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands."*
- No TODO comments in the crawl tool source files.
- No prior commissions found related to crawl tool renaming.
- No backlog entries found specifically about this change.
- The spider plugin's `package.json` is at `/workspace/nexus/packages/plugins/spider/package.json`.

---

## Full Pipeline — No Downstream Impact

The tool names are terminal — they're invoked by users via CLI (`nsg crawl`) or by animas via MCP. No other code imports or references the tool names programmatically. The `SpiderApi.crawl()` method name is unchanged, so all internal spider logic and tests are unaffected.

The `supportKit.tools` array in `spider.ts` just passes tool definition objects — it doesn't reference tool names as strings.
