# Commission: Rename Quest CLI to Commission CLI

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What I Need

The Nexus CLI currently has a `quest` subcommand (aliased as `q`) that manages units of work. The terminology has changed — "quests" are now "commissions." I need you to rename the `quest` subcommand to `commission` (aliased as `com`) and update all related code, storage, and documentation.

## Requirements

1. **Subcommand rename:** `nexus quest` → `nexus commission`. The alias changes from `q` to `com`.
2. **All sub-subcommands stay the same:** `post`, `send`, `status`, `list`, `delete` — same behavior, same flags, same output schema.
3. **Internal naming:** Rename all internal references — variable names, function names, type names, file names, module names. `quest` → `commission` everywhere in the codebase. This is a thorough rename, not just a CLI surface change.
4. **Storage migration:** If quest data is stored on disk with "quest" in paths or keys, migrate it. Existing posted commissions (formerly quests) must survive the rename — no data loss.
5. **Documentation:** Update the README and any inline help text to use "commission" terminology.
6. **JSON output:** Any JSON output that includes "quest" in field names should use "commission" instead. (e.g., if there's a `questId` field, it becomes `commissionId`.)

## Constraints

- Do not change the behavior of any command — this is purely a rename.
- Do not break existing stored data. If there are quests already posted, they should still be accessible after the rename.
- Test the full lifecycle end-to-end after the rename: post, send, status, list, delete.
- Commit and push all of your work when done.

## How I'll Evaluate

- I will run `nexus commission post spec.md` with a repository URL and verify it works identically to the old `nexus quest post`.
- I will run `nexus com post spec.md` and verify the alias works.
- I will run `nexus quest post spec.md` and verify it **does not work** (the old name should be gone).
- I will verify any previously-posted quests are still accessible via `nexus commission list` and `nexus commission status <id>`.
- I will inspect the codebase and verify no stale "quest" references remain in code, types, or variable names.
- I will read the README and verify it uses "commission" terminology throughout.
