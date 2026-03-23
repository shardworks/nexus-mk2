# The Nexus Guild — Organization and Migration Plan

This document describes the specific organizational decisions and migration plan for Sean's guild, built on the Nexus framework. For the universal system architecture, see `guild-infrastructure-plan.md`.

---

## Organization

### Workshops

This guild separates its internal work into dedicated workshops:

| Workshop | Purpose | Produces |
|----------|---------|----------|
| **The Forge** | Builds guild-authored implements and machines | Published to HQ `stores/` |
| **The Academy** | Authors curricula and temperaments | Published to HQ `training/` |
| **Other workshops** | Patron-commissioned application work | Works delivered to the patron |

This is an organizational choice, not a framework requirement. Another guildmaster could hand-author all guild implements, curricula, and temperaments directly in HQ. This guild isolates the work into separate repos because:

- **Blast radius** — an artificer building an implement can't damage training materials, and vice versa
- **Swappability** — if the academy's approach isn't working, it can be replaced wholesale
- **Clarity** — commissioning "build this implement" targeting the forge is cleaner than commissioning work in HQ itself

### Topology

```
NEXUS_HOME/
  hq/                     ← bare clone
  forge/                  ← bare clone (the forge workshop)
  academy/                ← bare clone (the academy workshop)
  my-app/                 ← bare clone (a patron project)
  nexus.db                ← Ledger
  worktrees/
    hq/
      main/               ← standing worktree, always present
    forge/
      commission-42/
    academy/
      commission-15/
    my-app/
      commission-17/
```

### Architectural Decisions

**Implements are CLI tools.** All implements are single-file JS bundles invokable from the command line. If the guild needs non-CLI implements in the future, the concept can be expanded. For now, one form factor.

**Testing is a forge concern.** The forge establishes and enforces its own testing standards. The patron does not prescribe a testing bar — the forge earns trust through the quality of what it delivers.

**Workshop creation is manual.** Leadership creates repos, sets up initial structure, and registers workshops in `guild.json` by hand. An administrative implement for this may be built later.

---

## The Relic

The current `nx` CLI is this guild's first relic. It was bootstrapped through 14 commissions — an agent finding its own trail. It handles commissions, the anima register, the roster, and basic config. It works.

But its architecture was not prescribed by the patron, its internals are not fully understood from the sanctum, and it will not be evolved further. It is load-bearing and sacred — the guild depends on it while the Nexus framework and guild-authored implements replace its functions.

The relic stores data in `~/.nexus/` as flat JSON files. The new system uses the Ledger (SQLite) and HQ flat files.

---

## Migration Sequence

1. **Build the Nexus framework** — Implement the Nexus CLI with `init`, `install`, `repair`. Build the base implements and machines (summon, dispatch, publish, promote, instantiate, worktree-setup, ledger-migrate). Write the initial Ledger schema.
2. **`nexus init`** — Bootstrap this guild. Creates HQ, Ledger, installs base tools.
3. **Populate HQ** — Extract the codex from existing anima instructions and teachings. Author initial curricula and temperaments. Configure `guild.json`.
4. **Create the forge and academy** — Set up workshop repositories, register in `guild.json`.
5. **Parallel operation** — New framework and guild implements come online alongside the relic. The relic continues to handle anything not yet replaced.
6. **Relic retirement** — When all functions are replaced, the relic is archived.

Migration of data from relic (`~/.nexus/` flat JSON) to new topology: manual one-time process by patron.

---

## Open Questions

- **Machine authorship governance** — Machines start hand-authored in HQ. Could the forge build machines too? What triggers that transition?
