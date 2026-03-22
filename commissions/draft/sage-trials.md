# Commission: Sage Consultation Pipeline

## What I Need

When a commission is dispatched, the system should run a two-phase pipeline: a **sage consultation** (planning/refinement) followed by **artificer dispatch** (implementation). Right now dispatch sends a single agent that has to figure out what to build AND build it. I want those to be separate steps with separate contexts.

The goal: I should be able to post a commission with a single sentence and have the system figure out the rest.

## Concepts

- **Trial** — a discrete unit of work within a commission. Each commission has one or more trials. A trial is performed by a specific agent role.
- **Sage** — the planning agent. Runs the first trial. Reads the commission spec (which may be as short as a sentence), explores the target repository, identifies ambiguities, and produces a refined spec with concrete requirements and acceptance criteria.
- **Artificer** — the implementation agent. Runs the second trial. Receives the sage's refined spec and builds the thing.

## How Dispatch Should Work

1. Dispatch launches the sage consultation first.
2. If the sage is satisfied, the artificer trial launches automatically. No human action required between phases.
3. If the sage has questions, the commission transitions to `needs-input` status. The sage exits. Questions are stored in the commission record.
4. The human answers via CLI (`nexus commission answer <id> "..."`).
5. The human re-runs dispatch. The sage trial runs again with the answers available. If satisfied, artificer launches. If more questions, back to `needs-input`.
6. Dispatch is re-entrant — same command whether it's the first run or a retry after answering questions.

## Commission Lifecycle

```
new -> refining -> [needs-input <-> refining] -> in-progress -> done | failed
```

- `refining` — sage consultation is running
- `needs-input` — sage (or artificer) has questions, waiting for human answers
- `in-progress` — artificer trial is running

## Questions and Answers

Questions and answers live in the commission record itself. Both the sage and artificer can ask questions (same mechanism, different phase).

The commission status output should show pending questions when in `needs-input` state.

Future direction: agents will use the same CLI that the human uses, so the answer mechanism should be CLI-native.

## Trials in the Commission Record

Each trial should be tracked in the commission record with at minimum:
- Which role performed it (sage/artificer)
- Status (pending/running/completed/failed/needs-input)
- When it started and ended
- The refined spec (for sage trials)
- Questions asked and answers received (for either)

## Open Design Questions

- **Stop/ask mechanics:** How does a running agent actually signal "I have questions"? Convention-based (write to a file, exit with a specific code) vs. tool-based (MCP). Deferred — to be resolved before implementation.
- **Saga:** A unit larger than a commission — a commission that decomposes into sub-commissions. Concept is parked, not designed. Noting it here so the commission record structure doesn't preclude it.
