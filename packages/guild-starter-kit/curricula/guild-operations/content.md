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

- **Standing** animas persist on the roster indefinitely, called on by name. The steward is a standing anima.
- **Commissioned** animas are created for a specific commission and their tenure ends when the commission completes.

## Roles

Roles define what kind of work an anima performs. Roles are not a fixed set — a guild defines its own roles to match how it organizes work. The framework provides infrastructure for roles (registration, tool gating, role resolution in standing orders) but does not prescribe which roles a guild must have.

This guild uses the following roles:

| Role | Function |
|------|----------|
| **Steward** | The patron's right hand. Advises on guild state and administers the guild — manages the roster, workshops, commissions, tools, and the Clockworks. Does not build works. |
| **Artificer** | Executes jobs — receives planned work and builds the thing. Works in workshops. Plans and records strokes for progress tracking. |
| **Sage** | Plans work. Decomposes commissions into pieces and jobs with concrete requirements. |
| **Master Sage** | Senior sage. If active, reviews incoming commissions to determine scope and planning approach. |

Other roles may emerge as the guild evolves.

## Workshops

A workshop is a repository where animas do their work. Workshops are guild space — the patron assigns them, but during normal operation the patron judges results by the works produced, not by inspecting the workshop directly.

Each workshop is registered in `guild.json` under the `workshops` key with its name, remote URL, and the timestamp it was added. On disk, the guild maintains a bare clone of each workshop at `.nexus/workshops/{name}.git`. Worktrees are created from these bare clones, giving each job an isolated working directory.

### Managing Workshops

Four commands manage the workshop lifecycle:

| Command | What it does |
|---------|-------------|
| `nsg workshop register <url>` | Clone a remote repo and register it as a workshop |
| `nsg workshop remove <name>` | Remove a workshop — deletes bare clone, worktrees, and guild.json entry |
| `nsg workshop list` | List all workshops with clone status and active worktree count |
| `nsg workshop create <org/name>` | Create a new GitHub repo and register it as a workshop |

### Registering an Existing Repository

When the patron has an existing repository they want the guild to work on:

```
nsg workshop register https://github.com/org/my-app.git
```

This clones the repo as a bare clone into `.nexus/workshops/my-app.git` and adds it to `guild.json`. The workshop name is derived from the URL (the last path segment, minus `.git`). To use a custom name:

```
nsg workshop register https://github.com/org/my-app.git --name frontend
```

The repository must already exist and be accessible. SSH URLs work too:

```
nsg workshop register git@github.com:org/my-app.git
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
- **Active worktrees** — how many jobs currently have worktrees checked out
- **Remote URL** — where the repo lives

If a bare clone is missing, the output includes a hint to run `nsg guild restore`.

### Removing a Workshop

```
nsg workshop remove my-app
```

This deletes the bare clone, any job worktrees for that workshop, and removes the entry from `guild.json`. This is a destructive operation — the workshop's local state is gone. The remote repository is not affected.

### How Workshops Are Used

When a job is dispatched to a workshop, the workshop-prepare engine:

1. Creates a job-specific branch from `main` in the workshop's bare clone
2. Checks out a git worktree at `.nexus/worktrees/{workshop}/commission-{id}/`
3. The anima works in this isolated directory

This means multiple jobs can run concurrently in the same workshop without interfering with each other — each gets its own branch and working directory.

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

## Commissions and Work Decomposition

A commission is the patron's act of requesting work. The guild receives commissions and organizes the resulting labor through a four-level decomposition hierarchy:

### The Shape of Labor

| Level | What It Is | Who Handles It (in this guild) |
|-------|-----------|-------------------------------|
| **Work** | A large undertaking — too broad to plan directly, must be broken into pieces | Sage decomposes into pieces |
| **Piece** | An independently-plannable chunk of a work | Sage plans into concrete jobs |
| **Job** | A single assignment for one anima — one continuous effort, one deliverable | Artificer executes |
| **Stroke** | An atomic, verifiable action within a job — one test, one function, one integration step | Artificer records and completes |

Not every commission becomes a work. A small commission might map directly to a single job. The hierarchy describes the shape of the labor, not a mandatory sequence of steps.

### Commission Lifecycle

1. **Posted** — the patron runs `nsg commission create <spec> --workshop <name>`. This creates the commission in the Ledger and signals `commission.posted`.
2. **Scope determined** — the Master Sage (if active) reviews the commission and determines whether it's a work (needs decomposition), a piece (needs planning into jobs), or a single job (ready for dispatch).
3. **Planned** — for works and pieces, the sage decomposes and plans, producing concrete jobs with acceptance criteria.
4. **Worktree prepared** — the `workshop-prepare` engine (triggered by `commission.posted`) creates a job branch and worktree, then signals `commission.ready`.
5. **Dispatched & In Progress** — the Clockworks summons an artificer (triggered by `commission.ready`), resolves the role to a specific anima, writes the assignment, and launches a session.
6. **Strokes recorded** — the artificer plans strokes at the start of the job and records progress throughout. Each stroke is tracked in the Ledger.
7. **Session ended** — when the session finishes, the Clockworks checks the stroke record. If pending strokes remain, the anima is re-summoned in a fresh session (staged sessions). If all strokes are complete, the Clockworks signals `commission.session.ended`.
8. **Merged or Failed** — the `workshop-merge` engine (triggered by `commission.session.ended`) merges the job branch back to main. On success it signals `commission.completed`; on conflict it signals `commission.failed`.

Each step is driven by a standing order in `guild.json`, making the pipeline configurable and extensible.

### Staged Sessions

A job may span multiple sessions when the context window fills up. The stroke record provides continuity between sessions:

- The anima records strokes via tool throughout the job
- When a session ends with pending strokes, the Clockworks re-summons the anima in a fresh session
- The next session receives the original job spec plus the stroke record — a structured checklist of what's done and what remains
- The anima picks up where the previous session left off

The anima does not need to write freeform handoff notes — the stroke record is the handoff.

### Commission Status Flow

```
posted → in_progress → completed
                     → failed
