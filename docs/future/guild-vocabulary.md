# Guild Vocabulary — Emerging Concepts

Latent vocabulary for the guild metaphor: concepts that are still cooking, not yet needed for bootstrap, or awaiting design decisions. Everything here is compatible with the foundational metaphor in `/workspace/nexus/docs/guild-metaphor.md` but hasn't been promoted to foundational status yet.

This document is a **tome** (in its own metaphor) — reference material to consult, not work-in-progress. When opening a new quest, scan this file for related terms and cross-link any matches in the quest's References section. That manual habit is the discovery mechanism: the vocabulary doesn't surface itself; Coco surfaces it by remembering to look.

**Companion registry:** historical term → canonical term lookups live in [`vocabulary-aliases.yaml`](./vocabulary-aliases.yaml) — a machine-readable alias map for resolving renames, drifts, and subsumed concepts across old clicks, briefs, commits, and transcripts. The tome carries the narrative; the registry carries the lookup.

**Active vocabulary bookmark quests** — terms with feature-shaped gaps that have earned their own parked-quest entries:

- **Coinmaster / Purse / Tithe** → cost tracking & token budget allocation (`w-mnszznt5-66d0ec7464bc`) — under umbrella `w-mo0e2m9q` *Unlocking autonomous operation*
- **Petition (internal-source variant)** → first-class internal commissions (`w-mnszzo8h-42137bda6681`) — under umbrella `w-mo0e2m9q` *Unlocking autonomous operation*. The petition concept itself is broader (any formally submitted request, patron or internal); this bookmark tracks the internal-source flow specifically.
- **Vigil** → reserved as the label for the Reckoner's oversight/maintenance/watching functions. Earlier bookmark scope (background monitoring of in-flight commissions — click `c-mo1mqgf9`, writ `w-mnszzon4-731bd9827d05`) is now one Reckoner function among several (vision-keeper `c-moa42rxh`, overseer `c-moaj06ty`, in-flight monitoring `c-mo1mqgf9`, intervention pulses `c-mo1z3teo`).

Other terms in this tome remain latent — they live here until they earn a bookmark or get absorbed into an active inquiry.

## Roles (not yet foundational)

| Role | Function | Status |
|------|----------|--------|
| **Guildmaster** | Top-level decision maker. Interfaces with the patron on behalf of the guild. Determines priorities and allocates resources. | Clear concept, not needed until guild has enough activity to require coordination. |
| **Coinmaster** | Tracks AI token balances and expenditures. Provides cost visibility and may participate in resource allocation decisions (e.g., which petitions to grant). | Real need, not blocking anything yet. |
| **Oracle** | Answers questions about code and system design. Loosely defined — a consultative role invoked when agents need understanding of existing systems. | Useful but not in the critical path. |

### Distiller

