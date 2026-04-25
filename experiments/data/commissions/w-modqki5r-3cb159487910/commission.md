**Site:** No central runner exists. `packages/plugins/clerk/src/clerk.ts` lines 920–1046 contain in-`start()` one-shot migrations (status→phase rename and link normalization). `packages/plugins/stacks/src/stacks.ts` does idempotent index reconciliation under `stacks.autoMigrate`. There is no shared `_migrations` book, no `migrationId` convention, no per-row idempotency record.

**Why this matters now:** This commission's D9 declined to instrument the existing one-shot sites because they re-scan idempotently on every start; instrumenting them would emit a misleading `migration.applied` once per boot per apparatus. The architecture's `_migrations` table and `applyMigrations()` runner are documented but not implemented.

**Suggested commission shape:** Build a `MigrationRunner` apparatus (or extend Stacks) that:
  - Owns a `migrations` book keyed by `migrationId`.
  - Exposes `applyMigration(id, runner)` that records the migrationId, runs the runner exactly once, and emits `migration.applied` on success.
  - Provides a kit-contribution shape so each apparatus can register its migrations declaratively.
  - Retrofits clerk's two existing migrations onto the runner (status→phase rename, link normalization).

Until this lands, `migration.applied` cannot be wired authoritatively.