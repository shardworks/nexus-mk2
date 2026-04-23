The brief explicitly refers to `guild-vocabulary.md` as the canonical home for introducing new vocabulary (Lattice, Reckoner, Pulse). The file does not exist anywhere in the tree; `docs/architecture/apparatus/ratchet.md` points at `docs/future/guild-vocabulary.md` which is also absent. Either:

- Create `docs/future/guild-vocabulary.md` and seed it with Lattice, Reckoner, Pulse, Ratchet (picking up the outstanding reference).
- Decide the canonical location is somewhere else (e.g. `docs/guild-metaphor.md` supplementary sections) and retire the missing-reference in `ratchet.md`.

Blocker-level for coherence: multiple specs now refer to a doc that does not exist. Fix the doc gap once, permanently.