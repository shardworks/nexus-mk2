# The Guild Metaphor

The guild metaphor is the organizing model for Nexus Mk 2.1. It maps the structure and operations of a craftsman's guild onto a multi-agent AI system — not as decoration, but as a conceptual framework that makes the system's architecture legible to both humans and agents.

## Core Entities

### Guild

The whole system. The guild is the top-level container for all agents, resources, and activity. There is one guild.

### Patron

The human. The patron commissions work and judges the guild by what it delivers — not by inspecting how the work was done. The patron does not enter the guild's workshops; they interact through the guild's interfaces (CLI, status reports, delivered works). What crosses the threshold outward is the guild's *works* — running software, usable tools, solved problems. The patron judges works by using them, not by inspecting the workshop.

The patron knows the workshops exist and may assign them ("build the next thing in this repository"), but does not go inside during normal operation. The boundary is maintained by discipline, not access control.

### Anima

The fundamental unit of identity in the system. An anima is an ephemeral presence (akin to a spirit) animated by an AI agent. They have a persistent identity that is manifested when called upon, composed from the anima's own nature (training, temperament, etc.) and the guild's institutional records each time they are needed. The word comes from Latin, meaning "animating principle" — the thing that makes something alive rather than mechanical. Between manifestations, an anima exists in the register as identity and history; the guild maintains their continuity, not the individual.

This is the core distinction in the system: **animas are animated** (backed by AI, capable of judgment, spirited), **engines are inanimate** (no AI, purely mechanical). *(We pluralize as "animas" rather than the Latin "animae" — we know, we know.)*

#### States

Every anima exists in one of three states:

| State | Meaning |
|-------|---------|
| **Aspirant** | Being trained, not yet dispatchable. The anima exists in the register but cannot be assigned work. |
| **Active** | On the roster, available for dispatch or currently working. This is a working anima. |
| **Retired** | No longer active. The anima's record persists in the register forever, but they are no longer dispatchable. |

#### Standing vs. Commissioned

The meaningful distinction among active animas is not named vs. unnamed (all animas are named) but **standing** vs. **commissioned**:

- **Standing** — available indefinitely, called on by name. A standing anima persists on the roster across commissions. They are always there, always available.
- **Commissioned** — instantiated for a specific commission. A commissioned anima's roster membership lasts only as long as the commission it was created for. A fresh anima is created (or an existing one is commissioned) for each commission, and their tenure ends when the commission completes.

Concretely, standing and commissioned animas are the same thing: entries in the register with names, instructions, and history. The difference is tenure, not nature.

### Register

The authoritative record of every anima that has ever existed — one of the guild's core record Books. The register is the guild's institutional memory — it contains aspirants in training, active members, and retired animas. Each register entry records the anima's name, composition, and full state history. See [The Books](#the-books) for how the Register relates to the Ledger and Daybook.

### Roster

The active subset of the register. The roster is a filtered view, not a separate store — it shows all animas currently in `active` state. The roster is the system's source of truth for "who can do what right now," including each anima's role and standing/commissioned status.

## Roles

A function in the guild, filled by zero or more members. Roles define *what kind of work* a member performs and *when they are invoked*. Roles are not a fixed set — a guild defines its own roles to match how it organizes its work. New roles can emerge as the guild evolves; old ones can be retired.

A guild might have planners and builders, or architects and developers, or a single generalist role that does everything. The organizational structure is the guild's choice. The guild-starter-kit ships with a set of roles as a starting point:

| Role | Function |
|------|----------|
| **Artificer** | Executes jobs. Receives planned work and builds the thing. |
| **Sage** | Plans work. Decomposes commissions, refines vague instructions into concrete jobs with acceptance criteria. |
| **Master Sage** | Senior sage. Reviews incoming commissions, determines scope, and may convene a Council of Sages for complex cases. |

These are one guild's organizational model — not requirements. Other roles (Guildmaster, Coinmaster, Oracle, Instructor, and others) are anticipated but not yet defined.

## Work

### Commission

The patron's act of requesting work. The patron commissions work; the guild determines how to fulfill it. A commission might call for something large — "build me a notification system" — or something small — "fix this bug." The guild receives the commission and decides how the labor should be organized.

