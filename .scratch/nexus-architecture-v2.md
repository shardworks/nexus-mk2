# Nexus Architecture — v2 (Post-MVP)

Concepts and features that are part of the architecture's future but not needed for the MVP. These are planned, not speculative — they have defined shapes and known integration points. They'll be built once the foundation proves itself.

---

## Standing vs. Commissioned Animas

The meaningful distinction among active animas is not named vs. unnamed (all animas are named) but **standing** vs. **commissioned**:

- **Standing** — available indefinitely, called on by name. A standing anima persists on the roster across commissions. They are always there, always available.
- **Commissioned** — instantiated for a specific commission. A commissioned anima's roster membership lasts only as long as the commission it was created for. A fresh anima is created (or an existing one is commissioned) for each commission, and their tenure ends when the commission completes.

Concretely, standing and commissioned animas are the same thing: entries in the register with names, instructions, and history. The difference is tenure, not nature.

**Status:** Not currently implemented. All animas are currently treated as standing members. The commissioned tenure model is anticipated once multi-commission parallelism and per-commission anima instantiation are built out.

---

## Escapement

The apparatus that runs what the Walker sets in motion. Currently mentioned in the metaphor doc only as a footnote distinguishing it from the Walker: *"The Walker sets engines in motion; the Escapement runs them."* The Walker is architectural — it decides what runs and when. The Escapement is operational — it executes, manages concurrency, enforces limits, handles retries.

In horology, the escapement controls the release of energy from the mainspring to the gear train — a regulating mechanism that lets power through in controlled pulses. The system mapping is natural: the Escapement governs how work is actually executed, preventing the system from releasing all energy at once.

**Open questions:**
- Does the Escapement warrant a full apparatus entry, or is it best understood as the execution layer within the Walker's purview?
- What concurrency model does it enforce? Per-guild limits? Per-codex limits?
- How does it interact with the circuit breaker on standing orders (`maxSessions`)?

---

## Complication

In horology, a complication is any function beyond basic timekeeping — a chronograph, moon phase, perpetual calendar. Complications add capability to a mechanism without changing its fundamental character.

In the guild, this could map to: optional capabilities that extend what a rig or commission can do without being part of every commission. A complication might be "publish release notes to Slack after sealing" or "notify stakeholders when a deployment completes." Guild-optional, additive, composable.

**Possible system mapping:**
- Kit-contributed engine chains that attach to standard rig phases as optional post-steps
- Commission-level flags that activate additional engine sequences
- Standing orders that fire on commission events and add capability (e.g., `commission.sealed → notify-engine`)

The term has strong resonance with the clockwork register. Worth developing once kit architecture matures.

---

## Impulse

In horology, the impulse is the push of energy from the escapement to the balance wheel — the moment energy transfers. Between impulses, the balance swings freely; the escapement only acts to keep it going.

In the guild, this could map to: the event signal that triggers a standing order — the discrete push of energy that sets something in motion. An event fires, an impulse is delivered, an engine runs. The Clockworks processes impulses.

Alternatively: the trigger/payload delivered to an anima at session start — the specific, bounded push of context that sets their work in motion.

**Status:** Two viable mappings, neither fully developed. Revisit when standing order mechanics are being refined.

---

## Charge Type

The vocabulary for categorizing commissions by their terminal goal. Currently lives only in the origination-engine scratch doc; not yet formalized in the metaphor doc.

A charge type describes what a commission is ultimately trying to accomplish — the kind of obligation, not the content of the work. Examples: `deploy` (ship to an environment), `publish` (release an artifact to a registry), `merge-only` (seal a draft binding to main without deploying), `test-only` (run the suite and report).

Charge types are declared by the guild, surveyed per codex (the Surveyor determines which are applicable), and surfaced to the patron as a hint interface when posting a commission. Patrons can specify a charge type or leave it for the origination engine to infer.

**Integration points:**
- Surveyor: records which charge types are applicable per codex and how to fulfill them
- Origination engine: consults charge type to select fulfillment path
- Commission interface: dropdown populated from survey results above confidence threshold

**Open question:** Is "charge type" the right name for this concept, or does it need a more evocative guild-register term? The word *charge* has energy and intentionality — "I charge you with this task" — which fits. But "charge type" as a compound is functional, not evocative. Revisit when the commission interface vocabulary is being designed.

---

## Commons

External resources the guild draws on but does not build or maintain. GitHub, AWS accounts, credentials for external services, docker sockets, API keys. The guild operates on the commons; it does not own them.

Registered in the guildhall as metadata (a `commons.json` or similar registry). Credentials and secrets live *outside* the guildhall — the registry points to them, doesn't contain them. At dispatch, animas are told which commons are available and how to access them.

**Integration points:**
- Guildhall: commons registry (metadata only, no secrets)
- Compose engine: injects available commons into anima's environment
- Codex: may contain policies about commons usage ("always use the staging AWS account for commissions")

**Open questions:**
- What does the registry format look like? Name + type + credential reference?
- How are credentials actually passed to anima sessions? Environment variables? Mounted files?
- Does the engine validate that required commons are accessible before composing?

---

## Publication Tiers

Artifacts published to the guildhall (implements, curricula, temperaments) move through status tiers that gate how the system uses them:

| Status | Meaning | Who can set it |
|--------|---------|---------------|
| **Experimental** | Published to the guildhall, available for explicit assignment but not the default. | Anyone with `publish` access |
| **Active** | Proven, available as a default option. | Guild leadership only (via `promote`) |
| **Retired** | No longer used for new work. | Guild leadership |

The `promote` implement handles status changes (experimental → active), updating `guild.json`. Promotion is a policy decision, not a file operation.

**Integration points:**
- guild.json: status tracked per artifact
- Compose engine: default resolution considers status (experimental artifacts require explicit assignment)
- `promote` implement: base framework implement for status changes

---

## Edicts

A directive from leadership that applies across the guild. An edict doesn't produce deliverables — it changes *how the guild operates*. "All animas must write tests." "No commission may exceed 500k tokens." Edicts are tracked with full lifecycle (issued, active, superseded, revoked) and injected into anima instructions at manifest time alongside the charter. The distinction: the charter is standing policy; an edict is a temporal directive with a lifecycle.

**Integration points:**
- Ledger: edict records and lifecycle state
- Manifest engine: active edicts injected into system prompt alongside charter
- Charter: edicts may reference or amend charter content

---

## Oaths

A binding commitment made by a specific anima — identity-level, not institutional. "I will never modify files outside my commission scope." "I will always run tests before sealing my work." The charter is the guild's policy; an oath is personal. Oaths are part of an anima's composition alongside curriculum and temperament — they are what make two animas from the same curriculum distinct. Assigned at instantiation, immutable after creation.

**Integration points:**
- Ledger: stored per-anima in composition record
- Manifest engine: injected into system prompt
- Anima composition: one of the three composition components (curriculum + temperament + oaths)

---
