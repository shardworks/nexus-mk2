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

A workshop is a repository where animas do their work. Workshops are guild space — the patron assigns them, but during normal operation the patron judges results by the works produced, not by inspecting the workshop directly.

Each workshop is registered in `guild.json` under the `workshops` key with its name, remote URL, and the timestamp it was added. On disk, the guild maintains a bare clone of each workshop at `.nexus/workshops/{name}.git`. Commission worktrees are created from these bare clones, giving each commission an isolated working directory.

### Managing Workshops

Four commands manage the workshop lifecycle:

| Command | What it does |
|---------|-------------|
| `nsg workshop add <url>` | Clone a remote repo and register it as a workshop |
| `nsg workshop remove <name>` | Remove a workshop — deletes bare clone, worktrees, and guild.json entry |
| `nsg workshop list` | List all workshops with clone status and active worktree count |
| `nsg workshop create <org/name>` | Create a new GitHub repo and register it as a workshop |

### Adding an Existing Repository

When the patron has an existing repository they want the guild to work on:

```
nsg workshop add https://github.com/org/my-app.git
```

This clones the repo as a bare clone into `.nexus/workshops/my-app.git` and adds it to `guild.json`. The workshop name is derived from the URL (the last path segment, minus `.git`). To use a custom name:

```
nsg workshop add https://github.com/org/my-app.git --name frontend
```

The repository must already exist and be accessible. SSH URLs work too:

```
nsg workshop add git@github.com:org/my-app.git
```

### Creating a New Repository

For greenfield work where no repository exists yet:

```
nsg workshop create myorg/new-project
```

This requires the GitHub CLI (`gh`) to be installed and authenticated. The command:

1. Creates the repository on GitHub (private by default)
2. Clones it as a bare clone into `.nexus/workshops/`
3. Registers it in `guild.json`

For a public repository:

```
nsg workshop create myorg/new-project --public
```

If `gh` is not installed or not authenticated, the command fails with a clear message explaining what's needed.

### Workshop Status

`nsg workshop list` shows each workshop with:

- **✓ / ✗** — whether the bare clone exists on disk (it may be missing after a fresh guild clone before running `nsg guild restore`)
- **Active worktrees** — how many commissions currently have worktrees checked out
- **Remote URL** — where the repo lives

If a bare clone is missing, the output includes a hint to run `nsg guild restore`.

### Removing a Workshop

```
nsg workshop remove my-app
```

This deletes the bare clone, any commission worktrees for that workshop, and removes the entry from `guild.json`. This is a destructive operation — the workshop's local state is gone. The remote repository is not affected.

### How Workshops Are Used in Commissions

When a commission is dispatched to a workshop, the worktree-setup engine:

1. Creates a commission-specific branch from `main` in the workshop's bare clone
2. Checks out a git worktree at `.nexus/worktrees/{workshop}/commission-{id}/`
3. The anima works in this isolated directory

This means multiple commissions can run concurrently in the same workshop without interfering with each other — each gets its own branch and working directory.

### guild.json Shape

```json
{
  "workshops": {
    "my-app": {
      "remoteUrl": "https://github.com/org/my-app.git",
      "addedAt": "2026-03-24T12:00:00.000Z"
    }
  }
}
```

The `remoteUrl` is the source of truth. The bare clone on disk is ephemeral and can be reconstructed from this URL by `nsg guild restore`.

## Commissions

A commission is a unit of work posted by the patron and undertaken by the guild. The lifecycle:

1. **Posted** — the patron describes what needs to be built
2. **Assigned** — dispatched to an artificer (with sage consultation if a Master Sage is active)
3. **In progress** — the artificer works in a workshop worktree
4. **Completed** or **Failed** — work is delivered or the commission is marked as failed

Use `nsg commission` to post commissions. The Clockworks handles the rest via standing orders.

## Tools

### Tools

Tools that animas wield during work. Each tool ships with instructions delivered to the anima at manifest time. Available tools:

- **install-tool** — install new tools, engines, or bundles into the guild
- **remove-tool** — remove installed tools
- **commission** — post commissions to the guild
- **instantiate** — create new animas with assigned training and roles
- **nexus-version** — report the installed Nexus framework version
- **signal** — signal a custom guild event for the Clockworks

### Engines

Automated mechanical processes with no AI involvement. Two kinds:

**Static engines** — bespoke APIs called by framework code. Not triggerable by standing orders.

- **manifest** — composes anima instructions from codex, training, and tool instructions at session start
- **mcp-server** — runs the MCP server that exposes tools to animas during sessions
- **worktree-setup** — creates and manages git worktrees for commissions
- **ledger-migrate** — applies database migrations to the Ledger

**Clockwork engines** — purpose-built to respond to events via standing orders. Use the `engine()` SDK factory from `@shardworks/nexus-core`. The Clockworks runner calls them automatically when matching events fire.

- **workshop-prepare** — creates a worktree when a commission is posted (`commission.posted` → `commission.ready`)
- **workshop-merge** — merges a commission branch after the session ends (`commission.session.ended` → `commission.completed` or `commission.failed`)

## The Codex

The guild's institutional body of policy and procedure — the employee handbook. Lives in `codex/` in the guildhall. Every anima receives the codex when manifested. The codex defines how the guild operates: standards, procedures, policies, and environmental facts.

Role-specific codex entries live in `codex/roles/` and are delivered only to animas holding that role.

## The Ledger

The guild's operational database (SQLite). Holds anima records, roster, commission history, compositions, events, and the audit trail. Lives at `.nexus/nexus.db` in the guildhall. Managed by the ledger-migrate engine.

## The Clockworks

The Clockworks is the guild's event-driven nervous system — it connects things that happen to things that should happen in response. It turns the guild from a purely imperative system into a reactive one.

### Events

An event is an immutable fact: *this happened*. Events are recorded in the Ledger and processed by the Clockworks runner.

Two kinds:

- **Framework events** — signaled automatically by the system (`commission.sealed`, `tool.installed`, `anima.instantiated`, etc.). Animas cannot signal these.
- **Custom events** — declared by the guild in `guild.json` under `clockworks.events`. Animas signal these using the `signal` tool.

### Standing Orders

A standing order is a registered response to an event — guild policy that says "when X happens, do Y." Standing orders live in `guild.json` under `clockworks.standingOrders`.

Three verbs:

| Verb | What it does |
|------|-------------|
| **`run`** | Invokes a clockwork engine. No AI involved — deterministic automation. |
| **`summon`** | Manifests an anima (by role) and delivers the event as urgent context. The anima is expected to act. |
| **`brief`** | Manifests an anima (by role) and delivers the event as informational context. The anima decides whether to act. |

Standing orders target **roles**, not named animas — durable across anima turnover.

Example `guild.json` configuration:

```json
{
  "clockworks": {
    "events": {
      "code.reviewed": {
        "description": "Signaled when an artificer completes a code review"
      }
    },
    "standingOrders": [
      { "on": "commission.sealed", "run": "cleanup-worktree" },
      { "on": "commission.failed", "summon": "advisor" },
      { "on": "code.reviewed",     "brief": "guildmaster" }
    ]
  }
}
```

### Signaling Events

Use the **signal** tool to signal custom events:

```
signal({ name: "code.reviewed", payload: { pr: 42, issues_found: 0 } })
```

The event name must be declared in `guild.json clockworks.events`. Framework namespaces (`anima.*`, `commission.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`) are reserved.

### Processing Events

Events are not processed automatically. The operator controls when the Clockworks runs:

| Command | What it does |
|---------|-------------|
| `nsg clock list` | Show all pending (unprocessed) events |
| `nsg clock tick [id]` | Process the next pending event, or a specific one by id |
| `nsg clock run` | Process all pending events until the queue is empty |

### Error Handling

