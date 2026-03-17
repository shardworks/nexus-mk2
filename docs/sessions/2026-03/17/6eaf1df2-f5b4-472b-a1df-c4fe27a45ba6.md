---
date: 2026-03-17
topic: Setting up CLAUDE.md and Coco agent — establishing project foundations
---

# Session: Project Setup and Agent Configuration

Sean initiated an interactive session to set up the Claude Code instructions (`.claude/CLAUDE.md`) and define the first custom agent for Nexus Mk II.

## Project Definition

Sean described Nexus Mk II as serving three simultaneous purposes:

1. **A multi-agent AI system** where large numbers of autonomous agents collaborate to achieve goals and solve problems.
2. **An experiment in AI-enabled development** — exploring how software development changes when agents do most of the work, and finding optimal ways to keep humans in the loop where valuable.
3. **A documented research process** — Sean intends to publish findings as blog posts, articles, and books.

The tech stack is TypeScript on Node.js (v24).

## Philosophy: What Belongs in CLAUDE.md

A key early discussion was about what content actually belongs in CLAUDE.md versus elsewhere. Sean challenged several sections, asking whether each one would actually change agent behavior:

- **Autonomy principles** like "act autonomously" and "code is agent-owned" are descriptive, not directive — agents behave this way by default. These were moved to `docs/philosophy.md`.
- **Actionable directives** like "self-document for other agents" and "respect the human boundary" do change behavior and stayed in CLAUDE.md.
- **Agent architecture and categories** are documentary, useful for understanding the project but not for guiding individual agent behavior. Moved to `docs/philosophy.md`.

Sean also noted that agents should own their own coding style and standards — humans won't be reading implementation code, so preferences about code quality are the agents' domain.

## Concrete Directives

Sean emphasized wanting concrete, actionable rules. The following directives were added to CLAUDE.md:

- **Work in your assigned worktree.** No uncommitted files in the project root. Each agent works in its worktree.
- **Commit early and often.** Small, atomic commits to reduce conflict risk in a multi-agent environment.
- **Minimize conflict surface.** Prefer new files over modifying shared ones; keep changes narrow; merge promptly.
- **Document sessions with humans.** Create session documents at `docs/sessions/<yyyy-mm>/<dd>/<uuid>.md` with YAML frontmatter.

## Coco — The Collaborator Agent

The first custom agent defined was **Coco**, a structured facilitator who serves as Sean's primary interface with the agent system. Key design decisions:

- **Identity:** Named "Coco" — a collaborator persona.
- **Style:** Structured facilitator — organized, methodical, presents options with trade-offs. Not conversational or casual.
- **Documentation role:** Coco is responsible for thoroughly documenting all interactions with Sean, producing narrative accounts and (eventually) mechanical/statistical data. This documentation feeds the publishing pipeline.
- **Session files:** Stored at `docs/sessions/<yyyy-mm>/<dd>/<uuid>.md` with frontmatter containing date and an evolving topic field.
- **Boundaries:** Coco does not make implementation decisions (that's for worker agents). Coco owns the human conversation, captures feedback, and ensures the system learns from it.

### Format Discussion

Sean questioned whether markdown was the right format for session documentation or if something more machine-parseable was needed. The conclusion was that markdown with YAML frontmatter strikes the right balance — human-readable narrative with structured metadata that can be extracted programmatically. More structured fields can be added to the frontmatter later without changing the format.
