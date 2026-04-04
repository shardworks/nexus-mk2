# Observations: sealing-an-inscription-should-push

## Per-codex sealing lock is still missing

The Scriptorium doc's "Future State" section (scriptorium.md) notes that the seal retry loop is not serialized per codex. Under high concurrency, ref races can exhaust retries unnecessarily. This is a pre-existing issue unrelated to push, but adding push to seal makes the critical section slightly longer. A per-codex async mutex around the seal+push operation would be a future improvement.

## The `codex-push` tool becomes less essential but still has a role

With seal auto-pushing, the primary use case for `codex-push` (pushing after seal) goes away. It retains value for: (a) pushing non-default branches, (b) retrying a failed push manually, (c) pushing commits made outside the seal flow. No action needed now, but the tool's description could eventually be updated to reflect its narrower role.

## The Dispatch is documented as temporary but accumulating complexity

`dispatch.ts` is marked as "temporary rigging — designed to be retired when the full rigging system is implemented." The Spider is now implemented and handles the same flow. If the Dispatch is still in active use, it may be worth a separate commission to retire it. If it's not in active use, it's dead code. Either way, not for this commission.

## Scriptorium doc shows `requires: ['stacks']` but code shows `requires: []`

The Scriptorium architecture doc (scriptorium.md, Dependencies section) says `requires: ['stacks']`. The actual implementation in `scriptorium.ts` line 39 has `requires: []`. The Scriptorium currently tracks drafts in-memory and uses `guild().config()` / `guild().writeConfig()` for the registry — it does not depend on the Stacks apparatus. The doc is aspirational (matching the "Future State: Draft Persistence via Stacks" section) rather than accurate. This predates this commission.

## Spider doc note about seal+push is a comment, not a spec requirement

The spider.md note "Push is a separate Scriptorium operation — the seal engine seals but does not push" (line 284) reads as a documentation observation, not a design constraint. It was likely written to explain the current behavior, not to prescribe it. Updating it is straightforward.

---

## Spec Verification Log (plan-writer)

Coverage verification passed. No gaps found, no revisions needed.

- **Scope coverage:** All 3 included scope items (S1, S2, S3) have requirements. S4 excluded, confirmed absent.
- **Decision coverage:** All 10 decisions checked. D1–D8 and D10 are reflected in the spec. D9 is scoped to excluded S4 — correctly omitted.
- **Inventory coverage:** All 13 files from the inventory are accounted for — either addressed in Design or explicitly noted as unaffected in Non-obvious Touchpoints.
- **R→V coverage:** All 9 requirements appear in at least one validation item. All 9 validation items reference at least one requirement.
- **Implementer read-through:** Spec provides exact insertion points, exact code snippets for the push and error wrapping, exact doc text to replace, and concrete test scenarios. No ambiguities requiring judgment calls.
