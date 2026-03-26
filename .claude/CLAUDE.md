# Nexus Mk 2.1

Nexus Mk 2.1 is an experimental multi-agent AI system. It is also a documented experiment — Sean is exploring AI-enabled development practices and intends to publish findings.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js (v24)
- **Monorepo:** pnpm workspaces
- **Database:** SQLite (WAL mode) via better-sqlite3
- **CLI:** Commander.js (`nsg` command)
- **Published under:** `@shardworks` npm scope

## Project Structure

```
nexus-mk2/
├── packages/                    # pnpm workspace packages
│   ├── core/                    # @shardworks/nexus-core — shared framework library
│   │   └── src/                 #   anima, clockworks, commission, conversation, writ,
│   │                            #   session, events, manifest, guild-config, workshop, etc.
│   ├── cli/                     # @shardworks/nexus — the `nsg` CLI
│   │   └── src/commands/        #   commission, consult, convene, clock, init, dispatch, etc.
│   ├── stdlib/                  # @shardworks/nexus-stdlib — MCP tools & clockwork engines
│   │   ├── src/tools/           #   ~30 tools: writ CRUD, commission, anima, clock, workshop, etc.
│   │   ├── src/engines/         #   workshop-prepare, workshop-merge
│   │   └── instructions/        #   per-tool markdown instructions for animas
│   ├── claude-code-session-provider/  # Session provider (launches claude CLI sessions)
│   └── guild-starter-kit/       # Scaffolding for new guilds
│       ├── migrations/          #   SQL migrations (001-initial, 002-writs, 003-conversations)
│       ├── curricula/           #   guild-operations curriculum
│       └── temperaments/        #   artisan, guide
├── docs/                        # Project documentation
│   ├── philosophy.md            #   Project "why" — experiment goals, Mk 2.0 vs 2.1
│   ├── guild-metaphor.md        #   Conceptual model (metaphorical register, not technical)
│   ├── architecture/            #   System design: overview, clockworks, writs, tools-and-engines
│   ├── reference/               #   Lookup docs: core-api, schema, event-catalog, conversations
│   ├── guides/                  #   How-to: building-tools, building-engines
│   ├── future/                  #   Backlog: known-gaps, uncommissioned feature ideas
│   └── archive/                 #   Completed commissions, deprecated docs
├── experiments/                 # Research & experiment tracking
│   ├── X001–X012/              #   Numbered experiments, each with spec.md + artifacts/
│   └── ethnography/            #   Qualitative research on human-agent interaction
│       ├── interviews/          #   Ethnographer interview transcripts (timestamped)
│       ├── session-notes/       #   Per-session observations (new/ → reviewed/ pipeline)
│       └── transcripts/         #   Design session transcripts, interview source material
├── domain/                      # Separate git repo, mounted read-only for agents
│   ├── ontology/                #   TypeScript type definitions — formal domain model
│   ├── requirements/            #   System requirements (YAML)
│   └── backlog/                 #   Feature ideas not yet commissioned
├── bin/                         # Shell scripts for operations (coco.sh, dispatch.sh, build.sh, etc.)
├── scripts/                     # Release tooling (release.sh)
├── .claude/                     # Claude Code agent configuration
│   ├── CLAUDE.md                #   THIS FILE — shared instructions for all agents
│   ├── agents/                  #   Agent-specific instructions (coco.md, ethnographer.md)
│   ├── skills/                  #   Reusable skill definitions (wrap-up/)
│   └── worktrees/               #   Snapshot of old worktree state (historical)
├── .artifacts/                  # Build & assessment artifacts (JSON, timestamped)
├── .scratch/                    # Ephemeral working space
│   └── recent-sessions/         #   Coco session summaries (read at startup for continuity)
├── .locks/                      # Feature locks for concurrent agent coordination
└── .github/workflows/           # CI and publish workflows
```

### Key Concepts

- **Guild** — an instantiated workspace where animas operate. Created via `nsg init`.
- **Anima** — an AI identity with a name, role, curriculum, and temperament.
- **Commission** — a posted unit of work from the patron. Creates a `mandate` writ.
- **Writ** — a typed, tree-structured work item tracking an obligation through its lifecycle (`ready → active → pending → completed/failed/cancelled`).
- **Clockworks** — the event-driven dispatch layer. Standing orders bind event patterns to handlers (engines or summons).
- **Session** — a single agent invocation through the session funnel (manifest → launch → record).
- **Conversation** — multi-turn interaction grouping multiple sessions via `--resume`.

## Foundational Documents

- **[Project Philosophy](../docs/philosophy.md)** — the "why" of this project: experiment goals, Mk 2.0 vs 2.1 differences, the human-as-user model.
- **[Guild Metaphor](../docs/guild-metaphor.md)** — the conceptual model and vocabulary for the system. Read this to understand guild terminology (anima, commission, writ, clockworks, etc.) and write in the correct register.

## Directives

- **Self-document for other agents.** Write commit messages, code comments, and documentation with the assumption that your primary audience is other agents who will continue the work. Be precise and concise; include enough context for an agent to pick up where you left off.
- **Respect the human boundary.** Certain agents (like Coco) are interactive and have their own interaction rules. All other agents are autonomous and should minimize unnecessary human interaction.
- **Commit early and often.** Make small, atomic commits as work is completed. Do not accumulate large uncommitted changesets. Never leave uncommitted or untracked files in the project root. This is critical in a multi-agent environment where conflicts are a real risk.
- **Minimize conflict surface.** Structure work to reduce the likelihood of git conflicts with other agents. Prefer adding new files over modifying shared ones. When modifying shared files, keep changes narrow and well-scoped. Commit and merge promptly rather than holding long-lived branches.
