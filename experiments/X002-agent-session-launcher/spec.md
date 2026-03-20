---
status: draft
---

# X002 — Agent Session Launcher

## The Wish

"I want to point an autonomous agent at a task and get back a structured report of what happened."

## What "Done" Looks Like

Sean runs the CLI (delivered by the first mountain) with a task description. The tool:

1. Launches a Claude Code agent session with the given task
2. The agent does its work autonomously
3. When the session ends, Sean gets a structured result containing:
   - The actual result of whatever was requested
   - Cost information (dollars, tokens — whatever's capturable)
   - Timestamps (start, end, duration)
   - Possibly: turn count, git diff, success/fail status

Details of the structured output format are TBD.

## Data Available from Claude Code JSONL Logs

From the X001 experiment, we confirmed the following data is available in the `--output-format json-stream` JSONL output:

### Per-turn (each `type: "assistant"` event)
- `message.usage.input_tokens` — but appears to be a delta/minimal value (often 1-2), not cumulative
- `message.usage.output_tokens` — similarly small per-turn values
- `message.usage.cache_creation_input_tokens` — tokens written to cache this turn
- `message.usage.cache_read_input_tokens` — tokens read from cache this turn
- `message.usage.service_tier` — e.g., "standard"
- `message.model` — model used (e.g., "claude-opus-4-6")

### End-of-session (`type: "result"` event) — the jackpot
- `total_cost_usd` — **real dollar cost** (e.g., 0.30042725). This is the number we want.
- `duration_ms` — wall clock time
- `duration_api_ms` — time spent in API calls
- `num_turns` — total conversation turns
- `stop_reason` — how the session ended (e.g., "end_turn")
- `subtype` — "success" or presumably "error"
- `usage` — aggregated token counts:
  - `input_tokens`, `output_tokens`
  - `cache_creation_input_tokens`, `cache_read_input_tokens`
- `modelUsage` — per-model breakdown with `costUSD`, `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `contextWindow`, `maxOutputTokens`

### Other notable events
- `type: "rate_limit_event"` — rate limit status, type (e.g., "five_hour"), reset time
- `type: "system", subtype: "init"` — session metadata: model, tools, permissions, cwd, session_id, claude_code_version

### Implications for X002
- The session launcher should use `--output-format json-stream` to capture structured logs.
- The `result` event at the end contains everything needed for cost tracking and session reporting.
- Per-turn token data exists but the aggregated `result` event is simpler and more reliable.
- `total_cost_usd` is available even on Max subscriptions (apiKeySource was "none"), which answers a key open question from earlier — we CAN get dollar costs.

## Why This Second

- **It's the kernel of the factory.** Every future capability — multi-agent orchestration, cost tracking, quality evaluation — builds on "launch a session and observe what happened."
- **It depends on the first mountain.** The delivery mechanism has to exist before this tool can reach Sean's hands.
- **It captures data from day one.** Even the simplest session log starts building the dataset needed for cost analysis and debugging.

## What It Doesn't Need To Be

- Not a multi-agent orchestrator
- Not a queue or scheduler
- Not a web UI
- Not the final architecture — just the first usable thing
