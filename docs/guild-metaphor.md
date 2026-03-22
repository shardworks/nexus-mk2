# The Guild Metaphor

The guild metaphor is the organizing model for Nexus Mk 2.1. It maps the structure and operations of a medieval guild onto a multi-agent AI system — not as decoration, but as a conceptual framework that makes the system's architecture legible to both humans and agents.

## Core Entities

### Guild

The whole system. The guild is the top-level container for all agents, resources, and activity. There is one guild.

### Patron

The human. The patron ultimately determines what the guild does — commissioning quests, setting priorities, and evaluating outcomes. The patron does not reach into the guild's internals; they interact through the guild's interfaces (CLI, status reports, delivered artifacts). The patron is served, not managed.

### Anima

The fundamental unit of identity in the system. Every anima has a poetic name and a seal — no exceptions, no anonymous instances. An anima is an AI entity with persistent identity: named, instructed, tracked, and accountable for its work. The word comes from Latin, meaning "the animating principle" — the thing that makes something alive rather than mechanical. This is the core distinction in the system: **animas are animated** (backed by AI, capable of judgment), **golems are inanimate** (no AI, purely mechanical). *(We pluralize as "animas" rather than the Latin "animae" — we know, we know.)*

#### States

Every anima exists in one of three states:

| State | Meaning |
|-------|---------|
| **Aspirant** | Being trained, not yet dispatchable. The anima exists in the register and may be undergoing instruction at the Academy, but cannot be assigned to quests. |
| **Active** | On the roster, available for dispatch or currently commissioned. This is a working anima. |
| **Retired** | Permanently stood down. The anima's record and seals persist in the register forever, but they are no longer dispatchable. |

#### Standing vs. Commissioned

The meaningful distinction among active animas is not named vs. unnamed (all animas are named) but **standing** vs. **commissioned**:

- **Standing** — available indefinitely, summoned by name. A standing anima persists on the roster across quests. Guildmaster, Master Sage, Oracle are typically standing. They are always there, always available.
- **Commissioned** — instantiated for a specific quest. A commissioned anima's roster membership lasts only as long as the quest it was created for. Heroes are typically commissioned — a fresh anima is created (or an existing one is commissioned) for each quest, and their tenure ends when the quest completes.

Ontologically, standing and commissioned animas are the same thing: entries in the register with names, seals, instructions, and history. The difference is tenure, not nature.

### Register

The authoritative record of every anima that has ever existed. The register is the guild's institutional memory — it contains aspirants in training, active members, and retired animas whose seals still mark treasure in the storehouses. Each register entry records the anima's name, seal, instructions, skills, provenance (who trained them, how their instructions evolved), and full state history.

### Roster

The active subset of the register. The roster is a filtered view, not a separate store — it shows all animas currently in `active` state. The roster is the system's source of truth for "who can do what right now," including each anima's role, standing/commissioned status, and operational instructions.

### Role

A unique function in the guild, filled by zero or more members. Roles define *what kind of work* a member performs and *when they are invoked*. Roles are not a fixed set — new roles can emerge as the system evolves.

Known roles:

| Role | Function |
|------|----------|
| **Hero** | Undertakes quests. The implementation agent — receives a plan and builds the thing. |
| **Sage** | Plans quest work. Refines vague instructions into concrete requirements and acceptance criteria. |
| **Master Sage** | Senior sage. If a Master Sage is active in the guild, they are consulted before any quest is undertaken by a hero. Augments the quest with advice that heroes must follow. May convene a Council of Sages for complex cases. |
| **Guildmaster** | Top-level decision maker. Interfaces with the patron on behalf of the guild. Determines priorities and allocates resources. |
| **Housemaster** | Decision maker for a specific guild house. Manages house-level priorities and resources. |
| **Coinmaster** | Tracks AI token balances and expenditures. Provides cost visibility and may participate in resource allocation decisions (e.g., which petitions to grant). |
| **Oracle** | Answers questions about code and system design. Loosely defined — a consultative role invoked when agents need understanding of existing systems. |
| **Instructor** | Academy role. Trains other agents, augmenting their skills and instructions. Each instructor has static training and ability; agents trained by an instructor carry provenance metadata recording the lineage. |

