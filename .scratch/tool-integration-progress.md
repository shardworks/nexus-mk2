# Tool-Equipped Sessions — Integration Progress

Tracking the work to get MCP tools working in anima sessions launched via the Animator and claude-code provider.

**Goal:** When `summon()` is called with a role, the session should have an MCP tool server attached with the role's permission-gated tool set.

**Decision (revised):** Loom resolves tools. The Loom resolves role → permissions → tools (via Instrumentarium) and returns `tools: ResolvedTool[]` on the AnimaWeave. The Animator receives the resolved tool set and handles MCP server lifecycle. This keeps tool resolution and system prompt composition together — the Loom needs to know which tools are selected to weave their instructions into the prompt.

**Decision:** `callableFrom` → `callableBy` rename. Caller types change from transport-based (`mcp`, `cli`, `import`) to identity-based (`anima`, `cli`, `library`). The Loom always passes `caller: 'anima'` as a constant — no channel parameter needed on `WeaveRequest`.

**Decision (revised):** In-process HTTP transport. MCP server runs in the Animator's process via Streamable HTTP on an ephemeral localhost port, rather than as a stdio child process. Eliminates duplicate guild boot, SQLite contention, permissions serialization, and the need for a runnable entry point script. Claude connects via `--mcp-config` with `type: "http"`. Provider owns server lifecycle (start before session, stop after exit).

---

## Phase 1: Foundation ✅

Establish the clean interfaces before wiring them together.

### 1a. Claude Code architecture doc ✅

- [x] Draft arch doc in `.scratch/claude-code-arch-doc.md`
- [ ] Sean review → publish to `docs/architecture/apparatus/claude-code.md`

### 1b. Modernize MCP server module ✅

- [x] `createMcpServer()` accepts `ToolDefinition[]` directly (no module-path loading)
- [x] Removed legacy code: `ToolSpec`, `McpServerConfig` (old shape), `loadTool()`, `resolveToolFromExport()`
- [x] `startMcpServer()` process entry point sketched (guild boot via dynamic import of arbor)
- [x] `McpServerProcessConfig` type defined (home, permissions, strict)
- [x] `createMcpServer` + `McpServerProcessConfig` exported from barrel
- [x] Tests updated — 4 tests for createMcpServer with real ToolDefinitions
- [x] All 20 claude-code tests pass, typecheck clean
- [x] Updated known-gaps.md entry

**Files changed (nexus repo):**
- `packages/plugins/claude-code/src/mcp-server.ts` — rewritten
- `packages/plugins/claude-code/src/mcp-server.test.ts` — rewritten
- `packages/plugins/claude-code/src/index.ts` — added barrel exports

---

## Phase 2: Plumbing ✅

Wire tool resolution into the session lifecycle. The Loom resolves tools; the Animator passes them through.

### 2a. Rename `callableFrom` → `callableBy` ✅

- [x] Rename `ToolCaller` values: `'mcp'` → `'anima'`, `'import'` → `'library'`, keep `'cli'`
- [x] Rename `callableFrom` → `callableBy` in `ToolConfig`, `ToolDefinition`, `tool()` factory
- [x] Rename `channel` → `caller` in `ResolveOptions` and `instrumentarium.resolve()`
- [x] Update `createMcpServer` filter: `callableFrom: 'mcp'` → `callableBy: 'anima'`
- [x] Update `summon` tool: `callableFrom: 'cli'` → `callableBy: 'cli'`
- [x] Update all tests (instrumentarium, mcp-server, tool, CLI)
- [x] Update all CLI framework commands (`init`, `plugin`, `status`, `version`, `upgrade`)
- [x] Update `startMcpServer` inline API type and call (`channel: 'mcp'` → `caller: 'anima'`)
- [x] Update arch docs: Instrumentarium, Animator, Claude Code, Loom
- [x] Update READMEs: tools, animator, cli, root
- [x] 169 tests pass, typecheck clean across all affected packages

