# Observations: more-doc-updates

## Spider.md brief mismatch

The brief quotes spider.md line 284 as: *"Push is a separate Scriptorium operation — the seal engine seals but does not push."* That text does not appear anywhere in the current file. Line 284 actually reads: *"The Scriptorium's `seal()` method pushes the target branch to the remote after sealing."* — which is accurate. Either the file was already corrected in a prior edit, or the brief references stale content. Decision D3 recommends no change; the patron should confirm whether this item is a no-op.

## Lifecycle diagram step order doesn't match code execution order

The `codex-add` lifecycle diagram shows: 1. Write guild.json, 2. Clone, 3. Track status. The code actually does: 1. Track in memory (cloning), 2. Clone, 3. Update in-memory status to ready, 4. Write guild.json. This ordering discrepancy predates this commission and affects the diagram's utility as a debugging reference. Not worth fixing here (the diagram documents logical phases, not execution order), but worth noting for a future documentation accuracy pass.

## spider.md vs spider.ts `requires` ordering

spider.md says `requires: ['fabricator', 'clerk', 'stacks']`. spider.ts line 400 says `requires: ['stacks', 'clerk', 'fabricator']`. The names match but the order differs. This is cosmetic — Arbor resolves dependencies by name, not position — but a future doc consistency pass could normalize ordering (e.g., alphabetical, or matching the code).

## scriptorium.md lifecycle references `Record clone status in Stacks` for codex-add but not for background clones

The startup flow (line 632-639) describes background cloning for missing codexes but doesn't have a corresponding lifecycle diagram entry. The `codex-add` lifecycle assumes blocking clone. This asymmetry is minor — the startup section describes it in prose — but a future iteration that adds the Stacks integration would need to account for both clone paths.