## Organizational Structure

### Guild House (or Hall)

An organizational subunit of the guild. Houses group related work and resources. Each house has its own scope of concern and may have a housemaster. Houses are the unit of autonomy within the guild — they can manage their own priorities within the bounds set by the guildmaster and patron.

### Storehouse

A git repository, owned by a guild house. The storehouse is where treasure is kept — it is the physical location of the guild's produced artifacts. A house owns one or more storehouses. (The relationship may be 1:1 or 1:N — to be determined as the system evolves.)

### Forgehouse

A special type of guild house that produces tools and equipment for the guild itself. The forgehouse builds CLI tools, deployment services, infrastructure, and internal utilities — anything the system uses to operate. The forgehouse's treasure is consumed by other guild members, not by the patron directly.

### Academy

A training guild house that takes aspirant animas and inscribes them with skills and instructions. The academy has instructors — named animas who fill the `instructor` role. Each instructor has their own static training and ability. When an instructor trains an aspirant, that training event is recorded as provenance: the anima's register entry records who trained them, when, and what was taught. This creates a traceable lineage for how any anima's instructions evolved.

## Communication

### Inbox

Each guild member has an inbox — a queue where messages are delivered for the member to act on. When a message arrives, it is passed to the member's agent in context, and the member does whatever their role dictates. Inboxes are the primary mechanism for asynchronous coordination between guild entities. (Format and mechanics TBD.)

## Infrastructure

### Golem (working term)

A soulless servant — mechanical glue code with no AI. Golems are scripts, cron jobs, queue readers, and other deterministic processes that handle the repeatable, mechanical work of the guild: reading a message from a queue and delivering it to a member's agent, moving files between storehouses, triggering lifecycle transitions, etc.

The distinction is essential: **animas are animated** (backed by AI, capable of judgment and creativity), **golems are inanimate** (no AI, purely mechanical, perfectly repeatable). Golems are the connective tissue that lets animas focus on the work that requires intelligence. The term is provisional; candidates include *servitors*, *spirits*, *constructs*, or *familiars*.

## Work

### Quest

A commissioned action to produce or discover treasure. Quests are the units of work in the guild — each quest results in produced code committed to a storehouse. Quests are posted by the patron (or, eventually, by guild processes like petitions), dispatched to members, and tracked through a lifecycle.

#### Sage Consultation

If a **Master Sage** is active in the guild, they must be consulted before any quest is undertaken by a hero. The Master Sage reviews the quest and augments it with `sageAdvice` — a plan that the hero must follow. Heroes are instructed to never contradict sage advice.

If other Sages are active in the guild, they form a **Council of Sages**. The Master Sage may choose to convene the council for complex cases, gathering multiple perspectives before producing advice. Council consultation is at the Master Sage's discretion, not automatic.

### Petition

A quest submitted by a guild house rather than the patron. Petitions are requests to build or improve house resources — paying tech debt, upgrading tooling, refactoring internal systems. The intent is that the Coinmaster and Guildmaster evaluate petitions and decide which to grant, balancing cost against value. Petitions use the same quest infrastructure but originate from within the guild.

### Treasure

The artifacts stored in a storehouse — code, configurations, assets, and other deliverables produced by quest work. Treasure is the tangible output of the guild. The term is intentionally broad; what counts as treasure is defined by what gets committed to a storehouse.

## Records & History

### Stories (working term)

Logs, transcripts, and metadata produced by guild activities. Session logs, quest records, trial outcomes, sage advice, cost reports — the narrative record of what the guild did, why, and how it went. The term is provisional; candidates include *chronicles*, *annals*, *ledger*, or *scrolls*. The concept is stable even if the name isn't.

## Open Questions