**Files changed (nexus repo):**
- `packages/plugins/tools/src/tool.ts` — `ToolCaller` type, `callableFrom` → `callableBy`
- `packages/plugins/tools/src/instrumentarium.ts` — `channel` → `caller`, comments
- `packages/plugins/tools/src/tool.test.ts` — updated test names and values
- `packages/plugins/tools/src/instrumentarium.test.ts` — updated test helper, test cases
- `packages/plugins/claude-code/src/mcp-server.ts` — filter and inline API type
- `packages/plugins/claude-code/src/mcp-server.test.ts` — updated helper and test cases
- `packages/plugins/animator/src/tools/summon.ts` — `callableBy: 'cli'`
- `packages/framework/cli/src/` — all command files, program.ts, cli.ts, all test files

### 2b. Loom resolves tools ✅

- [x] Add `tools` to Loom's `requires: ['tools']`
- [x] Add `@shardworks/tools-apparatus` and `zod` to Loom package.json dependencies
- [x] Add `LoomConfig` and `RoleDefinition` types
- [x] Add GuildConfig module augmentation for typed `guild().guildConfig().loom`
- [x] Loom `start()` reads config from `guild().guildConfig().loom`
- [x] Loom `weave()` resolves role → permissions from config roles
- [x] Loom calls `instrumentarium.resolve({ permissions, strict, caller: 'anima' })`
- [x] Return `tools?: ResolvedTool[]` on `AnimaWeave`
- [x] Added `LoomConfig`, `RoleDefinition` to barrel exports
- [x] Rewrote Loom tests: 13 tests covering tool resolution with mock Instrumentarium
- [x] 13 tests pass, typecheck clean

**Files changed (nexus repo):**
- `packages/plugins/loom/src/loom.ts` — rewritten with tool resolution
- `packages/plugins/loom/src/index.ts` — barrel + GuildConfig augmentation
- `packages/plugins/loom/src/loom.test.ts` — rewritten with guild mock + mock Instrumentarium
- `packages/plugins/loom/package.json` — added tools-apparatus and zod dependencies

### 2c. Add `tools` to `SessionProviderConfig` ✅

- [x] Add optional `tools?: ResolvedTool[]` to `SessionProviderConfig` in animator types.ts
- [x] Import `ResolvedTool` from tools-apparatus
- [x] `buildProviderConfig()` passes `context.tools` through from AnimaWeave
- [x] Fixed Animator test setup ordering: `setGuild()` before Loom `start()` (Loom now reads config in start)
- [x] 40 animator tests pass (28 + 12 session tools), typecheck clean

**Files changed (nexus repo):**
- `packages/plugins/animator/src/types.ts` — `tools` field on `SessionProviderConfig`
- `packages/plugins/animator/src/animator.ts` — `buildProviderConfig` passes tools through
- `packages/plugins/animator/src/animator.test.ts` — reordered setup to setGuild before Loom start

### 2d. Tool instruction pre-loading ✅

Instrumentarium pre-loads `instructionsFile` at registration time, mutating the stored ToolDefinition so `instructions` is always text (single source of truth).

- [x] In `register()`: for tools with `instructionsFile`, resolve path from `{guildRoot}/node_modules/{packageName}/{instructionsFile}`
- [x] Read file, set `instructions` to content, clear `instructionsFile`
- [x] Warn on missing file, don't block registration
- [x] Tools with inline `instructions` are unchanged
- [x] Tools with neither field are unchanged
- [x] Update Instrumentarium arch doc ✅
- [x] 4 new tests: pre-load from file, preserve inline, missing file warns, no instructions unchanged
- [x] 173 tests pass across all affected packages

**Files changed (nexus repo):**
- `packages/plugins/tools/src/instrumentarium.ts` — `preloadInstructions()`, `setHome()`, updated `register()`/`registerToolsFromKit()` signatures
- `packages/plugins/tools/src/instrumentarium.test.ts` — 4 new tests with real temp files, `home` param on helpers

