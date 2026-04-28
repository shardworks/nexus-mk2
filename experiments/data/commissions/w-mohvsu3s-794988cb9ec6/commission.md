`docs/reference/core-api.md:28–34` documents two top-level helpers — `isFrameworkEvent(name): boolean` and `validateCustomEvent(home, name): void` — as if they live on `@shardworks/nexus-core`. A grep across `packages/framework/core/src/` finds no implementation of either function. The reserved-namespace prefix list in the docstring is the only reason these descriptions still need updates after C1.

If these helpers exist somewhere they need rewriting per S7; if they don't exist at all they should be deleted from the doc (Three Defaults #1: prefer removal to deprecation). Either way the C1 doc-update should resolve them rather than just touching their content.

**Files**: `docs/reference/core-api.md:28–34`, search for `isFrameworkEvent` and `validateCustomEvent` across `packages/`.
**Action**: Determine whether these helpers ship today; if not, delete them from core-api.md; if yes, rewrite for the merged-set model.