- **House-to-storehouse cardinality:** Is a house always 1:1 with a repository, or can a house own multiple storehouses? The 1:N model is more flexible but adds complexity to dispatch and ownership.
- **Petition mechanics:** How does a house actually submit a petition? Does the housemaster use the same CLI? Is there an approval flow, or does the guildmaster just see a queue?
- **Council of Sages protocol:** When the Master Sage convenes the council, what does that look like mechanically? Parallel consultation? Sequential? Does the Master Sage synthesize, or does each sage contribute independently?
- **Stories naming:** The working term "stories" doesn't quite land. Need to find the right guild-flavored word for the system's operational records.
- **Instructor provenance format:** What does the training lineage look like in practice? A list of training events? A tree? How granular — per-skill, or per-session?
- **Golem naming:** "Golem" captures the soulless/mechanical vibe well but may be too heavy. Candidates: *servitor*, *spirit*, *construct*, *familiar*. Need something that clearly signals "no AI here, just plumbing."
- **Inbox mechanics:** What does the inbox look like? File-based queue? Database rows? How does a golem know when to deliver? Polling? Event-driven?

## Coco's Suggestions

Everything below is Coco riffing. Unvetted, unfiltered, organized loosely by theme. Take what resonates, discard the rest.

### Authority & Governance

**Charter** — the founding document of a guild house. A charter defines the house's purpose, its storehouses, its standing members, and any constraints on its autonomy. When a new house is created, it gets a charter. The charter is what makes a house *legitimate* — without one, it's just a directory with aspirations. System mapping: the configuration/manifest file that defines a house's scope, repos, and member assignments.

**Writ** — a formal authorization to act. Distinct from a quest (which describes *what* to do), a writ grants *permission* to do it. A quest might be posted but not yet authorized — awaiting budget approval from the Coinmaster, or strategic sign-off from the Guildmaster. The writ is what turns a posted quest into a dispatchable one. This could be the missing piece in the petition flow: a house submits a petition, and the Guildmaster issues a writ to authorize it. System mapping: an approval gate between `posted` and `ready` status.

**Seal** — a member's mark of authorship on their work. When a hero completes a quest, the treasure bears their seal. When a sage produces advice, the advice is sealed. Seals create provenance — you can always trace *who* produced *what*. System mapping: author metadata on commits, quest records, and advice objects. Already partially exists (git author), but formalizing it in the guild model makes it intentional rather than incidental.

**Edict** — a directive from the Guildmaster (or patron) that applies across the entire guild. Not a quest — an edict doesn't produce treasure. It changes *how the guild operates*. "All heroes must write tests." "No quest may exceed 500k tokens." "The forgehouse has priority on all sage consultations this week." System mapping: system-wide configuration changes, policy updates, CLAUDE.md-level directives. Edicts vs. quests is the difference between "build X" and "from now on, do Y."

**Decree** — like an edict, but scoped to a single house. A housemaster can issue decrees for their house without involving the guildmaster. System mapping: house-level configuration or CLAUDE.md overrides.

### Knowledge & Learning

**Tome** — a large, authoritative knowledge document. The guild metaphor doc itself is a tome. The project philosophy is a tome. A tome is *reference material* — not instructions (those are scrolls), not records (those are stories/chronicles), but accumulated knowledge meant to be consulted. System mapping: docs that agents are instructed to read for context. The key insight: tomes are written *for agents to read*, not for humans. They're part of the system's knowledge architecture.

**Scroll** — a small, portable instruction document. A member's custom instructions are a scroll. A quest spec is a scroll. Scrolls are *actionable* — they tell you what to do, not what to know. The distinction from tomes: you *study* a tome, you *follow* a scroll. System mapping: agent instruction files, quest specs, operational directives.

**Lore** — accumulated institutional knowledge that isn't written down anywhere specific. The things the guild "just knows" from experience. A hero who has completed 50 quests in a storehouse has lore about that codebase — patterns, pitfalls, architectural decisions. System mapping: this is the hard one. Lore is what's currently lost between agent sessions. If the register tracked not just instructions but *experience summaries* per anima, that's lore. This is where the Academy gets really interesting — an instructor could distill a member's lore into teachable knowledge.

**Rune** — a small, reusable fragment of instruction or knowledge. Not a full scroll — more like a macro or a snippet. "Always use async/await, never raw promises." "This repo uses vitest, not jest." Runes can be composed into scrolls, attached to storehouses, or stamped onto quest records. System mapping: reusable prompt fragments, repo-specific conventions, composable instruction modules.

