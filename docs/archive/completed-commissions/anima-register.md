# Commission: Anima Register

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## Background

The Nexus CLI is the command-line interface for a multi-agent AI system organized around a **guild metaphor**. Key concepts:

- **Guild** — the whole system. A collective of AI agents that receives work from a human patron and delivers results.
- **Patron** — the human. Commissions work, judges the output. Does not micromanage the guild's internals.
- **Anima** — a named AI identity. The fundamental unit of identity in the guild. Every anima has a name, instructions, and a lifecycle. The word means "animating principle" — these are the entities backed by AI, capable of judgment. *(Plural: animas.)*
- **Register** — the authoritative record of every anima that has ever existed. The guild's institutional memory.
- **Roster** — the guild's role assignment map. Records which anima fills which role (e.g., "the master-sage is Theodius"). A separate, small document — not a filtered view of the register.
- **Commission** — a unit of work posted by the patron and undertaken by the guild. The CLI already has a `commission` subcommand for managing these.
- **Roles** — functions in the guild (e.g., `artificer`, `sage`, `master-sage`). Roles are freeform strings, not a fixed set.

Use this vocabulary consistently in code, comments, error messages, and help text. When the system says "anima," it means an AI identity. When it says "register," it means the persistent record of all animas.

## What I Need

The Nexus CLI manages commissions (units of work). Now it needs to know *who does the work*. I need you to add a new `nexus anima` subcommand that manages the guild's register — the authoritative record of every anima that has ever existed.

An **anima** is a named AI identity. Every anima has a unique natural-language name, instructions, and a lifecycle state. The register is the guild's institutional memory.

This is pure data management — CRUD operations on a local store. No agent dispatch, no AI invocation.

## Output Convention

All commands produce JSON on stdout. Human-readable commentary, progress indicators, and errors go to stderr. This matches the existing CLI convention.

## Concepts

### Anima States

Every anima exists in one of two states:

| State | Meaning |
|-------|---------|
| `active` | Alive and available. |
| `retired` | Permanently stood down. Record persists forever in the register, but the anima cannot be dispatched. |

New animas start as `active`. Retirement is permanent — there is no un-retire.

### Names

Anima names are natural language — real-sounding names, not machine identifiers. Names must be unique across all active animas. A retired anima's name may be reused.

Names are provided by the human at creation time.

## Commands

### `nexus anima create <name>`

Create a new anima in the register. The anima starts in `active` state.

**Options:**
- `--instructions <text>` — base instructions for this anima (optional at creation, can be set later via update)

Prints the new anima record as JSON to stdout.

**Errors:**
- Name already taken by an active anima → reject with clear error

### `nexus anima list`

List all animas in the register as a JSON array.

**Options:**
- `--state <state>` — filter by state (`active`, `retired`)

### `nexus anima inspect <name>`

Print the full register entry for an anima as JSON.

The record includes at minimum:
- `name` — the anima's name
- `state` — current lifecycle state (`active` or `retired`)
- `instructions` — base instructions (may be empty/null)
- `createdAt` — ISO 8601 timestamp
- `updatedAt` — ISO 8601 timestamp
- `retiredAt` — ISO 8601 timestamp (null if not retired)

### `nexus anima update <name>`

Update an active anima's register entry.

**Options:**
- `--instructions <text>` — replace base instructions
- `--name <new-name>` — rename the anima (same uniqueness rules apply)

At least one option is required. Prints the updated record as JSON.

### `nexus anima retire <name>`

Transition an anima to `retired` state. Retired is permanent.

Prints the updated record as JSON.

## Storage

**Storage guarantees** (same as commission storage):
- Data must survive process restarts — persisted, not in-memory
- Data must not silently corrupt if the process crashes mid-write
- Data must be accessible from any directory on the same machine
- Acceptable latency: human-conversation speed

## Aliases

`nexus anima` is aliased as `nexus an`.

## Constraints

- Extend the existing CLI — do not rewrite or replace the existing structure. Follow the patterns established by the `commission` subcommand.
- Test the full lifecycle end-to-end before you're done:
  1. Create an anima ("Theodius")
  2. Inspect it (verify active state, timestamps)
  3. Update its instructions
  4. Inspect again (verify instructions changed, updatedAt changed)
  5. Create a second anima ("Vex")
  6. List all animas (verify both appear)
  7. List with `--state active` (verify both appear)
  8. Retire Theodius
  9. Inspect Theodius (verify retired state, retiredAt set)
  10. List with `--state active` (verify only Vex appears)
  11. List with `--state retired` (verify only Theodius appears)
  12. List without filter (verify both appear)
  13. Create a new anima named "Theodius" (verify name reuse works after retirement)
  14. Attempt to create an anima named "Vex" (verify error — name taken by active anima)
- Commit and push all of your work when done.

## How I'll Evaluate

- I will create several animas and verify names must be unique among active animas.
- I will verify the full state lifecycle: active → retired (permanent).
- I will verify retired animas persist in the register forever.
- I will verify a retired anima's name can be reused by a new anima.
- I will update an anima's instructions and name, and verify changes persist.
- I will verify that attempting to update or retire a non-existent anima produces a clear error.
- I will pipe JSON output through `jq` and verify it parses cleanly.
- I will kill the process and verify all data survived.
