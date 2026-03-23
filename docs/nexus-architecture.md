# Guild System Architecture

The guild system is a framework for running an autonomous AI workforce. **Nexus** is the name of both the framework and the CLI that manages it. This document describes the system itself — the structures, concepts, and machinery that any guild requires. Decisions specific to a particular guild (organizational structure, workshop choices, migration plans) belong in that guild's own documentation.

## Overview

The guild is an autonomous workforce. The patron gives it work; it delivers results. Five pillars define the system:

### 1. The Commission Pipeline

The guild receives work as commissions and routes them through a structured lifecycle of phases — planning, building, reviewing, integrating, and whatever else the work demands. Each phase is handled by a named anima in a defined role, working in an isolated environment. The pipeline is not a fixed sequence; it's a framework for composing phases as the guild's sophistication grows. Today it's simple. Tomorrow it decomposes large commissions, runs parallel workstreams, and has dedicated reviewers and integrators. The infrastructure supports both.

### 2. The Stores

The guild equips its members with **implements** — versioned CLI tools that follow a consistent pattern: a single-file JS bundle, a provenance manifest, and an instruction document. Implements live in the guildhall's stores alongside **engines** — mechanical processes that handle the guild's automated operations (summoning agents, setting up worktrees, running migrations). The stores are the guild's toolkit and its operational backbone.

### 3. The Instruction Composer

When an anima is summoned to work, the guild assembles a complete instruction set from multiple sources: the codex (institutional policy), the anima's curriculum (skills and training), its temperament (personality and disposition), and the instruction documents for every implement available to the anima's role. This composed identity is delivered as a system prompt; the commission context arrives as the task prompt. The anima arrives fully formed — knowing who it is, how the guild operates, what tools it has, and what it's been asked to build.

### 4. The Register

The guild does not run anonymous agents. Every anima is a named entity with a tracked composition, a persistent history, and an accountable record. The register and roster — held in the Ledger — know who exists, what they're made of, what role they fill, and what they've done. Identity is what makes the guild a learning organization rather than a stateless script.

### 5. The Pulse *(not yet built)*

The four pillars above make the guild capable. This one makes it alive. Daemons, scheduled jobs, watchers, and other long-running engines that give the guild its own heartbeat — initiating work without waiting for the patron to push. The pulse is what turns the guild from a tool the patron operates into a system that operates itself. Design deferred — the guild earns autonomy by proving the first four pillars work.

---

## Nexus — The Framework

Nexus is the runtime that makes the guild system operational. It provides the base implements and engines needed for the five pillars to function, manages the Ledger schema, and offers a CLI for guild lifecycle management.

### What Nexus provides

**Base engines:**
- `summon` — bring animas to life (resolve composition, compose instructions, select model, launch session)
- `worktree-setup` — prepare isolated work environments for commissions
- `ledger-migrate` — manage Ledger schema

**Base implements:**
- `dispatch` — post commissions targeting a workshop, trigger the summon engine
- `publish` — move artifacts from workshops into the guildhall
- `promote` *(v2)* — change artifact status tiers
- `instantiate` — create animas from curriculum + temperament

**Ledger schema** — the base database migrations that define the Ledger's structure.

### The Nexus CLI

| Command | What it does |
|---------|-------------|
| `nexus init` | Create a new guild — guildhall repo, directory structure, `guild.json`, Ledger, base tools installed |
| `nexus install <version>` | Install or upgrade the framework to a specific version. Replaces base tools, runs new migrations. |
| `nexus repair` | Reinstall the current framework version. Restores base tools without touching guild content. |
| `nexus status` | Show framework version, check for issues |

The framework version is tracked in `guild.json`.

### Separation of framework and guild

Base tools provided by Nexus and tools authored by the guild live in separate locations within the guildhall:

```
guildhall/
  nexus/                    ← framework-managed, Nexus CLI owns this
    implements/
      dispatch/v1/
      publish/v1/
      instantiate/v1/
    engines/
      summon/v1/
      worktree-setup/v1/
      ledger-migrate/v1/
    migrations/
      001-initial-schema.sql
      002-add-curricula.sql
  stores/                   ← guild-managed, leadership owns this
    implements/
    engines/
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
  "engines": {
    "summon":           { "source": "nexus",  "version": "v1" },
    "worktree-setup":   { "source": "nexus",  "version": "v1" },
    "my-custom-engine": { "source": "stores", "version": "v1" }
  },
  "curricula": { ... },
  "temperaments": { ... }
}
```

The summon engine resolves tool paths based on `source` — `nexus` means look in `nexus/`, `stores` means look in `stores/`. Animas don't know or care where their tools came from.

### What this protects against