### Economics & Resources

**Purse** — a token budget allocated to a specific quest or member. The Coinmaster manages the guild's overall treasury; purses are the parceled-out allocations. A quest gets a purse when dispatched. If the purse runs dry, the quest must stop or request more funds. System mapping: token budget limits per agent invocation. This is a real operational need — runaway agents are expensive. The purse makes cost containment part of the metaphor rather than an afterthought.

**Tithe** — a portion of resources contributed back to the guild from each quest. Not every token spent on a quest goes to implementation — some overhead goes to sage consultation, golem operation, record-keeping. The tithe is that overhead, made visible. System mapping: tracking the "cost of coordination" separately from the "cost of implementation." Useful for understanding system efficiency.

**Bounty** — a reward or incentive attached to a quest. In the current system this is metaphorical, but it could become real: a bounty could represent priority level, resource allocation, or quality expectations. A high-bounty quest gets a senior hero and a full sage consultation. A low-bounty quest gets dispatched with minimal ceremony. System mapping: quest priority/tier system that affects dispatch decisions.

**Levy** — a mandatory contribution from houses to the guild. Each house might owe a certain amount of capacity to guild-wide quests (patron-originated work) before they can pursue their own petitions. System mapping: resource allocation policy — ensuring patron work takes priority over internally-generated work.

### Quality & Verification

**Assay** — an examination of treasure to determine its quality. When a hero returns from a quest, the treasure is assayed before it's accepted into the storehouse. Does it work? Does it meet the spec? Does it break anything? System mapping: automated testing, CI checks, integration verification. The assayer could be a role — or it could be a golem (mechanical quality checks) with an Oracle consulted for judgment calls.

**Hallmark** — a quality stamp applied to treasure that has passed assay. Hallmarked treasure is trusted; unhallmarked treasure is provisional. A storehouse might refuse unhallmarked treasure. System mapping: CI passing, code review approval, merge criteria. The hallmark is what gates treasure entering the storehouse permanently.

**Trial by Craft** — a demonstration of skill required before a member is trusted with certain work. An apprentice hero might need to complete trial quests in a sandboxed environment before being dispatched to real storehouses. System mapping: agent evaluation/qualification — running test quests to verify a member's capabilities before giving them production access. This ties into the Academy: the Academy trains, the trial proves.

### Lifecycle & Ceremony

**Muster** — the act of assembling members for a quest. Before dispatch, the system musters the required members: checks the roster, verifies availability, confirms the sage is ready, ensures the hero is active. System mapping: the pre-dispatch validation step. Currently implicit in `send`, but formalizing it as "muster" makes it a named, debuggable phase.

**Vigil** — a period of watching and waiting. After a quest is dispatched, someone (or something) keeps vigil — monitoring progress, watching for failures, waiting for completion. System mapping: the background monitoring that checks quest status, detects failures, and triggers alerts. Currently a manual `nexus q status` check. A golem could keep vigil automatically.

**Rite of Naming** — the ceremony by which a new anima is created in the register and given their identity. Not just "add to database" — the naming is when the anima receives its poetic name and seal, becoming a distinct entity. The rite could include an initial training session at the Academy (aspirant phase), a trial by craft, and formal induction to the roster as an active anima.

**Requiem** — the process of retiring an anima. Not deletion — the anima's record persists in the register forever, their seals remain on their treasure, their lore is preserved. But they transition to `retired` state and are no longer dispatchable. System mapping: a formal process that includes archiving the anima's current instructions and recording why they were retired.

### Communication & Coordination

**Herald** — a specialized golem (or role?) that announces events across the guild. Quest completed. New member inducted. Petition granted. House chartered. The herald doesn't decide anything — it broadcasts. System mapping: an event/notification system. Webhooks, log events, Slack notifications, whatever — the herald is the abstraction over "tell everyone something happened."

**Summons** — a formal request for a specific member's attention. Different from a message in the inbox — a summons is urgent and targeted. "The Oracle is summoned to examine the authentication module." System mapping: a high-priority, synchronous invocation of a specific member, as opposed to async inbox delivery.

