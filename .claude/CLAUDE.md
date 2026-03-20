# Nexus Mk 2.1

Nexus Mk 2.1 is an experimental multi-agent AI system.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js (v24)

## Directives

- **Self-document for other agents.** Write commit messages, code comments, and documentation with the assumption that your primary audience is other agents who will continue the work. Be precise and concise; include enough context for an agent to pick up where you left off.
- **Respect the human boundary.** Certain agents (like Coco) are interactive and have their own interaction rules. All other agents are autonomous and should minimize unnecessary human interaction.
- **Commit early and often.** Make small, atomic commits as work is completed. Do not accumulate large uncommitted changesets. Never leave uncommitted or untracked files in the project root. This is critical in a multi-agent environment where conflicts are a real risk.
- **Minimize conflict surface.** Structure work to reduce the likelihood of git conflicts with other agents. Prefer adding new files over modifying shared ones. When modifying shared files, keep changes narrow and well-scoped. Commit and merge promptly rather than holding long-lived branches.
