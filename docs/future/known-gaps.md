# Known Gaps

Tracked limitations and missing features in the Nexus framework.

## Role instructions are not upgradeable

**Added:** 2026-03-26
**Context:** The `nsg upgrade` command handles npm package updates, migrations, curricula, and temperaments — but role instruction files (`roles/steward.md`, `roles/artificer.md`) are scaffolded once by `nsg init` and never touched again. They are not part of the bundle manifest and have no versioning or upgrade path.

**Impact:** When framework updates include changes to role instructions (new procedures, new tool awareness, boundary clarifications), existing guilds don't receive them. The operator must manually update their guild's role files.

**Proposed fix:** Add role instructions as a new artifact category in the bundle manifest, with versioning and diff-based upgrade support — same treatment as curricula and temperaments. Role instructions are conceptually the same shape: framework-authored markdown files referenced by path in `guild.json`.

**Workaround:** Manually update `roles/*.md` in the guild repo after framework upgrades.

## MCP server module orphaned in claude-code-apparatus

**Added:** 2026-04-01
**Context:** `packages/plugins/claude-code/src/mcp-server.ts` was absorbed from the former `engine-mcp-server` package but never wired into the apparatus model. It exports `createMcpServer`, `main`, `ToolSpec`, and `McpServerConfig` — but nothing imports them. The barrel (`index.ts`) doesn't re-export it, `package.json` doesn't expose it as a secondary entry point, and no other package references it. The module compiles to `dist/mcp-server.js` but is unreachable through the package's public API.

**Impact:** The MCP server is effectively dead code. Its dependencies (`@modelcontextprotocol/sdk`, `zod`, `@shardworks/tools-apparatus`) are carried in `package.json` solely for this module. The module also contains two `as any` type hacks (context stub and handler call) that should be resolved when it's modernized.

**What's needed:** The module needs to be modernized to use the guild runtime and the apparatus model — the context stub currently throws on `config()`, `guildConfig()`, and `apparatus()`. Once modernized: export it from the barrel or as a secondary entry point (`"./mcp-server"`), resolve the type hacks with a proper `McpToolContext` interface, and add unit tests for `createMcpServer` and `loadTool`.

**Related findings:** Code review sweep 2026-04-01 — findings #2 (orphaned module), #5/#6 (type hacks), #8 (barrel export gap), #9 (stale TODO), #10 (dead dependencies).
