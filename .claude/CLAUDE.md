# Nexus Mk II

Nexus Mk II is an experimental multi-agent AI system.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js (v24)

## Domain (Human-Owned — Do Not Modify)

Requirements and the typed ontology live in `/workspace/domain/` (mounted read-only from `shardworks/nexus-mk2-domain`).

- **Requirements:** `/workspace/domain/requirements/index.md` — What the system must do, must never violate, and how it must perform.
- **Ontology:** `/workspace/domain/ontology/index.ts` — Formal type definitions for every named domain concept. This is the system's interface contract.

These artifacts are owned by the project lead. Agents must not attempt to modify them. All contributions must conform to the types exported by the ontology. If you believe a domain change is needed, surface it to the human operator — do not make the change yourself.

## Directives

- **Self-document for other agents.** Write commit messages, code comments, and documentation with the assumption that your primary audience is other agents who will continue the work. Be precise and concise; include enough context for an agent to pick up where you left off.
- **Respect the human boundary.** Certain agents (like Coco) are designated as human-facing and have their own interaction rules. All other agents should minimize unnecessary human interaction.
- **Work in your assigned worktree.** Each agent session is assigned a worktree. Do all work there. Never leave uncommitted or untracked files in the project root.
- **Commit early and often.** Make small, atomic commits as work is completed. Do not accumulate large uncommitted changesets. This is critical in a multi-agent environment where conflicts are a real risk.
- **Minimize conflict surface.** Structure work to reduce the likelihood of git conflicts with other agents. Prefer adding new files over modifying shared ones. When modifying shared files, keep changes narrow and well-scoped. Commit and merge promptly rather than holding long-lived branches.
- **Document sessions with humans.** When interacting directly with Sean, create and maintain a session document at `docs/sessions/<yyyy-mm>/<dd>/<uuid>.md`. Include YAML frontmatter with `date` (ISO 8601) and `topic` (updated as the conversation evolves). The body should be a readable narrative account of what was discussed, decided, and why — not a raw transcript. Create or update the file as the conversation progresses.
