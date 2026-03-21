---
status: draft
---

# X005 — Greenfield Assembly

## Research Question

What if we never ask agents to iterate on existing code at all?

Agents spend enormous effort exploring existing codebases — often half their turns just reading what's already there. What if instead of fighting this (by providing context, summarizing prior work, telling them to iterate), we lean into the greenfield instinct entirely?

The idea: every agent task is greenfield. Every time. An agent gets a prescriptive, self-contained spec and builds from scratch in isolation. No existing code to explore. No codebase to understand. Then *something else* — another agent, a tool, a merge process — assembles the greenfield pieces into a coherent whole.

## Intuition

Agents are fast and cheap at greenfield. They're slow and expensive at exploration. The exploration-to-implementation ratio in X002's amendment run was roughly 20:3 (turns). What if we just... skip the exploration?

This trades one hard problem (getting agents to understand existing code) for a different hard problem (assembling independently-built pieces). But the assembly problem might be more tractable — it's structured, automatable, and doesn't require the agent to hold a mental model of a codebase it didn't write.

## Open Questions (this is very rough)

- **How prescriptive do the specs need to be?** If we're suppressing exploration, the spec has to carry all the context. Interfaces, data shapes, naming conventions. This feels like it pushes toward "blueprints not wishes" — which conflicts with our philosophy. Can we find a middle ground?
- **Who writes the prescriptive specs?** Not Sean — that's too much trail. Another agent? A "decomposer" that breaks a wish into greenfield-sized pieces with precise interface contracts?
- **What does assembly look like?** Git merge? An assembler agent that reads N greenfield outputs and stitches them together? A build system that composes modules? This is the big unknown.
- **Does this produce worse code?** Greenfield pieces built in isolation might duplicate logic, make inconsistent choices, or fail to compose. Is the assembly cost higher than the exploration cost we're avoiding?
- **Can we prohibit exploration?** "Do not read any existing files. Do not run git log. Build exactly what the spec says." Would agents actually obey this, or would they explore anyway?
- **What's the right granularity?** A whole CLI? A single function? A module? Too big and you're back to the iteration problem. Too small and the assembly problem explodes.

## Vague Procedure (to be refined)

1. Take a task we've already done (e.g., the session launcher)
2. Decompose it into isolated greenfield specs — each one fully self-contained with interface contracts
3. Run each spec as a separate agent session with instructions not to explore
4. Attempt to assemble the outputs into a working whole
5. Compare: total cost, total time, quality of result vs. the iterative approach

## Why This Might Be Interesting

- It sidesteps the entire X004 question (what context to give iterating agents) by eliminating iteration
- It could enable massive parallelism — greenfield tasks with no shared state can run simultaneously
- It maps to how some human engineering orgs work (microservices, interface contracts, independent teams)
- It might be terrible — and knowing that is also valuable

## Why This Might Be Terrible

- "Blueprints not wishes" — hyper-prescriptive specs violate our philosophy
- Assembly might be harder than iteration
- Duplicated work across greenfield pieces
- Loss of emergent design — the agent can't make holistic choices if it only sees one piece
- We might just be reinventing microservices badly

## Depends On

- X002 results (baseline for iterative approach)
- X004 results (to compare: is context-enhanced iteration good enough to make this unnecessary?)
