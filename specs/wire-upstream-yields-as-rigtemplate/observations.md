# Observations

## Refactoring opportunities skipped

1. **Duplicated validation logic between `validateTemplates()` and `validateKitTemplate()`**. Both functions contain nearly identical R7 variable reference validation blocks (config: lines 303-319, kit: lines 605-619). This change adds a third recognized pattern to both. A shared `validateVariableRef()` helper would eliminate the duplication, but extracting it is out of scope for this brief. The two call sites differ in error handling (throw vs return string), but the pattern-matching logic is identical.

2. **`resolveGivens()` has a silent drop path**. If a `$`-prefixed string doesn't match `$writ` or `$vars.*`, the key is silently omitted from the result (line 191 comment: "Unrecognized $-prefixed strings are caught at validation time"). This is fragile — if validation is ever bypassed (e.g., programmatic rig construction), unrecognized variables vanish silently. A future commission could add a warning or explicit error for unrecognized refs at resolution time.

## Doc/code discrepancies

3. **spider.md is significantly stale**. The "Configuration" section describes `buildCommand`, `testCommand`, `role` as top-level spider config keys. The actual code uses a `variables` dict and `$vars.*` template syntax. The "Future Evolution" section mentions `${draft.worktreePath}` syntax which is different from what the brief proposes. This doc needs a comprehensive refresh but that's a separate commission.

4. **EngineInstance JSDoc vs EngineRunContext JSDoc**. The `EngineInstance.givensSpec` comment says "Literal givens values set at spawn time" while `EngineRunContext.upstream` says "Escape hatch for engines that need to inspect the full upstream chain." After this change, the "escape hatch" framing becomes less accurate — yield references in givens become a first-class alternative. The EngineRunContext comment is in the fabricator package and out of scope for this brief.

## Potential risks

5. **Kit-contributed engines with opaque yield shapes**. Startup validation can check engine_id reachability but cannot validate yield property names (the yield schema is not known at startup — it's runtime data). A typo in yield_name (`$yields.draft.paht` instead of `$yields.draft.path`) will silently omit the given at run time. This is the same behavior as `$vars.missingKey` but potentially more surprising since the engine_id part was validated. Future work could add optional yield schema declarations to EngineDesign for static checking.
