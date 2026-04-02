# C005 Prompt — Scriptorium seal/push sync hardening

Dispatched: 2026-04-02
Outcome: success (commit 8deedff)

---

Harden the Scriptorium seal and push lifecycle. See the full commission at the end of this prompt.

The work is in packages/plugins/codexes/. Key files:
- src/scriptorium-core.ts (main implementation)
- src/scriptorium-core.test.ts (tests)
- src/types.ts (SealResult type to update)
- docs/architecture/apparatus/scriptorium.md (spec to update)
- packages/plugins/codexes/README.md (README to update)

## Problem

When commits are pushed to a codex remote outside the Scriptorium (e.g. directly from a local clone), the bare clone sealed binding (main ref) diverges from the remote. The seal succeeds locally but push fails with non-fast-forward rejection. The Scriptorium fetches before seal, but verify whether the seal compares against the local main ref or the freshly-fetched remote ref — and fix if needed.

## Acceptance Criteria

1. Seal uses fresh remote refs. After fetching, seal should compare against the remote latest target branch position, not a potentially stale local ref. The rebase path should handle remote advancement.

2. Add inscriptionsSealed: number to SealResult. This lets orchestrators detect no-op seals. Use guild metaphor vocabulary — "inscriptions" not "commits".

3. Update docs/architecture/apparatus/scriptorium.md AND packages/plugins/codexes/README.md to reflect changes to SealResult and seal behavior.

4. Add tests for: diverged-remote scenario (remote advances between draft open and seal), inscriptionsSealed field for zero and multi-inscription cases.

## Context
- The rebase path exists and is tested for draft-to-draft contention, but may not cover remote-advanced-outside-scriptorium
- Bare clone ref layout: refs/heads/* are local, refs/remotes/origin/* are fetched
- Check resolveRef() in git.ts to see which refs the seal actually resolves

IMPORTANT: Commit your work. Make small, atomic commits as you complete each piece. Do not leave uncommitted files. Run tests before your final commit to ensure everything passes.
