# Known Gaps

Tracked limitations and missing features in the Nexus framework.

## Role instructions are not upgradeable

**Added:** 2026-03-26
**Context:** The `nsg upgrade` command handles npm package updates, migrations, curricula, and temperaments — but role instruction files (`roles/steward.md`, `roles/artificer.md`) are scaffolded once by `nsg init` and never touched again. They are not part of the bundle manifest and have no versioning or upgrade path.

**Impact:** When framework updates include changes to role instructions (new procedures, new tool awareness, boundary clarifications), existing guilds don't receive them. The operator must manually update their guild's role files.

**Proposed fix:** Add role instructions as a new artifact category in the bundle manifest, with versioning and diff-based upgrade support — same treatment as curricula and temperaments. Role instructions are conceptually the same shape: framework-authored markdown files referenced by path in `guild.json`.

**Workaround:** Manually update `roles/*.md` in the guild repo after framework upgrades.

## Animas don't know to commit their work

**Added:** 2026-04-02
**Context:** The Loom's role instruction system is not yet implemented (charter, curricula, temperament, role instructions are all "future work" in the Loom). Without role instructions, animas have no standing guidance about git workflow. Three separate commissions have now failed or partially failed because the anima completed work but didn't commit before the session ended — the Dispatch seals whatever is on the branch, and uncommitted changes are lost.

**Impact:** Every commission prompt must include an explicit "commit your work" instruction. This is currently handled by `inscribe.sh` appending a commit instruction to the writ body, but it's a stopgap.

**Proposed fix:** When the Loom gains role instruction support, the artificer role instructions should include git workflow guidance: commit as a single commit with a clear message, never leave uncommitted changes. This moves the instruction from per-commission boilerplate to standing role knowledge.

**Workaround:** `inscribe.sh` appends a commit instruction to every writ body automatically.

## MCP server module not yet wired into session lifecycle

**Added:** 2026-04-01
**Updated:** 2026-04-01 — modernized API and exported from barrel
**Context:** `packages/plugins/claude-code/src/mcp-server.ts` has been modernized: `createMcpServer()` now accepts `ToolDefinition[]` directly (no more module-path-based loading), the legacy `ToolSpec`/`McpServerConfig`/`loadTool`/`resolveToolFromExport` code has been removed, `startMcpServer()` is the new process entry point that boots a guild and resolves tools via the Instrumentarium, and `createMcpServer` is exported from the barrel.

**Impact:** The MCP server module is functional and tested, but not yet wired into the session lifecycle. The claude-code provider's `prepareSession()` does not write `--mcp-config` arguments. Tool-equipped sessions require additional plumbing in The Animator (Instrumentarium integration), The Loom (permission resolution), and the provider (MCP config generation).

**What's needed:** See `.scratch/tool-integration-progress.md` for the phased integration plan. Remaining work: Animator gains tool resolution (Phase 2), provider writes `--mcp-config` (Phase 3), Loom resolves permissions from roles (Phase 4).
