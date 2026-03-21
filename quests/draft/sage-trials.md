# Quest: Sage Trials

## What I Need

When I `send` a quest, the system should run a two-phase pipeline: a **sage trial** (planning/refinement) followed by a **hero trial** (implementation). Right now `send` dispatches a single agent that has to figure out what to build AND build it. I want those to be separate steps with separate contexts.

The goal: I should be able to post a quest with a single sentence and have the system figure out the rest.

## Concepts

- **Trial** — a discrete unit of work within a quest. Each quest has one or more trials. A trial is performed by a specific agent role.
- **Sage** — the planning agent. Runs the first trial. Reads the quest spec (which may be as short as a sentence), explores the target repository, identifies ambiguities, and produces a refined spec with concrete requirements and acceptance criteria.
- **Hero** — the implementation agent. Runs the second trial. Receives the sage's refined spec and builds the thing.

## How `send` Should Work

1. `send` dispatches the sage trial first.
2. If the sage is satisfied, the hero trial launches automatically. No human action required between phases.
3. If the sage has questions, the quest transitions to `needs-input` status. The sage exits. Questions are stored in the quest record.
4. The human answers via CLI (`nexus q answer <id> "..."`).
5. The human re-runs `send`. The sage trial runs again with the answers available. If satisfied, hero launches. If more questions, back to `needs-input`.
6. `send` is re-entrant — same command whether it's the first run or a retry after answering questions.

## Quest Lifecycle

```
new -> refining -> [needs-input <-> refining] -> in-progress -> done | failed
```

- `refining` — sage trial is running
- `needs-input` — sage (or hero) has questions, waiting for human answers
- `in-progress` — hero trial is running

## Questions and Answers

Questions and answers live in the quest record itself. Both the sage and hero can ask questions (same mechanism, different phase).

The quest status output should show pending questions when in `needs-input` state.

Future direction: agents will use the same `nexus q` CLI that the human uses, so the answer mechanism should be CLI-native.

## Trials in the Quest Record

Each trial should be tracked in the quest record with at minimum:
- Which role performed it (sage/hero)
- Status (pending/running/completed/failed/needs-input)
- When it started and ended
- The refined spec (for sage trials)
- Questions asked and answers received (for either)

## Open Design Questions

- **Stop/ask mechanics:** How does a running agent actually signal "I have questions"? Convention-based (write to a file, exit with a specific code) vs. tool-based (MCP). Deferred — to be resolved before implementation.
- **Saga:** A unit larger than a quest — a quest that decomposes into sub-quests. Concept is parked, not designed. Noting it here so the quest record structure doesn't preclude it.
