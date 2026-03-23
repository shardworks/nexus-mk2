# Guild System Architecture

The guild system is a framework for running an autonomous AI workforce. **Nexus** is the name of both the framework and the CLI that manages it. This document describes the system itself — the structures, concepts, and machinery that any guild requires. Decisions specific to a particular guild (organizational structure, workshop choices, migration plans) belong in that guild's own documentation.

## Overview

The guild is an autonomous workforce. The patron gives it work; it delivers results. Five pillars define the system:

### 1. The Commission Pipeline

The guild receives work as commissions and routes them through a structured lifecycle of phases — planning, building, reviewing, integrating, and whatever else the work demands. Each phase is handled by a named anima in a defined role, working in an isolated environment. The pipeline is not a fixed sequence; it's a framework for composing phases as the guild's sophistication grows. Today it's simple. Tomorrow it decomposes large commissions, runs parallel workstreams, and has dedicated reviewers and integrators. The infrastructure supports both.

### 2. The Stores

The guild equips its members with **implements** — versioned CLI tools that follow a consistent pattern: a single-file JS bundle, a provenance manifest, and an instruction document. Implements live in HQ's stores alongside **machines** — mechanical processes that handle the guild's automated operations (summoning agents, setting up worktrees, running migrations). The stores are the guild's toolkit and its operational backbone.

### 3. The Instruction Composer

When an anima is summoned to work, the guild assembles a complete instruction set from multiple sources: the codex (institutional policy), the anima's curriculum (skills and training), its temperament (personality and disposition), any personal oaths, active edicts from leadership, and the instruction documents for every implement available to the anima's role. This composed identity is delivered as a system prompt; the commission context arrives as the task prompt. The anima arrives fully formed — knowing who it is, how the guild operates, what tools it has, and what it's been asked to build.

### 4. The Register

The guild does not run anonymous agents. Every anima is a named entity with a tracked composition, a persistent history, and an accountable record. The register and roster — held in the Ledger — know who exists, what they're made of, what role they fill, and what they've done. Identity is what makes the guild a learning organization rather than a stateless script.

### 5. The Pulse *(not yet built)*

The four pillars above make the guild capable. This one makes it alive. Daemons, scheduled jobs, watchers, and other long-running machines that give the guild its own heartbeat — initiating work without waiting for the patron to push. The pulse is what turns the guild from a tool the patron operates into a system that operates itself. Design deferred — the guild earns autonomy by proving the first four pillars work.

---

## Nexus — The Framework

Nexus is the runtime that makes the guild system operational. It provides the base implements and machines needed for the five pillars to function, manages the Ledger schema, and offers a CLI for guild lifecycle management.

### What Nexus provides

**Base machines:**
- `summon` — bring animas to life (resolve composition, compose instructions, select model, launch session)
- `worktree-setup` — prepare isolated work environments for commissions
- `ledger-migrate` — manage Ledger schema

**Base implements:**
- `dispatch` — post commissions targeting a workshop, trigger the summon machine
- `publish` — move artifacts from workshops into HQ
- `promote` — change artifact status tiers
- `instantiate` — create animas from curriculum + temperament + oaths

**Ledger schema** — the base database migrations that define the Ledger's structure.

### The Nexus CLI

| Command | What it does |
|---------|-------------|
| `nexus init` | Create a new guild — HQ repo, directory structure, `guild.json`, Ledger, base tools installed |
| `nexus install <version>` | Install or upgrade the framework to a specific version. Replaces base tools, runs new migrations. |
| `nexus repair` | Reinstall the current framework version. Restores base tools without touching guild content. |
| `nexus status` | Show framework version, check for issues |

The framework version is tracked in `guild.json`.

### Separation of framework and guild

Base tools provided by Nexus and tools authored by the guild live in separate locations within HQ:

```
hq/
  nexus/                    ← framework-managed, Nexus CLI owns this
    implements/
      dispatch/v1/
      publish/v1/
      promote/v1/
      instantiate/v1/
    machines/
      summon/v1/
      worktree-setup/v1/
      ledger-migrate/v1/
    migrations/
      001-initial-schema.sql
      002-add-curricula.sql
  stores/                   ← guild-managed, leadership owns this
    implements/
    machines/
  codex/
  training/
  guild.json
```

**`nexus/`** is framework territory. The Nexus CLI writes it; the guild doesn't touch it. `nexus repair` wipes and restores this directory without affecting anything else.

**`stores/`** is guild territory. Leadership authors and publishes into it; the framework doesn't touch it.

Both locations follow the same artifact pattern (single JS bundle + manifest + instructions for implements). `guild.json` indexes tools from both locations, tracking their source:

```json
{
  "nexus": "2.3",
  "model": "claude-sonnet-4-20250514",
  "workshops": [ ... ],
  "implements": {
    "dispatch":       { "source": "nexus",  "version": "v1" },
    "publish":        { "source": "nexus",  "version": "v1" },
    "my-custom-tool": { "source": "stores", "version": "v1" }
  },
  "machines": {
    "summon":           { "source": "nexus",  "version": "v1" },
    "worktree-setup":   { "source": "nexus",  "version": "v1" },
    "my-custom-machine": { "source": "stores", "version": "v1" }
  },
  "curricula": { ... },
  "temperaments": { ... }
}
```

The summon machine resolves tool paths based on `source` — `nexus` means look in `nexus/`, `stores` means look in `stores/`. Animas don't know or care where their tools came from.

### What this protects against

- **Bad guild publish** — a custom implement breaks things. `nexus repair` restores base tools. Guild content untouched.
- **Corrupted HQ** — someone mangles framework files. `nexus repair` restores the framework layer. Guild content (codex, training, custom stores) is the guild's problem, but the machinery works.
- **Framework upgrade** — `nexus install 2.4` brings new base tools and migrations. Guild tools untouched. Rollback with `nexus install 2.3`.

---

## Topology

Everything lives under a single parent directory (`NEXUS_HOME`). HQ and all workshops are bare git clones, siblings under `NEXUS_HOME`. All active work happens in worktrees spun off the bare clones. A standing `hq/main` worktree is always present — the stable reference point for codex, training content, and stores.

One env var (`NEXUS_HOME`) is all the system needs to locate everything. Workshops are registered in `guild.json` and cloned into `NEXUS_HOME` when they are added. The Ledger sits at the `NEXUS_HOME` level, sibling to all repos.

Sessions run in **bare mode** (no CLAUDE.md). Animas do not receive instructions from the workshop repository itself — all instruction content is composed by the summon machine and delivered directly. If a workshop needs to communicate conventions to animas, those conventions belong in the codex or as implement instructions, not in repo-level config files. The cwd is always a worktree directory; path references within composed instructions are resolved by the summon machine.

### Directory Structure

```
NEXUS_HOME/
  hq/                     ← bare clone
  workshop-a/             ← bare clone
  workshop-b/             ← bare clone
  nexus.db                ← Ledger
  worktrees/
    hq/
      main/               ← standing worktree, always present
    workshop-a/
      commission-42/
    workshop-b/
      commission-17/
```

### guild.json

The guild's central configuration file. Contains:

- **Nexus version** — the installed framework version
- **Default model** — the model used for anima sessions unless overridden. Model resolution is designed to be flexible — future layers (per-role, per-curriculum, per-anima, per-commission) can be added as the system matures. For now, only the guild-wide default exists.
- **Workshop registry** — list of registered workshops with their repo URLs.
- **Active implements** — which implements are available, at what version, and their source (`nexus` or `stores`).
- **Active machines** — which machines are available, at what version, and their source.
- **Active curricula** — which curricula are available, their status, and default per role.
- **Active temperaments** — which temperaments are available, their status, and default.

`guild.json` is the source of truth for "what's installed and what version is active." The filesystem holds the actual artifacts; `guild.json` is the index.

