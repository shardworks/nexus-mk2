---
status: superseded
supersededReason: The session launcher was built as part of the session refactor (claude-code-session-provider) rather than via commissioned agent. The specific deliverable this experiment targeted already exists.
---

# X002 — Agent Session Launcher

## Research Question

Can an autonomous agent build a tool that launches *other* agent sessions and captures structured telemetry — effectively building part of its own factory's infrastructure?

Secondary questions:
- Can the agent discover the right data sources on its own when given only an output contract (not implementation hints)?
- How does commission complexity affect agent success rate? X001 was a simple CLI; X002 requires process orchestration, stream parsing, and structured output.
- Does the "clean room + commission" pattern from X001 hold up for a more complex task?

## Hypothesis

A single autonomous agent session can produce a working session launcher given only a description of the desired inputs and outputs — no implementation hints about where the data comes from or how to extract it.

We expect this to be achievable in one attempt if the commission is well-specified, based on X001's lesson that commission clarity compounds.

## What We're Trying to Prove

1. **The factory can build its own plumbing.** If agents can build the session launcher, the system bootstraps — agents building the tools that manage agents.
2. **Commission-driven development scales.** The pattern (spec → commission → clean room → fruit) worked for a trivial CLI. Does it work for something with real moving parts?
3. **"Mountain not trail" works for data problems.** We specify *what we want to see*, not *where to find it*. The agent must discover Claude Code's output format and figure out how to extract the data we need.

## Output Contract

The tool takes a prompt (and optionally a working directory) and produces:

### stderr — Streaming progress
A human-readable stream of the agent's activity as it happens. Ideally the agent's thinking and running commentary — not raw tool-use events. The user should be able to watch this and get a sense of what's happening in real time.

### stdout — Structured result (JSON)
When the session completes, stdout receives a single JSON object:

```json
{
  "exitCode": 0,
  "result": "the agent's final text output",
  "totalCost": 0.30,
  "durationMs": 106000,
  "numTurns": 17,
  "stopReason": "end_turn",
  "stopReasonSubtype": "success",
  "usage": {
    "inputTokens": 16,
    "outputTokens": 3604,
    "cacheCreationInputTokens": 12547,
    "cacheReadInputTokens": 263657
  },
  "modelUsage": {
    "claude-opus-4-6": {
      "costUsd": 0.30,
      "inputTokens": 16,
      "outputTokens": 3604,
      "cacheCreationInputTokens": 12547,
      "cacheReadInputTokens": 263657
    }
  }
}
```

Field names use camelCase. Costs are in dollars (number, not string). Token breakdowns are required, not optional.

## Procedure

1. **Write the commission.** Task spec for the agent, following patterns established in X001 (explicit constraints, negative boundaries, self-testing mandate).
2. **Provision the environment.** Fresh clone of the target system repo in `/tmp/work`. Copy `bypassPermissions` config.
3. **Run the agent.** `cat commission.md | claude -p --output-format json-stream` from the clean room.
4. **Capture the session log.** Save the JSONL output as an artifact.
5. **Validate the fruit.** See Validation Criteria below.

## Validation Criteria

### Must-have (experiment succeeds)
- [ ] Running the tool with a trivial prompt produces streaming progress on stderr
- [ ] On completion, stdout contains a valid JSON object matching the output contract
- [ ] Token usage and per-model breakdown are present and populated
- [ ] The tool handles a failing/erroring agent session without crashing
- [ ] Sean can run it without cloning the agent's repo (same delivery bar as X001)

### Validation approach

**Vibe-testing with real runs.** Run the tool several times with a spread of prompts:
- Trivial prompts (e.g., "say hello") — expect low cost, fast duration, few turns
- Meatier prompts (e.g., "write a function that...") — expect proportionally larger numbers

Verify that the numbers move in the right direction and are internally consistent. If trivial and meaty prompts produce suspiciously similar telemetry, something is wrong.

For error handling, give it a prompt or configuration that should cause the spawned session to fail, and verify the tool reports the failure cleanly rather than crashing.

**Out of scope (but maybe useful later):** A mock harness that replaces the `claude` CLI with a script emitting known data, allowing deterministic assertion against expected values. This would catch fabrication and enable automated regression testing, but is more infrastructure than X002 needs.

### Meta-observations to capture
- Number of attempts required
- Where did the agent struggle, if anywhere?
- Did the agent make architectural choices we wouldn't have?
- Did the self-testing mandate change behavior vs X001?
- What did the agent discover about Claude Code's output format, and how?

## What This Experiment Is NOT

- Not designing the final orchestration architecture
- Not proving multi-agent coordination
- Not building a queue, scheduler, or web UI
- Not optimizing for production reliability — this is a prototype

## Controlled Variables

- **Model: Claude Opus** — consistent with X001. Model comparison is out of scope for this experiment.

## Depends On

- X001 (delivery mechanism proven)
- A pre-provisioned system repo for the agent to build in
