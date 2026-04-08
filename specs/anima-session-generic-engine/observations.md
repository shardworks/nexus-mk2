# Observations — anima-session-generic-engine

## Suboptimal conventions followed for consistency

1. **No givens validation in existing engines.** The implement, revise, and review engines all cast givens without validation (`givens.writ as WritDoc`, `givens.role as string`). D5 recommends adding validation to anima-session because it's a generic reusable engine where misconfiguration is more likely, but ideally the existing engines would also validate. This is intentional inconsistency — the generic engine needs guardrails the purpose-built ones don't.

2. **ReviseYields type is already inaccurate.** `ReviseYields = { sessionId, sessionStatus }` but the actual runtime shape from the generic default collect includes `output` when present. Adding `conversationId` to the generic default (S2) makes the type even more stale. A future commission should either remove the type (since the yields are really just "generic default yields") or update it to match reality.

## Refactoring opportunities skipped to keep scope narrow

3. **Hardcoded builtinEngineIds appear in three places.** The set of Spider-builtin engine IDs is enumerated in: (a) `validateTemplates` as a `Set`, (b) `buildDesignSourceMap` as an array, (c) the `supportKit.engines` dict itself. These could be derived from a single source (e.g. the engines dict keys or a shared constant), eliminating the need to update multiple sites when adding a new engine. Skipped because it's a pure refactor orthogonal to the feature.

4. **resolveGivens and the late-resolution step (S3) share similar patterns.** Both iterate givens, detect `$`-prefixed strings, and resolve or pass through. If S3 is implemented, there's an opportunity to unify spawn-time and run-time resolution into a single resolver with a context object. Skipped because the two phases run at different lifecycle points with different available data.

5. **Validation duplication between validateTemplates and validateKitTemplate.** Both functions have nearly identical variable-reference validation logic. A shared `isValidVarRef(normalized: string)` helper would eliminate the duplication and ensure new patterns (like `$yields.*`) are added in one place. Not in scope but would prevent the kind of maintenance burden S3 introduces.

## Doc/code discrepancies

6. **`docs/guides/building-engines.md` describes a different engine concept.** The guide covers Clockworks relay engines (the `engine()` factory, `nexus-engine.json` descriptors, standing-order wiring). The Spider's `EngineDesign` interface — the type anima-session implements — is a completely separate concept with no guide. Template authors referencing `anima-session` as a `designId` have no documentation on what givens it accepts or how to use it.

7. **`docs/architecture/apparatus/spider.md` MVP note is stale.** The spec header says "MVP scope: static rig graph, every commission gets the same five-engine pipeline." Template-based rigs, block types, and input requests have all been implemented since. The doc is significantly behind the code.

8. **ReviseYields missing `output` field.** As noted in the inventory: `ReviseYields` in types.ts has `{ sessionId, sessionStatus }` but the generic default collect actually includes `output` when the session has it. The TypeScript type does not match the runtime shape.

## Potential risks

9. **S2 is additive but touches a hot path.** The generic default collect in `tryCollect` runs for every quick engine that lacks a custom collect. Adding `conversationId` to the spread is functionally a no-op for sessions that don't set it (the field is omitted), but any change to `tryCollect` warrants careful test validation since it affects all rigs.

10. **S3 validation in D22 checks engineId existence but not upstream reachability.** A template could declare `$yields.foo.bar` where `foo` is a valid engine in the template but NOT in the referencing engine's upstream chain. At runtime, `foo`'s yields might not be in the upstream map if it's not a transitive dependency. The resolution would silently omit the key (D19). This is a subtle misconfiguration that won't fail loudly. Transitive-upstream checking would catch it at validation time, but adds complexity. Worth revisiting if misconfigurations become common.
