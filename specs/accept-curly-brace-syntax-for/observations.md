# Observations

## Future syntax collision risk

`docs/architecture/apparatus/spider.md` line 627 describes a planned future feature using `${draft.worktreePath}` to resolve upstream yield fields into givens. This brief introduces `${writ}` / `${spider.foo}` as aliases for the current bare-$ variables. Both use `${...}` delimiters but mean different things:

- **This brief:** `${writ}` is shorthand for `$writ` — same variable, cosmetic syntax alternative.
- **Future feature:** `${draft.worktreePath}` is a *new* interpolation mechanism accessing upstream engine yields by path.

Today these don't conflict (the future feature isn't implemented). But when the upstream-yield feature lands, the normalizer introduced here would try to strip braces from `${draft.worktreePath}` and turn it into `$draft.worktreePath`, which would then fail validation. The future feature will need to either (a) bypass the normalizer for dotted paths that don't match `$spider.*`, or (b) use a different delimiter entirely. Worth considering when that feature is scoped — no action needed now, but the decision should be recorded.

## Variable syntax not documented outside code

The `$writ` / `$role` / `$spider.*` variable system is not documented in any user-facing doc or guide — only in the JSDoc on `RigTemplateEngine.givens` and in test names. If rig templates become author-facing configuration, a dedicated "Template Variables" section in spider.md or a reference doc would be valuable.

## resolveGivens silently ignores unrecognized variables

If a `$`-prefixed value passes startup validation but doesn't match any branch in `resolveGivens` at runtime, it silently falls through — the key is omitted from the result with no error or warning. This can't happen today because `validateTemplates` rejects unknown patterns at startup, but if validation and resolution ever drift (e.g. a new variable added to validation but not resolution), the failure mode is silent data loss. A defensive `else` branch logging a warning in `resolveGivens` would be a low-cost safety net.
