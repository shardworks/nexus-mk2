# Implementation Decisions & Ambiguities

Decisions made while implementing the framework tools. Flagged for Sean's review where judgment calls were required.

---

## 1. Ledger schema: `priority` column added to `commissions`

The dispatch implement needs to record commission priority (`normal` | `urgent`), but the existing Ledger schema had no `priority` column. Added it to `commissions` with a default of `'normal'` and a CHECK constraint.

**Confidence:** High — the architecture doc explicitly describes `priority:urgent` as a dispatch parameter.

## 2. Ledger schema: multiple curricula vs single curriculum in `anima_compositions`

The Ledger schema has a single `curriculum_name` / `curriculum_snapshot` column pair in `anima_compositions`, but the architecture allows an anima to have **multiple curricula**. The `instantiate` implement accepts an array of curricula.

**Decision:** For now, multiple curricula are concatenated (comma-separated names, content joined with `---` separators) into the single column. This works but is lossy — you can't cleanly extract individual curricula from the snapshot.

**Better approach (deferred):** Add a separate `anima_curricula` junction table with one row per curriculum assignment, each with its own snapshot. This requires a schema migration.

**Confidence:** Low — this is a workaround. The schema likely needs to evolve.

## 3. Dispatch: `workshop` is a required parameter

The architecture doc shows dispatch targeting a workshop (`dispatch <spec> --workshop <workshop>`). The implement requires `workshop` and validates it exists in `guild.json`'s `workshops` array.

**Open question:** Should dispatch be able to auto-select a workshop based on context, or is explicit workshop targeting always required?

**Confidence:** Medium — the architecture seems to intend explicit targeting, but the UX for single-workshop guilds is clunky.

## 4. Manifest engine: codex reading strategy

The codex directory can contain multiple `.md` files in subdirectories (e.g. `codex/all.md`, `codex/roles/artificer.md`). The manifest engine currently reads ALL codex files and concatenates them.

**Open question:** Should role-specific codex files (e.g. `codex/roles/artificer.md`) only be included for animas that hold that role? The current implementation includes everything.

**Confidence:** Low — the codex structure and role-filtering behavior isn't specified in the architecture doc.

## 5. Manifest engine: module path resolution for guild implements

For framework implements, the MCP config uses the `package` field from the descriptor (e.g. `@shardworks/implement-dispatch`) as the module path. For guild implements, it uses the absolute path to the entry point file.

**Assumption:** The MCP server engine can dynamically import both workspace package names and absolute file paths. This works in the current MCP server implementation.

**Confidence:** High — this matches the existing MCP server code.

## 6. Worktree setup: branch from guildhall bare repo

Commission worktrees are created from the guildhall bare repo, branching off `main` by default. The worktree directory is `NEXUS_HOME/worktrees/commissions/commission-{id}/`.

**Open question:** The architecture mentions worktrees for the project repo (the actual codebase animas work on), not the guildhall repo. Commission worktrees may need to be created from the *project's* git repo, not the guildhall. The current implementation uses the guildhall bare repo because that's the only repo path the framework knows about.

**Confidence:** Low — this may be architecturally wrong. The worktree engine might need a project repo path in addition to NEXUS_HOME.

## 7. Ledger migration: tracking table `_migrations`

The migration engine creates a `_migrations` table (prefixed with underscore to distinguish it from schema tables) to track which migrations have been applied. This table is not part of the regular schema — it's the engine's own bookkeeping.

**Note:** The initial schema (001-initial-schema.sql) was applied by `createLedger()` directly, not through the migration engine. On first run of `applyMigrations()`, migration 001 would be re-applied and fail because tables already exist. The migration engine needs special handling for this bootstrapping case — either by marking 001 as applied when creating the ledger, or by making 001 use `CREATE TABLE IF NOT EXISTS`.

**Confidence:** Medium — the bootstrapping issue is real but has a straightforward fix.

## 8. `nexus-version` implement: exists in `base-tools.ts` but not in architecture

The `base-tools.ts` file lists a `nexus-version` implement and there's a `packages/implement-nexus-version/` directory, but `nexus-version` doesn't appear in the architecture doc's on-disk layout. Left it alone — it's an extra tool beyond the architecture spec.

**Confidence:** High — no action needed, just noting the discrepancy.

## 9. Publish implement: scope of "publish"

The architecture mentions publish as "move artifacts from workshops into the guildhall." The current implementation is narrower — it only marks a commission as `completed` in the Ledger and logs it. It does NOT handle:

- Merging the commission's worktree branch into main
- Moving built artifacts into guildhall directories
- Any file-level operations

**Rationale:** The worktree merge and artifact movement likely involve the worktree-setup engine (for teardown) and possibly git merge operations that are better handled by the dispatch/session lifecycle, not the publish implement alone.

**Confidence:** Medium — the current implementation is correct for the Ledger side, but the full publish pipeline needs more design.
