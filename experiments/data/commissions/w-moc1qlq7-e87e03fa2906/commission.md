# Enable goal editing on live clicks via `nsg click amend`

## Intent

Allow a click's goal text to be edited while the click is in `live` status, preserving every prior goal value in a `goal_history` structure on the click. On transition to a terminal status (`concluded` or `dropped`), the goal seals and no further edits are permitted. This delivers the one substrate-level change that answers the long-running question on click goal mutability — the inquiry is closed, the implementation is open.

The current substrate treats click goals as write-once from creation. In practice, a click's framing often sharpens during exploration: the question asked at creation is frequently not the question resolved at conclusion, and users today are forced into a drop-and-recreate dance to adjust framing. That flow loses the thread and clutters the tree with dropped artifacts. A narrow edit affordance during the `live` phase — with history preserved for audit — removes the friction without weakening the substrate's commit-discipline guarantees.

## Motivation

Click goals are currently immutable from creation. The guarantee this provides — that a concluded click's framing cannot drift out from under its conclusion — is valuable. But the guarantee is over-applied: it also binds the framing during the `live` phase, when the inquiry is still in flight and no commitments have landed. The result is workflow friction: framing drift during exploration is real and common, and the only current remedy is to drop the click and create a new one, which fragments the inquiry.

The right cut is phase-scoped: commit-discipline kicks in at conclusion, not at creation. During the `live` phase, the goal is a workshop artifact; the amend affordance makes that explicit. History is preserved so that the record is lossless — readers can always see what the question used to say and when it changed.

This commission implements only the substrate-and-CLI change. Vocabulary drift (rename sweeps across existing text) and post-conclusion correction (retroactive amendments to sealed clicks) are separate concerns handled by other mechanisms, out of scope here.

## Non-negotiable decisions

### Amend is live-only

The amend operation is accepted when the click is in `live` status and rejected in every other status. Parked, concluded, and dropped clicks do not accept amend. A user who wants to amend a parked click must resume it first; a user who wants to amend a concluded or dropped click cannot, and must instead use the supersedes-via-new-click pattern (separate concern, not part of this commission).

This cut is deliberate. Parked is a deliberate-dormancy state; editing while parked would mutate something the user consciously set aside. Terminal states seal the goal by definition.

### Goal history is preserved on the click

Each amend appends the prior `goal` value — along with when it was amended and optionally the session id responsible — to a `goal_history` structure on the click. The current `goal` field continues to hold the single canonical question at any point in time; `goal_history` accumulates the prior versions in order.

Shape sketch (naming and exact fields are the implementer's call, but the semantic content is fixed):

    goal: "<current question>"
    goal_history: [
      { goal: "<prior version>", amended_at: <iso>, session_id?: "<...>" },
      ...
    ]

No-op amends (amending to the same text already present) do not append a history entry.

### The goal seals on terminal transition

Transition into `concluded` or `dropped` makes the goal immutable from that point on. This aligns with the existing substrate principle that conclusions commit to the framing they reference. The current `conclude` and `drop` operations need no behavioral change — they already set the terminal status; amend simply refuses to operate against a click in that status.

### CLI surface: `nsg click amend`

A new `nsg click amend` subcommand is the operator surface for this change:

    nsg click amend --id <click-id> --goal "<new goal text>"

The verb is `amend`, not `edit` — this frames the operation as additive-to-history rather than overwrite-in-place, which matches the actual substrate semantics. Short-id prefixes are accepted, consistent with other `nsg click` subcommands.

### `nsg click show` surfaces the history

When a click has a non-empty `goal_history`, `nsg click show` exposes it. The exact rendering is the implementer's call, but the information must be reachable without hand-querying the underlying store. JSON output carries the full structure; human output should at minimum indicate that prior versions exist and how to see them.

## Out of scope

- **Vocabulary drift / renames.** Global rename sweeps across clicks, briefs, docs, or commits are handled by a separate alias-registry mechanism. Amend is for refining one click's framing, not for cross-artifact renames.
- **Post-conclusion correction.** When a concluded click's decision turns out wrong or incomplete, the canonical pattern is a new click linked `supersedes` to the old one. Terminal-state editing is not introduced by this commission and is explicitly out of scope.
- **Amending parked clicks directly.** The workaround of `resume → amend → park` is acceptable; do not introduce a parked-amend path.
- **Conclusion or drop-reason editing.** This commission only addresses the `goal` field. Conclusions and drop reasons remain write-once as today.
- **Tree-view rendering changes that surface amend history prominently.** `nsg click tree` / `extract` do not need to be changed by this commission — history is visible through `show`. If we later want amend-history surfaced in tree/extract, that's a separate concern.
- **Bulk or scripted amendment tooling.** One-at-a-time CLI is sufficient for MVP.

## Behavioral cases the design depends on

- Amending a live click with new goal text updates the `goal` field and appends the prior value to `goal_history`.
- Amending a live click with text identical to the current `goal` is a no-op — no history entry is added.
- Amending a parked click returns an error naming the status as the reason.
- Amending a concluded or dropped click returns an error naming the status as the reason.
- Transitioning a click to `concluded` or `dropped` leaves the existing `goal_history` intact; the final `goal` at transition time is the sealed one.
- Resuming a parked click does not clear `goal_history`; subsequent amends continue appending to it.
- A click created today with no amends has an empty or absent `goal_history` — readers that don't know about the field are not disturbed.

## References

- `c-mobzw8pn` — this commission's design click
- `c-mo1yf2y1` — parent meta-click whose conclusion drives these decisions (yes-while-live, sealed on terminal)
- `c-mo1itggx` — clicks-evolution umbrella
- `c-mobzw9of`, `c-mobzwczn` — sibling clicks on the supersedes pattern, out of scope here
- `c-mobzw7uc` — sibling click on vocabulary-alias registry, out of scope here