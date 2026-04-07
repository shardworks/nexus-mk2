# Observations

## Stacks / Books Tension

The brief says "Books excluded from KitEntry collection" but R4 requires `g.apparatuses()` to return only started apparatuses. Stacks calls `[...g.kits(), ...g.apparatuses()]` during its own start() (when no other apparatus has started yet) to discover book schemas from ALL plugins. Fixing R4 breaks Stacks unless books are included in KitEntry and Stacks is updated to use `ctx.kits('books')`.

D29 recommends including books in KitEntry. If the patron disagrees, the alternative is special-case plumbing (e.g., passing the full apparatus list to Stacks through a private channel), which adds complexity for no architectural benefit.

## Doc/Code Discrepancies

1. **`Guild.kits()` doc comment** (`guild.ts` line 68): Says "Snapshot of all loaded kits (including apparatus supportKits)." Code returns only standalone kits. The doc is aspirational — the brief explicitly preserves this behavior (`g.kits()` continues to return standalone kit plugins only). The doc comment should be corrected to match reality and the brief's intent.

2. **`Guild.apparatuses()` doc comment** (`guild.ts` line 72): Says "Snapshot of all started apparatuses." Code returns all topologically-sorted apparatuses regardless of start status. R4 fixes the code to match the doc — but the discrepancy reveals this was always intended behavior that was never implemented.

3. **docs/architecture/plugins.md** (lines 278-283): Documents the scan+subscribe pattern as the recommended approach for reactive consumption, including `ctx.on("plugin:initialized", (p) => registerRelays(p))`. This doc needs to be updated post-change to describe `ctx.kits(type)` as the primary mechanism and `apparatus:started` as the coordination event.

## Refactoring Opportunities (Deferred)

- **`collectStartupWarnings` expansion**: Currently only checks standalone kit contribution types against apparatus `consumes` tokens. With KitEntry available, this could be extended to also check supportKit contributions. Would catch cases where a supportKit contributes a type no apparatus consumes. Low priority — supportKits are authored by apparatus authors who know what they're doing.

- **Spider `blockTypes` Phase 1b gap**: Spider's current code scans `g.apparatuses()` in Phase 1b for `rigTemplates` but NOT for `blockTypes`. BlockTypes from apparatus supportKits that start before Spider are only caught via `plugin:initialized`. This gap is eliminated by the refactoring (ctx.kits('blockTypes') gets everything), but worth noting as a pre-existing inconsistency.

- **Instrumentarium latent gap**: Instrumentarium only registers apparatus supportKit tools via `plugin:initialized`. Apparatus supportKits from apparatuses that start BEFORE Instrumentarium are missed. In practice, no apparatus starts before Instrumentarium with tools in its supportKit (Instrumentarium has `requires: []`). This gap is eliminated by the refactoring.

- **Copilot uses `g.apparatuses()` and `g.failedPlugins()`**: `packages/plugins/copilot/src/index.test.ts` references `failedPlugins`. Copilot itself doesn't use the scan+subscribe pattern, so it's not affected by this change. But if copilot accesses `g.apparatuses()` at runtime for status display, its behavior changes slightly: it will now only see started apparatuses. This is the correct behavior.

## Kit Event Dead Code

The current `plugin:initialized` event fires for standalone kits before any apparatus starts (arbor.ts lines 183-185). No apparatus handler can ever receive these events because no `ctx.on()` has been registered yet. These kit event firings are dead code. D6 recommends removing them — `apparatus:started` will only fire for apparatuses, which is the only case where handlers exist.
