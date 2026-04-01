# Tool-Equipped Sessions — Integration Progress

Tracking the work to get MCP tools working in anima sessions launched via the Animator and claude-code provider.

**Goal:** When `summon()` is called with a role, the session should have an MCP tool server attached with the role's permission-gated tool set.

**Decision (revised):** Loom resolves tools. The Loom resolves role → permissions → tools (via Instrumentarium) and returns `tools: ResolvedTool[]` on the AnimaWeave. The Animator receives the resolved tool set and handles MCP server lifecycle. This keeps tool resolution and system prompt composition together — the Loom needs to know which tools are selected to weave their instructions into the prompt.

**Decision:** `callableFrom` → `callableBy` rename. Caller types change from transport-based (`mcp`, `cli`, `import`) to identity-based (`anima`, `cli`, `library`). The Loom always passes `caller: 'anima'` as a constant — no channel parameter needed on `WeaveRequest`.

**Decision:** Guild runtime approach A — MCP server process boots its own guild instance. Simple, proven pattern, clean isolation.

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

## Phase 3: Provider Integration 🔲

Make claude-code actually launch sessions with tools.

### 3a. Wire `--mcp-config` into provider

- [ ] `prepareSession()` detects `config.tools` presence
- [ ] Writes MCP server process config JSON to temp dir
- [ ] Writes `--mcp-config` JSON (mcpServers block) to temp dir
- [ ] Adds `--mcp-config <path>` and `--strict-mcp-config` to CLI args
- [ ] Consider switching to `--bare` mode when tools are attached

### 3b. MCP server process entry point

- [ ] Add `@shardworks/nexus-arbor` as runtime dependency (or verify co-installation is sufficient)
- [ ] Add `"./mcp-server"` entry point to package.json exports (or bin entry)
- [ ] Test end-to-end: provider writes config → Claude spawns MCP server → tools are available
- [ ] Verify tool handlers can access guild() and call apparatus APIs

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

1. **SQLite concurrency** — main process and MCP server process both access `.nexus/nexus.db`. SQLite handles concurrent readers fine, but concurrent writers could contend (WAL mode helps). Need to verify behavior under load.

2. **`--bare` mode transition** — when should we switch from `--setting-sources user` to `--bare`? Probably when Loom produces real system prompts AND MCP is attached (full session control). Need to test that `--bare` + `--mcp-config` + `--system-prompt-file` gives complete control with no ambient leakage.

3. **MCP server startup time** — guild boot adds latency to MCP server readiness. Is this acceptable? Claude's runtime waits for the MCP server handshake before starting the session. Measure in practice.

4. **Tool instructions delivery** — the Instrumentarium arch doc mentions per-tool `instructions.md` delivered via the Loom to the system prompt. This is orthogonal to MCP tool serving but part of the full tool experience. Track separately.
