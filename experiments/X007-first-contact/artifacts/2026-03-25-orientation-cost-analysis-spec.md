# X007:H2 Instrument — Orientation Cost Analysis

> This is the measurement instrument for **X007 Hypothesis H2 (Orientation Cost Dominates)**. It defines a heuristic for classifying session turns as "orientation" vs. "productive work" and a tool for extracting quantitative cost data from session transcripts.

## Goal

Quantify the "orientation tax" — how much time, turns, and (estimated) tokens agents spend exploring a codebase before doing productive work. This data validates or refutes X007:H2 and determines whether the warm-session optimization (see `experiments/X007-first-contact/artifacts/warm-session-spec.md`) is worth building.

## Background

X007:H2 predicts:

> *The agent will spend the majority of its tokens and turns orienting — reading the codex, understanding its tools, exploring the workshop — before doing any productive work. The ratio of orientation to implementation will be surprisingly high, even with good instructions.*

To test this, we need to decompose session transcripts into orientation and productive phases and measure the cost of each. Session transcripts capture the full conversation as NDJSON (one JSON object per line). We have per-turn token usage from the Claude API. We need to classify each turn as "orientation" or "productive work" and sum the costs.

## Transcript Format

Session transcripts are stored in `.nexus/sessions/{uuid}.json` as an array of NDJSON messages. Each message has a `type` field:

### `assistant` messages
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "content": [
      { "type": "text", "text": "..." },
      { "type": "tool_use", "name": "Read", "input": { "file_path": "..." } },
      { "type": "tool_use", "name": "Glob", "input": { "pattern": "..." } },
      { "type": "tool_use", "name": "Bash", "input": { "command": "..." } }
    ],
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 1389,
      "cache_read_input_tokens": 14938,
      "output_tokens": 40
    }
  },
  "session_id": "..."
}
```

### `user` messages (tool results)
```json
{
  "type": "user",
  "message": {
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_...",
        "content": "..."
      }
    ]
  }
}
```

### `result` message (end of session)
```json
{
  "type": "result",
  "duration_ms": 5423,
  "duration_api_ms": 5346,
  "num_turns": 2,
  "total_cost_usd": 0.02849,
  "usage": {
    "input_tokens": 4,
    "cache_creation_input_tokens": 1546,
    "cache_read_input_tokens": 31265,
    "output_tokens": 127
  }
}
```

## Classification Heuristic

Each assistant turn is classified as **orientation** or **productive**. The heuristic is deliberately simple — we want directional data, not perfection.

### Orientation indicators

A turn is likely orientation if it contains ONLY exploratory tool calls and no mutations:

- **Read** with broad targets (package.json, README, tsconfig, top-level config files)
- **Glob** calls (exploring file structure)
- **Grep** calls (searching for patterns to understand the codebase)
- **Bash** with `ls`, `tree`, `cat`, `find`, `wc`, `git log`, `git show`, or similar read-only commands
- **Read** of files not mentioned in the commission spec (exploring beyond scope)
- **Text-only** turns where the agent is reasoning about structure/architecture before acting

### Productive indicators

A turn is likely productive if it contains any of:

- **Edit** or **Write** calls (modifying files)
- **Bash** with `git commit`, `git add`, `npm test`, `npm run build`, build/test commands
- **Read** of files directly referenced in the commission spec
- Tool calls to guild MCP tools (signal, etc.)

### Edge cases

- A turn with BOTH orientation and productive signals → classify as **productive** (once you start working, exploration is task-directed)
- The first Edit/Write call is the **transition point** — everything before it is orientation, including any exploration that happened in the same turn

### What we DON'T try to classify

- Whether orientation was *useful* or *wasted* (that's a qualitative judgment)
- Whether the agent could have skipped specific reads (requires counterfactual reasoning)

## Metrics to Extract

For each session:

| Metric | Source | Notes |
|--------|--------|-------|
| **Total turns** | Count of `assistant` messages | Direct from transcript |
| **Orientation turns** | Count of turns classified as orientation | Heuristic |
| **Productive turns** | Total - orientation | Derived |
| **Orientation ratio** | Orientation / total | Percentage of session spent orienting |
| **Total wall time** | `result.duration_ms` | From result message |
| **Orientation wall time** | Not directly available | Estimate: `total_wall_time × (orientation_turns / total_turns)`. Crude but directional. |
| **Total output tokens** | Sum of `usage.output_tokens` across all assistant turns | Per-turn usage on assistant messages |
| **Orientation output tokens** | Sum for orientation turns only | Per-turn usage available |
| **Total input tokens** | `result.usage.input_tokens + cache_read + cache_creation` | From result message |
| **Orientation input tokens** | Sum of per-turn `input_tokens + cache_read + cache_creation` for orientation turns | Per-turn usage available |
| **Total cost** | `result.total_cost_usd` | From result message |
| **Estimated orientation cost** | `total_cost × (orientation_tokens / total_tokens)` | Token-weighted estimate |
| **First productive turn** | Index of first turn classified as productive | Shows how deep orientation goes |

## Interpreting Results for H2

H2 predicts orientation cost **dominates**. Concretely:

- **H2 confirmed:** Orientation ratio > 30% of turns OR > 20% of cost, consistently across sessions. The warm-session optimization is worth building.
- **H2 partially confirmed:** Orientation ratio 15-30% of turns, varies significantly by session. Warm sessions are a nice-to-have, not urgent.
- **H2 refuted:** Orientation ratio < 15% of turns AND < 10% of cost. The guild's instruction delivery (codex + role + tools + commission) gives agents a fast enough on-ramp. Focus investment elsewhere.

These thresholds are rough — the qualitative character of orientation turns matters too. An agent that spends 4 turns reading the right files is different from one that spends 4 turns wandering aimlessly.

## Implementation

### `nsg session analyze <session-id | path>`

A CLI command that reads a session record and outputs the analysis.

Input: Session ID (looked up from ledger for record_path) or direct path to a `.nexus/sessions/*.json` file.

Output (text, to stdout):
```
Session Analysis: ca5ba394-69f0-4774-a887-4171c6146250
Anima: vesta (artificer)
Commission: "Add logging to the event pipeline"

Turns:        24 total (9 orientation, 15 productive)
Orientation:  37.5% of turns
First work:   Turn 10 (first Edit call)

Tokens (estimated):
  Orientation:  ~12,400 input / ~3,200 output
  Productive:   ~45,600 input / ~18,800 output

Cost:
  Total:        $0.847
  Orientation:  ~$0.182 (21.5%)

Orientation turns:
  #1  Glob **/*.ts                          (exploring file tree)
  #2  Read package.json                     (reading config)
  #3  Read src/index.ts                     (reading entry point)
  #4  Grep "event" **/*.ts                  (searching for patterns)
  #5  Read src/events.ts                    (reading module)
  #6  Read src/clockworks.ts                (reading module)
  #7  Read src/session.ts                   (reading module)
  #8  Bash: git log --oneline -10           (checking history)
  #9  Read tests/events.test.ts             (reading tests)
