# Cross-package coupling audit

## Intent

Build the package-level import graph for the framework monorepo. For each package in `packages/` (including `packages/plugins/*` and `packages/framework/*`), count inbound and outbound cross-package import edges (imports from `@shardworks/*` siblings). Produce a ranked markdown report at `docs/architecture/cross-package-coupling.md` that surfaces the over-coupled core — the packages most depended-upon and the packages with the most outbound dependencies. The report is a one-time snapshot intended to be regenerated periodically; it gives the patron a prioritized refactor backlog for boundary-tightening work.

## Motivation

Empirical cost analysis identified cross-package import count as the strongest single coupling cost driver for implement sessions (Pearson +0.85 vs cost). Each cross-package edge in a touched file represents the agent reading another package's interface during the change, paying its orientation overhead per boundary crossed. Reducing cross-package coupling — encapsulating leaky implementation, simplifying public API surfaces, narrowing inter-package contracts — is high-leverage but undirected without knowing where the coupling concentrates today. This audit produces the directed map.

## Non-negotiable decisions

- **Scope is `@shardworks/*` cross-package imports only.** Internal-package imports (relative paths, same-package barrel imports) and external imports (third-party npm packages, node built-ins) are out of scope. The signal is internal coupling, not total imports.
- **One output file: `docs/architecture/cross-package-coupling.md`.** Markdown, human-readable. Generated, but committed alongside the script that produced it so future regenerations are reproducible.
- **The report contains at minimum:** a per-package summary table (package name, inbound edges, outbound edges, total edge count), top-10 packages by inbound edges (over-imported-from — these are the universal substrate), top-10 by outbound edges (high-coupling consumers — these are the tangled clients), and the top edge weights (which `A → B` package pairs have the most distinct symbols crossing). "Inbound" means other packages import FROM this one; "outbound" means this package imports FROM others.
- **Counting unit is import lines, not symbols.** A line like `import { A, B, C } from '@shardworks/foo'` counts as one inbound edge to `foo` and one outbound edge from the importing package. Symbol counts can be a secondary column if useful but are not the primary ranking.
- **Include both source and test files.** Both contribute to the cost mechanism (the agent reads test files during implementation work). Use a combined count plus a separate breakdown of "edges only in tests" so test-induced coupling is visible.
- **Commit a regeneration script.** The report should be reproducible — a small TypeScript or shell script under `packages/framework/cli/src/` or `scripts/` (implementer's choice) that walks the imports and generates the markdown. Future Coco sessions will run this to refresh the snapshot.

## Behavioral cases the design depends on

- A package that nothing imports from has 0 inbound edges and shows up at the bottom of the inbound ranking — possibly a candidate for absorption or a leaf utility. Surface this.
- A package that imports from 8 different siblings shows up high in the outbound ranking — usually the "client of everything" pattern. Surface the specific sibling list.
- A package pair like `spider → clerk` likely has many edges (multiple files in spider importing different things from clerk). The report should aggregate and show this as a single weighted edge.
- Test files often have higher cross-package coupling than source files (we've measured this). The breakdown should surface where test coupling concentrates.

## Out of scope

- Recommending specific refactors. The report ranks packages; the patron decides what to refactor based on the data.
- Computing transitive coupling (A imports B, B imports C, therefore A's transitive dependency on C). Direct edges only.
- Modifying the import graph itself (no refactoring this commission).
- Running the analysis on transcripts, sessions, or any data outside the framework repo.
- Producing visualizations beyond what markdown tables can express. Pretty graphs are a future commission.

## References

- Source click: `c-moe1il6j` — cross-package imports as the strongest coupling cost driver.
- Methodology context: April 25 cost analysis identifying coupling as the cost mechanism.