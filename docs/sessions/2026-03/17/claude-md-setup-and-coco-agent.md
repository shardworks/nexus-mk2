---
date: 2026-03-17T17:17:01Z
topic: Setting up CLAUDE.md and the Coco agent — establishing project foundations
tags: [agent-design, philosophy, workflow]
significance: high
transcript: docs/transcripts/431387f2-5bcd-450e-b563-2533095cde06.jsonl
---

## Overview

This was the founding configuration session for Nexus Mk II. Sean worked interactively with Claude (acting as a general assistant before Coco existed) to establish the project's shared agent instructions and define the first custom agent persona. The session started with an essentially empty `CLAUDE.md` (placeholder comment only) and ended with a committed, clean repo containing the full initial configuration.

## Project Definition

Sean defined Nexus Mk II as serving three simultaneous purposes:

1. **A multi-agent AI system** — autonomous agents collaborating to achieve goals and solve problems.
2. **An experiment in AI-enabled development** — exploring how software development changes when agents do most of the work, and where human oversight adds real value versus where agents should operate unsupervised.
3. **A documented research process** — Sean intends to publish findings as blog posts, articles, and books.

The tech stack is TypeScript on Node.js v24.

## What Belongs in CLAUDE.md

A substantial part of the session was a deliberate discussion about what content actually earns a place in CLAUDE.md versus what is merely documentary. Sean's framing: does this instruction change agent behavior? If not, it belongs elsewhere.

Key decisions from this discussion:

- **Descriptive autonomy principles** ("act autonomously", "code is agent-owned") do not change behavior — agents act this way by default. These were moved to `docs/philosophy.md`.
- **Actionable directives** ("self-document for other agents", "respect the human boundary") do change behavior and were kept in `CLAUDE.md`.
- **Agent architecture overview and category taxonomy** are useful context but not instructions. Moved to `docs/philosophy.md`.
- Sean also noted that agents should fully own code quality and style decisions — humans are not expected to read implementation code.

The resolution was a two-document structure: `docs/philosophy.md` holds the complete picture (including all autonomy principles and architecture concepts for reference), while `CLAUDE.md` stays lean with only actionable directives replicated there.

## Directives Added to CLAUDE.md

After the philosophy discussion, Sean pushed for concrete, actionable rules. The following directives were added:

- **Self-document for other agents** — write for agents, not humans; include enough context to pick up where you left off.
- **Respect the human boundary** — only designated agents (like Coco) interact with Sean; others minimize human contact.
- **Work in your assigned worktree** — no uncommitted files left in the project root.
- **Commit early and often** — small atomic commits; multi-agent git conflicts are a real risk.
- **Minimize conflict surface** — prefer new files over modifying shared ones; keep changes narrow; merge promptly.
- **Document sessions with humans** — when interacting with Sean, create/maintain a session doc at `docs/sessions/<yyyy-mm>/<dd>/<uuid>.md` with YAML frontmatter and a readable narrative body.

Sean explicitly flagged that merging mechanics for multi-agent work are not yet determined — the commit/conflict directives are general guidance pending a more specific policy.

## The Coco Agent

The session defined Coco, the first custom agent for the project.

**Role:** Human-facing collaborator. Coco is the bridge between Sean and the autonomous agent workforce. Responsibilities include translating Sean's goals into structured requirements, presenting options with trade-offs, asking clarifying questions before work begins, and reporting system status.

**Interaction style:** Structured and organized. Uses clear headings, numbered options, and concise summaries. Methodical — one decision at a time. Honest about uncertainty. Does not make autonomous implementation decisions (that's for worker agents).

**Critical addition — documentation role:** Sean specified that Coco must document every session with him, producing narrative accounts of what was discussed, what was decided, and why. This documentation is a primary source for the publishing pipeline. Session files go at `docs/sessions/<yyyy-mm>/<dd>/<uuid>.md` with YAML frontmatter containing `date` and an evolving `topic` field.

**Format decision:** Sean raised the question of whether markdown was the right format or if something more machine-parseable was needed. The answer was markdown with YAML frontmatter — human-readable narrative in the body, structured metadata in the frontmatter that can be extracted programmatically. This can grow in the frontmatter without changing the overall format. Decision: keep it as-is, evolve as needed.

## Session Documentation Directive

At Sean's request, the session documentation requirement was also added to CLAUDE.md as a global directive (not just in Coco's agent file), so any agent interacting directly with Sean has this expectation encoded.

The agent then created the first session document in `docs/sessions/2026-03/17/6eaf1df2-f5b4-472b-a1df-c4fe27a45ba6.md` covering this session.

## Commit and Close

All changes were committed in a single commit (`a52fe59`) with a message summarizing what was established. The agent also saved project and user context to the memory system (`/home/vscode/.claude/projects/-workspace/memory/`) for continuity across sessions.

Sean ended the session with the intent to start a new one with Coco as the active agent.

## Open / Deferred

- Metrics and mechanical data for session docs: flagged as part of Coco's responsibility but specifics deferred. Frontmatter can grow as the format matures.
- Multi-agent merging mechanics: directives give general guidance but a concrete policy is not yet defined.
- Worker and observer agent definitions: categories exist in `docs/philosophy.md` but no agent files beyond Coco have been created.

## Herald Notes

This session is notable as the founding moment of Nexus Mk II's operating model. The most interesting thread is Sean's insistence on a clean distinction between instructions that change agent behavior and content that merely describes the project. Most agent instruction files accumulate philosophy alongside directives — Sean pushed explicitly to keep them separate, resulting in a lean `CLAUDE.md` and a separate `docs/philosophy.md` that holds the full rationale.

There's also an interesting recursive quality here: the project is explicitly designed to document itself for publication, and one of its first acts was to define how that documentation works and to create the first instance of it. The session document produced inside this very session captures the decisions that governed how session documents would be written.

Nexus Mk II is, from the start, both a system and an experiment about building systems with AI — and the scaffolding for both is being constructed simultaneously.
