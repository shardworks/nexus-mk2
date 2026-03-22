# Commission: Session Launcher

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What I Need

This repository already contains a CLI tool called "Nexus CLI." I need you to add a new subcommand to it: a session launcher that runs a Claude Code agent session and reports what happened.

A user runs something like `nexus run "do the thing"`. The tool launches Claude Code in autonomous mode, streams the agent's activity so the user can watch it work, and when the session finishes, prints a structured JSON report of the results.

## Behavior

### While the session is running

Stream the agent's activity to stderr so I can watch it work. I want to see the agent's thinking and commentary — a running narrative of what it's doing. I don't need raw protocol events or tool-use payloads.

### When the session completes

Print a single JSON object to stdout with the following shape:

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

This is the exact schema. Field names are camelCase. Costs are numbers in dollars. All fields shown above are required — token breakdowns and per-model usage are not optional.

The `modelUsage` object is keyed by model name, since a session might use more than one model.

### When something goes wrong

If the agent session fails or errors, the tool should still produce a JSON result on stdout — not crash or hang. The exit code should reflect what happened.

## Inputs

At minimum the subcommand accepts a prompt string. It should also accept a working directory for the agent session. You decide how the arguments and flags work.

## Delivery

The existing CLI is already runnable via `npx` from this repo. The new subcommand should work the same way — I will not clone the repository.

## Constraints

- The repository above is your workspace. All of your work goes there and only there. Do not modify any other repository or directory.
- You choose the language, tooling, and architecture. Do not infer preferences from any other project you may have access to.
- Test your work end-to-end before you're done. Run the tool, confirm the streaming output works, confirm the JSON result is correct and complete.

## How I'll Evaluate

- I will read your README and follow its instructions.
- I will run the new subcommand with a simple prompt and watch the stderr output.
- I will inspect the JSON result on stdout and verify it matches the schema above.
- I will run it multiple times with different prompts and check that the numbers change appropriately.
- I will try to make it fail and see if it handles the failure gracefully.
- I will run the `version` subcommand and verify it shows the tool name and version.
- I will watch stderr during a multi-tool session and verify I can see the agent's thinking and reasoning between tool calls, not just tool name markers.

## Amendments

This repository contains working code from a previous run of this commission. You are iterating on it, not starting over.

### A1 — Version should be an explicit subcommand

Running the CLI with no arguments currently shows version info. This should require an explicit `version` subcommand instead. Running with no arguments should show usage/help.

### A2 — Stderr streaming missing agent thinking

The stderr streaming currently shows `[tool: ToolName]` markers but nothing between them — the agent's thinking and reasoning text is missing. The streaming should include the agent's commentary and reasoning as it works, not just which tools it's invoking. The result should be a readable narrative of the agent's activity.