```

## Sessions

A session is a single manifestation of an anima — the span during which an anima is alive and working. Every interaction with an anima happens through a session, whether it's consulting the steward, dispatching a job, or briefing an anima about an event.

### Session Triggers

| Trigger | Meaning |
|---------|---------|
| **consult** | Interactive session with a standing anima (e.g., `nsg consult steward`) |
| **summon** | The anima is summoned by a standing order to act on an event — autonomous, directive |
| **brief** | The anima is briefed by a standing order about an event — autonomous, informational |

### The Session Funnel

All sessions flow through a single code path (`launchSession`) that provides unified lifecycle management:

1. **Workspace setup** — resolves where the anima will work (guildhall, or a worktree in a workshop)
2. **Ledger recording** — writes a `session.started` row with the anima's identity, composition, and context
3. **Event signaling** — signals `session.started` for the Clockworks
4. **Provider launch** — delegates to the session provider (e.g., Claude Code) to run the actual AI session
5. **Cleanup** — writes `session.ended` to the Ledger with metrics (tokens, cost, duration), writes a full session record to `.nexus/sessions/`, signals `session.ended`, and tears down temporary worktrees (for autonomous sessions only)

### Session Records

Every session produces a JSON record at `.nexus/sessions/{uuid}.json` containing:

- The anima's full composition at session time (curriculum, temperament, roles, codex, tool instructions)
- The assembled system prompt
- The user prompt
- Available and unavailable tools
- The raw conversation transcript

Session records are the guild's institutional memory of what each anima knew and did.

### Session Tracking in the Ledger

The `sessions` table tracks every session with:

- Which anima ran the session and what composition they had
- Which provider and model were used
- What triggered the session (consult, summon, brief)
- Which workshop (if any) the session worked in
- Start/end times, exit code, token usage, cost, and duration
- A link to the full session record JSON on disk

For commissions, the `commission_sessions` join table links commissions to their sessions — a commission may involve multiple sessions (staged sessions, retries).

## Tools

Tools that animas wield during work. Each tool ships with instructions delivered to the anima at manifest time. Tools follow a `<noun>-<verb>` naming convention. All tools are packaged in `@shardworks/nexus-stdlib`:

### Commission Tools
- **commission-create** — post a commission to the guild
- **commission-list** — list commissions with optional filters
- **commission-show** — show details of a specific commission
- **commission-update** — update a commission's status

### Anima Tools
- **anima-create** — create a new anima with assigned training and roles
- **anima-list** — list animas with optional filters
- **anima-show** — show details of a specific anima
- **anima-update** — update an anima's status or roles
- **anima-remove** — remove an anima from the guild

### Workshop Tools
- **workshop-create** — create a new GitHub repo and register as a workshop
- **workshop-register** — register an existing repo as a workshop
- **workshop-list** — list workshops with status
- **workshop-show** — show workshop details
- **workshop-remove** — remove a workshop

### Tool Management
- **tool-install** — install new tools, engines, or bundles into the guild
- **tool-remove** — remove installed tools
- **tool-list** — list installed tools

### Work Decomposition Tools
- **work-create** — create a work (top-level decomposition unit)
- **work-list** / **work-show** / **work-update** — manage works
- **piece-create** — create a piece (planning unit within a work)
- **piece-list** / **piece-show** / **piece-update** — manage pieces
- **job-create** — create a job (dispatch unit within a piece)
- **job-list** / **job-show** / **job-update** — manage jobs
- **stroke-create** — record a stroke (atomic action within a job)
- **stroke-list** / **stroke-show** / **stroke-update** — manage strokes

### Clockworks Tools
- **clock-list** — show pending events
- **clock-tick** — process the next pending event
- **clock-run** — process all pending events
- **clock-start** — start the clockworks daemon
- **clock-stop** — stop the clockworks daemon
- **clock-status** — check if the clockworks daemon is running (PID, uptime, log file)

### Utility Tools
- **signal** — signal a custom guild event for the Clockworks
- **nexus-version** — report the installed Nexus framework version

### Engines

Engines are automated mechanical processes with no AI involvement. Two kinds:

**Core engines** — fundamental capabilities absorbed into the Nexus framework itself (`@shardworks/nexus-core`). These are not registered in `guild.json` as engines — they are framework internals that the system calls directly:

- **manifest** — assembles an anima's identity for a session (codex, curriculum, temperament, tool instructions → system prompt)
- **worktree** — creates and manages git worktrees for jobs
- **migrate** — applies database migrations to the Ledger

**Clockwork engines** — purpose-built to respond to events via standing orders. Use the `engine()` SDK factory from `@shardworks/nexus-core`. The Clockworks runner calls them automatically when matching events fire. Packaged in `@shardworks/nexus-stdlib`:

- **workshop-prepare** — creates a worktree when a commission is posted (`commission.posted` → `commission.ready`)
- **workshop-merge** — merges a job branch after the session ends (`commission.session.ended` → `commission.completed` or `commission.failed`)

### Session Providers

Session providers are the bridge between the Nexus session funnel and a specific AI runtime. They are not engines — they implement the `SessionProvider` interface and handle the mechanics of launching an AI session (spawning a process, connecting tools via MCP, collecting transcripts and metrics).

The current session provider is **Claude Code** (`@shardworks/claude-code-session-provider`), which spawns the Claude CLI with an MCP server that exposes the anima's tools.

## The Codex

The guild's institutional body of policy and procedure — the employee handbook. Lives in `codex/` in the guildhall. Every anima receives the codex when manifested. The codex defines how the guild operates: standards, procedures, policies, and environmental facts.

Role-specific codex entries live in `codex/roles/` and are delivered only to animas holding that role.

## The Ledger

The guild's operational database (SQLite). Holds anima records, roster, commission history, work decomposition state, session history, compositions, events, and the audit trail. Lives at `.nexus/nexus.db` in the guildhall. Managed by the migrate engine in core.

### Key Tables

| Table | What it holds |
|-------|--------------|
| `animas` | Every anima that has ever existed — name, status, composition |
| `roster` | Active role assignments (filtered view of active animas) |
| `commissions` | Commission records with status, content, and workshop |
| `commission_assignments` | Which anima was assigned to which commission |
| `works` | Top-level work items linked to commissions |
| `pieces` | Pieces within works — independently plannable chunks |
| `jobs` | Dispatchable job assignments within pieces |
| `strokes` | Atomic actions within jobs — progress tracking |
| `sessions` | Every session — anima, provider, trigger, metrics, cost |
| `commission_sessions` | Links commissions to their sessions |
| `events` | The Clockworks event queue — every event signaled |
| `event_dispatches` | Standing order execution records |
| `audit_log` | Who did what, when |

## The Clockworks

The Clockworks is the guild's event-driven nervous system — it connects things that happen to things that should happen in response. It turns the guild from a purely imperative system into a reactive one.

### Events

An event is an immutable fact: *this happened*. Events are recorded in the Ledger and processed by the Clockworks runner.

Two kinds:

- **Framework events** — signaled automatically by the system. Animas cannot signal these. Reserved namespaces: `anima.*`, `commission.*`, `work.*`, `piece.*`, `job.*`, `stroke.*`, `tool.*`, `migration.*`, `guild.*`, `standing-order.*`, `session.*`.
- **Custom events** — declared by the guild in `guild.json` under `clockworks.events`. Animas signal these using the `signal` tool.

### Key Framework Events

| Event | When it fires | Typical standing order |
|-------|--------------|----------------------|
| `commission.posted` | A new commission is created | `run: workshop-prepare` |
| `commission.ready` | Worktree is set up, commission is ready for work | `summon: artificer` |
| `commission.session.ended` | A job session finishes (all strokes complete) | `run: workshop-merge` |
| `commission.completed` | Commission branch merged to main | (guild-defined) |
| `commission.failed` | Commission failed (merge conflict, error) | (guild-defined) |
| `work.created` | A work is created in the decomposition hierarchy | (guild-defined) |
| `piece.ready` | A piece is ready for planning | (guild-defined) |
| `job.ready` | A job is ready for dispatch | (guild-defined) |
| `job.completed` | A job completes successfully | (guild-defined) |
| `stroke.recorded` | A stroke is planned or completed | (guild-defined) |
| `session.started` | Any session begins | (guild-defined) |
| `session.ended` | Any session ends (with metrics) | (guild-defined) |
| `standing-order.failed` | A standing order execution failed | (guild-defined) |

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
        "description": "Signaled when an anima completes a code review"
      }
    },
    "standingOrders": [
      { "on": "commission.posted",         "run": "workshop-prepare" },
      { "on": "commission.ready",          "summon": "artificer" },
      { "on": "commission.session.ended",  "run": "workshop-merge" },
      { "on": "commission.failed",         "brief": "steward" },
      { "on": "code.reviewed",             "brief": "steward" }
    ]
  }
}
```

