# CLI ergonomics: short ID resolution and positional ID arguments

## Summary

Two cross-cutting CLI improvements that reduce friction for both human and LLM agent usage of `nsg`. The current CLI requires full IDs (e.g., `w-mo0gias9-e6a2a5553973`) and named flags for every parameter (e.g., `--writ-id <id>` instead of positional arguments). Both create unnecessary friction — humans use short IDs in conversation and agents fail tool calls regularly because the flag conventions are non-standard.

## Issues

### 1. Short ID prefix resolution

IDs in conversation and documentation use the short form (`w-mo0gias9`), but all `nsg` commands require the full form (`w-mo0gias9-e6a2a5553973`). Add prefix-match resolution to all commands that accept an ID parameter:

- Query for records whose ID starts with the provided prefix
- If exactly one match: use it
- If zero matches: error with "no match for prefix '<prefix>'"
- If multiple matches: error with "ambiguous prefix '<prefix>' — matches: <list>"

This should be implemented as a shared utility (e.g., in Stacks or a CLI helper module) so all current and future ID-accepting commands get it for free. Clerk commands (`writ-show`, `writ-list`, `writ-edit`, `writ-complete`, `writ-cancel`, `writ-fail`, `commission-post --parent-id`, `writ-link`, `writ-unlink`) should all accept short IDs after this change.

### 2. Positional ID arguments on show/detail commands

The current convention requires named flags for all parameters. For the common "show me this thing" pattern, the ID should be accepted as a positional argument:

```
# Current (fails without --writ-id flag):
nsg writ-show w-mo0gias9-e6a2a5553973

# Target:
nsg writ-show w-mo0gias9          # positional + short ID
nsg writ-show --id w-mo0gias9     # named flag also works
```

This applies to any command where the primary argument is a single ID: `writ-show`, `writ-complete`, `writ-cancel`, `writ-fail`, and any future `click-show`, `click-conclude`, etc.

The named flag should also be normalized to `--id` across commands (currently some use `--writ-id`, which is unnecessarily verbose and diverges from CLI conventions).

## Scope notes

- These changes affect the CLI layer only — no apparatus API changes, no schema changes.
- Short ID resolution may involve a query helper in Stacks (prefix match on the `id` column of a book). If so, design it as a reusable utility — the Ratchet apparatus (in development) will need the same capability for click IDs.
- Positional argument support may require changes to how the CLI framework parses tool definitions into commands. Assess the scope of that change and flag if it's larger than expected.

## Acceptance Criteria

- [ ] All ID-accepting Clerk CLI commands accept short ID prefixes
- [ ] Ambiguous prefixes produce a clear error listing the matches
- [ ] `writ-show` (and similar single-ID commands) accept a positional first argument as the ID
- [ ] Named `--id` flag works as an alternative to positional on all such commands
- [ ] Existing `--writ-id` flag continues to work (backwards compatibility) but `--id` is the documented form
- [ ] Short ID resolution is implemented as a shared/reusable utility, not per-command