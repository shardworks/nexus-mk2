---
date: 2026-03-17
topic: Herald agent design and session documentation pipeline
tags: [agent-design, workflow, tooling]
significance: high
transcript: ~
---

# Herald Agent Design and Session Documentation Pipeline

## Context

Sean is building Nexus Mk II, a multi-agent AI system in TypeScript/Node.js. This session focused on designing the outward-facing publishing pipeline for the project — a new agent called Herald, and the supporting infrastructure for capturing and synthesizing session documentation.

## Herald

The session began with naming a new agent responsible for reading session documentation and publishing outward-facing content: daily status updates, deep-dives, blog posts, and similar material about the project's development.

After exploring several candidates (Pulse, Beacon, Dispatch, Bulletin, Chronicle), **Herald** was chosen. The key design constraint was that this agent should feel like a role or job title rather than a personality — "cattle, not pets" in Sean's framing, in contrast to Coco which has a distinct identity.

## Coco's Documentation Instructions — Gap Analysis

The existing Coco session doc format was evaluated for fitness as Herald's source material. The format was good for agent continuity but missing several things Herald needs:

- **Tags** — no way to filter sessions by theme without reading every doc in full
- **Significance signal** — no way to know which sessions are worth a deep-dive
- **Status snapshot** — sessions capture what happened but not where the project stands
- **Herald Notes** — sessions were written for agent continuity, not for an outside audience; Herald had to do that translation cold

The resolution was to add `tags` and `significance` to frontmatter (categorical, filterable), and add an optional freeform **Herald Notes** section at the end of each doc. Herald Notes is written for an outside audience and explicitly scoped away from the rest of the session doc, which should remain written for agent continuity only.

A key design decision: Coco should know Herald exists, but only in the context of the Herald Notes section. Giving Coco full Herald context risked leaking audience-awareness into the primary narrative record.

## Hook-Based Transcript Capture

The discussion evolved toward replacing Coco's in-session documentation with a hook-based architecture. The core insight: Claude Code already writes a JSONL transcript for every session to `~/.claude/projects/<project>/`. There's no need to have Coco document anything — hooks can capture the raw transcript automatically.

Two hooks were designed:

- **`Stop`** — fires after every Claude response; archives the transcript to `docs/transcripts/<session-id>.jsonl`
- **`PreCompact`** — fires before context compaction; snapshots the transcript to `docs/transcripts/<session-id>.precompact.<timestamp>.jsonl` before detail is lost

Multiple compactions in a single session are handled by the timestamp suffix, which also provides ordering. The naming convention puts precompact snapshots adjacent to the primary transcript in directory listings.

A dead-code bug was caught in the initial `on_stop.sh`: an `if/else` where both branches executed the same `cp` command. Removed in favor of the unconditional copy.

The `Stop` hook fires after every response, not just at true session end. This is handled by always overwriting the archive — the latest state is always what's saved. The `stop_hook_active` guard is relevant only if Scribe is wired to auto-invoke from the Stop hook.

Hooks must be registered in `.claude/settings.json` — presence of the scripts alone is not sufficient.

## Scribe Agent

With raw transcripts being captured by hooks, a new batch agent **Scribe** was designed to synthesize them into session docs. Scribe replaces Coco's documentation responsibility entirely.

Key design decisions:

- **Model: Sonnet** — initially specified as Haiku for cost, but a first real-world test produced garbled output (literal `\n` sequences instead of newlines). Scribe's job involves narrative judgment and structured markdown generation; Sonnet is the right tier.
- **Tools: Read, Write, Glob** — least privilege; no bash needed
- **Idempotent** — re-running Scribe on the same session overwrites the existing doc
- **Commit on write** — Scribe commits the session doc after producing it
- **Tool chatter ignored** — Scribe is instructed to focus on `user` and `assistant` turns only, ignoring tool call/result entries which are implementation noise for a Coco session

Scribe's agent file uses Claude Code frontmatter (`name`, `description`, `tools`, `model`). The `description` field is written to drive correct auto-delegation and explicitly exclude other invocation contexts.

## Session Doc Naming

The original design used UUID filenames (matching the transcript). This was revised: UUIDs are appropriate for raw transcripts (stable, collision-free, Claude Code native) but the session doc is a human and agent-facing artifact where discoverability matters.

Final convention: **pure slug derived from topic**, maximum 6 words, with an incrementing numeric suffix on collision (checked via the `transcript` frontmatter field to distinguish same-session re-runs from true collisions).

```
docs/sessions/2026-03/17/herald-design-and-session-pipeline.md
```

## Scribe Invocation Script

A shell script was added at `bin/scribe.sh` to invoke Scribe from the CLI:

```bash
./bin/scribe.sh <session-id>
```

Validates that the transcript exists before invoking. The correct `--agent` flag syntax should be verified against `claude --help` as CLI flags for named subagent invocation weren't confirmed from documentation.

## Open Questions

- Confirm correct Claude CLI flag for named subagent invocation (`--agent` assumed but unverified)
- Decide whether to wire Scribe into the Stop hook automatically (Option B in invocation doc) or keep manual invocation for now — manual recommended as starting point

## Herald Notes

This session designed the full documentation and publishing pipeline for Nexus Mk II from scratch — hooks, Scribe, Herald, and the session doc format — in a single conversation. The architecture that emerged is clean: hooks capture everything passively with zero agent involvement, Scribe synthesizes after the fact with full session context, and Herald publishes from structured source material.

The most interesting tension in the session was around where editorial judgment lives. The initial design had Coco responsible for documenting sessions mid-conversation, which conflated two different cognitive modes (real-time collaborative reasoning vs. retrospective synthesis). The hook-based architecture resolves this cleanly by separating capture from synthesis entirely.

The "cattle not pets" framing for Herald vs. Coco is a good articulation of a design principle that will likely recur as the agent roster grows: some agents are roles, some are personalities, and the distinction matters for how you specify and interact with them.

Current project status: pre-code. The agent infrastructure and documentation pipeline are being designed before any application logic exists. This is itself an interesting research data point — the project is investing heavily in observability and documentation tooling before writing a single line of the actual system.`