A commission describes **origin** — it is the patron's request, the thing that crosses the threshold inward. It does not imply a particular size or shape of labor. That's for the guild to determine.

### The Shape of Labor

The guild organizes labor into four levels, each with a distinct character:

**Work** — A large undertaking that must be broken into pieces before the guild can plan it. When a commission arrives and the scope is too broad for anyone to plan directly, the guild recognizes it as a work and looks for the natural seams — the independently-plannable chunks. Not every commission becomes a work; many are small enough to plan or execute directly.

**Piece** — A plannable portion of a work. A piece is coherent enough that someone can sit down and figure out exactly what jobs need doing. Multiple pieces of the same work can be planned and worked in parallel — the event pipeline and the delivery service don't need to wait for each other.

**Job** — An assignment for one anima. The thing that gets handed off: here's what needs building, go build it. One anima owns a job from start to finish — they may take breaks (sessions end, new ones begin), but the job is theirs until it's done or they signal for help.

**Stroke** — A single deliberate action within a job. One cut of the chisel, one brush mark, one test written. The smallest unit the guild tracks — where progress becomes visible, where continuity is maintained between sessions, and where the record shows exactly how far along a job has come. An anima plans their strokes, records them as they go, and marks them complete. The stroke record is the job's living checklist.

An additional aspirational level, the **opus**, sits above and outside the operational hierarchy. The opus is the patron's long-term vision — the full body of work across months or years. It exists as a north star for decision-making but is not tracked as an operational entity. Think of it as the guild's understanding of what the patron is ultimately building.

See [Work Decomposition](work-decomposition.md) for the design rationale behind these levels — why a named hierarchy over a generic tree, how the levels interact with staged sessions and capability tiering, and how the framework-vs-guild-policy boundary works.

### Works

The guild's output — what crosses the threshold to the patron. Works are intentionally vague: running software, usable tools, deployed services, solved problems. The patron judges works by using them. What counts as a work is defined by what the patron can touch, run, or interact with.

