# Collapse writ statuses `ready`/`active`/`waiting` into `open`

Introduce `open` as a new writ status meaning *"obligation stands, non-terminal, progressing normally."* Collapse the current trichotomy of `ready` / `active` / `waiting` into this single value, and **remove `ready`, `active`, and `waiting` from the writ status vocabulary entirely**. The motivation: `ready` vs `active` tracks an execution fact (is a rig running right now?) that belongs on the rigs table, not the writ; and `waiting` is a derived structural consequence (has non-terminal children) that is especially confusing for non-execution writ types like quests, where "waiting" has no intrinsic meaning. One status axis should track one concern — obligation lifecycle — and the rest should move to queries.

The target status vocabulary is:

- `new` — draft, not yet entered the pipeline
- `open` — obligation stands, non-terminal
- `completed` — obligation fulfilled
- `failed` — obligation abandoned with lessons
- `cancelled` — obligation withdrawn

`ready`, `active`, and `waiting` cease to be valid writ statuses. Any code path that previously transitioned a writ into one of them must now either transition into `open` or not transition at all (e.g., spider code that moved a parent into `waiting` when it spawned children should simply leave the parent in `open`).

`stuck` is out of scope for this work — a separate escalation mechanism can come later if needed.

## Migration

On Clerk startup, scan the writs book and transition any writ currently in `ready`, `active`, or `waiting` to `open`. This is a one-shot, idempotent migration — safe to re-run on every startup until all historical data is converted.

## Out of scope

- Providing a replacement query API for "is this writ waiting on non-terminal children?" Consumers that need that information should join against the children's statuses themselves; building a dedicated helper is a separate concern and can follow if real demand shows up. Related: `w-mnsx9lbz` (parent-child relationship semantics).
- Any UI-level changes in Oculus beyond recognizing `open` in status categorization.

## Constraints

- The Clerk's transition validator must accept all prior inbound transitions to `ready`/`active`/`waiting` as valid inbound transitions to `open`, and must accept `open → completed`, `open → cancelled`, `open → failed`.
- `nsg writ list --status open` must work.
- Consumers that pattern-match on the removed statuses (Oculus status categorization, commission-log tooling, the quests skill, the coco agent file, any engine dispatch eligibility logic, spider's trySpawn filter) must be updated in the same changeset. Grep is the planning surface here.
- The running daemon must pick up the change after restart; no silent half-migration.