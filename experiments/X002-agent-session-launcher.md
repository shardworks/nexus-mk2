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

## Why This Second

- **It's the kernel of the factory.** Every future capability — multi-agent orchestration, cost tracking, quality evaluation — builds on "launch a session and observe what happened."
- **It depends on the first mountain.** The delivery mechanism has to exist before this tool can reach Sean's hands.
- **It captures data from day one.** Even the simplest session log starts building the dataset needed for cost analysis and debugging.

## What It Doesn't Need To Be

- Not a multi-agent orchestrator
- Not a queue or scheduler
- Not a web UI
- Not the final architecture — just the first usable thing
