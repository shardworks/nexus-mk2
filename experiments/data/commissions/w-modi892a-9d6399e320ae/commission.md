The monorepo has two incompatible collision policies for kit-contributed registries:

- **Fabricator (engines):** throws at registration on duplicate id (`packages/plugins/fabricator/src/fabricator.ts` lines 288-296).
- **Lattice (channel factories):** warns + skips on duplicate type (`packages/plugins/lattice/src/lattice.ts` lines 222-228).

Task 2 picks Lattice for relays. There is no written principle explaining when to throw vs. when to warn. For a guild operator debugging a duplicate, the inconsistency is surprising: one apparatus fails to start, the other logs and keeps running. An ADR or a documented principle (e.g. "throw when downstream dispatch is impossible without disambiguation; warn when first-writer-wins is a defensible default") would help. Could be scoped as a single follow-up commission that (a) writes the principle, and (b) reconsiders fabricator's throw vs. warn choice against it.