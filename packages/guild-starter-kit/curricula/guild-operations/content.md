# Guild Operations Curriculum

This curriculum teaches how a Nexus guild operates — its structure, workflows, and the tools available to its members.

## What Is a Guild

A guild is a self-contained multi-agent AI system. It has members (animas), tools (tools and engines), workshops (repositories where work happens), and a body of institutional knowledge (the codex). The guild is managed by a human patron who commissions work and judges results.

The guildhall is the guild's institutional center — a repository that holds configuration, tools, training content, and the Ledger. Work does not happen in the guildhall; it happens in workshops.

## Animas

An anima is the fundamental unit of identity in the guild. Animas are animated by AI agents — they have names, roles, training (curriculum + temperament), and persistent identity across sessions.

### States

| State | Meaning |
|-------|---------|
| **Aspirant** | Being trained, not yet dispatchable |
| **Active** | On the roster, available for work |
| **Retired** | No longer active, record preserved |

### Standing vs. Commissioned

- **Standing** animas persist on the roster indefinitely, called on by name. The advisor is a standing anima.
- **Commissioned** animas are created for a specific commission and their tenure ends when the commission completes. Artificers are typically commissioned.

## Roles

Roles define what kind of work an anima performs.

| Role | Function |
|------|----------|
| **Advisor** | Helps the patron understand and use the guild. Answers questions, explains state, suggests actions. Does not implement. |
| **Artificer** | Undertakes commissions — receives a plan and builds the thing. Works in workshops. |
| **Sage** | Plans commission work. Refines vague instructions into concrete requirements. |
| **Master Sage** | Senior sage. If active, must be consulted before any commission is undertaken. |

Other roles may emerge as the guild evolves.

## Workshops

A workshop is a repository where animas do their work. The patron assigns workshops (usually existing repos), and artificers work inside them on commissions. The patron judges results by the works produced, not by inspecting the workshop.

### Workshop Lifecycle

1. A workshop is registered with the guild (`nsg workshop add <url>`)
2. The guild clones it and manages worktrees for concurrent commissions
3. Artificers work in isolated worktrees — one per commission
4. Completed work is delivered as branches or pull requests

## Commissions

A commission is a unit of work posted by the patron and undertaken by the guild. The lifecycle:

1. **Posted** — the patron describes what needs to be built
2. **Assigned** — dispatched to an artificer (with sage consultation if a Master Sage is active)
3. **In progress** — the artificer works in a workshop worktree
4. **Completed** or **Failed** — work is delivered or the commission is marked as failed

Use `nsg dispatch` to post and dispatch commissions.

## Tools

### Tools

Tools that animas wield during work. Each tool ships with instructions delivered to the anima at manifest time. Available tools:

- **install-tool** — install new tools, engines, or bundles into the guild
- **remove-tool** — remove installed tools
- **dispatch** — post and dispatch commissions
- **instantiate** — create new animas with assigned training and roles
- **nexus-version** — report the installed Nexus framework version

### Engines

Automated mechanical processes with no AI involvement. Engines handle repeatable infrastructure work:

- **manifest** — composes anima instructions from codex, training, and tool instructions at session start
- **mcp-server** — runs the MCP server that exposes tools to animas during sessions
- **worktree-setup** — creates and manages git worktrees for commissions
- **ledger-migrate** — applies database migrations to the Ledger

## The Codex

The guild's institutional body of policy and procedure — the employee handbook. Lives in `codex/` in the guildhall. Every anima receives the codex when manifested. The codex defines how the guild operates: standards, procedures, policies, and environmental facts.

Role-specific codex entries live in `codex/roles/` and are delivered only to animas holding that role.

## The Ledger

The guild's operational database (SQLite). Holds anima records, roster, commission history, compositions, and the audit trail. Lives at `.nexus/nexus.db` in the guildhall. Managed by the ledger-migrate engine.

## Training

### Curricula

Named, versioned, immutable bodies of training content. A curriculum defines what an anima knows — skills, methodology, domain knowledge. New thinking produces a new version; existing versions are never edited.

### Temperaments

Named, versioned, immutable personality templates. A temperament defines who an anima is — disposition, communication style, character. Same immutability rules as curricula.

Training content lives in `training/curricula/` and `training/temperaments/` in the guildhall, organized as `{name}/{version}/`.

## CLI Reference

The primary interface is the `nsg` command:

| Command | Purpose |
|---------|---------|
| `nsg init` | Create a new guild |
| `nsg dispatch <content>` | Post and dispatch a commission |
| `nsg tool install <source>` | Install a tool or bundle |
| `nsg tool remove <name>` | Remove an installed tool |
| `nsg anima create` | Instantiate a new anima |
| `nsg anima manifest <name>` | Generate an anima's full instructions |
| `nsg status` | Show guild status |
| `nsg consult <name>` | Consult a standing anima (e.g., the advisor) |
