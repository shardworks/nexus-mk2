# The Guild Metaphor

The guild metaphor is the organizing model for Nexus Mk 2.1. It maps the structure and operations of a craftsman's guild onto a multi-agent AI system — not as decoration, but as a conceptual framework that makes the system's architecture legible to both humans and agents.

## Core Entities

### Guild

The whole system. The guild is the top-level container for all agents, resources, and activity. There is one guild.

### Patron

The human. The patron commissions work and judges the guild by what it delivers — not by inspecting how the work was done. The patron does not enter the guild's workshops; they interact through the guild's interfaces (CLI, status reports, delivered works). What crosses the threshold outward is the guild's *works* — running software, usable tools, solved problems. The patron judges works by using them, not by inspecting the workshop.

The patron knows the workshops exist and may assign them ("build the next thing in this repository"), but does not go inside during normal operation. The boundary is maintained by discipline, not access control.

### Anima

The fundamental unit of identity in the system. Every anima has a name — no exceptions, no anonymous instances. An anima is an AI entity with persistent identity: named, instructed, tracked, and accountable for its work. The word comes from Latin, meaning "the animating principle" — the thing that makes something alive rather than mechanical. This is the core distinction in the system: **animas are animated** (backed by AI, capable of judgment), **golems are inanimate** (no AI, purely mechanical). *(We pluralize as "animas" rather than the Latin "animae" — we know, we know.)*

#### States

Every anima exists in one of three states:

| State | Meaning |
|-------|---------|
| **Aspirant** | Being trained, not yet dispatchable. The anima exists in the register but cannot be assigned to commissions. |
| **Active** | On the roster, available for dispatch or currently commissioned. This is a working anima. |
| **Retired** | No longer active. The anima's record persists in the register forever, but they are no longer dispatchable. |

#### Standing vs. Commissioned

The meaningful distinction among active animas is not named vs. unnamed (all animas are named) but **standing** vs. **commissioned**:

- **Standing** — available indefinitely, summoned by name. A standing anima persists on the roster across commissions. They are always there, always available.
- **Commissioned** — instantiated for a specific commission. A commissioned anima's roster membership lasts only as long as the commission it was created for. Artificers are typically commissioned — a fresh anima is created (or an existing one is commissioned) for each commission, and their tenure ends when the commission completes.

Concretely, standing and commissioned animas are the same thing: entries in the register with names, instructions, and history. The difference is tenure, not nature.

### Register

The authoritative record of every anima that has ever existed. The register is the guild's institutional memory — it contains aspirants in training, active members, and retired animas. Each register entry records the anima's name, instructions, skills, and full state history.

### Roster

The active subset of the register. The roster is a filtered view, not a separate store — it shows all animas currently in `active` state. The roster is the system's source of truth for "who can do what right now," including each anima's role, standing/commissioned status, and operational instructions.

## Roles

A unique function in the guild, filled by zero or more members. Roles define *what kind of work* a member performs and *when they are invoked*. Roles are not a fixed set — new roles can emerge as the system evolves.

| Role | Function |
|------|----------|
| **Artificer** | Undertakes commissions. The implementation agent — receives a plan and builds the thing. "Artificer" captures the craft and fabrication nature of the work, with a slight magical resonance that fits the guild's spirit. |
| **Sage** | Plans commission work. Refines vague instructions into concrete requirements and acceptance criteria. |
| **Master Sage** | Senior sage. If a Master Sage is active in the guild, they are consulted before any commission is undertaken by an artificer. Augments the commission with advice that artificers must follow. May convene a Council of Sages for complex cases. |

Other roles (Guildmaster, Coinmaster, Oracle, Instructor, and others) are anticipated but not yet defined at the foundational level. See `.scratch/guild-metaphor-draft.md` for emerging concepts.

## Work

### Commission

A unit of work posted by the patron and undertaken by the guild. The patron commissions work; the guild builds it. A commission describes what needs to be built, is dispatched to an artificer, and tracked through a lifecycle. The output is the guild's works — delivered to the patron, judged by use.

#### Sage Consultation

If a **Master Sage** is active in the guild, they must be consulted before any commission is undertaken by an artificer. The Master Sage reviews the commission and provides "sage advice" — a plan that the artificer must follow. Artificers are instructed to never contradict sage advice.

If other Sages are active in the guild, they form a **Council of Sages**. The Master Sage may choose to convene the council for complex cases, gathering multiple perspectives before producing advice. Council consultation is at the Master Sage's discretion, not automatic.

### Works

The guild's output — what crosses the threshold to the patron. Works are intentionally vague: running software, usable tools, deployed services, solved problems. The patron judges works by using them. What counts as a work is defined by what the patron can touch, run, or interact with.

## Workshops

A repository where the guild does its work. Workshops are guild space — the patron assigns them but does not enter them during normal operation. An artificer working a commission does their craft inside a workshop; the patron judges the result by the works it produces, not by reading the code on the workbench.

Some workshops produce works for the patron (applications, services, tools). Others are purely guild infrastructure — tools, training materials, databases. These aren't built for the patron; they are how the guild operates. Both kinds are guild space.

## Infrastructure

### Golem

An inanimate servant — mechanical glue code with no AI. Golems are scripts, cron jobs, queue readers, and other deterministic processes that handle the repeatable, mechanical work of the guild: reading a message from a queue and delivering it to a member's agent, moving files between workshops, triggering lifecycle transitions, etc.

The distinction is essential: **animas are animated** (backed by AI, capable of judgment and creativity, expensive), **golems are inanimate** (no AI, purely mechanical, perfectly repeatable, cheap). Golems are the connective tissue that lets animas focus on the work that requires intelligence.

### Threshold

The boundary between the patron's world and the guild's world — where the patron's intent crosses into guild territory. What crosses the threshold outward is works. What crosses inward is commissions. The patron does not cross the threshold into the workshops; the guild does not reach into the patron's space uninvited.
