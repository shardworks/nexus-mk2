## Example: efficient implementer trajectory

The following describes a real implementer session that completed a
multi-file refactor cleanly and at low cost. It illustrates the
trajectory shape that minimizes wasted work.

### The brief

Delete a plugin and update documentation referencing it across the
codebase. Concretely: remove `packages/plugins/vision-keeper/` and
rewrite ~10 architecture doc files that cited it as an example.
Estimated scope: ~25 files, mostly deletions plus inline doc edits.

### The trajectory

1. **Survey first.** The implementer used Grep to find every callsite,
   import, and doc reference to the plugin in one pass. From the Grep
   output it knew the full blast radius before making any change.

2. **Read only what was about to be edited.** The Grep gave file paths
   and line numbers. The implementer used `Read --offset` to look at
   the surrounding 20 lines of each citation, not the full file. Files
   it was going to delete (the plugin's own source) got no Read at all.

3. **All edits in one pass.** The implementer made every Edit and every
   `git rm` before any test invocation or commit. No "edit a file, run
   tests, edit another, run tests again" cycles.

4. **Tests run once at the end.** A single `pnpm --filter <affected-pkg>
   test` confirmed nothing in the surviving packages broke.

5. **Single commit.** All work landed as one commit titled "delete
   vision-keeper plugin and redefine The Surveyor."

### Why this trajectory was efficient

The work was **naturally atomic** — every file touched was part of a
single coherent task (remove the plugin and its citations). Splitting
it into multiple thematic commits would have added per-commit ceremony
(status check, diff inspection, message construction) without giving
the patron or future readers anything they wouldn't have from a single
well-titled commit.

The implementer read **only what it was about to change**, not "for
context." It planned the full set of edits before making any. It ran
tests **once**, at the boundary where running them mattered.

**Generalization for your own work:** when the brief describes a
coherent unit of work, consider whether it's naturally atomic. If yes,
plan the full set of changes, make them all, run tests at the end,
commit once. If the work has genuinely independent sub-tasks (e.g., two
unrelated bug fixes bundled into one commission), then multiple commits
may serve. Don't multiply commits artificially.
