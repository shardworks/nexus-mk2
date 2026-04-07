# Observations — The Oculus

## Inventory gaps: 'cli' → 'patron' rename scope

The inventory identified 5 files needing modification for the ToolCaller rename. Grep reveals **~19 files** total:

**Production code (9 files beyond inventory):**
- `packages/framework/cli/src/cli.ts` — comment mentioning 'cli' callableBy
- `packages/framework/cli/src/commands/status.ts` — `callableBy: ['cli']`
- `packages/framework/cli/src/commands/init.ts` — `callableBy: ['cli']`
- `packages/framework/cli/src/commands/version.ts` — `callableBy: ['cli']`
- `packages/framework/cli/src/commands/upgrade.ts` — `callableBy: ['cli']`
- `packages/framework/cli/src/commands/plugin.ts` — `callableBy: ['cli']` (4 tools in one file)
- `packages/plugins/animator/src/tools/summon.ts` — `callableBy: 'cli'`

**Test files (4 files beyond inventory):**
- `packages/plugins/claude-code/src/mcp-server.test.ts` — 3 references to `'cli'` as ToolCaller
- `packages/framework/cli/src/commands/version.test.ts` — asserts `callableBy: ['cli']`
- `packages/framework/cli/src/commands/plugin.test.ts` — asserts `callableBy: ['cli']` (4 tools)
- `packages/framework/cli/src/commands/status.test.ts` — asserts `callableBy: ['cli']`
- `packages/framework/cli/src/commands/upgrade.test.ts` — asserts `callableBy: ['cli']`
- `packages/plugins/tools/src/tools/tools-show.test.ts` — `callableBy: ['cli', 'anima']`
- `packages/plugins/tools/src/tools/tools-list.test.ts` — `callableBy: ['cli']`

## Permission field format inconsistency

Tool permissions use two different formats in the codebase:

1. **Simple levels:** `'read'`, `'write'`, `'delete'` — used by codexes, tools, spider (some)
2. **Plugin-prefixed:** `'clerk:read'`, `'clerk:write'`, `'spider:write'` — used by clerk, spider (some)
3. **Custom levels:** `'animate'` — used by animator/summon

The `ToolDefinition.permission` docs say "a freeform string chosen by the tool author" with conventional names. The inconsistency between simple and prefixed formats is not a bug — it's intentional flexibility — but it means the HTTP method inference must handle both formats.

## coerceCliOpts only handles numbers

`packages/framework/cli/src/helpers.ts` `coerceCliOpts()` only coerces string→number. The Oculus needs string→boolean coercion too. This could be a candidate for extracting a shared coercion utility used by both CLI and Oculus, but the brief doesn't call for refactoring the CLI. The Oculus should implement its own coercion (number + boolean) independently.

## Stale docs: kit-components.md

`docs/architecture/kit-components.md` describes the Mk 1.x model with `nexus-tool.json` descriptor files and `GUILD_ROOT/tools/` directories. The current codebase uses the kit contribution model exclusively. This doc should be updated or archived in a future commission to avoid confusing new contributors.

## instrumentarium.test.ts stale fixture

The `mockGuild()` helper in `packages/plugins/tools/src/instrumentarium.test.ts` returns `guildConfig()` with `workshops: {}` — a field that doesn't exist in the current `GuildConfig` interface. The field is ignored at runtime (JavaScript doesn't enforce interface shapes) but is misleading. Worth cleaning up in a future test maintenance pass.

## CLAUDE.md parlour description

CLAUDE.md describes `packages/plugins/parlour/` as "web dashboard" but it's actually "multi-turn conversation management". Should be corrected — it's a simple copy error in the project description file.

## Hono's @hono/node-server dependency

The `@hono/node-server` package (needed for running Hono on Node.js) has zero transitive dependencies but is a separate npm package from `hono`. This is the standard pattern for Hono — the core is runtime-agnostic, adapters are separate packages. Worth noting that if the project later targets Bun/Deno, only the adapter changes.

## No existing page contributors

Currently no kit or apparatus in the codebase contributes `pages` or `routes`. The Oculus will be the first consumer of these contribution types. This means the entire contribution interface can be designed without backward compatibility constraints — but also means there are no existing examples to validate against. The first real test will be when a plugin (e.g., clerk, spider) adds a page contribution.
