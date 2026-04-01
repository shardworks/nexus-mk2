# Tool-Equipped Sessions — Integration Progress

Tracking the work to get MCP tools working in anima sessions launched via the Animator and claude-code provider.

**Goal:** When `summon()` is called with a role, the session should have an MCP tool server attached with the role's permission-gated tool set.

**Decision:** Option 1 — Animator resolves tools (matches existing arch spec). The Loom resolves role → permissions; the Animator calls the Instrumentarium; the provider attaches the MCP server.

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

## Phase 2: Plumbing 🔲

Wire the tool resolution into the session lifecycle.

### 2a. Add `tools` to `SessionProviderConfig`

- [ ] Add optional `tools?: ToolDefinition[]` to `SessionProviderConfig` in animator types.ts
- [ ] Update arch doc for Animator (Future: Tool-Equipped Sessions → current)

### 2b. Extend `AnimaWeave` with permissions

- [ ] Add `permissions?: string[]` to `AnimaWeave` in loom types
- [ ] Loom `weave()` resolves role → permissions from `guild.json["loom"]["roles"]`
- [ ] Update Loom arch doc

### 2c. Animator resolves tools

- [ ] Add `tools` to Animator's `requires` (or `recommends`)
- [ ] In `animate()`: if weave has permissions, call `instrumentarium.resolve({ permissions, channel: 'mcp' })`
- [ ] Pass resolved `ToolDefinition[]` to provider via `SessionProviderConfig.tools`
- [ ] Update Animator arch doc

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

## Phase 4: Loom Permissions 🔲

The Loom resolves roles into permission grants.

- [ ] Implement role config reading from `guild.json["loom"]["roles"]`
- [ ] `weave({ role })` resolves role → permissions array
- [ ] Include permissions in returned `AnimaWeave`
- [ ] Add `tools` to Loom's `requires` (for future: tool instructions)
- [ ] Update Loom arch doc — move Role Ownership section from Future to current

---

## Phase 5: End-to-End Verification 🔲

- [ ] Configure a test guild with roles and permissions in guild.json
- [ ] `nsg summon --role artificer "do something"` → session has tools
- [ ] Verify tool invocation works (anima calls a tool, handler executes, result returned)
- [ ] Verify permission gating (role without write permission can't use write tools)
- [ ] Verify `callableFrom: ['cli']` tools don't appear in MCP

---

## Open Questions

1. **SQLite concurrency** — main process and MCP server process both access `.nexus/nexus.db`. SQLite handles concurrent readers fine, but concurrent writers could contend (WAL mode helps). Need to verify behavior under load.

2. **`--bare` mode transition** — when should we switch from `--setting-sources user` to `--bare`? Probably when Loom produces real system prompts AND MCP is attached (full session control). Need to test that `--bare` + `--mcp-config` + `--system-prompt-file` gives complete control with no ambient leakage.

3. **MCP server startup time** — guild boot adds latency to MCP server readiness. Is this acceptable? Claude's runtime waits for the MCP server handshake before starting the session. Measure in practice.

4. **Tool instructions delivery** — the Instrumentarium arch doc mentions per-tool `instructions.md` delivered via the Loom to the system prompt. This is orthogonal to MCP tool serving but part of the full tool experience. Track separately.
