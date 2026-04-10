_Imported from `.scratch/todo/multi-rig-architectural-exploration.md` § "Full status vocabulary review" and § "Status model under multi-rig" (2026-04-10)._

## Opened With

The current writ status vocabulary (7–8 values: `new`, `ready`, `active`, `waiting`, `stuck`?, `completed`, `failed`, `cancelled`) feels bloated because **a single status axis is encoding multiple orthogonal concerns**:

- **Visibility** — new vs. ready
- **Work state** — ready vs. active
- **Structural** — waiting (has non-terminal children)
- **Trouble** — stuck (proposed)
- **Outcome** — completed/failed/cancelled

The key insight is that `waiting` is the odd one out. Every other status is a direct lifecycle state; `waiting` is a **derived structural consequence** — it just means "this parent has non-terminal children." It got promoted to a first-class status, but it's really a computed property.

Under multi-rig, more statuses can be collapsed. The distinction between `ready` ("queued") and `active` ("being worked on") is an execution fact — "is there a rig running on this writ right now?" — not a property of the obligation itself. It should be a query on the rigs table, not a field on the writ.

**Proposed simplified vocabulary (6 statuses):**

| Status | Meaning |
|--------|---------|
| `new` | Draft. Obligation not yet entered the pipeline. |
| `open` | Obligation stands. Zero or more rigs may be running; details queryable on the rigs table. |
| `stuck` | Obligation stands, most recent rig ended in trouble, no new rig has taken over. Needs patron attention. |
| `completed` | Obligation fulfilled. |
| `failed` | Obligation abandoned. |
| `cancelled` | Obligation withdrawn. |

`ready`/`active` collapse into `open`. `waiting` disappears entirely — replaced by a query predicate "has non-terminal children". `stuck` remains because it's the one signal that escalates out of "details queryable" into patron-visible alerting.

## Summary

This is downstream of the multi-rig decision. If we stay on 1:1, the simplification is still partially applicable — `waiting` can be demoted to a query predicate today — but `open` only makes sense if rig execution is decoupled from writ state.

**Can we ship any of it pre-multi-rig?** Yes, probably:

1. **Demote `waiting` to a computed predicate.** Change reads to query "writ + has non-terminal children"; change writes to stop transitioning writs into `waiting`. Existing consumers need to learn that "a ready writ with open children" is the new shape of the old "waiting" state. Modest migration.
2. **Keep `ready`/`active` distinct for now.** They carry useful single-rig signal under 1:1. Collapse when multi-rig lands.
3. **Add `stuck` if needed as a bridge.** Only worth it if recovery escalation becomes a real pain point before multi-rig ships.

**Open:**
- Is demoting `waiting` pre-multi-rig worth the migration churn, or batch it with the larger refactor?
- Any consumer (Oculus, reports, commission-log tooling) that treats `waiting` as a first-class state and would break on demotion?
- Does `stuck` as an interim bridge buy enough to justify adding a status we intend to remove?

## Notes

- The "single concern per field" principle is the broader lesson — status should track obligation lifecycle only; visibility, work-in-progress signals, structural properties all belong in separate fields or queries.
- Even if we never build multi-rig, the `waiting`-is-derived observation stands on its own and is worth acting on.