---

## Phase 3: Provider Integration ✅

Make claude-code actually launch sessions with tools via in-process HTTP MCP server.

### 3a. `startMcpHttpServer()` — in-process HTTP server ✅

- [x] Add `startMcpHttpServer(tools)` → `{ url, close }` to `mcp-server.ts`
- [x] Uses `StreamableHTTPServerTransport` in stateless mode (one session per server)
- [x] Binds to `127.0.0.1:0` (ephemeral port, localhost only)
- [x] Returns `McpHttpHandle` with URL and `close()` for cleanup
- [x] `close()` shuts down transport + HTTP server
- [x] Remove dead code: `startMcpServer()`, `McpServerProcessConfig`, `StdioServerTransport` import
- [x] Update barrel exports (remove `McpServerProcessConfig`)
- [x] Tests for start/close lifecycle, tool availability via HTTP

### 3b. Wire `--mcp-config` into provider ✅

- [x] `prepareSession()` returns optional `cleanup` function (for MCP server shutdown)
- [x] When `config.tools` has entries: start MCP HTTP server, write `--mcp-config` JSON, add args
- [x] `--strict-mcp-config` added (only guild tools, no ambient MCP)
- [x] `launch()` calls `cleanup()` after session exits (same finally block as tmpDir removal)
- [x] Tests for prepareSession with tools, arg assembly, cleanup ordering

**Files changed (nexus repo):**
- `packages/plugins/claude-code/src/mcp-server.ts` — removed `startMcpServer()`, `McpServerProcessConfig`, `StdioServerTransport`; added `startMcpHttpServer()`, `McpHttpHandle`
- `packages/plugins/claude-code/src/mcp-server.test.ts` — added 6 tests for `startMcpHttpServer()` (lifecycle, port, HTTP connectivity, concurrency, close, empty tools)
- `packages/plugins/claude-code/src/index.ts` — `prepareSession()` now async, starts MCP HTTP server when tools present, writes `--mcp-config` JSON; `launch()` bridges async prep with sync return; barrel exports updated
- `docs/architecture/apparatus/claude-code.md` — rewrote MCP Tool Server section (HTTP transport, lifecycle, config format, concurrency); added Future: Server Reuse section; removed resolved open questions

---

## Phase 4: (Absorbed into Phase 2d)

---

## Phase 5: End-to-End Verification 🔲

- [ ] Configure a test guild with roles and permissions in guild.json
- [ ] `nsg summon --role artificer "do something"` → session has tools
- [ ] Verify tool invocation works (anima calls a tool, handler executes, result returned)
- [ ] Verify permission gating (role without write permission can't use write tools)
- [ ] Verify `callableBy: ['cli']` tools don't appear in anima sessions

---

## Open Questions

1. ~~**SQLite concurrency**~~ — resolved by HTTP transport. MCP server runs in-process; single guild instance, no concurrent-writer concern.

2. ~~**`--bare` mode transition**~~ — resolved. `--bare` is incompatible with OAuth authentication; `--setting-sources user` is already in place and is the best available isolation without breaking auth.

3. ~~**MCP server startup time**~~ — resolved by HTTP transport. No guild boot; HTTP server starts in milliseconds.

4. ~~**Tool instructions delivery**~~ — resolved for tool integration scope. Phase 2d implemented `instructionsFile` pre-loading at Instrumentarium registration time. Tool definitions carry pre-loaded `instructions` text on `ResolvedTool`. The remaining work — the Loom weaving those instructions into the system prompt — is a prompt composition concern tracked under the Loom's full composition milestone, not the tool integration track.

5. **Server reuse** — currently each session gets its own HTTP server. A future optimization could pool servers by tool-set hash, reference-count active sessions, and close on idle timeout. Not implemented; revisit if launch latency matters.
