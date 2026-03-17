# Nexus Mk II

## Domain (Human-Owned — Do Not Modify)

Requirements and the typed ontology live in `/workspace/domain/` (mounted read-only from `shardworks/nexus-mk2-domain`).

- **Requirements:** `/workspace/domain/requirements/index.md` — What the system must do, must never violate, and how it must perform.
- **Ontology:** `/workspace/domain/ontology/index.ts` — Formal type definitions for every named domain concept. This is the system's interface contract.

These artifacts are owned by the project lead. Agents must not attempt to modify them. All contributions must conform to the types exported by the ontology. If you believe a domain change is needed, surface it to the human operator — do not make the change yourself.