- **Bad guild publish** — a custom implement breaks things. `nexus repair` restores base tools. Guild content untouched.
- **Corrupted guildhall** — someone mangles framework files. `nexus repair` restores the framework layer. Guild content (codex, training, custom stores) is the guild's problem, but the machinery works.
- **Framework upgrade** — `nexus install 2.4` brings new base tools and migrations. Guild tools untouched. Rollback with `nexus install 2.3`.

---

## Topology

Everything lives under a single parent directory (`NEXUS_HOME`). The guildhall and all workshops are bare git clones, siblings under `NEXUS_HOME`. All active work happens in worktrees spun off the bare clones. A standing `guildhall/main` worktree is always present — the stable reference point for codex, training content, and stores.

One env var (`NEXUS_HOME`) is all the system needs to locate everything. Workshops are registered in `guild.json` and cloned into `NEXUS_HOME` when they are added. The Ledger sits at the `NEXUS_HOME` level, sibling to all repos.

Sessions run in **bare mode** (no CLAUDE.md). Animas do not receive instructions from the workshop repository itself — all instruction content is composed by the summon engine and delivered directly. If a workshop needs to communicate conventions to animas, those conventions belong in the codex or as implement instructions, not in repo-level config files. The cwd is always a worktree directory; path references within composed instructions are resolved by the summon engine.

### Directory Structure