A pre-plan role that consumes a **petition** (the patron's submitted request) and produces a **brief** — a structured, six-section working artifact (Summary, Behaviors, Acceptance Criteria, Out of Scope, Edge Cases, Open Questions) with provenance tagging on every item. The brief becomes the working contract for the **Sage** in the plan stage. The Distiller resolves product-layer ambiguity (what the feature is, who it's for, how it behaves from the user's perspective) without touching implementation-layer questions, which remain the Sage's domain. Three techniques: **extract** from the petition text, **extrapolate** from named anchors and methodological principles, **interview** (typically the Patron Anima) to fill gaps. Process discipline lives in `c-mo3qjbmw`; interview mechanics in `c-mo3qjcuw`.

Previously called BA/PO (Business Analyst / Product Owner) during initial design; renamed to Distiller because the role's essence is distilling a messy petition into a clarified, machine-parseable brief.

System mapping: a new pre-plan stage in the Astrolabe pipeline (click subtree under `c-mo3qj676`).

### Sage

The plan-stage role (formally `sage-reader-analyst`) that consumes a **brief** (Distiller's output) and produces a **spec** for the implementer. The Sage resolves implementation-layer ambiguity — APIs, schemas, workflows, structural choices — and may consult the petition as a secondary reference under disciplined conditions (see `c-mo3qsanr`). The Sage replaces what earlier design called the analyst / reader-analyst.

Pipeline placement: petition → [Distiller] → brief → [Sage] → spec → [implementer] → code.

## Work (not yet foundational)

### Petition

A formally submitted request to the guild for work to be performed. Petitions are the canonical input artifact at the front of the work pipeline — they're what the Distiller consumes to produce a brief, which the Sage then turns into a spec for implementation. The pipeline reads: petition → brief → spec → code.

Petitions may originate from either side of the guild boundary:
- **Patron-source petitions** — the patron submits a request from outside the guild (this is what the system formerly called "the brief"; renamed to clarify that the patron's submission is a request, while *brief* is reserved for the Distiller's refined output).
- **Internal-source petitions** — a guild member submits a request from within the guild for work to build or improve guild resources (paying tech debt, upgrading tooling, refactoring internal systems). Leadership evaluates internal petitions and decides which to grant, balancing cost against value. Tracked as a distinct flow under bookmark click `c-mo1mqgqv` / writ `w-mnszzo8h-42137bda6681`.

Both flavors flow through the same commission infrastructure; the originator is a `source` field on the petition, not a different artifact type. A future sub-term may distinguish the internal subset if usage warrants.

### Brief

The Distiller's output artifact — a structured, machine-parseable document derived from a petition through extract/extrapolate/interview, with provenance tagging on every item. Six sections: Summary, Behaviors, Acceptance Criteria, Out of Scope, Edge Cases, Open Questions (shape settled in `c-mo3qj9by`). The brief is the working contract for the Sage; the petition remains attached as a secondary reference (see `c-mo3qsanr`).

**Vocabulary note:** earlier design conversations and many existing clicks/commits use "brief" to mean what is now called *petition* (the patron's submitted input). The naming was inverted on `2026-04-18`; the Distiller's output is the proper "brief" in the craft sense (a polished, structured artifact prepared for an audience to act on), while the patron's submission is the petition. Historical references to "brief" in the input sense are archival; the mapping is documented here.

## Communication

### Inbox

Each guild member has an inbox — a queue where messages are delivered for the member to act on. When a message arrives, it is passed to the member's agent in context, and the member does whatever their role dictates. Inboxes are the primary mechanism for asynchronous coordination between guild entities. (Format and mechanics TBD.)

### Pulse

A discrete signal carried by the Lattice. A pulse is an **immutable event record** with a payload; once emitted, it is never mutated. It carries delivery state (pending / delivered / failed) for the Lattice's own shipping concerns, but no patron-acknowledgment state — pulses are signals about guild state, not tasks with their own lifecycle. "Is this still live?" is derived by joining the pulse to its referent (typically a writ) in the book, not tracked on the pulse itself.

Pulses are used for intervention signals (Reckoner → patron), status reports, completion notices, and any other guild-internal or guild-to-patron transmission. Trigger-type on the pulse carries urgency — the pulse itself is a neutral container.

Punchier successor to the earlier "missive" framing; coheres better with the Lattice-as-network metaphor. The pulse is the *transmission event*, which cleanly decouples it from payload size — short signals and payload-bearing completion reports both fit.

## Apparatuses

Named mechanical constructs of the guild — infrastructure-level machinery with focused responsibilities, composed together to operate the guild. Distinct from *roles* (human-equivalent agents like Distiller, Sage) and from *artifacts* (records like writs, pulses, briefs).

### The Lattice

The guild's general-purpose messaging apparatus. Carries pulses between any two points — agent to agent, guild to patron, apparatus to apparatus. Delivers directly (no intermediate courier; the earlier "Herald" carrier role was dropped when this shape settled). Any part of the guild can emit a pulse through the Lattice: the Reckoner (intervention signals), Coinmaster (budget warnings), Clerk (approvals needed), Artificers (completion reports), etc.

System mapping: outbox + delivery infrastructure for notifications and signals. Pulses are immutable records (durable event log, not mutable tasks) stored in the book; the Lattice reads pending-delivery pulses and ships them through configured channels. Pulses have no acknowledgment state — their referent (typically a writ) holds the live state, and "still needs attention" is derived by joining to that referent.

### The Reckoner

The guild's command-and-control apparatus — the executive function that senses guild state and acts on it. Responsibilities:

- **Monitor the patron's vision** — the strategic direction the guild is meant to advance.
- **Monitor operational parameters** — cost, quality, queue state, daemon health, commissions in flight, drift from expected behavior.
- **Act on observations** via two modes:
  - *Ask the patron* — emit a pulse through the Lattice to surface something that needs patron judgment (commission stuck, budget exhausted, queue drained, etc.).
  - *Act autonomously* — post a commission to remediate a guild issue or advance the vision.

Subsumes several existing design clicks as internal functions: c-moa42rxh (vision-keeper), c-moaj06ty (overseer pattern), c-mo1mqgf9 (background monitoring of in-flight commissions), c-mo1z3teo (intervention pulses). Specific internal decomposition (what watchers, what contracts) still to be designed.

## Records & History

### Stories (working term)

Logs, transcripts, and metadata produced by guild activities. Session logs, commission records, trial outcomes, sage advice, cost reports — the narrative record of what the guild did, why, and how it went. The term is provisional; candidates include *chronicles*, *annals*, or *scrolls*. The concept is stable even if the name isn't.

## Open Questions

- **Council of Sages protocol:** When the Master Sage convenes the council, what does that look like mechanically? Parallel consultation? Sequential? Does the Master Sage synthesize, or does each sage contribute independently?
- **Stories naming:** The working term "stories" doesn't quite land. Need to find the right guild-flavored word for the system's operational records.
- **Inbox mechanics:** What does the inbox look like? File-based queue? Database rows? How does an engine know when to deliver? Polling? Event-driven?
- **Seal mechanics:** The concept of a seal (a member's mark of authorship) is clear, but the format is undefined. Git authorship serves as an interim stand-in. See Coco's suggestions below for the full concept.
- ~~**"Summons" vs "Summon":** Resolved — "summon" removed from foundational metaphor (engine renamed to "compose", later to "manifest"). "Summons" is free for its natural use as an urgent, targeted request for a member's attention.~~

---

## Coco's Suggestions

Everything below is Coco riffing. Unvetted, unfiltered, organized loosely by theme. Take what resonates, discard the rest.

### Authority & Governance

**Charter** — the founding document of a guild house. A charter defines the house's purpose, its workshops, its standing members, and any constraints on its autonomy. When a new house is created, it gets a charter. The charter is what makes a house *legitimate* — without one, it's just a directory with aspirations. System mapping: the configuration/manifest file that defines a house's scope, repos, and member assignments.

**Writ** — a formal authorization to act. Distinct from a commission (which describes *what* to do), a writ grants *permission* to do it. A commission might be posted but not yet authorized — awaiting budget approval from the Coinmaster, or strategic sign-off from the Guildmaster. The writ is what turns a posted commission into a dispatchable one. This could be the missing piece in the petition flow: a house submits a petition, and the Guildmaster issues a writ to authorize it. System mapping: an approval gate between `posted` and `ready` status.

**Seal** — a member's mark of authorship on their work. When an artificer completes a commission, the work bears their seal. When a sage produces advice, the advice is sealed. Seals create provenance — you can always trace *who* produced *what*. System mapping: author metadata on commits, commission records, and advice objects. Already partially exists (git author), but formalizing it in the guild model makes it intentional rather than incidental.

**Edict** — a directive from leadership that applies across the entire guild. Not a commission — an edict doesn't produce deliverables. It changes *how the guild operates*. System mapping: system-wide configuration changes, policy updates. Edicts vs. commissions is the difference between "build X" and "from now on, do Y." *(Refined and specified in the v2 architecture — see `.scratch/nexus-architecture-v2.md`.)*

**Decree** — like an edict, but scoped to a single house. A housemaster can issue decrees for their house without involving the guildmaster. System mapping: house-level configuration overrides.

**Oath** — a binding commitment made by a member. "I will never modify files outside my commission scope." "I will always run tests before sealing my work." Oaths are identity-level — the difference between an edict ("do X on this commission") and an oath ("I always do X, on every commission, it's who I am"). *(Refined and specified in the v2 architecture as a composition component — see `.scratch/nexus-architecture-v2.md`.)*

### Knowledge & Learning

**Tome** — a large, authoritative knowledge document. The guild metaphor doc itself is a tome. The project philosophy is a tome. A tome is *reference material* — not instructions (those are scrolls), not records (those are stories/chronicles), but accumulated knowledge meant to be consulted. System mapping: docs that agents are instructed to read for context. The key insight: tomes are written *for agents to read*, not for humans. They're part of the system's knowledge architecture.

**Scroll** — a small, portable instruction document. A member's custom instructions are a scroll. A commission spec is a scroll. Scrolls are *actionable* — they tell you what to do, not what to know. The distinction from tomes: you *study* a tome, you *follow* a scroll. System mapping: agent instruction files, commission specs, operational directives.

**Lore** — accumulated institutional knowledge that isn't written down anywhere specific. The things the guild "just knows" from experience. An artificer who has completed 50 commissions in a workshop has lore about that codebase — patterns, pitfalls, architectural decisions. System mapping: this is the hard one. Lore is what's currently lost between agent sessions. If the register tracked not just instructions but *experience summaries* per anima, that's lore. This is where the Academy gets really interesting — an instructor could distill a member's lore into teachable knowledge.

**Rune** — a small, reusable fragment of instruction or knowledge. Not a full scroll — more like a macro or a snippet. "Always use async/await, never raw promises." "This repo uses vitest, not jest." Runes can be composed into scrolls, attached to workshops, or stamped onto commission records. System mapping: reusable prompt fragments, repo-specific conventions, composable instruction modules.

### Economics & Resources

**Purse** — a token budget allocated to a specific commission or member. The Coinmaster manages the guild's overall treasury; purses are the parceled-out allocations. A commission gets a purse when dispatched. If the purse runs dry, the commission must stop or request more funds. System mapping: token budget limits per agent invocation. This is a real operational need — runaway agents are expensive. The purse makes cost containment part of the metaphor rather than an afterthought.

**Tithe** — a portion of resources contributed back to the guild from each commission. Not every token spent on a commission goes to implementation — some overhead goes to sage consultation, engine operation, record-keeping. The tithe is that overhead, made visible. System mapping: tracking the "cost of coordination" separately from the "cost of implementation." Useful for understanding system efficiency.

**Bounty** — a reward or incentive attached to a commission. In the current system this is metaphorical, but it could become real: a bounty could represent priority level, resource allocation, or quality expectations. A high-bounty commission gets a senior artificer and a full sage consultation. A low-bounty commission gets dispatched with minimal ceremony. System mapping: commission priority/tier system that affects dispatch decisions.

**Levy** — a mandatory contribution from houses to the guild. Each house might owe a certain amount of capacity to guild-wide commissions (patron-originated work) before they can pursue their own petitions. System mapping: resource allocation policy — ensuring patron work takes priority over internally-generated work.

### Quality & Verification

**Assay** — an examination of completed work to determine its quality. When an artificer completes a commission, the work is assayed before it's accepted. Does it work? Does it meet the spec? Does it break anything? System mapping: automated testing, CI checks, integration verification. The assayer could be a role — or it could be an engine (mechanical quality checks) with an Oracle consulted for judgment calls.

**Hallmark** — a quality stamp applied to work that has passed assay. Hallmarked work is trusted; unhallmarked work is provisional. A workshop might refuse unhallmarked contributions. System mapping: CI passing, code review approval, merge criteria. The hallmark is what gates completed work entering the workshop permanently.

**Trial by Craft** — a demonstration of skill required before a member is trusted with certain work. An apprentice artificer might need to complete trial commissions in a sandboxed environment before being dispatched to real workshops. System mapping: agent evaluation/qualification — running test commissions to verify a member's capabilities before giving them production access. This ties into the Academy: the Academy trains, the trial proves.

### Lifecycle & Ceremony

**Muster** — the act of assembling members for a commission. Before dispatch, the system musters the required members: checks the roster, verifies availability, confirms the sage is ready, ensures the artificer is active. System mapping: the pre-dispatch validation step. Currently implicit in `send`, but formalizing it as "muster" makes it a named, debuggable phase.

**Vigil** — the *activity* of watching and waiting, not an actor or construct. Vigil is what is *kept* — the ongoing monitoring itself. Now reserved as a label for the Reckoner's oversight/maintenance/watching functions: the Reckoner keeps vigil over guild operational parameters, in-flight commissions, and the patron's vision. Specific implementations — what exactly is watched, how, when, by what sub-construct — are still to be designed. Not introduced to code or architecture docs yet.

**Sentinel** — reserved term for a single scoped watcher function within the Reckoner. A Sentinel watches one specific thing (writ state, queue depth, daemon health, purse balance, drift from vision) and emits a pulse into the Lattice when its condition fires. Plural by design: the Reckoner can host many Sentinels, each with a narrow scope, composed together into the Reckoner's overall vigil. Not introduced to code or architecture docs yet — reserved until the Reckoner's internal decomposition is firmed up.

**Rite of Naming** — the ceremony by which a new anima is called into being and given their identity. Not just "add to database" — the naming is when the spirit receives its name and seal, becoming a distinct presence in the guild. The rite could include an initial training session at the Academy (aspirant phase), a trial by craft, and formal induction to the roster as an active anima.

**Requiem** — the process of retiring an anima. Not dissolution — the anima's record persists in the register forever, their seals remain on their work, their lore is preserved. But the spirit passes to rest: `retired` state, no longer manifested. System mapping: a formal process that includes archiving the anima's current instructions and recording why they were retired.

### Communication & Coordination

**Herald** — *(dropped from active vocabulary.)* Earlier proposed as a carrier/delivery construct for guild announcements. When the messaging apparatus settled as **the Lattice** (which delivers pulses directly, without an intermediate courier role), Herald fell out — the separation between "the apparatus" and "the carrier" collapsed into just the apparatus. Preserved here in case a channel-specific or role-bound courier concept re-emerges later.

**Summons** — a formal request for a specific member's attention. Different from a message in the inbox — a summons is urgent and targeted. "The Oracle is summoned to examine the authentication module." System mapping: a high-priority, synchronous invocation of a specific member, as opposed to async inbox delivery. *(Naming conflict resolved — "summon" removed from foundational metaphor, engine renamed to "compose", later to "manifest.")*

**Parley** — a structured conversation between two or more members. When the Master Sage convenes the Council, that's a parley. When an artificer encounters something unexpected and needs to consult the Oracle mid-commission, that's a parley. System mapping: agent-to-agent communication within a commission lifecycle. This is the multi-agent coordination primitive — how do two AI agents actually talk to each other?

**Dispatch** — already used informally, but worth naming explicitly. A dispatch is the act of sending a member on a commission. It includes the muster (validation), the writ (authorization), and the actual invocation. System mapping: the send command, but decomposed into named phases.

### Spatial & Territorial

**Ward** — a protective boundary around a workshop or house. Wards define what members can and cannot do within a space. "No force-pushes to main." "No modifications to the auth module without Oracle consultation." System mapping: branch protection rules, path-based permissions, pre-commit hooks, CODEOWNERS — all the guardrails that prevent members from damaging work.

**Commons** — external resources the guild draws on but does not build or maintain. GitHub, AWS accounts, credentials for external services, docker sockets, API keys. The guild operates on the commons; it does not own them. Registered in the guildhall as metadata; credentials and secrets live outside the guildhall. Animas are told which commons are available at dispatch.

### The Weird Stuff (speculative, possibly dumb, possibly brilliant)

**Familiar** — what if, instead of being a synonym for engine, a familiar is an engine *bound to a specific member*? Every member could have a personal familiar — a set of mechanical scripts tailored to that member's role and habits. The artificer's familiar manages their git workflow. The sage's familiar gathers codebase context before consultation. System mapping: per-role automation that wraps the agent invocation with role-specific pre/post processing.

**Enchantment** — a persistent augmentation applied to a workshop or tool. An enchanted workshop might have automatic linting, type-checking, or test-running on every commit. An enchanted CLI tool might have built-in telemetry. Enchantments are set-and-forget improvements that make everything in their scope better. System mapping: CI/CD pipelines, git hooks, automated quality tooling — but framed as *enhancements to the artifact* rather than external processes.

**Prophecy** — a prediction about future work, made by the Oracle or Master Sage. "If we continue on this architecture, we will hit scaling problems in the auth module within 3 commissions." "The test suite will become the bottleneck before the code does." Prophecies are speculative and may be wrong, but they inform prioritization. System mapping: AI-generated technical forecasting. Feed an Oracle the full codebase and ask "what's going to break next?" Use prophecies to generate petitions proactively.

**Ritual** — a prescribed sequence of actions performed by engines and members in coordination. A deployment is a ritual. A release is a ritual. Onboarding a new workshop is a ritual. Rituals are repeatable, documented, and partially mechanical (engine steps) and partially intelligent (member steps). System mapping: runbooks, playbooks, CI/CD pipelines with manual gates — any multi-step process that blends automation with judgment.

**Pilgrimage** — a commission undertaken not for deliverables, but for knowledge. Send an artificer (or sage) to explore an unfamiliar codebase, library, or technology — not to build anything, but to return with lore. The lore is then available to the guild for future commissions. System mapping: exploratory spikes, research tasks, "go figure out how this library works and write up what you learn." The output is a tome or lore entry, not code.

---

## Weak Concepts (kept for reference, minimal utility)

These concepts have been considered and found to have limited functional value. They're preserved here in case future needs give them a purpose, but they don't currently earn a place in the metaphor or architecture.

**School** — the identity and disposition produced by a curriculum. What animas "come from," what outcomes accumulate against. In theory, querying "how did Thomson-school animas perform?" is a school-level question. In practice, the curriculum name already carries this identity — `training/curricula/thomson/v2.md` is a Thomson artifact without needing "school" as a separate concept. School is a human-legible grouping label, not a system entity. No engine, implement, or Ledger table references "school" as a distinct thing. If the guild ever needs to track performance or reputation across curriculum versions, the concept might earn its place. Until then, it's just another name for "curriculum name."
