# Stacks Package — Doc/Code Alignment Cleanup

## Intent

Bring the stacks package's documentation and source comments into alignment with the implemented code. Fix one dead-code asymmetry in the CDC registry, correct a stale JSDoc comment, update `specification.md` to reflect five doc/code discrepancies, and fix two inaccuracies in the conformance test spec.

## Rationale

The stacks specification drifted from implementation as design decisions were made during coding — query types lost their generics, the backend interface went synchronous, and a promised configurability feature was deferred. Left uncorrected, these discrepancies mislead anyone reading the spec to understand the system or writing a new backend. This cleanup removes that drift before it compounds.

## Scope & Blast Radius

This change is entirely internal to `packages/plugins/stacks/`. No consumer APIs or exports are modified — the six downstream plugins (`claude-code`, `astrolabe`, `parlour`, `spider`, `ratchet`, `animator`, `clerk`) are unaffected.

**Affected files:**
- `src/cdc.ts` — source change (refactor `firePhase2()` to delegate to `getPhase2Handlers()`, update `lock()` JSDoc)
- `docs/specification.md` — documentation updates (§5 query generics, §6.3 configurability claim, §8 backend signatures, §8 `count()` signature, §10 removal)
- `docs/specification-conformance-tests.md` — documentation updates (path fix, planned-test annotation)

No migrations, no renames, no interface changes. No cross-package blast radius.

## Decisions

| # | Decision | Selected | Rationale |
|---|----------|----------|-----------|
| D1 | How to handle `CdcRegistry.getPhase2Handlers()` dead code | Keep it and refactor `firePhase2()` to use it, restoring symmetry with `firePhase1()`/`getPhase1Handlers()` | The method already exists and is correct; the fix is making `firePhase2()` delegate to it like `firePhase1()` does |
| D2 | What should the corrected `lock()` JSDoc say | "Seal the CDC registry — called by the Stacks core when arbor fires phase:started, after all apparatus start() methods complete." | Matches the accurate language already used in the `watch()` JSDoc and `sealCdc()` docstring |
| D3 | Generic type parameter discrepancy in §5 query types | Drop `<T>` from `WhereCondition`, `WhereClause`, `BookQuery` type signatures in the spec | The spec's own prose (§5.1) explains why generics were dropped; the signatures are stale |
| D4 | Async/sync signature discrepancy in §8 backend interface | Keep `Promise` signatures as the "general contract" but add a note explaining the current implementation is synchronous for better-sqlite3 | Patron directive — preserve async as the general contract with an explanatory note |
| D5 | `count()` signature discrepancy in §8 | Update spec to show `count(ref: BookRef, query: CountQuery): number` with the `CountQuery` type definition | Spec should show the actual interface shape; `CountQuery` exists for consistency with `InternalQuery` pattern |
| D6 | `maxCascadeDepth` configurability claim in §6.3 | Remove the configurability claim; state it's a hardcoded constant (16) and note that making it configurable is deferred | This is a cleanup brief, not feature work; the spec should reflect what exists |
| D7 | §10 "Relationship to Existing Code" section | Delete entirely | It served its purpose during planning; the migration is complete and git history preserves the context |
| D8 | Path discrepancy in conformance test spec implementation notes | Update the path to `packages/plugins/stacks/src/conformance/` | Simple path correction |
| D9 | Reference to non-existent `conformance.sqlite.test.ts` | Keep the reference but add a "(not yet implemented)" annotation | The conformance suite is designed for multi-backend use; the SQLite test is a natural next step |

## Acceptance Signal

1. **Typecheck passes** — `pnpm -w typecheck` completes with no errors. The `firePhase2()` refactor must preserve the existing type contract.
2. **All stacks tests pass** — `pnpm --filter @shardworks/stacks-apparatus test` runs the full conformance suite green. The `firePhase2()` behavioral change must be invisible to consumers.
3. **No residual stale references in specification.md** — `<T>` does not appear in query type signatures (§5); §6.3 does not claim configurability; §8 `count()` matches the `CountQuery` pattern; §8 backend signatures include the sync/async explanatory note; §10 is gone.
4. **Conformance test spec paths are correct** — `grep -n "packages/stacks/src" docs/specification-conformance-tests.md` returns no matches (all paths should use `packages/plugins/stacks/src`).
5. **`lock()` JSDoc is updated** — the stale "called on first write" text no longer appears in `src/cdc.ts`.

## Existing Patterns

- **`firePhase1()` / `getPhase1Handlers()` pattern in `src/cdc.ts`** (lines 172–196) — this is the exact pattern `firePhase2()` should follow after the D1 refactor. `firePhase1()` delegates to `getPhase1Handlers()` for filtering, then iterates.
- **`watch()` JSDoc in `src/cdc.ts`** (line 134 area) — uses the correct "phase:started" language that `lock()` should adopt per D2.
- **`InternalQuery` / `CountQuery` types in `src/backend.ts`** — the wrapper-object pattern that `count()` follows, relevant for D5's spec update.

## What NOT To Do

- **Do not change any exported types or public API surface.** This is documentation and internal cleanup only.
- **Do not implement `maxCascadeDepth` configurability.** D6 explicitly defers this — just remove the claim from the spec.
- **Do not create `conformance.sqlite.test.ts`.** D9 only annotates the existing reference; creating the test file is future work.
- **Do not rewrite or restructure the specification beyond the identified discrepancies.** The spec's structure and prose are sound; only the specific items covered by D3–D7 need updating.
- **Do not touch any files outside `packages/plugins/stacks/`.** There is no cross-package blast radius.