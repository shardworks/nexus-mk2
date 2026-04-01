# Code Review Sweep — @shardworks/claude-code-apparatus

**Date:** 2026-04-01
**Target:** `/workspace/nexus/packages/plugins/claude-code/`
**Reviewer:** Coco (interactive session)

## Summary

Small package (2 source files, 0 tests) in decent shape mechanically. The main issues are: **zero test coverage**, an **orphaned MCP server module** that nothing imports or wires up, several **stale name references** from the pre-rename era (`claude-code-session-provider`), two **type hacks**, and **missing barrel export** for the MCP server entry point. 12 findings total; 2 high, 5 medium, 5 low.

## Findings

### Test Gap — Zero test coverage

- **File:** `src/index.ts`, `src/mcp-server.ts`
- **Severity:** high
- **Description:** The package has no test files at all. `package.json` defines a `test` script that globs for `src/**/*.test.ts`, but no such files exist. The session provider (`launch`, `launchStreaming`), NDJSON parsing (`parseStreamJsonMessage`, `processNdjsonBuffer`), and MCP server creation (`createMcpServer`, `loadTool`) are entirely untested. The NDJSON parsing and message accumulation logic is non-trivial and unit-testable without spawning real processes.
- **Suggested fix:** Add unit tests for at minimum: `parseStreamJsonMessage` (all three message types), `processNdjsonBuffer` (partial lines, multiple lines, non-JSON), and `createMcpServer` (tool registration, error handling). The spawn functions can't easily be tested without mocking, but the parsing layer can be extracted and tested directly. Both `parseStreamJsonMessage` and `processNdjsonBuffer` are currently file-private — they'd need to be exported (or tested via a test-only barrel) to be tested in isolation.

---

### Orphaned Module — `mcp-server.ts` not wired into anything

- **File:** `src/mcp-server.ts`
- **Severity:** high
- **Description:** `mcp-server.ts` exports `createMcpServer`, `main`, `ToolSpec`, and `McpServerConfig` — but nothing imports them. The barrel export (`src/index.ts`) doesn't re-export anything from `mcp-server.ts`. The `package.json` doesn't expose it as a secondary entry point or `bin`. No other package in the monorepo imports from this module. The file is compiled to `dist/mcp-server.js` but there's no way to reach it through the package's public API. This means the MCP server is effectively dead code — it was "absorbed from the former `engine-mcp-server` package" (per its own doc comment) but never wired into the new apparatus model.
- **Suggested fix:** Decide the fate of this module. Either: (a) export it from the barrel or as a secondary entry point `"./mcp-server"` so the session provider can launch it, or (b) if MCP tool serving is deferred/redesigned, remove it. The TODO on line 174 ("The MCP server needs to be modernized to use the guild runtime") suggests this is known deferred work — if so, add a tracking note and consider whether keeping dead code in the package is worth the dep weight (`@modelcontextprotocol/sdk`, `zod`, `@shardworks/tools-apparatus` are all deps pulled in solely for this module).

---

### Incomplete Rename — Stale `claude-code-session-provider` references

- **File:** `src/mcp-server.ts` line 5
- **Severity:** medium
- **Description:** Doc comment says "This is an internal module of claude-code-session-provider". The package was renamed to `claude-code-apparatus` (session from 2026-04-01T195400). This reference is stale.
- **Suggested fix:** Update to `claude-code-apparatus` or just `the claude-code apparatus package`.

---

### Incomplete Rename — Stale references in docs outside package

- **Files:**
  - `/workspace/nexus/docs/architecture/index.md` ~line 459 — "claude-code-session-provider"
  - `/workspace/nexus/docs/architecture/_agent-context.md` — lines 38, 110, 136, 284
  - `/workspace/nexus/packages/plugins/stacks/docs/specification.md` ~line 834
  - `/workspace/nexus/packages/plugins/guild-starter-kit/curricula/guild-operations/content.md` ~line 311
- **Severity:** medium
- **Description:** Multiple documentation files across the monorepo still reference the old name `claude-code-session-provider`. These are outside the claude-code package itself but create confusion for agents reading architecture docs.
- **Suggested fix:** Global find-replace `claude-code-session-provider` → `claude-code-apparatus` (or `@shardworks/claude-code-apparatus` where the npm name is used). 7 occurrences across 4 files outside the package, plus 1 inside.

---

### Type Hack — `as any` on context stub in MCP server