When a standing order fails, the system signals a `standing-order.failed` event. Guilds can respond to this with their own standing orders. A loop guard prevents cascading failures.

### Hello World Walkthrough

To test the Clockworks from scratch:

**1. Declare a custom event** in `guild.json`:

```json
{
  "clockworks": {
    "events": {
      "hello.world": {
        "description": "A test event for verifying the Clockworks"
      }
    },
    "standingOrders": []
  }
}
```

**2. Signal the event:**

```
nsg signal hello.world --payload '{"message": "greetings from the Clockworks"}'
```

**3. Check the queue:**

```
nsg clock list
```

You should see the pending event with its id, name, payload, and timestamp.

**4. Process it:**

```
nsg clock tick
```

Since there are no standing orders, the event is marked as processed with no dispatches.

**5. Add a standing order** to `guild.json`:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "hello.world", "brief": "advisor" }
    ]
  }
}
```

**6. Signal again and process:**

```
nsg signal hello.world
nsg clock tick
```

The Clockworks matches the event to the standing order and dispatches it — the advisor is briefed.

## Training

### Curricula

Named, versioned, immutable bodies of training content. A curriculum defines what an anima knows — skills, methodology, domain knowledge. New thinking produces a new version; existing versions are never edited.

### Temperaments

Named, versioned, immutable personality templates. A temperament defines who an anima is — disposition, communication style, character. Same immutability rules as curricula.

Training content lives in `training/curricula/` and `training/temperaments/` in the guildhall, organized as `{name}/{version}/`.

## Guild Restore

When the guildhall repository is cloned fresh onto a new machine (or by a new developer), the `.nexus/` directory does not exist — it is gitignored. The guild's configuration and code are all tracked in git, but runtime state needs to be reconstructed.

```
nsg guild restore
```

This command reconstructs all ephemeral runtime state from the tracked guild configuration:

1. **Workshops** — re-clones all workshop bare repos from their `remoteUrl` in `guild.json`. Skips any that are already present.
2. **npm dependencies** — runs `npm install` to restore packages from `package.json`.
3. **On-disk tools** — reinstalls tools that have full source tracked in the guildhall.
4. **Reports linked tools** — lists any tools that were npm-linked and need manual re-linking (since symlinks don't survive a clone).

The command is idempotent — safe to run at any time. If everything is already in place, it reports "Nothing to restore."

### When to Run Restore

- After cloning the guildhall repo for the first time
- After pulling changes that added new workshops
- If a bare clone is corrupted or accidentally deleted
- When `nsg workshop list` shows ✗ (missing bare clone) for any workshop

### What Restore Does NOT Do

- It does not create the Ledger (that's done by `nsg init` and the ledger-migrate engine)
- It does not re-create animas or commissions — those live in the Ledger
- It does not push or pull workshop repos — it only clones them fresh if missing

## CLI Reference

The primary interface is the `nsg` command:

| Command | Purpose |
|---------|---------|
| `nsg init` | Create a new guild |
| `nsg commission <spec> --workshop <name>` | Post a commission |
| `nsg tool install <source>` | Install a tool or bundle |
| `nsg tool remove <name>` | Remove an installed tool |
| `nsg workshop add <url>` | Clone a remote repo and register it as a workshop |
| `nsg workshop remove <name>` | Remove a workshop |
| `nsg workshop list` | List workshops with status |
| `nsg workshop create <org/name>` | Create a new GitHub repo and register as a workshop |
| `nsg guild restore` | Restore runtime state after a fresh clone |
| `nsg anima create` | Instantiate a new anima |
| `nsg anima manifest <name>` | Generate an anima's full instructions |
| `nsg status` | Show guild status |
| `nsg consult <name>` | Consult a standing anima (e.g., the advisor) |
| `nsg signal <name>` | Signal a custom guild event |
| `nsg clock list` | Show pending events |
| `nsg clock tick [id]` | Process next pending event (or specific id) |
| `nsg clock run` | Process all pending events |
