## Goal

Preserve the "why did this change?" audit trail for quest bodies. Today, `nsg writ edit --body` overwrites the row with no record of the prior state. The pre-quest workflow gave us `git log -p` on scratch files for free; the quest substrate trades that away for queryability and visibility-to-agents. This quest is about recovering the audit trail without giving up the substrate wins.

## Status

parked — no data loss yet, but the trade is structural and worth fixing before we accumulate enough quest history that losing it hurts. Surfaced 2026-04-10.

## Next Steps

Decide which storage shape to pursue:

1. `writ_revisions` side-table — append a row on every body edit with `(writ_id, version, body, edited_at, edited_by, session_id)`. Simple, queryable, costs storage proportional to edit volume.
2. Lean on Stacks CDC — if the change-data-capture stream already records writ updates, the audit trail may exist for free; just need a query path. Investigate first; this is the cheapest option if it works.
3. Periodic snapshots — coarser than per-edit, but maybe sufficient if edits are bursty.

Investigate option 2 first (it's free if it works), fall back to option 1.

Open sub-questions:

- Should the diff be visible from `nsg writ show` (with a `--history` flag) or only via a separate `nsg writ history <id>` command?
- Do we want a "why" field on edits — a one-line edit message — or is the surrounding session transcript sufficient context?
- How does this interact with T1.3 (concurrent writes)? An edit-history layer might naturally absorb the LWW problem if it can detect conflicting concurrent edits.

## Context

The structural argument: a quest body is a *synthesized* document that evolves over time. The Goal is durable, but Context, Next Steps, and References get rewritten as understanding shifts. Each rewrite encodes a decision ("this approach is dead, that one is live"). Losing the prior versions means losing the record of those decisions — and decisions are exactly what T1.4 (decisions & ratification) is trying to make queryable.

Coco flagged this in the 2026-04-10 meta review as the friction item *most* worth addressing: "without it, we're trading git's audit trail for queryability, and I'm not sure that's a trade I want long-term."

Cross-link to T1.3 (concurrent session writes): both are downstream of treating the body as a single mutable cell. A revision-aware storage layer could plausibly fix both — last-write-wins becomes "second writer sees a conflict and gets a chance to merge" once the layer knows what version the writer started from.

## References

- Parent: T1 writ substrate & quest type — `w-mnswvmj7-2112b86f710a`
- Sibling: T1.3 concurrent session writes — `w-mnswwgah-7dca55bc359e` (likely solvable together)
- Sibling: T1.4 decisions & ratification — `w-mnswwzdv-88c29d29f84b` (downstream consumer of edit history)
- Sibling: T1.6 quest body editing ergonomics
- Stacks CDC — investigate whether writ-update events already capture full prior state

## Notes

- 2026-04-10: opened from meta review. Coco's stated read: this is the trade most worth revisiting.