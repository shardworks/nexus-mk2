The in-package README at `packages/framework/core/README.md` (170 lines) is fresh and accurate — it already documents today's nexus-core surface with the structure the current doc-hygiene sweep is rewriting `docs/reference/core-api.md` to mirror.

This pattern (in-package README owns the API reference; `docs/reference/...` either mirrors or links) deserves a guild-level convention. Two options worth raising:

1. Establish a convention that `docs/reference/<package>.md` is a thin pointer to `packages/<framework|plugin>/<name>/README.md`, with the README owning the surface. Every reference doc shrinks to a few paragraphs of context plus a link.
2. Establish the inverse: `docs/reference/<package>.md` is canonical, README is a stub. Gives docs/ a coherent reading order at the cost of duplicate-write effort.

Either convention is better than the current accidental drift between the two surfaces. Worth raising before another reference doc reaches the same level of staleness.