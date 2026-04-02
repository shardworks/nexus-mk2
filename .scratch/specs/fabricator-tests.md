# Add Tests for Fabricator Apparatus

Add tests for the `@shardworks/fabricator-apparatus` package (`packages/plugins/fabricator/`).

## Scope

Test the public API: `EngineRegistry` registration and `FabricatorApi.getEngineDesign()` lookup. The package is a thin in-memory registry — tests should be straightforward.

## Guidelines

- Place tests at `packages/plugins/fabricator/src/fabricator.test.ts` — follow the sibling convention (e.g. `instrumentarium.test.ts`, `clerk.test.ts`).
- Use `node:test` and `node:assert` — same as the rest of the codebase.
- Test the factory and API surface, not internal class methods.
- Cover at minimum: registering engine designs from kits, looking up by ID, looking up a missing ID (returns undefined), handling of invalid/malformed contributions (should skip silently).
- All existing tests must continue to pass.
