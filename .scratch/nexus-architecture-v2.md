# Nexus Architecture — v2 (Post-MVP)

Concepts and features that are part of the architecture's future but not needed for the MVP. These are planned, not speculative — they have defined shapes and known integration points. They'll be built once the foundation proves itself.

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

Individual directives from leadership that apply across the guild. An edict doesn't produce deliverables — it changes *how the guild operates*. "All artificers must write tests." "No commission may exceed 500k tokens."

Edicts may amend the codex or stand alone. They are tracked in the Ledger with full lifecycle history (issued, active, superseded, revoked). At dispatch, active edicts are injected into the anima's instruction environment alongside the codex.

**Integration points:**
- Ledger: edict records and lifecycle state
- Manifest engine: active edicts injected into system prompt
- Codex: edicts may reference or amend codex content

---

## Oaths

Identity-level binding commitments, per-anima. "I will never modify files outside my commission scope." "I will always run tests before sealing my work." The codex is institutional; oaths are personal.

Oaths are stored in the Ledger as part of an anima's composition. They are assigned at instantiation and injected into the system prompt at manifest time. Oaths are what make two animas from the same school distinct — same curriculum, same temperament, different commitments.

**Integration points:**
- Ledger: stored per-anima in composition record
- Manifest engine: injected into system prompt
- Anima composition: one of the three composition components (curriculum + temperament + oaths)

---