```
NEXUS_HOME/
  guildhall/              ← bare clone
  workshop-a/             ← bare clone
  workshop-b/             ← bare clone
  nexus.db                ← Ledger
  worktrees/
    guildhall/
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
- **Active engines** — which engines are available, at what version, and their source.
- **Curricula** — which curricula are available and default per role.
- **Temperaments** — which temperaments are available and default.

`guild.json` is the source of truth for "what's installed and what version is active." The filesystem holds the actual artifacts; `guild.json` is the index.

---

## Data Storage

### Flat Files in the guildhall

Authored artifacts, git-managed, meaningful as text:

- **Guild configuration** — `guild.json`
- **Codex, all-members** — `codex/all.md`
- **Codex, per-role** — `codex/roles/artificer.md` etc
- **Curricula** — `training/curricula/thomson/v1.md` etc — each version a separate immutable file, never edited after creation
- **Temperaments** — `training/temperaments/stoic/v1.md` etc — same immutable-versioned-file pattern as curricula
- **Guild implements** — `stores/implements/foo/v1/foo.js` plus companion `manifest.json` and `instructions.md` — immutable per version, single-file JS bundles committed to git
- **Guild engines** — `stores/engines/` — same bundle pattern as implements
- **Framework implements and engines** — `nexus/implements/` and `nexus/engines/` — same bundle pattern, managed by Nexus CLI
- **Framework migrations** — `nexus/migrations/*.sql` — managed by Nexus CLI

### Ledger (SQLite at `NEXUS_HOME`)

Operational state — queryable, relational, runtime data:

- **Anima registry** — name, status, state history, timestamps
- **Anima composition** — references to curriculum (name + version), temperament (name + version); full content snapshots at instantiation, immutable after creation. *(v2 adds oaths.)*
- **Roster state** — role assignments, standing vs commissioned status
- **Commission metadata** — content, timestamps, assigned animas, status, state transitions
- **Anima self-recorded memory and notes** — written via implement, not direct Ledger access
- **Edict history** *(v2)* — active edicts and lifecycle
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
| **Curriculum** | Training content — skills, approach to work, craft knowledge. "What you know and how you work." | Flat file in the guildhall (`training/curricula/`), referenced by name + version in Ledger |
| **Temperament** | Personality, disposition, communication style. "Who you are." | Flat file in the guildhall (`training/temperaments/`), referenced by name + version in Ledger |
| **Oaths** *(v2)* | Identity-level binding commitments. "What you will always/never do." | Stored in Ledger, per-anima |

### Assembly

At instantiation, the Ledger records which curriculum (name + version) and temperament (name + version) were assigned. *(v2 adds oaths as a third composition component.)* The **summon engine** composes these components — along with guild-level content from the codex and available implement instructions — into the full instruction set delivered to the AI model.

The composition template is part of the summon engine and versioned with it. When the template changes, a new framework version is published.

```
template(
  codex       = codex/all.md + codex/roles/<role>.md,
  curriculum  = training/curricula/<name>/<version>.md,
  temperament = training/temperaments/<name>/<version>.md,
  oaths       = [from Ledger],              ← v2
  edicts      = [active edicts from Ledger], ← v2
  implements  = [instructions.md for each implement available to this role],
  commission  = [spec + sage advice + clarification thread, if commissioned]
)
→ composed instructions delivered to model
```

No per-anima markdown files on the filesystem. The anima's identity is the *combination* of its components, not a bespoke document.

---

## Commissions and Workshops

All commission infrastructure lives in the guildhall — the pipeline, the engines, the dispatch logic. When leadership posts a commission, they specify a **target workshop**: the repo where the anima will do the work. The anima is summoned into a worktree of that target workshop, but the commission lifecycle (posting, tracking, status transitions) is managed centrally through the guildhall's implements and engines.

Some workshops produce works for the patron (applications, services, tools). Others produce artifacts that get published back to the guildhall — new implements, engines, curricula, or temperaments. The guild system doesn't distinguish between these; the publication step is a separate, deliberate act by leadership after the commission completes.

### Publication

When a commission produces artifacts destined for the guildhall (new implements, curricula, etc.), the `publish` implement handles the boundary crossing:

1. Takes a completed artifact from a workshop
2. Copies files to the correct guildhall location (`stores/implements/foo/v2/`, `training/curricula/thomson/v2.md`, etc.)
3. Updates `guild.json` with the new version entry
4. Commits to the guildhall

*(v2 adds status tiers — experimental, active, retired — and a `promote` implement for managing artifact lifecycle. See `nexus-architecture-v2.md`.)*

---

## The Instruction Environment

When an anima is summoned, its instructions are composed by the summon engine from its components and guild context, then delivered to the model.

### Delivery

- **System prompt**: Anima-specific instructions — codex, curriculum, temperament, implement instructions. Everything that defines *who this anima is and how they operate*. Frozen at summon time. *(v2 adds oaths and edicts.)*
- **Initial prompt**: Commission context — the spec, sage advice, clarification thread, task-specific instructions. Everything about *what to do right now*.

### What reaches an anima

```
SYSTEM PROMPT (identity + environment):
┌─────────────────────────────────────┐
│  1. The Codex                       │  codex/all.md — guild-wide policy
│     (always present, from the guildhall)       │  codex/roles/<role>.md — role-specific
├─────────────────────────────────────┤
│  2. Curriculum                      │  Training content — skills,
│     (from composition)              │  craft knowledge, approach to work
├─────────────────────────────────────┤
│  3. Temperament                     │  Personality, disposition,
│     (from composition)              │  communication style
├─────────────────────────────────────┤
│  4. Oaths (v2)                      │  Personal binding commitments
│     (from composition)              │
├─────────────────────────────────────┤
│  5. Active edicts (v2)              │  Current directives from leadership
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

Instructions are composed at summon time and frozen for the duration of the session. The guildhall may change during a commission; the anima does not see those changes.

Sessions run in bare mode (no CLAUDE.md), with session persistence disabled, and with appropriate permissions flags.

---

## The Ledger

The Ledger is the guild's operational database. It holds runtime state — who exists, what they've done, what they were told. It does not track what's installed (that's `guild.json`) or what artifacts exist (that's the filesystem).

**Schema** is owned by the Nexus framework and lives in `nexus/migrations/`. The `ledger-migrate` engine (also framework-provided) applies pending migrations. It runs at guild bootstrap, before dispatch, and on demand after framework upgrades.

**Access** is always mediated through implements. Animas never touch the Ledger directly — they use implements that provide a clean interface. This means:

- The Ledger's schema can change without changing anima behavior (implement absorbs the change)
- Animas can't accidentally corrupt operational data
- All writes are auditable through the implement layer

The Ledger is guild infrastructure — owned by the institution, maintained by framework engines, accessed through implements.

---

## Vocabulary

This document uses the guild vocabulary defined in [`docs/guild-metaphor.md`](guild-metaphor.md) and the project philosophy in [`docs/philosophy.md`](philosophy.md). Key metaphor concepts used throughout: guild, patron, anima, commission, works, workshop, threshold, codex, curriculum, temperament, engine, implement, summon, relic.

Terms specific to this architecture (not defined in the metaphor):

**Nexus** — the framework that makes guilds operational. Provides the base implements, engines, and Ledger schema. Managed via the Nexus CLI.

**Guildhall** — the guild's home repository. Contains the codex, training content, stores, framework tools (`nexus/`), and guild configuration. Always present as a standing worktree. The institutional center — not a workshop where work happens, but the building where the guild's knowledge, tools, and records live.

**Ledger** — the guild's operational database. SQLite, lives at `NEXUS_HOME` level. Holds runtime state: anima records, roster, commissions, audit log. Schema owned by the framework, access mediated through implements.

**Stores** — where the guild keeps its own implements and engines. Lives in the guildhall under `stores/`. Separate from `nexus/` (framework-provided tools).

**Edicts** *(v2)* — see `.scratch/nexus-architecture-v2.md`.

**Oaths** *(v2)* — see `.scratch/nexus-architecture-v2.md`.

---

## Open Questions

- **Dispatch/summon boundary detail** — The high-level split is defined (dispatch is an implement wielded by leadership, summon is an engine that launches the session). The exact handoff needs specification: what state does dispatch set up before summon takes over?

---

## Future Work (draft documents needed)

- **Performance assessment and improvement** — How the guild monitors outcome quality, identifies underperforming curricula or temperaments, and drives improvement.