- **File:** `src/mcp-server.ts` line 105
- **Severity:** medium
- **Description:** `const context: any = { ... }` — the MCP server creates a fake context object typed as `any` rather than satisfying a real interface. The `eslint-disable` comment acknowledges it. The stub methods all throw, so it's intentionally partial — but the `any` type means the tool handler call on line 138 (`(def.handler as any)(validated, context)`) is also untyped, and any future additions to the context interface won't cause a compile error here.
- **Suggested fix:** If this module is kept, define a minimal `McpToolContext` interface (with `home`, `config`, `guildConfig`, `apparatus` all explicitly typed as throwing stubs) and use that instead of `any`. This makes the contract explicit and catches interface drift at compile time.

---

### Type Hack — `as any` on handler call in MCP server

- **File:** `src/mcp-server.ts` line 138
- **Severity:** medium
- **Description:** `await (def.handler as any)(validated, context)` — the handler is cast to `any` to avoid the type mismatch between `ToolDefinition`'s typed handler signature and the untyped context. This is downstream of the `context: any` hack above.
- **Suggested fix:** Resolves naturally if `context` gets a proper type. The handler's second parameter type is the plugin context — either provide a compatible type or use a typed wrapper.

---

### Type Hack — `as unknown as SessionChunk` in async iterator

- **File:** `src/index.ts` line 391
- **Severity:** low
- **Description:** `return { value: undefined as unknown as SessionChunk, done: true }` — this is the standard TypeScript pattern for typed async iterators when `done: true` means value is unused. It's technically correct but could use the cleaner `IteratorReturnResult` type.
- **Suggested fix:** Minor — this is the standard workaround for TypeScript's iterator typing. No action needed unless a helper is introduced project-wide.

---

### Barrel Export Gap — `mcp-server.ts` not exported

- **File:** `src/index.ts`, `package.json`
- **Severity:** medium (if module is intended to be used) / low (if deferred)
- **Description:** `mcp-server.ts` defines public types (`ToolSpec`, `McpServerConfig`) and a public function (`createMcpServer`) with `export` keywords, but the barrel `index.ts` doesn't re-export them and `package.json` doesn't define a `"./mcp-server"` entry point. The `publishConfig` also only maps `"."`. This means the MCP server is unreachable through the package API.
- **Suggested fix:** Either add a secondary export (`"./mcp-server": "./src/mcp-server.ts"`) or, if the module is dead/deferred, remove the `export` keywords to make it explicitly internal, or remove the file entirely.

---

### Stale Comment/TODO — MCP server modernization TODO

- **File:** `src/mcp-server.ts` lines 174-176
- **Severity:** low
- **Description:** `// TODO: The MCP server needs to be modernized to use the guild runtime.` — acknowledges that the MCP server predates the apparatus model. This is accurate but untracked — there's no corresponding backlog item or experiment reference.
- **Suggested fix:** Either track this in `docs/future/` or the backlog, or remove the module if the work isn't planned.

---

### Dead Dependency — `zod` and `@shardworks/tools-apparatus` only used by orphaned module

- **File:** `package.json` lines 24-25
- **Severity:** low
- **Description:** `zod` (4.3.6) and `@shardworks/tools-apparatus` (workspace:*) are listed as dependencies but are only imported by `mcp-server.ts`, which is the orphaned/unwired module. If the MCP server is removed, these deps can go too. `@modelcontextprotocol/sdk` is in the same situation.
- **Suggested fix:** If `mcp-server.ts` is removed, drop `zod`, `@modelcontextprotocol/sdk`, and `@shardworks/tools-apparatus` from dependencies.

---

### Missing README

- **File:** (does not exist) `README.md`
- **Severity:** low
- **Description:** No README.md exists for the package. The last session summary noted this as a known gap ("Claude-code-apparatus README (write from scratch)" listed under next steps).
- **Suggested fix:** Write a README per DEVELOPERS.md standards. Already identified as a next step.

---

### Stale `dist/` in source tree

- **File:** `dist/` directory, `tsconfig.tsbuildinfo`
- **Severity:** low
- **Description:** Build artifacts (`dist/*.js`, `dist/*.d.ts`, `dist/*.map`, `tsconfig.tsbuildinfo`) are present in the source tree. If `.gitignore` doesn't exclude them, they may be tracked. These should be build-time outputs, not committed.
- **Suggested fix:** Verify `.gitignore` excludes `dist/` and `*.tsbuildinfo`. If they're tracked, remove from git.

---

## Statistics

| Category | Count |
|----------|-------|
| Dead code | 1 |
| Stale imports | 0 |
| Naming inconsistency | 0 |
| Duplicated logic | 0 |
| Orphaned files | 1 |
| Incomplete rename | 2 |
| Test gap | 1 |
| Stale comments/TODOs | 1 |
| Type hacks | 3 |
| Barrel export issues | 1 |
| Other | 2 |
| **Total** | **12** |