**Parley** — a structured conversation between two or more members. When the Master Sage convenes the Council, that's a parley. When a hero encounters something unexpected and needs to consult the Oracle mid-quest, that's a parley. System mapping: agent-to-agent communication within a quest lifecycle. This is the multi-agent coordination primitive — how do two AI agents actually talk to each other?

**Dispatch** — already used informally, but worth naming explicitly. A dispatch is the act of sending a member on a quest. It includes the muster (validation), the writ (authorization), and the actual invocation. System mapping: `nexus q send`, but decomposed into named phases.

### Spatial & Territorial

**Ward** — a protective boundary around a storehouse or house. Wards define what members can and cannot do within a space. "No force-pushes to main." "No modifications to the auth module without Oracle consultation." System mapping: branch protection rules, path-based permissions, pre-commit hooks, CODEOWNERS — all the guardrails that prevent members from damaging treasure.

**Threshold** — the boundary between the patron's world and the guild's world. The CLI is the threshold — it's where the patron's intent crosses into guild territory. The philosophy doc already describes this boundary; "threshold" gives it a name in the metaphor. What crosses the threshold outward is treasure and stories. What crosses inward is quests and edicts.

**Commons** — shared resources accessible to all houses. Not owned by any single house, but maintained by the guild. System mapping: shared libraries, common configurations, cross-cutting infrastructure. The forgehouse might *build* commons, but it doesn't *own* them — they belong to the guild.

### The Weird Stuff (speculative, possibly dumb, possibly brilliant)

**Familiar** — what if, instead of being a synonym for golem, a familiar is a golem *bound to a specific member*? Every member could have a personal familiar — a set of mechanical scripts tailored to that member's role and habits. The hero's familiar manages their git workflow. The sage's familiar gathers codebase context before consultation. System mapping: per-role automation that wraps the agent invocation with role-specific pre/post processing.

**Enchantment** — a persistent augmentation applied to a storehouse or tool. An enchanted storehouse might have automatic linting, type-checking, or test-running on every commit. An enchanted CLI tool might have built-in telemetry. Enchantments are set-and-forget improvements that make everything in their scope better. System mapping: CI/CD pipelines, git hooks, automated quality tooling — but framed as *enhancements to the artifact* rather than external processes.

**Prophecy** — a prediction about future work, made by the Oracle or Master Sage. "If we continue on this architecture, we will hit scaling problems in the auth module within 3 quests." "The test suite will become the bottleneck before the code does." Prophecies are speculative and may be wrong, but they inform prioritization. System mapping: AI-generated technical forecasting. Feed an Oracle the full codebase and ask "what's going to break next?" Use prophecies to generate petitions proactively.

**Ritual** — a prescribed sequence of actions performed by golems and members in coordination. A deployment is a ritual. A release is a ritual. Onboarding a new storehouse is a ritual. Rituals are repeatable, documented, and partially mechanical (golem steps) and partially intelligent (member steps). System mapping: runbooks, playbooks, CI/CD pipelines with manual gates — any multi-step process that blends automation with judgment.

**Pilgrimage** — a quest undertaken not for treasure, but for knowledge. Send a hero (or sage) to explore an unfamiliar codebase, library, or technology — not to build anything, but to return with lore. The lore is then available to the guild for future quests. System mapping: exploratory spikes, research tasks, "go figure out how this library works and write up what you learn." The output is a tome or lore entry, not code.

**Relic** — an artifact from a previous era of the guild that still holds power. Legacy code, deprecated tools, old architectural decisions that still shape the system. Relics aren't treasure (they're not actively valued) but they can't be ignored (they still affect things). System mapping: tech debt, legacy systems, deprecated APIs. Naming them "relics" makes them visible and gives the guild vocabulary to discuss them. "The auth module is a relic — we need a petition to replace it."

**Oath** — a binding commitment made by a member. "I will never modify files outside my quest scope." "I will always run tests before sealing my work." Oaths are encoded in a member's instructions and enforced by the system. Breaking an oath is a serious event — grounds for requiem. System mapping: hard constraints in agent instructions, guardrails that are *identity-level* rather than *quest-level*. The difference between an edict ("do X on this quest") and an oath ("I always do X, on every quest, it's who I am").