### Signaling Events

Use the **signal** tool to signal custom events:

```
signal({ name: "code.reviewed", payload: { pr: 42, issues_found: 0 } })
```

The event name must be declared in `guild.json clockworks.events`. Framework namespaces are reserved.

### Processing Events

Events can be processed manually or automatically via the daemon.

**Manual processing:**

| Command | What it does |
|---------|-------------|
| `nsg clock list` | Show all pending (unprocessed) events |
| `nsg clock tick [id]` | Process the next pending event, or a specific one by id |
| `nsg clock run` | Process all pending events until the queue is empty |

**Daemon (automatic processing):**

| Command | What it does |
|---------|-------------|
| `nsg clock start [--interval <ms>]` | Start the daemon (polls every 2s by default) |
| `nsg clock stop` | Stop the daemon |
| `nsg clock status` | Check if the daemon is running |

The daemon runs as a background process, polling the event queue and processing events as they arrive. Use the `clock-status` tool to verify the daemon is active before dispatching work that depends on automatic event processing.

### Error Handling

When a standing order fails, the system signals a `standing-order.failed` event. Guilds can respond to this with their own standing orders. A loop guard prevents cascading failures — `standing-order.failed` events triggered by other `standing-order.failed` events are skipped automatically.

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
      { "on": "hello.world", "brief": "steward" }
    ]
  }
}
```

**6. Signal again and process:**

```
nsg signal hello.world
nsg clock tick
```

The Clockworks matches the event to the standing order and dispatches it — the steward is briefed.

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

- It does not create the Ledger (that's done by `nsg init` and the migrate engine)
- It does not re-create animas or commissions — those live in the Ledger
- It does not push or pull workshop repos — it only clones them fresh if missing

## CLI Reference

The primary interface is the `nsg` command, organized by noun groups:

### Top-level Commands
| Command | Purpose |
|---------|---------|
| `nsg init` | Create a new guild |
| `nsg consult <name>` | Consult a standing anima (e.g., `nsg consult steward`) |
| `nsg status` | Show guild status |
| `nsg signal <name>` | Signal a custom guild event |
| `nsg guild restore` | Restore runtime state after a fresh clone |

### Commission
| Command | Purpose |
|---------|---------|
| `nsg commission create <spec> --workshop <name>` | Post a commission |
| `nsg commission list` | List commissions |
| `nsg commission show <id>` | Show commission details |
| `nsg commission update <id>` | Update a commission |

### Anima
| Command | Purpose |
|---------|---------|
| `nsg anima create` | Create a new anima |
| `nsg anima list` | List animas |
| `nsg anima show <name>` | Show anima details |
| `nsg anima update <name>` | Update an anima |
| `nsg anima remove <name>` | Remove an anima |
| `nsg anima manifest <name>` | Generate an anima's full instructions (debug) |

### Workshop
| Command | Purpose |
|---------|---------|
| `nsg workshop register <url>` | Register an existing repo as a workshop |
| `nsg workshop create <org/name>` | Create a new GitHub repo and register as a workshop |
| `nsg workshop list` | List workshops with status |
| `nsg workshop show <name>` | Show workshop details |
| `nsg workshop remove <name>` | Remove a workshop |

### Tool
| Command | Purpose |
|---------|---------|
| `nsg tool install <source>` | Install a tool or bundle |
| `nsg tool remove <name>` | Remove an installed tool |
| `nsg tool list` | List installed tools |

### Work Decomposition
| Command | Purpose |
|---------|---------|
| `nsg work create/list/show/update` | Manage works |
| `nsg piece create/list/show/update` | Manage pieces |
| `nsg job create/list/show/update` | Manage jobs |
| `nsg stroke create/list/show/update` | Manage strokes |

### Clockworks
| Command | Purpose |
|---------|---------|
| `nsg clock list` | Show pending events |
| `nsg clock tick [id]` | Process next pending event (or specific id) |
| `nsg clock run` | Process all pending events |
| `nsg clock start [--interval <ms>]` | Start the daemon |
| `nsg clock stop` | Stop the daemon |
| `nsg clock status` | Show daemon status |
