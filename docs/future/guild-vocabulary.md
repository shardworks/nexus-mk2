# Guild Vocabulary — Emerging Concepts

Latent vocabulary for the guild metaphor: concepts that are still cooking, not yet needed for bootstrap, or awaiting design decisions. Everything here is compatible with the foundational metaphor in `/workspace/nexus/docs/guild-metaphor.md` but hasn't been promoted to foundational status yet.

This document is a **tome** (in its own metaphor) — reference material to consult, not work-in-progress. When opening a new quest, scan this file for related terms and cross-link any matches in the quest's References section. That manual habit is the discovery mechanism: the vocabulary doesn't surface itself; Coco surfaces it by remembering to look.

**Active vocabulary bookmark quests** — terms with feature-shaped gaps that have earned their own parked-quest entries:

- **Coinmaster / Purse / Tithe** → cost tracking & token budget allocation (`w-mnszznt5-66d0ec7464bc`) — under umbrella `w-mo0e2m9q` *Unlocking autonomous operation*
- **Petition** → first-class internal commissions (`w-mnszzo8h-42137bda6681`) — under umbrella `w-mo0e2m9q` *Unlocking autonomous operation*
- **Vigil** → background monitoring of in-flight commissions (`w-mnszzon4-731bd9827d05`) — under umbrella `w-mo0e2m9q` *Unlocking autonomous operation*

Other terms in this tome remain latent — they live here until they earn a bookmark or get absorbed into an active inquiry.

## Roles (not yet foundational)

| Role | Function | Status |
|------|----------|--------|
| **Guildmaster** | Top-level decision maker. Interfaces with the patron on behalf of the guild. Determines priorities and allocates resources. | Clear concept, not needed until guild has enough activity to require coordination. |
| **Coinmaster** | Tracks AI token balances and expenditures. Provides cost visibility and may participate in resource allocation decisions (e.g., which petitions to grant). | Real need, not blocking anything yet. |
| **Oracle** | Answers questions about code and system design. Loosely defined — a consultative role invoked when agents need understanding of existing systems. | Useful but not in the critical path. |

## Work (not yet foundational)

### Petition

A commission originating from within the guild rather than from the patron. Petitions are requests to build or improve guild resources — paying tech debt, upgrading tooling, refactoring internal systems. The intent is that leadership evaluates petitions and decides which to grant, balancing cost against value. Petitions use the same commission infrastructure but are internally motivated.

## Communication

### Inbox

Each guild member has an inbox — a queue where messages are delivered for the member to act on. When a message arrives, it is passed to the member's agent in context, and the member does whatever their role dictates. Inboxes are the primary mechanism for asynchronous coordination between guild entities. (Format and mechanics TBD.)

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

**Vigil** — a period of watching and waiting. After a commission is dispatched, someone (or something) keeps vigil — monitoring progress, watching for failures, waiting for completion. System mapping: the background monitoring that checks commission status, detects failures, and triggers alerts. Currently a manual status check. An engine could keep vigil automatically.

**Rite of Naming** — the ceremony by which a new anima is called into being and given their identity. Not just "add to database" — the naming is when the spirit receives its name and seal, becoming a distinct presence in the guild. The rite could include an initial training session at the Academy (aspirant phase), a trial by craft, and formal induction to the roster as an active anima.

**Requiem** — the process of retiring an anima. Not dissolution — the anima's record persists in the register forever, their seals remain on their work, their lore is preserved. But the spirit passes to rest: `retired` state, no longer manifested. System mapping: a formal process that includes archiving the anima's current instructions and recording why they were retired.

### Communication & Coordination

**Herald** — a specialized engine (or role?) that announces events across the guild. Commission completed. New member inducted. Petition granted. House chartered. The herald doesn't decide anything — it broadcasts. System mapping: an event/notification system. Webhooks, log events, Slack notifications, whatever — the herald is the abstraction over "tell everyone something happened."

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