```

Output (json, with `--output-format json`):
```json
{
  "sessionId": "ca5ba394...",
  "anima": "vesta",
  "totalTurns": 24,
  "orientationTurns": 9,
  "productiveTurns": 15,
  "orientationRatio": 0.375,
  "firstProductiveTurn": 10,
  "totalDurationMs": 145000,
  "estimatedOrientationDurationMs": 54375,
  "totalCostUsd": 0.847,
  "estimatedOrientationCostUsd": 0.182,
  "tokens": {
    "orientation": { "input": 12400, "output": 3200 },
    "productive": { "input": 45600, "output": 18800 }
  },
  "orientationDetails": [
    { "turn": 1, "tools": ["Glob"], "summary": "**/*.ts" },
    { "turn": 2, "tools": ["Read"], "summary": "package.json" }
  ]
}
```

### Batch mode

`nsg session analyze --all` or `nsg session analyze --workshop <name>` to analyze all sessions and produce aggregate stats:

```
Workshop: shardworks (5 sessions analyzed)

                    Mean    Median    Min     Max
Orientation turns:  8.2     7         3       15
Orientation ratio:  34%     31%       18%     52%
Orientation cost:   $0.19   $0.15     $0.04   $0.41
First work turn:    9.4     8         4       16
```

This aggregate view is what tells us whether H2 holds and what the expected savings from warm sessions would be.

## Scope

- **In scope:** Classification heuristic, per-session analysis, aggregate stats, text and JSON output
- **Out of scope:** Historical sessions with empty transcripts (they'll be skipped with a warning). We need new sessions with the fixed transcript capture (post-`9d5bd96`) to get real data.
- **Out of scope:** Cost modeling for the fork-session alternative (that's a separate analysis once we have the orientation cost baseline)

## Dependencies

- Requires sessions with populated transcripts (post-transcript-capture fix, commit `9d5bd96`)
- Needs at least 3-5 commissioned sessions to be useful (ideally in the same workshop for comparability)

## Success Criteria

We can answer: "What percentage of session cost is orientation, and is it consistent enough across sessions to justify the warm-session optimization?"