"Works" (the guild's delivered output) and "work" (a level in the labor hierarchy) are related but distinct. A bug fix is part of the guild's works — it crosses the threshold — but in the hierarchy it's probably just a job, not a work. See [Work Decomposition](work-decomposition.md) for this distinction.

## Workshops

A repository where the guild does its work. Workshops are guild space — the patron assigns them but does not enter them during normal operation. An anima working a job does their craft inside a workshop; the patron judges the result by the works it produces, not by reading the code on the workbench.

Some workshops produce works for the patron (applications, services, tools). Others are purely guild infrastructure — tools, training materials, databases. These aren't built for the patron; they are how the guild operates. Both kinds are guild space.

## Knowledge & Training

### Codex

The guild's institutional body of policy, procedure, and operational standards — the employee handbook. Maintained by leadership, followed by all members. The codex defines how the guild operates: procedures, standards, policies, and environmental facts. Every anima receives the codex when manifested for a session.

### Curriculum

A named, versioned, immutable body of training content. A curriculum defines what an anima knows and how it approaches work — skills, craft knowledge, methodology. Curricula are never edited after creation; new thinking produces a new version. The Thomson curriculum v2 is a distinct artifact from v1.

### Temperament

A named, versioned, immutable personality template. A temperament governs an anima's disposition, communication style, and character — who they are, as distinct from what they know (curriculum) or what they must do (codex). Same lifecycle as curricula: immutable per version, new thinking produces a new version.

### Oath *(v2)*

A binding commitment made by a specific anima — identity-level, not institutional. "I will never modify files outside my commission scope." "I will always run tests before sealing my work." The codex is the guild's policy; an oath is personal. Oaths are part of an anima's composition alongside curriculum and temperament — they are what make two animas from the same curriculum distinct. Assigned at instantiation, immutable after creation.

## Governance *(v2)*

### Edict

A directive from leadership that applies across the guild. An edict doesn't produce deliverables — it changes *how the guild operates*. "All animas must write tests." "No commission may exceed 500k tokens." Edicts are tracked with full lifecycle (issued, active, superseded, revoked) and injected into anima instructions at manifest time alongside the codex. The distinction: the codex is standing policy; an edict is a temporal directive with a lifecycle.

## Infrastructure

### Guildhall

The guild's institutional center — a repository, not a workshop. The guildhall is where the codex hangs on the wall, where the tools are stored, where the register is kept, where training content lives. Work doesn't happen here; this is where the guild's knowledge, configuration, and equipment are maintained. Always present, always accessible.

Distinct from workshops: workshops are where animas do their craft. The guildhall is the building they come from — the place that tells them who they are and equips them for the job.

### Engine

An automated mechanical process with no AI, purpose-built to respond to Clockworks events. Engines export a standard handler contract and are named in standing orders — they are the guild's automated reactions to things that happen. Where animas are spirits, engines are clockwork — the pulleys, the waterworks, the mechanisms built into the walls. They are not presences; they are the building working.

The distinction is essential: **animas are animated** (backed by AI, capable of judgment and creativity, expensive), **engines are inanimate** (no AI, purely mechanical, perfectly repeatable, cheap). Engines are the infrastructure that lets animas focus on the work that requires intelligence.

Not everything mechanical is an engine. Libraries, session providers, migration runners, and other framework plumbing are just dependencies — they don't respond to events and don't need guild registration. The engine concept is reserved for things that participate in the Clockworks event loop.

### Clockworks

The guild's nervous system — an event-driven layer that connects things that happen to things that should respond. The Clockworks keeps its own records of what it has seen and how it responded — these are the mechanism's working memory, not part of the guild's Books. The Clockworks processes events according to the guild's standing orders, turning the guild from a tool the patron operates into a system that operates itself.

### Standing Order

A registered response to an event, defined in `guild.json`. A standing order says: *whenever this event is signaled, do this*. Two types: engine orders (`run`) invoke a clockwork engine; anima orders (`summon` or `brief`) manifest an anima in the named role and deliver the event as their context. Standing orders are guild policy — they live in configuration, not in engine code.

### Tool

A tool an anima actively wields during work. Tools are the guild's toolkit — instruments that animas use to interact with guild systems, query information, record notes, and perform operations. Each tool ships with instructions that are delivered to the anima when manifested for a session, so the anima knows how to use its tools.

Distinct from engines: tools are wielded by animas during work; engines run automatically without anima involvement.

### Ledger

The guild's book of work — one of the guild's core Books. The Ledger tracks commissions, assignments, and the shape of labor in progress. It answers: what has been asked for, who's doing it, and how far along is it? See [The Books](#the-books) for the full model.

### Relic

An artifact the guild depends on but does not maintain or fully understand. Load-bearing and sacred, not deprecated — a relic is respected for what it carries. Relics are a natural lifecycle stage for tools built fast during periods of rapid growth.

### Threshold

The boundary between the patron's world and the guild's world — where the patron's intent crosses into guild territory. What crosses the threshold outward is works. What crosses inward is commissions. The patron does not cross the threshold into the workshops; the guild does not reach into the patron's space uninvited.

## The Books

The guild keeps its **Books** in the guildhall — the operational records that accumulate as the guild works. The Books record what the guild *has done*; the guildhall's configuration defines what the guild *is*.

### Register

The membership roll. Who exists and what they're made of. The Register records every anima — their name, their composition, their role assignments. It is the guild's institutional memory of its people. Updated when members join or retire; consulted whenever an anima is called to work.

### Ledger

The book of work. What has been commissioned and how labor is organized. The Ledger records commissions, assignments, and the shape of labor in progress — works, pieces, jobs, strokes. It is the guild's transaction record: what was asked for, who is doing it, and how far along it has come.

### Daybook

The chronicle. What happened, when, and what it cost. The Daybook records sessions and the audit trail — the raw chronological account of guild activity. Nothing reads the Daybook to decide what to do next; it exists so the guild can look back and understand what occurred.

The name comes from bookkeeping: a daybook is the chronological journal of transactions before they are posted to the ledger. The Daybook is the raw record of activity; the Ledger is the structured record of work.

### What the Books are not

The Clockworks keeps its own working memory — what it has seen, what it did in response — but this is the mechanism's internal state, not a book the guild consults. The guild's configuration (roles, standing orders, equipment, workshops) lives in the guildhall, not in the Books.
