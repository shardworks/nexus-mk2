# Commission: Guild Roster

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## Background

The Nexus CLI is the command-line interface for a multi-agent AI system organized around a **guild metaphor**. Key concepts:

- **Guild** — the whole system. A collective of AI agents that receives work from a human patron and delivers results.
- **Patron** — the human. Commissions work, judges the output.
- **Anima** — a named AI identity. The fundamental unit of identity in the guild. Every anima has a name, instructions, and a lifecycle (`active` or `retired`). The word means "animating principle" — entities backed by AI, capable of judgment. *(Plural: animas.)*
- **Register** — the authoritative record of every anima. Managed via the `nexus anima` subcommand, which already exists in this repository.
- **Roster** — the guild's role assignment map. Records which anima fills which role. A separate, small document — not a filtered view of the register.
- **Commission** — a unit of work posted by the patron. The CLI already has a `commission` subcommand for these.
- **Roles** — functions in the guild (e.g., `artificer` builds things, `sage` plans, `master-sage` is consulted before any commission is undertaken). Roles are freeform strings, not a fixed set.

Use this vocabulary consistently in code, comments, error messages, and help text.

## What I Need

The Nexus CLI has a register of animas (AI identities) managed via `nexus anima`. Now the guild needs to know *who does what*. I need you to add a `nexus roster` subcommand that manages role assignments — mapping roles to animas.

The **roster** is the guild's role assignment map. It's a small, separate document that says "the master-sage is Theodius, the default artificer is Vex." The roster is how the system knows who to dispatch for what.

A **role** is a function in the guild (e.g., `master-sage`, `artificer`, `sage`). Roles are freeform strings — not a fixed enum. Each role has at most one anima assigned to it. An anima may be assigned to multiple roles.

## Output Convention

All commands produce JSON on stdout. Human-readable commentary, progress indicators, and errors go to stderr. This matches the existing CLI convention.

## Commands

### `nexus roster assign <role> <anima-name>`

Assign an anima to a role on the roster. The anima must exist and be active (not retired). If the role is already assigned to a different anima, the old assignment is replaced (with a warning on stderr).

Prints the assignment as JSON to stdout.

**Errors:**
- Anima does not exist → reject with clear error
- Anima is retired → reject with clear error

### `nexus roster unassign <role>`

Remove a role assignment from the roster. The anima remains in the register unchanged — this only removes the role mapping.

Prints the removed assignment as JSON to stdout.

**Errors:**
- Role is not assigned → reject with clear error

### `nexus roster list`

Print the full roster as JSON — all current role assignments.

Each entry shows:
- `role` — the role name
- `anima` — the assigned anima's name

## Integration with Anima Lifecycle

- **Retirement cascade:** When an anima is retired via `nexus anima retire`, any roster assignments for that anima must be automatically removed. Update `nexus anima retire` to handle this.
- **Rename cascade:** When an anima is renamed via `nexus anima update --name`, any roster assignments for that anima must be updated to reflect the new name.

## Storage
**Storage guarantees** (same as commission storage):
- Data must survive process restarts — persisted, not in-memory
- Data must not silently corrupt if the process crashes mid-write
- Data must be accessible from any directory on the same machine
- Acceptable latency: human-conversation speed

> I wonder if we need a note about concurrency. Honestly, the storage implementation is shite at this point so maybe not worth event pointing out since there's gonna be a rewrite later i'm sure

## Constraints

- Extend the existing CLI — do not rewrite or replace the existing structure.
- The `nexus anima` subcommand already exists in this repository. Build on it, don't break it.
- Test the full lifecycle end-to-end before you're done:
  1. Create two animas: "Theodius" and "Vex" (via `nexus anima create`)
  2. Assign Theodius to `master-sage`
  3. Assign Vex to `artificer`
  4. List the roster (verify both assignments)
  5. Reassign `master-sage` to Vex (verify warning on stderr, verify replacement)
  6. List the roster (verify Vex holds both roles)
  7. Unassign `artificer`
  8. List the roster (verify only `master-sage` → Vex remains)
  9. Retire Vex (via `nexus anima retire`)
  10. List the roster (verify empty — Vex's assignment was auto-removed)
  11. Create a new anima "Theodius" (name reuse after retirement)
  12. Assign new Theodius to `master-sage`
  13. Rename Theodius to "Aurelius" (via `nexus anima update --name`)
  14. List the roster (verify assignment shows "Aurelius", not "Theodius")
  15. Attempt to assign a non-existent anima (verify error)
  16. Attempt to assign a retired anima (verify error)
- Commit and push all of your work when done.

## How I'll Evaluate

- I will assign animas to roles and verify `roster list` shows correct mappings.
- I will reassign a role and verify the old assignment is replaced with a warning.
- I will unassign a role and verify it's removed.
- I will retire an anima and verify its roster assignments are auto-removed.
- I will rename an anima and verify the roster reflects the new name.
- I will verify clear errors for: assigning non-existent animas, assigning retired animas, unassigning roles that aren't assigned.
- I will pipe JSON output through `jq` and verify it parses cleanly.
- I will kill the process and verify all data survived.
