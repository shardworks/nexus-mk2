# Click CLI commands — Ratchet Package 2

## Summary

Add `nsg click` CLI commands for the Ratchet apparatus. The Ratchet plugin (P1, landed as `v0.1.198`) provides the data layer and API — this commission adds the CLI surface so agents and humans can interact with clicks from the command line.

## Architecture Reference

- **Ratchet apparatus spec:** `docs/architecture/apparatus/ratchet.md` — CLI commands section defines all commands, parameters, and behavior.
- **Ratchet implementation (P1):** `packages/plugins/ratchet/src/` — the `RatchetApi` that CLI commands call into. The plugin already registers MCP tools (`src/tools/`); this commission adds the CLI layer that maps `nsg click-*` commands to those tools.
- **Clerk CLI as pattern:** Clerk's CLI commands (`packages/framework/cli/src/commands/`) show the established pattern for mapping CLI commands to plugin tool calls.

## Scope

CLI commands only. No Oculus changes, no migration, no changes to the Ratchet plugin itself.

### Delivers

**Core commands:**

1. `nsg click-create --goal "..." [--parent-id <id>]` — create a click
2. `nsg click-show <id>` — show a single click with links and children summary (positional ID argument)
3. `nsg click-list [--status <status>] [--root-id <id>] [--limit N]` — list clicks with filters. `--status` should be repeatable for multi-value filter.
4. `nsg click-tree [--root-id <id>] [--status <status>] [--depth N]` — render the click tree with status indicators. This is the primary orientation command. Output format:
   ```
   ● How should the quest system evolve?                    [live]
     ├── ○ Is the friction removable or structural?         [concluded]
     ├── ● What should we call these things?                [live]
     └── ◇ Do quests need an event-log layer?               [parked]
   ```
   Status indicators: `●` live, `◇` parked, `○` concluded, `✕` dropped.
5. `nsg click-extract --id <id> [--full] [--format md|json]` — render a subtree as a structured document. Default format: markdown. `--full` includes conclusions; without it, goals only. This is the continuity mechanism — one call to load a full subtree's context.

**Lifecycle commands:**

6. `nsg click-park --id <id>` — live → parked
7. `nsg click-resume --id <id>` — parked → live
8. `nsg click-conclude --id <id> --conclusion "..."` — live|parked → concluded
9. `nsg click-drop --id <id> --conclusion "..."` — live|parked → dropped

**Link and structure commands:**

10. `nsg click-link --source-id <id> --target-id <id> --link-type <type>` — add a typed link (related, commissioned, supersedes, depends-on). Target can be a click ID or a writ ID (cross-substrate).
11. `nsg click-unlink --source-id <id> --target-id <id> --link-type <type>` — remove a link
12. `nsg click-reparent --id <id> [--parent-id <id>]` — move a click to a new parent. When `--parent-id` is omitted, the click becomes a root node.

### Short ID support

All `--id`, `--parent-id`, `--root-id`, `--source-id`, and `--target-id` parameters should accept short ID prefixes (e.g., `c-mo0xpq` instead of the full ID). Resolution is handled by `RatchetApi.resolveId()` which is already implemented in P1. Error on ambiguity with a clear message listing matches.

### Positional ID on show

`click-show` should accept the ID as a positional first argument (no flag required): `nsg click-show c-mo0xpq`. The named `--id` flag should also work as an alternative.

### Does NOT deliver

- Oculus visualization (Package 3)
- Migration from quest writs (Package 4)
- `click-commission` sugar command (deferred — requires coordination with Clerk's commission-post)
- Changes to the Ratchet plugin/API

## Acceptance Criteria

- [ ] All 12 commands implemented and registered in the CLI
- [ ] `click-tree` renders a readable tree with status indicators and correct nesting
- [ ] `click-extract` produces structured markdown (default) and JSON output
- [ ] `click-extract --full` includes conclusions; without `--full`, goals only
- [ ] Short ID prefix accepted on all ID parameters; ambiguity produces a clear error
- [ ] `click-show` accepts positional ID argument
- [ ] `--status` is repeatable on `click-list` and `click-tree` for multi-value filter
- [ ] `click-reparent` without `--parent-id` makes the click a root node
- [ ] `click-conclude` and `click-drop` reject missing `--conclusion`
- [ ] All commands produce clear error messages for invalid operations (wrong status, not found, etc.)