---

## Data Storage

### Flat Files in HQ

Authored artifacts, git-managed, meaningful as text:

- **Guild configuration** — `guild.json`
- **Codex, all-members** — `codex/all.md`
- **Codex, per-role** — `codex/roles/artificer.md` etc
- **Curricula** — `training/curricula/thomson/v1.md` etc — each version a separate immutable file, never edited after creation
- **Temperaments** — `training/temperaments/stoic/v1.md` etc — same immutable-versioned-file pattern as curricula
- **Guild implements** — `stores/implements/foo/v1/foo.js` plus companion `manifest.json` and `instructions.md` — immutable per version, single-file JS bundles committed to git
- **Guild machines** — `stores/machines/` — same bundle pattern as implements
- **Framework implements and machines** — `nexus/implements/` and `nexus/machines/` — same bundle pattern, managed by Nexus CLI
- **Framework migrations** — `nexus/migrations/*.sql` — managed by Nexus CLI

### Ledger (SQLite at `NEXUS_HOME`)

Operational state — queryable, relational, runtime data:

- **Anima registry** — name, status, state history, timestamps
- **Anima composition** — references to curriculum (name + version), temperament (name + version), oaths; full content snapshots at instantiation, immutable after creation
- **Roster state** — role assignments, standing vs commissioned status
- **Commission metadata** — content, timestamps, assigned animas, status, state transitions
- **Anima self-recorded memory and notes** — written via implement, not direct Ledger access
- **Edict history** — active edicts and lifecycle
- **Audit log** — who did what, when

The Ledger holds operational state only. "What exists and what version is active" is answered by `guild.json` and the filesystem. The Ledger answers "who is doing what, what happened, and what were they told."

### Workshop Repositories

Work product lives where it was made — commission artifacts and outputs, referenced by commission record in Ledger.

---

## Anima Composition

An anima is not a monolithic instruction file. It is composed from discrete, reusable components, assembled at instantiation time:

### Components

| Component | What it provides | Source |
|-----------|-----------------|--------|
| **Curriculum** | Training content — skills, approach to work, craft knowledge. "What you know and how you work." | Flat file in HQ (`training/curricula/`), referenced by name + version in Ledger |
| **Temperament** | Personality, disposition, communication style. "Who you are." | Flat file in HQ (`training/temperaments/`), referenced by name + version in Ledger |
| **Oaths** | Identity-level binding commitments. "What you will always/never do." | Stored in Ledger, per-anima |

### Assembly

At instantiation, the Ledger records which curriculum (name + version), temperament (name + version), and oaths were assigned. The **summon machine** composes these components — along with guild-level content from the codex and available implement instructions — into the full instruction set delivered to the AI model.

The composition template is part of the summon machine and versioned with it. When the template changes, a new framework version is published.

```
template(
  codex       = codex/all.md + codex/roles/<role>.md,
  curriculum  = training/curricula/<school>/<version>.md,
  temperament = training/temperaments/<name>/<version>.md,
  oaths       = [from Ledger],
  edicts      = [active edicts from Ledger],
  implements  = [instructions.md for each implement available to this role],
  commission  = [spec + sage advice + clarification thread, if commissioned]
)
→ composed instructions delivered to model
```

No per-anima markdown files on the filesystem. The anima's identity is the *combination* of its components, not a bespoke document.

---

## Commissions and Workshops

All commission infrastructure lives in HQ — the pipeline, the machines, the dispatch logic. When leadership posts a commission, they specify a **target workshop**: the repo where the anima will do the work. The anima is summoned into a worktree of that target workshop, but the commission lifecycle (posting, tracking, status transitions) is managed centrally through HQ's implements and machines.

Some workshops produce works for the patron (applications, services, tools). Others produce artifacts that get published back to HQ — new implements, machines, curricula, or temperaments. The guild system doesn't distinguish between these; the publication step is a separate, deliberate act by leadership after the commission completes.

