# Implement ability to block engines on external conditions

## Problem

Currently, once a rig is created the Spider starts each engine as it becomes ready, and engines can only "succeed" (with yields) or "fail" (causing the whole rig to fail). There is no way for an engine to signal that it has encountered an external condition it cannot resolve itself and must wait for.

## Desired behavior

Engines should be able to enter a **blocked** state — signaling to the Spider that the engine cannot proceed, but has not failed. The engine terminates cleanly and declares *what* it is waiting for using a structured block record. When the blocking condition clears, the Spider detects the change and restarts the engine, which may then run to completion, fail, or block again.

"Blocked" is the correct term: the engine wants to proceed but can't until a condition is met..

## Example blocking conditions (not exhaustive)

- Feedback needed from a human operator (e.g., a Stacks Book is written to)
- Waiting for an external system (e.g., a GitHub Actions workflow completes, a Vercel deployment finishes)
- Waiting for a time-based condition (e.g., entering a deployment window)
- Waiting for an internal dependency (e.g., another writ reaches a target status)

## Architecture: Block types and condition checkers

The key architectural decision: **engines declare what they're waiting for, but do not implement the checking logic.** Checking whether a block condition has cleared is handled by lightweight, non-LLM condition checkers registered as guild apparatus.

### Why this approach

The naive alternative — Spider polls blocked engines by restarting them, and engines self-check their conditions — is expensive. Most block checks are trivially answerable ("has this book been updated?" "is this workflow done?" "is it after 2pm?") but if the engine protocol requires spinning up a full agent session to check, you burn LLM tokens on what should be a `curl` call. Separating the checking concern from the engine also means common block types (GitHub workflow, scheduled time, book update) are write-once/use-everywhere rather than reimplemented in every engine.

### Block types as registered components

Block types are registered with the guild by apparatus, similar to engines and tools. A block type registration includes:

- A **checker** — a lightweight function/script that evaluates whether the condition has cleared. Signature: `(condition) => boolean`. No LLM involved.
- A **condition schema** — describes the shape of the condition payload the engine must provide. Enables validation at block time.
- A suggested **poll interval** — hint to the Spider for how frequently to check this type (don't hammer GitHub every 2 seconds; check timestamps every 30 seconds).

### Block records

When an engine exits blocked, it provides a block type and a structured condition payload. The Spider validates the block type exists in the guild and the condition matches the type's schema. If validation fails, the engine is failed immediately (fail-fast — catches typos, missing registrations, engines assuming apparatus that isn't installed).

Valid block records are persisted and the engine enters the `blocked` status.

### Condition checking: Spider-owned

The Spider owns the block-checking loop as a natural extension of its rig-tending responsibilities. On each crawl cycle, for each blocked engine, the Spider runs the registered checker for that block's type. If the checker returns true, the block is cleared and the engine is transitioned back to a runnable state.

For internal conditions (book updates, writ status changes), the system can use CDC/events to clear blocks immediately rather than waiting for the next poll tick. But polling is the baseline mechanism — events are an optimization layered on top.

### Engine author experience

An engine author's responsibility is minimal:

1. **Detect** the blocking condition during engine execution
2. **Declare** what they're waiting for: a block type string and a condition payload matching that type's schema
3. That's it. No check logic. No re-check on startup.

When the engine is restarted after unblocking, it receives context about the prior block (so it can pick up where it left off if needed).

### Checker author experience

A block type author writes:

1. A checker function: `(condition: T) => Promise<boolean>` — returns true if the condition has cleared
2. A condition schema for validation
3. Registers it as guild apparatus

Built-in block types should ship with the framework for common cases: book updates, writ status, scheduled time, and at least one external-system example.

## Rig-level blocked status

When all forward progress in a rig is blocked (the only non-completed engines are blocked, plus their pending dependents), the rig itself transitions to `blocked` status. This gives operators clear queryability ("show me all blocked rigs") and prevents the crawl loop from wasting cycles on rigs that can't make progress. The rig transitions back to `running` when any engine is unblocked.

## Operator surface

- `rig-list` should support filtering by `blocked` status
- `rig-show` should surface block metadata (what the engine is waiting for, how long it's been blocked)
- A `rig-resume` tool provides manual override — an operator can clear a block regardless of the checker, for any block type

## CrawlResult observability

The crawl loop should emit result variants for block and unblock events at both engine and rig level, so callers of `crawl()` (including `crawl-continual`) can observe these state transitions.
`s`