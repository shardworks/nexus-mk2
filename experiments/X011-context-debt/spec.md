---
status: ready
---

# X011 — Context Debt

## Research Question

How much of an agent's context window is consumed by tool output it will never reference again, and can we reduce this without hurting agent effectiveness?

## Origin

Observed during X007 (First Contact): the artificer's context jumped from ~30K to ~36K tokens at `npm install` — output that was never referenced again but remained in the context window for the rest of the session, re-read (and paid for) on every subsequent turn.

The agent partially mitigated this itself (`npm install 2>&1 | tail -10`) but the output still entered the conversation. Every `ls`, `git log`, test run, and build output accumulates the same way — context debt that the agent pays interest on for the remainder of the session.

## Hypothesis

A significant fraction of context window usage (and therefore cost) comes from tool output that is consumed once and never referenced again. Providing agents with output-controlled execution tools — commands that suppress output on success, truncate to N lines, or summarize results — would reduce context growth without reducing agent effectiveness.

## Prior Evidence (motivation)

The April 25 implement-engine cost analysis ([`artifacts/2026-04-25-implement-cost-analysis.md`](artifacts/2026-04-25-implement-cost-analysis.md)) is the strongest motivating data we have for this experiment. Across April, implement-engine session cost grew ~13× (avg $0.65 → $8.56). Decomposition of token categories:

- Cache-read tokens: 668k → 11,934k avg/session (~18×)
- Output tokens: 8k → 50k avg/session (~6×)

Cache-read growth dominated cost growth. The mechanism is exactly what X011 hypothesizes at session scale: every additional turn re-reads the entire accumulated conversation history, and the conversation history has grown — partly because of structural changes (the Apr 16 task manifest forcing iterative verify cycles) and partly because tool output and intermediate work are not pruned.

The April analysis does not isolate "dead tool output" as a fraction of the cache-read total — it observes the aggregate effect. X011 proposes the targeted measurement: of the cache-read volume each turn re-pays, how much is referenced again vs how much is dead weight that could be summarized, truncated, or quietly suppressed?

Related click: `c-modxwx8c` (root cost-analysis click) — see also its `verify-as-separate-rig` and `bound-manifest-body` recommendations, which are independent levers for the same cost mechanism.

## Possible Approaches

- **A `run` or `exec` tool** that returns exit code + summary on success, last N lines on failure. Full output never enters context. Agent chooses when to use quiet mode vs. verbose Bash.
- **Instruction-level guidance** teaching agents to redirect verbose output to files and read selectively.
- **Framework-level truncation** in the session provider — auto-truncate tool results above a threshold.
- **Output policies** — per-command rules (suppress npm install on success, always show test failures, truncate build output to errors only).

## Open Questions

- How much context is actually "dead" output by the end of a typical session? Need to measure this across multiple sessions.
- Does truncating output hurt agent effectiveness? Some agents use earlier output for reference (e.g., re-reading an `ls` result to remember file structure).
- Is this better solved by the agent (instructions to use `tail`/redirect), the tools (quiet-mode execution), or the framework (auto-truncation)?
- How does this interact with X010 (Staged Sessions)? If context debt drives sessions to fill up faster, reducing it extends the useful life of a single session.

## Depends On

- Session transcript data from multiple commissions (for measuring dead output)
- X007/X010 cost analysis tooling (for quantifying the cost impact)