### Publication

When a commission produces artifacts destined for HQ (new implements, curricula, etc.), the `publish` implement handles the boundary crossing:

1. Takes a completed artifact from a workshop
2. Copies files to the correct HQ location (`stores/implements/foo/v2/`, `training/curricula/thomson/v2.md`, etc.)
3. Updates `guild.json` with the new version entry (status: experimental)
4. Commits to HQ

**Status tiers** (tracked in `guild.json`):

| Status | Meaning | Who can set it |
|--------|---------|---------------|
| **Experimental** | Published to HQ, available for explicit assignment but not the default. | Anyone with `publish` access |
| **Active** | Proven, available as a default option. | Guild leadership only (via `promote`) |
| **Retired** | No longer used for new work. | Guild leadership |

The `promote` implement handles status changes (experimental → active), updating `guild.json`. Promotion is a policy decision, not a file operation.

---

## The Instruction Environment

When an anima is summoned, its instructions are composed by the summon machine from its components and guild context, then delivered to the model.

### Delivery

- **System prompt**: Anima-specific instructions — codex, curriculum, temperament, oaths, edicts, implement instructions. Everything that defines *who this anima is and how they operate*. Frozen at summon time.
- **Initial prompt**: Commission context — the spec, sage advice, clarification thread, task-specific instructions. Everything about *what to do right now*.

### What reaches an anima

```
SYSTEM PROMPT (identity + environment):
┌─────────────────────────────────────┐
│  1. The Codex                       │  codex/all.md — guild-wide policy
│     (always present, from HQ)       │  codex/roles/<role>.md — role-specific
├─────────────────────────────────────┤
│  2. Curriculum                      │  Training content from the anima's
│     (from composition)              │  school — skills, craft approach
├─────────────────────────────────────┤
│  3. Temperament                     │  Personality, disposition,
│     (from composition)              │  communication style
├─────────────────────────────────────┤
│  4. Oaths                           │  Personal binding commitments
│     (from composition)              │
├─────────────────────────────────────┤
│  5. Active edicts                   │  Current directives from leadership
│     (from the Ledger)               │
├─────────────────────────────────────┤
│  6. Implement instructions          │  instructions.md for each implement
│     (from nexus/ and stores/,       │  the anima has access to
│      gated by role)                 │
└─────────────────────────────────────┘

INITIAL PROMPT (task):
┌─────────────────────────────────────┐
│  7. Commission context              │  Spec, sage advice, clarification
│     (when commissioned)             │  thread, task-specific instructions
└─────────────────────────────────────┘
```

Instructions are composed at summon time and frozen for the duration of the session. HQ may change during a commission; the anima does not see those changes.

Sessions run in bare mode (no CLAUDE.md), with session persistence disabled, and with appropriate permissions flags.

---

## The Ledger

