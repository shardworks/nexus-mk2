# Nexus Mk II

Nexus Mk II is an experimental multi-agent AI system.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js (v24)

## Domain (Human-Owned — Do Not Modify)

Requirements and the typed ontology live in `/workspace/nexus-mk2/domain/` (mounted read-only from `shardworks/nexus-mk2-domain`).

- **Requirements:** `/workspace/nexus-mk2/domain/requirements/index.yaml` — YAML file defining features and their requirements as invariants.
- **Ontology:** `/workspace/nexus-mk2/domain/ontology/` — TypeScript modules defining every named domain concept. `index.ts` is the barrel; types are split across topical files (`audit.ts`, `agent.ts`, `system.ts`, etc.).

These artifacts are owned by the project lead. Agents must not attempt to modify them. All contributions must conform to the types exported by the ontology. If you believe a domain change is needed, surface it to the human operator — do not make the change yourself.

## Dispatcher

All operations in Nexus Mk II are invoked through a single entry point: `bin/dispatch.sh`. This is the standard way to dispatch any operation, whether from the command line, the build loop, or another agent.

**Usage:** `bin/dispatch.sh <operator> [<operation>] [args...]`

**Registered Operators and Operations:**

| Operator  | Operation | Effects | Example |
|-----------|-----------|---------|---------|
| `auditor` | `audit`   | produces `audit-report`, `assessment` | `bin/dispatch.sh auditor` |
| `builder` | `build`   | consumes `assessment`, produces `build-result` | `bin/dispatch.sh builder` |
| `scribe`  | `scribe`  | consumes transcript, produces `session-doc` | `bin/dispatch.sh scribe /path/to/transcript.jsonl` |
| `herald`  | `herald`  | consumes `session-doc`, produces `publication` | `bin/dispatch.sh herald "Write a weekly recap"` |

When an operator has only one operation, the operation name can be omitted. Run `bin/dispatch.sh help` for full usage details.

## Directives

- **Self-document for other agents.** Write commit messages, code comments, and documentation with the assumption that your primary audience is other agents who will continue the work. Be precise and concise; include enough context for an agent to pick up where you left off.
- **Respect the human boundary.** Certain agents (like Coco) are interactive and have their own interaction rules. All other agents are autonomous and should minimize unnecessary human interaction.
- **Work in your assigned worktree.** Each agent session is assigned a worktree. Do all work there. Never leave uncommitted or untracked files in the project root.
- **Commit early and often.** Make small, atomic commits as work is completed. Do not accumulate large uncommitted changesets. This is critical in a multi-agent environment where conflicts are a real risk.
- **Minimize conflict surface.** Structure work to reduce the likelihood of git conflicts with other agents. Prefer adding new files over modifying shared ones. When modifying shared files, keep changes narrow and well-scoped. Commit and merge promptly rather than holding long-lived branches.
