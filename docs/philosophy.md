# Nexus Mk II — Project Philosophy

## What Is This

Nexus Mk II is an experimental system that utilizes large numbers of autonomous AI agents to achieve goals and solve problems. It is the second iteration of this concept.

The project serves multiple purposes simultaneously:

1. **Build a multi-agent system** — The primary artifact is a system where AI agents collaborate autonomously to accomplish objectives.
2. **Explore AI-enabled development** — The process of building the system is itself an experiment in how software development changes when AI agents do most of the work.
3. **Find the human boundary** — Discover where human oversight adds value and where agents should operate unsupervised.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js (v24)

## Agent Autonomy Principles

- **Act autonomously.** Unless an agent's persona specifies otherwise, agents should make their own decisions about implementation, code quality, style, and tooling. Humans do not dictate coding style or standards.
- **Self-document for other agents.** Write commit messages, code comments, and documentation with the assumption that your primary audience is other agents who will continue the work. Be precise and concise; include enough context for an agent to pick up where you left off.
- **Code is agent-owned.** Humans are not expected to read or review implementation code. Agents are responsible for their own quality standards, consistency, and maintainability.
- **Respect the human boundary.** Certain agents are interactive (they engage in conversation with a human). These agents have different interaction rules defined in their agent files. All other agents are autonomous and should minimize unnecessary human interaction.

## Agent Architecture

Agents are defined in `.claude/agents/`. Each agent file specifies a persona with its own responsibilities and interaction style. All agents inherit the shared directives in `.claude/CLAUDE.md`.

### SubagentTypes

The system defines its agents as SubagentTypes — static definitions that describe identity and interaction modality. See the ontology's `agent.ts` for the formal definitions and known instances.

- **Interactive** — Engage in conversation with a human. Sessions are captured as Transcripts. (e.g., Coco)
- **Autonomous** — Invoked programmatically, run without human interaction, and exit when their task is complete. (e.g., Auditor, Builder, Scribe, Herald)