The Ledger is the guild's operational database. It holds runtime state — who exists, what they've done, what they were told. It does not track what's installed (that's `guild.json`) or what artifacts exist (that's the filesystem).

**Schema** is owned by the Nexus framework and lives in `nexus/migrations/`. The `ledger-migrate` machine (also framework-provided) applies pending migrations. It runs at guild bootstrap, before dispatch, and on demand after framework upgrades.

**Access** is always mediated through implements. Animas never touch the Ledger directly — they use implements that provide a clean interface. This means:

- The Ledger's schema can change without changing anima behavior (implement absorbs the change)
- Animas can't accidentally corrupt operational data
- All writes are auditable through the implement layer

The Ledger is guild infrastructure — owned by the institution, maintained by framework machines, accessed through implements.

---

## Lexicon

### Core Concepts

**Nexus** — the framework that makes guilds operational. Provides the base implements, machines, and Ledger schema. Managed via the Nexus CLI (`nexus init`, `nexus install`, `nexus repair`).

**Guild** — the whole system. Top-level container for all agents, resources, and activity. A guild is an instance of the Nexus framework, configured and populated by its leadership.

**Patron** — the human. Commissions work, judges the guild by what it delivers.

**Anima** — the fundamental unit of identity. Composed from curriculum, temperament, and oaths. Every anima is named, tracked, and accountable. Animated by AI, capable of judgment. States: aspirant, active, retired. Standing animas persist across commissions; commissioned animas exist for the duration of a single commission.

**Register** — the authoritative record of every anima that has ever existed, held in the Ledger.

**Roster** — the active subset of the register. All animas currently in active state.

**Roles** — Artificer, Sage, Master Sage, and others. Functions filled by animas.

**Commission** — a unit of work posted by the patron, undertaken by the guild.

**Works** — what the guild delivers to the patron. Judged by use.

**Workshop** — a repository where the guild does its work. Guild space, not patron space.

**Threshold** — the boundary between patron and guild. Works cross outward; commissions cross inward.

### Infrastructure

**HQ** — the guild's home repository. Contains the codex, training content, stores, framework tools (`nexus/`), and guild configuration. Always present as a standing worktree at `hq/main`.

**Ledger** — the guild's operational database. SQLite, lives at `NEXUS_HOME` level. Holds runtime state: anima records, roster, commissions, edicts, audit log. Schema owned by the framework, access mediated through implements.

**Stores** — where the guild keeps its own implements and machines. Lives in HQ under `stores/`. Separate from `nexus/` (framework-provided tools).

**Implement** — a CLI tool an anima actively wields during work. Versioned, immutable per version. Each version includes:
- The bundle (`foo.js`) — the executable artifact
- A manifest (`manifest.json`) — provenance: source repo, commit hash, build metadata
- Instructions (`instructions.md`) — injected into the anima's instruction environment at dispatch, gated by role

Implements live in either `nexus/implements/` (framework-provided) or `stores/implements/` (guild-authored). All anima access to the Ledger is mediated through implements.

**Machine** — automated mechanical process with no AI. Versioned and immutable per version. Same bundle pattern (single JS file + manifest). Distinct from implements: machines run automatically, implements are wielded by animas. Machines live in either `nexus/machines/` or `stores/machines/`.

**Summon** — the framework machine that brings an anima to life for a specific task. Resolves composition, composes instructions, selects workshop and model, launches the Claude session. The composition template is part of the summon machine and versioned with the framework.

### Knowledge and Training

**Codex** — the guild's institutional body of policy, procedure, and operational standards. The employee handbook. Maintained by leadership, followed by all. Lives in HQ as flat files. Covers procedures, standards, policies, and environmental facts.

**Edicts** — individual directives from leadership that may amend the codex or stand alone. Edict history tracked in the Ledger.

**Curriculum** — a named, versioned, immutable body of training content that defines a school. Lives in HQ under `training/curricula/`. Never edited after creation — new thinking produces a new version.

**School** — the identity and disposition produced by a curriculum. What animas come from, what outcomes accumulate against.

**Temperament** — a named, versioned, immutable personality template. Governs disposition, communication style, and character. Same structure and lifecycle as curricula. Lives in HQ under `training/temperaments/`.

**Oaths** — identity-level binding commitments stored in the Ledger per-anima. The codex is institutional; oaths are personal.

**Teachings** — craft wisdom, experiential, master-to-apprentice. Inform the codex but are more experiential and less procedural.

### Lifecycle

**Relic** — an artifact the guild depends on but does not maintain or fully understand. Load-bearing and sacred, not deprecated. A natural lifecycle stage for tools built fast during bootstrap.

---

## Open Questions

- **Dispatch/summon boundary detail** — The high-level split is defined (dispatch is an implement wielded by leadership, summon is a machine that launches the session). The exact handoff needs specification: what state does dispatch set up before summon takes over?

---

## Future Work (draft documents needed)

- **Performance assessment and improvement** — How the guild monitors outcome quality, identifies underperforming curricula or temperaments, and drives improvement.
