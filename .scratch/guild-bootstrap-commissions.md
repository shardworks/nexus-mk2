# Guild System — Bootstrap Commission Breakdown

## Key Terms

- **Anima** — a named AI identity. The fundamental unit of identity in the system. Plural: animas.
- **Register** — the authoritative record of every anima that has ever existed.
- **Roster** — the active subset of the register (a filtered view, not a separate store).
- **States:** Aspirant (in training) → Active (on roster) → Retired (permanently stood down, record persists).
- **Standing** — active anima with indefinite tenure, summoned by name (e.g. Guildmaster, Oracle).
- **Commissioned** — active anima instantiated for a specific commission, tenure ends with the commission (e.g. most artificers).
- **Workshop** — a repository where the guild does its work. The repo the guild is bootstrapped in is implicitly a workshop.

---

## Commission Sequence

### C1: Guild Foundation — Register, Roster & Anima Management CLI

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

**Why first:** Everything else depends on knowing who the animas are and who's on the roster. Single commission because the register and roster are tightly coupled — the roster is a view of the register, not a separate store.

**Storage:** `~/.nexus/animas/` — single source of truth. Roster is a filtered view of animas in `active` state that have been assigned a role.

**Depends on:** Commission CLI (exists as quest CLI — rename pending or complete)

---

### C2: Sage Consultation Pipeline

**What:** Implement the sage consultation system, now roster-aware. When a commission is dispatched:
1. Check the roster for an active `master-sage`
2. If one exists, dispatch the sage consultation to that specific anima (using their instructions)
3. Sage produces sage advice, stored on the commission record
4. Artificer dispatch uses an active `artificer` from the roster, with sage advice injected and a directive to never contradict it

**Why second:** This is where the guild system starts *doing things*. C1 is data management; C2 is the first behavioral change — the system dispatches differently based on who's on the roster.

**Depends on:** C1, sage consultation pipeline draft (`commissions/draft/sage-trials.md`)

---

### C3: Guild-Aware Commission Dispatch (full integration)

**What:** Update commission posting and dispatch to be fully guild-aware:
- Commission posting associates a commission with a workshop (target repo)
- Dispatch musters the appropriate animas by role
- Commission records include seals (which anima performed each trial)
- Anima instructions (register-level + roster-level) are composed and injected at dispatch
- Commissioned animas are created/assigned automatically at dispatch time when needed

**Why third:** This is the integration commission — wiring together everything from C1-C2 into a cohesive dispatch pipeline. By this point all the pieces exist; this commission connects them.

**Depends on:** C2

---

## Deferred / Future Commissions

These are real but not part of the bootstrap:

- **Workshop management** — explicit workshop registration and configuration beyond the implicit bootstrap repo
- **Guild Houses** — organizational subunits grouping related workshops and animas
- **Academy system** — instructor role, training events, aspirant → active transition, provenance tracking
- **Coinmaster** — token tracking, purse allocation, cost reporting
- **Petition system** — guild-originated commissions with approval flow
- **Golem framework** — formalized infrastructure for inanimate servants (vigils, heralds, familiars)
- **Forgehouse** — self-referential guild house that builds guild tooling
- **Edicts & Decrees** — guild-wide and house-level policy management
- **Wards** — guardrails and protection rules on workshops

---

## Bootstrap Order Summary

```
C1: Guild Foundation     (register + roster — identity & membership)
 └→ C2: Sage Pipeline    (roster-aware commission dispatch)
     └→ C3: Full Integration (wire everything together)
```

C1 is pure data management — CRUD for animas and roster. Fast, mechanical, low-risk.
C2 is the first "wow" moment — the system behaves differently based on who's on the roster.
C3 adds seals, instruction composition, and automatic anima commissioning.
