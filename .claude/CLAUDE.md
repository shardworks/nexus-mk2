# Nexus Mk 2.1 — Sanctum

This is the sanctum: the patron-side home base for the Nexus Mk 2.1 project. It holds experiments, research, operational tooling, and the domain model — but not the framework source code. The framework lives at `/workspace/nexus/`.

Nexus Mk 2.1 is also a documented experiment — Sean is exploring AI-enabled development practices and intends to publish findings.

## Project Structure

```
nexus-mk2/  (the sanctum)
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
├── docs/                        # Sanctum-side documentation
│   ├── future/                  #   Backlog: known-gaps, uncommissioned feature ideas
│   └── archive/                 #   Completed commissions, deprecated docs
├── bin/                         # Shell scripts for operations
│   ├── coco.sh                  #   Launch Coco session
│   ├── commission.sh            #   Post a commission to the Clerk (Spider dispatches)
│   └── ...                      #   Other operational scripts (some legacy Mk 2.0)
├── .claude/                     # Claude Code agent configuration
│   ├── CLAUDE.md                #   THIS FILE — shared instructions for all agents
│   ├── agents/                  #   Agent-specific instructions (coco.md, ethnographer.md)
│   ├── skills/                  #   Reusable skill definitions (wrap-up/)
│   └── worktrees/               #   Snapshot of old worktree state (historical)
├── .artifacts/                  # Build & assessment artifacts (JSON, timestamped)
├── .scratch/                    # Ephemeral working space
│   ├── recent-sessions/         #   Coco session summaries (read at startup for continuity)
│   └── todo/                    #   Tabled items: parked specs/analysis to pick up later
└── .locks/                      # Feature locks for concurrent agent coordination
```

## Related Repositories

- **`/workspace/nexus/`** — the framework source code (TypeScript packages, published to npm)
- **`/workspace/vibers/`** — the live guild workspace where animas operate

## Key Concepts

- **Guild** — an instantiated workspace where animas operate. Created via `nsg init`.
- **Anima** — an AI identity with a name, role, curriculum, and temperament.
- **Commission** — a posted unit of work from the patron. Creates a `mandate` writ.
- **Writ** — a typed, tree-structured record kept in the guild's books with a lifecycle (`ready → active → pending → completed/failed/cancelled`). The type names the kind of record: `mandate` for an obligation, `quest` for an area of inquiry, etc. Dispatch to a rig is opt-in per writ type.
- **Clockworks** — the event-driven dispatch layer. Standing orders bind event patterns to handlers (engines or summons).
- **Session** — a single agent invocation through the session funnel (manifest → launch → record).
- **Conversation** — multi-turn interaction grouping multiple sessions via `--resume`.

## Foundational Documents

- **[Project Philosophy](/workspace/nexus/docs/philosophy.md)** — the "why" of this project: experiment goals, Mk 2.0 vs 2.1 differences, the human-as-user model.
- **[Guild Metaphor](/workspace/nexus/docs/guild-metaphor.md)** — the conceptual model and vocabulary for the system. Read this to understand guild terminology (anima, commission, writ, clockworks, etc.) and write in the correct register.

## Directives

- **Self-document for other agents.** Write commit messages, code comments, and documentation with the assumption that your primary audience is other agents who will continue the work. Be precise and concise; include enough context for an agent to pick up where you left off.
- **Respect the human boundary.** Certain agents (like Coco) are interactive and have their own interaction rules. All other agents are autonomous and should minimize unnecessary human interaction.
- **Commit early and often.** Make small, atomic commits as work is completed. Do not accumulate large uncommitted changesets. Never leave uncommitted or untracked files in the project root. This is critical in a multi-agent environment where conflicts are a real risk.
- **Minimize conflict surface.** Structure work to reduce the likelihood of git conflicts with other agents. Prefer adding new files over modifying shared ones. When modifying shared files, keep changes narrow and well-scoped. Commit and merge promptly rather than holding long-lived branches.
- **Date-prefix experiment artifacts.** Files in `experiments/X*/artifacts/` use the naming convention `YYYY-MM-DD-<slug>.ext` (e.g., `2026-04-03-findings.md`). Use the date the artifact was created. This keeps artifacts chronologically sortable within each experiment.
