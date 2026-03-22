# Guild System — Bootstrap Quest Breakdown

## Key Terms

- **Anima** — a named AI identity with a seal. The fundamental unit of identity in the system. Plural: animas.
- **Register** — the authoritative record of every anima that has ever existed.
- **Roster** — the active subset of the register (a filtered view, not a separate store).
- **States:** Aspirant (in training) → Active (on roster) → Retired (permanently stood down, record persists).
- **Standing** — active anima with indefinite tenure, summoned by name (e.g. Guildmaster, Oracle).
- **Commissioned** — active anima instantiated for a specific quest, tenure ends with the quest (e.g. most heroes).

---

## Quest Sequence

### Q1: Guild Foundation — Register, Roster & Anima Management CLI

**What:** Add subcommands to the Nexus CLI for managing animas, the register, and the roster. This is the identity and membership foundation for the entire guild system.

**`nexus anima` commands (register management):**
- `nexus anima create <name>` — create a new anima in the register. Starts as `aspirant`. Assigns a seal automatically. Every anima gets a poetic name — no anonymous instances.
- `nexus anima list` — list all animas in the register, filterable by state
- `nexus anima inspect <name>` — full register entry (name, seal, state, instructions, skills, provenance history)
- `nexus anima update <name>` — update instructions, skills
- `nexus anima retire <name>` — transition to `retired` state (record and seals persist forever)
- `nexus anima history <name>` — show provenance trail (training events, instruction changes, roster memberships)

**`nexus roster` commands (active membership):**
- `nexus roster add <anima-name> --role <role>` — add an anima to the roster as active, with a role. Optionally `--standing` or `--commissioned` (default: standing).
- `nexus roster list` — list all active animas, filterable by role, standing/commissioned
- `nexus roster inspect <name>` — full roster view (role, standing/commissioned, member-level instructions)
- `nexus roster update <name>` — change role, standing/commissioned status, member-level instructions
- `nexus roster remove <name>` — remove from roster (anima remains in register, state unchanged)

**Why first:** Everything else depends on knowing who the animas are and who's on the roster. Single quest because the register and roster are tightly coupled — the roster is a view of the register, not a separate store.

**Storage:** `~/.nexus/animas/` — single source of truth. Roster is a filtered view of animas in `active` state that have been assigned a role.

**Depends on:** Quest CLI (exists)

---

### Q2: Sage Consultation Pipeline

**What:** Implement the sage trial system, now roster-aware. When `nexus q send` is invoked:
1. Check the roster for an active `master-sage`
2. If one exists, dispatch the sage trial to that specific anima (using their instructions)
3. Sage produces `sageAdvice`, stored on the quest record
4. Hero trial dispatches to an active `hero` from the roster, with sage advice injected and a directive to never contradict it

**Why second:** This is where the guild system starts *doing things*. Q1 is data management; Q2 is the first behavioral change — the system dispatches differently based on who's on the roster.

**Depends on:** Q1, sage-trials draft

---

### Q3: Guild Houses

**What:** Add house management — creating organizational subunits, assigning storehouses (repos), and linking animas to houses.

**Commands:**
- `nexus house create <name>` — create a new guild house with a charter
- `nexus house list` — list all houses
- `nexus house inspect <name>` — full house record (charter, storehouses, members)
- `nexus house add-store <house> <repo-url>` — link a storehouse (git repo) to a house
- `nexus house assign <house> <anima-name>` — assign a roster anima to a house

**Why third:** Houses add organizational structure but aren't load-bearing for the core quest flow. Q1-Q2 give you a working guild with animas, roster, and sage-advised quests. Houses layer on top.

**Depends on:** Q1

---

### Q4: Guild-Aware Quest Dispatch (full integration)

**What:** Update quest posting and dispatch to be fully guild-aware:
- `nexus q post` associates a quest with a house/storehouse
- `nexus q send` musters the appropriate animas by role
- Quest records include seals (which anima performed each trial)
- Anima instructions (register-level + roster-level + house-level) are composed and injected at dispatch
- Commissioned animas are created/assigned automatically at dispatch time when needed

**Why fourth:** This is the integration quest — wiring together everything from Q1-Q3 into a cohesive dispatch pipeline. By this point all the pieces exist; this quest connects them.

**Depends on:** Q2, Q3

---

## Deferred / Future Quests

These are real but not part of the bootstrap:

- **Academy system** — instructor role, training events, aspirant → active transition, provenance tracking
- **Coinmaster** — token tracking, purse allocation, cost reporting
- **Petition system** — house-originated quests with approval flow
- **Golem framework** — formalized infrastructure for inanimate servants (vigils, heralds, familiars)
- **Forgehouse** — self-referential house that builds guild tooling
- **Edicts & Decrees** — guild-wide and house-level policy management
- **Wards** — guardrails and protection rules on storehouses

---

## Bootstrap Order Summary

```
Q1: Guild Foundation  (register + roster — identity & membership)
 └→ Q2: Sage Pipeline  (roster-aware quest dispatch)
 └→ Q3: Guild Houses   (organizational structure)
     └→ Q4: Full Integration (wire everything together)
```

Q1 is pure data management — CRUD for animas and roster. Fast, mechanical, low-risk.
Q2 is the first "wow" moment — the system behaves differently based on who's on the roster.
Q3-Q4 add structure and complete the picture.
